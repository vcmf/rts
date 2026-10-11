// The water data (docs/plans/active/w3-water-data.md, docs/research/stylized-water.md §2.6): depth, the distance to
// the shoreline and the flow, on a grid over the tile, baked offline (tools/build-look-data.ts) from the authored
// height and the river's samples. No DOM: the build tool and tools/water-check.mjs use it.
//   R  the depth: the water level of the nearest river sample (the carve's) minus the ground, signed (+ under water),
//      over SPEC.water.depth
//   G  the signed distance to the shoreline, + in the water, over ±SPEC.water.sdf
//   B, A  the flow: the river's direction × its speed over the river's top speed, easing to 0 at the shore, over −1..1
import { sstep } from '../noise.ts'
import { RIVER, bankReachAt, lerpA, riverQuery, wetEdgeAt, type RiverQuery } from '../river.ts'
import { D } from '../spec.ts'
import type { SpanGrid } from './data.ts'

export const WATER_CH = 4
const W = D.spec.water, SLACK = 1.5   // the flow eases from 0 at the shore to full over SLACK m of water
// the uncovered texels: dry (the lowest depth), the farthest from the shore, no flow
export const WATER_FILL: [number, number, number, number] = [0, 0, 128, 128]

const byte = (t: number) => Math.round(Math.min(1, Math.max(0, t)) * 255)
export const encodeWater = (depth: number, sdf: number, fx: number, fz: number): [number, number, number, number] =>
  [byte((depth - W.depth[0]) / (W.depth[1] - W.depth[0])), byte(sdf / W.sdf * 0.5 + 0.5), byte(fx * 0.5 + 0.5), byte(fz * 0.5 + 0.5)]
// four channel values 0..1 (as a texture reads them) to metres and flow
export const decodeWater = (r: number, g: number, b: number, a: number) =>
  ({ depth: W.depth[0] + r * (W.depth[1] - W.depth[0]), sdf: (g * 2 - 1) * W.sdf, fx: b * 2 - 1, fz: a * 2 - 1 })

// The exact squared Euclidean distance transform (Felzenszwalb and Huttenlocher, "Distance transforms of sampled
// functions", 2012): for each texel of an n×n mask, the squared distance in texels to the nearest texel whose mask
// equals `to` (Infinity if there is none)
export function edt(mask: Uint8Array, n: number, to: number): Float64Array {
  const g = new Float64Array(n * n), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let i = 0; i < n * n; i++) g[i] = mask[i] === to ? 0 : Infinity
  const pass = (at: (k: number) => number) => {   // one line of the grid: the lower envelope of parabolas rooted at f
    for (let q = 0; q < n; q++) f[q] = g[at(q)]
    let k = -1
    for (let q = 0; q < n; q++) {
      if (f[q] === Infinity) continue
      if (k < 0) { k = 0; v[0] = q; z[0] = -Infinity; z[1] = Infinity; continue }
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity
    }
    if (k < 0) { for (let q = 0; q < n; q++) d[q] = Infinity }
    else for (let q = 0, j = 0; q < n; q++) { while (z[j + 1] < q) j++; d[q] = (q - v[j]) * (q - v[j]) + f[v[j]] }
    for (let q = 0; q < n; q++) g[at(q)] = d[q]
  }
  for (let r = 0; r < n; r++) pass(q => r * n + q)
  for (let c = 0; c < n; c++) pass(q => q * n + c)
  return g
}

// The water at a point near the river (q = riverQuery(x, z)): the depth (its dry side: the height above the water,
// which the bars' paint reads) and whether it is water: only within the carve (beyond it the floodplain stands a
// bank's height above the water)
export function waterAt(H: (x: number, z: number) => number, x: number, z: number, q: RiverQuery): { depth: number; wet: boolean } {
  const depth = lerpA(RIVER.zw, q) - H(x, z)
  return { depth, wet: depth > 0 && q.dist <= bankReachAt(q) + 0.25 * lerpA(RIVER.W, q) }
}

export interface WaterGrid { n: number; cell: number; x0: number; z0: number; depth: Float32Array; sdf: Float32Array; fx: Float32Array; fz: Float32Array }

