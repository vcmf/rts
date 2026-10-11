// Fire (docs/plans/active/s1c-fire-morale.md; docs/proposals/sim-design.md §8): each company is a firing
// unit. Every 0.5 s each company chooses a target battalion in its arc and range with a clear line; a
// loaded company of a halted battalion fires on it. A volley's hits are drawn from keyed streams and owed
// to the target's companies in the shooter's arc and range; step 11 removes them. All of it reads the
// positions after movement and the men at the start of the step, so no result depends on slot order.
import { type World, M_TICK, M_SEED, MAX_FORMATIONS, O_DRESS, FIRE_AT_WILL, outOfFight, formationSlot as slotOf, formationHandle as handleOf } from './world.ts'
import type { Handle } from './handle.ts'
import { placeWorld, layoutOf, occupied, removeMan, nearImpassable } from './formation.ts'
import { heightAt, cellK } from './terrain.ts'
import { keyedStream, nextUnit } from './rng.ts'
import { MAX_COMPANIES } from './ruleset.ts'
import { sin, cos } from './num.ts'
import { DT } from './time.ts'

const sqrt = Math.sqrt
export const RETARGET_TICKS = 10                       // targets are chosen every 0.5 s, staggered by slot (one tick in ten each)
const K_HITS = 1, K_RELOAD = 2, K_SPAWN = 3           // keyed draws: purpose tags
const SIGHT_STEP = 2                                   // metres between samples along a sight line

// per-company geometry for this step (scratch, not state): centre, facing and the block's origin and rotation
// per battalion, reach: how far its blocks extend from its anchor (a sight line farther off cannot cross them)
export interface FireGeo { cx: Float64Array; cz: Float64Array; fx: Float64Array; fz: Float64Array; ox: Float64Array; oz: Float64Array; ca: Float64Array; sa: Float64Array; reach: Float64Array; n: number }
const pose = { x: 0, z: 0, a: 0, face: 0 }
const ks = new Uint32Array(4)


// (each build starts a new epoch: the sight cache below holds only answers for these positions)
function geometry(w: World): FireGeo {
  const C = w.cr.geo.companies, n = MAX_FORMATIONS * C, s = w.scratch
  s.fireEpoch = ((s.fireEpoch ?? 0) + 1) & 0x3fffffff
  const G = s.fireGeo ?? (s.fireGeo = { cx: new Float64Array(n), cz: new Float64Array(n), fx: new Float64Array(n), fz: new Float64Array(n), ox: new Float64Array(n), oz: new Float64Array(n), ca: new Float64Array(n), sa: new Float64Array(n), reach: new Float64Array(MAX_FORMATIONS), n })
  const f = w.f, g = w.cr.geo, back = -(g.ranks - 1) * g.rankSpacing / 2, t = w.meta[M_TICK] * DT
  const half = sqrt((g.files * g.fileSpacing / 2) * (g.files * g.fileSpacing / 2) + (g.ranks * g.rankSpacing / 2) * (g.ranks * g.rankSpacing / 2))   // a block's half-diagonal
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    G.reach[i] = 0
    for (let c = 0; c < C; c++) {
      const k = i * C + c, p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, pose), ca = cos(p.a), sa = sin(p.a)
      G.ox[k] = p.x; G.oz[k] = p.z; G.ca[k] = ca; G.sa[k] = sa
      G.cx[k] = p.x - back * sa; G.cz[k] = p.z + back * ca   // the block's centre: (0, back) in the block frame
      G.fx[k] = sin(p.face); G.fz[k] = cos(p.face)
      G.reach[i] = Math.max(G.reach[i], sqrt((G.cx[k] - f.x[i]) * (G.cx[k] - f.x[i]) + (G.cz[k] - f.z[i]) * (G.cz[k] - f.z[i])) + half)
    }
  }
  return G
}

