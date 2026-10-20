// The demo map's buildings (docs/plans/active/buildings.md): authored, deterministic. Each a model of
// prototypes/buildings.data.js (tools/building-to-js.py: metres, its base at 0, centred on its footprint), where it
// stands (x, z), its turn (yaw, rad, Babylon's instance yaw: a local point (x, z) goes to (x cos − z sin, x sin + z cos),
// measured on the page), its scale. The models' fronts face −z before the turn, so a yaw of −π/2 faces −x: the
// village's houses face the road west of them
export interface Building { model: 'windmill' | 'house'; x: number; z: number; yaw: number; scale: number }
// each model's ground footprint before its scale: a circle's radius (the windmill's tower and gallery) or a box's half
// sizes along its own x and z (the house's walls, its eaves), m: the cover's village ground under it (cover.ts), so
// nothing grows through a floor
export const FOOT: Record<Building['model'], { r?: number; hx?: number; hz?: number }> = { windmill: { r: 4.4 }, house: { hx: 5.6, hz: 4.4 } }
const W = -Math.PI / 2
export const BUILDINGS: readonly Building[] = [
  // the windmill in the large wheat field's north-east part (cover.ts: rect(50, 48, 45, 28, 0.1)), its sails to the
  // south-west, toward the start view
  { model: 'windmill', x: 78, z: 66, yaw: 0.6, scale: 1 },
  // the village's houses east of the road (cover.ts, VILLAGE), in three rows along it, each turned a little apart
  { model: 'house', x: 207, z: -28, yaw: W + 0.12, scale: 1.0 },
  { model: 'house', x: 206, z: -6, yaw: W - 0.08, scale: 0.92 },
  { model: 'house', x: 208, z: 15, yaw: W + 0.2, scale: 1.06 },
  { model: 'house', x: 226, z: -34, yaw: W - 0.18, scale: 0.95 },
  { model: 'house', x: 227, z: -12, yaw: W + 0.05, scale: 1.08 },
  { model: 'house', x: 229, z: 9, yaw: W - 0.25, scale: 0.9 },
  { model: 'house', x: 244, z: -24, yaw: W + 0.26, scale: 1.0 },
]
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

