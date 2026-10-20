// The look world's cover (docs/plans/active/l5-macro.md, L5a): what grows or lies on the ground, by class, authored
// here until the map format's world compiler writes the same grid (docs/proposals/map-format.md §4, its `cover` and
// `lines` collections). It runs in Node (tools/build-look-data.ts) and ships as a grid in the look data; the page
// reads it for the macro colour (src/look/shaders/macro.glsl) and the scatter (src/look/nature.ts).
//
// The grid: cells of SPEC.macro.cover m (2) over the far ring, 4 bytes a cell:
//   R the class (COVER below);
//   G the field's id, a byte hashed from the field (0 off fields): its stripes' phase and its colour's variation;
//   B the furrow direction, 0..255 for 0..π (the angle from +x toward +z), on fields;
//   A the distance to the nearest road, track or village ground, in WEAR_STEP m (0 on them, 255 at or past the reach).
import { hash, sstep, vn } from '../noise.ts'
import { axisX } from './author.ts'
import { RIVER } from '../river.ts'
import { BUILDINGS, PAVE_GAP, PAVE_WOBBLE, onPaving, paveDist, pavePoly, polyGap, polyLineGap } from './buildings.ts'

export const COVER = { meadow: 0, pasture: 1, wood: 2, road: 3, track: 4, village: 5, wheat: 6, green: 7, stubble: 8, ploughed: 9, bare: 10 } as const
export type CoverClass = typeof COVER[keyof typeof COVER]
export const WEAR_STEP = 0.1
// bare earth (docs/plans/done/ground-surface.md) is not a field: no id, no stripes, no crops
export const isField = (c: number): boolean => c >= COVER.wheat && c <= COVER.ploughed

export interface CoverGrid { n: number; cell: number; x0: number; z0: number; tex: Uint8Array }   // tex: n² cells × 4 bytes, row j at z0 + (j + ½)·cell


// the formation zones (the scatter's KEEP_CLEAR, src/look/nature.ts, reads this one): no field or village there
export const inFormationZone = (x: number, z: number): boolean => (Math.abs(x + 5) < 20 && z > -44 && z < -2) || (z > 7 && z < 19 && x > -14 && x < 26) || ((x - 34) ** 2 + (z + 24) ** 2 < 160)
// the floodplain (art bible §6c: fields and villages sit on the valley sides, above it): the valley axis ± half the
// river's floodplain width (generateRiver in src/look/world/author.ts; the river must be set)
export const onFloodplain = (x: number, z: number): boolean => Math.abs(x - axisX(z)) < RIVER.P.floodplainW / 2

