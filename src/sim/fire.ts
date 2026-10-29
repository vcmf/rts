// Fire (docs/plans/active/s1c-fire-morale.md; docs/proposals/sim-design.md §8): each company is a firing
// unit. Every 0.5 s each company chooses a target battalion in its arc and range with a clear line; a
// loaded company of a halted battalion fires on it. A volley's hits are drawn from keyed streams and owed
// to the target's companies in the shooter's arc and range; step 11 removes them. All of it reads the
// positions after movement and the men at the start of the step, so no result depends on slot order.
import {
  type World,
  M_TICK,
  M_SEED,
  MAX_FORMATIONS,
  O_DRESS,
  FIRE_AT_WILL,
  outOfFight,
  formationSlot as slotOf,
  formationHandle as handleOf,
  typeOf,
  levelOf,
} from './world.ts'
import type { Handle } from './handle.ts'
import { placeWorld, layoutOf, occupied, removeMan, nearImpassable, sheltering } from './formation.ts'
import { heightAt, cellK } from './terrain.ts'
import { keyedStream, nextUnit } from './rng.ts'
import { MAX_COMPANIES } from './ruleset.ts'
import { sin, cos } from './num.ts'
import { DT } from './time.ts'
import { buildFaces, threatWeights } from './sectors.ts'

const sqrt = Math.sqrt
export const RETARGET_TICKS = 10 // targets are chosen every 0.5 s, staggered by slot (one tick in ten each)
// keyed draws: purpose tags
const K_HITS = 1
const K_RELOAD = 2
const K_SPAWN = 3
const SIGHT_STEP = 2 // metres between samples along a sight line

// per-company geometry for this step (scratch, not state): centre, facing and the block's origin and rotation,
// strided by the most companies of any type (cr.maxC). Per battalion, reach: how far its blocks extend from
// its anchor (a sight line farther off cannot cross them); and its type's block in the block frame: half its
// frontage, its rear and front edges
export interface FireGeo {
  cx: Float64Array
  cz: Float64Array
  fx: Float64Array
  fz: Float64Array
  ox: Float64Array
  oz: Float64Array
  ca: Float64Array
  sa: Float64Array
  reach: Float64Array
  bx: Float64Array
  bz0: Float64Array
  bz1: Float64Array
  n: number
}
const pose = { x: 0, z: 0, a: 0, face: 0, kx: 1, kz: 1 }
const ks = new Uint32Array(4)

// (each build starts a new epoch: the sight cache below holds only answers for these positions; the melee step
// builds it too, for the positions after movement)
export function blockGeometry(w: World): FireGeo {
  const CS = w.cr.maxC
  const n = MAX_FORMATIONS * CS
  const s = w.scratch
  const N = MAX_FORMATIONS
  s.fireEpoch = ((s.fireEpoch ?? 0) + 1) & 0x3fffffff
  const G =
    s.fireGeo ??
    (s.fireGeo = {
      cx: new Float64Array(n),
      cz: new Float64Array(n),
      fx: new Float64Array(n),
      fz: new Float64Array(n),
      ox: new Float64Array(n),
      oz: new Float64Array(n),
      ca: new Float64Array(n),
      sa: new Float64Array(n),
      reach: new Float64Array(N),
      bx: new Float64Array(N),
      bz0: new Float64Array(N),
      bz1: new Float64Array(N),
      n,
    })
  const f = w.f
  const t = w.meta[M_TICK] * DT
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    const U = typeOf(w, i)
    const g = U.geo
    // the block's rectangle as its places stand: the block's spacing times the pose's (a step's column of route
    // is three times as long), the largest of its companies'
    let kx = 1
    let kz = 1
    for (let c = 0; c < U.C; c++) {
      const k = i * CS + c
      const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, pose)
      G.ox[k] = p.x
      G.oz[k] = p.z
      G.ca[k] = cos(p.a)
      G.sa[k] = sin(p.a)
      G.fx[k] = sin(p.face)
      G.fz[k] = cos(p.face)
      kx = Math.max(kx, p.kx)
      kz = Math.max(kz, p.kz)
    }
    const fs = g.fileSpacing * kx
    const rs = g.rankSpacing * kz
    const back = (-(g.ranks - 1) * rs) / 2
    // a block's half-diagonal
    const half = sqrt(((g.files * fs) / 2) * ((g.files * fs) / 2) + ((g.ranks * rs) / 2) * ((g.ranks * rs) / 2))
    G.bx[i] = (g.files * fs) / 2
    G.bz0[i] = -(g.ranks - 1) * rs - rs / 2
    G.bz1[i] = rs / 2
    G.reach[i] = 0
    for (let c = 0; c < U.C; c++) {
      const k = i * CS + c
      // the block's centre: (0, back) in the block frame
      G.cx[k] = G.ox[k] - back * G.sa[k]
      G.cz[k] = G.oz[k] + back * G.ca[k]
      G.reach[i] = Math.max(
        G.reach[i],
        sqrt((G.cx[k] - f.x[i]) * (G.cx[k] - f.x[i]) + (G.cz[k] - f.z[i]) * (G.cz[k] - f.z[i])) + half,
      )
    }
  }
  buildFaces(w, G)
  return G
}

