// The campaign map's bake (docs/systems/campaign-map.md, docs/plans/done/k2a-bake.md): the one shape the 3D map is
// raised by and lit from, the lakes sunk into it, the light that does not change (the sun's soft shadow and the sky's
// occlusion) and the forests printed under it, on any grid. Pure functions, no DOM and no Node:
// tools/campaign-tiles.ts runs them offline for each level of tiles (src/render/campaign/tiles.ts). The prototype
// (prototypes/campaign-map.html) holds its own copy of the same steps, baked at load. Renderer data, not the
// campaign's rules: plain float, not the sim's exact numbers. Tested in test/campaign-bake.test.ts.
import { inRing, ringRow } from '../../map/geometry.ts'
import type { Pt } from '../../map/schema.ts'

// the forests' smoothing (three box means this many metres either side) and the forest field's cell, in metres
export const WOOD_BOX_M = 500
export const FIELD_CELL = 100

/** A grid of nx × nz nodes `cell` metres apart, node (i, j) at (x0 + i·cell, z0 + j·cell), the south row first. */
export interface Grid {
  nx: number
  nz: number
  cell: number
  x0: number
  z0: number
}

/** The shape's parameters (the page's defaults are in prototypes/campaign-map.html). */
export interface ShapeParams {
  // the large forms' blur radius, the mountain regions' radius, both in metres
  bigM: number
  regionM: number
  // the smaller detail kept, the mountain lift on top (1 + this at most), the whole raised this many times
  fine: number
  mount: number
  vert: number
  // the mountain regions' heights, from and to, in metres
  mountFrom: number
  mountTo: number
  // the shape flattens over this many km to the frame's edge
  edgeKm: number
  // the lowest ground in metres (the shape is measured from it)
  low: number
}

/** The light's parameters: the sun's elevation and azimuth (clockwise from north) and its size, in degrees. */
export interface SunParams {
  el: number
  az: number
  size: number
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Smoothstep from a to b. */
function sstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * The grid with its single-node spikes and pits removed: each node clamped to the range of its eight neighbours
 * (edge nodes kept). The terrain tiles hold thousands of them; lit per pixel, each one drew a dark dot.
 */
export function despiked(h: ArrayLike<number>, nx: number, nz: number): Float32Array {
  const out = Float32Array.from(h)
  for (let j = 1; j < nz - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i
      let lo = Infinity
      let hi = -Infinity
      for (const o of [-1, 1, -nx, nx, -nx - 1, -nx + 1, nx - 1, nx + 1]) {
        lo = Math.min(lo, h[k + o])
        hi = Math.max(hi, h[k + o])
      }
      out[k] = clamp(h[k], lo, hi)
    }
  }
  return out
}

/**
 * Box mean of a grid over a square of half-width r cells (edges clamped: the mean of the part inside), as two
 * running sums, along the rows then the columns: linear in the grid, and no summed-area table (whose float64 sums
 * over 40 million nodes would take 320 MB).
 */
export function boxMean(h: ArrayLike<number>, nx: number, nz: number, r: number): Float32Array {
  const rows = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    const o = j * nx
    let sum = 0
    for (let i = 0; i <= Math.min(r, nx - 1); i++) sum += h[o + i]
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - r)
      const i1 = Math.min(nx - 1, i + r)
      rows[o + i] = sum / (i1 - i0 + 1)
      if (i + r + 1 < nx) sum += h[o + i + r + 1]
      if (i - r >= 0) sum -= h[o + i - r]
    }
  }
  const out = new Float32Array(nx * nz)
  const col = new Float64Array(nx)
  for (let j = 0; j <= Math.min(r, nz - 1); j++) for (let i = 0; i < nx; i++) col[i] += rows[j * nx + i]
  for (let j = 0; j < nz; j++) {
    const n = Math.min(nz - 1, j + r) - Math.max(0, j - r) + 1
    for (let i = 0; i < nx; i++) out[j * nx + i] = col[i] / n
    if (j + r + 1 < nz) for (let i = 0; i < nx; i++) col[i] += rows[(j + r + 1) * nx + i]
    if (j - r >= 0) for (let i = 0; i < nx; i++) col[i] -= rows[(j - r) * nx + i]
  }
  return out
}

/** A soft, round blur, about as wide as a box mean of half-width r: three box means of a third of the width each. */
export function blur(h: ArrayLike<number>, nx: number, nz: number, r: number): Float32Array {
  const third = Math.max(1, Math.round(r / Math.sqrt(3)))
  return boxMean(boxMean(boxMean(h, nx, nz, third), nx, nz, third), nx, nz, third)
}

/**
 * The one shape, in metres above `low`, raised `vert` times: the large forms whole, the detail scaled by `fine`,
 * mountain regions lifted, flattened toward the frame's edge (the grid spans the frame).
 */
