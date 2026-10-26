// Morale (docs/plans/active/s1c-fire-morale.md, docs/plans/active/s1c2-morale-machine.md; docs/proposals/
// sim-design.md §10), loss-driven: each tick a battalion's morale closes part of the gap to its target, its
// quality less the weighted share of men lost and of men lost recently, plus a bonus for each secured flank.
// Being fired at does not move it, nor does disorder (a march through a wood would shake a battalion no
// enemy can see); men falling do, and so does a friend breaking nearby (contagion, a shock in the next
// tick), and so do a charge's threat and impact (the melee step's shocks, docs/systems/melee.md). The state
// follows the morale with hysteresis.
//
// A battalion that routs drops its orders and runs; the run's direction is fixed at the break (its side's
// rear, else away from the nearest enemy, else straight back), and its phase is kept: running, halted at
// impassable ground (or, with claims, by enemies), fled, or trapped by enemies on its last way out (it
// surrenders). Only a halted router tries again, the next direction of a fan about the stored one. A router
// whose run has ended, safe and calm, rallies: its losses so far are written off and its quality drops. A
// battalion that breaks too often, or routs below half strength, shatters and runs for good. A wavering
// battalion left without orders, its morale still falling and the enemy in front of it, falls back once (not
// in melee: it ends by a rout, docs/systems/melee.md).
//
// Everything one battalion reads of another (its state, whether it broke, its men) was fixed before this
// step began, so no outcome depends on the order battalions are visited in. One thing does: routs and
// fall-backs take orders from the shared pool in visiting order, so two in the same tick get different
// pool entries (and the lower slot is served first when the pool runs short), as tick.ts says.
import {
  type World,
  MAX_FORMATIONS,
  MS_STEADY,
  MS_SHAKEN,
  MS_WAVERING,
  MS_ROUTING,
  MS_RALLYING,
  MS_SHATTERED,
  O_FACE,
  O_MOVE,
  M_TICK,
  RP_NONE,
  RP_RUNNING,
  RP_HALTED,
  RP_FLED,
  RP_TRAPPED,
  outOfFight,
} from './world.ts'
import {
  allocOrder,
  appendOrder,
  clearOrders,
  layoutOf,
  menOf,
  ordersFree,
  setOnMap,
  ST_HALTED,
  ST_BLOCKED,
  RETIRE,
  fillRetire,
  cutChange,
} from './formation.ts'
import { formedFits, freeSpot, heldByEnemy } from './claims.ts'
import { sin, cos, PI } from './num.ts'
import { TICK_HZ, DT } from './time.ts'

const RUN = 800 // how far a router is sent, metres (kept on the map)
// the runs: the stored direction first, then turned from it by these angles, one every RETRY ticks while the
// router is halted; after the last it stays where it is (pinned), unless enemies hold it there (RP_TRAPPED)
const FAN = [0, PI / 3, -PI / 3, (2 * PI) / 3, (-2 * PI) / 3]
const RETRY = 100
// s a run may stand held by other formations' cells before it counts as halted there (the claim grid's prototype)
const HELD = 2
// ticks within which an enemy's hold on a man's next step counts as holding the router (a held formation tests its way
// only every BLOCK_RETRY ticks, formation.ts)
const HELD_RECENT = 10

// what a battalion reads of the others this step (scratch): the contagion shock, its secured flanks, and the
// nearest enemy in the fight (its distance, and the unit vector from it to the battalion)
const near = { shock: 0, left: 0, right: 0, enemy: Infinity, ax: 0, az: 0 }

