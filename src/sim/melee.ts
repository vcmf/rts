// Charges, melee and the square against cavalry (docs/systems/melee.md; docs/plans/active/s1d2-charges.md;
// docs/proposals/sim-design.md §9, §12). A charge is an order (O_CHARGE) that steers at its target in the
// move code, at the approach pace and then the gallop; this step reads the positions after movement:
// - the gap to the target (the least separating-axis distance between their company blocks);
// - at `charge.test` metres, once, the target's morale shock and, against a braced target (a square, or one
//   forming), the charger's chance to turn away;
// - at contact, the impact: losses and a shock by momentum and the side the charge comes from, both cut by
//   how far the target is braced; then a recoil (straight away from the target) or melee;
// - melee: losses each tick between companies in contact, until one side is out of the fight or out of
//   contact; cavalry then pursues the broken foe for a while, and is blown.
// The standing behaviour (step 4): a battalion with a refuge shape forms it against charging cavalry, holds
// it while the threat lasts, and forms back.
//
// Everything a formation reads of another was fixed before the step: positions after movement, men, morale
// states, shapes, and the melee pairs as the step began. A formation writes only its own state, owed men (whole
// numbers, so the order of the adding does not matter) and the shock it sends, which each receiver sums over
// its attackers in slot order. The draws are keyed by tick, formation and purpose. Orders come from the shared
// pool in visiting order, as routs' do (tick.ts).
import {
  type World,
  M_TICK,
  M_SEED,
  MAX_FORMATIONS,
  O_CHARGE,
  O_FACE,
  O_MOVE,
  CH_NONE,
  CH_CLOSING,
  CH_TESTED,
  CH_PURSUIT,
  MS_WAVERING,
  outOfFight,
  formationSlot as slotOf,
  formationHandle as handleOf,
  typeOf,
} from './world.ts'
import {
  allocOrder,
  appendOrder,
  clearOrders,
  shiftOrder,
  ordersFree,
  setOnMap,
  layoutOf,
  changeProgress,
  startChange,
  targetShape,
  inClashPair,
  stepWhole,
} from './formation.ts'
import { claimFormation } from './claims.ts'
import { blockGeometry, oweByMen, type FireGeo } from './fire.ts'
import { MAX_COMPANIES } from './ruleset.ts'
import { keyedStream, nextUnit } from './rng.ts'
import { sin, cos } from './num.ts'
import { TICK_HZ, DT } from './time.ts'

const sqrt = Math.sqrt
// keyed draws: purpose tags
const K_TEST = 11
const K_REFUSE = 12
const K_BREACH = 13
const K_IMPACT = 14
const K_RECOIL = 15
const K_MELEE = 16
export const Q_FRONT = 0
export const Q_FLANK = 1
export const Q_REAR = 2 // the side a charge comes from, in the target's frame
const COS45 = Math.SQRT1_2
// a charge whose gap has not been measured yet (the melee step measures it after the first movement)
export const GAP_UNKNOWN = 1e9

// per-world scratch: the shock each attacker sends this step and to whom, the melee pairs as the step began,
// and per-company masks of the companies in contact
export interface Melee {
  shockTo: Int32Array
  shockBy: Float64Array
  foe0: Int32Array
  mi: Uint8Array
  mj: Uint8Array
  // a melee's rounds (with claims): each battalion's push on its foe this step; each battalion's last round
  // (ROUND_*) and its tick, for the bench's overlay
  push: Float64Array
  round: Uint8Array
  roundAt: Int32Array
  roundGen: Int32Array // the generation of the formation in the slot at its last round
}
const ks = new Uint32Array(4)
const scratchOf = (w: World): Melee =>
  w.scratch.melee ??
  (w.scratch.melee = {
    shockTo: new Int32Array(MAX_FORMATIONS),
    shockBy: new Float64Array(MAX_FORMATIONS),
    foe0: new Int32Array(MAX_FORMATIONS),
    mi: new Uint8Array(MAX_COMPANIES),
    mj: new Uint8Array(MAX_COMPANIES),
    push: new Float64Array(MAX_FORMATIONS),
    round: new Uint8Array(MAX_FORMATIONS),
    roundAt: new Int32Array(MAX_FORMATIONS).fill(-1),
    roundGen: new Int32Array(MAX_FORMATIONS),
  })

