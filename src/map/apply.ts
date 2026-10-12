// Apply (docs/proposals/map-engine.md §4, docs/plans/active/m1-language.md M1b): the expanded map's features
// laid into the five layers on the 2 m grid over the map's extent, in the engine's fixed order:
//   1. relief: the landforms (hill, ridge, valley, plateau, scarp), summed (the base is flat until `noise`, M3);
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
import { inRing, lineLength } from './geometry.ts'
import { cos, sin } from '../sim/num.ts'

export const CELL = 2   // m (decision 0021)
// widths where the catalogue gives none: a way's (every way kind sets one), and the bands of the line-shaped kinds
// that take no width attribute (reeds along a bank, a flèche's earthwork), m
const WAY_WIDTH = 5, WATER_WIDTH = 6, EDIT_WIDTH = 4, LANDFORM_WIDTH = 100, VEG_LINE = 4, WORK_LINE = 6

export interface Layers {
  cell: number; nx: number; nz: number; x0: number; z0: number   // cells; cell (i, j) spans x0 + i·cell … + cell
  height: Float64Array      // (nx + 1) × (nz + 1) nodes, node (i, j) at (x0 + i·cell, z0 + j·cell), m above the datum
  table: Resolved[]         // the features, resolved for the map's season; a layer's value k ≥ 1 is table[k − 1]
  ground: Uint16Array; veg: Uint16Array; water: Uint16Array; way: Uint16Array
  barrier: Uint16Array; built: Uint16Array; zone: Uint16Array
  edit: Uint16Array         // the last cut or ditch (a relief cut, a ditch, a sunken way) that covers the cell: the draft
                            // draws it, and it marks the cell for the ruleset's crossing rule; other edits leave no mark
  density: Uint8Array       // the vegetation's density × 255 (ramps evaluated per cell)
}
export const LAYER_NAMES = ['ground', 'veg', 'water', 'way', 'barrier', 'built', 'zone', 'edit'] as const

const smooth = (s: number): number => { const t = s < 0 ? 0 : s > 1 ? 1 : s; return t * t * (3 - 2 * t) }
// a landform's profile over t = distance / half-width (1 at the centre, 0 from t = 1 on)
function profile(kind: AttrValue | undefined, t: number): number {
  if (t >= 1) return 0
  if (kind === 'flat') { if (t < 0.4) return 1; const s = (t - 0.4) / 0.6, q = 1 - s * s; return q * q }
  if (kind === 'sharp') return (1 - t) * (1 - t)
  const q = 1 - t * t; return q * q
}

// the nearest point of a polyline: distance, which side (left of the direction of travel: +1), how far past a
// free end along its tangent (0 inside), and the distance along the line to the nearest point
interface Near { d: number; side: number; over: number; along: number }
function nearLine(line: Pt[], px: number, pz: number): Near {
  let best: Near = { d: Infinity, side: 1, over: 0, along: 0 }, acc = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2)
    const t = ((px - ax) * dx + (pz - az) * dz) / L2, tc = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = ax + tc * dx, qz = az + tc * dz, d = Math.sqrt((px - qx) * (px - qx) + (pz - qz) * (pz - qz))
    if (d < best.d) {
      const over = k === 0 && t < 0 ? -t * L : k === line.length - 2 && t > 1 ? (t - 1) * L : 0
      const cross = dx * (pz - az) - dz * (px - ax)
      best = { d, side: cross >= 0 ? 1 : -1, over, along: acc + tc * L }
    }
    acc += L
  }
  return best
}