// step 12 for battalion i, after its casualties (`lost`, step 11)
export function moraleStep(w: World, i: number, lost: number): void {
  const f = w.f
  const M = w.cr.rs.morale
  const now = w.meta[M_TICK] + 1
  const base = Math.max(1, f.baseMen[i])
  const start = Math.max(1, f.startMen[i])
  f.recent[i] = f.recent[i] * w.cr.recentDecay + lost
  // the melee step's shocks (a charge's threat and impact): taken with contagion
  const owedShock = f.shockIn[i]
  f.shockIn[i] = 0
  const s = f.mstate[i]
  const men = w.scratch.menNow ? w.scratch.menNow[i] : menOf(w, i)
  // shattered, or routing mid-run: it only runs, and nothing it would read of the others is used
  if (s === MS_SHATTERED || (s === MS_ROUTING && f.routPhase[i] === RP_RUNNING)) {
    if (s === MS_ROUTING && men < M.shatter * f.startMen[i]) f.mstate[i] = MS_SHATTERED
    routStep(w, i)
    return
  }
  survey(w, i, now)
  // the losses term counts from baseMen (written off at a rally); recent losses are a share of the spawn strength
  const target =
    f.quality[i] -
    (M.losses * (base - men)) / base -
    (M.recent * f.recent[i]) / start +
    M.support.bonus * (near.left + near.right)
  const was = f.morale[i]
  f.morale[i] += (target - f.morale[i]) * w.cr.relax
  if (s !== MS_ROUTING) f.morale[i] -= near.shock + owedShock // routing and shattered (returned above) are not shocked
  // falling: down by more than fallback.rate a second (the relax's slow crawl toward a fixed target is not)
  f.falling[i] = was - f.morale[i] > M.fallback.rate * DT ? f.falling[i] + 1 : 0
  const m = f.morale[i]
  if (s === MS_ROUTING) {
    if (men < M.shatter * f.startMen[i]) f.mstate[i] = MS_SHATTERED
    // its run has ended (a run was made, and it is not running: a full order pool can leave a router
    // unmoved where it broke, which is not the end of a run)
    else if (
      f.runs[i] > 0 &&
      f.routPhase[i] !== RP_RUNNING &&
      f.quality[i] - M.rally.cost >= M.wavering[0] &&
      now - f.lastLoss[i] >= M.rally.calm * TICK_HZ &&
      near.enemy > M.rally.safe
    ) {
      rally(w, i, now, men)
      return
    }
    routStep(w, i)
    return
  }
  if (m < M.rout) {
    rout(w, i, now, men)
    return
  }
  if (s === MS_RALLYING) {
    if (now - f.since[i] >= M.rally.time * TICK_HZ) {
      // with the claim grid's prototype, it forms only where it fits: standing on a formation in the fight, it goes
      // first to the nearest place it fits (docs/plans/active/c1-claims.md, step 3)
      if (w.claims && !formedFits(w, i, f.x[i], f.z[i], f.heading[i])) {
        if (f.ordHead[i] < 0) {
          const spot = freeSpot(w, i)
          // a way that lies behind it is walked faced about, as a router's run is: a line cannot turn in place at the
          // map's edge or among others; it faces back when it gets there
          const back = !!spot && (spot[0] - f.x[i]) * sin(f.heading[i]) + (spot[1] - f.z[i]) * cos(f.heading[i]) < 0
          const face = back && !!layoutOf(w, i).turn && !f.trans[i]
          if (spot && ordersFree(w) >= (face ? 3 : 1)) {
            if (face) {
              const k = allocOrder(w, O_FACE)
              w.ord.optional[k] = 1
              appendOrder(w, i, k)
            }
            const n = allocOrder(w, O_MOVE)
            setOnMap(w, n, spot[0], spot[1])
            w.ord.resolved[n] = 1
            appendOrder(w, i, n)
            if (face) {
              const k = allocOrder(w, O_FACE)
              w.ord.optional[k] = 1
              appendOrder(w, i, k)
            }
          }
        }
        return
      }
      f.mstate[i] = m < M.wavering[0] ? MS_WAVERING : m < M.shaken[0] ? MS_SHAKEN : MS_STEADY
    }
    return
  }
  // down as far as the morale says, up one step at a time past each threshold's way back
  let next = s
  if (m < M.wavering[0]) next = MS_WAVERING
  else if (m < M.shaken[0]) next = Math.max(s, MS_SHAKEN)
  if (next === s && s === MS_WAVERING && m >= M.wavering[1]) next = MS_SHAKEN
  if (next === s && s === MS_SHAKEN && m >= M.shaken[1]) next = MS_STEADY
  f.mstate[i] = next
  if (next !== MS_WAVERING) f.fellBack[i] = 0
  else if (
    !f.fellBack[i] &&
    f.ordHead[i] < 0 &&
    !f.trans[i] &&
    !f.foe[i] &&
    f.falling[i] >= M.fallback.after * TICK_HZ &&
    enemyAhead(w, i)
  ) {
    fallBack(w, i)
  }
}
// the nearest enemy in the fight is within fire range and in front of the battalion (within 90° of its
// heading): a Retire, back from its own facing, then takes it away from that enemy, not toward it
function enemyAhead(w: World, i: number): boolean {
  return near.enemy <= w.cr.rs.fire.maxRange && near.ax * sin(w.f.heading[i]) + near.az * cos(w.f.heading[i]) < 0
}

