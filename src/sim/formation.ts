// The formation layer (20 Hz), ported from prototypes/formation-core.js onto the spine: shapes and timed
// changes, the march trail, the terrain lag model, the footprint gate, Face about, wheels, halts.
// Design and history: docs/plans/done/terrain-movement.md, docs/plans/done/s1a-formations-on-spine.md.
//
// A battalion is a few company blocks (files × ranks) placed in the battalion frame by its shape. The sim
// keeps the men per company; which slots are filled follows from that by one rule (`occupied`), so no
// soldier is simulated (decision 0007): who stands where and who falls is the renderer's.
import { type World, M_TICK, TRAIL, O_MOVE, O_FORM, O_WHEEL, O_FACE, O_DRESS, MAX_FORMATIONS, MS_ROUTING } from './world.ts'
import type { ShapeLayout, Placement } from './ruleset.ts'
import { rot2, blockLocal, slotIndex, BINS, MAX_BINS } from './ruleset.ts'
import { cellK, groundG, groundQ, onRoad } from './terrain.ts'
import { sin, cos, atan2, wrapAngle, PI } from './num.ts'
import { DT } from './time.ts'

export const STATUS = ['', 'halted: impassable ground', 'cannot form: impassable ground', 'arrived: as near as the shape can turn',
  'cannot wheel: a trail shape turns as it marches', 'cannot face about: impassable ground', 'cannot face about: the shape has no half-turn symmetry',
  'cannot face about: changing shape', 'cannot face about: the shape is not centred on its trail']
export const ST_HALTED = 1
const ST_CANNOT_FORM = 2, ST_ARRIVED_NEAR = 3, ST_CANNOT_WHEEL = 4, ST_FACE_WET = 5, ST_FACE_ASYM = 6, ST_FACE_CHANGING = 7, ST_FACE_OFFCENTRE = 8

const GATE_HALVINGS = 6, CHANGE_SAMPLES = 128
const STALL = 0.04      // m/s: an anchor slower than this, with a held bin, is stopped by impassable ground
const HALT_AFTER = 1    // s held and stalled before the order is given up
const ARRIVE = 0.4      // m

const sqrt = Math.sqrt
const hyp = (x: number, z: number) => sqrt(x * x + z * z)
const now = (w: World) => w.meta[M_TICK] * DT

/* ---------------- shapes, places ---------------- */
export const layoutOf = (w: World, i: number): ShapeLayout => w.cr.shapes[w.f.shape[i]]
const targetLayout = (w: World, i: number): ShapeLayout => w.cr.shapes[w.f.trans[i] ? w.f.tShape[i] : w.f.shape[i]]
export const snakes = (w: World, i: number): boolean => !w.f.trans[i] && !!layoutOf(w, i).def.trail
const kindOf = (w: World, i: number) => targetLayout(w, i).kind
const BW = (w: World) => w.cr.geo.files * w.cr.geo.fileSpacing

// which slots are filled, from the men per company (files from the centre outward, ranks front first);
// a shape that closes across companies fills each half of the battalion toward the colours instead
export function occupied(w: World, i: number, c: number, r: number, f: number): boolean {
  const g = w.cr.geo, C = g.companies, R = g.ranks, F = g.files, men = w.f.men, L = targetLayout(w, i)
  if (L.def.closeAcross && C % 2 === 0) {
    const h = c < C / 2 ? 0 : 1, H = (C / 2) * F, base = i * C + h * (C / 2)
    let m = 0; for (let k = 0; k < C / 2; k++) m += men[base + k]
    const nf = Math.min(H, Math.ceil(m / R)), cr = Math.max(0, Math.min(nf, m - r * nf))
    const fi = (c - h * (C / 2)) * F + f, pos = h === 0 ? H - 1 - fi : fi   // distance from the colours, in files
    return pos < cr
  }
  // when the files or the last rank cannot centre exactly, they lean one way; Face about flips the lean, so
  // the fill mirrors with the turn and every man of a complete file keeps his place
  const lean = w.f.lean[i] === 1, half = (n: number) => lean ? Math.ceil(n / 2) : Math.floor(n / 2)
  const m = men[i * C + c], nf = Math.min(F, Math.ceil(m / R)), start = half(F - nf), cr = Math.max(0, Math.min(nf, m - r * nf))
  const off = half(nf - cr), fi = f - start - off
  return fi >= 0 && fi < cr
}
// bitmask of company c's filled slots (r · files + f, at most 32: ruleset.ts) on impassable ground, as the
// battalion stands now (bit 31 makes it negative; only & and nonzero tests read it)
export function wetSlots(w: World, i: number, c: number): number {
  const f = w.f, g = w.cr.geo, imp = w.terrain.imp[kindOf(w, i)]
  let mask = 0
  if (f.trans[i]) {
    const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], now(w), 0, wbPose), ca = cos(p.a), sa = sin(p.a)
    for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) { if (!occupied(w, i, c, r, q)) continue
      const [lx, lz] = blockLocal(g, q, r); if (imp[cellK(w.terrain, p.x + lx * ca - lz * sa, p.z + lx * sa + lz * ca)]) mask |= 1 << (r * g.files + q) }
    return mask
  }
  const ctx = ctxNow(w, i)
  for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) {
    if (!occupied(w, i, c, r, q)) continue
    placeAt(ctx, c, r, q, pt); if (imp[cellK(w.terrain, pt[0], pt[1])]) mask |= 1 << (r * g.files + q)
  }
  return mask
}
const wetWas = new Int32Array(MAX_BINS)   // per company (a battalion has at most MAX_BINS / BINS)
// takes one man from company q unless the re-pack puts a man newly on impassable ground; the companies the
// re-pack can touch are q's own, or for a shape that closes across companies, q's half
function takeIfDry(w: World, i: number, q: number, near: boolean): boolean {
  const f = w.f, C = w.cr.geo.companies, k = i * C
  if (f.men[k + q] <= 0) return false
  if (!near) { f.men[k + q]--; return true }
  const across = targetLayout(w, i).def.closeAcross && C % 2 === 0, lo = across ? (q < C / 2 ? 0 : C / 2) : q, hi = across ? lo + C / 2 : q + 1
  for (let c = lo; c < hi; c++) wetWas[c] = wetSlots(w, i, c)
  f.men[k + q]--
  for (let c = lo; c < hi; c++) if (wetSlots(w, i, c) & ~wetWas[c]) { f.men[k + q]++; return false }
  return true
}
// One man of company c falls (docs/plans/active/s1c3-repack-gate.md). The fill rule re-packs the company; if
// that would put a man newly on impassable ground, another company takes the loss: those with hits still
// owed in `first` (per company of battalion i) before the rest, each nearest by index first. If none can,
// the loss falls on c (or, if c is empty, the nearest company with men) and is counted in `pressed`. No
// random draws. Returns the company that lost the man, or −1 if the battalion has none left.
export function removeMan(w: World, i: number, c: number, first?: ArrayLike<number>): number {
  const f = w.f, C = w.cr.geo.companies, k = i * C, near = !clearOfImpassable(w, i)
  if (takeIfDry(w, i, c, near)) return c
  for (let pass = 0; pass < 2; pass++) for (let d = 1; d < C; d++) for (let s = -1; s <= 1; s += 2) {
    const q = c + s * d
    if (q < 0 || q >= C || ((first ? first[q] > 0 : false) !== (pass === 0))) continue
    if (takeIfDry(w, i, q, near)) return q
  }
  let q = f.men[k + c] > 0 ? c : -1
  for (let d = 1; q < 0 && d < C; d++) for (let s = -1; s <= 1 && q < 0; s += 2) { const r = c + s * d; if (r >= 0 && r < C && f.men[k + r] > 0) q = r }
  if (q < 0) return -1
  f.men[k + q]--; f.pressed[i]++
  return q
}
export function rebalance(w: World, i: number): void {
  const C = w.cr.geo.companies; let tot = 0
  for (let c = 0; c < C; c++) tot += w.f.men[i * C + c]
  for (let c = 0; c < C; c++) w.f.men[i * C + c] = Math.floor(tot / C) + (c < tot % C ? 1 : 0)
}
export function menOf(w: World, i: number): number { const C = w.cr.geo.companies; let m = 0; for (let c = 0; c < C; c++) m += w.f.men[i * C + c]; return m }

