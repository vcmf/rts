// The demo map's buildings (docs/plans/active/buildings.md): authored, deterministic. Each a model of
// prototypes/buildings.data.js (tools/building-to-js.py: metres, its base at 0, centred on its footprint), where it
// stands (x, z), its turn (yaw, rad, Babylon's instance yaw: a local point (x, z) goes to (x cos − z sin, x sin + z cos),
// measured on the page), its scale. The models' fronts (the house's door) face −z before the turn, so a yaw of −π/2
// faces −x (the road, west of the village)
export interface Building { model: 'windmill' | 'house'; x: number; z: number; yaw: number; scale: number }
// each model's ground footprint before its scale: a circle's radius (the windmill's tower and gallery) or a box's half
// sizes along its own x and z (the house's walls, its eaves), m: the cover's village ground under it (cover.ts), so
// nothing grows through a floor
export const FOOT: Record<Building['model'], { r?: number; hx?: number; hz?: number }> = { windmill: { r: 4.4 }, house: { hx: 5.6, hz: 4.4 } }
const Q = Math.PI / 2   // a quarter turn: 0 the door south (−z), −Q west (to the road), Q east, 2Q north
export const BUILDINGS: readonly Building[] = [
  // the windmill in the large wheat field's north-east part (cover.ts: rect(50, 48, 45, 28, 0.1)), its sails to the
  // south-west, toward the start view
  { model: 'windmill', x: 78, z: 66, yaw: 0.6, scale: 1 },
  // the village (cover.ts, VILLAGE): an irregular cluster east of the road, the houses turned each a quarter turn of its
  // own (two doors to the road, one gable to it, two side-on, one back to it) and a little more, their paved yards at
  // least PAVE_GAP apart (cover.ts checks it); six fit the village ground with their yards
  { model: 'house', x: 208, z: -30, yaw: -Q + 0.14, scale: 1.0 },
  { model: 'house', x: 232, z: -38, yaw: -0.12, scale: 0.95 },
  { model: 'house', x: 214, z: -6, yaw: 2 * Q + 0.1, scale: 1.04 },
  { model: 'house', x: 240, z: -12, yaw: Q - 0.18, scale: 0.92 },
  { model: 'house', x: 212, z: 20, yaw: -Q - 0.2, scale: 1.0 },
  { model: 'house', x: 240, z: 18, yaw: 2 * Q + 0.16, scale: 1.06 },
]
export const PAVE_GAP = 4   // the least ground between two buildings' paved yards, m
// whether (x, z) lies on a building's footprint, grown by pad m
export function onBuilding(x: number, z: number, pad = 0): boolean {
  return BUILDINGS.some(b => {
    const f = FOOT[b.model], dx = x - b.x, dz = z - b.z
    if (f.r !== undefined) return Math.hypot(dx, dz) <= f.r * b.scale + pad
    // into the building's own frame (the inverse of its yaw)
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), lx = dx * c + dz * s, lz = -dx * s + dz * c
    return Math.abs(lx) <= f.hx! * b.scale + pad && Math.abs(lz) <= f.hz! * b.scale + pad
  })
}

// the paved yard round each building (the owner, 2026-10-20: docs/plans/active/buildings.md): its footprint grown by
// side m all round, the house's by front m at its door (its local −z: a yard toward the road); its edge ragged into the
// ground by the shader (shore.glsl, pavePaint: up to PAVE_WOBBLE m past it)
export const PAVE: Record<Building['model'], { side: number; front: number }> = { windmill: { side: 3, front: 3 }, house: { side: 2.5, front: 6 } }
export const PAVE_WOBBLE = 1.15
// a building's paving as the shader takes it (≤ 16 buildings): a, its centre and its turn (x, z, cos yaw, sin yaw); b,
// a box's half width, its reach behind (+z) and in front (−z) of the centre, its corners' radius, m, or for a circle
// (−radius, 0, 0, 0)
export function paveShape(b: Building): { a: [number, number, number, number]; b: [number, number, number, number] } {
  const f = FOOT[b.model], p = PAVE[b.model], c = Math.cos(b.yaw), s = Math.sin(b.yaw)
  if (f.r !== undefined) return { a: [b.x, b.z, c, s], b: [-(f.r * b.scale + p.side), 0, 0, 0] }
  return { a: [b.x, b.z, c, s], b: [f.hx! * b.scale + p.side, f.hz! * b.scale + p.side, f.hz! * b.scale + p.front, 1.5] }
}
// whether (x, z) lies on a building's paving, grown by pad m (its local frame: the inverse of its yaw)
export function onPaving(x: number, z: number, pad = 0): boolean {
  return BUILDINGS.some(b => {
    const { a, b: q } = paveShape(b), dx = x - a[0], dz = z - a[1]
    if (q[0] < 0) return Math.hypot(dx, dz) <= -q[0] + pad
    const lx = dx * a[2] + dz * a[3], lz = -dx * a[3] + dz * a[2]
    return Math.abs(lx) <= q[0] + pad && lz <= q[1] + pad && lz >= -q[2] - pad
  })
}
// a building's paving as a polygon on the ground (a box's four corners, a circle's sixteen points), in its turn
export function pavePoly(b: Building): [number, number][] {
  const { a, b: q } = paveShape(b), at = (lx: number, lz: number): [number, number] => [a[0] + lx * a[2] - lz * a[3], a[1] + lx * a[3] + lz * a[2]]
  if (q[0] < 0) return Array.from({ length: 16 }, (_, k) => at(Math.cos(k * Math.PI / 8) * -q[0], Math.sin(k * Math.PI / 8) * -q[0]))
  return [at(-q[0], -q[2]), at(q[0], -q[2]), at(q[0], q[1]), at(-q[0], q[1])]
}
// the gap between two convex polygons, m: 0 where they overlap (a point of one in the other), else the least distance
// between their edges
export function polyGap(p: [number, number][], q: [number, number][]): number {
  const inside = (pt: [number, number], poly: [number, number][]) => poly.every((v, i) => { const w = poly[(i + 1) % poly.length]; return (w[0] - v[0]) * (pt[1] - v[1]) - (w[1] - v[1]) * (pt[0] - v[0]) >= 0 })
    || poly.every((v, i) => { const w = poly[(i + 1) % poly.length]; return (w[0] - v[0]) * (pt[1] - v[1]) - (w[1] - v[1]) * (pt[0] - v[0]) <= 0 })
  if (p.some(v => inside(v, q)) || q.some(v => inside(v, p))) return 0
  // (two boxes crossing as a plus: no corner of one in the other, but their edges cross)
  const side = (a: [number, number], b: [number, number], c: [number, number]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) {
    const a = p[i], b = p[(i + 1) % p.length], c = q[j], e = q[(j + 1) % q.length]
    if (side(a, b, c) !== side(a, b, e) && side(c, e, a) !== side(c, e, b)) return 0
  }
  const segPt = (x: number, z: number, a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) }
  let d = Infinity
  for (const [P, Q] of [[p, q], [q, p]]) for (const v of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segPt(v[0], v[1], Q[i], Q[(i + 1) % Q.length]))
  return d
}

