// How far a point lies from a feature, for the generators that keep clear of things or stay near them (scatter,
// street-village): the distance to its edge (0 inside an area, a circle or an ellipse; a line counts out to half its
// width), and whether a feature matches a selector (an id, a category, or a dotted kind prefix).
import type { AttrValue, Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { inRing, segmentsMeet } from './geometry.ts'
import { cos, sin, PI } from '../sim/num.ts'
import { num } from './util.ts'

export function distanceTo(f: Feature, attrs: Record<string, AttrValue>, x: number, z: number): number {
  if (f.line) return Math.max(0, nearLine(f.line, x, z).d - num(attrs.width, 0) / 2)
  if (f.point) return Math.sqrt((x - f.point[0]) * (x - f.point[0]) + (z - f.point[1]) * (z - f.point[1]))
  const rings = ringsOf(f)
  if (!rings) return Infinity
  let inside = false
  let d = Infinity
  for (const r of rings) {
    if (inRing(r, [x, z])) inside = !inside
    d = Math.min(d, nearLine(closed(r), x, z).d)
  }
  return inside ? 0 : d
}

// a feature's area as rings: its own, or a circle's or an ellipse's as a 64-sided polygon that just contains it (so a
// distance to it is never longer than to the curve: keeping clear of it never lets anything closer), made once
const curveRings = new WeakMap<Feature, Pt[][]>()
const SIDES = 64
export function ringsOf(f: Feature): Pt[][] | null {
  if (f.area) return f.area
  if (!f.circle && !f.ellipse) return null
  let r = curveRings.get(f)
  if (r) return r
  const [[cx, cz], ra, rb, ang] = f.circle ? [f.circle[0], f.circle[1], f.circle[1], 0] : f.ellipse!
  const grow = 1 / cos(PI / SIDES)
  const c = cos(ang)
  const s = sin(ang)
  const ring: Pt[] = []
  for (let k = 0; k < SIDES; k++) {
    const t = (2 * PI * k) / SIDES
    const u = cos(t) * ra * grow
    const v = sin(t) * rb * grow
    ring.push([cx + u * c - v * s, cz + u * s + v * c])
  }
  r = [ring]
  curveRings.set(f, r)
  return r
}

// a feature's bounding box, out to half a line's width: [x0, z0, x1, z1]
export function boxOf(f: Feature, attrs: Record<string, AttrValue>): [number, number, number, number] {
  const pts = f.line ?? (f.point ? [f.point] : (ringsOf(f)?.[0] ?? []))
  const w = f.line ? num(attrs.width, 0) / 2 : 0
  if (!pts.length) return [Infinity, Infinity, -Infinity, -Infinity]
  const xs = pts.map(p => p[0])
  const zs = pts.map(p => p[1])
  return [Math.min(...xs) - w, Math.min(...zs) - w, Math.max(...xs) + w, Math.max(...zs) + w]
}
// how far a point lies from a box (0 inside): a lower bound on its distance to anything in the box
export const boxDistance = (b: [number, number, number, number], x: number, z: number): number => {
  const dx = x < b[0] ? b[0] - x : x > b[2] ? x - b[2] : 0
  const dz = z < b[1] ? b[1] - z : z > b[3] ? z - b[3] : 0
  return Math.sqrt(dx * dx + dz * dz)
}

// a ring as a closed line, made once per ring (so the line index nearLine keeps per line array is built once too)
const closedRings = new WeakMap<Pt[], Pt[]>()
function closed(r: Pt[]): Pt[] {
  let c = closedRings.get(r)
  if (!c) {
    c = [...r, r[0]]
    closedRings.set(r, c)
  }
  return c
}

// How far a convex polygon (a house) lies from a feature's edge: 0 when they touch or overlap. Exact for lines and
// areas (a straight segment's closest approach to a convex polygon is at one of the polygon's corners or one of the
// segment's ends, once neither crosses the other); circles and ellipses as the polygons that just contain them.
export function distanceToPolygon(f: Feature, attrs: Record<string, AttrValue>, poly: Pt[]): number {
  const ring = closed(poly)
  const lineDist = (line: Pt[], halfWidth: number): number =>
    line.some(p => inRing(poly, p)) ? 0 : Math.max(0, lineDistance(line, ring) - halfWidth)
  if (f.line) return lineDist(f.line, num(attrs.width, 0) / 2)
  const rings = ringsOf(f)
  if (rings) {
    // inside the area (even-odd over its rings, so a hole is outside), or the nearest of its rings
    let inside = false
    let d = Infinity
    for (const r of rings) {
      if (inRing(r, poly[0])) inside = !inside
      d = Math.min(d, lineDist(closed(r), 0))
    }
    return inside ? 0 : d
  }
  if (f.point) return inRing(poly, f.point) ? 0 : nearLine(ring, f.point[0], f.point[1]).d
  return Infinity
}

// How far apart two polylines lie (0 when they meet): once no segments meet, the closest approach of two segments is
// at one of their ends
export function lineDistance(a: Pt[], b: Pt[]): number {
  for (let k = 0; k + 1 < a.length; k++) {
    for (let e = 0; e + 1 < b.length; e++) if (segmentsMeet(a[k], a[k + 1], b[e], b[e + 1])) return 0
  }
  let d = Infinity
  for (const [x, z] of b) d = Math.min(d, nearLine(a, x, z).d)
  for (const [x, z] of a) d = Math.min(d, nearLine(b, x, z).d)
  return d
}
// A zone: a convex polygon, filled (counter-clockwise; two points when it is a straight segment, none when empty),
// or, when `open`, a polyline; either widened by `reach`. How far apart two zones lie, and a zone from an area's
// edge: 0 when they meet.
export interface Zone {
  hull: Pt[]
  reach: number
  open?: boolean
}
const edgeOf = (z: Zone): Pt[] => (!z.open && z.hull.length > 2 ? closed(z.hull) : z.hull)
const inHull = (z: Zone, p: Pt): boolean => !z.open && z.hull.length > 2 && inRing(z.hull, p)
export function zoneGap(a: Zone, b: Zone): number {
  if (!a.hull.length || !b.hull.length) return Infinity
  if (inHull(a, b.hull[0]) || inHull(b, a.hull[0])) return 0
  return Math.max(0, lineDistance(edgeOf(a), edgeOf(b)) - a.reach - b.reach)
}
export function zoneToArea(z: Zone, f: Feature): number {
  const rings = ringsOf(f)
  if (!z.hull.length || !rings) return Infinity
  let inside = false
  let d = Infinity
  for (const r of rings) {
    if (inRing(r, z.hull[0])) inside = !inside
    d = Math.min(d, lineDistance(edgeOf(z), closed(r)))
  }
  return inside || inHull(z, rings[0][0]) ? 0 : Math.max(0, d - z.reach)
}

// does a feature match a selector: its id, the id of the feature it was generated from (a scatter's region names its
// children), its category, or a dotted prefix of its kind?
export const matches = (sel: string, f: Feature, kind: string): boolean =>
  sel === f.id || sel === f.origin?.parent || kindMatches(sel, kind)
// is the kind the selector itself, or below it (a category or a dotted prefix)?
export const kindMatches = (sel: string, kind: string): boolean => kind === sel || kind.startsWith(sel + '.')