// hit chance per round at range d (linear in the table, 0 past its last point)
export function pAt(w: World, d: number): number {
  const T = w.cr.rs.fire.pRange
  if (d >= T[T.length - 1][0]) return 0
  for (let k = 1; k < T.length; k++) if (d < T[k][0]) { const u = (d - T[k - 1][0]) / (T[k][0] - T[k - 1][0]); return T[k - 1][1] + (T[k][1] - T[k - 1][1]) * u }
  return 0
}
// company k sees point (x, z) inside its arc and range
function inArc(w: World, G: FireGeo, k: number, x: number, z: number): boolean {
  const dx = x - G.cx[k], dz = z - G.cz[k], d = sqrt(dx * dx + dz * dz)
  return d <= w.cr.rs.fire.maxRange && dx * G.fx[k] + dz * G.fz[k] >= d * w.cr.cosArc
}
// the ground, and the woods, leave the sight line between two company centres clear
function clearSight(w: World, x0: number, z0: number, x1: number, z1: number): boolean {
  const t = w.terrain, d = w.data, eye = w.cr.rs.fire.eye, lim = w.cr.sightByClass
  const h0 = heightAt(d, x0, z0) + eye, h1 = heightAt(d, x1, z1) + eye, L = sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0))
  const crossed = w.scratch.fireCrossed ?? (w.scratch.fireCrossed = new Float64Array(lim.length)), n = Math.floor(L / SIGHT_STEP); crossed.fill(0)
  for (let s = 1; s < n; s++) {
    const u = s / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u
    if (heightAt(d, x, z) > h0 + (h1 - h0) * u) return false
    const c = t.cls[cellK(t, x, z)]
    if (lim[c] !== Infinity && (crossed[c] += L / n) > lim[c]) return false
  }
  return true
}
// the segment (x0, z0)–(x1, z1) passes through company k's block (its rectangle in the block frame)
function throughBlock(w: World, G: FireGeo, k: number, x0: number, z0: number, x1: number, z1: number): boolean {
  const g = w.cr.geo, hx = g.files * g.fileSpacing / 2, zlo = -(g.ranks - 1) * g.rankSpacing - g.rankSpacing / 2, zhi = g.rankSpacing / 2
  const ca = G.ca[k], sa = G.sa[k], ax = x0 - G.ox[k], az = z0 - G.oz[k], bx = x1 - G.ox[k], bz = z1 - G.oz[k]
  const lx0 = ax * ca + az * sa, lz0 = -ax * sa + az * ca, lx1 = bx * ca + bz * sa, lz1 = -bx * sa + bz * ca
  let t0 = 0, t1 = 1
  const slab = (p: number, q: number, lo: number, hi: number): boolean => {   // p + (q − p)·t within [lo, hi]
    const dd = q - p
    if (dd === 0) return p >= lo && p <= hi
    let ta = (lo - p) / dd, tb = (hi - p) / dd; if (ta > tb) { const s = ta; ta = tb; tb = s }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; return t0 <= t1
  }
  return slab(lx0, lx1, -hx, hx) && slab(lz0, lz1, zlo, zhi)
}
// the share of company k's three rays (both ends of its front and its centre) to (x, z) that no friendly
// block, its own battalion's other companies included, stands across
function clearShare(w: World, G: FireGeo, i: number, c: number, x: number, z: number): number {
  const f = w.f, C = w.cr.geo.companies, k = i * C + c, g = w.cr.geo, half = (g.files - 1) * g.fileSpacing / 2
  let clear = 0
  for (let r = -1; r <= 1; r++) {
    const s = r * half, x0 = G.ox[k] + s * G.ca[k], z0 = G.oz[k] + s * G.sa[k]
    let blocked = false
    for (let j = 0; j < MAX_FORMATIONS && !blocked; j++) {
      if (!f.alive[j] || f.side[j] !== f.side[i]) continue
      if (distToSegment(f.x[j], f.z[j], x0, z0, x, z) > G.reach[j]) continue
      for (let q = 0; q < C && !blocked; q++) if ((j !== i || q !== c) && f.men[j * C + q] > 0 && throughBlock(w, G, j * C + q, x0, z0, x, z)) blocked = true
    }
    if (!blocked) clear++
  }
  return clear / 3
}
function distToSegment(px: number, pz: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz, u = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l2)) : 0
  const ex = x0 + dx * u - px, ez = z0 + dz * u - pz; return sqrt(ex * ex + ez * ez)
}
// company k sees company m: the sight line, walked at most once per pair for one geometry (a sight line is
// the same both ways, so the pair is keyed low to high; cached in the world's scratch, stamped with the
// geometry's epoch, so an answer for older positions is never read)
function sees(w: World, G: FireGeo, k: number, m: number): boolean {
  const n = MAX_FORMATIONS * w.cr.geo.companies, s = w.scratch, epoch = s.fireEpoch ?? 0
  const a0 = k < m ? k : m, b0 = k < m ? m : k, key = a0 * (2 * n - a0 - 1) / 2 + (b0 - a0 - 1)   // the upper triangle (k ≠ m)
  const cache = s.fireSight ?? (s.fireSight = new Int32Array(n * (n - 1) / 2)), v = cache[key]
  if (v >> 1 === epoch) return (v & 1) === 1
  // walked from the lower company to the higher, whichever asks: the two directions round differently
  const a = k < m ? k : m, b = k < m ? m : k, clear = clearSight(w, G.cx[a], G.cz[a], G.cx[b], G.cz[b]); cache[key] = (epoch << 1) | (clear ? 1 : 0)
  return clear
}
const sqDist = (G: FireGeo, k: number, m: number): number => (G.cx[m] - G.cx[k]) * (G.cx[m] - G.cx[k]) + (G.cz[m] - G.cz[k]) * (G.cz[m] - G.cz[k])