const wt = new Float64Array(3)
/**
 * Battalion j's exposure to fire from company k (docs/proposals/sectors-model.md § 5): its kind's depth factor
 * times front + flank × its shape's exposure.flank + rear × exposure.rear, the weights (front, flank, rear) of k's
 * block on j's face. G must be this tick's geometry (its faces are built with it).
 */
export function exposure(w: World, G: FireGeo, k: number, j: number): number {
  const L = layoutOf(w, j)
  const base = w.cr.depthByKind[L.kind]
  const e = L.def.exposure
  if (!e) return base
  threatWeights(w, G, j, Math.floor(k / w.cr.maxC), k, wt)
  return base * (wt[0] + wt[1] * e.flank + wt[2] * e.rear)
}

// hit chance per round at range d (linear in the table, 0 past its last point)
export function pAt(w: World, d: number): number {
  const T = w.cr.rs.fire.pRange
  if (d >= T[T.length - 1][0]) return 0
  for (let k = 1; k < T.length; k++) {
    if (d < T[k][0]) {
      const u = (d - T[k - 1][0]) / (T[k][0] - T[k - 1][0])
      return T[k - 1][1] + (T[k][1] - T[k - 1][1]) * u
    }
  }
  return 0
}
// the arc and range a company targets in: musketry's (fire.arc, fire.maxRange), or a battery's own (its type's
// artillery)
export interface Reach {
  range: number
  cos: number
}
export const reachOf = (w: World, i: number): Reach => {
  const A = typeOf(w, i).artillery
  return A
    ? { range: typeOf(w, i).def.artillery!.ray.range, cos: A.cosArc }
    : { range: w.cr.rs.fire.maxRange, cos: w.cr.cosArc }
}
/** Company k sees point (x, z) inside its arc and range. */
export function inArc(G: FireGeo, k: number, x: number, z: number, R: Reach): boolean {
  const dx = x - G.cx[k]
  const dz = z - G.cz[k]
  const d = sqrt(dx * dx + dz * dz)
  return d <= R.range && dx * G.fx[k] + dz * G.fz[k] >= d * R.cos
}
// the ground, and the woods, leave the sight line between two company centres clear
function clearSight(w: World, x0: number, z0: number, x1: number, z1: number): boolean {
  const t = w.terrain
  const d = w.data
  const eye = w.cr.rs.fire.eye
  const lim = w.cr.sightByClass
  const h0 = heightAt(d, x0, z0) + eye
  const h1 = heightAt(d, x1, z1) + eye
  const L = sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0))
  const crossed = w.scratch.fireCrossed ?? (w.scratch.fireCrossed = new Float64Array(lim.length))
  const n = Math.floor(L / SIGHT_STEP)
  crossed.fill(0)
  for (let s = 1; s < n; s++) {
    const u = s / n
    const x = x0 + (x1 - x0) * u
    const z = z0 + (z1 - z0) * u
    if (heightAt(d, x, z) > h0 + (h1 - h0) * u) return false
    const c = t.cls[cellK(t, x, z)]
    if (lim[c] !== Infinity && (crossed[c] += L / n) > lim[c]) return false
  }
  return true
}
// the segment (x0, z0)–(x1, z1) passes through company k of battalion j (its block's rectangle in the block frame)
function throughBlock(G: FireGeo, j: number, k: number, x0: number, z0: number, x1: number, z1: number): boolean {
  const hx = G.bx[j]
  const zlo = G.bz0[j]
  const zhi = G.bz1[j]
  const ca = G.ca[k]
  const sa = G.sa[k]
  const ax = x0 - G.ox[k]
  const az = z0 - G.oz[k]
  const bx = x1 - G.ox[k]
  const bz = z1 - G.oz[k]
  const lx0 = ax * ca + az * sa
  const lz0 = -ax * sa + az * ca
  const lx1 = bx * ca + bz * sa
  const lz1 = -bx * sa + bz * ca
  let t0 = 0
  let t1 = 1
  const slab = (p: number, q: number, lo: number, hi: number): boolean => {
    // p + (q − p)·t within [lo, hi]
    const dd = q - p
    if (dd === 0) return p >= lo && p <= hi
    let ta = (lo - p) / dd
    let tb = (hi - p) / dd
    if (ta > tb) {
      const s = ta
      ta = tb
      tb = s
    }
    if (ta > t0) t0 = ta
    if (tb < t1) t1 = tb
    return t0 <= t1
  }
  return slab(lx0, lx1, -hx, hx) && slab(lz0, lz1, zlo, zhi)
}
/**
 * The share of company k's rays (of battalion i: both ends of its front and its centre, or the centre alone) to (x, z)
 * that no block of side `side` stands across, company `skipK` and battalion `skipJ` aside (−1 none).
 */