// a feature's shape as a field: whether a point is inside (even-odd over all rings), and its distance in from
// (positive) or out from (negative) the edge. The edge costs more, so callers ask for it only where it is used.
interface Field { box: [number, number, number, number]; inside(px: number, pz: number): boolean; edge(px: number, pz: number): number }
function areaField(f: Feature): Field | null {
  if (f.area) {
    const rings = f.area, closed = rings.map(r => [...r, r[0]]), xs = rings[0].map(p => p[0]), zs = rings[0].map(p => p[1])
    const inside = (x: number, z: number) => { let k = false; for (const r of rings) if (inRing(r, [x, z])) k = !k; return k }
    return {
      box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], inside,
      edge: (x, z) => { let d = Infinity; for (const r of closed) d = Math.min(d, nearLine(r, x, z).d); return inside(x, z) ? d : -d },
    }
  }
  if (f.circle) {
    const [[cx, cz], r] = f.circle, d = (x: number, z: number) => Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz))
    return { box: [cx - r, cz - r, cx + r, cz + r], inside: (x, z) => d(x, z) < r, edge: (x, z) => r - d(x, z) }
  }
  if (f.ellipse) {
    const [[cx, cz], ra, rb, ang] = f.ellipse, c = cos(ang), s = sin(ang), m = Math.max(ra, rb)
    const q = (x: number, z: number) => { const u = ((x - cx) * c + (z - cz) * s) / ra, v = (-(x - cx) * s + (z - cz) * c) / rb; return Math.sqrt(u * u + v * v) }
    // the edge distance is approximate off the axes: enough for ramps and blends
    return { box: [cx - m, cz - m, cx + m, cz + m], inside: (x, z) => q(x, z) < 1, edge: (x, z) => (1 - q(x, z)) * Math.min(ra, rb) }
  }
  return null
}

const num = (v: AttrValue | undefined, dflt = 0): number => (typeof v === 'number' ? v : dflt)
// a ramp's value at an input (edge distance or along-line distance), clamped to its first and last stops
function ramp(v: AttrValue | undefined, input: { edge?: number; along?: number }, dflt: number): number {
  if (typeof v === 'number') return v
  if (!v || typeof v !== 'object') return dflt
  const [key, stops] = Object.entries(v as Ramp)[0] as ['edge' | 'along', [number, number][]]
  const x = input[key] ?? 0
  if (x <= stops[0][0]) return stops[0][1]
  for (let k = 1; k < stops.length; k++) if (x <= stops[k][0]) { const [x0, y0] = stops[k - 1], [x1, y1] = stops[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0) }
  return stops[stops.length - 1][1]
}

