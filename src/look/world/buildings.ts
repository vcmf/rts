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
