// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a), from a compiled map's layers: the light that does
// not change on the height nodes (M10, decision 0090: a sun's soft shadow and the sky's occlusion, after Track K's
// campaign map), a mask per cell and the ink's distance fields. Pure functions with no DOM, run in the map page's
// compile worker.
import type { Layers } from '../../map/apply.ts'
import type { Feature, Pt } from '../../map/schema.ts'
import type { Resolved } from '../../map/resolve.ts'
import { lineReach } from '../../map/apply.ts'
import { categoryOf } from '../../map/catalogue.ts'
import { sstep } from '../../look/noise.ts'
import { SUN_TOWARD } from '../../look/sun.ts'

/** The sun: its height above the horizon, where it stands (clockwise from north) and its disc's size, in degrees. */
export interface Sun {
  el: number
  az: number
  size: number
}
/** The sun toward a direction (x east, y up, z north; any length), its disc `size` degrees across. */
export function sunFrom(x: number, y: number, z: number, size: number): Sun {
  const deg = 180 / Math.PI
  return { el: Math.atan2(y, Math.hypot(x, z)) * deg, az: (((Math.atan2(x, z) * deg) % 360) + 360) % 360, size }
}
// the 3D world's sun (src/look/sun.ts: north-west, about 27° high), so the light does not turn at the zoom's handover
// (the owner, 2026-10-30: docs/plans/active/track-g.md); its disc 2.5° across, as Track K's
export const SUN: Sun = sunFrom(...SUN_TOWARD, 2.5)
// the light's bake on every LIGHT_STEP-th node: 8 m, so a save redraws within the editor's second (the page's bake,
// light, masks and ink, 0.41 s for a 3 km map: the G2 plan's Results); the slope's light is the shader's, per pixel,
// from the 2 m heights
export const LIGHT_STEP = 4
export const RELIEF = {
  z: 3, // the heights' exaggeration, for the light only (as shaded-relief prints do)
}
// the sky's horizon is read this far from a node in each of eight directions, m: the hollows, sunken roads and stream
// valleys of a battlefield, not a mountain range's
const SKY_STEPS = [4, 8, 16, 32, 64, 128, 256]
const SUN_REACH = 5000 // m: the farthest a ray toward the sun looks for what shades a node
export const WATER_FULL = 1.5 // m: the depth the mask stores as 1
// m: the longest shadow a building casts (a low ?sun= or a large ?bz= would sweep it across the map)
export const SHADOW_REACH = 100
// the buildings' shadows cast from their wall heights raised this many times: their true heights (the owner, G2b:
// 1 first; ?bz= to try others)
export const BUILDING_BZ = 1

/**
 * A sun the bake and the shader can light by (the page's ?sun= and ?soft= take any number): its disc 1° to 20°
 * across (a smaller one would step the bake's rays a cell at a time out to a kilometre), its lower rim at least half
 * a degree above the horizon, its middle at most 89.5° high.
 */
export function clampSun(sun: Sun): Sun {
  const size = Math.min(20, Math.max(1, sun.size))
  return { el: Math.min(89.5, Math.max(size / 2 + 0.5, sun.el)), az: sun.az, size }
}

/** The sun's horizontal direction, a unit vector (x east, z north) toward it. */
export function sunXZ(sun: Sun): [number, number] {
  const az = (sun.az * Math.PI) / 180
  return [Math.sin(az), Math.cos(az)]
}

/** The light that does not change, on every `step`-th node of the heights (bakeLight). */
export interface LightBake {
  data: Uint8Array // RGBA bytes, the south row first: R the sun's soft shadow (255 lit), G the open sky (255 all of it)
  nx: number // nodes
  nz: number
  step: number // in the heights' nodes
}

/**
 * The light that does not change (decision 0090, after Track K's `bakeLightRows`, PR #262), from the
 * heights raised `z` times (RELIEF.z by default), on every `step`-th node: `heights` (nx) × (nz) nodes `cell` m apart.
 * - The sun's shadow: from each node a ray walks toward the sun in growing steps, as far as any ground of the map
 *   could shade it; the sun is a disc `size` degrees across, so a crest just grazing the ray dims it in part, and the
 *   penumbra widens with the distance to what casts it.
 * - The open sky: in eight directions, the highest horizon within SKY_STEPS; the sky a node sees is the mean of one
 *   minus the sine of those horizon angles (ambient occlusion).
 * Heights past the grid's edges repeat its edge nodes.
 */