/* ---------------- geometry ---------------- */
// the separating-axis distance between company k of battalion i and company m of battalion j (their blocks'
// rectangles): exact face to face, short of the true distance corner to corner, 0 when they overlap
function sep(G: FireGeo, i: number, k: number, j: number, m: number): number {
  const ai = G.bx[i]
  const bi = (G.bz1[i] - G.bz0[i]) / 2
  const aj = G.bx[j]
  const bj = (G.bz1[j] - G.bz0[j]) / 2
  const dx = G.cx[m] - G.cx[k]
  const dz = G.cz[m] - G.cz[k]
  let s = 0
  // the four axes: each block's across (ca, sa) and along (−sa, ca)
  for (let n = 0; n < 4; n++) {
    const q = n < 2 ? k : m
    const nx = n % 2 ? -G.sa[q] : G.ca[q]
    const nz = n % 2 ? G.ca[q] : G.sa[q]
    const ri = ai * Math.abs(G.ca[k] * nx + G.sa[k] * nz) + bi * Math.abs(-G.sa[k] * nx + G.ca[k] * nz)
    const rj = aj * Math.abs(G.ca[m] * nx + G.sa[m] * nz) + bj * Math.abs(-G.sa[m] * nx + G.ca[m] * nz)
    const d = Math.abs(dx * nx + dz * nz) - ri - rj
    if (d > s) s = d
  }
  return s
}
// the gap between battalions i and j: the least separation of any company of one from any of the other (with men)
function gapOf(w: World, G: FireGeo, i: number, j: number): number {
  const f = w.f
  const CS = w.cr.maxC
  const Ci = typeOf(w, i).C
  const Cj = typeOf(w, j).C
  let g = Infinity
  for (let c = 0; c < Ci; c++) {
    const k = i * CS + c
    if (f.men[k] <= 0) continue
    for (let q = 0; q < Cj; q++) {
      const m = j * CS + q
      if (f.men[m] > 0) g = Math.min(g, sep(G, i, k, j, m))
    }
  }
  return g
}
// the men of battalion i's companies within `lim` of any company of j, each such company marked in `mask`
function inContact(w: World, G: FireGeo, i: number, j: number, lim: number, mask: Uint8Array): number {
  const f = w.f
  const CS = w.cr.maxC
  const Ci = typeOf(w, i).C
  const Cj = typeOf(w, j).C
  let men = 0
  for (let c = 0; c < Ci; c++) {
    const k = i * CS + c
    mask[c] = 0
    if (f.men[k] <= 0) continue
    for (let q = 0; q < Cj; q++) {
      const m = j * CS + q
      if (f.men[m] > 0 && sep(G, i, k, j, m) <= lim) {
        mask[c] = 1
        men += f.men[k]
        break
      }
    }
  }
  return men
}
// the side of battalion j that a charge from battalion i strikes: from j's centre (its companies' with men) to
// i's, within 45° of j's facing is its front, beyond 135° its rear, else a flank. A battalion changing shape has
// no front: its companies are on the move, and it is struck as in the flank
function quarter(w: World, G: FireGeo, i: number, j: number): number {
  const f = w.f
  const CS = w.cr.maxC
  const C = typeOf(w, j).C
  let x = 0
  let z = 0
  let n = 0
  for (let q = 0; q < C; q++) {
    const m = j * CS + q
    if (f.men[m] > 0) {
      x += G.cx[m]
      z += G.cz[m]
      n++
    }
  }
  if (!n) return Q_FRONT
  const dx = f.x[i] - x / n
  const dz = f.z[i] - z / n
  const d = sqrt(dx * dx + dz * dz)
  const along = dx * sin(f.heading[j]) + dz * cos(f.heading[j])
  return along >= d * COS45 ? (f.trans[j] ? Q_FLANK : Q_FRONT) : along <= -d * COS45 ? Q_REAR : Q_FLANK
}
const bySide = (q: { front: number; flank: number; rear: number }, s: number): number =>
  s === Q_FRONT ? q.front : s === Q_FLANK ? q.flank : q.rear