function rayShare(
  w: World,
  G: FireGeo,
  i: number,
  k: number,
  x: number,
  z: number,
  side: number,
  skipK: number,
  skipJ: number,
  centre: boolean,
): number {
  const f = w.f
  const CS = w.cr.maxC
  const g = typeOf(w, i).geo
  const half = ((g.files - 1) * g.fileSpacing) / 2
  const r0 = centre ? 0 : -1
  let clear = 0
  for (let r = r0; r <= -r0; r++) {
    const s = r * half
    const x0 = G.ox[k] + s * G.ca[k]
    const z0 = G.oz[k] + s * G.sa[k]
    let blocked = false
    for (let j = 0; j < MAX_FORMATIONS && !blocked; j++) {
      if (!f.alive[j] || f.side[j] !== side || j === skipJ) continue
      if (distToSegment(f.x[j], f.z[j], x0, z0, x, z) > G.reach[j]) continue
      for (let q = 0, C = typeOf(w, j).C; q < C && !blocked; q++) {
        const m = j * CS + q
        if (m !== skipK && f.men[m] > 0 && throughBlock(G, j, m, x0, z0, x, z)) blocked = true
      }
    }
    if (!blocked) clear++
  }
  return clear / (1 - 2 * r0)
}
/**
 * The share of company c's three rays (both ends of its front and its centre) to (x, z) that no friendly block, its own
 * battalion's other companies included, stands across.
 */
export function clearShare(w: World, G: FireGeo, i: number, c: number, x: number, z: number): number {
  const k = i * w.cr.maxC + c
  return rayShare(w, G, i, k, x, z, w.f.side[i], k, -1, false)
}
/**
 * The share of company k's rays to company m's centre (its three, or its centre's alone) that cross no block of side
 * `side` but m's own battalion's: whether m's friends screen it from k (docs/proposals/sectors-model.md § 6).
 */
export function screenShare(w: World, G: FireGeo, k: number, m: number, side: number, centre = false): number {
  const CS = w.cr.maxC
  return rayShare(w, G, Math.floor(k / CS), k, G.cx[m], G.cz[m], side, -1, Math.floor(m / CS), centre)
}
export function distToSegment(px: number, pz: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = x1 - x0
  const dz = z1 - z0
  const l2 = dx * dx + dz * dz
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l2)) : 0
  const ex = x0 + dx * u - px
  const ez = z0 + dz * u - pz
  return sqrt(ex * ex + ez * ez)
}
// company k sees company m: the sight line, walked at most once per pair for one geometry (a sight line is
// the same both ways, so the pair is keyed low to high; cached in the world's scratch, stamped with the
// geometry's epoch, so an answer for older positions is never read)
export function sees(w: World, G: FireGeo, k: number, m: number): boolean {
  const n = MAX_FORMATIONS * w.cr.maxC
  const s = w.scratch
  const epoch = s.fireEpoch ?? 0
  // the upper triangle (k ≠ m)
  const a0 = k < m ? k : m
  const b0 = k < m ? m : k
  const key = (a0 * (2 * n - a0 - 1)) / 2 + (b0 - a0 - 1)
  const cache = s.fireSight ?? (s.fireSight = new Int32Array((n * (n - 1)) / 2))
  const v = cache[key]
  if (v >> 1 === epoch) return (v & 1) === 1
  // walked from the lower company to the higher, whichever asks: the two directions round differently
  const a = k < m ? k : m
  const b = k < m ? m : k
  const clear = clearSight(w, G.cx[a], G.cz[a], G.cx[b], G.cz[b])
  cache[key] = (epoch << 1) | (clear ? 1 : 0)
  return clear
}
/** The squared distance between companies k and m's block centres in `G`, square metres. */
export const sqDist = (G: FireGeo, k: number, m: number): number =>
  (G.cx[m] - G.cx[k]) * (G.cx[m] - G.cx[k]) + (G.cz[m] - G.cz[k]) * (G.cz[m] - G.cz[k])

