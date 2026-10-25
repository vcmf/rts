// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a), from a compiled map's layers: the shaded relief on
// the height nodes and a mask per cell. Pure functions with no DOM, run in the map page's compile worker. Ported from
// the prototype's relief bake (prototypes/staff-map.html bakeRelief, docs/plans/active/relief-shading.md), with the
// light's direction a parameter instead of the north-west diagonal.
import type { Layers } from '../../map/apply.ts'
import type { Feature, Pt } from '../../map/schema.ts'
import type { Resolved } from '../../map/resolve.ts'
import { inRing } from '../../map/geometry.ts'
import { ringsOf } from '../../map/reach.ts'
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
 * (vegetation that grows as a stand), B the water, A the yards (a village's, a farm's, ground.yard).
 */
export function bakeMasks(
  L: Pick<Layers, 'nx' | 'nz' | 'veg' | 'water' | 'depth' | 'table' | 'built' | 'ground'>,
): Uint8Array {
  const n = L.nx * L.nz
  const out = new Uint8Array(n * 4)
  const wood = L.table.map(r => r.attrs.growth === 'stand')
  // a village's or a farm's trodden yard, and a yard of its own
  const yard = L.table.map(r => /^(built\.(village|farm)|ground\.yard)(\.|$)/.test(r.kind))
  for (let c = 0; c < n; c++) {
    out[c * 4] = Math.round(Math.min(1, L.depth[c] / 1000 / WATER_FULL) * 255)
    out[c * 4 + 1] = L.veg[c] && wood[L.veg[c] - 1] ? 255 : 0
    out[c * 4 + 2] = L.water[c] ? 255 : 0
    out[c * 4 + 3] = (L.built[c] && yard[L.built[c] - 1]) || (L.ground[c] && yard[L.ground[c] - 1]) ? 255 : 0
  }
  return out
}

// the ink's distance field (M6b): signed metres to the nearest edge, stored over ±INK_RANGE in a byte
export const INK_RANGE = 8 // m

/** A line feature drawn as ink: its centreline and half-width; or an area: its rings. */
interface Inked {
  line?: Pt[]
  rings?: Pt[][]
  half: number // m: a line's half-width (0 for an area)
}

/**
 * The ink's distance fields on the cells, as RGBA bytes, the south row first: per channel the signed distance from a
 * cell's centre to the nearest edge of a kind of feature (negative inside), over ±INK_RANGE m, 128 at the edge:
 * R the ways (their two edges), G the water (a stream's banks, a pond's shore), B the barriers, A the woods. The shader
 * fills the water and the woods from these, not from the cells, so their edges are the shapes'. A distance field
 * reads between its texels as straight as the edge itself, so the hairlines stay crisp at every zoom.
 */
export function bakeInk(
  grid: { x0: number; z0: number; cell: number; nx: number; nz: number },
  layers: { way: Inked[]; water: Inked[]; barrier: Inked[]; wood: Inked[] },
): Uint8Array {
  const { x0, z0, cell, nx, nz } = grid
  const out = new Uint8Array(nx * nz * 4)
  const field = (items: Inked[], ch: number) => {
    const sd = new Float32Array(nx * nz).fill(INK_RANGE)
    // the cells within reach of a box, with each one's centre
    const each = (box: number[], fn: (c: number, x: number, z: number) => void) => {
      const i0 = Math.max(0, Math.floor((box[0] - x0) / cell))
      const i1 = Math.min(nx - 1, Math.floor((box[2] - x0) / cell))
      const j0 = Math.max(0, Math.floor((box[1] - z0) / cell))
      const j1 = Math.min(nz - 1, Math.floor((box[3] - z0) / cell))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) fn(j * nx + i, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)
      }
    }
    for (const it of items) {
      const reach = it.half + INK_RANGE
      if (it.line) {
        for (let k = 1; k < it.line.length; k++) {
          const a = it.line[k - 1]
          const b = it.line[k]
          const box = [
            Math.min(a[0], b[0]) - reach,
            Math.min(a[1], b[1]) - reach,
            Math.max(a[0], b[0]) + reach,
            Math.max(a[1], b[1]) + reach,
          ]
          each(box, (c, x, z) => {
            const v = segDistance(a, b, x, z) - it.half
            if (v < sd[c]) sd[c] = v
          })
        }
      }
      if (it.rings) {
        const pts = it.rings[0]
        const box = [
          Math.min(...pts.map(p => p[0])) - INK_RANGE,
          Math.min(...pts.map(p => p[1])) - INK_RANGE,
          Math.max(...pts.map(p => p[0])) + INK_RANGE,
          Math.max(...pts.map(p => p[1])) + INK_RANGE,
        ]
        each(box, (c, x, z) => {
          let d = Infinity
          for (const ring of it.rings!) {
            for (let k = 0; k < ring.length; k++) {
              d = Math.min(d, segDistance(ring[k], ring[(k + 1) % ring.length], x, z))
            }
          }
          const inside = inRing(it.rings![0], [x, z]) && !it.rings!.slice(1).some(h => inRing(h, [x, z]))
          const v = inside ? -d : d
          if (v < sd[c]) sd[c] = v
        })
      }
    }
    for (let c = 0; c < sd.length; c++) {
      out[c * 4 + ch] = Math.round(128 + (Math.max(-INK_RANGE, Math.min(INK_RANGE, sd[c])) / INK_RANGE) * 127)
    }
  }
  field(layers.way, 0)
  field(layers.water, 1)
  field(layers.barrier, 2)
  field(layers.wood, 3)
  return out
}

/** The distance from (x, z) to the segment a–b, m. */
function segDistance(a: Pt, b: Pt, x: number, z: number): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0
  const ex = a[0] + dx * t - x
  const ez = a[1] + dz * t - z
  return Math.sqrt(ex * ex + ez * ez)
}

/**
 * The ink of a compiled map's features: its ways, water and barriers, each with its shape and half-width from its
 * resolved attributes (a barrier's thickness in cells).
 */
export function inkOf(features: Feature[], table: Resolved[], cell: number): Parameters<typeof bakeInk>[1] {
  const byId = new Map(table.map(r => [r.id, r]))
  const out: Parameters<typeof bakeInk>[1] = { way: [], water: [], barrier: [], wood: [] }
  for (const f of features) {
    const r = byId.get(f.id)
    if (!r) continue
    const cat = r.kind.split('.')[0]
    const width = typeof r.attrs.width === 'number' ? r.attrs.width : 0
    if (cat === 'way' && f.line) out.way.push({ line: f.line, half: width / 2 })
    else if (cat === 'water' && f.line) out.water.push({ line: f.line, half: width / 2 })
    else if (cat === 'water') {
      const rings = ringsOf(f)
      if (rings) out.water.push({ rings, half: 0 })
    } else if (r.attrs.growth === 'stand') {
      const rings = ringsOf(f)
      if (rings) out.wood.push({ rings, half: 0 })
    } else if (cat === 'barrier' && f.line) {
      const cells = typeof r.attrs.thickness === 'number' ? r.attrs.thickness : 2
      out.barrier.push({ line: f.line, half: (cells * cell) / 2 })
    }
  }
  return out
}
