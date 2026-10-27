// Apply (docs/proposals/map-engine.md §4, docs/plans/done/m1-language.md M1b): the expanded map's features
// laid into the five layers on the 2 m grid over the map's extent, in the engine's fixed order:
//   1. relief: the base ground (seeded noise) and the landforms (hill, ridge, valley, plateau, scarp), summed, and
//      real relief (dem), which sets the height in its area;
//      then the mends of modern works out of real relief (decision 0073);
//   2. relief edits, now that every shape exists: raise, lower, level, cut, ditch, and a way's cut or raise;
//   3. water: the cells under streams, rivers and ponds (levels and carving: M2);
//   4. areas: ground and vegetation;
//   5. ways and barriers (barriers by the cell rule of §3.6);
//   6. built and works; then zones.
// Within a layer, features paint in (priority, id) order, so the higher priority wins and, at equal priority, the
// later id. Exact maths only (decision 0006): + − × /, sqrt, and src/sim/num.ts's trig.
import type { AttrValue, Catalogue, Feature, MapFile, Pt, Ramp } from './schema.ts'
import { categoryOf, kindChain, kindMeta } from './catalogue.ts'
import type { Resolved } from './resolve.ts'
import { resolve } from './resolve.ts'
import { crossings, inRing, isClosedLine, lineLength, pointAt, ringRow } from './geometry.ts'
import { cos, sin } from '../sim/num.ts'
import { seedOf } from './seed.ts'
import type { Clear } from './util.ts'
import { listOf, num, smooth } from './util.ts'
import { addFbmGrid } from './noise.ts'
import type { Dem } from './dem.ts'
import { demPlace, demSampler } from './dem.ts'

export const CELL = 2 // m (decision 0021)
// widths where the catalogue gives none: a way's (every way kind sets one), and the bands of the line-shaped kinds
// that take no width attribute (reeds along a bank, a flèche's earthwork), m
// the water (§4 step 3): the level sits FREEBOARD m under the lower bank, read BANK_OUT m beyond each edge every
// LEVEL_STEP m; a pond reaches its full depth SHORE_IN m in from its shore. A pond with no level of its own is dammed:
// its level the median of its shore, at most DAM m above the shore's lowest point; the ground DAM_OUT m past its shore
// raised to the level where lower, easing down over DAM_RAMP m and fading within FADE m of other water or a cut (the
// dam); its water only where the ground is at most the freeboard above the level, its bed reached from that shore
// (#230)
const FREEBOARD = 0.4
const DAM = 2
const DAM_OUT = 4
const DAM_RAMP = 10
const FADE = 10
const BANK_OUT = 3
const LEVEL_STEP = 2
const SHORE_IN = 10
const BRIDGE_REACH = 4
const WAY_WIDTH = 5
const WATER_WIDTH = 6
const EDIT_WIDTH = 4
const LANDFORM_WIDTH = 100
const VEG_LINE = 4
const WORK_LINE = 6

// a line edit's weight at distance d from its centreline: 1 within its half-width, then easing to 0 over its edge;
// a cell is marked where it is at least one half
const editWeight = (d: number, w2: number, edge: number): number =>
  d <= w2 ? 1 : edge > 0 ? smooth(1 - (d - w2) / edge) : 0

// How far from its centreline a line feature takes cells, as apply paints it (the painters below take it from here):
// a road's or a stream's half-width, at least just over half a cell; a barrier's band; a cut's or a ditch's width and
// half its soft edge (where its weight reaches one half); 0 for a line that takes no cell (a row of trees, a ridge)
export function lineReach(kind: string, attrs: Record<string, AttrValue>): number {
  const c = CELL
  const painted = (hw: number) => Math.max(hw, c / 2 + 0.01)
  const category = categoryOf(kind)
  if (category === 'barrier') return (num(attrs.thickness, 2) * c) / 2
  if (category === 'water') return painted(num(attrs.width, WATER_WIDTH) / 2)
  if (category === 'way') return painted(num(attrs.width, WAY_WIDTH) / 2)
  if (category === 'veg') return attrs.growth === 'tree' ? 0 : painted(VEG_LINE / 2)
  if (category === 'built' || category === 'work') return painted(WORK_LINE / 2)
  if (kind === 'relief.cut' || kind === 'relief.ditch') return num(attrs.width, EDIT_WIDTH) / 2 + num(attrs.edge, 5) / 2
  return 0
}

export interface Layers {
  cell: number
  nx: number
  nz: number
  x0: number
  z0: number // cells; cell (i, j) spans x0 + i·cell … + cell
  height: Float64Array // (nx + 1) × (nz + 1) nodes, node (i, j) at (x0 + i·cell, z0 + j·cell), m above the datum
  table: Resolved[] // the features, resolved for the map's season; a layer's value k ≥ 1 is table[k − 1]
  ground: Uint16Array
  veg: Uint16Array
  water: Uint16Array
  way: Uint16Array
  barrier: Uint16Array
  built: Uint16Array
  zone: Uint16Array
  edit: Uint16Array // the last cut or ditch (a relief cut, a ditch, a sunken way) that covers the cell: the draft
  // draws it, and it marks the cell for the ruleset's crossing rule; other edits leave no mark
  density: Uint8Array // the vegetation's density × 255 (ramps evaluated per cell)
  depth: Uint16Array // the water's depth over the cell, mm (the water's level less the cell's mean ground; 0: dry)
  // each stream's or river's level every `step` m from its first point
  streams: { id: string; step: number; levels: Float64Array }[]
  // the free-standing trees (growth "tree"), one by one: they stand on the cells and change none (a poplar in a
  // wheat field leaves the wheat); k is the feature in `table`. A point gives one, a line a row: as many as whole
  // `spacing`s fit in its length (at least one), evenly, half a step in from each end
  trees: { x: number; z: number; k: number }[]
}
export const LAYER_NAMES = ['ground', 'veg', 'water', 'way', 'barrier', 'built', 'zone', 'edit'] as const

// a landform's profile over t = distance / half-width (1 at the centre, 0 from t = 1 on)
function profile(kind: AttrValue | undefined, t: number): number {
  if (t >= 1) return 0
  if (kind === 'flat') {
    if (t < 0.4) return 1
    const s = (t - 0.4) / 0.6
    const q = 1 - s * s
    return q * q
  }
  if (kind === 'sharp') return (1 - t) * (1 - t)
  const q = 1 - t * t
  return q * q
}

// the nearest point of a polyline: distance, which side (left of the direction of travel: +1), how far past a
// free end along its tangent (0 inside), and the distance along the line to the nearest point. With `maxD`, the search
// stops once no segment within it can remain: the answer is the same for a point within `maxD` of the line, and some
// distance beyond it (Infinity when none was looked at) for a point farther, which the caller discards (a long line's
// box holds far more ground than its reach, and a far point's search would cross the whole grid)
interface Near {
  d: number
  side: number
  over: number
  along: number
}
export function nearLine(line: Pt[], px: number, pz: number, maxD = Infinity): Near {
  return line.length > INDEX_FROM ? nearIndexed(lineIndex(line), line, px, pz, maxD) : nearScan(line, px, pz, maxD)
}