/* ---------------- the march trail: a ring of points, oldest first ---------------- */
const tIdx = (w: World, i: number, k: number) => i * TRAIL + ((w.f.trailStart[i] + k) % TRAIL)
function trailPush(w: World, i: number, x: number, z: number): void {
  const f = w.f
  if (f.trailCount[i] === TRAIL) {   // full: drop the oldest point and its segment
    const a = tIdx(w, i, 0), b = tIdx(w, i, 1); f.trailLen[i] -= hyp(f.trailX[b] - f.trailX[a], f.trailZ[b] - f.trailZ[a])
    f.trailStart[i] = (f.trailStart[i] + 1) % TRAIL; f.trailCount[i]-- }
  const k = tIdx(w, i, f.trailCount[i]); f.trailX[k] = x; f.trailZ[k] = z; f.trailCount[i]++; f.trailVer[i]++
}
function trailDropOldest(w: World, i: number): void { w.f.trailStart[i] = (w.f.trailStart[i] + 1) % TRAIL; w.f.trailCount[i]--; w.f.trailVer[i]++ }
export function resetTrail(w: World, i: number): void {
  const f = w.f, n = 8
  f.trailStart[i] = 0; f.trailCount[i] = 0
  for (let k = n; k >= 0; k--) trailPush(w, i, f.x[i] - sin(f.heading[i]) * k * 6, f.z[i] - cos(f.heading[i]) * k * 6)
  f.trailLen[i] = n * 6
}
function pushTrail(w: World, i: number): void {
  const f = w.f, last = tIdx(w, i, f.trailCount[i] - 1), d = hyp(f.x[i] - f.trailX[last], f.z[i] - f.trailZ[last])
  if (d < 0.25) return
  trailPush(w, i, f.x[i], f.z[i]); f.trailLen[i] += d
  const lim = layoutOf(w, i).trailLimit
  for (;;) {
    if (f.trailCount[i] <= 2) break
    const a = tIdx(w, i, 0), b = tIdx(w, i, 1), s = hyp(f.trailX[b] - f.trailX[a], f.trailZ[b] - f.trailZ[a])
    if (f.trailLen[i] - s <= lim) break
    f.trailLen[i] -= s; trailDropOldest(w, i)
  }
}
function setTrail(w: World, i: number, xs: number[], zs: number[]): void {
  const f = w.f; f.trailStart[i] = 0; f.trailCount[i] = 0
  for (let k = Math.max(0, xs.length - TRAIL); k < xs.length; k++) trailPush(w, i, xs[k], zs[k])
  f.trailLen[i] = 0
  for (let k = 1; k < f.trailCount[i]; k++) { const a = tIdx(w, i, k - 1), b = tIdx(w, i, k); f.trailLen[i] += hyp(f.trailX[b] - f.trailX[a], f.trailZ[b] - f.trailZ[a]) }
}

// arc length from a head (hx, hz) back along the trail
export interface Arc { i: number; hx: number; hz: number; h: number; ver: number; P: Float64Array; S: Float64Array; n: number }
const mkArc = (): Arc => ({ i: -1, hx: 0, hz: 0, h: 0, ver: -1, P: new Float64Array(2 * (TRAIL + 2)), S: new Float64Array(TRAIL + 2), n: 0 })
function arcOf(w: World, i: number, hx: number, hz: number, h: number, a: Arc): Arc {
  if (a.i === i && a.hx === hx && a.hz === hz && a.h === h && a.ver === w.f.trailVer[i]) return a
  a.i = i; a.hx = hx; a.hz = hz; a.h = h; a.ver = w.f.trailVer[i]
  let px = hx, pz = hz, acc = 0, n = 0
  a.P[0] = px; a.P[1] = pz; a.S[0] = 0; n = 1
  for (let k = w.f.trailCount[i] - 1; k >= 0; k--) {
    const q = tIdx(w, i, k), d = hyp(w.f.trailX[q] - px, w.f.trailZ[q] - pz)
    if (d < 1e-6) continue
    acc += d; px = w.f.trailX[q]; pz = w.f.trailZ[q]; a.P[2 * n] = px; a.P[2 * n + 1] = pz; a.S[n] = acc; n++
  }
  a.n = n; return a
}
// the point D metres back along the trail (negative: ahead of the head, along its heading)
function trailPoint(a: Arc, D: number, out: number[]): number[] {
  const P = a.P, S = a.S, n = a.n
  if (D <= 0 || n < 2) { out[0] = a.hx - sin(a.h) * D; out[1] = a.hz - cos(a.h) * D; return out }
  if (D >= S[n - 1]) { const ax = P[2 * n - 2], az = P[2 * n - 1], dx = ax - P[2 * n - 4], dz = az - P[2 * n - 3], l = hyp(dx, dz) || 1, e = D - S[n - 1]
    out[0] = ax + dx / l * e; out[1] = az + dz / l * e; return out }
  let lo = 0, hi = n - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= D) lo = m; else hi = m }
  const u = (D - S[lo]) / (S[hi] - S[lo])
  out[0] = P[2 * lo] + (P[2 * hi] - P[2 * lo]) * u; out[1] = P[2 * lo + 1] + (P[2 * hi + 1] - P[2 * lo + 1]) * u; return out
}
const tA = [0, 0], tB = [0, 0], tC = [0, 0]
const arcOfWorld = (w: World): Arc => w.scratch.arc ?? (w.scratch.arc = mkArc())

