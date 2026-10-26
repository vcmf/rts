// The claim grid, a prototype (docs/plans/active/c1-claims.md): other formations' cells are impassable ground for the
// formation that moves, so the footprint gate, the lag model and the change's path check keep formations apart as
// they keep men off water. On only where a scenario asks for it (`ScenarioRules.claims`); rebuilt from the positions
// at every formation step, so it is not state and no hash covers it.
import { type World, MAX_FORMATIONS, M_TICK, M_SEED, outOfFight, typeOf, formationHandle as handleOf } from './world.ts'
import { DT } from './time.ts'
import { mkPlaces, placesCtx, placeAtSlot, filledSlots, type Places } from './formation.ts'
import { keyedStream, nextU32 } from './rng.ts'
import { sin, cos, PI } from './num.ts'
import { impAt } from './terrain.ts'

// the margin round a formation's own cells, in cells (a cell is the terrain's: 2 m on the bench field)
const MARGIN = 1
const K_ORDER = 0x434c // the keyed draw that orders the formations in a tick
// a change of shape claims the ground it will sweep until it ends, sampled at this many poses ahead
const SWEEP = 6

/** Claims per cell: SLOTS entries per terrain cell (owner slot + 1, times 2, plus 1 for its core), and a mark for
 * a cell claimed by more formations than that. */
export interface Claims {
  own: Int16Array // cell k's entries at k * SLOTS .. k * SLOTS + SLOTS - 1, 0 for none
  more: Uint8Array
  // per formation, the box of the cells it claims this tick: x0, z0, x1, z1 (empty: x0 > x1)
  box: Float64Array
  ctx: Places
  // the cells one formation's men stand in, found once each (seen[k] === epoch), and their list
  seen: Int32Array
  epoch: number
  // per formation, the core cells it claimed after its last step (at list[i * maxSlots ..], count[i] of them), the
  // tick it claimed them at and its generation then: the next tick's rebuild stamps them again instead of placing
  // every man once more
  list: Int32Array
  count: Int32Array
  at: Int32Array
  gen: Int32Array
  own1: Float64Array // per formation, the box of that last claim alone
  built: number // the tick the grid was last built at (-1: never)
  // per formation, whether another's claims come near it, found once a tick (nearAt: the build it was found in)
  near: Uint8Array
  nearAt: Int32Array
  // per formation, its pose at its last claim (x, z, heading, then each company's men and each bin's lag): a
  // formation that has not moved since keeps its claim as it is
  pose: Float64Array
  // per formation, the build in which a claim last blocked it (claimHit), and whose claim it was
  hit: Int32Array
  by: Int32Array
  // while the clash moves formations: a melee pair is only two battalions each the other's foe (clashing)
  clash: boolean
}

/** The entries kept per cell before it is marked as claimed by more. */
export const SLOTS = 4

const ks = new Uint32Array(4)
const pt = [0, 0, 0]

function claimsOf(w: World): Claims {
  const n = w.terrain.n * w.terrain.n
  const c = w.scratch.claims
  if (c && c.more.length === n) return c
  return (w.scratch.claims = {
    own: new Int16Array(n * SLOTS),
    more: new Uint8Array(n),
    box: new Float64Array(MAX_FORMATIONS * 4),
    ctx: mkPlaces(w),
    seen: new Int32Array(n),
    epoch: 0,
    list: new Int32Array(MAX_FORMATIONS * w.cr.maxSlots * (SWEEP + 1)),
    count: new Int32Array(MAX_FORMATIONS),
    at: new Int32Array(MAX_FORMATIONS).fill(-1),
    gen: new Int32Array(MAX_FORMATIONS),
    own1: new Float64Array(MAX_FORMATIONS * 4),
    built: -1,
    near: new Uint8Array(MAX_FORMATIONS),
    nearAt: new Int32Array(MAX_FORMATIONS).fill(-1),
    pose: new Float64Array(MAX_FORMATIONS * (3 + w.cr.maxC + w.cr.maxNB)).fill(NaN),
    hit: new Int32Array(MAX_FORMATIONS).fill(-1),
    by: new Int32Array(MAX_FORMATIONS).fill(-1),
    clash: false,
  })
}

