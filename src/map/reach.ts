// How far a point lies from a feature, for the generators that keep clear of things or stay near them (scatter,
// street-village): the distance to its edge (0 inside an area, a circle or an ellipse; a line counts out to half its
// width), and whether a feature matches a selector (an id, a category, or a dotted kind prefix).
import type { AttrValue, Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { inRing, segmentsMeet } from './geometry.ts'
import { cos, sin } from '../sim/num.ts'
import { num } from './util.ts'

export function distanceTo(f: Feature, attrs: Record<string, AttrValue>, x: number, z: number): number {
  if (f.line) return Math.max(0, nearLine(f.line, x, z).d - num(attrs.width, 0) / 2)
  if (f.point) return Math.sqrt((x - f.point[0]) * (x - f.point[0]) + (z - f.point[1]) * (z - f.point[1]))
  if (f.circle) { const [[cx, cz], r] = f.circle; return Math.max(0, Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) - r) }
  if (f.ellipse) {
    // the distance to the ellipse's boundary along its radius through the point (exact on the axes, close elsewhere)
    const [[cx, cz], ra, rb, ang] = f.ellipse, c = cos(ang), s = sin(ang), u = (x - cx) * c + (z - cz) * s, v = -(x - cx) * s + (z - cz) * c
    const q = Math.sqrt((u / ra) * (u / ra) + (v / rb) * (v / rb)), d = Math.sqrt(u * u + v * v)
    return q <= 1 ? 0 : d * (1 - 1 / q)
  }
  if (f.area) {
    let inside = false, d = Infinity
    for (const r of f.area) { if (inRing(r, [x, z])) inside = !inside; d = Math.min(d, nearLine(closed(r), x, z).d) }
    return inside ? 0 : d
  }
  return Infinity
}

// a ring as a closed line, made once per ring (so the line index nearLine keeps per line array is built once too)
const closedRings = new WeakMap<Pt[], Pt[]>()
function closed(r: Pt[]): Pt[] { let c = closedRings.get(r); if (!c) { c = [...r, r[0]]; closedRings.set(r, c) } return c }

// How far a convex polygon (a house) lies from a feature's edge: 0 when they touch or overlap. Exact for lines and
// areas (a straight segment's closest approach to a convex polygon is at one of the polygon's corners or one of the
// segment's ends, once neither crosses the other); circles and ellipses by their centre against the polygon.
export function distanceToPolygon(f: Feature, attrs: Record<string, AttrValue>, poly: Pt[]): number {
  const ring = closed(poly)
  const lineDist = (line: Pt[], halfWidth: number): number => {
    for (let k = 0; k + 1 < line.length; k++) for (let e = 0; e + 1 < ring.length; e++) if (segmentsMeet(line[k], line[k + 1], ring[e], ring[e + 1])) return 0
    if (line.some(p => inRing(poly, p))) return 0
    let d = Infinity
    for (const [x, z] of poly) d = Math.min(d, nearLine(line, x, z).d)
    for (const [x, z] of line) d = Math.min(d, nearLine(ring, x, z).d)
    return Math.max(0, d - halfWidth)
  }
  if (f.line) return lineDist(f.line, num(attrs.width, 0) / 2)
  if (f.area) { let d = Infinity; for (const r of f.area) d = Math.min(d, inRing(r, poly[0]) ? 0 : lineDist(closed(r), 0)); return d }
  if (f.point || f.circle || f.ellipse) {
    const c = f.point ?? (f.circle ? f.circle[0] : f.ellipse![0])
    if (inRing(poly, c)) return 0
    return Math.max(0, nearLine(ring, c[0], c[1]).d - (f.circle ? f.circle[1] : f.ellipse ? Math.max(f.ellipse[1], f.ellipse[2]) : 0))
  }
  return Infinity
}

// does a feature match a selector: its id, the id of the feature it was generated from (a scatter's region names its
// children), its category, or a dotted prefix of its kind?
export const matches = (sel: string, f: Feature, kind: string): boolean => sel === f.id || sel === f.origin?.parent || kind === sel || kind.startsWith(sel + '.')
