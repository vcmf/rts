// The campaign map's bake (docs/plans/active/k1-theatre-look.md, the proof of concept of the tiles): the one shape
// the 3D map is raised by and lit from, the lakes sunk into it, and the light that does not change (the sun's soft
// shadow and the sky's occlusion), on any grid. The same steps as prototypes/campaign-map.html (buildShape,
// lakeDistance, sinkLakes, bakeLight), which bakes them at load on the 250 m grid; tools/campaign-tiles.ts bakes them
// offline at 100 m. Plain float64 in a tool, not the sim's. Tested in test/campaign-bake.test.ts.
import { inRing } from '../src/map/geometry.ts'
import type { Pt } from '../src/map/schema.ts'

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

/** The lakes sunk into the shape (in place): `sink` m below the shore, eased in over the shore's half cell. */
export function sinkLakes(shape: Float32Array, dist: Float32Array, cell: number, sink: number): Float32Array {
  for (let k = 0; k < shape.length; k++) shape[k] -= sink * clamp((dist[k] * 1000) / cell + 0.5, 0, 1)
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
