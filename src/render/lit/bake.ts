// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a), from a compiled map's layers: the shaded relief on
// the height nodes and a mask per cell. Pure functions with no DOM, run in the map page's compile worker. Ported from
// the prototype's relief bake (prototypes/staff-map.html bakeRelief, docs/plans/active/relief-shading.md), with the
// light's direction a parameter instead of the north-west diagonal.
import type { Layers } from '../../map/apply.ts'
import { sstep } from '../../look/noise.ts'

// the light: toward it, one of the grid's eight directions (x east, z north), and its height
export const LIGHTS = {
  n: [0, 1],
  ne: [1, 1],
  e: [1, 0],
  se: [1, -1],
  s: [0, -1],
  sw: [-1, -1],
  w: [-1, 0],
  nw: [-1, 1],
} as const
export type LightDir = keyof typeof LIGHTS
export const RELIEF = {
  sun: 30, // degrees above the horizon
  z: 2, // the heights' exaggeration, for the light only (as shaded-relief prints do)
  soft: 4, // m: a cast shadow's soft edge
  near: 24, // m: the exposure's near box (its half-width)
  wide: 80, // m: and its wide one
  lambert: [0.6, 1.4] as const, // the slope light's stored range (1 on flat ground in its middle)
}
export const WATER_FULL = 1.5 // m: the depth the mask stores as 1

/** The light's horizontal direction, a unit vector (x, z) toward it. */
export function lightXZ(dir: LightDir): [number, number] {
  const [x, z] = LIGHTS[dir]
  const l = Math.sqrt(x * x + z * z)
  return [x / l, z / l]
}

/** Box mean of a grid over a square of half-width r nodes, edges clamped, by a summed-area table. */
function boxMean(h: Float32Array, nx: number, nz: number, r: number): Float32Array {
  const W = nx + 1
  const S = new Float64Array(W * (nz + 1))
  for (let j = 0; j < nz; j++) {
    let row = 0
    for (let i = 0; i < nx; i++) {
      row += h[j * nx + i]
      S[(j + 1) * W + i + 1] = S[j * W + i + 1] + row
    }
  }
  const out = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    const j0 = Math.max(0, j - r)
    const j1 = Math.min(nz, j + r + 1)
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - r)
      const i1 = Math.min(nx, i + r + 1)
      const sum = S[j1 * W + i1] - S[j0 * W + i1] - S[j1 * W + i0] + S[j0 * W + i0]
      out[j * nx + i] = sum / ((i1 - i0) * (j1 - j0))
    }
  }
  return out
}

/**
 * The shaded relief on the height nodes, as RGBA bytes, the south row first: R the slope's light (Lambert over
 * RELIEF.lambert, its middle on flat ground), G the cast shadow (255 lit), B the exposure (128 even, lower in hollows,
 * higher on crests). `heights`: (nx) × (nz) nodes `cell` m apart, m.
 *
 * Cast shadow in one pass: walking from the light's side, each node carries the highest shadow line reaching it (its
 * neighbour's toward the light, dropped by the sun's slope over one step, or its own height); a node under that line
 * is in shadow, softly over the first RELIEF.soft metres.
 */
export function bakeRelief(heights: Float64Array, nx: number, nz: number, cell: number, dir: LightDir): Uint8Array {
  const [di, dj] = LIGHTS[dir]
  const h0 = Float32Array.from(heights)
  const h = new Float32Array(h0.length)
  for (let k = 0; k < h.length; k++) h[k] = h0[k] * RELIEF.z
  const el = (RELIEF.sun * Math.PI) / 180
  const drop = cell * Math.sqrt(di * di + dj * dj) * Math.tan(el)
  const [lx, lz] = lightXZ(dir)
  const L = [lx * Math.cos(el), Math.sin(el), lz * Math.cos(el)]

  // the walk: the neighbour toward the light first
  const line = new Float32Array(nx * nz)
  const lit = new Float32Array(nx * nz)
  const js = dj > 0 ? { from: nz - 1, to: -1, by: -1 } : { from: 0, to: nz, by: 1 }
  const is = di > 0 ? { from: nx - 1, to: -1, by: -1 } : { from: 0, to: nx, by: 1 }
  for (let j = js.from; j !== js.to; j += js.by) {
    for (let i = is.from; i !== is.to; i += is.by) {
      const k = j * nx + i
      const ti = i + di
      const tj = j + dj
      const from = ti >= 0 && ti < nx && tj >= 0 && tj < nz ? line[tj * nx + ti] - drop : -Infinity
      line[k] = Math.max(h[k], from)
      lit[k] = 1 - sstep(0, 1, (from - h[k]) / (RELIEF.soft * RELIEF.z))
    }
  }

  // exposure: how far a node stands above or below its surroundings, from the true heights
  const near = boxMean(h0, nx, nz, Math.round(RELIEF.near / cell))
  const wide = boxMean(h0, nx, nz, Math.round(RELIEF.wide / cell))

  const out = new Uint8Array(nx * nz * 4)
  const [lo, hi] = RELIEF.lambert
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      // central differences, one-sided at the grid's edges (over their true span)
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(nx - 1, i + 1)
      const j0 = Math.max(0, j - 1)
      const j1 = Math.min(nz - 1, j + 1)
      const gx = (h[j * nx + i1] - h[j * nx + i0]) / ((i1 - i0) * cell)
      const gz = (h[j1 * nx + i] - h[j0 * nx + i]) / ((j1 - j0) * cell)
      const nl = Math.sqrt(gx * gx + 1 + gz * gz)
      const lambert = Math.max(0, (-gx * L[0] + L[1] - gz * L[2]) / nl) / L[1] // 1 on flat ground
      const exposed = 0.5 - ((near[k] - h0[k]) * 0.1 + (wide[k] - h0[k]) * 0.03)
      out[k * 4] = Math.round(Math.min(1, Math.max(0, (lambert - lo) / (hi - lo))) * 255)
      out[k * 4 + 1] = Math.round(lit[k] * 255)
      out[k * 4 + 2] = Math.round(Math.min(1, Math.max(0, exposed)) * 255)
      out[k * 4 + 3] = 255
    }
  }
  return out
}

/**
 * The cells' mask, as RGBA bytes, the south row first: R the water's depth (0..1 over 0..WATER_FULL m), G the woods
 * (vegetation that grows as a stand), B the water; A unused.
 */
export function bakeMasks(L: Pick<Layers, 'nx' | 'nz' | 'veg' | 'water' | 'depth' | 'table'>): Uint8Array {
  const n = L.nx * L.nz
  const out = new Uint8Array(n * 4)
  const wood = L.table.map(r => r.attrs.growth === 'stand')
  for (let c = 0; c < n; c++) {
    out[c * 4] = Math.round(Math.min(1, L.depth[c] / 1000 / WATER_FULL) * 255)
    out[c * 4 + 1] = L.veg[c] && wood[L.veg[c] - 1] ? 255 : 0
    out[c * 4 + 2] = L.water[c] ? 255 : 0
    out[c * 4 + 3] = 255
  }
  return out
}