export function apply(map: MapFile, cat: Catalogue): Layers {
  const c = CELL, nx = map.extent.w / c, nz = map.extent.h / c, x0 = -map.extent.w / 2, z0 = -map.extent.h / 2
  const n = nx * nz, U = () => new Uint16Array(n)
  const L: Layers = { cell: c, nx, nz, x0, z0, height: new Float64Array((nx + 1) * (nz + 1)), table: [], ground: U(), veg: U(), water: U(), way: U(), barrier: U(), built: U(), zone: U(), edit: U(), density: new Uint8Array(n) }
  // features in painting order: priority, then id
  const order = map.features.map(f => ({ f, r: resolve(f, map, cat) })).sort((a, b) => a.r.priority - b.r.priority || (a.f.id < b.f.id ? -1 : a.f.id > b.f.id ? 1 : 0))
  order.forEach(({ r }) => L.table.push(r))
  const index = new Map(order.map(({ f }, k) => [f.id, k + 1]))
  const byId = new Map(map.features.map(f => [f.id, f]))
  const isEdit = (r: Resolved) => kindMeta(cat, kindChain(cat, r.kind)!).edit || (categoryOf(r.kind) === 'way' && (num(r.attrs.cut) > 0 || num(r.attrs.raise) > 0))

  // the cells (i, j ranges) a box covers, clamped to the grid
  const cells = (box: [number, number, number, number], pad: number, fn: (i: number, j: number, x: number, z: number) => void) => {
    const i0 = Math.max(0, Math.floor((box[0] - pad - x0) / c)), i1 = Math.min(nx - 1, Math.floor((box[2] + pad - x0) / c))
    const j0 = Math.max(0, Math.floor((box[1] - pad - z0) / c)), j1 = Math.min(nz - 1, Math.floor((box[3] + pad - z0) / c))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i, j, x0 + (i + 0.5) * c, z0 + (j + 0.5) * c)
  }
  const nodes = (box: [number, number, number, number], pad: number, fn: (k: number, x: number, z: number) => void) => {
    const i0 = Math.max(0, Math.floor((box[0] - pad - x0) / c)), i1 = Math.min(nx, Math.ceil((box[2] + pad - x0) / c))
    const j0 = Math.max(0, Math.floor((box[1] - pad - z0) / c)), j1 = Math.min(nz, Math.ceil((box[3] + pad - z0) / c))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * (nx + 1) + i, x0 + i * c, z0 + j * c)
  }
  const lineBox = (line: Pt[]): [number, number, number, number] => [Math.min(...line.map(p => p[0])), Math.min(...line.map(p => p[1])), Math.max(...line.map(p => p[0])), Math.max(...line.map(p => p[1]))]
  const H = L.height

  // 1. landforms, summed
  for (const { f, r } of order) {
    if (categoryOf(r.kind) !== 'relief' || isEdit(r)) continue
    const a = r.attrs, h = num(a.height), w2 = num(a.width, LANDFORM_WIDTH) / 2, kind = r.kind.split('.')[1]
    if (kind === 'hill') {
      const field = f.point ? areaField({ id: f.id, circle: [f.point, w2] })! : areaField(f)!
      const rad = f.point ? w2 : f.circle ? f.circle[1] : Math.min(f.ellipse![1], f.ellipse![2])
      nodes(field.box, 0, (k, x, z) => { H[k] += h * profile(a.profile, 1 - field.edge(x, z) / rad) })
    } else if (kind === 'ridge' || kind === 'valley') {
      // the crest tapers to nothing over the last half-width at each end, so a ridge ends as a spur, not a wall
      const steep = a.steep, len = lineLength(f.line!)
      nodes(lineBox(f.line!), w2 * 1.4, (k, x, z) => {
        const q = nearLine(f.line!, x, z), sideHalf = w2 * (steep === 'left' ? (q.side > 0 ? 0.6 : 1.4) : steep === 'right' ? (q.side < 0 ? 0.6 : 1.4) : 1)
        const taper = q.over > 0 ? 0 : smooth(Math.min(q.along, len - q.along) / w2)
        H[k] += h * taper * profile(a.profile, q.d / sideHalf)
      })
    } else if (kind === 'scarp') {
      // a step in the land: the face rises over its width, centred on the line; the high side then stays up and
      // returns to the ground around it over `edge` m (the back slope); past the line's ends it fades over a width
      const high = a.steep === 'right' ? -1 : 1, back = Math.max(num(a.edge, 150), 2 * w2)   // a back slope never steeper than the face
      nodes(lineBox(f.line!), w2 + back, (k, x, z) => {
        const q = nearLine(f.line!, x, z), s = q.side * high * q.d
        const rise = s <= w2 ? smooth((s + w2) / (2 * w2)) : smooth(1 - (s - w2) / back)
        H[k] += h * rise * smooth(1 - q.over / back)   // past the ends the step fades over the back slope's length, not as a wall
      })
    } else if (kind === 'plateau') {
      const field = areaField(f)!, edge = num(a.edge, 60)
      nodes(field.box, edge, (k, x, z) => { const e = field.edge(x, z); H[k] += h * (e >= 0 ? 1 : smooth(1 + e / edge)) })
    }
  }

  // 2. relief edits, in painting order
  for (const { f, r } of order) {
    if (!isEdit(r)) continue
    const a = r.attrs, k1 = index.get(f.id)!, kind = r.kind
    const edge = categoryOf(kind) === 'way' ? 1 : num(a.edge, 5)
    const field = f.line ? null : areaField(f)
    const weight = (x: number, z: number): number => {
      if (f.line) { const q = nearLine(f.line, x, z), w2 = num(a.width, EDIT_WIDTH) / 2; return q.d <= w2 ? 1 : edge > 0 ? smooth(1 - (q.d - w2) / edge) : 0 }
      const e = field!.edge(x, z); return e >= 0 ? 1 : edge > 0 ? smooth(1 + e / edge) : 0
    }
    const box = f.line ? lineBox(f.line) : field!.box, pad = (f.line ? num(a.width, EDIT_WIDTH) / 2 : 0) + edge + c
    const op = categoryOf(kind) === 'way' ? (num(a.cut) > 0 ? 'cut-way' : 'raise-way') : kind.split('.')[1]
    nodes(box, pad, (k, x, z) => {
      const w = weight(x, z); if (w <= 0) return
      if (op === 'raise') H[k] += num(a.height) * w
      else if (op === 'lower') H[k] -= num(a.height) * w
      else if (op === 'level') H[k] += (num(a.to) - H[k]) * w
      else if (op === 'cut' || op === 'ditch') H[k] -= num(a.depth) * w
      else if (op === 'cut-way') H[k] -= num(a.cut) * w
      else if (op === 'raise-way') H[k] += num(a.raise) * w
    })
    if (op === 'cut' || op === 'ditch' || op === 'cut-way') cells(box, pad, (i, j, x, z) => { if (weight(x, z) >= 0.5) L.edit[j * nx + i] = k1 })
  }

  // 3–6. the cell layers, in painting order within each
  const paintArea = (f: Feature, layer: Uint16Array, k1: number, onCell?: (cell: number, edge: number) => void, needEdge = false) => {
    const field = areaField(f); if (!field) return
    cells(field.box, 0, (i, j, x, z) => { if (field.inside(x, z)) { layer[j * nx + i] = k1; onCell?.(j * nx + i, needEdge ? field.edge(x, z) : 0) } })
  }
  // a line takes the cells whose centre lies strictly within its half-width, and at least the cells beside it (a
  // 1.5 m path, a 2 m rill): widths round the same way for every line (a 6 m stream and a 5 m road on even metres
  // both take 4 m, a 10 m stream 8 m), as the barrier rule does
  const paintLine = (line: Pt[], halfWidth: number, layer: Uint16Array, k1: number, onCell?: (cell: number, along: number) => void) => {
    const half = Math.max(halfWidth, c / 2 + 0.01)
    cells(lineBox(line), half + c, (i, j, x, z) => { const q = nearLine(line, x, z); if (q.d < half && q.over === 0) { layer[j * nx + i] = k1; onCell?.(j * nx + i, q.along) } })
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind), k1 = index.get(f.id)!, a = r.attrs
    if (cat0 === 'water') {
      if (f.line) paintLine(f.line, num(a.width, WATER_WIDTH) / 2, L.water, k1)
      else paintArea(f, L.water, k1)
    }
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind), k1 = index.get(f.id)!, a = r.attrs
    if (cat0 !== 'ground' && cat0 !== 'veg') continue
    const dens = (cell: number, input: { edge?: number; along?: number }) => { L.density[cell] = Math.round(255 * Math.max(0, Math.min(1, ramp(a.density, input, 0)))) }
    if (f.line) paintLine(f.line, VEG_LINE / 2, L.veg, k1, (cell, along) => dens(cell, { along }))
    else {
      if (cat0 === 'ground') paintArea(f, L.ground, k1)
      paintArea(f, L.veg, k1, (cell, edge) => dens(cell, { edge }), typeof a.density === 'object')
    }
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind), k1 = index.get(f.id)!, a = r.attrs
    if (cat0 === 'way' && f.line) paintLine(f.line, num(a.width, WAY_WIDTH) / 2, L.way, k1)
    if (cat0 === 'barrier' && f.line) barrierCells(f.line, num(a.thickness, 2), a.gaps as { every: number; width: number } | undefined, (i, j) => { if (i >= 0 && j >= 0 && i < nx && j < nz) L.barrier[j * nx + i] = k1 }, x0, z0)
  }
  for (const { f, r } of order) {
    const cat0 = categoryOf(r.kind), k1 = index.get(f.id)!
    if (cat0 === 'built' || cat0 === 'work') {
      if (f.line) paintLine(f.line, WORK_LINE / 2, L.built, k1)
      else if (f.area || f.circle || f.ellipse) paintArea(f, L.built, k1)
      else if (f.carries && f.crosses) {
        // the bridge's deck, for the draft: the road's cells where it crosses the water (the deck itself: M2)
        const road = byId.get(f.carries)!, water = byId.get(f.crosses)!, rw = num(L.table[index.get(road.id)! - 1].attrs.width, WAY_WIDTH) / 2, ww = num(L.table[index.get(water.id)! - 1].attrs.width, WATER_WIDTH) / 2
        const hit = crossing(road.line!, water.line!, f.near)
        if (hit) cells([hit[0], hit[1], hit[0], hit[1]], ww + rw + 4, (i, j, x, z) => {
          if (nearLine(road.line!, x, z).d < rw + 1 && Math.sqrt((x - hit[0]) * (x - hit[0]) + (z - hit[1]) * (z - hit[1])) < ww + 4) L.built[j * nx + i] = k1
        })
      }
    }
    if (cat0 === 'zone' && !f.point && !f.line) paintArea(f, L.zone, k1)
  }
  return L
}

