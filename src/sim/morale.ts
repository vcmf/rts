// Morale (docs/proposals/morale-bar-model.md; before it docs/plans/active/s1c-fire-morale.md and
// docs/plans/active/s1c2-morale-machine.md), a bar in points with its level's maximum. Men lost empty it, and so do
// shocks: a friend breaking nearby (contagion, in the next tick) and a charge's threat and impact (the melee step's,
// docs/systems/melee.md). In the fight it recovers the shocks, never the losses. Being fired at does not move it, nor
// does disorder (a march through a wood would shake a battalion no enemy can see). The states read its effective level,
// the bar with each secured flank's support, less the back exposed, as a share of its maximum, with hysteresis; at 0
// or less it routs.
//
// A battalion that routs drops its orders and runs; the run's direction is fixed at the break (its side's
// rear, else away from the nearest enemy, else straight back), and its phase is kept: running, halted at
// impassable ground (or, with claims, by others), or fled. Only a halted router tries again, the next direction of a
// fan about the stored one. Enemies that reach a router cut it down (the melee step). A router
// whose run has ended, safe and calm, rallies: its losses so far are written off and its maximum is cut. A
// battalion that breaks too often, or routs below half strength, shatters and runs for good. A wavering
// battalion keeps fighting until it recovers or routs (decision 0087): nothing moves it back by itself.
//
// Everything one battalion reads of another (its state, whether it broke, its men) was fixed before this
// step began, so no outcome depends on the order battalions are visited in. One thing does: routs take orders
// from the shared pool in visiting order, so two in the same tick get different
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
  outOfFight,
  typeOf,
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
  cutChange,
} from './formation.ts'
import { formedFits, freeSpot } from './claims.ts'
import { blockGeometry, inArc, sees, screenShare, sqDist, reachOf, type FireGeo } from './fire.ts'
import { buildFaces, threatWeights } from './sectors.ts'
import { sin, cos, PI } from './num.ts'
import { DT, TICK_HZ } from './time.ts'

const RUN = 800 // how far a router is sent, metres (kept on the map)
// the runs: the stored direction first, then turned from it by these angles, one every RETRY ticks while the
// router is halted; after the last it stays where it is (pinned). With claims, while an enemy is near it goes on trying
// the fan's directions in turn, since others may move off its way
const FAN = [0, PI / 3, -PI / 3, (2 * PI) / 3, (-2 * PI) / 3]
const RETRY = 100
// s a run may stand held by other formations' cells before it counts as halted there (the claim grid's prototype)
const HELD = 2
// metres, anchor to anchor: an enemy this near may yet move off a held router's way, or reach it (two columns of route
// tail to tail are about 700 m apart, anchor to anchor)
const ENEMY_NEAR = 1000

/** Whether an enemy in the fight stands within ENEMY_NEAR of battalion i, anchor to anchor. */
export function enemyNear(w: World, i: number): boolean {
  const f = w.f
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (!f.alive[j] || f.side[j] === f.side[i] || outOfFight(f.mstate[j])) continue
    const dx = f.x[j] - f.x[i]
    const dz = f.z[j] - f.z[i]
    if (dx * dx + dz * dz <= ENEMY_NEAR * ENEMY_NEAR) return true
  }
  return false
}

// what a battalion reads of the others this step (scratch): the contagion shock, its secured flanks, and the
// nearest enemy in the fight (its distance, and the unit vector from it to the battalion)
const near = { shock: 0, left: 0, right: 0, enemy: Infinity, ax: 0, az: 0 }

/**
 * Formation i's effective bar (docs/proposals/morale-bar-model.md § 4), points: its bar, plus support.bonus for each
 * secured flank, less the back exposed's drain, which takes it down to the wavering threshold at most. `flanks` is
 * its secured flanks (0..2).
 */
export function effectiveBar(w: World, i: number, flanks: number): number {
  const f = w.f
  const M = w.cr.rs.morale
  const e0 = f.bar[i] + M.support.bonus * flanks
  return e0 - Math.min(f.drain[i], Math.max(0, e0 - M.wavering[0] * f.barMax[i]))
}
/**
 * Formation i's effective bar as a share of its maximum, for the page: 0 at the rout, 1 full; with the flanks its
 * last morale step secured.
 */
export function moraleShare(w: World, i: number): number {
  return effectiveBar(w, i, w.f.flanks[i]) / w.f.barMax[i]
}