// how far battalion i stands in a shape proof against a charge from any side (0..1): during a change into one,
// the change's progress; out of one, 1 less it
export function bracedOf(w: World, i: number): number {
  const f = w.f
  const U = typeOf(w, i)
  const from = U.shapes[f.shape[i]].def.braced ? 1 : 0
  if (!f.trans[i]) return from
  const to = U.shapes[f.tShape[i]].def.braced ? 1 : 0
  return from + (to - from) * changeProgress(w, i, w.meta[M_TICK] * DT)
}
// battalion i's strength in melee: its kind's, less its disorder's share (all of it while changing shape), by its
// morale state
function strengthOf(w: World, i: number): number {
  const f = w.f
  return (
    w.cr.strengthByKind[layoutOf(w, i).kind] *
    (1 - w.cr.rs.melee.cohesion * (f.trans[i] ? 1 : f.disorder[i])) *
    w.cr.stateFactor[Math.min(2, f.mstate[i])]
  )
}
// λ men owed to battalion j's companies marked in `mask`: the whole part certain, a draw for the fraction, each
// man to a marked company weighted by its men (as a volley's hits: oweByMen)
function owe(w: World, j: number, mask: Uint8Array, lambda: number, rs: Uint32Array): void {
  if (!(lambda > 0)) return
  let n = Math.floor(lambda)
  if (nextUnit(rs) < lambda - n) n++
  if (n) oweByMen(w, j, mask, n, rs)
}

// the gap between battalions i and j, and the side of j that a charge from i would strike, as they stand (tests,
// debugging: each rebuilds the block geometry)
export const gapBetween = (w: World, i: number, j: number): number => gapOf(w, blockGeometry(w), i, j)
export const sideStruck = (w: World, i: number, j: number): number => quarter(w, blockGeometry(w), i, j)

/* ---------------- step 10: charges and melee ---------------- */
/**
 * Step 10, charges and melee: each charge's test, impact or recoil; each melee's strikes; the battalions struck while
 * not in melee engaged; the shocks owed. With claims (`w.claims`), then a melee's rounds (`rounds`), the formations
 * moved in `order`, the tick's keyed order of the formations (`claimOrder`, the formation step's); without, `order` is
 * not read.
 */
export function meleeStep(w: World, order: readonly number[]): void {
  const f = w.f
  const N = MAX_FORMATIONS
  let any = false
  for (let i = 0; i < N && !any; i++) if (f.alive[i] && (f.chPhase[i] || f.foe[i])) any = true
  if (!any) return
  const tick = w.meta[M_TICK] + 1
  const rev = w.scratch.reverse === true
  // the fire step's geometry when it built one this tick (positions do not change between steps 8 and 10; a step
  // between them that moves formations must rebuild it and stamp fireGeoTick again)
  const S = scratchOf(w)
  const G = w.scratch.fireGeoTick === tick ? w.scratch.fireGeo! : blockGeometry(w)
  S.shockTo.fill(-1)
  S.shockBy.fill(0)
  for (let n = 0; n < N; n++) {
    const i = rev ? N - 1 - n : n
    if (f.alive[i] && f.chPhase[i]) chargeStep(w, G, S, i, tick)
  }
  S.foe0.set(f.foe)
  S.push.fill(0)
  for (let n = 0; n < N; n++) {
    const i = rev ? N - 1 - n : n
    if (f.alive[i] && S.foe0[i]) meleePair(w, G, S, i, tick)
  }
  // a battalion struck while not in melee takes on its lowest-slot attacker; it stands while it fights
  for (let i = 0; i < N; i++) {
    if (!f.alive[i] || !f.foe[i]) continue
    const j = slotOf(w, f.foe[i])
    if (j >= 0 && !f.foe[j] && !outOfFight(f.mstate[j])) engage(w, j, i)
  }
  // the shocks, added to each receiver in its attackers' slot order
  for (let i = 0; i < N; i++) if (S.shockTo[i] >= 0) f.shockIn[S.shockTo[i]] += S.shockBy[i]
  if (w.claims) rounds(w, G, S, order, tick)
}

