// Morale (docs/plans/active/s1c-fire-morale.md; docs/proposals/sim-design.md §10), loss-driven: each tick a
// battalion's morale closes part of the gap to its target, its quality less the weighted share of men lost
// and of men lost recently. Being fired at does not move it, nor does disorder (a march through a wood would
// shake a battalion no enemy can see); men falling do. The state
// follows the morale with hysteresis. A battalion that routs drops its orders and runs for its side's rear;
// it does not rally (S1c-2).
import { type World, MS_STEADY, MS_SHAKEN, MS_WAVERING, MS_ROUTING, O_FACE, O_MOVE } from './world.ts'
import { allocOrder, appendOrder, clearOrders, layoutOf, menOf } from './formation.ts'
import { sin, cos } from './num.ts'

const RUN = 800   // how far toward the rear a router is sent, metres (kept on the map)

// step 12 for battalion i, after its casualties (`lost`, step 11)
export function moraleStep(w: World, i: number, lost: number): void {
  const f = w.f, M = w.cr.rs.morale, start = Math.max(1, f.startMen[i])
  f.recent[i] = f.recent[i] * w.cr.recentDecay + lost
  const target = f.quality[i] - M.losses * (start - menOf(w, i)) / start - M.recent * f.recent[i] / start
  f.morale[i] += (target - f.morale[i]) * w.cr.relax
  const m = f.morale[i], s = f.mstate[i]
  if (s === MS_ROUTING) return
  if (m < M.rout) { rout(w, i); return }
  // down as far as the morale says, up one step at a time past each threshold's way back
  let next = s
  if (m < M.wavering[0]) next = MS_WAVERING
  else if (m < M.shaken[0]) next = Math.max(s, MS_SHAKEN)
  if (next === s && s === MS_WAVERING && m >= M.wavering[1]) next = MS_SHAKEN
  if (next === s && s === MS_SHAKEN && m >= M.shaken[1]) next = MS_STEADY
  f.mstate[i] = next
}

// the battalion breaks: orders dropped, Face about where the shape allows and the rear is behind it, then
// a run toward its side's rear (straight back when the scenario set none) at the rout pace
function rout(w: World, i: number): void {
  const f = w.f, side = f.side[i]
  f.mstate[i] = MS_ROUTING
  let rx = w.sides.rearX[side], rz = w.sides.rearZ[side]
  if (rx === 0 && rz === 0) { rx = -sin(f.heading[i]); rz = -cos(f.heading[i]) }
  clearOrders(w, i); f.status[i] = 0; f.blockedFor[i] = 0
  // its own orders were just freed, so the pool has room unless another battalion holds all of it
  if (layoutOf(w, i).turn && !f.trans[i] && rx * sin(f.heading[i]) + rz * cos(f.heading[i]) < 0) { const k = allocOrder(w, O_FACE); if (k >= 0) appendOrder(w, i, k) }
  const t = w.terrain, lo = 2, hi = (t.n - 1) * t.cell - 2, n = allocOrder(w, O_MOVE)
  if (n < 0) return
  w.ord.x[n] = Math.min(t.x0 + hi, Math.max(t.x0 + lo, f.x[i] + rx * RUN)); w.ord.z[n] = Math.min(t.z0 + hi, Math.max(t.z0 + lo, f.z[i] + rz * RUN)); w.ord.resolved[n] = 1
  appendOrder(w, i, n)
}

// a new battalion: morale at its quality, steady
export function spawnMorale(w: World, i: number, quality: number): void {
  const f = w.f
  f.quality[i] = quality; f.morale[i] = quality; f.mstate[i] = MS_STEADY; f.startMen[i] = menOf(w, i); f.recent[i] = 0
}