interface Pose { x: number; z: number; a: number; face: number }
const plTmp: Placement = { x: 0, z: 0, rot: 0, face: 0 }
// a company's pose in world space: origin, block rotation a (counter-clockwise) and facing (a heading)
export function placeWorld(w: World, i: number, c: number, hx: number, hz: number, h: number, t: number, extra: number, out: Pose): Pose {
  if (snakes(w, i)) {
    const L = layoutOf(w, i), back = -L.place[c].z + extra, arc = arcOf(w, i, hx, hz, h, arcOfWorld(w))
    trailPoint(arc, back, tA); trailPoint(arc, back + 2, tB); trailPoint(arc, back - 2, tC)
    const ch = atan2(tC[0] - tB[0], tC[1] - tB[1])
    out.x = tA[0]; out.z = tA[1]; out.a = L.place[c].rot - ch; out.face = ch - L.place[c].face; return out
  }
  const pl = companyPlace(w, i, c, t, plTmp), o = rot2(pl.x, pl.z, -h)
  out.x = hx + o[0]; out.z = hz + o[1]; out.a = pl.rot - h; out.face = h - pl.face; return out
}
const cpPose: Pose = { x: 0, z: 0, a: 0, face: 0 }
// a company's placement in the battalion frame (interpolated during a change: wheeling around the flank it
// turns to)
export function companyPlace(w: World, i: number, c: number, t: number, out: Placement): Placement {
  const f = w.f, C = w.cr.geo.companies
  if (snakes(w, i)) {
    const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, cpPose), l = rot2(p.x - f.x[i], p.z - f.z[i], f.heading[i])
    out.x = l[0]; out.z = l[1]; out.rot = p.a + f.heading[i]; out.face = f.heading[i] - p.face; return out
  }
  if (!f.trans[i]) { const p = layoutOf(w, i).place[c]; out.x = p.x; out.z = p.z; out.rot = p.rot; out.face = p.face; return out }
  const k = (i * C + c) * 4, A = f.tFrom, B = f.tTo
  const u0 = (t - f.tStart[i] - f.tDelay[i * C + c]) / f.tDur[i], u = Math.min(1, Math.max(0, u0)), e = u * u * (3 - 2 * u)
  const d = wrapAngle(B[k + 2] - A[k + 2])
  if (Math.abs(d) < 1e-3) { out.x = A[k] + (B[k] - A[k]) * e; out.z = A[k + 1] + (B[k + 1] - A[k + 1]) * e; out.rot = A[k + 2]; out.face = A[k + 3] + (B[k + 3] - A[k + 3]) * e; return out }
  const bw2 = BW(w) / 2, plx = d > 0 ? -bw2 : bw2
  const a0 = rot2(plx, 0, A[k + 2]), a1 = rot2(plx, 0, B[k + 2])
  const pivx = A[k] + a0[0] + (B[k] + a1[0] - A[k] - a0[0]) * e, pivz = A[k + 1] + a0[1] + (B[k + 1] + a1[1] - A[k + 1] - a0[1]) * e
  const rot = A[k + 2] + d * e, o = rot2(plx, 0, rot)
  out.x = pivx - o[0]; out.z = pivz - o[1]; out.rot = rot; out.face = A[k + 3] + wrapAngle(B[k + 3] - A[k + 3]) * e; return out
}

// a bin's lag dt seconds after the tick (the renderer's interpolation and look-ahead use dt ≠ 0)
export const lagAt = (w: World, i: number, j: number, dt: number): number => w.f.trans[i] ? 0 : Math.max(0, w.f.lags[i * w.cr.NB + j] + w.f.lagRate[i * w.cr.NB + j] * dt)

// where each man stands, for a pose (hx, hz, h) and a time: his slot set back by his bin's lag. A straight
// shape: per-bin frames, the lag along the heading. A trail shape: every man on the trail at his own
// distance behind the head (his place in the straight layout plus his lag), across it by his offset.
export interface Places { w: World; i: number; snake: boolean; dt: number; t: number; arc: Arc; fx: Float64Array; fz: Float64Array; fc: Float64Array; fs: Float64Array; ft: Float64Array }
export const mkPlaces = (w: World): Places => { const n = w.cr.NB; return { w, i: -1, snake: false, dt: 0, t: 0, arc: mkArc(), fx: new Float64Array(n), fz: new Float64Array(n), fc: new Float64Array(n), fs: new Float64Array(n), ft: new Float64Array(n) } }
const pcPose: Pose = { x: 0, z: 0, a: 0, face: 0 }
export function placesCtx(ctx: Places, i: number, hx: number, hz: number, h: number, t: number, dt: number): Places {
  const w = ctx.w; ctx.i = i; ctx.snake = snakes(w, i); ctx.dt = dt; ctx.t = t
  if (ctx.snake) { ctx.arc.ver = -1; arcOf(w, i, hx, hz, h, ctx.arc); return ctx }
  const sh = sin(h), ch = cos(h)
  for (let c = 0; c < w.cr.geo.companies; c++) {
    const p = placeWorld(w, i, c, hx, hz, h, t, 0, pcPose), ca = cos(p.a), sa = sin(p.a)
    for (let k = 0; k < BINS; k++) { const j = c * BINS + k, lag = lagAt(w, i, j, dt)
      ctx.fx[j] = p.x - sh * lag; ctx.fz[j] = p.z - ch * lag; ctx.fc[j] = ca; ctx.fs[j] = sa; ctx.ft[j] = h }
  }
  return ctx
}
// a man's place [x, z, direction of travel]
export function placeAt(ctx: Places, c: number, r: number, f: number, out: number[]): number[] {
  const w = ctx.w, g = w.cr.geo, L = layoutOf(w, ctx.i), s = slotIndex(g, c, r, f), j = c * BINS + L.of[s]
  if (!ctx.snake) {
    const [lx, lz] = blockLocal(g, f, r)
    out[0] = ctx.fx[j] + lx * ctx.fc[j] - lz * ctx.fs[j]; out[1] = ctx.fz[j] + lx * ctx.fs[j] + lz * ctx.fc[j]; out[2] = ctx.ft[j]; return out
  }
  const lx = L.posX[s], D = -L.posZ[s] + lagAt(w, ctx.i, j, ctx.dt)
  trailPoint(ctx.arc, D - 1, tA); trailPoint(ctx.arc, D + 1, tB)
  const t = atan2(tA[0] - tB[0], tA[1] - tB[1]); trailPoint(ctx.arc, D, tA)
  out[0] = tA[0] + cos(t) * lx; out[1] = tA[1] - sin(t) * lx; out[2] = t; return out
}
const ctxNow = (w: World, i: number): Places =>
  placesCtx(w.scratch.places ?? (w.scratch.places = mkPlaces(w)), i, w.f.x[i], w.f.z[i], w.f.heading[i], now(w), 0)