// battalion i leaves its melee with j: the pairing ends both ways (j, left without a foe, takes on another of its
// attackers at the end of the step, if it has one). j's own strikes this step read the pairs as the step began
function leave(w: World, i: number, j: number): void {
  const f = w.f
  f.foe[i] = 0
  if (j >= 0 && f.foe[j] === handleOf(w, i)) f.foe[j] = 0
}
// battalion j is in melee with i: any charge of its own ends; its other orders are kept for after the melee (in melee
// it stands, formation.ts)
function engage(w: World, j: number, i: number): void {
  const f = w.f
  if (f.ordHead[j] >= 0 && w.ord.type[f.ordHead[j]] === O_CHARGE) shiftOrder(w, j)
  f.foe[j] = handleOf(w, i)
  f.vx[j] = 0
  f.vz[j] = 0
  f.status[j] = 0
  f.blockedFor[j] = 0
  if (f.chPhase[j]) {
    f.chPhase[j] = CH_NONE
    f.chTarget[j] = 0
    f.chRun[j] = 0
  }
}
// a charge ends: blown for charge.rest if it galloped or met its target
function endCharge(w: World, i: number, tick: number, blown: boolean): void {
  const f = w.f
  f.chPhase[i] = CH_NONE
  f.chTarget[i] = 0
  f.chRun[i] = 0
  f.chGap[i] = 0
  f.chUntil[i] = 0
  if (blown) f.blownUntil[i] = tick + Math.round(typeOf(w, i).def.charge!.rest * TICK_HZ)
}
// the charger turns away from battalion j: it rides charge.recoil metres straight away from it (kept on the map),
// with a Face about first when the shape allows and the way is behind it (optional: if it fails, it rides as it
// stands), when the pool has room; and it is blown
function recoil(w: World, i: number, j: number, tick: number): void {
  const f = w.f
  const metres = typeOf(w, i).def.charge!.recoil
  clearOrders(w, i)
  endCharge(w, i, tick, true)
  let dx = f.x[i] - f.x[j]
  let dz = f.z[i] - f.z[j]
  const d = sqrt(dx * dx + dz * dz)
  if (d > 1e-6) {
    dx /= d
    dz /= d
  } else {
    dx = -sin(f.heading[i])
    dz = -cos(f.heading[i])
  }
  const back = dx * sin(f.heading[i]) + dz * cos(f.heading[i]) < 0
  if (ordersFree(w) < (back ? 2 : 1)) return
  if (back && layoutOf(w, i).turn) {
    const k = allocOrder(w, O_FACE)
    w.ord.optional[k] = 1
    appendOrder(w, i, k)
  }
  const n = allocOrder(w, O_MOVE)
  setOnMap(w, n, f.x[i] + dx * metres, f.z[i] + dz * metres)
  w.ord.resolved[n] = 1
  appendOrder(w, i, n)
  f.status[i] = 0
  f.blockedFor[i] = 0
}
// pursuing a broken foe at the gallop for charge.pursue seconds (when the pool has room; else blown at once)
function pursue(w: World, i: number, j: number, tick: number): void {
  const f = w.f
  clearOrders(w, i)
  f.foe[i] = 0
  if (ordersFree(w) < 1) {
    endCharge(w, i, tick, true)
    return
  }
  appendOrder(w, i, allocOrder(w, O_CHARGE))
  f.chTarget[i] = handleOf(w, j)
  f.chPhase[i] = CH_PURSUIT
  f.chUntil[i] = tick + Math.round(typeOf(w, i).def.charge!.pursue * TICK_HZ)
  f.status[i] = 0
  f.blockedFor[i] = 0
}

