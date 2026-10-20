// The world's small geometry, shared by the cover (cover.ts) and the buildings (buildings.ts), which cover.ts imports
type Pt = readonly [number, number]

// the distance from (x, z) to the segment a-b (a degenerate segment: to its point)
export const segD = (x: number, z: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)
}
