// Morale (docs/plans/active/s1c-fire-morale.md; docs/proposals/sim-design.md §10), loss-driven: each tick a
// battalion's morale closes part of the gap to its target, its quality less the weighted share of men lost
// and of men lost recently. Being fired at does not move it, nor does disorder (a march through a wood would
// shake a battalion no enemy can see); men falling do. The state
// follows the morale with hysteresis. A battalion that routs drops its orders and runs; the run's direction
// is fixed at the break (its side's rear, else away from the nearest enemy, else straight back), and its
// phase is kept: running, halted at
// impassable ground, or fled. Only a halted router tries again, the next direction of a fan about the
// stored one. It does not rally (S1c-2).
import { type World, MAX_FORMATIONS, MS_STEADY, MS_SHAKEN, MS_WAVERING, MS_ROUTING, O_FACE, O_MOVE, M_TICK, RP_RUNNING, RP_HALTED, RP_FLED } from './world.ts'
import { allocOrder, appendOrder, clearOrders, layoutOf, menOf, ordersFree, setOnMap, ST_HALTED } from './formation.ts'
import { sin, cos, PI } from './num.ts'

const RUN = 800   // how far a router is sent, metres (kept on the map)
// the runs: the stored direction first, then turned from it by these angles, one every RETRY ticks while the
// router is halted; after the last it stays where it is (pinned)
const FAN = [0, PI / 3, -PI / 3, 2 * PI / 3, -2 * PI / 3], RETRY = 100

// step 12 for battalion i, after its casualties (`lost`, step 11)
export function moraleStep(w: World, i: number, lost: number): void {
  const f = w.f, M = w.cr.rs.morale, start = Math.max(1, f.startMen[i])
  f.recent[i] = f.recent[i] * w.cr.recentDecay + lost
  const target = f.quality[i] - M.losses * (start - menOf(w, i)) / start - M.recent * f.recent[i] / start
  f.morale[i] += (target - f.morale[i]) * w.cr.relax
  const m = f.morale[i], s = f.mstate[i]
  if (s === MS_ROUTING) { routStep(w, i); return }
  if (m < M.rout) { rout(w, i); return }
  // down as far as the morale says, up one step at a time past each threshold's way back
  let next = s
  if (m < M.wavering[0]) next = MS_WAVERING
  else if (m < M.shaken[0]) next = Math.max(s, MS_SHAKEN)
  if (next === s && s === MS_WAVERING && m >= M.wavering[1]) next = MS_SHAKEN
  if (next === s && s === MS_SHAKEN && m >= M.shaken[1]) next = MS_STEADY
  f.mstate[i] = next
}

// the battalion breaks: its run's direction is fixed now (its side's rear; else away from the nearest enemy,
// since its heading may be turned away already, by a Retire; else straight back), its orders dropped, and
// the first run made
function rout(w: World, i: number): void {
  const f = w.f, side = f.side[i]
  let rx = w.sides.rearX[side], rz = w.sides.rearZ[side]
  if (rx === 0 && rz === 0) {
    let bd = Infinity
    for (let j = 0; j < MAX_FORMATIONS; j++) {
      // a threat: men left (after this tick's casualties), not running (as it stood before this step's morale)
      if (!f.alive[j] || f.side[j] === side || menOf(w, j) === 0 || (w.scratch.mstateBefore ?? f.mstate)[j] === MS_ROUTING) continue
      const dx = f.x[i] - f.x[j], dz = f.z[i] - f.z[j], d = Math.sqrt(dx * dx + dz * dz)
      if (d > 1e-6 && d < bd) { bd = d; rx = dx / d; rz = dz / d }   // the lower slot wins a tie
    }
    if (bd === Infinity) { rx = -sin(f.heading[i]); rz = -cos(f.heading[i]) }
  }
  f.mstate[i] = MS_ROUTING; f.routX[i] = rx; f.routZ[i] = rz; f.runs[i] = 0; f.routPhase[i] = RP_HALTED
  clearOrders(w, i)
  run(w, i)
}
// a router: a run ends when its orders do. Halted at impassable ground, it tries the fan's next direction
// every RETRY ticks; otherwise it got where it was going (or as near as it could) and has fled
function routStep(w: World, i: number): void {
  const f = w.f
  if (f.routPhase[i] === RP_RUNNING && f.ordHead[i] < 0) f.routPhase[i] = f.status[i] === ST_HALTED ? RP_HALTED : RP_FLED
  if (f.routPhase[i] === RP_HALTED && f.runs[i] < FAN.length && (w.meta[M_TICK] + 1 + i) % RETRY === 0) run(w, i)
}
// the next run: the stored direction turned by the fan's angle, at the rout pace, with a Face about first
// where the shape allows and the way is behind it. The run's order is made first; if the pool has none,
// nothing changes (the same direction is tried at the next retry)
function run(w: World, i: number): void {
  const f = w.f, a = FAN[f.runs[i]], ca = cos(a), sa = sin(a)
  const dx = f.routX[i] * ca + f.routZ[i] * sa, dz = -f.routX[i] * sa + f.routZ[i] * ca
  const n = allocOrder(w, O_MOVE)
  if (n < 0) return
  f.runs[i]++; f.routPhase[i] = RP_RUNNING; f.status[i] = 0; f.blockedFor[i] = 0
  setOnMap(w, n, f.x[i] + dx * RUN, f.z[i] + dz * RUN); w.ord.resolved[n] = 1
  if (ordersFree(w) > 0 && layoutOf(w, i).turn && !f.trans[i] && dx * sin(f.heading[i]) + dz * cos(f.heading[i]) < 0) {
    const k = allocOrder(w, O_FACE); w.ord.optional[k] = 1; appendOrder(w, i, k)   // optional: if it fails, the run goes on
  }
  appendOrder(w, i, n)
}

// a new battalion: morale at its quality, steady
export function spawnMorale(w: World, i: number, quality: number): void {
  const f = w.f
  f.quality[i] = quality; f.morale[i] = quality; f.mstate[i] = MS_STEADY; f.startMen[i] = menOf(w, i); f.recent[i] = 0
}