// claims cell k for formation i, its core or its margin (a core claim upgrades a margin one)
function claim(C: Claims, k: number, i: number, core: number): void {
  const e = (i + 1) * 2 + core
  const o = C.own
  for (let s = k * SLOTS; s < k * SLOTS + SLOTS; s++) {
    if (o[s] === 0) {
      o[s] = e
      return
    }
    if (o[s] >> 1 === i + 1) {
      o[s] |= core
      return
    }
  }
  C.more[k] = 1
}

/** Claims the cells of formation i's places as it stands: the cells its men stand in as its core, a margin round
 * them; each such cell once, however many men stand in it. */
export function claimFormation(w: World, i: number): void {
  const C = claimsOf(w)
  if (C.at[i] === C.built && C.gen[i] === w.f.gen[i] && samePose(w, C, i)) return
  const T = w.terrain
  const f = w.f
  const U = typeOf(w, i)
  const CS = w.cr.maxC
  const F = filledSlots(w, i)
  placesCtx(C.ctx, i, f.x[i], f.z[i], f.heading[i], w.meta[M_TICK] * DT, 0)
  const B = C.own1
  B.set([Infinity, Infinity, -Infinity, -Infinity], i * 4)
  const ep = ++C.epoch
  const L = i * w.cr.maxSlots * (SWEEP + 1)
  const now = w.meta[M_TICK] * DT
  // during a change of shape, the poses still to come (docs/plans/active/c1-claims.md, step 3): the ground it will
  // sweep is claimed now, so no one walks into a square half formed
  const end = f.trans[i] ? changeEnd(w, i) : now
  const poses = end > now ? SWEEP : 0
  let n = 0
  for (let p = 0; p <= poses; p++) {
    if (p > 0) placesCtx(C.ctx, i, f.x[i], f.z[i], f.heading[i], now + ((end - now) * p) / poses, 0)
    for (let k = F.at[i * (CS + 1)]; k < F.at[i * (CS + 1) + U.C]; k++) {
      placeAtSlot(C.ctx, F.s[k], pt)
      B[i * 4] = Math.min(B[i * 4], pt[0])
      B[i * 4 + 1] = Math.min(B[i * 4 + 1], pt[1])
      B[i * 4 + 2] = Math.max(B[i * 4 + 2], pt[0])
      B[i * 4 + 3] = Math.max(B[i * 4 + 3], pt[1])
      const gx = Math.round((pt[0] - T.x0) / T.cell)
      const gz = Math.round((pt[1] - T.z0) / T.cell)
      if (gx < 0 || gz < 0 || gx >= T.n || gz >= T.n) continue
      const c = gz * T.n + gx
      if (C.seen[c] === ep) continue
      C.seen[c] = ep
      C.list[L + n++] = c
    }
  }
  C.count[i] = n
  C.at[i] = C.built
  C.gen[i] = f.gen[i]
  stamp(w, C, i)
  samePose(w, C, i, true)
}

// when formation i's change of shape ends: its last company's delay and the change's duration past its start
function changeEnd(w: World, i: number): number {
  const f = w.f
  const CS = w.cr.maxC
  let d = 0
  for (let c = 0; c < typeOf(w, i).C; c++) d = Math.max(d, f.tDelay[i * CS + c])
  return f.tStart[i] + d + f.tDur[i]
}

// whether formation i stands as it did at its last claim: not changing shape, the same anchor, heading, men and lags
// (with `set`, records its pose as it stands now)
function samePose(w: World, C: Claims, i: number, set = false): boolean {
  const f = w.f
  const CS = w.cr.maxC
  const NB = w.cr.maxNB
  const P = C.pose
  const o = i * (3 + CS + NB)
  if (set) {
    P[o] = f.trans[i] ? NaN : f.x[i]
    P[o + 1] = f.z[i]
    P[o + 2] = f.heading[i]
    for (let c = 0; c < CS; c++) P[o + 3 + c] = f.men[i * CS + c]
    for (let b = 0; b < NB; b++) P[o + 3 + CS + b] = f.lags[i * NB + b]
    return true
  }
  if (f.trans[i] || P[o] !== f.x[i] || P[o + 1] !== f.z[i] || P[o + 2] !== f.heading[i]) return false
  for (let c = 0; c < CS; c++) if (P[o + 3 + c] !== f.men[i * CS + c]) return false
  for (let b = 0; b < NB; b++) if (P[o + 3 + CS + b] !== f.lags[i * NB + b]) return false
  return true
}