// what battalion i reads of the others, all from before this step's morale: the contagion shock of friends
// that broke last tick, its secured flanks, and the distance to the nearest enemy in the fight
function survey(w: World, i: number, now: number): void {
  const f = w.f
  const M = w.cr.rs.morale
  const side = f.side[i]
  const before = w.scratch.mstateBefore ?? f.mstate
  const men = w.scratch.menNow
  const hx = sin(f.heading[i])
  const hz = cos(f.heading[i])
  // the side's front: away from its rear when a scenario set one, else the way the battalion faces
  let fx = -w.sides.rearX[side]
  let fz = -w.sides.rearZ[side]
  if (fx === 0 && fz === 0) {
    fx = hx
    fz = hz
  }
  near.shock = 0
  near.left = 0
  near.right = 0
  near.enemy = Infinity
  near.ax = 0
  near.az = 0
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (j === i || !f.alive[j] || (men ? men[j] : menOf(w, j)) === 0) continue
    const dx = f.x[j] - f.x[i]
    const dz = f.z[j] - f.z[i]
    const d = Math.sqrt(dx * dx + dz * dz)
    // an enemy: in the fight (as it stood before this step's morale); the lower slot wins a tie
    if (f.side[j] !== side) {
      if (!outOfFight(before[j]) && d > 1e-6 && d < near.enemy) {
        near.enemy = d
        near.ax = -dx / d
        near.az = -dz / d
      }
      continue
    }
    if (f.brokeTick[j] === now - 1) {
      const R = dx * fx + dz * fz > 0 ? M.contagion.front : M.contagion.back
      if (d < R) near.shock += M.contagion.shock * (1 - d / R)
    }
    // a flank: a friend in the fight within reach, within the support arc of the battalion's left or right
    if (!outOfFight(before[j]) && d <= M.support.reach && d > 1e-6) {
      const across = dx * hz - dz * hx // + to the right (heading 0 = +z, clockwise toward +x)
      if (across >= d * w.cr.supportCos) near.right = 1
      else if (-across >= d * w.cr.supportCos) near.left = 1
    }
  }
}

// the battalion breaks: its run's direction is fixed now (its side's rear; else away from the nearest enemy,
// since its heading may be turned away already, by a Retire; else straight back), its orders dropped, and
// the first run made. Breaking more often than it may rally, or below half strength, it shatters
function rout(w: World, i: number, now: number, men: number): void {
  const f = w.f
  const side = f.side[i]
  const M = w.cr.rs.morale
  let rx = w.sides.rearX[side]
  let rz = w.sides.rearZ[side]
  if (rx === 0 && rz === 0) {
    // away from the nearest enemy in the fight, as this step's survey found it
    if (near.enemy < Infinity) {
      rx = near.ax
      rz = near.az
    } else {
      rx = -sin(f.heading[i])
      rz = -cos(f.heading[i])
    }
  }
  f.routs[i] = Math.min(255, f.routs[i] + 1)
  f.brokeTick[i] = now
  f.fellBack[i] = 0
  f.mstate[i] = f.routs[i] > M.rally.max || men < M.shatter * f.startMen[i] ? MS_SHATTERED : MS_ROUTING
  f.routX[i] = rx
  f.routZ[i] = rz
  f.runs[i] = 0
  f.routPhase[i] = RP_HALTED
  clearOrders(w, i)
  if (f.trans[i]) cutChange(w, i) // it breaks its ranks: no change finished under fire (#39)
  run(w, i)
}
/**
 * A router's step: a run ends when its orders do, or when other formations' cells hold it for HELD seconds. Halted at
 * impassable ground or by others, it tries the fan's next direction every RETRY ticks; held on the last by an enemy in
 * the fight, it is trapped and surrenders (tick.ts); otherwise it got where it was going (or as near as it could) and
 * has fled.
 */
