// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a), from a compiled map's layers: the shaded relief on
// the height nodes and a mask per cell. Pure functions with no DOM, run in the map page's compile worker. Ported from
// the prototype's relief bake (prototypes/staff-map.html bakeRelief, docs/plans/active/relief-shading.md), with the
// light's direction a parameter instead of the north-west diagonal.
import type { Layers } from '../../map/apply.ts'
import type { Feature, Pt } from '../../map/schema.ts'
import type { Resolved } from '../../map/resolve.ts'
import { ringsOf } from '../../map/reach.ts'
import { lineReach } from '../../map/apply.ts'
import { listOf, type Clear } from '../../map/util.ts'
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
 * The cells' mask, as RGBA bytes, the south row first: R the water's depth (0..1 over 0..WATER_FULL m), G unused (the
 * woods come from the ink's field), B the water, A the yards (a village's, a farm's, ground.yard).
 */
export function bakeMasks(
  L: Pick<Layers, 'nx' | 'nz' | 'veg' | 'water' | 'depth' | 'table' | 'built' | 'ground'>,
): Uint8Array {
  const n = L.nx * L.nz
  const out = new Uint8Array(n * 4)
  // a village's or a farm's trodden yard, and a yard of its own
  const yard = L.table.map(r => /^(built\.(village|farm)|ground\.yard)(\.|$)/.test(r.kind))
  for (let c = 0; c < n; c++) {
    out[c * 4] = Math.round(Math.min(1, L.depth[c] / 1000 / WATER_FULL) * 255)
    out[c * 4 + 1] = 0 // unused: the woods come from the ink's field (M6b)
    out[c * 4 + 2] = L.water[c] ? 255 : 0
    out[c * 4 + 3] = (L.built[c] && yard[L.built[c] - 1]) || (L.ground[c] && yard[L.ground[c] - 1]) ? 255 : 0
  }
  return out
}

// the ink's distance field (M6b): signed metres to the nearest edge, stored over ±INK_RANGE in a byte
export const INK_RANGE = 8 // m

/**
 * A feature drawn as ink: a line (its centreline and half-width) or an area (its rings, holes after the outer one),
 * less the bands of the lines it keeps clear of (`clear`: the line and how far from it the area begins, m).
 */
export interface Inked {
  line?: Pt[]
  rings?: Pt[][]
  half: number
  cut?: { line: Pt[]; near: number }[]
}

/**
 * The ink's distance fields on the cells, as RGBA bytes, the south row first: per channel the signed distance from a
 * cell's centre to the nearest edge of a kind of feature (negative inside), over ±INK_RANGE m, 128 at the edge:
 * R the ways (their two edges), G the water (a stream's banks, a pond's shore), B the barriers, A the woods. The shader
 * fills the water and the woods from these, not from the cells, so their edges are the shapes'. A distance field
 * reads between its texels as straight as the edge itself, so the hairlines stay crisp at every zoom. The barriers
 * are on the grid by design (proposal §3.6): their field is their cells' (`barrier`), gates open.
 */
export function bakeInk(
  grid: { x0: number; z0: number; cell: number; nx: number; nz: number },
  layers: { way: Inked[]; water: Inked[]; wood: Inked[] },
  barrier: Uint16Array,
): Uint8Array {
  const { x0, z0, cell, nx, nz } = grid
  const out = new Uint8Array(nx * nz * 4)
  const cellsOf = (box: number[]) => ({
    i0: Math.max(0, Math.floor((box[0] - x0) / cell)),
    i1: Math.min(nx - 1, Math.floor((box[2] - x0) / cell)),
    j0: Math.max(0, Math.floor((box[1] - z0) / cell)),
    j1: Math.min(nz - 1, Math.floor((box[3] - z0) / cell)),
  })
  // each cell within reach of a segment (and inside `clip`, a cell range, if given), with the segment's distance to its
  // centre: `d` measured to the segment, and `over` how far the centre lies past a free end of the line (0 when it
  // does not: `ends` says whether the segment's start and end are the line's)
  const band = (
    a: Pt,
    b: Pt,
    reach: number,
    ends: [boolean, boolean],
    fn: (c: number, d: number, over: number) => void,
    clip?: { i0: number; i1: number; j0: number; j1: number },
  ) => {
    let r = cellsOf([
      Math.min(a[0], b[0]) - reach,
      Math.min(a[1], b[1]) - reach,
      Math.max(a[0], b[0]) + reach,
      Math.max(a[1], b[1]) + reach,
    ])
    if (clip) {
      r = {
        i0: Math.max(r.i0, clip.i0),
        i1: Math.min(r.i1, clip.i1),
        j0: Math.max(r.j0, clip.j0),
        j1: Math.min(r.j1, clip.j1),
      }
    }
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const q = segNear(a, b, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, ends)
        fn(j * nx + i, q.d, q.over)
      }
    }
  }
  const segEnds = (line: Pt[], k: number): [boolean, boolean] => [k === 1, k === line.length - 1]
  const field = (items: Inked[], ch: number) => {
    const sd = new Float32Array(nx * nz).fill(INK_RANGE)
    for (const it of items) {
      if (it.line) {
        // a line narrower than a cell keeps cell·√½ of half-width, so some cell centre always lies inside it, as
        // apply paints every line at least a cell wide; its free ends are cut square, as apply paints them
        const half = Math.max(it.half, cell * Math.SQRT1_2)
        for (let k = 1; k < it.line.length; k++) {
          band(it.line[k - 1], it.line[k], half + INK_RANGE, segEnds(it.line, k), (c, d, over) => {
            // past a free end the line ends square: there the field is the larger of the two distances
            const v = over > 0 ? Math.max(d - half, over) : d - half
            if (v < sd[c]) sd[c] = v
          })
        }
      }
      if (it.rings) areaField(it, sd)
    }
    for (let c = 0; c < sd.length; c++) {
      out[c * 4 + ch] = Math.round(128 + (Math.max(-INK_RANGE, Math.min(INK_RANGE, sd[c])) / INK_RANGE) * 127)
    }
  }
  // an area's signed field into sd (a union by min): the distance near its edges, inside or out by a scanline fill of
  // its rings (even-odd, so holes are out), less the bands it keeps clear of
  const areaField = (it: Inked, sd: Float32Array) => {
    const rings = it.rings!
    const all = rings.flat()
    const r = cellsOf([
      Math.min(...all.map(p => p[0])) - INK_RANGE,
      Math.min(...all.map(p => p[1])) - INK_RANGE,
      Math.max(...all.map(p => p[0])) + INK_RANGE,
      Math.max(...all.map(p => p[1])) + INK_RANGE,
    ])
    const w = r.i1 - r.i0 + 1
    const h = r.j1 - r.j0 + 1
    if (w <= 0 || h <= 0) return
    const local = (c: number) => (Math.floor(c / nx) - r.j0) * w + ((c % nx) - r.i0)
    const dist = new Float32Array(w * h).fill(INK_RANGE)
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k++) {
        band(ring[k], ring[(k + 1) % ring.length], INK_RANGE, [false, false], (c, d) => {
          const q = local(c)
          if (d < dist[q]) dist[q] = d
        })
      }
    }
    const inside = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) {
      const z = z0 + (r.j0 + j + 0.5) * cell
      const xs: number[] = []
      for (const ring of rings) {
        for (let k = 0; k < ring.length; k++) {
          const [ax, az] = ring[k]
          const [bx, bz] = ring[(k + 1) % ring.length]
          if (az <= z !== bz <= z) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax))
        }
      }
      xs.sort((u, v) => u - v)
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] - x0) / cell - 0.5) - r.i0)
        const i1 = Math.min(w - 1, Math.floor((xs[q + 1] - x0) / cell - 0.5) - r.i0)
        for (let i = i0; i <= i1; i++) inside[j * w + i] = 1
      }
    }
    const v = new Float32Array(w * h)
    for (let q = 0; q < v.length; q++) v[q] = inside[q] ? -dist[q] : dist[q]
    // the bands it keeps clear of: outside the area within `near` of the line, but not past the line's free ends
    // (apply clears only the cells the line takes)
    for (const cut of it.cut ?? []) {
      for (let k = 1; k < cut.line.length; k++) {
        band(
          cut.line[k - 1],
          cut.line[k],
          cut.near + INK_RANGE,
          segEnds(cut.line, k),
          (c, d, over) => {
            const q = local(c)
            // inside the band (positive), square at the line's free ends: past one it ends
            const out = over > 0 ? Math.min(cut.near - d, -over) : cut.near - d
            if (out > v[q]) v[q] = out
          },
          r,
        )
      }
    }
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const c = (r.j0 + j) * nx + r.i0 + i
        if (v[j * w + i] < sd[c]) sd[c] = v[j * w + i]
      }
    }
  }
  field(layers.way, 0)
  field(layers.water, 1)
  field(layers.wood, 3)
  // the barriers' cells: half a cell inside or out at each centre, so the edge lies on the cells' sides
  for (let c = 0; c < nx * nz; c++) {
    out[c * 4 + 2] = Math.round(128 + ((barrier[c] ? -cell / 2 : cell / 2) / INK_RANGE) * 127)
  }
  return out
}