// The shoreline between texel centres (marching squares): in each cell of four texel centres, a segment between the
// points where the water ends on its edges, in texel units from the centre of texel (0, 0); cross(a, b) gives where
// along the edge from texel a to texel b (0..1). Returns [x0, z0, x1, z1, ...]
export function shoreSegments(wet: Uint8Array, depth: ArrayLike<number>, n: number, cross: (a: number, b: number) => number): Float64Array {
  const seg: number[] = []
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
    const k00 = j * n + i, k10 = k00 + 1, k01 = k00 + n, k11 = k01 + 1
    const w00 = wet[k00], w10 = wet[k10], w01 = wet[k01], w11 = wet[k11]
    if (w00 === w10 && w00 === w01 && w00 === w11) continue
    // the crossings on the edges in order: bottom (00–10), right (10–11), top (01–11), left (00–01)
    const p: (number[] | null)[] = [
      w00 !== w10 ? [i + cross(k00, k10), j] : null, w10 !== w11 ? [i + 1, j + cross(k10, k11)] : null,
      w01 !== w11 ? [i + cross(k01, k11), j + 1] : null, w00 !== w01 ? [i, j + cross(k00, k01)] : null]
    const at = p.filter((v): v is number[] => !!v)
    if (at.length === 2) { seg.push(...at[0], ...at[1]); continue }
    // a saddle (opposite corners alike): the cell's centre decides which corners the water joins
    const centreWet = depth[k00] + depth[k10] + depth[k01] + depth[k11] > 0 ? 1 : 0
    if (centreWet === w10) seg.push(...p[0]!, ...p[3]!, ...p[1]!, ...p[2]!)   // corners 00 and 11 cut off
    else seg.push(...p[0]!, ...p[1]!, ...p[2]!, ...p[3]!)                     // corners 10 and 01 cut off
  }
  return Float64Array.from(seg)
}

// The bake at full precision, in metres. sdf: 'exact' (the data's rule: the distance to the shoreline's segments,
// signed by the texel's water; found within the exact distance transform's bound) or 'centre', the distance from the
// centre line's water's edge (the check's sabotage: what a bake from the section alone would do, wrong wherever the
// carve and the trough meet, on bars and at bends)
export function bakeWater(H: (x: number, z: number) => number, sdfRule: 'exact' | 'centre' = 'exact'): WaterGrid {
  const n = D.waterN, cell = W.texel, x0 = -D.spec.tile / 2, z0 = x0, N = n * n
  const depth = new Float32Array(N).fill(W.depth[0]), sdf = new Float32Array(N), fx = new Float32Array(N), fz = new Float32Array(N)
  const wet = new Uint8Array(N), raw = new Float32Array(N).fill(W.depth[0]), centre = new Float32Array(N).fill(-W.sdf)
  let vmax = 0; for (let i = 0; i < RIVER.n; i++) vmax = Math.max(vmax, RIVER.v[i])
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, q = riverQuery(x, z)
    if (!q) continue
    const k = j * n + i
    centre[k] = wetEdgeAt(q) - q.dist
    // the flow: the nearest segment's direction (its samples' tangents, blended), at the river's speed there
    const tx = lerpA(RIVER.tx, q), tz = lerpA(RIVER.tz, q), tl = Math.hypot(tx, tz) || 1, sp = lerpA(RIVER.v, q) / vmax
    fx[k] = tx / tl * sp; fz[k] = tz / tl * sp
    const w = waterAt(H, x, z, q); raw[k] = w.depth; depth[k] = Math.max(W.depth[0], w.depth); wet[k] = w.wet ? 1 : 0
    if (w.wet && w.depth > W.depth[1]) throw new Error(`water data: ${w.depth.toFixed(2)} m of water at (${x}, ${z}), deeper than SPEC.water.depth's ${W.depth[1]} m`)
  }
  if (sdfRule === 'exact') {
    // the shoreline lies between a texel and its nearest opposite texel, so it is no farther than that texel's centre
    // (the transform's distance): search the segments within it, bucketed in cells of B texels
    // where the water ends along an edge: by bisection on the authored surface (a point bar meets the water nearly
    // flat, so the depth between two texels is far from linear there, and a linear crossing lands near the dry one)
    const wetAt = (x: number, z: number) => { const q = riverQuery(x, z); return !!q && waterAt(H, x, z, q).wet }
    const cross = (a: number, b: number) => {
      const ax = x0 + (a % n + 0.5) * cell, az = z0 + (Math.floor(a / n) + 0.5) * cell, bx = x0 + (b % n + 0.5) * cell, bz = z0 + (Math.floor(b / n) + 0.5) * cell
      let lo = 0, hi = 1; const wa = wet[a] === 1
      for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; if (wetAt(ax + (bx - ax) * m, az + (bz - az) * m) === wa) lo = m; else hi = m }
      return (lo + hi) / 2
    }
    const toDry = edt(wet, n, 0), toWet = edt(wet, n, 1), seg = shoreSegments(wet, raw, n, cross), B = 4, nb = Math.ceil(n / B), bucket: number[][] = Array.from({ length: nb * nb }, () => [])
    for (let s = 0; s < seg.length; s += 4) {
      const bx0 = Math.floor(Math.min(seg[s], seg[s + 2]) / B), bx1 = Math.floor(Math.max(seg[s], seg[s + 2]) / B), bz0 = Math.floor(Math.min(seg[s + 1], seg[s + 3]) / B), bz1 = Math.floor(Math.max(seg[s + 1], seg[s + 3]) / B)
      for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) bucket[bz * nb + bx].push(s)
    }
    const lim = W.sdf / cell
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, bound = Math.sqrt(wet[k] ? toDry[k] : toWet[k])
      if (!(bound - 0.5 < lim + 1)) { sdf[k] = wet[k] ? W.sdf : -W.sdf; continue }       // beyond the stored range (or no shore)
      let best = bound * bound
      const r = Math.ceil(bound / B), cx = Math.floor(i / B), cz = Math.floor(j / B)
      for (let bz = Math.max(0, cz - r); bz <= Math.min(nb - 1, cz + r); bz++) for (let bx = Math.max(0, cx - r); bx <= Math.min(nb - 1, cx + r); bx++) for (const s of bucket[bz * nb + bx]) {
        const ax = seg[s], az = seg[s + 1], ex = seg[s + 2] - ax, ez = seg[s + 3] - az, L = ex * ex + ez * ez
        const t = L > 0 ? Math.max(0, Math.min(1, ((i - ax) * ex + (j - az) * ez) / L)) : 0, dx = i - ax - ex * t, dz = j - az - ez * t
        best = Math.min(best, dx * dx + dz * dz)
      }
      sdf[k] = (wet[k] ? 1 : -1) * Math.sqrt(best) * cell
    }
  } else sdf.set(centre)
  for (let k = 0; k < N; k++) { sdf[k] = Math.max(-W.sdf, Math.min(W.sdf, sdf[k])); const e = sstep(0, SLACK, sdf[k]); fx[k] *= e; fz[k] *= e }
  return { n, cell, x0, z0, depth, sdf, fx, fz }
}