// the pace (m/s) and its index: a road pace while every man stood on a road at the last sampling
function paceOf(w: World, i: number): [number, number] {
  const L = layoutOf(w, i), p = L.roadPace >= 0 && !w.f.trans[i] && w.f.onRoad[i] ? L.roadPace : L.pace
  return [w.cr.paceSpeed[p] * (w.f.mstate[i] === MS_ROUTING ? w.cr.rs.morale.routPace : 1), p]
}

/* ---------------- the footprint gate ---------------- */
const wbPose: Pose = { x: 0, z: 0, a: 0, face: 0 }, pt = [0, 0, 0]
// bitmask of bins with a man's place on impassable ground, for the pose as it is now
// no place of battalion i can be on impassable ground: the ground's distance field says the nearest is
// farther than the battalion reaches
function clearOfImpassable(w: World, i: number): boolean {
  const f = w.f, C = w.cr.geo.companies, t = now(w)
  let reach = 0
  for (let c = 0; c < C; c++) { const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, wbPose); reach = Math.max(reach, hyp(p.x - f.x[i], p.z - f.z[i])) }
  let lmax = 0; for (let j = 0; j < w.cr.NB; j++) lmax = Math.max(lmax, f.lags[i * w.cr.NB + j])
  const kind = kindOf(w, i)
  return w.terrain.impd[kind][cellK(w.terrain, f.x[i], f.z[i])] > reach + BW(w) + lmax + 2
}
export function wetBins(w: World, i: number): number {
  const f = w.f, g = w.cr.geo, C = g.companies, R = g.ranks, F = g.files, t = now(w)
  if (clearOfImpassable(w, i)) return 0
  const imp = w.terrain.imp[kindOf(w, i)]
  let mask = 0
  if (f.trans[i]) {
    for (let c = 0; c < C; c++) {
      const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, wbPose), ca = cos(p.a), sa = sin(p.a)
      for (let r = 0; r < R; r++) for (let q = 0; q < F; q++) { if (!occupied(w, i, c, r, q)) continue
        const [lx, lz] = blockLocal(g, q, r); if (imp[cellK(w.terrain, p.x + lx * ca - lz * sa, p.z + lx * sa + lz * ca)]) mask |= 1 << (c * BINS) }
    }
    return mask
  }
  const ctx = ctxNow(w, i), L = layoutOf(w, i)
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) for (let q = 0; q < F; q++) {
    if (!occupied(w, i, c, r, q)) continue
    const j = c * BINS + L.of[slotIndex(g, c, r, q)]; if (mask & (1 << j)) continue
    placeAt(ctx, c, r, q, pt); if (imp[cellK(w.terrain, pt[0], pt[1])]) mask |= 1 << j
  }
  return mask
}
// apply(u) sets the pose for the fraction u of a step; keeps the largest of 1, ½, … that puts no bin newly
// on impassable ground (`before`: the bins already there), else 0
function gate(w: World, i: number, before: number, apply: (u: number) => void): number {
  for (let k = 0, u = 1; k <= GATE_HALVINGS; k++, u /= 2) { apply(u); if (!(wetBins(w, i) & ~before)) return u }
  apply(0); return 0
}

