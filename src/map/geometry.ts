// Geometry checks for the map language (docs/proposals/map-engine.md §3.1, §3.6): well-formed shapes, rings
// that do not cross themselves, everything inside the extent, and barriers on the 2 m lattice. Exact: only
// + − × / and comparisons.
import type { Pt } from './schema.ts'

export const LATTICE = 2   // m: barrier points lie on the cell corners of the 2 m grid (decision 0021)

export const isPt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n))
// coordinates carry at most 1 cm (§3.1, keeps diffs stable)
export const onCentimetres = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

// the sign of the turn a → b → c: +1, −1 or 0 when collinear
const orient = (a: Pt, b: Pt, c: Pt): number => { const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return v > 0 ? 1 : v < 0 ? -1 : 0 }
const within = (a: Pt, b: Pt, p: Pt): boolean => Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])

// do segments ab and cd share any point (touching counts)?
export function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && within(a, b, c)) || (o2 === 0 && within(a, b, d)) || (o3 === 0 && within(c, d, a)) || (o4 === 0 && within(c, d, b))
}

// the first pair of non-adjacent edges of a closed ring that meet, or null
export function ringCrossing(ring: Pt[]): [number, number] | null {
  const n = ring.length
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue   // neighbours share a corner by construction
    if (segmentsMeet(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return [i, j]
  }
  return null
}

// the first pair of non-adjacent segments of an open line that meet, or null
export function lineCrossing(line: Pt[]): [number, number] | null {
  for (let i = 0; i + 1 < line.length; i++) for (let j = i + 2; j + 1 < line.length; j++)
    if (segmentsMeet(line[i], line[i + 1], line[j], line[j + 1])) return [i, j]
  return null
}

// is p inside the ring (even-odd; points on an edge count as inside)?
export function inRing(ring: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (orient(a, b, p) === 0 && within(a, b, p)) return true
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

// a barrier's line (§3.6): points on the lattice, segments along the axes or the diagonals, none of zero length.
// Returns the index of the first bad point and why, or null.
export function barrierProblem(line: Pt[]): [number, string] | null {
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i]
    if (!Number.isInteger(x / LATTICE) || !Number.isInteger(z / LATTICE)) return [i, `must lie on the ${LATTICE} m lattice (cell corners): try [${Math.round(x / LATTICE) * LATTICE}, ${Math.round(z / LATTICE) * LATTICE}]`]
    if (i === 0) continue
    const dx = x - line[i - 1][0], dz = z - line[i - 1][1]
    if (dx === 0 && dz === 0) return [i, 'repeats the point before it']
    if (dx !== 0 && dz !== 0 && Math.abs(dx) !== Math.abs(dz)) return [i, 'the segment to it must run along an axis or a diagonal (8 directions)']
  }
  return null
}
