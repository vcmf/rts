// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a), from a compiled map's layers: the shaded relief on
// the height nodes and a mask per cell. Pure functions with no DOM, run in the map page's compile worker. Ported from
// the prototype's relief bake (prototypes/staff-map.html bakeRelief, docs/plans/active/relief-shading.md), with the
// light's direction a parameter instead of the north-west diagonal.
import type { Layers } from '../../map/apply.ts'
import type { Feature, Pt } from '../../map/schema.ts'
import type { Resolved } from '../../map/resolve.ts'
import { lineReach } from '../../map/apply.ts'
import { categoryOf } from '../../map/catalogue.ts'
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
 * The cells' mask, as RGBA bytes, the south row first: R the water's depth (0..1 over 0..WATER_FULL m), G the ways'
 * cells and those next to them (where the road ink may draw: a road's edges never show away from its cells), B the
 * water, A the yards (a
 * village's, a farm's, ground.yard).
 */
export function bakeMasks(
  L: Pick<Layers, 'nx' | 'nz' | 'way' | 'water' | 'depth' | 'table' | 'built' | 'ground'>,
): Uint8Array {
  const n = L.nx * L.nz
  const out = new Uint8Array(n * 4)
  const yard = L.table.map(r => /^(built\.(village|farm)|ground\.yard)(\.|$)/.test(r.kind))
  // the ways' cells and the cells next to them: a way's edge lies within a cell of its cells, wherever the line runs
  const nearWay = new Uint8Array(n)
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      if (!L.way[j * L.nx + i]) continue
      for (let b = Math.max(0, j - 1); b <= Math.min(L.nz - 1, j + 1); b++) {
        for (let a = Math.max(0, i - 1); a <= Math.min(L.nx - 1, i + 1); a++) nearWay[b * L.nx + a] = 1
      }
    }
  }
  for (let c = 0; c < n; c++) {
    out[c * 4] = Math.round(Math.min(1, L.depth[c] / 1000 / WATER_FULL) * 255)
    out[c * 4 + 1] = nearWay[c] ? 255 : 0
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
 * - R the ways' edges, from their centrelines (crisp hairlines at every zoom; the shader draws them only on the ways'
 *   cells), their free ends cut square, as apply paints them;
 * - G the water, B the barriers, A the woods, from their cells: what the sim reads, whatever rule put them there
 *   (priority, `clear`, a hedge's gates). The water's and the woods' fields are smoothed so their edges run through
 *   the cells' steps (within about a metre of the shapes), not along them; the barriers' stay square, on the grid by
 *   design (proposal §3.6).
 */
export function bakeInk(
  L: Pick<Layers, 'x0' | 'z0' | 'cell' | 'nx' | 'nz' | 'veg' | 'water' | 'barrier' | 'table'>,
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
  for (const w of ways) {
    for (let k = 1; k < w.line.length; k++) {
      const a = w.line[k - 1]
      const b = w.line[k]
      const ends: [boolean, boolean] = [k === 1, k === w.line.length - 1]
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
  store(sd, 0)
  // the water, the barriers and the woods, from their cells
  const wood = L.table.map(r => r.attrs.growth === 'stand')
  const mask = new Uint8Array(nx * nz)
  for (let c = 0; c < mask.length; c++) mask[c] = L.water[c] ? 1 : 0
  store(cellField(mask, nx, nz, cell, true), 1)
  for (let c = 0; c < mask.length; c++) mask[c] = L.barrier[c] ? 1 : 0
  store(cellField(mask, nx, nz, cell, false), 2)
  for (let c = 0; c < mask.length; c++) mask[c] = L.veg[c] && wood[L.veg[c] - 1] ? 1 : 0
  store(cellField(mask, nx, nz, cell, true), 3)
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
 * curved edge instead of along them.
 */
export function cellField(mask: Uint8Array, nx: number, nz: number, cell: number, smooth: boolean): Float32Array {
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
  let f = new Float32Array(nx * nz)
  for (let c = 0; c < f.length; c++) f[c] = (mask[c] ? -(inside[c] - 0.5) : outside[c] - 0.5) * cell
  if (!smooth) return f
  const W = [1, 4, 6, 4, 1]
  for (const along of [1, nx]) {
    const g = new Float32Array(f.length)
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        let s = 0
        for (let k = -2; k <= 2; k++) {
          const ii = along === 1 ? Math.min(nx - 1, Math.max(0, i + k)) : i
          const jj = along === 1 ? j : Math.min(nz - 1, Math.max(0, j + k))
          s += W[k + 2] * f[jj * nx + ii]
        }
        g[j * nx + i] = s / 16
      }
    }
    f = g
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
