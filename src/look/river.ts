// The lowland meander at run time (docs/plans/done/w1-river-shape.md, docs/research/stylized-water.md §2.1–2.4,
// docs/systems/river.md): the per-sample arrays, built offline (src/look/world/author.ts) and shipped in the look
// data, plus a bucket grid for nearest-segment queries. Every consumer (terrain colours, water mesh, scatter,
// reflections) asks riverQuery(); nothing re-derives the river from a formula. No DOM: the build tool uses it too.
import { sstep } from './noise.ts'

export interface RiverParams {
  id: string
  W0: number
  D0: number
  bankH: number
  floodplainW: number
  beltW: number
  valleySlope: number
  valleyFade: number
  theta0: number
  Js: number
  Jf: number
  v0: number
  seed: number
  z0: number
  z1: number
}

// the per-sample arrays, in the order the look data stores them
export const SAMPLE_KEYS = ['px', 'pz', 'tx', 'tz', 's', 'kappa', 'W', 'D', 'A', 'riffle', 'zw', 'v', 'tau'] as const
export type SampleKey = (typeof SAMPLE_KEYS)[number]
export type RiverSamples = { P: RiverParams; n: number } & Record<SampleKey, Float32Array>

export interface River extends RiverSamples {
  WMAX: number
  grid: Map<number, number[]>
  CELL: number
  REACH: number
  key(cx: number, cz: number): number
}

export interface RiverQuery {
  i: number
  t: number
  dist: number
  n: number
  s: number
  level?: number
}

const WMAX = 11 // docs/art-bible.md §6c: 4–11 m

// the river every query reads; set once, from the look data (page) or from the authoring step (build tool)
export let RIVER: River

export function setRiver(samples: RiverSamples): River {
  const C = samples
  const n = C.n
  // bucket grid: each segment registered in every 16 m cell within REACH of it
  let Wmax = 0
  for (let i = 0; i < n; i++) Wmax = Math.max(Wmax, C.W[i])
  const CELL = 16
  // widest caller: reflAdd (hw+20)
  const REACH = Math.ceil(Wmax / 2 + 22)
  const grid = new Map<number, number[]>()
  const key = (cx: number, cz: number) => cx * 65536 + cz
  for (let i = 0; i < n - 1; i++) {
    const x0 = Math.min(C.px[i], C.px[i + 1]) - REACH
    const x1 = Math.max(C.px[i], C.px[i + 1]) + REACH
    const z0 = Math.min(C.pz[i], C.pz[i + 1]) - REACH
    const z1 = Math.max(C.pz[i], C.pz[i + 1]) + REACH
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz)
        let b = grid.get(k)
        if (!b) grid.set(k, (b = []))
        b.push(i)
      }
    }
  }
  RIVER = { ...samples, WMAX, grid, CELL, REACH, key }
  return RIVER
}

export const lerpA = (arr: Float32Array, q: { i: number; t: number }): number =>
  arr[q.i] + (arr[q.i + 1] - arr[q.i]) * q.t

// nearest river segment within REACH: {i,t,n (signed, + = left of flow),dist,s} or null.
// wantLevel: also blend the water level of every pass in reach (trough only)
export function riverQuery(x: number, z: number, wantLevel = false): RiverQuery | null {
  const C = RIVER
  const b = C.grid.get(C.key(Math.floor(x / C.CELL), Math.floor(z / C.CELL)))
  if (!b) return null
  let bi = -1
  let bt = 0
  let bd = Infinity
  let bsg = 1
  let ws = 0
  let wl = 0
  const R2 = C.REACH * C.REACH
  for (const i of b) {
    const ax = C.px[i]
    const az = C.pz[i]
    const ex = C.px[i + 1] - ax
    const ez = C.pz[i + 1] - az
    const L2 = ex * ex + ez * ez || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2))
    const dx = x - (ax + ex * t)
    const dz = z - (az + ez * t)
    const d = dx * dx + dz * dz
    if (d < bd) {
      bd = d
      bi = i
      bt = t
      bsg = ex * dz - ez * dx < 0 ? -1 : 1
    }
    // water level near (x,z): every segment in reach weighted by exp(-d/3), fading to 0 at REACH; continuous where
    // two passes of a doubled-back bend meet, and the nearest pass dominates at its own bank
    if (wantLevel && d < R2) {
      const dd = Math.sqrt(d)
      const w = Math.exp(-dd / 3) * (1 - sstep(0.5 * C.REACH, C.REACH, dd))
      ws += w
      wl += w * (C.zw[i] + (C.zw[i + 1] - C.zw[i]) * t)
    }
  }
  const dist = Math.sqrt(bd)
  if (bi < 0 || dist > C.REACH) return null
  const q: RiverQuery = { i: bi, t: bt, dist, n: bsg * dist, s: lerpA(C.s, { i: bi, t: bt }) }
  if (wantLevel) q.level = ws > 1e-9 ? wl / ws : lerpA(C.zw, q)
  return q
}