// battalion j's nearest company in company k's arc and range with a clear sight line, or −1: the companies
// in arc are tried nearest first, so one hidden in a wood does not hide the rest (a battalion has at most
// MAX_COMPANIES, ruleset.ts)
const aimD = new Float64Array(MAX_COMPANIES), aimM = new Int32Array(MAX_COMPANIES)
function aimAt(w: World, G: FireGeo, k: number, j: number): number {
  const C = w.cr.geo.companies; let n = 0
  for (let q = 0; q < C; q++) {
    const m = j * C + q; if (w.f.men[m] <= 0 || !inArc(w, G, k, G.cx[m], G.cz[m])) continue
    const d = sqDist(G, k, m)
    let p = n++; while (p > 0 && (aimD[p - 1] > d || (aimD[p - 1] === d && aimM[p - 1] > m))) { aimD[p] = aimD[p - 1]; aimM[p] = aimM[p - 1]; p-- }
    aimD[p] = d; aimM[p] = m
  }
  for (let p = 0; p < n; p++) if (sees(w, G, k, aimM[p])) return aimM[p]
  return -1
}

// a battalion may fire: halted (no order at its head but a dress), not changing shape, in the fight, at will
export function mayFire(w: World, i: number): boolean {
  const f = w.f, n = f.ordHead[i]
  return f.fireMode[i] === FIRE_AT_WILL && !outOfFight(f.mstate[i]) && !f.trans[i] && (n < 0 || w.ord.type[n] === O_DRESS)
}

// men in company c's firing ranks
function firingMen(w: World, i: number, c: number): number {
  const g = w.cr.geo; let n = 0
  for (let r = 0; r < Math.min(g.ranks, w.cr.rs.fire.firingRanks); r++) for (let q = 0; q < g.files; q++) if (occupied(w, i, c, r, q)) n++
  return n
}