/* ---------------- the lag model ---------------- */
const MAXNB = MAX_BINS
const gTmp = new Float64Array(MAXNB), nTmp = new Int32Array(MAXNB), qTmp = new Float64Array(MAXNB), blkTmp = new Int32Array(MAXNB)
// each man's ground where he stands, along his direction of travel: a bin's g is the harmonic mean over
// its men, q its worst ground class; a bin is held (g = 0) when a man has impassable ground underfoot or one
// step ahead; binN counts its men (0: empty, left out of the solve)
function sampleBins(w: World, i: number, pace: number, V0: number): void {
  const f = w.f, g = w.cr.geo, NB = w.cr.NB, L = layoutOf(w, i), kind = L.kind, imp = w.terrain.imp[kind], look = V0 * w.cr.qMax * DT, ctx = ctxNow(w, i)
  gTmp.fill(0); nTmp.fill(0); qTmp.fill(Infinity); blkTmp.fill(0); let road = true
  for (let c = 0; c < g.companies; c++) for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) {
    if (!occupied(w, i, c, r, q)) continue
    const j = c * BINS + L.of[slotIndex(g, c, r, q)]
    placeAt(ctx, c, r, q, pt); const px = pt[0], pz = pt[1], dx = sin(pt[2]), dz = cos(pt[2])
    const gg = groundG(w.terrain, px, pz, kind, dx, dz)
    if (gg <= 0 || imp[cellK(w.terrain, px + dx * look, pz + dz * look)]) blkTmp[j]++; else { gTmp[j] += 1 / gg; nTmp[j]++ }
    if (road && !onRoad(w.terrain, px, pz)) road = false
    qTmp[j] = Math.min(qTmp[j], groundQ(w.terrain, px, pz, pace))
  }
  f.onRoad[i] = road ? 1 : 0
  for (let j = 0; j < NB; j++) { const b = i * NB + j
    f.binN[b] = nTmp[j] + blkTmp[j]; f.binG[b] = blkTmp[j] ? 0 : nTmp[j] ? nTmp[j] / gTmp[j] : 1; f.binQ[b] = qTmp[j] === Infinity ? 1 : qTmp[j] }
}
// the accordion: a bin's lag is at least the lag of each bin wholly ahead of it, less the room between
function accordion(w: World, i: number): void {
  if (w.f.trans[i]) return
  const NB = w.cr.NB, b = i * NB, f = w.f
  for (const [a, j, room] of layoutOf(w, i).pairs) if (f.binN[b + a] && f.binN[b + j]) f.lags[b + j] = Math.max(f.lags[b + j], f.lags[b + a] - room)
}
const capTmp = new Float64Array(MAXNB), ordTmp: number[] = []
// the battalion's speed this tick toward `want`, given its pace V0; advances the lags and the disorder.
// Returns the speed and how far the leading file fell back (the anchor stays with it).
function lagStep(w: World, i: number, V0: number, want: number): [number, number] {
  const f = w.f, NB = w.cr.NB, b = i * NB, P = w.cr.rs.orders[w.cr.presets[f.style[i]]], tau = P.tau
  ordTmp.length = 0; for (let j = 0; j < NB; j++) if (f.binN[b + j]) ordTmp.push(j); else f.lags[b + j] = 0
  const n = ordTmp.length; if (!n) return [want, 0]
  for (const j of ordTmp) capTmp[j] = V0 * f.binG[b + j] * f.binQ[b + j]
  let V = want
  for (const j of ordTmp) V = Math.min(V, capTmp[j] + (P.Lmax - f.lags[b + j]) / tau)   // no file beyond Lmax
  V = Math.max(0, V)
  // the line's mean lag must not grow past Lmean: n·V − Σ min(cap_j, V + l_j/τ) ≤ n (Lmean − l̄)/τ, solved
  // exactly by walking the breakpoints t_j = cap_j − l_j/τ in ascending order
  let lbar = 0; for (const j of ordTmp) lbar += f.lags[b + j]; lbar /= n
  const S = n * (P.Lmean - lbar) / tau
  ordTmp.sort((p, q) => (capTmp[p] - f.lags[b + p] / tau) - (capTmp[q] - f.lags[b + q] / tau) || p - q)
  let heldCap = 0, freeLag = 0; for (const j of ordTmp) freeLag += f.lags[b + j] / tau
  for (let k = 0; k < n; k++) {
    const j = ordTmp[k], t = capTmp[j] - f.lags[b + j] / tau; heldCap += capTmp[j]; freeLag -= f.lags[b + j] / tau
    const next = k + 1 < n ? capTmp[ordTmp[k + 1]] - f.lags[b + ordTmp[k + 1]] / tau : Infinity
    const Vk = (S + heldCap + freeLag) / (k + 1)
    if (Vk <= next && Vk >= t) { V = Math.max(0, Math.min(V, Vk)); break }
    if (Vk < t) { V = Math.max(0, Math.min(V, t)); break }
  }
  for (const j of ordTmp) { const u = Math.min(capTmp[j], V + f.lags[b + j] / tau); f.lags[b + j] = Math.max(0, f.lags[b + j] + (V - u) * DT) }
  accordion(w, i)
  let m = Infinity; for (const j of ordTmp) m = Math.min(m, f.lags[b + j])
  for (const j of ordTmp) f.lags[b + j] -= m   // the reference stays on the leading file
  updateDisorder(w, i, V, V0)
  return [V, m]
}
// disorder: grows with a file far behind and with the line's bow, recovers once dressed (faster halted);
// bins held at impassable ground are left out
function updateDisorder(w: World, i: number, V: number, V0: number): void {
  const f = w.f, NB = w.cr.NB, b = i * NB, D = w.cr.rs.disorder
  let lmax = 0, lsum = 0, n = 0
  for (let j = 0; j < NB; j++) { if (f.binG[b + j] <= 0 || !f.binN[b + j]) continue; lmax = Math.max(lmax, f.lags[b + j]); lsum += f.lags[b + j]; n++ }
  const lbar = n ? lsum / n : 0
  const grow = D.kLag * Math.max(0, lmax - D.Lok) / D.Lok * (V / Math.max(1e-6, V0)) + D.kBow * Math.max(0, lbar - D.Lok / 3) / D.Lok
  const rec = lmax < D.Lok ? D.kRec * (V < 0.05 ? 3 : 1) : 0
  f.disorder[i] = Math.min(1, Math.max(0, f.disorder[i] + (grow * (D.scale[w.cr.kinds[layoutOf(w, i).kind]] ?? 1) - rec) * DT))
}
// the anchor d metres back: along the trail for a trail shape (the trail ahead of it dropped), else the heading
function stepBack(w: World, i: number, d: number): void {
  const f = w.f; f.onRoad[i] = 0
  if (!snakes(w, i)) { f.x[i] -= sin(f.heading[i]) * d; f.z[i] -= cos(f.heading[i]) * d; return }
  let px = f.x[i], pz = f.z[i], left = d, keep = f.trailCount[i]
  for (let k = f.trailCount[i] - 1; k >= 0; k--) {
    const q = tIdx(w, i, k), s = hyp(px - f.trailX[q], pz - f.trailZ[q])
    if (s >= left && s > 1e-9) { f.x[i] = px + (f.trailX[q] - px) * left / s; f.z[i] = pz + (f.trailZ[q] - pz) * left / s; f.heading[i] = atan2(f.x[i] - f.trailX[q], f.z[i] - f.trailZ[q]); keep = k + 1; break }
    left -= s; px = f.trailX[q]; pz = f.trailZ[q]
    if (k === 0) { f.x[i] = px; f.z[i] = pz; keep = 1 }
  }
  const xs: number[] = [], zs: number[] = []
  for (let k = 0; k < keep; k++) { const q = tIdx(w, i, k); xs.push(f.trailX[q]); zs.push(f.trailZ[q]) }
  xs.push(f.x[i]); zs.push(f.z[i]); setTrail(w, i, xs, zs)
}

/* ---------------- orders (a list in the order pool) ---------------- */
export function allocOrder(w: World, type: number): number {
  const o = w.ord, n = o.meta[0]; if (n < 0) return -1
  o.meta[0] = o.next[n]; o.meta[1]++
  o.type[n] = type; o.shape[n] = 0; o.finish[n] = 0; o.left[n] = -1; o.resolved[n] = 0; o.optional[n] = 0
  o.x[n] = 0; o.z[n] = 0; o.a[n] = 0; o.t0[n] = -1; o.px[n] = 0; o.pz[n] = 0; o.done[n] = 0; o.next[n] = -1
  return n
}
function freeOrder(w: World, n: number): void {
  const o = w.ord
  o.type[n] = 0; o.shape[n] = 0; o.finish[n] = 0; o.left[n] = 0; o.resolved[n] = 0; o.optional[n] = 0
  o.x[n] = 0; o.z[n] = 0; o.a[n] = 0; o.t0[n] = 0; o.px[n] = 0; o.pz[n] = 0; o.done[n] = 0
  o.next[n] = o.meta[0]; o.meta[0] = n; o.meta[1]--
}
export function appendOrder(w: World, i: number, n: number): void {
  const f = w.f; if (f.ordTail[i] < 0) f.ordHead[i] = n; else w.ord.next[f.ordTail[i]] = n
  f.ordTail[i] = n
}
export function shiftOrder(w: World, i: number): void {
  const f = w.f, n = f.ordHead[i]; if (n < 0) return
  f.ordHead[i] = w.ord.next[n]; if (f.ordHead[i] < 0) f.ordTail[i] = -1
  freeOrder(w, n)
}
// an order's point, kept 2 m inside the map on each axis (Retire, a router's run)
export function setOnMap(w: World, n: number, x: number, z: number): void {
  const t = w.terrain, lo = 2, hi = (t.n - 1) * t.cell - 2
  w.ord.x[n] = Math.min(t.x0 + hi, Math.max(t.x0 + lo, x)); w.ord.z[n] = Math.min(t.z0 + hi, Math.max(t.z0 + lo, z))
}
export function clearOrders(w: World, i: number): void { while (w.f.ordHead[i] >= 0) shiftOrder(w, i) }
export const ordersFree = (w: World): number => w.ord.type.length - w.ord.meta[1]
// a halt drops the orders except those that finish a drill (Retire's dress and last Face about)
function haltOrders(w: World, i: number): void {
  const f = w.f, o = w.ord; let n = f.ordHead[i]; const keep: number[] = []
  while (n >= 0) { const nx = o.next[n]; if (o.finish[n]) keep.push(n); else freeOrder(w, n); n = nx }
  f.ordHead[i] = -1; f.ordTail[i] = -1
  for (const k of keep) { o.next[k] = -1; appendOrder(w, i, k) }
}