function chargeStep(w: World, G: FireGeo, S: Melee, i: number, tick: number): void {
  const f = w.f
  const M = w.cr.rs.melee
  const ch = typeOf(w, i).def.charge!
  const head = f.ordHead[i]
  const seed = w.meta[M_SEED]
  const h = handleOf(w, i)
  const j = slotOf(w, f.chTarget[i])
  // called off (another order replaced it), or its target is gone
  if (head < 0 || w.ord.type[head] !== O_CHARGE || j < 0) {
    if (head >= 0 && w.ord.type[head] === O_CHARGE) clearOrders(w, i)
    endCharge(w, i, tick, f.chRun[i] > 0 || f.chPhase[i] === CH_PURSUIT)
    return
  }
  // the gallop's metres
  if (f.chPhase[i] === CH_PURSUIT || f.chGap[i] <= ch.gallopAt) {
    f.chRun[i] += sqrt(f.vx[i] * f.vx[i] + f.vz[i] * f.vz[i]) * DT
  }
  const gap = gapOf(w, G, i, j)
  f.chGap[i] = gap
  if (f.chPhase[i] === CH_PURSUIT) {
    if (tick >= f.chUntil[i]) {
      clearOrders(w, i)
      endCharge(w, i, tick, true)
      return
    }
    // riding down the router: it does not fight back
    if (gap <= M.contact + M.hold) {
      const men = inContact(w, G, i, j, M.contact + M.hold, S.mi)
      inContact(w, G, j, i, M.contact + M.hold, S.mj)
      owe(w, j, S.mj, M.rate * DT * men * strengthOf(w, i), keyedStream(ks, seed, tick, h, j, K_MELEE))
    }
    return
  }
  // the target broke before contact: ride it down
  if (outOfFight(f.mstate[j])) {
    f.chPhase[i] = CH_PURSUIT
    f.chUntil[i] = tick + Math.round(ch.pursue * TICK_HZ)
    return
  }
  const b = bracedOf(w, j)
  const side = quarter(w, G, i, j)
  // the test before contact, once (a charge launched inside the test's distance takes it at once)
  if (f.chPhase[i] === CH_CLOSING && gap <= ch.test) {
    f.chPhase[i] = CH_TESTED
    S.shockTo[i] = j
    S.shockBy[i] += bySide(M.threat, side) * (1 - b) * (0.5 + nextUnit(keyedStream(ks, seed, tick, h, j, K_TEST)))
    if (
      b > 0 &&
      nextUnit(keyedStream(ks, seed, tick, h, j, K_REFUSE)) < M.refuse * b * (f.mstate[j] >= MS_WAVERING ? 0.5 : 1)
    ) {
      recoil(w, i, j, tick)
      return
    }
  }
  if (gap > M.contact) return
  // the impact: a wavering braced target may be broken into
  const bb =
    b > 0 && f.mstate[j] >= MS_WAVERING && nextUnit(keyedStream(ks, seed, tick, h, j, K_BREACH)) < M.breach ? 0 : b
  const mom = Math.min(1, f.chRun[i] / ch.build)
  const men = inContact(w, G, i, j, M.contact, S.mi)
  inContact(w, G, j, i, M.contact, S.mj)
  owe(w, j, S.mj, M.impact.kill * mom * men * (1 - bb), keyedStream(ks, seed, tick, h, j, K_IMPACT))
  S.shockTo[i] = j
  S.shockBy[i] += bySide(M.impact.shock, side) * mom * (1 - bb)
  if (nextUnit(keyedStream(ks, seed, tick, h, j, K_RECOIL)) < bb) {
    recoil(w, i, j, tick)
    return
  }
  clearOrders(w, i)
  endCharge(w, i, tick, true)
  f.foe[i] = handleOf(w, j)
  f.vx[i] = 0
  f.vz[i] = 0
  f.status[i] = 0
  f.blockedFor[i] = 0
}

// one side of a melee: battalion i strikes its foe and every enemy whose foe it is (as the step began), with the
// men of its companies in contact with each; it leaves the melee when either side is out of the fight or gone,
// or they are out of contact. A charging type that saw its foe break pursues it; one whose foe has finished
// forming square and holds it recoils
function meleePair(w: World, G: FireGeo, S: Melee, i: number, tick: number): void {
  const f = w.f
  const M = w.cr.rs.melee
  const seed = w.meta[M_SEED]
  const h = handleOf(w, i)
  const lim = M.contact + M.hold
  const j = slotOf(w, S.foe0[i])
  if (outOfFight(f.mstate[i])) {
    leave(w, i, j)
    return
  }
  if (j < 0 || outOfFight(f.mstate[j])) {
    leave(w, i, j)
    if (j >= 0 && typeOf(w, i).charge) pursue(w, i, j, tick)
    return
  }
  if (gapOf(w, G, i, j) > lim) {
    leave(w, i, j)
    return
  }
  // a charging type does not press a foe that has formed its refuge (a square) and holds it: it turns away. One
  // wavering or worse is pressed (it was broken into, or will be)
  if (typeOf(w, i).charge && bracedOf(w, j) >= 1 && f.mstate[j] < MS_WAVERING) {
    leave(w, i, j)
    recoil(w, i, j, tick)
    return
  }
  const strike = (e: number) => {
    const men = inContact(w, G, i, e, lim, S.mi)
    inContact(w, G, e, i, lim, S.mj)
    const lambda = M.rate * DT * men * strengthOf(w, i)
    // a round's push: the losses it owes its foe, as expected, times its nerve
    if (e === j && w.claims) S.push[i] = lambda * Math.max(0, f.morale[i])
    owe(w, e, S.mj, lambda, keyedStream(ks, seed, tick, h, e, K_MELEE))
  }
  strike(j)
  for (let e = 0; e < MAX_FORMATIONS; e++) {
    if (e !== j && f.alive[e] && S.foe0[e] === h && !outOfFight(f.mstate[e])) strike(e)
  }
}

