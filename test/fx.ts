// Test harness for the formation layer: a world on the formation field with the Napoleonic ruleset,
// driven only through commands, with helpers to read where the men stand. Tests may use Math.*.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSimData, compileRuleset, buildTerrain, rebuildImpassable, makeWorld, issue, advanceTick, makeHandle, KIND_FORMATION, formationSlot,
  placesCtx, placeAt, mkPlaces, occupied, placeWorld, wetBins, layoutOf, STATUS, menOf, cellK, slotIndex, type Command, type World, type Compiled,
  type Ruleset, type Terrain, type SimData, type Dropped, TICK_HZ, M_TICK } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const dataBytes = (): Uint8Array => new Uint8Array(fs.readFileSync(path.join(root, 'data', 'formation-field.simdata')))
export const GOLDEN_DATA_VERSION = 0x6ae782ed
export const data: SimData = loadSimData(dataBytes(), GOLDEN_DATA_VERSION)
export const cr: Compiled = compileRuleset(napoleonic)
const baseTerrain: Terrain = buildTerrain(data, cr)

// the formation field's stream (prototypes/formation-core.js), for placing tests
export const STREAM_X = (z: number): number => 70 + 6 * Math.sin(z * 0.03)
export const DEG = Math.PI / 180

export class Sim {
  w: World
  dropped: Dropped[] = []
  private ctx
  constructor(seed = 1, ruleset?: Ruleset, terrain?: Terrain) {
    const c = ruleset ? compileRuleset(ruleset) : cr
    this.w = makeWorld(data, c, seed, true, terrain ?? (ruleset ? undefined : baseTerrain))
    this.ctx = mkPlaces(this.w)
  }
  get t(): number { return this.w.meta[M_TICK] / TICK_HZ }
  cmd(c: Command): void { issue(this.w, c) }
  // issues a command and runs the tick that applies it
  order(c: Command): void { issue(this.w, c); this.tick() }
  // spawns a battalion and returns its handle (applied on the next tick)
  spawn(x: number, z: number, heading: number, shape = 'line', men = 100, side = 0): number {
    const slot = this.w.free[this.w.meta[1] - 1]
    this.cmd({ type: 'debug-spawn', side, x, z, heading, shape, men }); this.tick()
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  tick(): void { const r = advanceTick(this.w); this.dropped.push(...r.dropped) }
  advance(sec: number): void { for (let n = Math.round(sec * TICK_HZ); n > 0; n--) this.tick() }
  // advances while `pred` holds, up to `sec`; returns the seconds spent
  until(pred: () => boolean, sec: number): number { let n = 0; while (pred() && n < sec * TICK_HZ) { this.tick(); n++ } return n / TICK_HZ }
  slot(h: number): number { return formationSlot(this.w, h) }
  status(h: number): string { const i = this.slot(h); return i < 0 ? 'gone' : STATUS[this.w.f.status[i]] }
  orders(h: number): number { const i = this.slot(h); let n = 0; for (let o = this.w.f.ordHead[i]; o >= 0; o = this.w.ord.next[o]) n++; return n }
  busy(h: number): boolean { const i = this.slot(h); return this.orders(h) > 0 || this.w.f.trans[i] === 1 }
  shape(h: number): string { const i = this.slot(h), f = this.w.f; return f.trans[i] ? `${this.w.cr.shapes[f.shape[i]].name} → ${this.w.cr.shapes[f.tShape[i]].name}` : this.w.cr.shapes[f.shape[i]].name }
  x(h: number): number { return this.w.f.x[this.slot(h)] }
  z(h: number): number { return this.w.f.z[this.slot(h)] }
  heading(h: number): number { return this.w.f.heading[this.slot(h)] }
  lags(h: number): number[] { const i = this.slot(h), NB = this.w.cr.NB; return [...this.w.f.lags.slice(i * NB, i * NB + NB)].filter((_, j) => this.w.f.binN[i * NB + j]) }
  // every filled slot's place: [x, z, company, slot index]
  places(h: number): [number, number, number, number][] {
    const w = this.w, i = this.slot(h), g = w.cr.geo, out: [number, number, number, number][] = [], p = [0, 0, 0]
    placesCtx(this.ctx, i, w.f.x[i], w.f.z[i], w.f.heading[i], w.meta[M_TICK] / TICK_HZ, 0)
    for (let c = 0; c < g.companies; c++) for (let r = 0; r < g.ranks; r++) for (let f = 0; f < g.files; f++) {
      if (!occupied(w, i, c, r, f)) continue
      if (w.f.trans[i]) {   // during a change: company frames
        const q = placeWorld(w, i, c, w.f.x[i], w.f.z[i], w.f.heading[i], this.t, 0, { x: 0, z: 0, a: 0, face: 0 }), lx = (f - (g.files - 1) / 2) * g.fileSpacing, lz = -r * g.rankSpacing
        out.push([q.x + lx * Math.cos(q.a) - lz * Math.sin(q.a), q.z + lx * Math.sin(q.a) + lz * Math.cos(q.a), c, slotIndex(g, c, r, f)])
      } else { placeAt(this.ctx, c, r, f, p); out.push([p[0], p[1], c, slotIndex(g, c, r, f)]) }
    }
    return out
  }
  deep(x: number, z: number): boolean { return this.w.terrain.depth[cellK(this.w.terrain, x, z)] > this.w.cr.rs.water.limit }
  placesInDeep(h: number): number { return this.places(h).filter(p => this.deep(p[0], p[1])).length }
  wet(h: number): boolean { return wetBins(this.w, this.slot(h)) !== 0 }
  men(h: number): number { return menOf(this.w, this.slot(h)) }
  companyFrames(h: number): { x: number; z: number; face: number }[] {
    const w = this.w, i = this.slot(h), out = []
    for (let c = 0; c < w.cr.geo.companies; c++) { const p = placeWorld(w, i, c, w.f.x[i], w.f.z[i], w.f.heading[i], this.t, 0, { x: 0, z: 0, a: 0, face: 0 }); out.push({ x: p.x, z: p.z, face: p.face }) }
    return out
  }
  layout(h: number) { return layoutOf(this.w, this.slot(h)) }
}

// closest places of men in different companies, and within one company
export function closest(P: [number, number, number, number][], same: boolean): number {
  let m = Infinity
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++)
    if ((P[a][2] === P[b][2]) === same) m = Math.min(m, Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]))
  return m
}

// a terrain copy with a rectangle repainted (class or water depth), for experiments the map lacks
export function paint(base: Terrain, rects: { x0: number; z0: number; x1: number; z1: number; cls?: string; depth?: number }[], c = cr): Terrain {   // c: the ruleset whose class names are used
  const t: Terrain = { ...base, cls: base.cls.slice(), depth: base.depth.slice(), imp: [], impd: [] }
  const names = Object.keys(c.rs.terrain)
  for (const r of rects) for (let z = Math.ceil(r.z0); z <= r.z1; z++) for (let x = Math.ceil(r.x0); x <= r.x1; x++) {
    const k = cellK(t, x, z); if (r.cls) t.cls[k] = names.indexOf(r.cls); if (r.depth !== undefined) t.depth[k] = r.depth }
  rebuildImpassable(t)
  return t
}
export { baseTerrain }