export function buildShape(h0: ArrayLike<number>, g: Grid, p: ShapeParams): Float32Array {
  const { nx, nz, cell } = g
  const big = blur(h0, nx, nz, Math.round(p.bigM / cell))
  const region = blur(h0, nx, nz, Math.round(p.regionM / cell))
  const out = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const h = big[k] + (h0[k] - big[k]) * p.fine - p.low
      const lift = 1 + p.mount * sstep(p.mountFrom, p.mountTo, region[k])
      const edgeKm = (Math.min(i, nx - 1 - i, j, nz - 1 - j) * cell) / 1000
      out[k] = Math.max(0, h) * lift * p.vert * sstep(0, p.edgeKm, edgeKm)
    }
  }
  return out
}

/** Chamfer distance (in cells: 1 along an axis, √2 on a diagonal) from every node to the nearest seed node. */
function chamfer(seed: Uint8Array, nx: number, nz: number): Float32Array {
  const d = new Float32Array(nx * nz)
  for (let k = 0; k < d.length; k++) d[k] = seed[k] ? 0 : 1e9
  const pass = (forward: boolean) => {
    const dj = forward ? 1 : -1
    for (let jj = 0; jj < nz; jj++) {
      const j = forward ? jj : nz - 1 - jj
      for (let ii = 0; ii < nx; ii++) {
        const i = forward ? ii : nx - 1 - ii
        const di = dj
        const k = j * nx + i
        let v = d[k]
        const ib = i - di
        const jb = j - dj
        if (ib >= 0 && ib < nx) v = Math.min(v, d[k - di] + 1)
        if (jb >= 0 && jb < nz) {
          v = Math.min(v, d[k - dj * nx] + 1)
          if (ib >= 0 && ib < nx) v = Math.min(v, d[k - dj * nx - di] + Math.SQRT2)
          if (i + di >= 0 && i + di < nx) v = Math.min(v, d[k - dj * nx + di] + Math.SQRT2)
        }
        d[k] = v
      }
    }
  }
  pass(true)
  pass(false)
  return d
}

/**
 * The signed distance to the lakes' shores on the grid, in km: positive in the water, negative on land, clamped to
 * -3..12, then softly blurred over `blurM` metres (the chamfer's octagons and the grid's stairs would show as the
 * water's steps). A node is in a lake when its position lies inside one of the rings.
 */
export function lakeDistance(rings: Pt[][], g: Grid, blurM: number): Float32Array {
  const { nx, nz, cell, x0, z0 } = g
  const water = new Uint8Array(nx * nz)
  for (const ring of rings) {
    const xs = ring.map(p => p[0])
    const zs = ring.map(p => p[1])
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / cell))
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) - x0) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - z0) / cell))
    const j1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) - z0) / cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) if (inRing(ring, [x0 + i * cell, z0 + j * cell])) water[j * nx + i] = 1
    }
  }
  const land = Uint8Array.from(water, v => 1 - v)
  const toLand = chamfer(land, nx, nz)
  const toWater = chamfer(water, nx, nz)
  const raw = new Float32Array(nx * nz)
  for (let k = 0; k < raw.length; k++) {
    // half a cell either side of the shore, as the page's coverage would place it
    const cells = water[k] ? toLand[k] - 0.5 : -(toWater[k] - 0.5)
    raw[k] = clamp((cells * cell) / 1000, -3, 12)
  }
  return blur(raw, nx, nz, Math.round(blurM / cell))
}

/**
 * The lakes sunk into the shape (in place): `sink` m below the shore, eased in over `widthM` metres across it (from
 * half of it on land to half in the water). The same width at every level: across one cell of a fine level, the drop
 * would follow the nodes and draw a staircase along the shore in the light.
 */
export function sinkLakes(shape: Float32Array, dist: Float32Array, widthM: number, sink: number): Float32Array {
  for (let k = 0; k < shape.length; k++) shape[k] -= sink * clamp((dist[k] * 1000) / widthM + 0.5, 0, 1)
  return shape
}

/** Bilinear read of a grid at map metres. */
function sample(h: Float32Array, g: Grid, x: number, z: number): number {
  const fx = clamp((x - g.x0) / g.cell, 0, g.nx - 1.001)
  const fz = clamp((z - g.z0) / g.cell, 0, g.nz - 1.001)
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const u = fx - i
  const v = fz - j
  const k = j * g.nx + i
  const top = h[k] * (1 - u) + h[k + 1] * u
  const bottom = h[k + g.nx] * (1 - u) + h[k + g.nx + 1] * u
  return top * (1 - v) + bottom * v
}

