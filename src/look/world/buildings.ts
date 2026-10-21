// The demo map's buildings (docs/plans/done/buildings.md): authored, deterministic. Each a model of
// prototypes/buildings.data.js (tools/building-to-js.py: metres, its base at 0, centred on its footprint), where it
// stands (x, z), its turn (yaw, rad) and its scale. The turn is Babylon's instance yaw (Quaternion.RotationYawPitchRoll
// in Matrix.Compose, src/look/buildings.ts), which takes a local point (x, z) to (x cos + z sin, −x sin + z cos): toWorld
// and toLocal below, the one rule the footprints, the yards, the ground's samples and the shader's frame (shore.glsl,
// pavePaint) all use (test/buildings.test.ts pins it against Babylon's Matrix; measured on the page too: a house at a
// yaw of −π/2 + 0.14 has its door, local (0, −3.35), 3.32 m east of its centre). The models' fronts (the house's door)
// face −z before the turn: a yaw of 0 faces −z (south), π/2 −x (west, the road), −π/2 +x (east), π +z (north)
import { segD } from './geom.ts'
export interface Building { model: 'windmill' | 'house'; x: number; z: number; yaw: number; scale: number }
// a local offset (x, z) of a building turned by yaw, in the world (the inverse: toLocal)
export const toWorld = (yaw: number, x: number, z: number): [number, number] => { const c = Math.cos(yaw), s = Math.sin(yaw); return [x * c + z * s, -x * s + z * c] }
export const toLocal = (yaw: number, x: number, z: number): [number, number] => { const c = Math.cos(yaw), s = Math.sin(yaw); return [x * c - z * s, x * s + z * c] }
// each model's ground footprint before its scale: a circle's radius (the windmill's tower and gallery) or a box's half
// sizes along its own x and z (the house's walls, its eaves), m
export const FOOT: Record<Building['model'], { r?: number; hx?: number; hz?: number }> = { windmill: { r: 4.4 }, house: { hx: 5.6, hz: 4.4 } }
const Q = Math.PI / 2   // a quarter turn: 0 the door south (−z), Q west (to the road), −Q east, 2Q north
export const BUILDINGS: readonly Building[] = [
  // the windmill in the large wheat field's north-east part (cover.ts: rect(50, 48, 45, 28, 0.1)), its sails to the
  // south-west, toward the start view
  { model: 'windmill', x: 78, z: 66, yaw: 0.6, scale: 1 },
  // the village (cover.ts, VILLAGE): an irregular cluster east of the road, the houses turned each a quarter turn of its
  // own (two doors to the road, one gable to it, two side-on, one back to it) and a little more, their paved yards at
  // least PAVE_GAP apart (cover.ts checks it); six fit the village ground with their yards
  { model: 'house', x: 208, z: -30, yaw: Q + 0.14, scale: 1.0 },
  { model: 'house', x: 232, z: -38, yaw: -0.12, scale: 0.95 },
  { model: 'house', x: 214, z: -6, yaw: 2 * Q + 0.1, scale: 1.04 },
  { model: 'house', x: 240, z: -12, yaw: -Q - 0.18, scale: 0.92 },
  { model: 'house', x: 212, z: 20, yaw: Q - 0.2, scale: 1.0 },
  { model: 'house', x: 240, z: 18, yaw: 2 * Q + 0.16, scale: 1.06 },
]
export const PAVE_GAP = 4   // the least ground between two buildings' paved yards, m

// the paved yard round each building (the owner, 2026-10-20: docs/plans/done/buildings.md): its footprint grown by
// side m all round, the house's by front m at its door (its local −z: a yard before its door); its edge ragged into the
// ground by the shader (shore.glsl, pavePaint: up to PAVE_WOBBLE m past it)
export const PAVE: Record<Building['model'], { side: number; front: number }> = { windmill: { side: 3, front: 3 }, house: { side: 2.5, front: 6 } }
export const PAVE_WOBBLE = 1.15
// the paving's ragged edge (shore.glsl, pavePaint): a wobble of two noises of PAVE_WOB amplitudes (each noise 0..1
// about 0.5) on the distance, blended over PAVE_EDGE (a smoothstep's edges, m past the yard). Whole within PAVE_INNER
// of the yard's inside (the wobble's whole reach and the blend's start: the noises not read there), gone past
// PAVE_WOBBLE out (its reach and the blend's end); test/buildings.test.ts pins both against these
export const PAVE_WOB: readonly [number, number] = [1.1, 0.45], PAVE_EDGE: readonly [number, number] = [-0.3, 0.35]
export const PAVE_INNER = PAVE_EDGE[0] - (PAVE_WOB[0] + PAVE_WOB[1]) / 2 - 0.005
// the paving's reach past its yard: the shader paints nothing past it (pavePaint's first test), the cover marks every
// texel a pixel within it can read (YARD_BASE, cover.ts), the road split gives those the paving's material (terrain.ts)
export const PAVE_REACH = PAVE_WOBBLE + 0.05
// a yard's cover texel: its B byte (the furrows' direction, read only where a field's id is: a village texel's is 0)
// names the building whose paving its pixels can show (BUILDINGS' order, the shader's uPaveA/uPaveB: ≤ 16): YARD_BASE
// plus its index where one yard is within reach of the texel (PAVE_REACH and a texel's half diagonal: a painted pixel's
// own yard is), YARD_ALL where two are (between close yards: every shape evaluated, as before). The paving runs only
// on these (shore.glsl, roadPaint, pavePaint)
export const YARD_BASE = 240, YARD_ALL = 239
// the paving's constants as the shader's defines (the materials that paint it: terrain.ts, macro.ts)
export const paveDefines = (): string[] => [`#define PAVE_REACH ${PAVE_REACH.toFixed(3)}`, `#define YARD_BASE ${YARD_BASE.toFixed(1)}`, `#define YARD_ALL ${YARD_ALL.toFixed(1)}`,
  `#define PAVE_INNER ${PAVE_INNER.toFixed(3)}`, `#define PAVE_WOB vec2(${PAVE_WOB.map(v => v.toFixed(3)).join(',')})`, `#define PAVE_EDGE vec2(${PAVE_EDGE.map(v => v.toFixed(3)).join(',')})`]