// the bake as a span grid: the texels whose bytes differ from the fill
export function packWater(w: WaterGrid): SpanGrid {
  const { n } = w, spans: number[] = [], tex: number[] = []
  for (let j = 0; j < n; j++) {
    let open = -1
    for (let i = 0; i <= n; i++) {
      const b = i < n ? encodeWater(w.depth[j * n + i], w.sdf[j * n + i], w.fx[j * n + i], w.fz[j * n + i]) : WATER_FILL
      const differs = b.some((v, c) => v !== WATER_FILL[c])
      if (differs && open < 0) open = i
      if (!differs && open >= 0) { spans.push(j, open, i - open); open = -1 }
      if (differs) tex.push(...b)
    }
  }
  return { n, cell: w.cell, x0: w.x0, z0: w.z0, ch: WATER_CH, spans: Float32Array.from(spans), tex: Uint8Array.from(tex) }
}

// A bilinear read of n² RGBA8 texels over the grid at world (x, z), as the GPU filters a texture with clamped edges
// (texel centres at x0 + (i + 0.5)·cell): the four channels, 0..1
export function sampleRGBA(data: Uint8Array, n: number, cell: number, x0: number, z0: number, x: number, z: number): [number, number, number, number] {
  const u = (x - x0) / cell - 0.5, v = (z - z0) / cell - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
  const at = (a: number, b: number, c: number) => data[(Math.min(n - 1, Math.max(0, b)) * n + Math.min(n - 1, Math.max(0, a))) * 4 + c] / 255
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) out[c] = (at(i, j, c) * (1 - fu) + at(i + 1, j, c) * fu) * (1 - fv) + (at(i, j + 1, c) * (1 - fu) + at(i + 1, j + 1, c) * fu) * fv
  return out
}
