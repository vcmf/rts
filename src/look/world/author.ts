// The authoring step for the look world (decision 0012, docs/plans/done/l0-spine.md L0a): the terrain formula,
// the meander's generation and the carve. It runs in Node (tools/build-look-data.ts), which ships the result as
// data; the page reads that data and never evaluates these formulas, except for checks. Ported from
// prototypes/painted-cinematic.html.
import { fbm, mulberry, sstep, vn } from '../noise.ts'
import { RIVER, SECTION_REACH, lerpA, riverQuery, section, setRiver, type RiverParams, type RiverQuery, type RiverSamples } from '../river.ts'

// terrain before the river is carved
export function baseH(x: number, z: number): number {
  let h = 7 * fbm(x * 0.0045 + 3, z * 0.0045) + 2 * fbm(x * 0.02 + 5, z * 0.02)
  h += 15 * Math.exp(-((x / 50) ** 2 + ((z - 6) / 36) ** 2))
  h += 6 * Math.exp(-(((x - 70) / 40) ** 2 + ((z + 20) / 40) ** 2))
  const r = Math.hypot(x, z); h += 28 * Math.min(1, Math.max(0, (r - 220) / 380)) * fbm(x * 0.003 - 9, z * 0.003 + 4)
  return h
}

// gentle valley axis west of the hill and the formation zones (verified by tools/river-check.js)
// (radius > 1 km, so the frame never folds)
export const axisX = (z: number): number => -108 + 8 * Math.sin(z * 0.0035 + 0.6) + 3 * Math.sin(z * 0.011)
const axisD = (z: number): number => 8 * 0.0035 * Math.cos(z * 0.0035 + 0.6) + 3 * 0.011 * Math.cos(z * 0.011)

// Bessel J0: sinuosity = 1/J0(theta0)
const J0 = (x: number): number => { let s = 0; for (let i = 0; i < 64; i++) { const t = (i + 0.5) / 64 * Math.PI; s += Math.cos(x * Math.sin(t)) } return s / 64 }

// the valley trough: land lowered toward the floodplain, never raised (q from riverQuery(x, z, true))
export type Trough = (x: number, z: number, h: number, q: RiverQuery | null) => number