type Pt = readonly [number, number]
// the authored fields near the play area: a polygon, the class, the furrow direction (rad from +x toward +z)
const FIELDS: { poly: Pt[]; cls: CoverClass; dir: number }[] = [
  // under the scatter's wheat patch (u along (0.95, −0.12), v along (0.25, 1)), 1.5 m wider all round
  { poly: [[-61.8, -35.6], [-29.9, -39.6], [-24.2, -14.2], [-56.0, -10.4]], cls: COVER.wheat, dir: Math.atan2(-0.12, 0.95) },
  // a ploughed field east of the hill, between the copses
  { poly: rect(78, -38, 30, 9, 0.18), cls: COVER.ploughed, dir: 0.18 },
  // stubble north-east, past the copse at (62, 112)
  { poly: rect(118, 132, 26, 22, -0.3), cls: COVER.stubble, dir: -0.3 },
  // a green crop on the west valley side
  { poly: rect(-222, 30, 24, 46, 1.45), cls: COVER.green, dir: 1.45 },
  // bare earth: a trampled gateway where the track meets the fields (docs/plans/done/ground-surface.md)
  { poly: rect(44, -52, 9, 6, 0.2), cls: COVER.bare, dir: 0 },
  // the default map's fields (docs/plans/done/default-map.md): a large wheat field in the start view (over the
  // copses at (42, 56) and (82, 32), whose trees it hides), and a bare drove between it and the ploughed field
  { poly: rect(50, 48, 45, 28, 0.1), cls: COVER.wheat, dir: 0.1 },
  { poly: rect(86, -18, 38, 4, 0.15), cls: COVER.bare, dir: 0 },   // meadow on both sides, clear of the zone at (34, -24)
]
// a rectangle: centre, half sizes along and across its direction, the direction
function rect(cx: number, cz: number, ha: number, hc: number, a: number): Pt[] {
  const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [cx + s * ha * ux + t * hc * vx, cz + s * ha * uz + t * hc * vz] as Pt)
}
// the road (8 m) along the east of the valley, the track (3 m) from it toward the hill, the village ground beside the road;
// and (docs/plans/done/roads.md) a road across the valley south of the formation zones, fording the river, to the
// village, a lane north from it past the large wheat field, and the village's trampled square where they meet
const ROAD: Pt[] = [[198, -1300], [190, -600], [178, -260], [184, -60], [186, 60], [176, 260], [188, 600], [200, 1300]]
const TRACK: Pt[] = [[184, -60], [150, -58], [118, -46], [70, -54], [44, -40]]
// (it fords the river at a riffle where the river runs north–south, square across it, art bible §6c: FORD, a join so
// the meander leaves it there)
const FORD: Pt = [-83.4, -42.4]
const CROSS: Pt[] = [[-1300, -96], [-600, -88], [-300, -76], [-180, -58], [-118, -43], FORD, [-52, -45], [-30, -56], [40, -66], [110, -72], [184, -62]]
const LANE: Pt[] = [[108, -71], [112, -20], [114, 30], [110, 90], [84, 150], [70, 260], [60, 600], [40, 1300]]
const VILLAGE: Pt[] = [[196, -40], [244, -46], [256, 8], [238, 34], [198, 26]]
const SQUARE: Pt[] = [[168, -82], [204, -84], [206, -46], [170, -44]]   // the trampled square where the roads meet the village
// the roads and tracks (a line, its width, its class): also the roads' segments (tools/build-look-data.ts, roadGrid)
// a line made a country road's: its corners rounded (Chaikin's corner cutting, four times) and a meander laid across it,
// a slow wave a few metres either side (k: its seed), fading to nothing within FADE_M of its ends and of the joins
// (JOINS: where a line meets another, which must stay put)
const JOINS: Pt[] = [[184, -60], [184, -62], [108, -71], FORD], FADE_M = 45
function curvy(p: readonly Pt[], amp: number, k: number): Pt[] {
  let q: Pt[] = [...p]
  for (let it = 0; it < 4; it++) { const r: Pt[] = [q[0]]; for (let i = 0; i < q.length - 1; i++) { const [a, b] = [q[i], q[i + 1]]; r.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]) } r.push(q[q.length - 1]); q = r }
  const len: number[] = [0]; for (let i = 1; i < q.length; i++) len.push(len[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]))
  const total = len[len.length - 1], fade = (d: number) => sstep(0, FADE_M, d)
  return q.map((pt, i) => {
    const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, s = len[i]
    const f = fade(Math.min(s, total - s, ...JOINS.map(j => Math.hypot(pt[0] - j[0], pt[1] - j[1]))))
    const m = amp * f * (Math.sin(s / 97 + k) * 0.6 + Math.sin(s / 41 + k * 2.3) * 0.4)
    return [pt[0] - dz / l * m, pt[1] + dx / l * m] as Pt
  })
}
// a line resampled every `step` m along it (its ends kept): the roads' segments, few enough a cell (src/look/world/data.ts)
function resample(p: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [p[0]]; let carry = 0
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b] = [p[i], p[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1])
    let t = step - carry
    while (t < len) { out.push([a[0] + (b[0] - a[0]) * t / len, a[1] + (b[1] - a[1]) * t / len]); t += step }
    carry = len - (t - step)
  }
  if (out.length > 1 && Math.hypot(...[0, 1].map(k => p[p.length - 1][k] - out[out.length - 1][k]) as [number, number]) < step / 2) out.pop()   // (no end segment under half a step)
  out.push(p[p.length - 1]); return out
}
// (a line's class picks its earth and wheel tracks in shore.glsl, roadPaint: a flag in its segments, roadGrid)
export const LINES: { pts: readonly Pt[]; w: number; cls: CoverClass }[] = [{ pts: resample(curvy(ROAD, 9, 1), 8), w: 8, cls: COVER.road }, { pts: resample(curvy(CROSS, 15, 2), 8), w: 8, cls: COVER.road }, { pts: resample(curvy(LANE, 10, 3), 8), w: 5, cls: COVER.track }, { pts: resample(curvy(TRACK, 5, 4), 8), w: 3, cls: COVER.track }]
const WEAR_REACH = 25.5   // the distance channel's reach, m (255 · WEAR_STEP)