/* ---------------- shape changes ---------------- */
function layoutDistance(A: ArrayLike<number>, B: ArrayLike<number>, C: number, bw: number): number {
  let m = 0
  for (let c = 0; c < C; c++) { const d = wrapAngle(B[c * 4 + 2] - A[c * 4 + 2])
    m = Math.max(m, hyp(A[c * 4] - B[c * 4], A[c * 4 + 1] - B[c * 4 + 1]) + Math.abs(d) * bw / 2) }
  return m
}
const placeFlat = (pl: Placement[]): number[] => pl.flatMap(p => [p.x, p.z, p.rot, p.face])
const ccPose: Pose = { x: 0, z: 0, a: 0, face: 0 }
// would any pose of the change now set on formation i (sampled along it, its end included) put a slot,
// filled or empty, on ground impassable for the new shape's kind?
function changeWet(w: World, i: number): boolean {
  const f = w.f, g = w.cr.geo, C = g.companies, kind = targetLayout(w, i).kind, imp = w.terrain.imp[kind]
  let reach = 0
  for (let c = 0; c < C; c++) { const k = (i * C + c) * 4; reach = Math.max(reach, hyp(f.tFrom[k], f.tFrom[k + 1]), hyp(f.tTo[k], f.tTo[k + 1])) }
  let lmax = 0; for (let j = 0; j < w.cr.NB; j++) lmax = Math.max(lmax, f.lags[i * w.cr.NB + j])
  if (w.terrain.impd[kind][cellK(w.terrain, f.x[i], f.z[i])] > reach + BW(w) + lmax + 2) return false
  const span = f.tDelay[i * C + C - 1] + f.tDur[i]
  for (let k = 0; k <= CHANGE_SAMPLES; k++) {
    const t = f.tStart[i] + span * k / CHANGE_SAMPLES
    for (let c = 0; c < C; c++) {
      const p = placeWorld(w, i, c, f.x[i], f.z[i], f.heading[i], t, 0, ccPose), ca = cos(p.a), sa = sin(p.a)
      for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) { const [lx, lz] = blockLocal(g, q, r)
        if (imp[cellK(w.terrain, p.x + lx * ca - lz * sa, p.z + lx * sa + lz * ca)]) return true }
    }
  }
  return false
}
const csPlace: Placement = { x: 0, z: 0, rot: 0, face: 0 }
// starts a change to `shape`; refused (and the orders dropped) if its path crosses impassable ground
export function startChange(w: World, i: number, shape: number): boolean {
  const f = w.f, C = w.cr.geo.companies, S = w.cr.shapes.length, t = now(w)
  if (shape === f.shape[i] && !f.trans[i]) return false
  if (f.trans[i] && shape === f.tShape[i]) return false
  const from: number[] = []
  for (let c = 0; c < C; c++) { const p = companyPlace(w, i, c, t, csPlace); from.push(p.x, p.z, p.rot, p.face) }
  const to = placeFlat(w.cr.shapes[shape].place)
  // an interrupted change is timed by the distance still to cover against a full change of the same kind
  const base = shape === f.shape[i] && f.trans[i] ? f.tShape[i] : f.shape[i]
  let T = w.cr.changeTime[base * S + shape] * f.drill[i]
  if (f.trans[i]) { const full = layoutDistance(placeFlat(w.cr.shapes[base].place), to, C, BW(w)); T = Math.max(3, T * Math.min(1, layoutDistance(from, to, C, BW(w)) / Math.max(1e-6, full))) }
  // try it: the change's fields set, checked along its path, kept or restored
  const keep = { trans: f.trans[i], tShape: f.tShape[i], tStart: f.tStart[i], tDur: f.tDur[i], delay: f.tDelay.slice(i * C, i * C + C), from: f.tFrom.slice(i * C * 4, i * C * 4 + C * 4), to: f.tTo.slice(i * C * 4, i * C * 4 + C * 4) }
  f.trans[i] = 1; f.tShape[i] = shape; f.tStart[i] = t; f.tDur[i] = T * 0.55
  for (let c = 0; c < C; c++) f.tDelay[i * C + c] = C > 1 ? c * T * 0.45 / (C - 1) : 0
  f.tFrom.set(from, i * C * 4); f.tTo.set(to, i * C * 4)
  if (changeWet(w, i)) {
    f.trans[i] = keep.trans; f.tShape[i] = keep.tShape; f.tStart[i] = keep.tStart; f.tDur[i] = keep.tDur
    f.tDelay.set(keep.delay, i * C); f.tFrom.set(keep.from, i * C * 4); f.tTo.set(keep.to, i * C * 4)
    clearOrders(w, i); f.status[i] = ST_CANNOT_FORM; return false
  }
  f.vx[i] = 0; f.vz[i] = 0; f.omega[i] = 0; f.onRoad[i] = 0
  for (let j = 0; j < w.cr.NB; j++) f.lags[i * w.cr.NB + j] = 0
  if (!w.cr.shapes[shape].def.closeAcross) rebalance(w, i)
  return true
}