// the full scan: scalars only, a segment whose box lies farther than the best so far skipped; ties keep the
// earlier segment
export function nearScan(line: Pt[], px: number, pz: number, maxD = Infinity): Near {
  let bd = Infinity
  let bd2 = Infinity
  const max2 = maxD * maxD
  let side = 1
  let over = 0
  let along = 0
  let acc = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const ax = line[k][0]
    const az = line[k][1]
    const bx = line[k + 1][0]
    const bz = line[k + 1][1]
    const dx = bx - ax
    const dz = bz - az
    const L2 = dx * dx + dz * dz
    const L = Math.sqrt(L2)
    const ox =
      px < (ax < bx ? ax : bx) ? (ax < bx ? ax : bx) - px : px > (ax > bx ? ax : bx) ? px - (ax > bx ? ax : bx) : 0
    const oz =
      pz < (az < bz ? az : bz) ? (az < bz ? az : bz) - pz : pz > (az > bz ? az : bz) ? pz - (az > bz ? az : bz) : 0
    const o2 = ox * ox + oz * oz
    if (o2 > (bd2 < max2 ? bd2 : max2)) {
      acc += L
      continue
    }
    const t = ((px - ax) * dx + (pz - az) * dz) / L2
    const tc = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = ax + tc * dx
    const qz = az + tc * dz
    const d = Math.sqrt((px - qx) * (px - qx) + (pz - qz) * (pz - qz))
    if (d < bd) {
      bd = d
      bd2 = d * d
      over = k === 0 && t < 0 ? -t * L : k === line.length - 2 && t > 1 ? (t - 1) * L : 0
      side = dx * (pz - az) - dz * (px - ax) >= 0 ? 1 : -1
      along = acc + tc * L
    }
    acc += L
  }
  return { d: bd, side, over, along }
}

// long lines (a meandered stream has hundreds of segments) get a bucket grid of their segments, searched in rings
// out from the point until no nearer segment can remain; the same answer as the scan, ties to the earlier segment
const INDEX_FROM = 24
const BUCKET = 32
interface LineIndex {
  x0: number
  z0: number
  nx: number
  nz: number
  buckets: number[][]
  cum: Float64Array
}
const indexes = new WeakMap<Pt[], LineIndex>()
function lineIndex(line: Pt[]): LineIndex {
  let ix = indexes.get(line)
  if (ix) return ix
  const xs = line.map(p => p[0])
  const zs = line.map(p => p[1])
  const x0 = Math.min(...xs)
  const z0 = Math.min(...zs)
  const nx = Math.floor((Math.max(...xs) - x0) / BUCKET) + 1
  const nz = Math.floor((Math.max(...zs) - z0) / BUCKET) + 1
  const buckets: number[][] = Array.from({ length: nx * nz }, () => [])
  const cum = new Float64Array(line.length)
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k]
    const [bx, bz] = line[k + 1]
    cum[k + 1] = cum[k] + Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az))
    const i0 = Math.floor((Math.min(ax, bx) - x0) / BUCKET)
    const i1 = Math.floor((Math.max(ax, bx) - x0) / BUCKET)
    const j0 = Math.floor((Math.min(az, bz) - z0) / BUCKET)
    const j1 = Math.floor((Math.max(az, bz) - z0) / BUCKET)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * nx + i].push(k)
  }
  ix = { x0, z0, nx, nz, buckets, cum }
  indexes.set(line, ix)
  return ix
}
function nearIndexed(ix: LineIndex, line: Pt[], px: number, pz: number, maxD: number): Near {
  let bd = Infinity
  let bk = -1
  let side = 1
  let over = 0
  let along = 0
  const ci = Math.floor((px - ix.x0) / BUCKET)
  const cj = Math.floor((pz - ix.z0) / BUCKET)
  const last = line.length - 2
  const visit = (k: number) => {
    const ax = line[k][0]
    const az = line[k][1]
    const bx = line[k + 1][0]
    const bz = line[k + 1][1]
    const dx = bx - ax
    const dz = bz - az
    const L2 = dx * dx + dz * dz
    const L = Math.sqrt(L2)
    const t = ((px - ax) * dx + (pz - az) * dz) / L2
    const tc = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = ax + tc * dx
    const qz = az + tc * dz
    const d = Math.sqrt((px - qx) * (px - qx) + (pz - qz) * (pz - qz))
    if (d < bd || (d === bd && k < bk)) {
      bd = d
      bk = k
      over = k === 0 && t < 0 ? -t * L : k === last && t > 1 ? (t - 1) * L : 0
      side = dx * (pz - az) - dz * (px - ax) >= 0 ? 1 : -1
      along = ix.cum[k] + tc * L
    }
  }
  // rings of buckets around the point's (clamped into the grid, so a point outside still finds the nearest ring); a
  // segment not yet visited lies in ring r or beyond, at least max(the point's distance to the grid, (r − 1)·BUCKET)
  // away (a bucket off on the diagonal is nearer than their sum)
  const gi = Math.min(ix.nx - 1, Math.max(0, ci))
  const gj = Math.min(ix.nz - 1, Math.max(0, cj))
  const outside = Math.max(0, ix.x0 - px, px - (ix.x0 + ix.nx * BUCKET), ix.z0 - pz, pz - (ix.z0 + ix.nz * BUCKET))
  const R = Math.max(ix.nx, ix.nz)
  for (let r = 0; r <= R; r++) {
    const bound = Math.max(outside, (r - 1) * BUCKET)
    if ((bk >= 0 && bd < bound) || bound > maxD) break
    // the ring's buckets only: its top and bottom rows, then its sides between them
    const at = (i: number, j: number) => {
      if (i >= 0 && j >= 0 && i < ix.nx && j < ix.nz) for (const k of ix.buckets[j * ix.nx + i]) visit(k)
    }
    for (let i = gi - r; i <= gi + r; i++) {
      at(i, gj - r)
      if (r) at(i, gj + r)
    }
    for (let j = gj - r + 1; j <= gj + r - 1; j++) {
      at(gi - r, j)
      if (r) at(gi + r, j)
    }
  }
  return { d: bd, side, over, along }
}

// a feature's shape as a field: whether a point is inside (even-odd over all rings), and its distance in from
// (positive) or out from (negative) the edge. The edge costs more, so callers ask for it only where it is used.
interface Field {
  box: [number, number, number, number]
  inside(px: number, pz: number): boolean
  edge(px: number, pz: number): number
  // `inside` for a row of points (xs[k], z) at once, xs ascending (an area's: its rings' crossings with the row)
  row?(z: number, xs: ArrayLike<number>): Uint8Array
  // how much farther than `edge` says the true edge can lie (an ellipse's along its long axis), 1 by default
  stretch: number
}

/**
 * Each node's distance (m) to the nearest node where `mask` is 0, over a w × h grid of nodes `cell` m apart: 0 there,
 * else by two passes of steps of `cell` across and cell·√2 diagonally (a chamfer distance, within 8 % of the true
 * one). Infinity where the grid has no 0.
 */