/**
 * The light that does not change, for the rows j0 ≤ j < j1, written into `out` (RG bytes a node, the whole grid's
 * size): R the sun's shadow: from each node a ray walks toward the sun in growing steps (to about 60 km); the sun is
 * a disc `size` degrees across, so a ridge just grazing the ray dims it in part, and the penumbra widens with the
 * distance to the ridge. G the open sky: in eight directions, the highest horizon within about 9 km; the sky a node
 * sees is the mean of one minus the sine of those horizon angles (ambient occlusion).
 */
export function bakeLightRows(shape: Float32Array, g: Grid, sun: SunParams, out: Uint8Array, j0: number, j1: number) {
  const rad = Math.PI / 180
  const tanEl = Math.tan(sun.el * rad)
  const tanR = Math.tan((sun.size / 2) * rad)
  const sunXZ = [Math.sin(sun.az * rad), Math.cos(sun.az * rad)]
  const sunSteps: number[] = []
  for (let d = 400; d < 60000; d *= 1.18) sunSteps.push(d)
  const dirs: [number, number][] = []
  for (let a = 0; a < 8; a++) dirs.push([Math.cos((a * Math.PI) / 4), Math.sin((a * Math.PI) / 4)])
  const skySteps = [300, 700, 1300, 2200, 3600, 5800, 9000]
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i
      const x = g.x0 + i * g.cell
      const z = g.z0 + j * g.cell
      const h = shape[k]
      let lit = 1
      for (const d of sunSteps) {
        const clear = (h + d * tanEl - sample(shape, g, x + sunXZ[0] * d, z + sunXZ[1] * d)) / d
        lit = Math.min(lit, clamp(0.5 + (0.5 * clear) / tanR, 0, 1))
        if (lit <= 0) break
      }
      let sky = 0
      for (const [dx, dz] of dirs) {
        let horizon = 0
        for (const d of skySteps) horizon = Math.max(horizon, (sample(shape, g, x + dx * d, z + dz * d) - h) / d)
        sky += 1 - horizon / Math.hypot(1, horizon)
      }
      out[k * 2] = Math.round(lit * lit * (3 - 2 * lit) * 255)
      out[k * 2 + 1] = Math.round((sky / dirs.length) * 255)
    }
  }
}

/**
 * The cover smoothed for printing: three box means of WOOD_BOX_M either side, in metres (a forest smaller than about
 * the box fades, a large one keeps its core). The grid's cell must divide WOOD_BOX_M.
 */
export function smoothCover(cover: Uint8Array, nx: number, nz: number, cell: number): Uint8Array {
  const r = WOOD_BOX_M / cell
  if (!Number.isInteger(r)) throw new RangeError(`smoothCover: a cell of ${cell} m does not divide ${WOOD_BOX_M} m`)
  const smooth = boxMean(boxMean(boxMean(cover, nx, nz, r), nx, nz, r), nx, nz, r)
  return Uint8Array.from(smooth, v => Math.round(v))
}

/** The forest field: the smoothed cover, 0–255, on a grid of nx × nz nodes `cell` metres apart, the south row first. */
export interface ForestField {
  cell: number
  nx: number
  nz: number
  cover: Uint8Array
}

/**
 * The field on another grid over the same frame (nx × nz nodes `cell` metres apart from the same south-west corner):
 * bilinear between the field's nodes, held at its edge. Where a node falls on one of the field's, it is that node's
 * value, so the two layers agree.
 */
export function resampleField(field: ForestField, cell: number, nx: number, nz: number): Uint8Array {
  const out = new Uint8Array(nx * nz)
  const at = (i: number, j: number) => field.cover[Math.min(field.nz - 1, j) * field.nx + Math.min(field.nx - 1, i)]
  for (let j = 0; j < nz; j++) {
    const fz = (j * cell) / field.cell
    const j0 = Math.floor(fz)
    const v = fz - j0
    for (let i = 0; i < nx; i++) {
      const fx = (i * cell) / field.cell
      const i0 = Math.floor(fx)
      const u = fx - i0
      const south = at(i0, j0) * (1 - u) + at(i0 + 1, j0) * u
      const north = at(i0, j0 + 1) * (1 - u) + at(i0 + 1, j0 + 1) * u
      out[j * nx + i] = Math.round(south * (1 - v) + north * v)
    }
  }
  return out
}

/** A coverage mask: `w` × `h` texels of one byte, the south row first. */
export interface Mask {
  data: Uint8Array
  w: number
  h: number
}

// the mask's samples a texel, a side (4 × 4)
const MASK_SAMPLES = 4

/**
 * The lakes as a coverage mask over the frame the grid spans: `res` texels a cell (its texels tile the frame from edge
 * to edge, (nx - 1)·res × (nz - 1)·res), 255 in the water, each texel's share from 4 × 4 samples inside any ring, so
 * the page finds the shore between texels. A sample in two rings counts once: Natural Earth splits some lakes into
 * pieces that share an edge, which must not show as a seam.
 */