// battalion j's nearest company in company k's arc and range with a clear sight line, or −1: the companies
// in arc are tried nearest first, so one hidden in a wood does not hide the rest (a battalion has at most
// MAX_COMPANIES, ruleset.ts)
const aimD = new Float64Array(MAX_COMPANIES)
const aimM = new Int32Array(MAX_COMPANIES)
export function aimAt(w: World, G: FireGeo, k: number, j: number, R: Reach): number {
  const C = typeOf(w, j).C
  const CS = w.cr.maxC
  let n = 0
  for (let q = 0; q < C; q++) {
    const m = j * CS + q
    if (w.f.men[m] <= 0 || !inArc(G, k, G.cx[m], G.cz[m], R)) continue
    const d = sqDist(G, k, m)
    let p = n++
    while (p > 0 && (aimD[p - 1] > d || (aimD[p - 1] === d && aimM[p - 1] > m))) {
      aimD[p] = aimD[p - 1]
      aimM[p] = aimM[p - 1]
      p--
    }
    aimD[p] = d
    aimM[p] = m
  }
  for (let p = 0; p < n; p++) if (sees(w, G, k, aimM[p])) return aimM[p]
  return -1
}

// a battalion may fire: of a type that fires, halted (no order at its head but a dress), not changing shape, in
// the fight and not in melee, at will
export function mayFire(w: World, i: number): boolean {
  const f = w.f
  const n = f.ordHead[i]
  return (
    typeOf(w, i).def.fires &&
    f.fireMode[i] === FIRE_AT_WILL &&
    !outOfFight(f.mstate[i]) &&
    !f.foe[i] &&
    !f.trans[i] &&
    (n < 0 || w.ord.type[n] === O_DRESS || sheltering(w, i))
  )
}

// men in company c's firing ranks
function firingMen(w: World, i: number, c: number): number {
  const g = typeOf(w, i).geo
  let n = 0
  for (let r = 0; r < Math.min(g.ranks, w.cr.rs.fire.firingRanks); r++) {
    for (let q = 0; q < g.files; q++) if (occupied(w, i, c, r, q)) n++
  }
  return n
}

// step 8: targets every RETARGET_TICKS, then volleys; hits are owed, not yet removed
export function fireStep(w: World): void {
  const f = w.f
  const CS = w.cr.maxC
  const F = w.cr.rs.fire
  const tick = w.meta[M_TICK] + 1
  const seed = w.meta[M_SEED]
  // reloads run down whether or not anyone may fire; the geometry is built only when someone may
  let any = false
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    const C = typeOf(w, i).C
    for (let c = 0; c < C; c++) {
      if (f.reload[i * CS + c] > 0) f.reload[i * CS + c] = Math.max(0, f.reload[i * CS + c] - DT)
    }
    if (mayFire(w, i)) any = true
    else if (!typeOf(w, i).artillery) {
      // a battery's pieces: artillery.ts
      for (let c = 0; c < C; c++) f.target[i * CS + c] = 0
    }
  }
  if (!any) return
  const G = blockGeometry(w)
  // a test visits battalions in reverse: results must not change
  const rev = w.scratch.reverse === true
  const R: Reach = { range: F.maxRange, cos: w.cr.cosArc }
  w.scratch.fireGeoTick = tick // built for this tick's positions after movement: the melee step reuses it
  for (let n = 0; n < MAX_FORMATIONS; n++) {
    const i = rev ? MAX_FORMATIONS - 1 - n : n
    if (!f.alive[i]) continue
    if (!mayFire(w, i)) continue
    const h = handleOf(w, i)
    for (let c = 0, C = typeOf(w, i).C; c < C; c++) {
      const k = i * CS + c
      if (f.men[k] <= 0) continue
      let m = -2 // the company aimed at: −2 not yet looked for
      if ((tick + i) % RETARGET_TICKS === 0) {
        f.target[k] = chooseTarget(w, G, i, c, R)
        m = chosenAim
      }
      const j = slotOf(w, f.target[k])
      if (j < 0) {
        f.target[k] = 0
        continue
      }
      if (f.reload[k] > 0) continue
      // a loaded company that cannot see its target, or has friends across every ray, tries again in 0.5 s
      if (m === -2) m = aimAt(w, G, k, j, R)
      if (m < 0) {
        f.reload[k] = RETARGET_TICKS * DT
        continue
      }
      const share = clearShare(w, G, i, c, G.cx[m], G.cz[m])
      if (share <= 0) {
        f.reload[k] = RETARGET_TICKS * DT
        continue
      }
      const d = sqrt(sqDist(G, k, m))
      volley(w, G, i, c, j, d, share, keyedStream(ks, seed, tick, h, c, K_HITS), R)
      f.reload[k] =
        F.reload *
        levelOf(w, i).reload *
        (1 + F.reloadJitter * (2 * nextUnit(keyedStream(ks, seed, tick, h, c, K_RELOAD)) - 1))
      f.volleyTick[k] = tick
    }
  }
}

