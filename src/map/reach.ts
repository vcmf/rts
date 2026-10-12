// How far a point lies from a feature, for the generators that keep clear of things or stay near them (scatter,
// street-village): the distance to its edge (0 inside an area, a circle or an ellipse; a line counts out to half its
// width), and whether a feature matches a selector (an id, a category, or a dotted kind prefix).
import type { AttrValue, Feature, Pt } from './schema.ts'
import { nearLine } from './apply.ts'
import { inRing } from './geometry.ts'
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
    for (const r of f.area) { if (inRing(r, [x, z])) inside = !inside; d = Math.min(d, nearLine([...r, r[0]] as Pt[], x, z).d) }
    return inside ? 0 : d
  }
  return Infinity
}

// does a feature of this kind and id match a selector: its id, its category, or a dotted prefix of its kind?
export const matches = (sel: string, id: string, kind: string): boolean => sel === id || kind === sel || kind.startsWith(sel + '.')