export function bakeLight(
  heights: ArrayLike<number>,
  nx: number,
  nz: number,
  cell: number,
  sun: Sun,
  step = 1,
  z = RELIEF.z,
): LightBake {
  sun = clampSun(sun)
  // plain loops: a mapped Float32Array.from and a destructuring min-max cost seconds over millions of nodes
  const h = new Float32Array(nx * nz)
  let lo = Infinity
  let hi = -Infinity
  for (let k = 0; k < h.length; k++) {
    const v = heights[k] * z
    h[k] = v
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const rad = Math.PI / 180
  const tanEl = Math.tan(sun.el * rad)
  const tanR = Math.tan((sun.size / 2) * rad)
  // the disc's lower rim: the last ray anything can shade (clampSun keeps it above the horizon)
  const tanLo = Math.tan((sun.el - sun.size / 2) * rad)
  const [sx, sz] = sunXZ(sun)
  const reach = Math.min(SUN_REACH, (hi - lo) / tanLo)
  // steps no longer than the penumbra's width there (nor shorter than a cell), so a bank's soft edge is sampled
  // across, not jumped
  const sunSteps: number[] = []
  for (let d = cell; d <= reach + cell; d += Math.max(cell, 2 * tanR * d)) sunSteps.push(d)
  // the sky's eight directions run along the grid's axes and diagonals, so its horizon is read on whole nodes (no
  // bilinear read: the bake's other half of its time): for each direction and step, the nodes it moves and the metres
  // that is
  const DI = [1, 1, 0, -1, -1, -1, 0, 1]
  const DJ = [0, 1, 1, 1, 0, -1, -1, -1]
  const skyN: number[] = []
  const skyD: number[] = []
  for (let a = 0; a < 8; a++) {
    const len = a % 2 ? cell * Math.SQRT2 : cell
    for (const d of SKY_STEPS) {
      const n = Math.max(1, Math.round(d / len))
      skyN.push(n)
      skyD.push(n * len)
    }
  }
  // the heights at a point (m from the grid's first node), bilinear, the edges repeated
  const at = (x: number, z: number) => {
    const fx = Math.min(nx - 1.001, Math.max(0, x / cell))
    const fz = Math.min(nz - 1.001, Math.max(0, z / cell))
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const u = fx - i
    const v = fz - j
    const k = j * nx + i
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + nx] * (1 - u) + h[k + nx + 1] * u) * v
  }
  const bnx = Math.floor((nx - 1) / step) + 1
  const bnz = Math.floor((nz - 1) / step) + 1
  const out = new Uint8Array(bnx * bnz * 4)
  for (let bj = 0; bj < bnz; bj++) {
    for (let bi = 0; bi < bnx; bi++) {
      const i = bi * step
      const j = bj * step
      const x = i * cell
      const z = j * cell
      const h0 = h[j * nx + i]
      let lit = 1
      for (const d of sunSteps) {
        if (h0 + d * tanLo >= hi) break // the whole disc above the highest ground: nothing further shades it
        const clear = (h0 + d * tanEl - at(x + sx * d, z + sz * d)) / d
        lit = Math.min(lit, Math.min(1, Math.max(0, 0.5 + (0.5 * clear) / tanR)))
        if (lit <= 0) break
      }
      let sky = 0
      for (let a = 0, q = 0; a < 8; a++) {
        let horizon = 0
        for (let s = 0; s < SKY_STEPS.length; s++, q++) {
          const si = Math.min(nx - 1, Math.max(0, i + DI[a] * skyN[q]))
          const sj = Math.min(nz - 1, Math.max(0, j + DJ[a] * skyN[q]))
          horizon = Math.max(horizon, (h[sj * nx + si] - h0) / skyD[q])
        }
        sky += 1 - horizon / Math.hypot(1, horizon)
      }
      const o = (bj * bnx + bi) * 4
      out[o] = Math.round(sstep(0, 1, lit) * 255)
      out[o + 1] = Math.round((sky / 8) * 255)
      out[o + 3] = 255
    }
  }
  return { data: out, nx: bnx, nz: bnz, step }
}

/**
 * bakeLight, remembering its last bake: a compile that leaves the heights, the sun, `z` and `step` as they were (an
 * edit of a hedge, a name, a save) bakes nothing. Each call returns its own copy of the bytes, so the caller can
 * transfer them. `bake` is bakeLight but for the tests.
 */