// stamps formation i's listed core cells, and a margin round each, into the grid, and its box into the tick's
function stamp(w: World, C: Claims, i: number): void {
  const T = w.terrain
  const L = i * w.cr.maxSlots * (SWEEP + 1)
  const B = C.box
  B[i * 4] = Math.min(B[i * 4], C.own1[i * 4])
  B[i * 4 + 1] = Math.min(B[i * 4 + 1], C.own1[i * 4 + 1])
  B[i * 4 + 2] = Math.max(B[i * 4 + 2], C.own1[i * 4 + 2])
  B[i * 4 + 3] = Math.max(B[i * 4 + 3], C.own1[i * 4 + 3])
  for (let m = 0; m < C.count[i]; m++) {
    const c = C.list[L + m]
    const gx = c % T.n
    const gz = (c - gx) / T.n
    for (let dz = -MARGIN; dz <= MARGIN; dz++) {
      for (let dx = -MARGIN; dx <= MARGIN; dx++) {
        const x = gx + dx
        const z = gz + dz
        if (x < 0 || z < 0 || x >= T.n || z >= T.n) continue
        claim(C, z * T.n + x, i, dx === 0 && dz === 0 ? 1 : 0)
      }
    }
  }
}

/** Clears the grid and claims every live formation's cells, at the start of the formation step. */
export function buildClaims(w: World): void {
  const C = claimsOf(w)
  C.own.fill(0)
  C.more.fill(0)
  const last = C.built
  C.built = w.meta[M_TICK]
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    C.box.set([Infinity, Infinity, -Infinity, -Infinity], i * 4)
    if (!w.f.alive[i]) continue
    // claimed after its step in the last tick: its cells again, as they stood after it moved (a man fallen since
    // keeps his cell for a tick: only ever too much claimed, never too little); else placed afresh
    if (last >= 0 && C.at[i] === last && C.gen[i] === w.f.gen[i]) stamp(w, C, i)
    else claimFormation(w, i)
  }
}

// whether formation o's claim (its core or its halo) blocks formation i
function blocks(w: World, i: number, o: number, core: boolean): boolean {
  const f = w.f
  const enemy = f.side[i] !== f.side[o]
  // loose bodies (out of the fight) pass through friends, and friends through them
  if (!enemy && (outOfFight(f.mstate[i]) || outOfFight(f.mstate[o]))) return false
  // a melee pair stands in contact: in the clash only the two battalions each the other's foe, so one giving ground
  // or following stops at every other enemy
  const hi = f.foe[i] === handleOf(w, o)
  const ho = f.foe[o] === handleOf(w, i)
  if (enemy && (w.scratch.claims!.clash ? hi && ho : hi || ho)) return false
  // a charge reaches its enemy's core
  if (enemy && f.chPhase[i] !== 0) return core
  return true
}

/** Whether the cell at (x, z) is claimed by a formation that blocks formation i there. */
export function claimedAt(w: World, i: number, x: number, z: number): boolean {
  const C = w.scratch.claims
  if (!C) return false
  const T = w.terrain
  const gx = Math.round((x - T.x0) / T.cell)
  const gz = Math.round((z - T.z0) / T.cell)
  if (gx < 0 || gz < 0 || gx >= T.n || gz >= T.n) return false
  const k = gz * T.n + gx
  for (let s = k * SLOTS; s < k * SLOTS + SLOTS; s++) {
    const e = C.own[s]
    if (e === 0) break
    if ((e >> 1) - 1 !== i && blocks(w, i, (e >> 1) - 1, (e & 1) === 1)) {
      C.hit[i] = C.built
      C.by[i] = (e >> 1) - 1
      return true
    }
  }
  if (C.more[k] !== 1) return false
  // a cell of more owners than it keeps: blocked, by one it does not keep (−1)
  C.hit[i] = C.built
  C.by[i] = -1
  return true
}

// how far a formation's places may reach past its claimed box within a tick (its margin, a cell, its motion)
const SLACK = 6

/** Whether another formation's claims come near i's (the gate's quick rejects then wait): their boxes, grown, meet */
export function claimsNear(w: World, i: number): boolean {
  const C = w.scratch.claims
  if (!C) return false
  if (C.nearAt[i] === C.built) return C.near[i] === 1
  C.nearAt[i] = C.built
  C.near[i] = 0
  const B = C.box
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (j === i || !w.f.alive[j] || B[j * 4] > B[j * 4 + 2]) continue
    if (
      B[j * 4] - SLACK <= B[i * 4 + 2] + SLACK &&
      B[i * 4] - SLACK <= B[j * 4 + 2] + SLACK &&
      B[j * 4 + 1] - SLACK <= B[i * 4 + 3] + SLACK &&
      B[i * 4 + 1] - SLACK <= B[j * 4 + 3] + SLACK
    ) {
      C.near[i] = 1
      return true
    }
  }
  return false
}