// step 8: targets every RETARGET_TICKS, then volleys; hits are owed, not yet removed
export function fireStep(w: World): void {
  const f = w.f, C = w.cr.geo.companies, F = w.cr.rs.fire, tick = w.meta[M_TICK] + 1, seed = w.meta[M_SEED]
  // reloads run down whether or not anyone may fire; the geometry is built only when someone may
  let any = false
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    for (let c = 0; c < C; c++) if (f.reload[i * C + c] > 0) f.reload[i * C + c] = Math.max(0, f.reload[i * C + c] - DT)
    if (mayFire(w, i)) any = true; else for (let c = 0; c < C; c++) f.target[i * C + c] = 0
  }
  if (!any) return
  const G = geometry(w), rev = w.scratch.reverse === true   // a test visits battalions in reverse: results must not change
  for (let n = 0; n < MAX_FORMATIONS; n++) {
    const i = rev ? MAX_FORMATIONS - 1 - n : n
    if (!f.alive[i]) continue
    if (!mayFire(w, i)) continue
    const h = handleOf(w, i)
    for (let c = 0; c < C; c++) {
      const k = i * C + c
      if (f.men[k] <= 0) continue
      let m = -2   // the company aimed at: −2 not yet looked for
      if ((tick + i) % RETARGET_TICKS === 0) { f.target[k] = chooseTarget(w, G, i, c); m = chosenAim }
      const j = slotOf(w, f.target[k]); if (j < 0) { f.target[k] = 0; continue }
      if (f.reload[k] > 0) continue
      // a loaded company that cannot see its target, or has friends across every ray, tries again in 0.5 s
      if (m === -2) m = aimAt(w, G, k, j)
      if (m < 0) { f.reload[k] = RETARGET_TICKS * DT; continue }
      const share = clearShare(w, G, i, c, G.cx[m], G.cz[m]); if (share <= 0) { f.reload[k] = RETARGET_TICKS * DT; continue }
      const d = sqrt(sqDist(G, k, m))
      volley(w, G, i, c, j, d, share, keyedStream(ks, seed, tick, h, c, K_HITS))
      f.reload[k] = F.reload * (1 + F.reloadJitter * (2 * nextUnit(keyedStream(ks, seed, tick, h, c, K_RELOAD)) - 1))
      f.volleyTick[k] = tick
    }
  }
}

// the preferred target if it can be aimed at, else the current one, else the nearest; ties to the lower
// handle. The company aimed at is left in chosenAim (−1 none) for the volley this tick.
let chosenAim = -1
const candD = new Float64Array(MAX_FORMATIONS), candH = new Int32Array(MAX_FORMATIONS)
function chooseTarget(w: World, G: FireGeo, i: number, c: number): Handle {
  const f = w.f, C = w.cr.geo.companies, k = i * C + c
  chosenAim = -1
  for (let p = 0; p < 2; p++) { const h = p === 0 ? f.prefer[i] : f.target[k], j = slotOf(w, h); if (j >= 0 && f.side[j] !== f.side[i]) { const m = aimAt(w, G, k, j); if (m >= 0) { chosenAim = m; return h } } }
  // the nearest battalion by its nearest visible company. Candidates are taken in order of their nearest
  // company in arc (a bound: a visible one is no nearer), and the search stops once the bound passes the best.
  let nc = 0
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (!f.alive[j] || f.side[j] === f.side[i]) continue
    let b = Infinity
    for (let q = 0; q < C; q++) { const m = j * C + q; if (f.men[m] > 0 && inArc(w, G, k, G.cx[m], G.cz[m])) b = Math.min(b, sqDist(G, k, m)) }
    if (b === Infinity) continue
    const h = handleOf(w, j); let p = nc++   // insertion by (bound, handle)
    while (p > 0 && (candD[p - 1] > b || (candD[p - 1] === b && candH[p - 1] > h))) { candD[p] = candD[p - 1]; candH[p] = candH[p - 1]; p-- }
    candD[p] = b; candH[p] = h
  }
  let best: Handle = 0, bd = Infinity
  for (let p = 0; p < nc; p++) {
    const bound = candD[p], h = candH[p]
    if (bound > bd) break   // equal bounds still run: a tie goes to the lower handle
    const m = aimAt(w, G, k, slotOf(w, h)); if (m < 0) continue
    const d = sqDist(G, k, m); if (d < bd || (d === bd && h < best)) { bd = d; best = h; chosenAim = m }
  }
  return best
}