export function lakeMask(rings: Pt[][], g: Grid, res: number): Mask {
  const w = (g.nx - 1) * res
  const h = (g.nz - 1) * res
  const data = new Uint8Array(w * h)
  const texel = g.cell / res
  const n = MASK_SAMPLES
  // each ring's texel range, clamped to the frame (rings off it dropped)
  const boxes = rings
    .map(ring => {
      const at = (v: number, o: number, max: number) => Math.min(max, Math.max(0, Math.floor((v - o) / texel)))
      const xs = ring.map(p => p[0])
      const zs = ring.map(p => p[1])
      const box = {
        ring,
        i0: at(Math.min(...xs), g.x0, w - 1),
        i1: at(Math.max(...xs), g.x0, w - 1),
        j0: at(Math.min(...zs), g.z0, h - 1),
        j1: at(Math.max(...zs), g.z0, h - 1),
      }
      const off =
        Math.max(...xs) < g.x0 ||
        Math.min(...xs) > g.x0 + w * texel ||
        Math.max(...zs) < g.z0 ||
        Math.min(...zs) > g.z0 + h * texel
      return off ? null : box
    })
    .filter(box => box !== null)
  // a row of samples, west to east, and whether each is in the water
  const sx = Float64Array.from({ length: w * n }, (_, s) => g.x0 + ((s + 0.5) / n) * texel)
  const wet = new Uint8Array(w * n)
  const count = new Uint16Array(w)
  for (let j = 0; j < h; j++) {
    const here = boxes.filter(b => b.j0 <= j && j <= b.j1)
    if (!here.length) continue
    // only the texels the row's lakes span
    const i0 = Math.min(...here.map(b => b.i0))
    const i1 = Math.max(...here.map(b => b.i1))
    count.fill(0, i0, i1 + 1)
    for (let t = 0; t < n; t++) {
      wet.fill(0, i0 * n, (i1 + 1) * n)
      const z = g.z0 + (j + (t + 0.5) / n) * texel
      for (const b of here) {
        const inside = ringRow(b.ring, z, sx.subarray(b.i0 * n, (b.i1 + 1) * n))
        for (let s = 0; s < inside.length; s++) wet[b.i0 * n + s] |= inside[s]
      }
      for (let s = i0 * n; s < (i1 + 1) * n; s++) count[Math.floor(s / n)] += wet[s]
    }
    for (let i = i0; i <= i1; i++) data[j * w + i] = Math.round((count[i] * 255) / (n * n))
  }
  return { data, w, h }
}

/**
 * Lines (each a flat list of x, z in metres) as an offset field over the frame the grid spans, one texel a cell
 * ((nx - 1) × (nz - 1), texel (i, j) centred at (i + ½, j + ½) cells from the grid's corner): two bytes a texel, the
 * vector from its centre to the nearest point of a line, in cells, each axis mapped from -reach..reach to 0..255 (no
 * line within reach: the corner, reach both ways). The vector to a straight line is linear in the position, so a
 * bilinear read gives the exact distance between texels (a distance, V-shaped across the line, does not: the line
 * broke into dots). The prototype's bakeLines, for one kind of line.
 */
export function lineOffsets(lines: ArrayLike<number>[], g: Grid, reach: number): Uint8Array {
  const w = g.nx - 1
  const h = g.nz - 1
  const d = new Float32Array(w * h).fill(Infinity)
  const ox = new Float32Array(w * h).fill(reach)
  const oz = new Float32Array(w * h).fill(reach)
  /** Updates the nearest offsets around one segment (in cells), in the texels within reach of it. */
  const segment = (ax: number, az: number, bx: number, bz: number) => {
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach))
    const i1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + reach))
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - reach))
    const j1 = Math.min(h - 1, Math.ceil(Math.max(az, bz) + reach))
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz || 1e-9
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5
        const pz = j + 0.5
        const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1)
        const vx = ax + t * dx - px
        const vz = az + t * dz - pz
        const dist = Math.hypot(vx, vz)
        const k = j * w + i
        if (dist < d[k]) {
          d[k] = dist
          ox[k] = vx
          oz[k] = vz
        }
      }
    }
  }
  const cell = (v: number, o: number) => (v - o) / g.cell
  for (const p of lines) {
    for (let k = 2; k < p.length; k += 2) {
      segment(cell(p[k - 2], g.x0), cell(p[k - 1], g.z0), cell(p[k], g.x0), cell(p[k + 1], g.z0))
    }
  }
  const byte = (v: number) => Math.round(clamp((v / reach) * 0.5 + 0.5, 0, 1) * 255)
  const out = new Uint8Array(w * h * 2)
  for (let k = 0; k < w * h; k++) {
    out[k * 2] = byte(ox[k])
    out[k * 2 + 1] = byte(oz[k])
  }
  return out
}