/**
 * Whether formation i, formed, would stand clear of every other formation in the fight with its anchor at (x, z),
 * heading h: none of its places on a cell another such formation claims, core or margin. A rally asks it before the
 * router forms again (docs/plans/active/c1-claims.md, step 3), so it never forms inside a friend.
 */
export function formedFits(w: World, i: number, x: number, z: number, h: number): boolean {
  const C = w.scratch.claims
  if (!C) return true
  const T = w.terrain
  const f = w.f
  const U = typeOf(w, i)
  const CS = w.cr.maxC
  const F = filledSlots(w, i)
  placesCtx(C.ctx, i, x, z, h, w.meta[M_TICK] * DT, 0)
  for (let k = F.at[i * (CS + 1)]; k < F.at[i * (CS + 1) + U.C]; k++) {
    placeAtSlot(C.ctx, F.s[k], pt)
    const gx = Math.round((pt[0] - T.x0) / T.cell)
    const gz = Math.round((pt[1] - T.z0) / T.cell)
    if (gx < 0 || gz < 0 || gx >= T.n || gz >= T.n) return false
    const c = gz * T.n + gx
    if (C.more[c]) return false
    for (let q = c * SLOTS; q < c * SLOTS + SLOTS && C.own[q]; q++) {
      const o = (C.own[q] >> 1) - 1
      if (o !== i && !outOfFight(f.mstate[o])) return false
    }
  }
  return true
}

// the rings a router looks for free ground on: their spacing and how many (out to 160 m), the directions on each
const RING = 20
const RINGS = 8
const DIRS = 12

/**
 * The nearest place where formation i fits formed (`formedFits`), facing as it does: on rings of RING metres round its
 * anchor, DIRS directions each, nearest first and, on a ring, from straight ahead round clockwise. Null if none.
 */
export function freeSpot(w: World, i: number): [number, number] | null {
  const f = w.f
  for (let r = 1; r <= RINGS; r++) {
    for (let d = 0; d < DIRS; d++) {
      const a = f.heading[i] + (2 * PI * d) / DIRS
      const x = f.x[i] + sin(a) * r * RING
      const z = f.z[i] + cos(a) * r * RING
      if (!w.terrain || impAt(w.terrain, w.terrain.imp[0], x, z)) continue
      if (formedFits(w, i, x, z, f.heading[i])) return [x, z]
    }
  }
  return null
}

/** Whether another formation's claim blocked formation i in this tick's step: the stall is theirs, not the ground's */
export const claimHit = (w: World, i: number): boolean => {
  const C = w.scratch.claims
  return !!C && C.hit[i] === C.built
}

/** Turns the clash's rule for melee pairs on or off (`blocks`). */
export function clashing(w: World, on: boolean): void {
  if (w.scratch.claims) w.scratch.claims.clash = on
}
/** Forgets that a claim blocked formation i this tick, before a motion that asks again (the clash's). */
export function clearHit(w: World, i: number): void {
  const C = w.scratch.claims
  if (C) C.hit[i] = -1
}
/** The formation whose claim last blocked formation i this tick, or −1 for none or a cell of more owners. */
export const blockerOf = (w: World, i: number): number => (claimHit(w, i) ? w.scratch.claims!.by[i] : -1)

// the keyed draw that orders the formations is drawn again only every this many ticks (2 s), so a formation keeps
// its place in the order long enough to get through
const ORDER_HOLD = 40

/**
 * The live formations in the order of a tick with claims: those held longest by others first (`blockedFor`, which
 * falls to 0 once a formation moves freely), then by a keyed draw held for ORDER_HOLD ticks, ties by slot.
 */
export function claimOrder(w: World): number[] {
  const f = w.f
  const order: number[] = []
  const key: number[] = []
  const window = Math.floor(w.meta[M_TICK] / ORDER_HOLD)
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    order.push(i)
    key[i] = nextU32(keyedStream(ks, w.meta[M_SEED], window, handleOf(w, i), 0, K_ORDER))
  }
  return order.sort((p, q) => f.blockedFor[q] - f.blockedFor[p] || key[p] - key[q] || p - q)
}