const open = new Uint8Array(MAX_COMPANIES)   // the target companies a volley can hit
// one company's volley at battalion j: expected hits, drawn as an integer, each given to a company of j in
// the shooter's arc and range that it can see, weighted by its men (as they stood at the start of the step)
function volley(w: World, G: FireGeo, i: number, c: number, j: number, d: number, share: number, rs: Uint32Array): void {
  const f = w.f, C = w.cr.geo.companies, F = w.cr.rs.fire, k = i * C + c
  const rounds = firingMen(w, i, c) * share * (1 - F.misfire)
  const lambda = rounds * pAt(w, d) * w.cr.stateFactor[Math.min(2, f.mstate[i])] * (1 - F.cohesion * f.disorder[i]) * w.cr.depthByKind[layoutOf(w, j).kind]
  let hits = Math.floor(lambda); if (nextUnit(rs) < lambda - hits) hits++
  if (!hits) return
  let tot = 0
  for (let q = 0; q < C; q++) { const m = j * C + q; open[q] = f.men[m] > 0 && inArc(w, G, k, G.cx[m], G.cz[m]) && sees(w, G, k, m) ? 1 : 0; if (open[q]) tot += f.men[m] }
  if (!tot) return
  for (let n = 0; n < hits; n++) {
    let r = Math.floor(nextUnit(rs) * tot), q = 0
    for (; q < C; q++) { const m = j * C + q; if (open[q]) { if (r < f.men[m]) break; r -= f.men[m] } }
    f.owed[j * C + Math.min(q, C - 1)]++
  }
}

// step 11: the men owed fall, one at a time through the re-packing gate (removeMan: a loss whose re-pack
// would put a man on impassable ground falls on another company, those owed hits first). Hits owed to a
// company beyond the men it has are lost: they were aimed at men who are already down, and passing them on
// could strike a company the shooters cannot see. Returns the men battalion i lost.
const owedAtStart = new Int32Array(MAX_COMPANIES), takeNow = new Int32Array(MAX_COMPANIES)   // per company
export function casualtiesStep(w: World, i: number): number {
  const f = w.f, C = w.cr.geo.companies
  let lost = 0, any = false
  // each company's losses are fixed first (its hits, at most its men); the gate may move a loss to another
  // company, preferring those the volleys hit this tick
  for (let c = 0; c < C; c++) { owedAtStart[c] = f.owed[i * C + c]; takeNow[c] = Math.min(owedAtStart[c], f.men[i * C + c]); f.owed[i * C + c] = 0; if (takeNow[c]) any = true }
  if (!any) return 0
  const near = nearImpassable(w, i)   // positions do not change in this step: once per battalion
  for (let c = 0; c < C; c++) for (let n = takeNow[c]; n > 0; n--) if (removeMan(w, i, c, owedAtStart, near) >= 0) lost++
  return lost
}

// company c of battalion i as it would aim now: its target's slot (−1 none), the clear share of its rays
// and the range. For tests and debugging: it rebuilds the fire geometry for every battalion, not a per-frame call.
export function aimOf(w: World, i: number, c: number): { target: number; share: number; range: number } {
  const G = geometry(w), C = w.cr.geo.companies, k = i * C + c, j = slotOf(w, w.f.target[k])
  const m = j >= 0 ? aimAt(w, G, k, j) : -1
  if (m < 0) return { target: j, share: 0, range: Infinity }
  return { target: j, share: clearShare(w, G, i, c, G.cx[m], G.cz[m]), range: sqrt(sqDist(G, k, m)) }
}

// company c of battalion i sees company q of battalion j, with the positions as they are (tests, debugging)
export function companySees(w: World, i: number, c: number, j: number, q: number): boolean {
  const G = geometry(w), C = w.cr.geo.companies
  return sees(w, G, i * C + c, j * C + q)   // as the fire step judges it (walked low to high)
}

// a new battalion: companies loaded at a keyed share of a reload, so a line does not open with one volley
export function spawnFire(w: World, i: number): void {
  const f = w.f, C = w.cr.geo.companies, R = w.cr.rs.fire.reload
  for (let c = 0; c < C; c++) f.reload[i * C + c] = R * nextUnit(keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), c, K_SPAWN))
}