/* ---------------- step 10, with claims: a melee's rounds ---------------- */
// The claim grid's prototype (docs/plans/active/c1-claims.md, step 4; the collision proposal's § Contact, on its own
// branch): a pair in melee (each the other's foe, both formed, one ahead of the other) is judged every ROUND seconds,
// staggered by the pair's lower handle, from its pushes this tick, a push being the losses a strike owes its foe
// times the striker's morale. One losing by more than PRESS of the two steps back STEP metres as one rigid move,
// granted whole or not at all, and its foe follows by the same displacement. If the foe cannot follow (another enemy
// fighting it, or its move is refused), the loser's step alone ends their melee. A loser that cannot step back
// (refused, or a second enemy on its flank or rear) is pinned: a shock to its morale.
/** Seconds between a pair's rounds. */
export const ROUND = 3
const STEP = 2 // m
const PRESS = 0.05 // the share of the two pushes a loser falls short by
const PINNED = 0.15 // morale shock of a loser that cannot step back
/** A battalion's last round (Melee.round): it stepped back, followed, was pinned, or fell back out of the melee. */
export const ROUND_STEPPED = 1
export const ROUND_FOLLOWED = 2
export const ROUND_PINNED = 3
export const ROUND_FELL_BACK = 4

// a pair's judgement this tick: the losers, each one's winner and the step's direction (a unit vector)
const judged: number[] = []
const jWin = new Int32Array(MAX_FORMATIONS)
const jX = new Float64Array(MAX_FORMATIONS)
const jZ = new Float64Array(MAX_FORMATIONS)
const jPin = new Uint8Array(MAX_FORMATIONS)

/**
 * The rounds due at tick `tick`, at the end of the melee step (G: its block geometry; `order`: the tick's keyed order
 * of the formations, `claimOrder`): every pair due is judged from this step's pushes and geometry, then each round is
 * played in that order.
 */
function rounds(w: World, G: FireGeo, S: Melee, order: readonly number[], tick: number): void {
  judged.length = 0
  for (const i of order) if (judge(w, G, S, i, tick)) judged.push(i)
  if (!judged.length) return
  for (const i of judged) play(w, S, i, tick)
  // formations moved: the step's geometry no longer holds this tick's positions
  w.scratch.fireGeoTick = -1
}

/**
 * Whether battalion i loses a round at tick `tick`: in a pair since the step began, due this tick (a pair's rounds
 * fall every ROUND seconds, at a phase drawn from its lower handle), its push short of its foe's by more than PRESS
 * of the two, one of them ahead of the other. If so, records its winner, the step's direction and whether a second
 * enemy on its flank or rear pins it.
 */
function judge(w: World, G: FireGeo, S: Melee, i: number, tick: number): boolean {
  const f = w.f
  if (!f.alive[i] || !f.foe[i] || S.foe0[i] !== f.foe[i]) return false
  const j = slotOf(w, f.foe[i])
  if (j < 0 || S.foe0[j] !== handleOf(w, i)) return false
  const per = Math.round(ROUND * TICK_HZ)
  if ((tick + phaseOf(Math.min(handleOf(w, i), handleOf(w, j)), per)) % per !== 0) return false
  const on = S.push[j]
  const by = S.push[i]
  if (!(on + by > 0) || (on - by) / (on + by) <= PRESS || !inClashPair(w, i)) return false
  // along the winner's heading if the loser stands ahead of it, else to the loser's rear if the winner stands ahead
  // of the loser; neither (flank to flank): no round
  if (aheadOf(w, G, j, i)) {
    jX[i] = sin(f.heading[j])
    jZ[i] = cos(f.heading[j])
  } else if (aheadOf(w, G, i, j)) {
    jX[i] = -sin(f.heading[i])
    jZ[i] = -cos(f.heading[i])
  } else return false
  jWin[i] = j
  jPin[i] = attackedBesides(w, G, i, j, true) >= 0 ? 1 : 0
  return true
}
// a pair's phase in its round of `per` ticks, from its lower handle: an integer hash, so pairs in nearby slots fall on
// different ticks
const phaseOf = (h: number, per: number): number => (Math.imul(h, 0x9e3779b1) >>> 0) % per

/**
 * Plays the round battalion i lost at tick `tick` (`judge`): pinned, a morale shock; else it steps back, and its
 * winner follows if no other enemy is fighting it. A step the winner cannot follow leaves the two further apart, still
 * in melee until the gap passes contact and hold (`meleePair`).
 */
