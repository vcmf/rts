// street-village (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md M3b): houses along a village's
// road between `from` and `to` (metres along it), on both sides, set back from the road's edge and turned to face it,
// with seeded lengths, depths and gaps. A house keeps clear of what the generator's `clear` test says (water, other
// buildings, no-go zones, other ways and barriers, and the road itself where it bends back: src/map/generators.ts). Each side walks the stretch on its own; the side further behind takes the next house.
import type { Pt } from './schema.ts'
import type { Zone } from './reach.ts'
import { pointAt, inRing, ringsTouch, lineLength } from './geometry.ts'
import { random } from './seed.ts'
import { cm } from './util.ts'

export interface Obstacle { clear(house: Pt[]): boolean }   // may this house (its four corners, a convex polygon) stand here?
export interface HouseRow { houses: Pt[][]; hull: Pt[] }

const SETBACK = 3, LENGTH = [8, 13], DEPTH = [6, 9], GAP = [3, 9], YARD = 4   // m

// the farthest apart two points of one house can lie (its diagonal, at the largest size)
export const HOUSE_SPAN = Math.sqrt(LENGTH[1] * LENGTH[1] + DEPTH[1] * DEPTH[1])

// Where a village can reach, whatever its seed: a house's middle lies on the road between `from` and `to`, and its
// corners and yard within `reach` of it (half the longest house, the setback past the road's edge, the deepest house,
// a yard, and the rounding to centimetres). Its ground is the convex hull of its yards, so it can reach anywhere in
// the convex hull of the stretch, widened by `reach` (on a bend, the inside of the bend too). A village with its own
// area keeps it as its ground, so its houses reach only the stretch itself, widened (`open`). Two villages whose
// zones lie apart can never meet. The margin covers the houses' rounding to centimetres and the zone's own (its ends
// lie anywhere on the road, and the geometry's tests round to centimetres).
export function villageZone(road: Pt[], roadWidth: number, from: number, to: number, ownArea = false): Zone {
  const end = Math.min(to, lineLength(road)), line: Pt[] = []
  if (end > from) {
    line.push(pointAt(road, from).slice(0, 2) as Pt)
    let acc = 0
    for (let k = 0; k + 1 < road.length; k++) {
      const dx = road[k + 1][0] - road[k][0], dz = road[k + 1][1] - road[k][1]
      acc += Math.sqrt(dx * dx + dz * dz)
      if (acc > from && acc < end) line.push(road[k + 1])
    }
    line.push(pointAt(road, end).slice(0, 2) as Pt)
  }
  const half = LENGTH[1] / 2, out = roadWidth / 2 + SETBACK + DEPTH[1], reach = Math.sqrt(half * half + out * out) + (ownArea ? 0 : YARD) + 0.05
  if (ownArea) return { hull: line, reach, open: true }
  const h = line.length ? hull(line) : []
  return { hull: h.length >= 2 ? h : line.slice(0, 2), reach }
}

const overlaps = (a: Pt[], b: Pt[]): boolean => ringsTouch(a, b) || inRing(b, a[0]) || inRing(a, b[0])

// the convex hull of the points (monotone chain), counter-clockwise
function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = [], hi: Pt[] = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (const q of [...p].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}

export function streetVillage(road: Pt[], roadWidth: number, from: number, to: number, want: number, seed: number, obstacle: Obstacle): HouseRow {
  const rnd = random(seed), range = (r: number[]) => r[0] + rnd() * (r[1] - r[0]), end = Math.min(to, lineLength(road))
  const houses: Pt[][] = [], at = [from + range([0, 6]), from + range([0, 6])]   // each side's next position along the road
  // enough tries to walk the whole stretch on both sides in the smallest steps (2 m), plus one per house
  const tries = 2 * Math.ceil(Math.max(0, end - from) / 2) + 4 * want + 20
  for (let guard = 0; houses.length < want && guard < tries; guard++) {
    const side = at[0] <= at[1] ? 0 : 1, L = range(LENGTH), D = range(DEPTH), s = at[side]
    if (s + L > end) { at[side] = Infinity; if (at[0] === Infinity && at[1] === Infinity) break; continue }
    const [mx, mz, tx, tz] = pointAt(road, s + L / 2), sign = side ? -1 : 1, nx = -tz * sign, nz = tx * sign   // the side's outward normal
    const near = roadWidth / 2 + SETBACK, far = near + D
    const corners: Pt[] = [[-L / 2, near], [L / 2, near], [L / 2, far], [-L / 2, far]].map(([a, b]) => [cm(mx + tx * a + nx * b), cm(mz + tz * a + nz * b)] as Pt)
    if (obstacle.clear(corners) && !houses.some(h => overlaps(h, corners))) { houses.push(corners); at[side] = s + L + range(GAP) }
    else at[side] = s + range([2, 4])   // something in the way: step on a little and try again
  }
  // the village's ground: the hull of its houses, pushed out by a yard's depth (corner by corner, from each house's
  // middle, so the hull stays convex and holds every house)
  const pts: Pt[] = []
  for (const h of houses) {
    const cx = (h[0][0] + h[2][0]) / 2, cz = (h[0][1] + h[2][1]) / 2
    for (const [x, z] of h) { const dx = x - cx, dz = z - cz, l = Math.sqrt(dx * dx + dz * dz) || 1; pts.push([cm(x + dx / l * YARD), cm(z + dz / l * YARD)]) }
  }
  return { houses, hull: houses.length ? hull(pts) : [] }
}