/**
 * The distance from (x, z) to the segment a–b, m, and how far it lies past a free end (`ends`: whether a and b are the
 * line's ends; past one, `d` is the distance across the line, so the end is cut square).
 */
function segNear(a: Pt, b: Pt, x: number, z: number, ends: [boolean, boolean]): { d: number; over: number } {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz
  const L = Math.sqrt(l2)
  const t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0
  if ((t < 0 && ends[0]) || (t > 1 && ends[1])) {
    const across = L > 0 ? Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / L : 0
    return { d: across, over: (t < 0 ? -t : t - 1) * L }
  }
  const u = Math.min(1, Math.max(0, t))
  const ex = a[0] + dx * u - x
  const ez = a[1] + dz * u - z
  return { d: Math.sqrt(ex * ex + ez * ez), over: 0 }
}

/**
 * The ink of a compiled map's features: its ways, water and woods, each with its shape and half-width from its resolved
 * attributes, and a wood's `clear` lines with the reach apply gives them (`lineReach`, a sunken way's cut, the offset).
 */
export function inkOf(features: Feature[], table: Resolved[]): Parameters<typeof bakeInk>[1] {
  const byId = new Map(table.map(r => [r.id, r]))
  const lines = new Map(features.filter(f => f.line).map(f => [f.id, f.line!]))
  const out: Parameters<typeof bakeInk>[1] = { way: [], water: [], wood: [] }
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
      if (!rings) continue
      const cut = listOf<Clear>(f.clear).flatMap(e => {
        const lr = byId.get(e.id)
        const line = lines.get(e.id)
        if (!lr || !line) return []
        const sunk = lr.kind.startsWith('way.') && typeof lr.attrs.cut === 'number' && lr.attrs.cut > 0
        const w = typeof lr.attrs.width === 'number' ? lr.attrs.width : 0
        return [{ line, near: Math.max(lineReach(lr.kind, lr.attrs), sunk ? w / 2 + 0.5 : 0) + (e.offset ?? 0) }]
      })
      out.wood.push({ rings, half: 0, cut })
    }
  }
  return out
}