function play(w: World, S: Melee, i: number, tick: number): void {
  const f = w.f
  const j = jWin[i]
  mark(w, S, j, 0, tick)
  if (jPin[i] || !stepWhole(w, i, jX[i] * STEP, jZ[i] * STEP, j)) {
    f.shockIn[i] += PINNED
    mark(w, S, i, ROUND_PINNED, tick)
    return
  }
  claimFormation(w, i)
  if (!attackedBy(w, j, i) && stepWhole(w, j, jX[i] * STEP, jZ[i] * STEP, i)) {
    claimFormation(w, j)
    mark(w, S, i, ROUND_STEPPED, tick)
    mark(w, S, j, ROUND_FOLLOWED, tick)
  } else mark(w, S, i, ROUND_FELL_BACK, tick)
}
// battalion i's last round, for the overlay
function mark(w: World, S: Melee, i: number, r: number, tick: number): void {
  S.round[i] = r
  S.roundAt[i] = tick
  S.roundGen[i] = w.f.gen[i]
}

/**
 * Whether battalion b stands ahead of battalion a: its companies' centre (by men) beyond a's front line (a's anchor,
 * across its heading), and its companies' span across a's heading overlapping a's (G: the step's block geometry, each
 * block projected as it lies).
 */
function aheadOf(w: World, G: FireGeo, a: number, b: number): boolean {
  const f = w.f
  const fx = sin(f.heading[a])
  const fz = cos(f.heading[a])
  spanAcross(w, G, a, a, fx, fz, span)
  const alo = span[0]
  const ahi = span[1]
  spanAcross(w, G, a, b, fx, fz, span)
  return span[3] > 0 && span[2] > 0 && span[0] < ahi && alo < span[1]
}
const span = [0, 0, 0, 0]
// battalion b's companies across battalion a's heading (fx, fz) from a's anchor, into out: the least and most of
// their blocks' extents, the sum of their centres ahead of a's front line weighted by men, and the men
function spanAcross(w: World, G: FireGeo, a: number, b: number, fx: number, fz: number, out: number[]): void {
  const f = w.f
  const CS = w.cr.maxC
  const hd = (G.bz1[b] - G.bz0[b]) / 2
  out[0] = Infinity
  out[1] = -Infinity
  out[2] = 0
  out[3] = 0
  for (let c = 0; c < typeOf(w, b).C; c++) {
    const k = b * CS + c
    if (f.men[k] <= 0) continue
    const dx = G.cx[k] - f.x[a]
    const dz = G.cz[k] - f.z[a]
    const mid = dx * fz - dz * fx
    // the block's half extent across a's heading: its frontage along its own across axis (ca, sa), its depth along
    // (−sa, ca)
    const r = G.bx[b] * Math.abs(G.ca[k] * fz - G.sa[k] * fx) + hd * Math.abs(-G.sa[k] * fz - G.ca[k] * fx)
    out[0] = Math.min(out[0], mid - r)
    out[1] = Math.max(out[1], mid + r)
    out[2] += (dx * fx + dz * fz) * f.men[k]
    out[3] += f.men[k]
  }
}

/**
 * The lowest slot of an enemy in the fight, other than j, fighting battalion i now (its foe i); with `flank`, only one
 * not ahead of i (on its flank or rear; G needed). −1 if none.
 */
function attackedBesides(w: World, G: FireGeo | null, i: number, j: number, flank: boolean): number {
  const f = w.f
  const h = handleOf(w, i)
  for (let e = 0; e < MAX_FORMATIONS; e++) {
    if (e === j || !f.alive[e] || f.foe[e] !== h || outOfFight(f.mstate[e])) continue
    if (!flank || !aheadOf(w, G!, i, e)) return e
  }
  return -1
}
// whether an enemy in the fight other than j is fighting battalion i now
const attackedBy = (w: World, i: number, j: number): boolean => attackedBesides(w, null, i, j, false) >= 0

