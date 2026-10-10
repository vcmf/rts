// Commands (docs/proposals/sim-design.md §4): the only way into the simulation. The sim stamps each
// command with the next tick and a sequence number, quantises its positions to 1 cm, and applies it at the
// start of that tick after validating it; an invalid command is dropped with a reason and changes nothing.
// Only external commands (player, scripts) go into the replay log. Shapes and order presets are named by
// the ruleset (decision 0015).
import type { Handle } from './handle.ts'
import { quantise, PI } from './num.ts'
import { type World, M_TICK, M_SEQ, M_FREE, SIDES, O_MOVE, O_FORM, O_WHEEL, O_FACE, O_DRESS, MS_ROUTING, FIRE_AT_WILL, formationSlot } from './world.ts'
import { spawnFire } from './fire.ts'
import { spawnMorale } from './morale.ts'
import { allocOrder, appendOrder, clearOrders, ordersFree, rebalance, resetTrail, removeMan } from './formation.ts'
import { nextInt } from './rng.ts'
import { columnsOf } from './columns.ts'

export type Command =
  | { type: 'move'; id: Handle; points: [number, number][]; append: boolean }
  | { type: 'form'; id: Handle; shape: string }
  | { type: 'wheel'; id: Handle; angle: number }
  | { type: 'face'; id: Handle }
  | { type: 'retire'; id: Handle; metres: number }
  | { type: 'halt'; id: Handle }
  | { type: 'style'; id: Handle; preset: string }
  | { type: 'debug-spawn'; side: number; x: number; z: number; heading: number; shape: string; men: number; quality?: number; fire?: string }
  | { type: 'fire'; id: Handle; mode: string; target?: Handle }
  | { type: 'side'; side: number; x: number; z: number }
  | { type: 'debug-kill'; id: Handle; men: number }
  | { type: 'debug-morale'; id: Handle; quality: number }
export interface Stamped { tick: number; seq: number; cmd: Command }
export interface Dropped { tick: number; seq: number; reason: string }

export const MAX_POINTS = 64
export const COMMAND_TYPES = ['move', 'form', 'wheel', 'face', 'retire', 'halt', 'style', 'fire', 'side', 'debug-spawn', 'debug-kill', 'debug-morale'] as const
export const FIRE_MODES = ['at will', 'hold']   // index = FIRE_AT_WILL, FIRE_HOLD

// stamps a command for the next tick; `log` receives it when the command is external
export function issue(w: World, cmd: Command, log?: Stamped[]): Stamped {
  const q = quantiseCommand(cmd)
  const s: Stamped = { tick: w.meta[M_TICK] + 1, seq: w.meta[M_SEQ]++, cmd: q }
  w.pending.push(s)
  if (log) log.push(s)
  return s
}
// a spawn's quality: −1 marks none given (the ruleset's), any negative given becomes −2 (refused);
// positions to 1 cm, angles to 0.1 mrad; an unknown type or a move with too many points is kept as it is
// and dropped when applied
function quantiseCommand(c: Command): Command {
  const qa = (a: number) => Math.round(a * 10000) / 10000
  switch (c.type) {
    case 'move': return { type: 'move', id: c.id | 0, points: !wellFormed(c.points) || c.points.length > MAX_POINTS ? c.points : c.points.map(([x, z]) => [quantise(x), quantise(z)]), append: !!c.append }
    case 'form': return { type: 'form', id: c.id | 0, shape: String(c.shape) }
    case 'wheel': return { type: 'wheel', id: c.id | 0, angle: qa(c.angle) }
    case 'face': return { type: 'face', id: c.id | 0 }
    case 'retire': return { type: 'retire', id: c.id | 0, metres: quantise(c.metres) }
    case 'halt': return { type: 'halt', id: c.id | 0 }
    case 'style': return { type: 'style', id: c.id | 0, preset: String(c.preset) }
    case 'debug-spawn': return { type: 'debug-spawn', side: c.side | 0, x: quantise(c.x), z: quantise(c.z), heading: qa(c.heading), shape: String(c.shape), men: c.men | 0, quality: c.quality === undefined ? -1 : c.quality < 0 ? -2 : qa(c.quality), fire: c.fire === undefined ? FIRE_MODES[FIRE_AT_WILL] : String(c.fire) }
    case 'fire': return { type: 'fire', id: c.id | 0, mode: String(c.mode), target: (c.target ?? 0) | 0 }
    case 'side': return { type: 'side', side: c.side | 0, x: qa(c.x), z: qa(c.z) }
    case 'debug-kill': return { type: 'debug-kill', id: c.id | 0, men: c.men | 0 }
    case 'debug-morale': return { type: 'debug-morale', id: c.id | 0, quality: qa(c.quality) }
    default: return c
  }
}