export function chamfer(mask: Uint8Array, w: number, h: number, cell: number): Float64Array {
  const d = Float64Array.from(mask, v => (v ? Infinity : 0))
  const diag = cell * Math.SQRT2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (!d[k]) continue
      if (x > 0) d[k] = Math.min(d[k], d[k - 1] + cell)
      if (y > 0) {
        d[k] = Math.min(d[k], d[k - w] + cell)
        if (x > 0) d[k] = Math.min(d[k], d[k - w - 1] + diag)
        if (x < w - 1) d[k] = Math.min(d[k], d[k - w + 1] + diag)
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const k = y * w + x
      if (!d[k]) continue
      if (x < w - 1) d[k] = Math.min(d[k], d[k + 1] + cell)
      if (y < h - 1) {
        d[k] = Math.min(d[k], d[k + w] + cell)
        if (x < w - 1) d[k] = Math.min(d[k], d[k + w + 1] + diag)
        if (x > 0) d[k] = Math.min(d[k], d[k + w - 1] + diag)
      }
    }
  }
  return d
}
function areaField(f: Feature): Field | null {
  if (f.area) {
    const rings = f.area
    const closed = rings.map(r => [...r, r[0]])
    const xs = rings[0].map(p => p[0])
    const zs = rings[0].map(p => p[1])
    const inside = (x: number, z: number) => {
      let k = false
      for (const r of rings) if (inRing(r, [x, z])) k = !k
      return k
    }
    return {
      box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
      inside,
      stretch: 1,
      row: (z, xs) => {
        // even-odd over the rings, as `inside`
        const out = ringRow(rings[0], z, xs)
        for (let r = 1; r < rings.length; r++) {
          const h = ringRow(rings[r], z, xs)
          for (let k = 0; k < xs.length; k++) out[k] ^= h[k]
        }
        return out
      },
      edge: (x, z) => {
        let d = Infinity
        for (const r of closed) d = Math.min(d, nearLine(r, x, z).d)
        return inside(x, z) ? d : -d
      },
    }
  }
  if (f.circle) {
    const [[cx, cz], r] = f.circle
    const d = (x: number, z: number) => Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz))
    return {
      box: [cx - r, cz - r, cx + r, cz + r],
      inside: (x, z) => d(x, z) < r,
      edge: (x, z) => r - d(x, z),
      stretch: 1,
    }
  }
  if (f.ellipse) {
    const [[cx, cz], ra, rb, ang] = f.ellipse
    const c = cos(ang)
    const s = sin(ang)
    const m = Math.max(ra, rb)
    const q = (x: number, z: number) => {
      const u = ((x - cx) * c + (z - cz) * s) / ra
      const v = (-(x - cx) * s + (z - cz) * c) / rb
      return Math.sqrt(u * u + v * v)
    }
    // the edge distance is approximate off the axes: enough for ramps and blends
    return {
      box: [cx - m, cz - m, cx + m, cz + m],
      inside: (x, z) => q(x, z) < 1,
      edge: (x, z) => (1 - q(x, z)) * Math.min(ra, rb),
      stretch: m / Math.min(ra, rb),
    }
  }
  return null
}