export function lightCache(
  bake = bakeLight,
): (heights: Float64Array, nx: number, nz: number, cell: number, sun: Sun, step: number, z: number) => LightBake {
  let key = ''
  let kept = new Float64Array(0)
  let last: LightBake | null = null
  return (heights, nx, nz, cell, sun, step, z) => {
    // the heights compared with a kept copy, exactly (a hash missed edits that only flip signs)
    const k = [nx, nz, cell, sun.el, sun.az, sun.size, step, z].join(',')
    let same = !!last && k === key && kept.length === heights.length
    for (let i = 0; same && i < heights.length; i++) same = kept[i] === heights[i]
    if (!same) {
      last = bake(heights, nx, nz, cell, sun, step, z)
      key = k
      kept = Float64Array.from(heights)
    }
    return { ...last!, data: last!.data.slice() }
  }
}

/**
 * The cells' mask, as RGBA bytes, the south row first: R the water's depth (0..1 over 0..WATER_FULL m), G unused, B
 * the water, A the yards (a village's, a farm's, ground.yard).
 */
export function bakeMasks(L: Pick<Layers, 'nx' | 'nz' | 'water' | 'depth' | 'table' | 'built' | 'ground'>): Uint8Array {
  const n = L.nx * L.nz
  const out = new Uint8Array(n * 4)
  const yard = L.table.map(r => /^(built\.(village|farm)|ground\.yard)(\.|$)/.test(r.kind))
  for (let c = 0; c < n; c++) {
    out[c * 4] = Math.round(Math.min(1, L.depth[c] / 1000 / WATER_FULL) * 255)
    out[c * 4 + 1] = 0 // unused
    out[c * 4 + 2] = L.water[c] ? 255 : 0
    out[c * 4 + 3] = (L.built[c] && yard[L.built[c] - 1]) || (L.ground[c] && yard[L.ground[c] - 1]) ? 255 : 0
  }
  return out
}

// the ink's distance fields (M6b, decision 0065 as redesigned): signed metres to the nearest edge, stored over
// ±INK_RANGE in a byte
export const INK_RANGE = 8 // m

/** A way drawn as ink: its centreline and the half-width apply paints it at (`lineReach`). */
export interface InkedLine {
  line: Pt[]
  half: number
}

/**
 * The ink's distance fields on the cells, as RGBA bytes, the south row first: per channel the signed distance from a
 * cell's centre to the nearest edge (negative inside), over ±INK_RANGE m, 128 at the edge.
 * - R the ways' edges, from their centrelines (crisp hairlines at every zoom), their free ends cut square, as apply
 *   paints them, each way cell held inside at its centre and every other cell outside;
 * - G the water, B the barriers, A the woods, from their cells: what the sim reads, whatever rule put them there
 *   (priority, `clear`, a hedge's gates). The contract (decision 0065): every cell reads as its own kind at its
 *   centre, and an edge lies within half a cell of the cells' sides. The water's and the woods' fields are smoothed so
 *   their edges run through the cells' steps, not along them; the barriers' stay square, on the grid by design
 *   (proposal §3.6).
 */