// waypoints as given: an array of [x, z] number pairs
function wellFormed(p: unknown): p is [number, number][] {
  return Array.isArray(p) && p.every(q => Array.isArray(q) && q.length === 2 && typeof q[0] === 'number' && typeof q[1] === 'number')
}


const inside = (w: World, x: number, z: number): boolean => {
  const t = w.terrain, e = (t.n - 1) * t.cell
  return x >= t.x0 && z >= t.z0 && x <= t.x0 + e && z <= t.z0 + e
}
const finite = (v: number): boolean => v === v && v !== Infinity && v !== -Infinity

// applies the commands stamped for tick t, in sequence order; returns the dropped ones
export function applyCommands(w: World, t: number): Dropped[] {
  const dropped: Dropped[] = [], keep: Stamped[] = []
  for (const s of w.pending) {
    if (s.tick > t) { keep.push(s); continue }
    const why = s.tick < t ? 'stale tick' : !(COMMAND_TYPES as readonly string[]).includes(s.cmd.type) ? 'unknown command' : apply(w, s.cmd)
    if (why) dropped.push({ tick: t, seq: s.seq, reason: why })
  }
  w.pending = keep
  return dropped
}

// replaces (or appends to) a formation's orders with new ones of the given types; '' or why not
function giveOrders(w: World, i: number, types: number[], append: boolean, fill: (n: number, k: number) => void): string {
  let room = ordersFree(w)
  if (!append) for (let n = w.f.ordHead[i]; n >= 0; n = w.ord.next[n]) room++
  if (types.length > room) return 'order pool full'
  if (!append) clearOrders(w, i)
  types.forEach((t, k) => { const n = allocOrder(w, t); fill(n, k); appendOrder(w, i, n) })
  w.f.status[i] = 0; w.f.blockedFor[i] = 0
  return ''
}

