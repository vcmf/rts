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
import { hash, vn } from '../noise.ts'
import { axisX } from './author.ts'
import { RIVER } from '../river.ts'

export const COVER = { meadow: 0, pasture: 1, wood: 2, road: 3, track: 4, village: 5, wheat: 6, green: 7, stubble: 8, ploughed: 9, bare: 10 } as const
export type CoverClass = typeof COVER[keyof typeof COVER]
export const WEAR_STEP = 0.1
// bare earth (docs/plans/active/ground-surface.md) is not a field: no id, no stripes, no crops
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
  // bare earth: a trampled gateway where the track meets the fields (docs/plans/done/ground-surface.md; the map's
  // larger bare ground comes with the default map's PR)
  { poly: rect(44, -52, 9, 6, 0.2), cls: COVER.bare, dir: 0 },
  // stubble north-east, past the copse at (62, 112)
  { poly: rect(118, 132, 26, 22, -0.3), cls: COVER.stubble, dir: -0.3 },
  // a green crop on the west valley side
  { poly: rect(-222, 30, 24, 46, 1.45), cls: COVER.green, dir: 1.45 },
]
// a rectangle: centre, half sizes along and across its direction, the direction
function rect(cx: number, cz: number, ha: number, hc: number, a: number): Pt[] {
  const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [cx + s * ha * ux + t * hc * vx, cz + s * ha * uz + t * hc * vz] as Pt)
}
// the road (6 m) along the east of the valley, the track (3 m) from it toward the hill, the village ground beside the road
const ROAD: Pt[] = [[198, -1300], [190, -600], [178, -260], [184, -60], [186, 60], [176, 260], [188, 600], [200, 1300]]
const TRACK: Pt[] = [[184, -60], [150, -58], [118, -46], [70, -54], [44, -40]]
const VILLAGE: Pt[] = [[196, -40], [244, -46], [256, 8], [238, 34], [198, 26]]
const LINES: { pts: Pt[]; w: number; cls: CoverClass }[] = [{ pts: ROAD, w: 6, cls: COVER.road }, { pts: TRACK, w: 3, cls: COVER.track }]
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
const segD = (x: number, z: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)
}
const lineD = (p: readonly Pt[], x: number, z: number): number => { let d = Infinity; for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segD(x, z, p[i], p[i + 1])); return d }
const ringD = (p: readonly Pt[], x: number, z: number): number => Math.min(lineD(p, x, z), segD(x, z, p[p.length - 1], p[0]))

// a field id's byte: never 0 (0 is off fields)
const idByte = (id: number): number => 1 + Math.floor(hash(id * 0.731 + 0.19, id * 0.113 - 4.7) * 254.999)

// The class at a cell's centre, before the lines' wear: what the map format's priority order would give (village
// over road over track over field over meadow). No `wood` yet: the look world's copses are a few trees each, and the
// light map's occlusion already darkens the ground under each crown (src/look/bakes.ts); a floor over a cluster's
// whole spread darkened open ground between its trees (the readability guard's blocks there stopped reading).
export function authorCover(far: number, cell: number): CoverGrid {
  const n = Math.round(far / cell), x0 = -far / 2, z0 = -far / 2, tex = new Uint8Array(n * n * 4)
  for (const f of FIELDS) for (const [x, z] of f.poly) if (onFloodplain(x, z)) throw new Error(`cover: field corner ${x.toFixed(0)},${z.toFixed(0)} on the floodplain`)
  for (const [x, z] of VILLAGE) if (inFormationZone(x, z) || onFloodplain(x, z)) throw new Error('cover: the village is in a formation zone or on the floodplain')
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, o = (j * n + i) * 4
    let cls: number = COVER.meadow, id = 0, dir = 0
    const fs = farStrip(x, z)
    if (fs) { cls = fs[0]; if (isField(cls)) { id = idByte(fs[1]); dir = FAR_DIR } }
    FIELDS.forEach((f, k) => { if (inPoly(f.poly, x, z)) { cls = f.cls; id = isField(f.cls) ? idByte(1000 + k) : 0; dir = f.dir } })   // bare earth: no id
    let wear = Infinity
    for (const l of LINES) { const d = lineD(l.pts, x, z) - l.w / 2; if (d < 0) { cls = l.cls; id = 0 } wear = Math.min(wear, Math.max(0, d)) }
    if (inPoly(VILLAGE, x, z)) { cls = COVER.village; id = 0; wear = 0 } else wear = Math.min(wear, ringD(VILLAGE, x, z))
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