// The channel's cross-section (W2, docs/research/stylized-water.md §2.4): the ground's height relative to the local
// water surface at signed offset n (+ = left of the flow), half-width hw, asymmetry A (+ = the outer bank on the +n
// side), depth D. The deepest line shifts toward the outer bank; the outer side rises steeply to the water's edge at
// hw, then a scarp to the floodplain that narrows to near vertical on the sharpest bends (the cut bank); on the inner
// side the water's edge comes in and a long, low bar rises to the floodplain (the point bar). At A = 0 both sides are
// the same profile, so the section is continuous where a bend reverses (A changes sign).
// The shape's parameters, in one place for section(), wetEdges() and bankReach()
function shape(hw: number, A: number) {
  const a = Math.min(1, Math.abs(A))
  // the deepest line's shift toward the outer bank
  const tw = 0.35 * a * hw
  return {
    a,
    tw,
    e: hw + tw,
    wet: 1 - 0.45 * a,
    outerBank: hw * (0.35 - 0.29 * a),
    innerBank: hw * (0.35 + a),
    barExp: 1 + 0.6 * a,
  }
}
export function section(n: number, hw: number, A: number, D: number, bankH: number): number {
  const { a, tw, e, wet, outerBank, innerBank, barExp } = shape(hw, A)
  // m > 0: toward the outer bank
  const m = A >= 0 ? n : -n
  if (m >= tw) {
    // outer half: the cut bank
    const t = (m - tw) / (hw - tw)
    if (t <= 1) return -D * (1 - Math.pow(t, 2 + 4 * a))
    return bankH * sstep(0, 1, (m - hw) / outerBank)
  }
  const t = (tw - m) / e // inner half: the point bar
  if (t <= wet) return -D * (1 - Math.pow(t / wet, 2 - 0.6 * a))
  return bankH * Math.pow(sstep(0, 1, ((t - wet) * e) / innerBank), barExp)
}
const bySide = (A: number, outer: number, inner: number): [number, number] => (A >= 0 ? [outer, inner] : [inner, outer])
// the water's edge on each side, in metres from the centre line: [the +n side, the −n side] (where section() is 0)
export function wetEdges(hw: number, A: number): [number, number] {
  const { tw, e, wet } = shape(hw, A)
  return bySide(A, hw, wet * e - tw)
}
// where each side's bank reaches the floodplain, in metres from the centre line: [the +n side, the −n side]
export function bankReach(hw: number, A: number): [number, number] {
  const { tw, e, wet, outerBank, innerBank } = shape(hw, A)
  return bySide(A, hw + outerBank, wet * e + innerBank - tw)
}

// the water's edge and the bank's end on the side of the river a query point is on, in metres from the centre line.
// k scales the asymmetry (1: the section; 0: symmetric, as the far ring's painted river)
export const wetEdgeAt = (q: RiverQuery, k = 1): number =>
  wetEdges(lerpA(RIVER.W, q) / 2, lerpA(RIVER.A, q) * k)[q.n >= 0 ? 0 : 1]
// the foot of a cut bank (W5a stones): the outer side (A's sign) of a bend sharper than |A| 0.5, within 0.6 m of its
// water's edge (inside or out)
export const atCutBank = (q: RiverQuery): boolean => {
  const A = lerpA(RIVER.A, q)
  return Math.abs(A) > 0.5 && Math.sign(q.n) === Math.sign(A) && q.dist >= wetEdgeAt(q) - 0.6
}
export const bankReachAt = (q: RiverQuery): number =>
  bankReach(lerpA(RIVER.W, q) / 2, lerpA(RIVER.A, q))[q.n >= 0 ? 0 : 1]

// distance from the water's edge on this side, in half-widths (≤0 = in the water), for terrain colouring; k as above
export const bandOf = (q: RiverQuery | null, k = 1): number => {
  if (!q) return 8
  return Math.min(8, (q.dist - wetEdgeAt(q, k)) / (lerpA(RIVER.W, q) / 2))
}