// where two lines cross: the crossing nearest `near`, or the first along the first line
export function crossing(a: Pt[], b: Pt[], near?: Pt): Pt | null {
  let best: Pt | null = null, bestD = Infinity
  for (let i = 0; i + 1 < a.length; i++) for (let j = 0; j + 1 < b.length; j++) {
    const [p, q] = [a[i], a[i + 1]], [r, s] = [b[j], b[j + 1]]
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0])
    if (d === 0) continue
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d
    if (t < 0 || t > 1 || u < 0 || u > 1) continue
    const hit: Pt = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
    if (!near) return hit
    const dd = (hit[0] - near[0]) * (hit[0] - near[0]) + (hit[1] - near[1]) * (hit[1] - near[1])
    if (dd < bestD) { bestD = dd; best = hit }
  }
  return best
}

// The barrier cell rule (proposal §3.6), exact in integers: a cell belongs to the barrier when its centre lies
// closer to the line than half the thickness (strictly) and its nearest point on the line is not a free end; a
// line that ends where it starts is closed and has none. Gaps open the cells whose centre projects onto steps
// [every·k, every·k + width) from the first point, k = 1, 2, … (a step is one cell, straight or diagonal). Calls
// put(i, j) for each cell, with i, j counted from the grid's corner (x0, z0) in cells of CELL m. Line points lie
// on the lattice (validated), x0 and z0 are even, so every number below is an integer.
export function barrierCells(line: Pt[], thickness: number, gaps: { every: number; width: number } | undefined, put: (i: number, j: number) => void, x0: number, z0: number): void {
  const c = CELL, half = thickness * c / 2, last = line[line.length - 1], closed = line.length > 3 && last[0] === line[0][0] && last[1] === line[0][1]
  const segs = line.length - 1, xs = line.map(p => p[0]), zs = line.map(p => p[1])
  // steps before each segment
  const before: number[] = [0]
  for (let k = 0; k < segs; k++) before.push(before[k] + Math.max(Math.abs(line[k + 1][0] - line[k][0]), Math.abs(line[k + 1][1] - line[k][1])) / c)
  const i0 = Math.floor((Math.min(...xs) - half - x0) / c) - 1, i1 = Math.floor((Math.max(...xs) + half - x0) / c) + 1
  const j0 = Math.floor((Math.min(...zs) - half - z0) / c) - 1, j1 = Math.floor((Math.max(...zs) + half - z0) / c) + 1
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = x0 + i * c + c / 2, pz = z0 + j * c + c / 2
    // the nearest segment, compared exactly: distance² = num / den
    let bNum = -1, bDen = 1, bEnd = false, bSeg = 0, bDot = 0, bL2 = 1
    for (let k = 0; k < segs; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
      const dot = (px - ax) * dx + (pz - az) * dz
      let dNum: number, dDen: number, end = false
      if (dot <= 0) { dNum = (px - ax) * (px - ax) + (pz - az) * (pz - az); dDen = 1; end = !closed && k === 0 }
      else if (dot >= L2) { dNum = (px - bx) * (px - bx) + (pz - bz) * (pz - bz); dDen = 1; end = !closed && k === segs - 1 }
      else { const cr = (px - ax) * dz - (pz - az) * dx; dNum = cr * cr; dDen = L2 }
      if (bNum < 0 || dNum * bDen < bNum * dDen) { bNum = dNum; bDen = dDen; bEnd = end; bSeg = k; bDot = dot < 0 ? 0 : dot > L2 ? L2 : dot; bL2 = L2 }
    }
    if (!(bNum < half * half * bDen) || bEnd) continue
    if (gaps) {
      // the projection in steps, times L2: before·L2 + dot·steps
      const steps = before[bSeg + 1] - before[bSeg], pos = before[bSeg] * bL2 + bDot * steps
      let open = false
      for (let k = 1; gaps.every * k * bL2 <= pos; k++) if (pos < (gaps.every * k + gaps.width) * bL2) { open = true; break }
      if (open) continue
    }
    put(i, j)
  }
}