// the far strip fields: in a frame turned 0.6435 rad (the far hedgerows' frame, src/look/nature.ts), bands 70 m wide
// across f.x (the hedgerows lie on their edges), split along f.y into strips 18–45 m wide (a fifth of them grass: pasture or fallow meadow), ploughed along f.x
const FAR_DIR = Math.atan2(0.6, 0.8), BAND_W = 70
const farClass = (k: number, s: number): CoverClass => { const h = hash(k * 3.1 + 0.7, s * 1.7 - 2.3); return h < 0.22 ? COVER.wheat : h < 0.42 ? COVER.green : h < 0.6 ? COVER.ploughed : h < 0.7 ? COVER.stubble : h < 0.85 ? COVER.pasture : COVER.meadow }
const stripCache = new Map<number, number[]>()
function strips(k: number): number[] {   // a band's strip edges along f.y, from −1900 m on
  let e = stripCache.get(k)
  if (!e) { e = [-1900]; for (let s = 0; e[e.length - 1] < 1900; s++) e.push(e[e.length - 1] + 18 + 27 * hash(k * 7.7 + 1.3, s * 0.37 + 5.1)); stripCache.set(k, e) }
  return e
}
// the strip at a point: [class, id], or null where there are none (the near field and the floodplain)
function farStrip(x: number, z: number): [CoverClass, number] | null {
  const r = Math.hypot(x, z)
  if (r < 190 + 60 * vn(x / 70 + 3.3, z / 70 - 1.7) || onFloodplain(x, z)) return null
  const fx = 0.8 * x + 0.6 * z, fy = -0.6 * x + 0.8 * z, k = Math.floor(fx / BAND_W), e = strips(k)
  let lo = 0, hi = e.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (e[m] <= fy) lo = m; else hi = m }
  return [farClass(k, lo), k * 131 + lo]
}

const inPoly = (p: readonly Pt[], x: number, z: number): boolean => {
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside
  return inside
}
export const segD = (x: number, z: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)
}
const lineD = (p: readonly Pt[], x: number, z: number): number => { let d = Infinity; for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segD(x, z, p[i], p[i + 1])); return d }
// a line's bounding box: a point farther from it than `reach` is farther from the line (a quick skip)
const boxOf = (p: readonly Pt[]) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return { x0, x1, z0, z1 } }
const boxD = (b: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1))
const ringD = (p: readonly Pt[], x: number, z: number): number => Math.min(lineD(p, x, z), segD(x, z, p[p.length - 1], p[0]))

// a field id's byte: never 0 (0 is off fields)
const idByte = (id: number): number => 1 + Math.floor(hash(id * 0.731 + 0.19, id * 0.113 - 4.7) * 254.999)