// a building's paving as the shader takes it (≤ 16 buildings): a, its centre and its turn (x, z, cos yaw, sin yaw); b,
// a box's half width, its reach behind (+z) and in front (−z) of the centre, its corners' radius, m, or for a circle
// (−radius, 0, 0, 0)
export function paveShape(b: Building): { a: [number, number, number, number]; b: [number, number, number, number] } {
  const f = FOOT[b.model], p = PAVE[b.model], c = Math.cos(b.yaw), s = Math.sin(b.yaw)
  if (f.r !== undefined) return { a: [b.x, b.z, c, s], b: [-(f.r * b.scale + p.side), 0, 0, 0] }
  return { a: [b.x, b.z, c, s], b: [f.hx! * b.scale + p.side, f.hz! * b.scale + p.side, f.hz! * b.scale + p.front, 1.5] }
}
// the signed distance from (x, z) to a building's paving, m (negative inside): its local frame (toLocal), a rounded box
// off centre along z (its reach behind and in front differ) or a circle. The shader's pavePaint (shore.glsl) measures
// the same, line for line: change both together (test/buildings.test.ts pins this one)
export function paveSdf(b: Building, x: number, z: number): number {
  const q = paveShape(b).b, [lx, lz] = toLocal(b.yaw, x - b.x, z - b.z)
  if (q[0] < 0) return Math.hypot(lx, lz) + q[0]
  const zc = (q[1] - q[2]) / 2, ax = Math.abs(lx) - q[0] + q[3], az = Math.abs(lz - zc) - (q[1] + q[2]) / 2 + q[3]
  return Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0) - q[3]
}
// the yards once, with each one's reach from its centre (the cover's authoring asks at every texel: onPaving, paveDist)
let yards: { b: Building; reach: number }[] | null = null
const theYards = () => yards ??= BUILDINGS.map(b => { const q = paveShape(b).b; return { b, reach: q[0] < 0 ? -q[0] : Math.hypot(q[0], Math.max(q[1], q[2])) } })
// the distance from (x, z) to the nearest paving, m (0 on it); Infinity past far m of every yard's reach
export const paveDist = (x: number, z: number, far = 30): number => paveNearest(x, z, far).d
// the nearest paving to (x, z): its distance (0 on it) and its building's index (Infinity and −1 past far m of every
// yard's reach), and how many yards lie within near m of it
export function paveNearest(x: number, z: number, far = 30, near = 0): { d: number; i: number; n: number } {
  let d = Infinity, i = -1, n = 0
  theYards().forEach((y, k) => {
    if (Math.hypot(x - y.b.x, z - y.b.z) > y.reach + Math.max(far, near)) return
    const e = Math.max(0, paveSdf(y.b, x, z))
    if (e <= near) n++
    if (e < d) { d = e; i = k }
  })
  return { d, i, n }
}
// whether (x, z) lies on a building's paving grown by pad m
export const onPaving = (x: number, z: number, pad = 0): boolean => paveDist(x, z, pad) <= pad
// a building's paving as a polygon on the ground (a box's four corners, a circle's sixteen points), in its turn
export function pavePoly(b: Building): [number, number][] {
  const q = paveShape(b).b, at = (lx: number, lz: number): [number, number] => { const [wx, wz] = toWorld(b.yaw, lx, lz); return [b.x + wx, b.z + wz] }
  if (q[0] < 0) return Array.from({ length: 16 }, (_, k) => at(Math.cos(k * Math.PI / 8) * -q[0], Math.sin(k * Math.PI / 8) * -q[0]))
  return [at(-q[0], -q[2]), at(q[0], -q[2]), at(q[0], q[1]), at(-q[0], q[1])]
}
type P2 = [number, number]
type R2 = readonly [number, number]
const side = (a: R2, b: R2, c: R2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
const crosses = (a: R2, b: R2, c: R2, e: R2) => side(a, b, c) !== side(a, b, e) && side(c, e, a) !== side(c, e, b)
const inside = (pt: R2, poly: P2[]) => { const s = poly.map((v, i) => side(v, poly[(i + 1) % poly.length], pt)); return s.every(v => v >= 0) || s.every(v => v <= 0) }
// the gap between two convex polygons, m: 0 where they overlap (a point of one in the other, or edges crossing as a
// plus), else the least distance between their edges
export function polyGap(p: P2[], q: P2[]): number {
  if (p.some(v => inside(v, q)) || q.some(v => inside(v, p))) return 0
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) if (crosses(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length])) return 0
  let d = Infinity
  for (const [P, R] of [[p, q], [q, p]]) for (const v of P) for (let i = 0; i < R.length; i++) d = Math.min(d, segD(v[0], v[1], R[i], R[(i + 1) % R.length]))
  return d
}
// the distance from a convex polygon to a polyline, m (0 where the line enters it)
export function polyLineGap(poly: P2[], line: readonly R2[]): number {
  if (line.some(v => inside(v, poly))) return 0
  let d = Infinity
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k], b = line[k + 1]
    for (let i = 0; i < poly.length; i++) { const c = poly[i], e = poly[(i + 1) % poly.length]; if (crosses(a, b, c, e)) return 0; d = Math.min(d, segD(c[0], c[1], a, b), segD(a[0], a[1], c, e), segD(b[0], b[1], c, e)) }
  }
  return d
}