// the preferred target if it can be aimed at, else the current one, else the nearest; ties to the lower
// handle. The company aimed at is left in chosenAim (−1 none) for the volley this tick.
let chosenAim = -1
export const chosen = (): number => chosenAim
const candD = new Float64Array(MAX_FORMATIONS)
const candH = new Int32Array(MAX_FORMATIONS)
export function chooseTarget(w: World, G: FireGeo, i: number, c: number, R: Reach): Handle {
  const f = w.f
  const CS = w.cr.maxC
  const k = i * CS + c
  chosenAim = -1
  for (let p = 0; p < 2; p++) {
    const h = p === 0 ? f.prefer[i] : f.target[k]
    const j = slotOf(w, h)
    if (j >= 0 && f.side[j] !== f.side[i]) {
      const m = aimAt(w, G, k, j, R)
      if (m >= 0) {
        chosenAim = m
        return h
      }
    }
  }
  // the nearest battalion by its nearest visible company. Candidates are taken in order of their nearest
  // company in arc (a bound: a visible one is no nearer), and the search stops once the bound passes the best.
  let nc = 0
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (!f.alive[j] || f.side[j] === f.side[i]) continue
    let b = Infinity
    for (let q = 0, C = typeOf(w, j).C; q < C; q++) {
      const m = j * CS + q
      if (f.men[m] > 0 && inArc(G, k, G.cx[m], G.cz[m], R)) b = Math.min(b, sqDist(G, k, m))
    }
    if (b === Infinity) continue
    // insertion by (bound, handle)
    const h = handleOf(w, j)
    let p = nc++
    while (p > 0 && (candD[p - 1] > b || (candD[p - 1] === b && candH[p - 1] > h))) {
      candD[p] = candD[p - 1]
      candH[p] = candH[p - 1]
      p--
    }
    candD[p] = b
    candH[p] = h
  }
  let best: Handle = 0
  let bd = Infinity
  for (let p = 0; p < nc; p++) {
    const bound = candD[p]
    const h = candH[p]
    if (bound > bd) break // equal bounds still run: a tie goes to the lower handle
    const m = aimAt(w, G, k, slotOf(w, h), R)
    if (m < 0) continue
    const d = sqDist(G, k, m)
    if (d < bd || (d === bd && h < best)) {
      bd = d
      best = h
      chosenAim = m
    }
  }
  return best
}

const open = new Uint8Array(MAX_COMPANIES) // the target companies a volley can hit
// one company's volley at battalion j: expected hits, drawn as an integer, each given to a company of j in
// the shooter's arc and range that it can see, weighted by its men (as they stood at the start of the step)
function volley(
  w: World,
  G: FireGeo,
  i: number,
  c: number,
  j: number,
  d: number,
  share: number,
  rs: Uint32Array,
  R: Reach,
): void {
  const f = w.f
  const CS = w.cr.maxC
  const C = typeOf(w, j).C
  const F = w.cr.rs.fire
  const k = i * CS + c
  const rounds = firingMen(w, i, c) * share * (1 - F.misfire)
  const lambda =
    rounds *
    pAt(w, d) *
    levelOf(w, i).precision *
    w.cr.stateFactor[Math.min(2, f.mstate[i])] *
    (1 - F.cohesion * f.disorder[i]) *
    exposure(w, G, k, j)
  let hits = Math.floor(lambda)
  if (nextUnit(rs) < lambda - hits) hits++
  if (!hits) return
  for (let q = 0; q < C; q++) {
    const m = j * CS + q
    open[q] = f.men[m] > 0 && inArc(G, k, G.cx[m], G.cz[m], R) && sees(w, G, k, m) ? 1 : 0
  }
  oweByMen(w, j, open, hits, rs)
}
/**
 * n men struck in battalion j's companies marked in `mask`, owed after j's toughness (n ÷ toughness, the fraction
 * drawn from rs; no draw at toughness 1), each drawn from rs to a marked company weighted by its men (as they stood at
 * the start of the step): a volley's hits, a gun's, a charge's and a melee's losses (melee.ts).
 */