function apply(w: World, c: Command): string {
  const f = w.f, o = w.ord, cr = w.cr
  if (c.type === 'debug-spawn') {
    if (c.side < 0 || c.side >= SIDES) return 'no such side'
    const shape = cr.shapeIndex(c.shape); if (shape < 0) return 'no such shape'
    if (c.men <= 0 || c.men > cr.slots) return 'no room for those men'
    if (!finite(c.x) || !finite(c.z) || !finite(c.heading) || !inside(w, c.x, c.z)) return 'outside the map'
    if (Math.abs(c.heading) > 4 * PI) return 'heading out of range'
    const q = c.quality === undefined || c.quality === -1 ? cr.rs.morale.quality : c.quality   // −1: the ruleset's
    if (!finite(q) || q < 0 || q > 1) return 'no such quality'
    const mode = FIRE_MODES.indexOf(c.fire ?? FIRE_MODES[FIRE_AT_WILL]); if (mode < 0) return 'no such fire mode'
    if (w.meta[M_FREE] === 0) return 'no free formation slot'
    const i = w.free[--w.meta[M_FREE]], C = cr.geo.companies
    f.alive[i] = 1; f.side[i] = c.side; f.shape[i] = shape; f.style[i] = cr.presetIndex(cr.rs.start.orders); f.drill[i] = 1
    f.x[i] = c.x; f.z[i] = c.z; f.heading[i] = c.heading; f.px[i] = c.x; f.pz[i] = c.z; f.ph[i] = c.heading
    f.men[i * C] = c.men; rebalance(w, i)
    resetTrail(w, i)
    spawnFire(w, i); spawnMorale(w, i, q); f.fireMode[i] = mode
    return ''
  }
  if (c.type === 'side') {   // the direction of a side's rear, where its routers run
    if (c.side < 0 || c.side >= SIDES) return 'no such side'
    const l = Math.sqrt(c.x * c.x + c.z * c.z); if (!finite(l) || l < 1e-6) return 'no such direction'
    w.sides.rearX[c.side] = c.x / l; w.sides.rearZ[c.side] = c.z / l
    return ''
  }
  const i = formationSlot(w, c.id); if (i < 0) return 'no such formation'
  if (f.mstate[i] === MS_ROUTING && c.type !== 'debug-kill' && c.type !== 'debug-morale') return 'routing'
  switch (c.type) {
    case 'move': {
      if (!wellFormed(c.points)) return 'malformed waypoints'
      if (c.points.length === 0) return 'no waypoints'
      if (c.points.length > MAX_POINTS) return 'too many waypoints'
      for (const [x, z] of c.points) if (!finite(x) || !finite(z) || !inside(w, x, z)) return 'waypoint outside the map'
      return giveOrders(w, i, c.points.map(() => O_MOVE), c.append, (n, k) => { o.x[n] = c.points[k][0]; o.z[n] = c.points[k][1]; o.resolved[n] = 1 })
    }
    case 'form': {
      const s = cr.shapeIndex(c.shape); if (s < 0) return 'no such shape'
      return giveOrders(w, i, [O_FORM], false, n => { o.shape[n] = s })
    }
    case 'wheel':
      if (!finite(c.angle) || c.angle === 0 || Math.abs(c.angle) > 2 * PI) return 'no such wheel'
      return giveOrders(w, i, [O_WHEEL], false, n => { o.a[n] = c.angle })
    case 'face': return giveOrders(w, i, [O_FACE], false, () => {})
    case 'retire':   // face about, march, halt and dress, face the front again; the last two survive a halt
      if (!finite(c.metres) || c.metres <= 0 || c.metres > 1000) return 'no such retreat'
      return giveOrders(w, i, [O_FACE, O_MOVE, O_DRESS, O_FACE], false, (n, k) => { if (k === 1) o.a[n] = c.metres; if (k >= 2) o.finish[n] = 1 })
    case 'halt': clearOrders(w, i); f.status[i] = 0; f.blockedFor[i] = 0; return ''
    case 'style': { const p = cr.presetIndex(c.preset); if (p < 0) return 'no such order preset'; f.style[i] = p; return '' }
    case 'debug-morale':   // the quality its morale relaxes toward (scripted morale tests)
      if (!finite(c.quality) || c.quality < 0 || c.quality > 1) return 'no such quality'
      f.quality[i] = c.quality; return ''
    case 'fire': {
      const m = FIRE_MODES.indexOf(c.mode); if (m < 0) return 'no such fire mode'
      const t = c.target ?? 0, j = t ? formationSlot(w, t) : -1
      if (t && (j < 0 || f.side[j] === f.side[i])) return 'no such target'
      f.fireMode[i] = m; f.prefer[i] = t; return ''
    }
    case 'debug-kill': {
      if (c.men <= 0) return 'no men'
      const C = cr.geo.companies
      for (let k = 0; k < c.men; k++) {   // each man from a company drawn by the sim RNG, weighted by its men
        let tot = 0; for (let q = 0; q < C; q++) tot += f.men[i * C + q]
        if (!tot) break
        let r = nextInt(w.rng, tot), q = 0
        while (r >= f.men[i * C + q]) { r -= f.men[i * C + q]; q++ }
        removeMan(w, i, q)   // through the re-packing gate
      }
      return ''
    }
  }
  return 'unknown command'
}

// frees an empty formation's slot: its orders, every column of its row zeroed, the generation moved on
export function reapFormation(w: World, i: number): void {
  clearOrders(w, i)
  const gen = w.f.gen[i], ver = w.f.trailVer[i], N = w.f.alive.length
  for (const a of columnsOf(w.f)) { const k = a.length / N; a.fill(0, i * k, i * k + k) }
  // the generation moves on (old handles go stale); the trail version keeps counting (it keys the arc cache)
  w.f.gen[i] = (gen + 1) & ((1 << 19) - 1); w.f.trailVer[i] = ver + 1; w.f.ordHead[i] = -1; w.f.ordTail[i] = -1
  w.free[w.meta[M_FREE]++] = i
}