export function bakeInk(
  L: Pick<Layers, 'x0' | 'z0' | 'cell' | 'nx' | 'nz' | 'veg' | 'water' | 'barrier' | 'way' | 'table'>,
  ways: InkedLine[],
): Uint8Array {
  const { x0, z0, cell, nx, nz } = L
  const out = new Uint8Array(nx * nz * 4)
  const store = (sd: Float32Array, ch: number) => {
    for (let c = 0; c < sd.length; c++) {
      out[c * 4 + ch] = Math.round(128 + (Math.max(-INK_RANGE, Math.min(INK_RANGE, sd[c])) / INK_RANGE) * 127)
    }
  }
  // the ways, from their shapes
  const sd = new Float32Array(nx * nz).fill(INK_RANGE)
  const CHUNK = 16 // m: a long segment is scanned in pieces, so a diagonal one scans a strip, not its whole box
  for (const w of ways) {
    const pts = w.line
    const pieces: { a: Pt; b: Pt; ends: [boolean, boolean] }[] = []
    for (let k = 1; k < pts.length; k++) {
      const [p, q] = [pts[k - 1], pts[k]]
      const n = Math.max(1, Math.ceil(Math.sqrt((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2) / CHUNK))
      for (let t = 0; t < n; t++) {
        const a: Pt = [p[0] + ((q[0] - p[0]) * t) / n, p[1] + ((q[1] - p[1]) * t) / n]
        const b: Pt = [p[0] + ((q[0] - p[0]) * (t + 1)) / n, p[1] + ((q[1] - p[1]) * (t + 1)) / n]
        // the line's first and last points are its free ends, a loop's too (apply cuts its seam square as well)
        pieces.push({ a, b, ends: [k === 1 && t === 0, k === pts.length - 1 && t === n - 1] })
      }
    }
    for (const { a, b, ends } of pieces) {
      const reach = w.half + INK_RANGE
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - x0) / cell))
      const i1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0]) + reach - x0) / cell))
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - z0) / cell))
      const j1 = Math.min(nz - 1, Math.floor((Math.max(a[1], b[1]) + reach - z0) / cell))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const v = segField(a, b, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, ends, w.half)
          if (v < sd[j * nx + i]) sd[j * nx + i] = v
        }
      }
    }
  }
  // the contract (decision 0065): a cell reads as its own kind at its centre. A cell with no way is lifted just
  // outside, a way's cell just inside; elsewhere the shape's true distance stays, so the field never jumps (a jump
  // would draw a second hairline) and the edges stay the shapes' within half a cell. Where a way crosses water with no
  // bridge the sim has both, and so does the map
  const hold = cell * 0.1
  for (let c = 0; c < sd.length; c++) sd[c] = L.way[c] ? Math.min(sd[c], -hold) : Math.max(sd[c], hold)
  store(sd, 0)
  // the water, the barriers and the woods, from their cells
  const wood = L.table.map(r => r.attrs.growth === 'stand')
  const mask = new Uint8Array(nx * nz)
  for (let c = 0; c < mask.length; c++) mask[c] = L.water[c] ? 1 : 0
  store(cellField(mask, nx, nz, cell, true), 1)
  for (let c = 0; c < mask.length; c++) mask[c] = L.barrier[c] ? 1 : 0
  store(cellField(mask, nx, nz, cell, false), 2)
  for (let c = 0; c < mask.length; c++) mask[c] = L.veg[c] && wood[L.veg[c] - 1] ? 1 : 0
  store(cellField(mask, nx, nz, cell, true, 'outside'), 3)
  return out
}

/**
 * A segment's signed field at (x, z) for a line of half-width `half`: the distance to the segment less the
 * half-width; past a free end of the line (`ends`: whether a and b are its ends), the larger of the distance across
 * the line less the half-width and the distance past the end, so the end is cut square.
 */
function segField(a: Pt, b: Pt, x: number, z: number, ends: [boolean, boolean], half: number): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz
  const t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0
  if ((t < 0 && ends[0]) || (t > 1 && ends[1])) {
    const L = Math.sqrt(l2)
    const across = L > 0 ? Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / L : 0
    return Math.max(across - half, (t < 0 ? -t : t - 1) * L)
  }
  const u = Math.min(1, Math.max(0, t))
  const ex = a[0] + dx * u - x
  const ez = a[1] + dz * u - z
  return Math.sqrt(ex * ex + ez * ez) - half
}

/**
 * A cell mask's signed distance field (negative inside), m, at the cells' centres: the distance to the nearest cell of
 * the other kind (a two-pass chamfer, 1 and √2 a step), less half a cell, so the 0 lies on the cells' sides; out to
 * INK_RANGE. `smooth`: blurred by a 5-tap binomial in both directions, so the 0 runs through the steps of a diagonal or
 * curved edge instead of along them, but held on each cell's own side of the edge by at least half its raw distance,
 * so no feature a cell or two wide is blurred away; only the cells joinCorners gives way at a saddle are nearer, a
 * tenth of a cell from the edge, still on their own side.
 */