export function generateRiver(): { samples: RiverSamples; trough: Trough } {
  const P: RiverParams = { id: 'goldbach', W0: 6, D0: 1.0, bankH: 1.1, floodplainW: 84, beltW: 58, valleySlope: 0.18, valleyFade: 22, theta0: 1.5, Js: 0.03, Jf: 0.02, v0: 0.6, seed: 7, z0: -1350, z1: 1350 }
  // 1. Kinoshita centre line in the valley frame (u along, v across), phase accumulated, per-bend jitter
  const ds = P.W0 / 4, U: number[] = [], Vv: number[] = []
  let u = 0, v = 0, ph = mulberry(P.seed)() * 6.283
  const nA = (k: number) => vn(k * 1.3 + P.seed, 3.1), nL = (k: number) => vn(k * 1.1 + P.seed, 7.7)
  while (u < P.z1 - P.z0) {
    const bend = ph / Math.PI
    const th0 = Math.min(1.85, P.theta0 * (0.65 + 0.7 * nA(bend)))       // ±35% amplitude per bend; >π/2 makes bends turn back, ≤1.85 keeps loops from touching
    const lam = 11 * P.W0 * (0.65 + 0.7 * nL(bend)) / J0(th0)              // valley wavelength ≈ 11 W (±35%) × sinuosity
    let th = th0 * Math.sin(ph) + th0 ** 3 * (P.Js * Math.cos(3 * ph) - P.Jf * Math.sin(3 * ph))
    const vb = v / (P.beltW / 2); th -= 1.2 * vb * vb * vb                    // cubic restoring term: free in the middle, firm at the belt edge
    u += Math.cos(th) * ds; v += Math.sin(th) * ds; ph += 2 * Math.PI * ds / lam
    U.push(u); Vv.push(v)
  }
  // 2. onto the valley axis: P = A(z) + N(z)·v
  const n = U.length, F = (k: number) => new Float32Array(k)
  const C = { P, n, px: F(n), pz: F(n), tx: F(n), tz: F(n), s: F(n), kappa: F(n), W: F(n), D: F(n), A: F(n), riffle: F(n), zw: F(n), v: F(n), tau: F(n) }
  for (let i = 0; i < n; i++) { const z = P.z0 + U[i], d = axisD(z), l = Math.hypot(1, d); C.px[i] = axisX(z) + Vv[i] / l; C.pz[i] = z - Vv[i] * d / l }
  // flow from the higher end to the lower end, so the water surface follows the land
  if (baseH(C.px[0], C.pz[0]) < baseH(C.px[n - 1], C.pz[n - 1])) { C.px.reverse(); C.pz.reverse() }
  // 3. tangents, arc length, signed curvature (smoothed over ~1 W)
  const ang = F(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), ex = C.px[b] - C.px[a], ez = C.pz[b] - C.pz[a], l = Math.hypot(ex, ez) || 1
    C.tx[i] = ex / l; C.tz[i] = ez / l; ang[i] = Math.atan2(ez, ex); if (i) C.s[i] = C.s[i - 1] + Math.hypot(C.px[i] - C.px[i - 1], C.pz[i] - C.pz[i - 1])
  }
  const k0 = F(n); for (let i = 1; i < n - 1; i++) { let d = ang[i + 1] - ang[i - 1]; d = Math.atan2(Math.sin(d), Math.cos(d)); k0[i] = d / (C.s[i + 1] - C.s[i - 1]) }
  const boxSmooth = (src: Float32Array, dst: Float32Array, R: number) => { for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < n) { a += src[j]; c++ } } dst[i] = a / c } }
  boxSmooth(k0, C.kappa, 8)
  // 4. attributes (research §2.3). Q grows slowly downstream (unseen tributaries)
  const WMIN = 4, WMAX = 11, softClamp = (x: number, lo: number, hi: number) => { const k = 1.5, sm = (a: number, b: number) => 0.5 * (a + b + Math.sqrt((a - b) ** 2 + k * k)); x = sm(x, lo); return -sm(-x, -hi) }
  let rph = 0                                                             // straight-reach riffle phase, accumulated along s
  for (let i = 0; i < n; i++) {
    const Q = 0.8 + 0.5 * C.s[i] / C.s[n - 1]
    const k = C.kappa[Math.max(0, i - 2)]                                 // sampled ~0.5 W upstream: pools sit just past the apex
    const bendness = Math.min(1, Math.abs(k) * P.W0 * 2.3)
    if (i) rph += 2 * Math.PI * (C.s[i] - C.s[i - 1]) / (6 * C.W[i - 1])    // riffles about 6 local widths apart
    const straight = 0.5 + 0.5 * Math.cos(rph)
    // docs/art-bible.md §6c: 4–11 m. Each stretch of 2–3 bends has its own width (slow noise), bends narrow, straight riffles widen.
    // Soft limits: the narrowest bends ease into 4 m instead of sitting flat on it
    const reach = 0.55 + 0.9 * vn(C.s[i] / (28 * P.W0), 5.3)
    const W = softClamp(P.W0 * Math.sqrt(Q) * reach * (1.2 - 0.45 * bendness) * (1 + 0.35 * straight * (1 - bendness)), WMIN, WMAX)
    const riffle = Math.max(1 - Math.min(1, bendness * 1.6), (1 - bendness) * straight)
    C.W[i] = W; C.riffle[i] = riffle
    C.A[i] = Math.max(-1, Math.min(1, -k * W * 1.6))                        // + : outer (cut) bank on the +n side (section())
  }
  // width changes over ~2 W, never per sample (a jump notches both banks)
  boxSmooth(Float32Array.from(C.W), C.W, 8); for (let i = 0; i < n; i++) C.W[i] = Math.max(WMIN, Math.min(WMAX, C.W[i]))
  // pool/riffle must alternate smoothly: smooth riffle over ~1.5 W, then derive depth and speed from it
  boxSmooth(Float32Array.from(C.riffle), C.riffle, 6)
  for (let i = 0; i < n; i++) { const Q = 0.8 + 0.5 * C.s[i] / C.s[n - 1]; C.D[i] = P.D0 * Math.pow(Q, 0.4) * (1.45 - 1.0 * C.riffle[i]); C.v[i] = P.v0 * Math.pow(Q, 0.1) * (0.55 + 1.1 * C.riffle[i]) }
  // 5. water surface: running minimum of the land downstream, drop concentrated on riffles
  const raw = F(n); let zmin = Infinity; for (let i = 0; i < n; i++) { zmin = Math.min(zmin, baseH(C.px[i], C.pz[i]) - P.bankH); raw[i] = zmin }
  let wsum = 0; for (let i = 1; i < n; i++) wsum += 0.25 + C.riffle[i]
  const drop = raw[0] - raw[n - 1]; C.zw[0] = raw[0]
  for (let i = 1; i < n; i++) C.zw[i] = C.zw[i - 1] - drop * (0.25 + C.riffle[i]) / wsum
  for (let i = 0; i < n; i++) C.zw[i] = Math.min(C.zw[i], raw[i])
  for (let i = 1; i < n; i++) C.tau[i] = C.tau[i - 1] + (C.s[i] - C.s[i - 1]) / C.v[i]
  // 6. floodplain level along the valley axis: per 4 m of z, the lowest water level there (+ bank height)
  const FZ = 4, nb = Math.ceil((P.z1 - P.z0) / FZ) + 1, fp = new Float32Array(nb).fill(Infinity)
  for (let i = 0; i < n; i++) { const b = Math.max(0, Math.min(nb - 1, Math.round((C.pz[i] - P.z0) / FZ))); fp[b] = Math.min(fp[b], C.zw[i] + P.bankH) }
  for (let b = 1; b < nb; b++) if (!isFinite(fp[b])) fp[b] = fp[b - 1]
  for (let b = nb - 2; b >= 0; b--) if (!isFinite(fp[b])) fp[b] = fp[b + 1]
  // land h lowered toward the floodplain: full strength inside it, fading to none valleyFade m beyond
  // (a fade, not a plane, so neighbouring hills keep their shape). Never raises h.
  // Near the channel (q = riverQuery) the floodplain sits on the NEAREST pass's own water level, so
  // a bend that doubles back can never have banks below its water; farther out, the per-z level.
  const trough = (x: number, z: number, h: number, q: RiverQuery | null): number => {
    const zc = Math.max(P.z0, Math.min(P.z1, z)), d = Math.abs(x - axisX(zc)) / Math.hypot(1, axisD(zc)), half = P.floodplainW / 2
    if (d > half + P.valleyFade) return h
    const t = Math.max(0, Math.min(nb - 1.001, (z - P.z0) / FZ)), b = Math.floor(t), f = t - b
    let lv = fp[b] + (fp[b + 1] - fp[b]) * f
    if (q) { if (q.level === undefined) throw Error('trough needs riverQuery(x,z,true)'); const REACH = RIVER.REACH, wn = 1 - sstep(0.5 * REACH, REACH, q.dist); lv = lv + (q.level + P.bankH - lv) * wn }
    const v = lv + Math.max(0, d - half) * P.valleySlope                      // flat floodplain, valley sides rising at ~10°
    if (v >= h) return h
    const w = 1 - sstep(half, half + P.valleyFade, d)
    return Math.min(h, h - (h - v - 0.25 * (vn(x * 0.05, z * 0.05) - 0.5)) * w * w)
  }
  return { samples: C, trough }
}


// valley + floodplain + the channel (W2's asymmetric section). q = riverQuery(x,z), passed in so callers query once
export function carve(trough: Trough, x: number, z: number, q: RiverQuery | null): number {
  const h = trough(x, z, baseH(x, z), q); if (!q) return h                 // valley trough only lowers, never raises hills
  const hw = lerpA(RIVER.W, q) / 2
  if (q.dist > SECTION_REACH * hw) return h
  return Math.min(h, lerpA(RIVER.zw, q) + section(q.n, hw, lerpA(RIVER.A, q), lerpA(RIVER.D, q), RIVER.P.bankH))
}

// the authored world: generates the river, installs it for riverQuery, and returns the two height functions
export function authorWorld(): { samples: RiverSamples; trough: Trough; H(x: number, z: number): number; farH(x: number, z: number): number } {
  const { samples, trough } = generateRiver()
  setRiver(samples)
  return {
    samples, trough,
    H: (x, z) => carve(trough, x, z, riverQuery(x, z, true)),
    farH: (x, z) => trough(x, z, baseH(x, z), riverQuery(x, z, true)),   // the far ring: valley trough only, no channel
  }
}