export function oweByMen(w: World, j: number, mask: ArrayLike<number>, n: number, rs: Uint32Array): void {
  const f = w.f
  const CS = w.cr.maxC
  const C = typeOf(w, j).C
  let tot = 0
  for (let q = 0; q < C; q++) if (mask[q]) tot += f.men[j * CS + q]
  if (!tot) return
  const t = levelOf(w, j).toughness
  if (t !== 1) {
    const x = n / t
    n = Math.floor(x)
    if (nextUnit(rs) < x - n) n++
  }
  for (let k = 0; k < n; k++) {
    let r = Math.floor(nextUnit(rs) * tot)
    let q = 0
    for (; q < C; q++) {
      if (mask[q]) {
        if (r < f.men[j * CS + q]) break
        r -= f.men[j * CS + q]
      }
    }
    f.owed[j * CS + Math.min(q, C - 1)]++
  }
}

// step 11: the men owed fall, one at a time through the re-packing gate (removeMan: a loss whose re-pack
// would put a man on impassable ground falls on another company, those owed hits first). Hits owed to a
// company beyond the men it has are lost: they were aimed at men who are already down, and passing them on
// could strike a company the shooters cannot see. Returns the men battalion i lost.
// per company
const owedAtStart = new Int32Array(MAX_COMPANIES)
const takeNow = new Int32Array(MAX_COMPANIES)
export function casualtiesStep(w: World, i: number): number {
  const f = w.f
  const C = typeOf(w, i).C
  const CS = w.cr.maxC
  let lost = 0
  let any = false
  // each company's losses are fixed first (its hits, at most its men); the gate may move a loss to another
  // company, preferring those the volleys hit this tick
  for (let c = 0; c < C; c++) {
    owedAtStart[c] = f.owed[i * CS + c]
    takeNow[c] = Math.min(owedAtStart[c], f.men[i * CS + c])
    f.owed[i * CS + c] = 0
    if (takeNow[c]) any = true
  }
  if (!any) return 0
  const near = nearImpassable(w, i) // positions do not change in this step: once per battalion
  for (let c = 0; c < C; c++) {
    for (let n = takeNow[c]; n > 0; n--) if (removeMan(w, i, c, owedAtStart, near) >= 0) lost++
  }
  return lost
}

// company c of battalion i as it would aim now: its target's slot (−1 none), the clear share of its rays
// and the range. For tests and debugging: it rebuilds the fire geometry for every battalion, not a per-frame call.
export function aimOf(w: World, i: number, c: number): { target: number; share: number; range: number } {
  const G = blockGeometry(w)
  const k = i * w.cr.maxC + c
  const j = slotOf(w, w.f.target[k])
  const m = j >= 0 ? aimAt(w, G, k, j, reachOf(w, i)) : -1
  if (m < 0) return { target: j, share: 0, range: Infinity }
  return { target: j, share: clearShare(w, G, i, c, G.cx[m], G.cz[m]), range: sqrt(sqDist(G, k, m)) }
}

// company c of battalion i sees company q of battalion j, with the positions as they are (tests, debugging)
export function companySees(w: World, i: number, c: number, j: number, q: number): boolean {
  const G = blockGeometry(w)
  const CS = w.cr.maxC
  return sees(w, G, i * CS + c, j * CS + q) // as the fire step judges it (walked low to high)
}

// a new battalion: companies loaded at a keyed share of a reload, so a line does not open with one volley
export function spawnFire(w: World, i: number): void {
  // a battery's pieces by its own reload
  const f = w.f
  const C = typeOf(w, i).C
  const CS = w.cr.maxC
  const R = typeOf(w, i).def.artillery?.reload ?? w.cr.rs.fire.reload
  for (let c = 0; c < C; c++) {
    f.reload[i * CS + c] = R * nextUnit(keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), c, K_SPAWN))
  }
}