// step 12 for battalion i, after its casualties (`lost`, step 11)
export function moraleStep(w: World, i: number, lost: number): void {
  const f = w.f
  const M = w.cr.rs.morale
  const now = w.meta[M_TICK] + 1
  const start = Math.max(1, f.startMen[i])
  // losses (§ 3): each man costs loss / start points, never recovered
  const c = (lost * M.loss) / start
  f.bar[i] -= c
  f.cost[i] += c
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
  // recovery (§ 3): in the fight, up to its maximum less what its losses cost (scar of it)
  if (s !== MS_ROUTING && s !== MS_RALLYING) {
    const ceiling = f.barMax[i] - M.scar * f.cost[i]
    if (f.bar[i] < ceiling) f.bar[i] = Math.min(ceiling, f.bar[i] + M.regen * DT)
  }
  if (s !== MS_ROUTING) f.bar[i] -= near.shock + owedShock // routing and shattered (returned above) are not shocked
  f.flanks[i] = near.left + near.right
  const e = effectiveBar(w, i, f.flanks[i])
  const m = e / f.barMax[i]
  if (s === MS_ROUTING) {
    if (men < M.shatter * f.startMen[i]) f.mstate[i] = MS_SHATTERED
    // its run has ended (a run was made, and it is not running: a full order pool can leave a router
    // unmoved where it broke, which is not the end of a run)
    else if (
      f.runs[i] > 0 &&
      f.routPhase[i] !== RP_RUNNING &&
      now - f.lastLoss[i] >= M.rally.calm * TICK_HZ &&
      near.enemy > M.rally.safe
    ) {
      rally(w, i, now)
      return
    }
    routStep(w, i)
    return
  }
  if (e <= 0) {
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
}

const wt = new Float64Array(3)
/**
 * The drain enemy e presses on battalion j's morale target (docs/proposals/sectors-model.md § 6): flank × drain.flank
 * + rear × drain.rear, the weights (front, flank, rear) of e's company nearest j on j's face, if e can hurt j; else 0.
 * It can when it is in the fight, not in melee and not changing shape, its company and j's nearest (centre to
 * centre; ties to the lower) are within sectors.reach metres, and either it fires from its shape and that company
 * has j's in its arc and range, in sight, unscreened (a ray of three clear of j's friends for musketry, all three for
 * a battery), or it can charge now (from its shape, not blown) within melee.refuge.alert metres, its centre ray clear.
 * G must be this tick's geometry and faces.
 */
export function drainBy(w: World, G: FireGeo, e: number, j: number): number {
  const f = w.f
  const CS = w.cr.maxC
  if (!f.alive[e] || f.side[e] === f.side[j] || outOfFight(f.mstate[e]) || f.foe[e] || f.trans[e]) return 0
  // the blocks of each reach G.reach from its anchor
  const ax = f.x[e] - f.x[j]
  const az = f.z[e] - f.z[j]
  const reach = w.cr.rs.sectors.reach
  if (Math.sqrt(ax * ax + az * az) - G.reach[e] - G.reach[j] > reach) return 0
  let ke = -1
  let kj = -1
  let d2 = Infinity
  for (let p = 0, Ce = typeOf(w, e).C; p < Ce; p++) {
    const k = e * CS + p
    if (f.men[k] <= 0) continue
    for (let q = 0, Cj = typeOf(w, j).C; q < Cj; q++) {
      const m = j * CS + q
      if (f.men[m] <= 0) continue
      const dd = sqDist(G, k, m)
      if (dd < d2) {
        d2 = dd
        ke = k
        kj = m
      }
    }
  }
  if (ke < 0 || d2 > reach * reach) return 0
  threatWeights(w, G, j, e, ke, wt)
  const D = w.cr.rs.morale.drain
  const press = wt[1] * D.flank + wt[2] * D.rear
  if (press <= 0) return 0
  const U = typeOf(w, e)
  const shape = f.shape[e]
  if (U.def.fires || U.artillery?.from[shape]) {
    const share = () => screenShare(w, G, ke, kj, f.side[j])
    if (
      inArc(G, ke, G.cx[kj], G.cz[kj], reachOf(w, e)) &&
      sees(w, G, ke, kj) &&
      (U.artillery ? share() === 1 : share() > 0)
    ) {
      return press
    }
  }
  if (
    U.charge?.from[shape] &&
    f.blownUntil[e] <= w.meta[M_TICK] + 1 &&
    d2 <= w.cr.rs.melee.refuge.alert * w.cr.rs.melee.refuge.alert &&
    screenShare(w, G, ke, kj, f.side[j], true) === 1
  ) {
    return press
  }
  return 0
}
/**
 * Step 12's threats (docs/proposals/sectors-model.md § 6): each battalion's drain, the worst of the enemies that can
 * hurt it (`drainBy`), into the world's scratch, from the state as the casualties left it and before any battalion's
 * morale changes, so the order they are visited in changes nothing. A battalion out of the fight has none. The
 * geometry is the tick's when the fire step built one (its faces rebuilt for the men now standing), else built here.
 */
export function threatPass(w: World): void {
  const f = w.f
  const N = MAX_FORMATIONS
  const D = f.drain
  D.fill(0)
  let any = false
  for (let j = 0; j < N && !any; j++) if (f.alive[j] && !outOfFight(f.mstate[j]) && enemyNear(w, j)) any = true
  if (!any) return
  const tick = w.meta[M_TICK] + 1
  let G: FireGeo
  if (w.scratch.fireGeoTick === tick) {
    G = w.scratch.fireGeo!
    buildFaces(w, G)
  } else {
    G = blockGeometry(w)
    w.scratch.fireGeoTick = tick
  }
  for (let j = 0; j < N; j++) {
    if (!f.alive[j] || outOfFight(f.mstate[j])) continue
    for (let e = 0; e < N; e++) D[j] = Math.max(D[j], drainBy(w, G, e, j))
  }
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
 * impassable ground or by others, it tries the fan's next direction every RETRY ticks; otherwise it got where it was
 * going (or as near as it could) and has fled.
 */
function routStep(w: World, i: number): void {
  const f = w.f
  if (f.routPhase[i] === RP_RUNNING && f.status[i] === ST_BLOCKED && f.blockedFor[i] > HELD) {
    clearOrders(w, i)
    f.routPhase[i] = RP_HALTED
  }
  if (f.routPhase[i] === RP_RUNNING && f.ordHead[i] < 0) {
    f.routPhase[i] = f.status[i] === ST_HALTED ? RP_HALTED : RP_FLED
  }
  if (
    f.routPhase[i] === RP_HALTED &&
    (f.runs[i] < FAN.length || (w.claims && enemyNear(w, i))) &&
    (w.meta[M_TICK] + 1 + i) % RETRY === 0
  ) {
    run(w, i)
  }
}
/**
 * Router i's next run: the stored direction turned by the fan's angle (in turn, past its last with claims), at the
 * rout pace, with a Face about first where the shape allows and the way is behind it. The run's order is made first;
 * if the pool has none, nothing changes (the same direction is tried at the next retry).
 */
function run(w: World, i: number): void {
  const f = w.f
  const a = FAN[f.runs[i] % FAN.length]
  const ca = cos(a)
  const sa = sin(a)
  const dx = f.routX[i] * ca + f.routZ[i] * sa
  const dz = -f.routX[i] * sa + f.routZ[i] * ca
  const n = allocOrder(w, O_MOVE)
  if (n < 0) return
  // past the fan's last (with claims), the count stays at FAN.length or more and wraps before its byte does
  f.runs[i] = f.runs[i] + 1 < 2 * FAN.length ? f.runs[i] + 1 : FAN.length
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
// a router rallies where it stands (docs/proposals/morale-bar-model.md § 6): what its losses cost is written off, its
// maximum is cut by rally.cut for the battle, so it comes back brittle, and its bar refills to rally.share of it; it
// re-forms for rally.time before it takes orders again
function rally(w: World, i: number, now: number): void {
  const f = w.f
  const M = w.cr.rs.morale
  clearOrders(w, i)
  f.status[i] = 0
  f.blockedFor[i] = 0
  f.routPhase[i] = RP_NONE
  f.barMax[i] *= 1 - M.rally.cut
  f.bar[i] = M.rally.share * f.barMax[i]
  f.cost[i] = 0
  f.mstate[i] = MS_RALLYING
  f.since[i] = now
}
/**
 * A new formation (docs/proposals/morale-bar-model.md § 2): at `level` (1..6), with its level's points; its bar full
 * at `bar` points, or its level's bar when `bar` is not given; steady.
 */
export function spawnMorale(w: World, i: number, level: number, bar?: number): void {
  const f = w.f
  const L = w.cr.rs.levels[level - 1]
  f.level[i] = level
  f.drill[i] = L.drill
  f.pts[i] = L.points
  f.up[i] = 0
  f.barMax[i] = bar ?? L.bar
  f.bar[i] = f.barMax[i]
  f.cost[i] = 0
  f.drain[i] = 0
  f.flanks[i] = 0
  f.mstate[i] = MS_STEADY
  f.startMen[i] = menOf(w, i)
  f.brokeTick[i] = -1
  f.lastLoss[i] = 0
  f.since[i] = 0
  f.routs[i] = 0
}
