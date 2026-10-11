// The tick (docs/proposals/sim-design.md §16, the determinism contract). Every loop runs in slot order.
// S1a fills steps 1, 5–6 (orders → formation state and movement, one call per formation) and 14; S1c fills
// 8 (fire), 11 (casualties) and 12 (morale; the rout and the wavering fall-back are its standing behaviours);
// S1d-2 fills 4 (the square against cavalry) and 10 (charges and melee); S1d-3 fills 9 (artillery). The others are named and empty until
// later parts of S1.
import { type World, M_TICK, MAX_FORMATIONS, MS_SHATTERED, typeOf, formationHandle } from './world.ts'
import { placeWorld, type Pose } from './formation.ts'
import { DT } from './time.ts'
import { sin, cos } from './num.ts'
import { applyCommands, reapFormation, type Dropped } from './commands.ts'
import { HASH_EVERY } from './time.ts'
import type { Handle } from './handle.ts'
import { assertFinite } from './num.ts'
import { formationTick, menOf } from './formation.ts'
import { hashWorld } from './serialize.ts'
import { fireStep, casualtiesStep } from './fire.ts'
import { moraleStep } from './morale.ts'
import { meleeStep, standingStep } from './melee.ts'
import { artilleryStep } from './artillery.ts'
import { planStep, endStep } from './plan.ts'

// a company of formation i with men stands within morale.leave of the map's edge: any corner of its block (a line
// meeting the edge at an angle, a square backing into it, or a column of route's tail reaches it before the anchor)
const aePose: Pose = { x: 0, z: 0, a: 0, face: 0, kx: 1, kz: 1 }
function atEdge(w: World, i: number): boolean {
  const t = w.terrain, e = (t.n - 1) * t.cell, L = w.cr.rs.morale.leave, f = w.f, U = typeOf(w, i), g = U.geo, now = w.meta[M_TICK] * DT
  for (let c = 0; c < U.C; c++) {
    if (f.men[i * w.cr.maxC + c] <= 0) continue
    const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], now, 0, aePose), ca = cos(p.a), sa = sin(p.a)
    const hx = (g.files - 1) / 2 * g.fileSpacing * p.kx, lz = -(g.ranks - 1) * g.rankSpacing * p.kz
    for (let k = 0; k < 4; k++) {
      const lx = k & 1 ? hx : -hx, z0 = k & 2 ? lz : 0
      const x = p.x + lx * ca - z0 * sa - t.x0, z = p.z + lx * sa + z0 * ca - t.z0
      if (Math.min(x, z, e - x, e - z) <= L) return true
    }
  }
  return false
}
// metering is injected: the sim never reads a clock itself
export interface Meter { now(): number; add(step: string, ms: number): void }
// departed: the formations that left the field this tick, with their men (the renderer lets them go, not fall)
export interface TickResult { tick: number; hash: number | null; dropped: Dropped[]; departed: { id: Handle; men: number }[] }

export function advanceTick(w: World, meter?: Meter): TickResult {
  const t = w.meta[M_TICK] + 1
  const step = (name: string, fn: () => void) => { if (!meter) return fn(); const t0 = meter.now(); fn(); meter.add(name, meter.now() - t0) }
  let dropped: Dropped[] = []
  const departed: TickResult['departed'] = []
  step('1 commands', () => { dropped = applyCommands(w, t) })
  // 2 commanders: S2
  step('3 the scenario\'s plan', () => { planStep(w, dropped) })
  step('4 standing behaviour: refuge against a charge', () => { standingStep(w) })
  step('5–6 formations: orders, changes, movement', () => { for (let i = 0; i < MAX_FORMATIONS; i++) if (w.f.alive[i]) formationTick(w, i) })
  // 7 vision: S2
  step('8 fire', () => { fireStep(w) })
  step('9 artillery', () => { artilleryStep(w) })
  step('10 charges and melee', () => { meleeStep(w) })
  // all casualties first, then all morale: a rout reads other battalions (the nearest enemy's position and
  // men, final for the tick; its morale state from a copy taken before any changes), so visiting order does
  // not matter, except for orders from the shared pool (the lower slot served first when it runs short)
  step('11–12 casualties and morale', () => {
    const lost = w.scratch.lost ?? (w.scratch.lost = new Int32Array(MAX_FORMATIONS))
    for (let i = 0; i < MAX_FORMATIONS; i++) lost[i] = w.f.alive[i] ? casualtiesStep(w, i) : 0
    const before = w.scratch.mstateBefore ?? (w.scratch.mstateBefore = new Uint8Array(MAX_FORMATIONS)); before.set(w.f.mstate)
    const men = w.scratch.menNow ?? (w.scratch.menNow = new Int32Array(MAX_FORMATIONS))
    for (let i = 0; i < MAX_FORMATIONS; i++) men[i] = w.f.alive[i] ? menOf(w, i) : 0   // final for the tick: the morale pass reads them
    // a test switch visits them in reverse: contagion and support read only state fixed before the step
    const rev = w.scratch.reverse === true
    for (let k = 0; k < MAX_FORMATIONS; k++) { const i = rev ? MAX_FORMATIONS - 1 - k : k; if (w.f.alive[i]) moraleStep(w, i, lost[i]) }
  })
  // 13: the end (S1e-2); smoke: S2
  step('13 the end', () => { endStep(w) })
  // 14: formations with no men are reaped, and shattered formations at the map's edge leave the field: reaped,
  // their men counted to their side (S1e-1). A router there stays: it may still rally
  step('14 reap', () => { for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!w.f.alive[i]) continue
    const men = menOf(w, i)
    if (men === 0) reapFormation(w, i)
    else if (w.f.mstate[i] === MS_SHATTERED && atEdge(w, i)) {
      w.sides.left[w.f.side[i]] += men
      departed.push({ id: formationHandle(w, i), men })
      reapFormation(w, i)
    }
  } })
  w.meta[M_TICK] = t
  // (the trail rings, 1 MB at 400 men, are skipped: their points come from checked positions or from the ring
  // itself, and a non-finite point would make trailLen, which is checked, non-finite too)
  if (w.debug) for (const [name, a] of Object.entries(w.f)) if (a instanceof Float64Array && name !== 'trailX' && name !== 'trailZ') assertFinite(`formation state ${name}`, a)
  let hash: number | null = null
  step('15 hash', () => { if (t % HASH_EVERY === 0) hash = hashWorld(w) })
  return { tick: t, hash, dropped, departed }
}