/* ---------------- Face about, halts, settling ---------------- */
const rateOff = new Uint8Array(MAX_FORMATIONS)
// returns 0 when done, else a status code
function faceAbout(w: World, i: number): number {
  const f = w.f, g = w.cr.geo, C = g.companies, NB = w.cr.NB, b = i * NB, L = layoutOf(w, i), T = L.turn
  if (!T) return ST_FACE_ASYM
  if (f.trans[i]) return ST_FACE_CHANGING
  const snake = snakes(w, i); if (snake && Math.abs(T.cx) > 1e-6) return ST_FACE_OFFCENTRE
  const keep = { x: f.x[i], z: f.z[i], h: f.heading[i], lags: f.lags.slice(b, b + NB), men: f.men.slice(i * C, i * C + C),
    tx: [] as number[], tz: [] as number[] }
  for (let k = 0; k < f.trailCount[i]; k++) { const q = tIdx(w, i, k); keep.tx.push(f.trailX[q]); keep.tz.push(f.trailZ[q]) }
  const before0 = wetBins(w, i)
  // a file l behind its place stands L − l ahead of its mirrored place once the anchor steps back by L
  let Lm = 0; for (let j = 0; j < NB; j++) if (f.binN[b + j]) Lm = Math.max(Lm, f.lags[b + j])
  const lag1 = new Float64Array(NB); for (let j = 0; j < NB; j++) lag1[T.bin[j]] = f.binN[b + j] ? Lm - f.lags[b + j] : 0
  let before = 0; for (let j = 0; j < NB; j++) if (before0 & (1 << j)) before |= 1 << T.bin[j]
  if (snake) {
    const Dt = -2 * T.cz + Lm, arc = arcOf(w, i, f.x[i], f.z[i], f.heading[i], mkArc()), p = trailPoint(arc, Dt, [0, 0]), pa = trailPoint(arc, Dt - 1, [0, 0]), pb = trailPoint(arc, Dt + 1, [0, 0])
    const xs: number[] = [], zs: number[] = []
    for (let D = -15; D < Dt; D += 0.25) { const q = trailPoint(arc, D, [0, 0]); xs.push(q[0]); zs.push(q[1]) }
    f.x[i] = p[0]; f.z[i] = p[1]; f.heading[i] = atan2(pb[0] - pa[0], pb[1] - pa[1]); setTrail(w, i, xs, zs)
  } else {
    const o = rot2(T.cx, T.cz, -f.heading[i])
    f.x[i] += 2 * o[0] - sin(f.heading[i]) * Lm; f.z[i] += 2 * o[1] - cos(f.heading[i]) * Lm; f.heading[i] = wrapAngle(f.heading[i] + PI)
  }
  f.lags.set(lag1, b)
  // the companies change labels with the slots; the fill rule then closes each file toward its new front
  const RF = g.ranks * g.files
  for (let c = 0; c < C; c++) f.men[i * C + Math.floor(T.m[c * RF] / RF)] = keep.men[c]
  if (T.flipsFiles) f.lean[i] ^= 1   // the files reverse: the fill's lean reverses with them
  if (wetBins(w, i) & ~before) {
    if (T.flipsFiles) f.lean[i] ^= 1
    f.x[i] = keep.x; f.z[i] = keep.z; f.heading[i] = keep.h; f.lags.set(keep.lags, b); f.men.set(keep.men, i * C)
    if (snake) setTrail(w, i, keep.tx, keep.tz)
    return ST_FACE_WET
  }
  // the companies' fire state goes with their men: reload, last volley, target, hits owed
  for (const a of [f.reload, f.volleyTick, f.target, f.owed]) {
    const was = a.slice(i * C, i * C + C)
    for (let c = 0; c < C; c++) a[i * C + Math.floor(T.m[c * RF] / RF)] = was[c]
  }
  f.px[i] = f.x[i]; f.pz[i] = f.z[i]; f.ph[i] = f.heading[i]; rateOff[i] = 1; f.onRoad[i] = 0; f.faces[i]++
  return 0
}
// stopped by impassable ground: the orders end (bar those finishing a drill) and the slots come back to
// where the held men stand
function haltAtEdge(w: World, i: number, held: number): void {
  const f = w.f, NB = w.cr.NB, b = i * NB
  haltOrders(w, i); f.vx[i] = 0; f.vz[i] = 0; f.omega[i] = 0; f.status[i] = ST_HALTED; f.blockedFor[i] = 0; rateOff[i] = 1
  let d = 0; for (let j = 0; j < NB; j++) if (held & (1 << j)) d = Math.max(d, f.lags[b + j])
  if (d > 0) {
    const before = wetBins(w, i), keep = { x: f.x[i], z: f.z[i], h: f.heading[i], lags: f.lags.slice(b, b + NB), tx: [] as number[], tz: [] as number[] }
    for (let k = 0; k < f.trailCount[i]; k++) { const q = tIdx(w, i, k); keep.tx.push(f.trailX[q]); keep.tz.push(f.trailZ[q]) }
    const snake = snakes(w, i)
    stepBack(w, i, d); for (let j = 0; j < NB; j++) f.lags[b + j] = Math.max(0, f.lags[b + j] - d)
    if (wetBins(w, i) & ~before) { f.x[i] = keep.x; f.z[i] = keep.z; f.heading[i] = keep.h; f.lags.set(keep.lags, b); if (snake) setTrail(w, i, keep.tx, keep.tz) }
  }
  f.px[i] = f.x[i]; f.pz[i] = f.z[i]; f.ph[i] = f.heading[i]
}
// not marching forward: lagging files walk up to their places at their ground's quick step; a file whose
// place would reach impassable ground stays where it is
const lagTmp = new Float64Array(MAXNB)
function lagSettle(w: World, i: number): void {
  const f = w.f, NB = w.cr.NB, b = i * NB
  if (f.trans[i]) return
  let any = false; for (let j = 0; j < NB; j++) if (f.lags[b + j] > 0) any = true
  if (!any) { if (f.disorder[i] > 0) updateDisorder(w, i, 0, w.cr.paceSpeed[layoutOf(w, i).pace]); return }
  const [V0, pace] = paceOf(w, i); sampleBins(w, i, pace, V0)
  const before = wetBins(w, i); for (let j = 0; j < NB; j++) lagTmp[j] = f.lags[b + j]
  for (let j = 0; j < NB; j++) if (f.binG[b + j] > 0) f.lags[b + j] = Math.max(0, f.lags[b + j] - V0 * f.binG[b + j] * f.binQ[b + j] * DT)
  accordion(w, i)
  const wet = wetBins(w, i) & ~before; for (let j = 0; j < NB; j++) if (wet & (1 << j)) f.lags[b + j] = lagTmp[j]
  updateDisorder(w, i, 0, V0)
}
// a trail shape's turning radius: men one file apart stay at least the minimum spacing apart inside the bend
const turnRadius = (w: World, i: number): number => layoutOf(w, i).half * w.cr.geo.fileSpacing / (w.cr.geo.fileSpacing - w.cr.geo.minSpacing)
const hwPlace: Placement = { x: 0, z: 0, rot: 0, face: 0 }
function halfWidth(w: World, i: number): number {
  if (snakes(w, i)) return layoutOf(w, i).half
  let m = 0; for (let c = 0; c < w.cr.geo.companies; c++) m = Math.max(m, Math.abs(companyPlace(w, i, c, now(w), hwPlace).x))
  return m + BW(w) / 2
}