// a ramp's value at an input (edge distance or along-line distance), clamped to its first and last stops
function ramp(v: AttrValue | undefined, input: { edge?: number; along?: number }, dflt: number): number {
  if (typeof v === 'number') return v
  if (!v || typeof v !== 'object') return dflt
  const [key, stops] = Object.entries(v as Ramp)[0] as ['edge' | 'along', [number, number][]]
  const x = input[key] ?? 0
  if (x <= stops[0][0]) return stops[0][1]
  for (let k = 1; k < stops.length; k++) {
    if (x <= stops[k][0]) {
      const [x0, y0] = stops[k - 1]
      const [x1, y1] = stops[k]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return stops[stops.length - 1][1]
}

/**
 * The expanded map laid into its layers. `dems`: the decoded heightfields of its dem sources, by source id, as
 * `checkFiles` returns them (a map without real relief needs none).
 */
export function apply(map: MapFile, cat: Catalogue, dems: Map<string, Dem> = new Map()): Layers {
  const c = CELL
  const nx = map.extent.w / c
  const nz = map.extent.h / c
  const x0 = -map.extent.w / 2
  const z0 = -map.extent.h / 2
  const n = nx * nz
  const U = () => new Uint16Array(n)
  const L: Layers = {
    cell: c,
    nx,
    nz,
    x0,
    z0,
    height: new Float64Array((nx + 1) * (nz + 1)),
    table: [],
    ground: U(),
    veg: U(),
    water: U(),
    way: U(),
    barrier: U(),
    built: U(),
    zone: U(),
    edit: U(),
    density: new Uint8Array(n),
    depth: U(),
    streams: [],
    trees: [],
  }
  // features in painting order: priority, then id
  const order = map.features
    .map(f => ({ f, r: resolve(f, map, cat) }))
    .sort((a, b) => a.r.priority - b.r.priority || (a.f.id < b.f.id ? -1 : a.f.id > b.f.id ? 1 : 0))
  order.forEach(({ r }) => L.table.push(r))
  const index = new Map(order.map(({ f }, k) => [f.id, k + 1]))
  const byId = new Map(map.features.map(f => [f.id, f]))
  const isEdit = (r: Resolved) =>
    kindMeta(cat, kindChain(cat, r.kind)!).edit ||
    (categoryOf(r.kind) === 'way' && (num(r.attrs.cut) > 0 || num(r.attrs.raise) > 0))

  // the cells (i, j ranges) a box covers, clamped to the grid
  const cells = (
    box: [number, number, number, number],
    pad: number,
    fn: (i: number, j: number, x: number, z: number) => void,
  ) => {
    const i0 = Math.max(0, Math.floor((box[0] - pad - x0) / c))
    const i1 = Math.min(nx - 1, Math.floor((box[2] + pad - x0) / c))
    const j0 = Math.max(0, Math.floor((box[1] - pad - z0) / c))
    const j1 = Math.min(nz - 1, Math.floor((box[3] + pad - z0) / c))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, x0 + (i + 0.5) * c, z0 + (j + 0.5) * c)
  }
  const nodes = (box: [number, number, number, number], pad: number, fn: (k: number, x: number, z: number) => void) => {
    const i0 = Math.max(0, Math.floor((box[0] - pad - x0) / c))
    const i1 = Math.min(nx, Math.ceil((box[2] + pad - x0) / c))
    const j0 = Math.max(0, Math.floor((box[1] - pad - z0) / c))
    const j1 = Math.min(nz, Math.ceil((box[3] + pad - z0) / c))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * (nx + 1) + i, x0 + i * c, z0 + j * c)
  }
  const lineBox = (line: Pt[]): [number, number, number, number] => [
    Math.min(...line.map(p => p[0])),
    Math.min(...line.map(p => p[1])),
    Math.max(...line.map(p => p[0])),
    Math.max(...line.map(p => p[1])),
  ]
  const H = L.height

  // 1. landforms, summed
  for (const { f, r } of order) {
    if (categoryOf(r.kind) !== 'relief' || isEdit(r)) continue
    const a = r.attrs
    const h = num(a.height)
    const w2 = num(a.width, LANDFORM_WIDTH) / 2
    const kind = r.kind.split('.')[1]
    if (kind === 'base') {
      // the gentle ground between the landforms: value noise over the whole extent, ± height, at the scale of width
      if (h === 0) continue
      addFbmGrid(H, seedOf(map.seed, f.id, 'noise'), x0, z0, nx, nz, c, num(a.width, 400), h)
    } else if (kind === 'hill') {
      const field = f.point ? areaField({ id: f.id, circle: [f.point, w2] })! : areaField(f)!
      const rad = f.point ? w2 : f.circle ? f.circle[1] : Math.min(f.ellipse![1], f.ellipse![2])
      nodes(field.box, 0, (k, x, z) => {
        H[k] += h * profile(a.profile, 1 - field.edge(x, z) / rad)
      })
    } else if (kind === 'ridge' || kind === 'valley') {
      // the crest tapers to nothing over the last half-width at each end, so a ridge ends as a spur, not a wall
      const steep = a.steep
      const len = lineLength(f.line!)
      nodes(lineBox(f.line!), w2 * 1.4, (k, x, z) => {
        // beyond 1.4 half-widths (the wider side) the profile is 0
        const q = nearLine(f.line!, x, z, w2 * 1.4)
        const sideHalf =
          w2 * (steep === 'left' ? (q.side > 0 ? 0.6 : 1.4) : steep === 'right' ? (q.side < 0 ? 0.6 : 1.4) : 1)
        const taper = q.over > 0 ? 0 : smooth(Math.min(q.along, len - q.along) / w2)
        H[k] += h * taper * profile(a.profile, q.d / sideHalf)
      })
    } else if (kind === 'scarp') {
      // a step in the land: the face rises over its width, centred on the line; the high side then stays up and
      // returns to the ground around it over `edge` m (the back slope); past the line's ends it fades over a width
      const high = a.steep === 'right' ? -1 : 1
      const back = Math.max(num(a.edge, 150), 2 * w2) // a back slope never steeper than the face
      nodes(lineBox(f.line!), w2 + back, (k, x, z) => {
        // beyond the back slope the step has returned to the ground on either side
        const q = nearLine(f.line!, x, z, w2 + back)
        const s = q.side * high * q.d
        const rise = s <= w2 ? smooth((s + w2) / (2 * w2)) : smooth(1 - (s - w2) / back)
        // past the ends the step fades over the back slope's length, not as a wall
        H[k] += h * rise * smooth(1 - q.over / back)
      })
    } else if (kind === 'dem') {
      // real relief (docs/plans/done/m5-relief.md): the file's heights, less the datum, set in the piece's area
      // (the whole extent with no shape) and blended into the ground under it over its edge
      const d = dems.get(f.source as string)
      if (!d) throw new Error(`${f.id}: its dem source "${String(f.source)}" was not loaded (checkFiles first)`)
      // read through its placement: a scale model's heights above the datum divided by its scale (decision 0070)
      const pl = demPlace(a)
      const datum = map.datum ?? 0
      const read = demSampler(d)
      const set = (k: number, x: number, z: number, w: number) => {
        H[k] += ((read(pl.k * x + pl.x, pl.k * z + pl.z) - datum) / pl.k - H[k]) * w
      }
      if (!f.area) {
        nodes([x0, z0, -x0, -z0], 0, (k, x, z) => set(k, x, z, 1))
        continue
      }
      const field = areaField(f)!
      const edge = num(a.edge, 0)
      nodes(field.box, edge, (k, x, z) => {
        const e = field.edge(x, z)
        const w = e >= 0 ? 1 : edge > 0 ? smooth(1 + e / edge) : 0
        if (w > 0) set(k, x, z, w)
      })
    } else if (kind === 'plateau') {
      const field = areaField(f)!
      const edge = num(a.edge, 60)
      nodes(field.box, edge, (k, x, z) => {
        const e = field.edge(x, z)
        H[k] += h * (e >= 0 ? 1 : smooth(1 + e / edge))
      })
    }
  }

  // 1b. mends (decision 0073): the ground under a modern work rebuilt from the ground around it. They belong to the
  // relief: the water's levels and the edits read the mended ground. Every mend reads the same ground, the relief
  // before any mend, and never a node within any mend's reach, so the mends are independent of their order and of
  // each other; where two overlap, the ground takes their targets' mean by weight. Along a line, each node takes the
  // blend across the line of the ground on each side, sampled out along the line's direction over its own reach (a
  // chord, so it turns smoothly through a bend) at the first ground no mend reaches; over an area, the plane through
  // the ground on its rim (least squares) that no mend reaches.
  // the mends (a subkind of relief.mend too), summed in an order of their own content, not their ids, so a rename
  // changes no bit where three or more overlap
  const isMend = (r: Resolved) => kindChain(cat, r.kind)?.includes('relief.mend') ?? false
  const content = ({ f, r }: { f: Feature; r: Resolved }) => JSON.stringify([r.kind, f.line, f.area, f.circle, r.attrs])
  const mends = order
    .filter(({ r }) => isMend(r))
    .map(e => ({ ...e, key: content(e) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  if (mends.length) {
    const reached = new Uint8Array(H.length)
    const found = mends.map(({ f, r }) => {
      const a = r.attrs
      const edge = num(a.edge, 5)
      const w2 = f.line ? num(a.width, EDIT_WIDTH) / 2 : 0
      const field = f.line ? null : areaField(f)
      const box = f.line ? lineBox(f.line) : field?.box
      const ks: number[] = []
      const ws: number[] = []
      const near: Near[] = []
      if (box) {
        nodes(box, w2 + edge + c, (k, x, z) => {
          let w: number
          let n: Near | null = null
          if (f.line) {
            n = nearLine(f.line, x, z, w2 + edge)
            w = editWeight(n.d, w2, edge)
          } else {
            const e = field!.edge(x, z)
            w = e >= 0 ? 1 : edge > 0 ? smooth(1 + e / edge) : 0
          }
          if (w <= 0) return
          ks.push(k)
          ws.push(w)
          if (n) near.push(n)
          reached[k] = 1
        })
      }
      return { f, edge, w2, field, box, ks, ws, near }
    })
    // a point whose four nodes no mend reaches (its height read from ground as it was)
    // 1 where the point's four nodes are free, 0 where a mend reaches one of them, −1 off the map
    const free = (x: number, z: number): number => {
      const u = (x - x0) / c
      const v = (z - z0) / c
      if (u < 0 || v < 0 || u > nx || v > nz) return -1
      const i = Math.floor(u)
      const j = Math.floor(v)
      const i1 = i < nx ? i + 1 : i
      const j1 = j < nz ? j + 1 : j
      const w = nx + 1
      return reached[j * w + i] || reached[j * w + i1] || reached[j1 * w + i] || reached[j1 * w + i1] ? 0 : 1
    }
    const sumW = new Float64Array(H.length)
    const sumWT = new Float64Array(H.length)
    const maxW = new Float64Array(H.length)
    for (const m of found) {
      const target = new Float64Array(m.ks.length)
      if (m.f.line) {
        const line = m.f.line
        const R = m.w2 + m.edge
        // each vertex's distance along the line, and the point at a distance by halving over them
        const cum = [0]
        for (let k = 0; k + 1 < line.length; k++) {
          const [dx, dz] = [line[k + 1][0] - line[k][0], line[k + 1][1] - line[k][1]]
          cum.push(cum[k] + Math.sqrt(dx * dx + dz * dz))
        }
        const total = cum[cum.length - 1]
        const at = (s: number): [number, number, number, number] => {
          let [lo, hi] = [0, line.length - 2]
          while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (cum[mid + 1] >= s) hi = mid
            else lo = mid + 1
          }
          const [a, b] = [line[lo], line[lo + 1]]
          const L1 = cum[lo + 1] - cum[lo]
          const u = L1 > 0 ? Math.min(1, Math.max(0, (s - cum[lo]) / L1)) : 0
          const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
          return [a[0] + u * dx, a[1] + u * dz, L1 > 0 ? dx / L1 : 1, L1 > 0 ? dz / L1 : 0]
        }
        const limit = R + 400 // the farthest a side is looked for, in m
        // the height on one side: out from p along (ux, uz), from just past the reach to the first free ground; none
        // when the map's edge or the limit comes first (the ground there is the work's or beyond the map)
        const side = (px: number, pz: number, ux: number, uz: number): [number, number] | null => {
          for (let s = R + c; s < limit; s += c) {
            const fr = free(px + ux * s, pz + uz * s)
            if (fr < 0) return null
            if (fr > 0) return [s, heightOf(L, px + ux * s, pz + uz * s, H)]
          }
          return null
        }
        m.ks.forEach((_k, q) => {
          const n = m.near[q]
          const [px, pz, sx, sz] = at(n.along)
          // the line's direction: the chord over its own reach each way
          const [ax, az] = at(Math.max(0, n.along - R))
          const [bx, bz] = at(Math.min(total, n.along + R))
          const len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az))
          const [tx, tz] = len > 0 ? [(bx - ax) / len, (bz - az) / len] : [sx, sz]
          // left (the normal (−tz, tx)) and right; one side alone where the other has no free ground, none: as it is
          const l = side(px, pz, -tz, tx)
          const r = side(px, pz, tz, -tx)
          const o = n.over > 0 ? 0 : n.side * n.d
          if (l && r) target[q] = r[1] + ((l[1] - r[1]) * (o + r[0])) / (l[0] + r[0])
          else if (l || r) {
            // one side: its slope across the line, from a second sample R farther out, carried in; level where the
            // side's free ground lies past twice the reach (a slope carried farther drifts off the ground) or none
            const [u, v] = l ? [-tz, tx] : [tz, -tx]
            const [s1, h1] = (l ?? r)!
            const s2 = s1 + R
            const far =
              s1 <= 2 * R && free(px + u * s2, pz + v * s2) > 0 ? heightOf(L, px + u * s2, pz + v * s2, H) : h1
            // the node's distance out along that side, negative across the line
            const t = l ? o : -o
            target[q] = h1 + ((far - h1) * (t - s1)) / (s2 - s1)
          } else target[q] = NaN
        })
      } else if (m.field && m.box) {
        const field = m.field
        // the rim: the nodes within two cells past the edge's blend that no mend reaches
        const [cx, cz] = [(m.box[0] + m.box[2]) / 2, (m.box[1] + m.box[3]) / 2]
        let [n1, sx, sz, sxx, sxz, szz, sh, sxh, szh] = [0, 0, 0, 0, 0, 0, 0, 0, 0]
        // the whole rim's nodes, on the map or off it (the grid's spacing, unclipped), against which the free ones
        // (n1) are counted
        let ring = 0
        const pad = m.edge + 2 * c
        for (let gz = Math.floor((m.box[1] - pad - z0) / c); gz <= Math.ceil((m.box[3] + pad - z0) / c); gz++) {
          for (let gx = Math.floor((m.box[0] - pad - x0) / c); gx <= Math.ceil((m.box[2] + pad - x0) / c); gx++) {
            const e = field.edge(x0 + gx * c, z0 + gz * c)
            if (e < -m.edge && e >= -m.edge - 2 * c) ring++
          }
        }
        nodes(m.box, m.edge + 2 * c, (k, x, z) => {
          const e = field.edge(x, z)
          if (e >= -m.edge || e < -m.edge - 2 * c || reached[k]) return
          const [u, v, h] = [x - cx, z - cz, H[k]]
          n1 += 1
          sx += u
          sz += v
          sxx += u * u
          sxz += u * v
          szz += v * v
          sh += h
          sxh += u * h
          szh += v * h
        })
        if (n1 === 0) continue
        // the normal equations by Cramer's rule; a rim in a line, or under a quarter of it free (reached by other
        // mends or off the map: a plane from a shorter arc tilts on its noise; a quarter still holds the ground's
        // slope, which a mean loses), takes its mean
        const det = n1 * (sxx * szz - sxz * sxz) - sx * (sx * szz - sxz * sz) + sz * (sx * sxz - sxx * sz)
        const flat = Math.abs(det) < 1e-9 * (n1 * sxx * szz + 1) || 4 * n1 < ring
        const p0 = flat
          ? sh / n1
          : (sh * (sxx * szz - sxz * sxz) - sx * (sxh * szz - sxz * szh) + sz * (sxh * sxz - sxx * szh)) / det
        const gx = flat
          ? 0
          : (n1 * (sxh * szz - sxz * szh) - sh * (sx * szz - sxz * sz) + sz * (sx * szh - sxh * sz)) / det
        const gz = flat
          ? 0
          : (n1 * (sxx * szh - sxh * sxz) - sx * (sx * szh - sxh * sz) + sh * (sx * sxz - sxx * sz)) / det
        m.ks.forEach((k, q) => {
          const i = k % (nx + 1)
          const j = (k - i) / (nx + 1)
          target[q] = p0 + gx * (x0 + i * c - cx) + gz * (z0 + j * c - cz)
        })
      } else continue
      m.ks.forEach((k, q) => {
        if (Number.isNaN(target[q])) return
        sumW[k] += m.ws[q]
        sumWT[k] += m.ws[q] * target[q]
        if (m.ws[q] > maxW[k]) maxW[k] = m.ws[q]
      })
    }
    for (let k = 0; k < H.length; k++) if (sumW[k] > 0) H[k] += (sumWT[k] / sumW[k] - H[k]) * maxW[k]
  }

  // the landforms' ground, mended, before any edit or channel: what water levels are read from, so a cut, a ditch or
  // another body of water by a bank cannot pull a stream's level down, whatever the features' order
  const H0 = Float64Array.from(H)
  const hAt = (x: number, z: number) => heightOf(L, x, z, H0)

  // 2. relief edits, in painting order (the mends are done)
  for (const { f, r } of order) {
    if (!isEdit(r) || isMend(r)) continue
    const a = r.attrs
    const k1 = index.get(f.id)!
    const kind = r.kind
    const edge = categoryOf(kind) === 'way' ? 1 : num(a.edge, 5)
    const field = f.line ? null : areaField(f)
    const weight = (x: number, z: number): number => {
      if (f.line) {
        const w2 = num(a.width, EDIT_WIDTH) / 2
        return editWeight(nearLine(f.line, x, z, w2 + edge).d, w2, edge)
      }
      const e = field!.edge(x, z)
      return e >= 0 ? 1 : edge > 0 ? smooth(1 + e / edge) : 0
    }
    const box = f.line ? lineBox(f.line) : field!.box
    const pad = (f.line ? num(a.width, EDIT_WIDTH) / 2 : 0) + edge + c
    const op = categoryOf(kind) === 'way' ? (num(a.cut) > 0 ? 'cut-way' : 'raise-way') : kind.split('.')[1]
    nodes(box, pad, (k, x, z) => {
      const w = weight(x, z)
      if (w <= 0) return
      if (op === 'raise') H[k] += num(a.height) * w
      else if (op === 'lower') H[k] -= num(a.height) * w
      else if (op === 'level') H[k] += (num(a.to) - H[k]) * w
      else if (op === 'cut' || op === 'ditch') H[k] -= num(a.depth) * w
      else if (op === 'cut-way') H[k] -= num(a.cut) * w
      else if (op === 'raise-way') H[k] += num(a.raise) * w
    })
    if (op === 'cut' || op === 'ditch' || op === 'cut-way') {
      cells(box, pad, (i, j, x, z) => {
        if (weight(x, z) >= 0.5) L.edit[j * nx + i] = k1
      })
    }
  }

  // 3–6. the cell layers, in painting order within each
  const paintArea = (
    f: Feature,
    layer: Uint16Array,
    k1: number,
    onCell?: (cell: number, edge: number) => void,
    needEdge = false,
    // a cell of the area the caller leaves unpainted (a pond's ground left dry up a slope)
    skip?: (i: number, j: number) => boolean,
  ) => {
    const field = areaField(f)
    if (!field) return
    const kept = keptOff(f)
    // a ramp's `edge` counts from where the area's cells begin: its ring, or a line it keeps off (decision 0030)
    const edgeAt = (x: number, z: number) => {
      let e = field.edge(x, z)
      // never below 0 (past a line's end)
      // a line counts only nearer than the ring's edge: cut off there (a far cell's search crosses no whole grid)
      for (const l of kept?.lines ?? []) {
        e = Math.min(e, Math.max(0, nearLine(l.line, x, z, Math.max(0, e) + l.near).d - l.near))
      }
      return e
    }
    const paint = (i: number, j: number, x: number, z: number) => {
      if (!kept?.masks.some(m => m[j * nx + i] === 1) && !skip?.(i, j)) {
        layer[j * nx + i] = k1
        onCell?.(j * nx + i, needEdge ? edgeAt(x, z) : 0)
      }
    }
    if (field.row) {
      // row by row: an area's inside found from its rings' crossings with the row, not cell by cell
      const i0 = Math.max(0, Math.floor((field.box[0] - x0) / c))
      const i1 = Math.min(nx - 1, Math.floor((field.box[2] - x0) / c))
      const j0 = Math.max(0, Math.floor((field.box[1] - z0) / c))
      const j1 = Math.min(nz - 1, Math.floor((field.box[3] - z0) / c))
      // the cells' centres as `cells` gives them
      const xs = Float64Array.from({ length: Math.max(0, i1 - i0 + 1) }, (_, k) => x0 + (i0 + k + 0.5) * c)
      for (let j = j0; j <= j1; j++) {
        const z = z0 + (j + 0.5) * c
        const inRow = field.row(z, xs)
        for (let i = i0; i <= i1; i++) if (inRow[i - i0]) paint(i, j, xs[i - i0], z)
      }
    } else {
      cells(field.box, 0, (i, j, x, z) => {
        if (field.inside(x, z)) paint(i, j, x, z)
      })
    }
  }
  // the cells a line takes, by the very rule that paints it (decision 0030), and `offset` m more: an area that keeps
  // off it paints none of them, so no cell is both and none between is left out. One mask per line and offset, made
  // once, over the line's box only
  const masks = new Map<string, Uint8Array>()
  const maskOf = (id: string, offset: number): Uint8Array => {
    const key = `${id} ${offset}`
    let t = masks.get(key)
    if (t) return t
    t = new Uint8Array(n)
    // each line by its own rule, widened by the offset (so a hedge's gates and a stream's ends keep their shape)
    const m = t
    const g = byId.get(id)!
    const r = L.table[index.get(id)! - 1]
    const line = g.line!
    const a = r.attrs
    const reach = lineReach(r.kind, a)
    const put = (cell: number) => {
      m[cell] = 1
    }
    const marks = (w2: number, edge: number) =>
      cells(lineBox(line), w2 + edge + c, (i, j, x, z) => {
        if (editWeight(nearLine(line, x, z, w2 + edge).d, w2, edge) >= 0.5) put(j * nx + i)
      })
    if (categoryOf(r.kind) === 'barrier') {
      barrierCells(
        line,
        num(a.thickness, 2) + (2 * offset) / c,
        a.gaps as { every: number; width: number } | undefined,
        (i, j) => {
          if (i >= 0 && j >= 0 && i < nx && j < nz) put(j * nx + i)
        },
        x0,
        z0,
      )
    } else if (r.kind === 'relief.cut' || r.kind === 'relief.ditch') {
      marks(num(a.width, EDIT_WIDTH) / 2 + offset, num(a.edge, 5))
    } else if (reach > 0) paintLine(line, reach + offset, m, 1)
    // a sunken way's cut marks a little wider
    if (categoryOf(r.kind) === 'way' && num(a.cut) > 0) marks(num(a.width, EDIT_WIDTH) / 2 + offset, 1)
    masks.set(key, m)
    return m
  }
  const keptOffOf = new Map<string, { masks: Uint8Array[]; lines: { line: Pt[]; near: number }[] } | null>()
  const keptOff = (f: Feature) => {
    if (keptOffOf.has(f.id)) return keptOffOf.get(f.id)!
    const clear = listOf<Clear>(f.clear)
    const out = clear.length
      ? {
          masks: clear.map(e => maskOf(e.id, e.offset ?? 0)),
          // where the area's cells begin, from each line: its reach,
          // a sunken way's cut marks (half a metre more), the offset
          lines: clear.map(e => {
            const r = L.table[index.get(e.id)! - 1]
            const cutWay = categoryOf(r.kind) === 'way' && num(r.attrs.cut) > 0
            return {
              line: byId.get(e.id)!.line!,
              near:
                Math.max(lineReach(r.kind, r.attrs), cutWay ? num(r.attrs.width, EDIT_WIDTH) / 2 + 0.5 : 0) +
                (e.offset ?? 0),
            }
          }),
        }
      : null
    keptOffOf.set(f.id, out)
    return out
  }
  // a line takes the cells whose centre lies strictly within its half-width, and at least the cells beside it (a
  // 1.5 m path, a 2 m rill): widths round the same way for every line (a 6 m stream and a 5 m road on even metres
  // both take 4 m, a 10 m stream 8 m), as the barrier rule does
  const paintLine = (
    line: Pt[],
    halfWidth: number,
    layer: Uint16Array | Uint8Array,
    k1: number,
    onCell?: (cell: number, along: number) => void,
  ) => {
    const half = Math.max(halfWidth, c / 2 + 0.01)
    cells(lineBox(line), half + c, (i, j, x, z) => {
      const q = nearLine(line, x, z, half)
      if (q.d < half && q.over === 0) {
        layer[j * nx + i] = k1
        onCell?.(j * nx + i, q.along)
      }
    })
  }
  // the ponds with a level from their shore (decision 0073's neighbours: #230), for their dams after all the water
  const ponds: { field: Field; lv: number }[] = []

  /**
   * A pond's level from its shore as the landforms made it: the median of its shore, at most DAM above its lowest
   * point, less the freeboard (the ponds of 1805 were dammed on their streams); null with no shore on the map.
   */
  const shoreLevel = (field: Field): number | null => {
    const shore: number[] = []
    cells(field.box, c, (i, j, x, z) => {
      if (field.inside(x, z) && field.edge(x, z) < c) shore.push(hAt(x, z))
    })
    if (!shore.length) return null
    shore.sort((p, q) => p - q)
    return Math.min(shore[0] + DAM, shore[(shore.length - 1) >> 1]) - FREEBOARD
  }

  /**
   * A pond's bed: its water stands on the nodes inside whose ground (as the landforms made it) is at most the
   * freeboard above its level; each is cut to the level less the depth, reached SHORE_IN m from the nearest node that
   * is not (its drawn edge, or dry ground up a slope), so the shore up a slope tapers as the drawn one does. The bed
   * is a height, so a stream's channel under it is not cut deeper. Returns whether a node is the pond's water.
   */
  const pondBed = (field: Field, lv: number, D: number): { wet(k: number): boolean } => {
    const W = nx + 1
    const i0 = Math.max(0, Math.floor((field.box[0] - x0) / c))
    const i1 = Math.min(nx, Math.ceil((field.box[2] - x0) / c))
    const j0 = Math.max(0, Math.floor((field.box[1] - z0) / c))
    const j1 = Math.min(nz, Math.ceil((field.box[3] - z0) / c))
    const bw = i1 - i0 + 1
    const bh = j1 - j0 + 1
    const wet = new Uint8Array(bw * bh)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const [x, z] = [x0 + i * c, z0 + j * c]
        if (H0[j * W + i] <= lv + FREEBOARD && field.edge(x, z) > 0) wet[(j - j0) * bw + i - i0] = 1
      }
    }
    const dist = chamfer(wet, bw, bh, c)
    for (let q = 0; q < bw * bh; q++) {
      if (!wet[q]) continue
      const k = (j0 + Math.floor(q / bw)) * W + i0 + (q % bw)
      const bed = lv - D * smooth(dist[q] / SHORE_IN)
      if (bed < H[k]) H[k] = bed
    }
    return {
      wet: k => {
        const i = k % W
        const j = (k - i) / W
        return i >= i0 && i <= i1 && j >= j0 && j <= j1 && wet[(j - j0) * bw + i - i0] === 1
      },
    }
  }

  /**
   * The dams of ponds levelled from their shore: the ground DAM_OUT past a pond's shore raised to its level and the
   * freeboard where lower, easing down over DAM_RAMP outside, and fading out within FADE of any water or cut cell
   * (a stream through the dam keeps its banks, a sunken way its cut, a neighbouring pond its ground); each node takes
   * the highest raise any dam wants of the ground as it was before them, so their order does not matter.
   */
  const damPonds = (list: { field: Field; lv: number }[]) => {
    if (!list.length) return
    const W = nx + 1
    // the nodes touching a water or a cut cell, and every node's distance to the nearest of them
    const near = new Uint8Array(W * (nz + 1))
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (!L.water[j * nx + i] && !L.edit[j * nx + i]) continue
        near[j * W + i] = near[j * W + i + 1] = near[(j + 1) * W + i] = near[(j + 1) * W + i + 1] = 1
      }
    }
    const away = chamfer(
      Uint8Array.from(near, v => 1 - v),
      W,
      nz + 1,
      c,
    )
    const raised = new Float64Array(H.length).fill(-Infinity)
    for (const { field, lv } of list) {
      const top = lv + FREEBOARD
      // an ellipse's edge distance shrinks along its long axis: padded for it
      const pad = (DAM_OUT + DAM_RAMP) * field.stretch + c
      nodes(field.box, pad, (k, x, z) => {
        if (H[k] >= top) return
        const e = field.edge(x, z)
        if (e > 0 || e < -DAM_OUT - DAM_RAMP) return
        const w = (e >= -DAM_OUT ? 1 : smooth(1 + (e + DAM_OUT) / DAM_RAMP)) * smooth(away[k] / FADE)
        if (w > 0) raised[k] = Math.max(raised[k], H[k] + (top - H[k]) * w)
      })
    }
    for (let k = 0; k < H.length; k++) if (raised[k] > H[k]) H[k] = raised[k]
  }

  // 3. water: levels, channels, fords, ponds; then each water cell's depth below its body's level
  const level = new Float64Array(n).fill(NaN)
  const streams = new Map<string, { line: Pt[]; hw: number; levelAt(along: number): number }>()
  for (const { f, r } of order) {
    if (categoryOf(r.kind) !== 'water') continue
    const k1 = index.get(f.id)!
    const a = r.attrs
    if (f.line) {
      // the level: the lower bank (BANK_OUT beyond each edge) less the freeboard, never rising downstream (the
      // line's order is the flow); carving only lowers the ground, so the banks stay above it
      const hw = Math.max(num(a.width, WATER_WIDTH) / 2, c / 2)
      const line = f.line
      const len = lineLength(line)
      const ns = Math.floor(len / LEVEL_STEP) + 1
      const levels = new Float64Array(ns)
      for (let k = 0; k < ns; k++) {
        const [px, pz, tx, tz] = pointAt(line, Math.min(k * LEVEL_STEP, len))
        const o = hw + BANK_OUT
        const bank = Math.min(hAt(px - tz * o, pz + tx * o), hAt(px + tz * o, pz - tx * o)) - FREEBOARD
        levels[k] = k ? Math.min(levels[k - 1], bank) : bank
      }
      const levelAt = (along: number) => levels[Math.min(ns - 1, Math.round(along / LEVEL_STEP))]
      streams.set(f.id, { line, hw, levelAt })
      L.streams.push({ id: f.id, step: LEVEL_STEP, levels })
      // the channel: the depth (a ramp along the line gives pools), shallower toward the banks
      nodes(lineBox(line), hw + c, (k, x, z) => {
        const q = nearLine(line, x, z, hw)
        if (q.over > 0 || q.d > hw) return
        const t = q.d / hw
        const bed = levelAt(q.along) - ramp(a.depth, { along: q.along }, 0.8) * (1 - 0.5 * t * t)
        if (bed < H[k]) H[k] = bed
      })
      paintLine(line, lineReach(r.kind, a), L.water, k1, (cell, along) => {
        level[cell] = levelAt(along)
      }) // the cells by lineReach, as a shared edge reads them
    } else if (f.on) {
      // a ford: the bed raised to the ford's depth over its width, along the stream nearest its point
      const st = streams.get(f.on)
      if (!st) continue
      const at = nearLine(st.line, f.near![0], f.near![1]).along
      const half = num(a.width, 20) / 2
      const fd = num(a.depth, 0.5)
      const [fx, fz] = pointAt(st.line, at)
      const reach = half + st.hw + c
      nodes([fx - reach, fz - reach, fx + reach, fz + reach], 0, (k, x, z) => {
        const q = nearLine(st.line, x, z, st.hw)
        if (q.over > 0 || q.d > st.hw || Math.abs(q.along - at) > half) return
        const t = q.d / st.hw
        const bed = st.levelAt(q.along) - fd * (1 - 0.5 * t * t)
        if (bed > H[k]) H[k] = bed
      })
    } else {
      // a pond or a lake: its level, or its shore's; deepest SHORE_IN m in
      const field = areaField(f)
      if (!field) continue
      const D = num(a.depth, 1.5)
      if (typeof a.level === 'number') {
        // a level given: cut to it as given
        const lv = a.level
        nodes(field.box, 0, (k, x, z) => {
          const e = field.edge(x, z)
          if (e <= 0) return
          const bed = lv - D * smooth(e / SHORE_IN)
          if (bed < H[k]) H[k] = bed
        })
        paintArea(f, L.water, k1, cell => {
          level[cell] = lv
        })
        continue
      }
      const lv = shoreLevel(field)
      // no shore on the map (a pond too small for a cell, or off it): nothing to level it by, so no pond
      if (lv === null) continue
      const pond = pondBed(field, lv, D)
      ponds.push({ field, lv })
      paintArea(
        f,
        L.water,
        k1,
        cell => {
          level[cell] = lv
        },
        false,
        // a cell all of whose corners are dry ground up a slope is not the pond's
        (i, j) =>
          !pond.wet(j * (nx + 1) + i) &&
          !pond.wet(j * (nx + 1) + i + 1) &&
          !pond.wet((j + 1) * (nx + 1) + i) &&
          !pond.wet((j + 1) * (nx + 1) + i + 1),
      )
    }
  }
  // the dams, once every water and every cut is in place: each pond's raised where the ground past its shore is lower
  // than its level, never over or beside other water or a cut, the highest raise where two meet (any order)
  damPonds(ponds)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = j * nx + i
      if (Number.isNaN(level[cell])) continue
      const W = nx + 1
      const g = (H[j * W + i] + H[j * W + i + 1] + H[(j + 1) * W + i] + H[(j + 1) * W + i + 1]) / 4
      L.depth[cell] = Math.max(0, Math.min(65535, Math.round((level[cell] - g) * 1000)))
    }
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind)
    const k1 = index.get(f.id)!
    const a = r.attrs
    if (cat0 !== 'ground' && cat0 !== 'veg') continue
    if (a.growth === 'tree') {
      if (f.point) L.trees.push({ x: f.point[0], z: f.point[1], k: k1 })
      else if (f.line) {
        // as many trees as whole spacings fit (at least one), evenly, half a step in from each end
        const len = lineLength(f.line)
        const n = Math.max(1, Math.floor(len / num(a.spacing, 10)))
        for (let m = 0; m < n; m++) {
          const [x, z] = pointAt(f.line, ((m + 0.5) * len) / n)
          L.trees.push({ x, z, k: k1 })
        }
      }
      continue
    }
    const dens = (cell: number, input: { edge?: number; along?: number }) => {
      L.density[cell] = Math.round(255 * Math.max(0, Math.min(1, ramp(a.density, input, 0))))
    }
    if (f.line) paintLine(f.line, lineReach(r.kind, a), L.veg, k1, (cell, along) => dens(cell, { along }))
    else {
      if (cat0 === 'ground') paintArea(f, L.ground, k1)
      paintArea(f, L.veg, k1, (cell, edge) => dens(cell, { edge }), typeof a.density === 'object')
    }
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind)
    const k1 = index.get(f.id)!
    const a = r.attrs
    if (cat0 === 'way' && f.line) paintLine(f.line, lineReach(r.kind, a), L.way, k1)
    if (cat0 === 'barrier' && f.line) {
      barrierCells(
        f.line,
        num(a.thickness, 2),
        a.gaps as { every: number; width: number } | undefined,
        (i, j) => {
          if (i >= 0 && j >= 0 && i < nx && j < nz) L.barrier[j * nx + i] = k1
        },
        x0,
        z0,
      )
    }
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind)
    const k1 = index.get(f.id)!
    if (cat0 === 'built' || cat0 === 'work') {
      if (f.line) paintLine(f.line, lineReach(r.kind, r.attrs), L.built, k1)
      else if (f.area || f.circle || f.ellipse) paintArea(f, L.built, k1)
      else if (f.carries && f.crosses) {
        // the deck: the road's cells where it crosses the water, level with the higher of the road's two ends
        // (BRIDGE_REACH m past each bank), so a unit on it stands on the deck, not in the channel
        const road = byId.get(f.carries)!
        const water = byId.get(f.crosses)!
        const rw = num(L.table[index.get(road.id)! - 1].attrs.width, WAY_WIDTH) / 2
        const ww = num(L.table[index.get(water.id)! - 1].attrs.width, WATER_WIDTH) / 2
        const hit = crossing(road.line!, water.line!, f.near)
        if (hit) {
          const span = ww + BRIDGE_REACH
          const at = nearLine(road.line!, hit[0], hit[1]).along
          const [ax, az] = pointAt(road.line!, at - span)
          const [bx, bz] = pointAt(road.line!, at + span)
          const deck = Math.max(heightOf(L, ax, az), heightOf(L, bx, bz))
          const on = (x: number, z: number) =>
            nearLine(road.line!, x, z, rw + 1).d < rw + 1 &&
            Math.sqrt((x - hit[0]) * (x - hit[0]) + (z - hit[1]) * (z - hit[1])) < span
          cells([hit[0], hit[1], hit[0], hit[1]], span + rw + c, (i, j, x, z) => {
            if (on(x, z)) L.built[j * nx + i] = k1
          })
          nodes([hit[0], hit[1], hit[0], hit[1]], span + rw + c, (k, x, z) => {
            if (on(x, z)) H[k] = deck
          })
        }
      }
    }
    if (cat0 === 'zone' && !f.point && !f.line) paintArea(f, L.zone, k1)
  }
  return L
}