// The class at a cell's centre, before the lines' wear: what the map format's priority order would give (village
// over road over track over field over meadow). No `wood` yet: the look world's copses are a few trees each, and the
// light map's occlusion already darkens the ground under each crown (src/look/bakes.ts); a floor over a cluster's
// whole spread darkened open ground between its trees (the readability guard's blocks there stopped reading).
export function authorCover(far: number, cell: number): CoverGrid {
  const lineBoxes = LINES.map(l => boxOf(l.pts))
  const n = Math.round(far / cell), x0 = -far / 2, z0 = -far / 2, tex = new Uint8Array(n * n * 4)
  for (const f of FIELDS) for (const [x, z] of f.poly) if (onFloodplain(x, z)) throw new Error(`cover: field corner ${x.toFixed(0)},${z.toFixed(0)} on the floodplain`)
  for (const [x, z] of VILLAGE) if (inFormationZone(x, z) || onFloodplain(x, z)) throw new Error('cover: the village is in a formation zone or on the floodplain')
  // the buildings (world/buildings.ts): their paved yards at least PAVE_GAP apart; none in a formation zone, on the
  // floodplain, or on a road or a track
  const yards = BUILDINGS.map(pavePoly)
  for (let i = 0; i < yards.length; i++) for (let j = i + 1; j < yards.length; j++) {
    const g = polyGap(yards[i], yards[j])
    if (g < PAVE_GAP) throw new Error(`cover: the yards of the buildings at ${BUILDINGS[i].x}, ${BUILDINGS[i].z} and ${BUILDINGS[j].x}, ${BUILDINGS[j].z} are ${g.toFixed(1)} m apart (at least ${PAVE_GAP})`)
  }
  // (the yard's ground in the cover reaches YARD_PAD past its paving, below: the road's edge kept clear of that; the whole
  // yard, by a point every metre over it, out of the zones and off the floodplain)
  const YARD_PAD = PAVE_WOBBLE + cell * 0.71 + 0.3
  BUILDINGS.forEach((b, k) => {
    const road = LINES.find(l => polyLineGap(yards[k], l.pts) < l.w / 2 + YARD_PAD)
    if (road) throw new Error(`cover: the ${b.model}'s yard at ${b.x}, ${b.z} reaches a ${road.cls === COVER.road ? 'road' : 'track'}`)
    const xs = yards[k].map(p => p[0]), zs = yards[k].map(p => p[1])
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 1)
      if (onPaving(x, z) && (inFormationZone(x, z) || onFloodplain(x, z))) throw new Error(`cover: the ${b.model}'s yard at ${b.x}, ${b.z} reaches a formation zone or the floodplain (at ${x.toFixed(0)}, ${z.toFixed(0)})`)
  })
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, o = (j * n + i) * 4
    let cls: number = COVER.meadow, id = 0, dir = 0
    const fs = farStrip(x, z)
    if (fs) { cls = fs[0]; if (isField(cls)) { id = idByte(fs[1]); dir = FAR_DIR } }
    FIELDS.forEach((f, k) => { if (inPoly(f.poly, x, z)) { cls = f.cls; id = isField(f.cls) ? idByte(1000 + k) : 0; dir = f.dir } })   // bare earth: no id
    let wear = Infinity
    LINES.forEach((l, li) => { if (boxD(lineBoxes[li], x, z) > WEAR_REACH + l.w) return; const d = lineD(l.pts, x, z) - l.w / 2; if (d < 0) { cls = l.cls; id = 0 } wear = Math.min(wear, Math.max(0, d)) })
    if (inPoly(VILLAGE, x, z) || inPoly(SQUARE, x, z)) { cls = COVER.village; id = 0; wear = 0 } else wear = Math.min(wear, ringD(VILLAGE, x, z), ringD(SQUARE, x, z))
    // under a building, its paved yard and a margin round it (the paving's ragged edge, a cover texel's half diagonal,
    // slack) the village's trodden ground, whatever the class (nothing grows through a floor or the paving: the scatter,
    // the meadow and the crops keep off the village), worn as the village is (the road split's live ground: pavePaint)
    // (a road or a track keeps its class: the check above keeps them clear; and past it the yard's ground fades worn as
    // the village's does, by its distance: YARD_PAD in, the ring's, so its edge does not step on the grid)
    const yd = paveDist(x, z, WEAR_REACH + YARD_PAD)
    if (yd <= YARD_PAD && cls !== COVER.road && cls !== COVER.track) { cls = COVER.village; id = 0; wear = 0 }
    else wear = Math.min(wear, Math.max(0, yd - YARD_PAD))
    // the floodplain and the formation zones keep their meadow (the zones clip the fields that touch them)
    if ((onFloodplain(x, z) || inFormationZone(x, z)) && (isField(cls) || cls === COVER.village || cls === COVER.bare)) { cls = COVER.meadow; id = 0 }
    tex[o] = cls; tex[o + 1] = id; tex[o + 2] = id ? Math.round(((dir % Math.PI + Math.PI) % Math.PI) / Math.PI * 255) % 256 : 0
    tex[o + 3] = Math.min(255, Math.round(Math.min(wear, WEAR_REACH) / WEAR_STEP))
  }
  return { n, cell, x0, z0, tex }
}

// the class at a world point (nearest cell; meadow off the grid): the scatter's rule
export function coverAt(g: CoverGrid, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell)
  return i < 0 || j < 0 || i >= g.n || j >= g.n ? COVER.meadow : g.tex[(j * g.n + i) * 4]
}

// the field id at a world point (nearest cell; 0 off fields and off the grid): one field from the next
export function fieldAt(g: CoverGrid, x: number, z: number): number {
  const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell)
  return i < 0 || j < 0 || i >= g.n || j >= g.n ? 0 : g.tex[(j * g.n + i) * 4 + 1]
}

// Run-length coding by rows (classes lie in long runs): per run, the length (u16, little-endian) and the 4 bytes
export function packCover(g: CoverGrid): Uint8Array {
  const out: number[] = [], t = g.tex
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n;) {
    const o = (j * g.n + i) * 4; let len = 1
    while (i + len < g.n && t[o + len * 4] === t[o] && t[o + len * 4 + 1] === t[o + 1] && t[o + len * 4 + 2] === t[o + 2] && t[o + len * 4 + 3] === t[o + 3]) len++
    out.push(len & 255, len >> 8, t[o], t[o + 1], t[o + 2], t[o + 3]); i += len
  }
  return Uint8Array.from(out)
}
export function unpackCover(n: number, runs: Uint8Array): Uint8Array {
  const tex = new Uint8Array(n * n * 4); let c = 0
  for (let r = 0; r < runs.length; r += 6) {
    const len = runs[r] | runs[r + 1] << 8
    if (len < 1 || c + len > n * n || Math.floor(c / n) !== Math.floor((c + len - 1) / n)) throw new Error(`look data: cover run ${r / 6} (${len} cells at cell ${c}) leaves its row or the grid`)
    for (let k = 0; k < len; k++, c++) tex.set(runs.subarray(r + 2, r + 6), c * 4)
  }
  if (c !== n * n) throw new Error(`look data: the cover's runs cover ${c} cells, not ${n * n}`)
  return tex
}