/* ---------------- the tick ---------------- */
const tickLag0 = new Float64Array(MAXNB)
export function formationTick(w: World, i: number): void {
  const f = w.f, NB = w.cr.NB, b = i * NB
  for (let j = 0; j < NB; j++) tickLag0[j] = f.lags[b + j]
  rateOff[i] = 0
  formationStep(w, i)
  for (let j = 0; j < NB; j++) f.lagRate[b + j] = f.trans[i] || rateOff[i] ? 0 : (f.lags[b + j] - tickLag0[j]) / DT
}
function formationStep(w: World, i: number): void {
  const f = w.f, o = w.ord, NB = w.cr.NB, C = w.cr.geo.companies, t = now(w)
  f.px[i] = f.x[i]; f.pz[i] = f.z[i]; f.ph[i] = f.heading[i]; f.omega[i] = 0
  if (f.trans[i]) {   // no marching while the companies change places; a new shape order interrupts the change
    f.vx[i] = 0; f.vz[i] = 0
    const n = f.ordHead[i]
    if (n >= 0 && o.type[n] === O_FORM) { const s = o.shape[n]; shiftOrder(w, i); startChange(w, i, s); return }
    if (t >= f.tStart[i] + f.tDelay[i * C + C - 1] + f.tDur[i]) {
      f.shape[i] = f.tShape[i]; f.trans[i] = 0
      if (layoutOf(w, i).def.trail) resetTrail(w, i)
      if (!layoutOf(w, i).def.closeAcross) rebalance(w, i)
    }
    return
  }
  const n = f.ordHead[i]
  if (n < 0) { f.vx[i] = 0; f.vz[i] = 0; lagSettle(w, i); return }
  const h0 = f.heading[i], type = o.type[n]
  if (type === O_FORM) { const s = o.shape[n]; shiftOrder(w, i); startChange(w, i, s); return }
  const [V0, pace] = paceOf(w, i), halfW = halfWidth(w, i)
  if (type === O_MOVE) {
    if (!o.resolved[n]) { setOnMap(w, n, f.x[i] + sin(f.heading[i]) * o.a[n], f.z[i] + cos(f.heading[i]) * o.a[n]); o.resolved[n] = 1 }   // a distance ahead (Retire)
    const dx = o.x[n] - f.x[i], dz = o.z[n] - f.z[i], dist = hyp(dx, dz)
    if (dist < ARRIVE) { shiftOrder(w, i); f.vx[i] = 0; f.vz[i] = 0; return }
    const dh = wrapAngle(atan2(dx, dz) - f.heading[i])
    const wmax = 1.2 * V0 / halfW * DT   // the outer flank may not outrun the quick step
    const snake = snakes(w, i)
    if (snake) {   // a target inside the turning circle on the side it turns to cannot be reached: this move ends
      const R0 = turnRadius(w, i), sd = dh > 0 ? 1 : -1, cx = f.x[i] + cos(f.heading[i]) * R0 * sd, cz = f.z[i] - sin(f.heading[i]) * R0 * sd
      if (hyp(o.x[n] - cx, o.z[n] - cz) < R0) { shiftOrder(w, i); f.vx[i] = 0; f.vz[i] = 0; f.status[i] = ST_ARRIVED_NEAR; return }
    }
    const before = wetBins(w, i); let turnHeld = false
    const turnBy = (lim: number) => { const h1 = f.heading[i], turn = Math.max(-lim, Math.min(lim, dh)), ut = gate(w, i, before, u => { f.heading[i] = h1 + turn * u }); turnHeld = Math.abs(turn) > 1e-4 && ut < 1 }
    if (!snake) turnBy(wmax)
    // the advance: the lag model, then the gate holds any bin whose places would reach impassable ground
    sampleBins(w, i, pace, V0)
    const want0 = snake || (Math.abs(dh) < 1.0 && !turnHeld) ? Math.min(V0, dist / DT) : 0
    const lag0 = f.lags.slice(i * NB, i * NB + NB), x0 = f.x[i], z0 = f.z[i]
    const [V, back] = lagStep(w, i, V0, want0)
    const step = V * DT - back
    const lag1 = f.lags.slice(i * NB, i * NB + NB), sx = sin(f.heading[i]) * step, sz = cos(f.heading[i]) * step
    const set = (u: number) => { f.x[i] = x0 + sx * u; f.z[i] = z0 + sz * u; for (let j = 0; j < NB; j++) f.lags[i * NB + j] = lag0[j] + (lag1[j] - lag0[j]) * u }
    set(1)
    let held = 0
    if (step > 0) { const wet = wetBins(w, i) & ~before
      if (wet) { for (let j = 0; j < NB; j++) if (wet & (1 << j)) { lag1[j] = lag0[j] + step; held |= 1 << j } set(1); accordion(w, i); lag1.set(f.lags.slice(i * NB, i * NB + NB)) } }
    const ua = gate(w, i, before, set)
    pushTrail(w, i)
    const moved = step * ua
    if (snake) turnBy(Math.min(wmax, Math.max(0, moved) / turnRadius(w, i)))
    f.vx[i] = (f.x[i] - x0) / DT; f.vz[i] = (f.z[i] - z0) / DT
    for (let j = 0; j < NB; j++) if (f.binN[i * NB + j] && f.binG[i * NB + j] <= 0) held |= 1 << j
    if ((held || turnHeld) && (moved < STALL * DT || turnHeld) && (want0 > 0 || turnHeld)) { f.blockedFor[i] += DT; if (f.blockedFor[i] > HALT_AFTER) haltAtEdge(w, i, held) }
    else { f.blockedFor[i] = 0; if (moved > 0.001) f.status[i] = 0 }
  } else if (type === O_DRESS) {
    f.vx[i] = 0; f.vz[i] = 0; lagSettle(w, i); if (o.t0[n] < 0) o.t0[n] = t
    let lmax = 0; for (let j = 0; j < NB; j++) if (f.binN[i * NB + j]) lmax = Math.max(lmax, f.lags[i * NB + j])
    if (lmax < 0.05 || t - o.t0[n] > w.cr.rs.dressTime) shiftOrder(w, i)
  } else if (type === O_FACE) {
    f.vx[i] = 0; f.vz[i] = 0
    // a failed Face about drops the orders after it, unless it was optional (a router's: it runs as it stands)
    if (o.t0[n] < 0) { const why = faceAbout(w, i); if (why) { if (o.optional[n]) shiftOrder(w, i); else clearOrders(w, i); f.status[i] = why; return } o.t0[n] = t; f.blockedFor[i] = 0 }
    if (t - o.t0[n] >= w.cr.rs.faceTime * f.drill[i]) shiftOrder(w, i)
  } else if (type === O_WHEEL) {
    if (snakes(w, i)) { shiftOrder(w, i); f.status[i] = ST_CANNOT_WHEEL; return }
    lagSettle(w, i)
    if (o.left[n] < 0) { o.left[n] = o.a[n] > 0 ? 1 : 0; const piv = rot2(o.left[n] ? -halfW : halfW, 0, -f.heading[i]); o.px[n] = f.x[i] + piv[0]; o.pz[n] = f.z[i] + piv[1]; o.done[n] = 0 }
    const wq = Math.min(Math.abs(o.a[n]) - o.done[n], 1.0 * V0 / (2 * halfW) * DT)   // the outer flank at marching pace
    const sgn = o.a[n] > 0 ? -1 : 1, x0 = f.x[i], z0 = f.z[i], before = wetBins(w, i)
    const uw = gate(w, i, before, u => { const r = rot2(x0 - o.px[n], z0 - o.pz[n], -sgn * wq * u); f.x[i] = o.px[n] + r[0]; f.z[i] = o.pz[n] + r[1]; f.heading[i] = h0 + sgn * wq * u })
    f.vx[i] = (f.x[i] - x0) / DT; f.vz[i] = (f.z[i] - z0) / DT; o.done[n] += wq * uw; pushTrail(w, i)
    if (uw === 0) haltAtEdge(w, i, 0)
    else if (o.done[n] >= Math.abs(o.a[n]) - 1e-6) { shiftOrder(w, i); f.vx[i] = 0; f.vz[i] = 0 }
  }
  f.heading[i] = wrapAngle(f.heading[i])
  const dh = wrapAngle(f.heading[i] - h0); f.omega[i] = f.vx[i] || f.vz[i] ? dh / DT : 0
}