function routStep(w: World, i: number): void {
  const f = w.f
  if (f.routPhase[i] === RP_RUNNING && f.status[i] === ST_BLOCKED && f.blockedFor[i] > HELD) {
    clearOrders(w, i)
    f.routPhase[i] = f.runs[i] >= FAN.length && heldByEnemy(w, i, HELD_RECENT) ? RP_TRAPPED : RP_HALTED
  }
  if (f.routPhase[i] === RP_RUNNING && f.ordHead[i] < 0) {
    f.routPhase[i] = f.status[i] === ST_HALTED ? RP_HALTED : RP_FLED
  }
  if (f.routPhase[i] === RP_HALTED && f.runs[i] < FAN.length && (w.meta[M_TICK] + 1 + i) % RETRY === 0) run(w, i)
}
// the next run: the stored direction turned by the fan's angle, at the rout pace, with a Face about first
// where the shape allows and the way is behind it. The run's order is made first; if the pool has none,
// nothing changes (the same direction is tried at the next retry)
function run(w: World, i: number): void {
  const f = w.f
  const a = FAN[f.runs[i]]
  const ca = cos(a)
  const sa = sin(a)
  const dx = f.routX[i] * ca + f.routZ[i] * sa
  const dz = -f.routX[i] * sa + f.routZ[i] * ca
  const n = allocOrder(w, O_MOVE)
  if (n < 0) return
  f.runs[i]++
  f.routPhase[i] = RP_RUNNING
  f.status[i] = 0
  f.blockedFor[i] = 0
  setOnMap(w, n, f.x[i] + dx * RUN, f.z[i] + dz * RUN)
  w.ord.resolved[n] = 1
  if (ordersFree(w) > 0 && layoutOf(w, i).turn && !f.trans[i] && dx * sin(f.heading[i]) + dz * cos(f.heading[i]) < 0) {
    // optional: if it fails, the run goes on
    const k = allocOrder(w, O_FACE)
    w.ord.optional[k] = 1
    appendOrder(w, i, k)
  }
  appendOrder(w, i, n)
}
// a router rallies where it stands: the losses so far are written off (the losses term counts from the men
// it has now) and its quality drops, so it comes back brittle; it re-forms for rally.time before it takes
// orders again. Only a battalion whose quality, less the cost, is still wavering or better may rally: one
// below would break again at once
function rally(w: World, i: number, now: number, men: number): void {
  const f = w.f
  const M = w.cr.rs.morale
  clearOrders(w, i)
  f.status[i] = 0
  f.blockedFor[i] = 0
  f.routPhase[i] = RP_NONE
  f.fellBack[i] = 0
  f.quality[i] = Math.max(0, f.quality[i] - M.rally.cost)
  f.baseMen[i] = men
  f.recent[i] = 0
  f.morale[i] = f.quality[i]
  f.mstate[i] = MS_RALLYING
  f.since[i] = now
}
// the wavering fall-back: the Retire drill (formation.ts), made only when the pool has room for all of it.
// It falls back from an enemy in front of it (enemyAhead); with none, a break mid-Retire would run 'straight
// back' from the turned heading
function fallBack(w: World, i: number): void {
  if (ordersFree(w) < RETIRE.length) return
  for (let k = 0; k < RETIRE.length; k++) {
    const n = allocOrder(w, RETIRE[k])
    fillRetire(w, n, k, w.cr.rs.morale.fallback.metres)
    appendOrder(w, i, n)
  }
  w.f.status[i] = 0
  w.f.blockedFor[i] = 0
  w.f.fellBack[i] = 1
}

// a new battalion: morale at its quality, steady
export function spawnMorale(w: World, i: number, quality: number): void {
  const f = w.f
  const men = menOf(w, i)
  f.quality[i] = quality
  f.morale[i] = quality
  f.mstate[i] = MS_STEADY
  f.startMen[i] = men
  f.baseMen[i] = men
  f.recent[i] = 0
  f.brokeTick[i] = -1
  f.lastLoss[i] = 0
  f.since[i] = 0
  f.falling[i] = 0
  f.fellBack[i] = 0
  f.routs[i] = 0
}