export function cellField(
  mask: Uint8Array,
  nx: number,
  nz: number,
  cell: number,
  smooth: boolean,
  join: 'inside' | 'outside' = 'inside',
): Float32Array {
  if (!mask.includes(1)) return new Float32Array(nx * nz).fill(INK_RANGE) // nothing of the kind: all outside
  const far = INK_RANGE / cell + 2
  const toOther = (inside: number) => {
    const d = new Float32Array(nx * nz)
    for (let c = 0; c < d.length; c++) d[c] = mask[c] === inside ? far : 0
    const D = Math.SQRT2
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i
        if (d[c] === 0) continue
        let v = d[c]
        if (i > 0) v = Math.min(v, d[c - 1] + 1)
        if (j > 0) {
          v = Math.min(v, d[c - nx] + 1)
          if (i > 0) v = Math.min(v, d[c - nx - 1] + D)
          if (i < nx - 1) v = Math.min(v, d[c - nx + 1] + D)
        }
        d[c] = v
      }
    }
    for (let j = nz - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const c = j * nx + i
        if (d[c] === 0) continue
        let v = d[c]
        if (i < nx - 1) v = Math.min(v, d[c + 1] + 1)
        if (j < nz - 1) {
          v = Math.min(v, d[c + nx] + 1)
          if (i < nx - 1) v = Math.min(v, d[c + nx + 1] + D)
          if (i > 0) v = Math.min(v, d[c + nx - 1] + D)
        }
        d[c] = v
      }
    }
    return d
  }
  const outside = toOther(0) // from each cell outside the mask to the nearest inside
  const inside = toOther(1) // from each cell inside to the nearest outside
  const raw = new Float32Array(nx * nz)
  for (let c = 0; c < raw.length; c++) raw[c] = (mask[c] ? -(inside[c] - 0.5) : outside[c] - 0.5) * cell
  if (!smooth) return joinCorners(raw, mask, nx, nz, cell, join)
  // a 5-tap binomial blur along x, then along z; the border cells repeat
  const blur = (from: Float32Array, step: number, n: number, count: number) => {
    const to = new Float32Array(from.length)
    for (let line = 0; line < count; line++) {
      const base = step === 1 ? line * nx : line
      for (let k = 0; k < n; k++) {
        const at = (q: number) => from[base + Math.min(n - 1, Math.max(0, q)) * step]
        to[base + k * step] = (at(k - 2) + 4 * at(k - 1) + 6 * at(k) + 4 * at(k + 1) + at(k + 2)) / 16
      }
    }
    return to
  }
  const f = blur(blur(raw, 1, nx, nz), nx, nz, nx)
  // the blur may not carry a cell across its edge, nor more than half a cell toward it: a stream one cell wide stays
  // water a metre wide, a clearing one cell wide stays open, while a wide edge runs smooth through the cells' steps
  for (let c = 0; c < f.length; c++) f[c] = mask[c] ? Math.min(f[c], raw[c] / 2) : Math.max(f[c], raw[c] / 2)
  return joinCorners(f, mask, nx, nz, cell, join)
}

/**
 * Joins cells that touch only at a corner: in a two-by-two block where two cells of one kind meet diagonally and the
 * other two are of the other kind (a saddle), the shared corner is ambiguous; `join` says which kind it belongs to.
 * Each of the other kind's two cells there is pulled to within a tenth of a cell of the edge, so the corner reads on
 * the joining side. Water and barriers join their insides (a stream or a hedge one cell wide stepping diagonally stays
 * one line); the woods join their outsides (a path cut diagonally through a wood stays one clearing). A stair-step
 * edge holds no saddle (three cells of each of its blocks are of one kind) and is left alone. Writes `f` in place.
 */
function joinCorners(
  f: Float32Array,
  mask: Uint8Array,
  nx: number,
  nz: number,
  cell: number,
  join: 'inside' | 'outside',
): Float32Array {
  const hold = cell * 0.1
  const pull = join === 'inside' ? 0 : 1 // the kind of the cells that give way
  for (let j = 0; j + 1 < nz; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i // the block's four cells: a b on this row, c d on the next
      const b = a + 1
      const c = a + nx
      const d = c + 1
      // a saddle: a and d alike, b and c alike, the two pairs different
      if (mask[a] !== mask[d] || mask[b] !== mask[c] || mask[a] === mask[b]) continue
      for (const q of mask[a] === pull ? [a, d] : [b, c]) {
        f[q] = pull === 1 ? Math.max(f[q], -hold) : Math.min(f[q], hold)
      }
    }
  }
  return f
}

/** The ways of a compiled map's features, as ink: each centreline at the half-width apply paints it (`lineReach`). */
export function waysOf(features: Feature[], table: Resolved[]): InkedLine[] {
  const byId = new Map(table.map(r => [r.id, r]))
  return features.flatMap(f => {
    const r = byId.get(f.id)
    return r && f.line && categoryOf(r.kind) === 'way' ? [{ line: f.line, half: lineReach(r.kind, r.attrs) }] : []
  })
}