// the ground at a point, bilinear between the layers' nodes, clamped to the grid (of `h`: the layers' heights unless
// given another array on the same nodes)
export function heightOf(L: Layers, x: number, z: number, h: Float64Array = L.height): number {
  const u = Math.min(L.nx - 1e-9, Math.max(0, (x - L.x0) / L.cell))
  const v = Math.min(L.nz - 1e-9, Math.max(0, (z - L.z0) / L.cell))
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fu = u - i
  const fv = v - j
  const W = L.nx + 1
  return (
    (h[j * W + i] * (1 - fu) + h[j * W + i + 1] * fu) * (1 - fv) +
    (h[(j + 1) * W + i] * (1 - fu) + h[(j + 1) * W + i + 1] * fu) * fv
  )
}

// where two lines cross: the crossing nearest `near`, or the first along the first line
export function crossing(a: Pt[], b: Pt[], near?: Pt): Pt | null {
  const hits = crossings(a, b)
  if (!near || hits.length < 2) return hits[0] ?? null
  const d = (p: Pt) => (p[0] - near[0]) * (p[0] - near[0]) + (p[1] - near[1]) * (p[1] - near[1])
  return hits.reduce((best, p) => (d(p) < d(best) ? p : best))
}

// The barrier cell rule (proposal §3.6), exact in integers: a cell belongs to the barrier when its centre lies
// closer to the line than half the thickness (strictly) and its nearest point on the line is not a free end; a
// line that ends where it starts is closed and has none. Gaps open the cells whose centre projects onto steps
// [every·k, every·k + width) from the first point, k = 1, 2, … (a step is one cell, straight or diagonal). Calls
// put(i, j) for each cell, with i, j counted from the grid's corner (x0, z0) in cells of CELL m. Line points lie
// on the lattice (validated), x0 and z0 are even, so every number below is an integer.
export function barrierCells(
  line: Pt[],
  thickness: number,
  gaps: { every: number; width: number } | undefined,
  put: (i: number, j: number) => void,
  x0: number,
  z0: number,
): void {
  const c = CELL
  const half = (thickness * c) / 2
  const closed = isClosedLine(line)
  const segs = line.length - 1
  const xs = line.map(p => p[0])
  const zs = line.map(p => p[1])
  // steps before each segment
  const before: number[] = [0]
  for (let k = 0; k < segs; k++) {
    before.push(before[k] + Math.max(Math.abs(line[k + 1][0] - line[k][0]), Math.abs(line[k + 1][1] - line[k][1])) / c)
  }
  const i0 = Math.floor((Math.min(...xs) - half - x0) / c) - 1
  const i1 = Math.floor((Math.max(...xs) + half - x0) / c) + 1
  const j0 = Math.floor((Math.min(...zs) - half - z0) / c) - 1
  const j1 = Math.floor((Math.max(...zs) + half - z0) / c) + 1
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const px = x0 + i * c + c / 2
      const pz = z0 + j * c + c / 2
      // the nearest segment, compared exactly: distance² = num / den
      let bNum = -1
      let bDen = 1
      let bEnd = false
      let bSeg = 0
      let bDot = 0
      let bL2 = 1
      for (let k = 0; k < segs; k++) {
        const [ax, az] = line[k]
        const [bx, bz] = line[k + 1]
        const dx = bx - ax
        const dz = bz - az
        const L2 = dx * dx + dz * dz
        const dot = (px - ax) * dx + (pz - az) * dz
        let dNum: number
        let dDen: number
        let end = false
        if (dot <= 0) {
          dNum = (px - ax) * (px - ax) + (pz - az) * (pz - az)
          dDen = 1
          end = !closed && k === 0
        } else if (dot >= L2) {
          dNum = (px - bx) * (px - bx) + (pz - bz) * (pz - bz)
          dDen = 1
          end = !closed && k === segs - 1
        } else {
          const cr = (px - ax) * dz - (pz - az) * dx
          dNum = cr * cr
          dDen = L2
        }
        if (bNum < 0 || dNum * bDen < bNum * dDen) {
          bNum = dNum
          bDen = dDen
          bEnd = end
          bSeg = k
          bDot = dot < 0 ? 0 : dot > L2 ? L2 : dot
          bL2 = L2
        }
      }
      if (!(bNum < half * half * bDen) || bEnd) continue
      if (gaps) {
        // the projection in steps, times L2: before·L2 + dot·steps
        const steps = before[bSeg + 1] - before[bSeg]
        const pos = before[bSeg] * bL2 + bDot * steps
        let open = false
        for (let k = 1; gaps.every * k * bL2 <= pos; k++) {
          if (pos < (gaps.every * k + gaps.width) * bL2) {
            open = true
            break
          }
        }
        if (open) continue
      }
      put(i, j)
    }
  }
}