/* ---------------- step 4: the square against cavalry ---------------- */
// an enemy in the fight of a type that charges (from `chargers`, n of them), within refuge.alert of battalion i,
// charging it, or standing or closing: anything but riding away faster than refuge.closing (a regiment at the
// halt can charge in seconds)
const chargers = new Int32Array(MAX_FORMATIONS)
function threatened(w: World, i: number, n: number): boolean {
  const f = w.f
  const Q = w.cr.rs.melee.refuge
  const h = handleOf(w, i)
  for (let k = 0; k < n; k++) {
    const j = chargers[k]
    if (f.side[j] === f.side[i]) continue
    const dx = f.x[i] - f.x[j]
    const dz = f.z[i] - f.z[j]
    const d = sqrt(dx * dx + dz * dz)
    if (d > Q.alert) continue
    if (f.chTarget[j] === h && (f.chPhase[j] === CH_CLOSING || f.chPhase[j] === CH_TESTED)) return true
    if (d > 1e-6 && f.vx[j] * dx + f.vz[j] * dz > -Q.closing * d) return true
  }
  return false
}
// any enemy charging type in the fight within refuge.alert of battalion i, whatever it is doing: a battalion does
// not form back while cavalry is still near (a recoiling regiment rides 80 m, longer than refuge.hold, and halts)
function nearby(w: World, i: number, n: number): boolean {
  const f = w.f
  const A = w.cr.rs.melee.refuge.alert
  for (let k = 0; k < n; k++) {
    const j = chargers[k]
    if (f.side[j] === f.side[i]) continue
    const dx = f.x[i] - f.x[j]
    const dz = f.z[i] - f.z[j]
    if (dx * dx + dz * dz <= A * A) return true
  }
  return false
}
// the square against cavalry: a threatened battalion forms its refuge after refuge.react seconds, and shelters in it
// (formation.ts, sheltering) while the spell lasts; when the spell is over it forms back into the shape it formed
// square from. The changes are started here, not ordered, and tried every REFUGE_RETRY ticks while they cannot be
// made (a wood, the water), so nothing piles up in the order pool
const REFUGE_RETRY = Math.round(5 * TICK_HZ) // ticks between tries of a change that cannot be made there
export function standingStep(w: World): void {
  const f = w.f
  const Q = w.cr.rs.melee.refuge
  const tick = w.meta[M_TICK] + 1
  const react = Math.round(Q.react * TICK_HZ)
  const hold = Math.round(Q.hold * TICK_HZ)
  // the charging types in the fight, once; nothing to do with none, no battalion on the alert and none to form back
  let n = 0
  let busy = false
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (!f.alive[j]) continue
    if (f.alertAt[j] || f.autoFrom[j]) busy = true
    if (typeOf(w, j).charge && !outOfFight(f.mstate[j])) chargers[n++] = j
  }
  if (!n && !busy) return
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    const U = typeOf(w, i)
    if (U.refuge < 0 || outOfFight(f.mstate[i]) || f.foe[i]) continue
    if (threatened(w, i, n)) {
      if (!f.alertAt[i] || tick - f.alertAt[i] > 1) f.alertSince[i] = tick // the threat's unbroken run began now
      if (!f.alertAt[i] || tick - f.alertAt[i] > hold) f.refugeOff[i] = 0 // a new spell of threat
      f.alertAt[i] = tick
    } else if (f.alertAt[i] && tick - f.alertAt[i] > hold && !nearby(w, i, n)) {
      // the spell is over (alertSince: the form-back's next try, now)
      f.alertAt[i] = 0
      f.alertSince[i] = 0
      f.refugeOff[i] = 0
    }
    const into = targetShape(w, i)
    if (f.alertAt[i]) {
      // in a spell: form square once the threat has run react seconds unbroken, unless a player's order stood it down
      // threatened now, unbroken for react
      if (
        f.alertAt[i] !== tick ||
        f.refugeOff[i] ||
        into === U.refuge ||
        tick - f.alertSince[i] < react ||
        (tick - f.alertSince[i] - react) % REFUGE_RETRY
      ) {
        continue
      }
      // the shape it is in, or going to, now
      if (startChange(w, i, U.refuge, true)) {
        f.autoFrom[i] = into + 1
        f.status[i] = 0
        f.blockedFor[i] = 0
      }
    } else if (f.autoFrom[i]) {
      // the spell is over: back into the shape it formed square from, as soon as the square stands formed (out of a
      // spell, alertSince holds the tick of the next try: 0 at once, REFUGE_RETRY after one that could not be made).
      // autoFrom is let go once a change into another shape has finished: the form-back's, or one an order made
      if (into !== U.refuge) {
        if (!f.trans[i]) f.autoFrom[i] = 0
        continue
      }
      if (f.trans[i] || tick < f.alertSince[i]) continue
      if (!startChange(w, i, f.autoFrom[i] - 1, true)) f.alertSince[i] = tick + REFUGE_RETRY
    }
  }
}
