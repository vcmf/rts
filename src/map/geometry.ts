// Geometry checks for the map language (docs/proposals/map-engine.md §3.1, §3.6): well-formed shapes, rings
// that do not cross themselves, everything inside the extent, and barriers on the 2 m lattice. Exact: only
// + − × / and comparisons.
import type { Pt } from './schema.ts'

export const LATTICE = 2 // m: barrier points lie on the cell corners of the 2 m grid (decision 0021)

export const isPt = (v: unknown): v is Pt =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n))
// coordinates carry at most 1 cm (§3.1, keeps diffs stable)
export const onCentimetres = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

// the sign of the turn a → b → c: +1, −1 or 0 when collinear. Exact: the language's coordinates are whole
// centimetres (validated), so the test runs on integers (products up to about 1e12, far inside a double's exact
// range); in metres, nearly collinear points rounded to opposite signs and two segments end to end on one line read
// as crossing
const icm = (v: number): number => Math.round(v * 100)
const orient = (a: Pt, b: Pt, c: Pt): number => {
  const v = (icm(b[0]) - icm(a[0])) * (icm(c[1]) - icm(a[1])) - (icm(b[1]) - icm(a[1])) * (icm(c[0]) - icm(a[0]))
  return v > 0 ? 1 : v < 0 ? -1 : 0
}
const within = (a: Pt, b: Pt, p: Pt): boolean =>
  Math.min(a[0], b[0]) <= p[0] &&
  p[0] <= Math.max(a[0], b[0]) &&
  Math.min(a[1], b[1]) <= p[1] &&
  p[1] <= Math.max(a[1], b[1])

// do segments ab and cd share any point (touching counts)?
export function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1])
  ) {
    return false
  } // boxes apart: cheap, and most pairs
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (
    (o1 === 0 && within(a, b, c)) ||
    (o2 === 0 && within(a, b, d)) ||
    (o3 === 0 && within(c, d, a)) ||
    (o4 === 0 && within(c, d, b))
  )
}

// the first pair of non-adjacent edges of a closed ring that meet, or null
export function ringCrossing(ring: Pt[]): [number, number] | null {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue // neighbours share a corner by construction
      if (segmentsMeet(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return [i, j]
    }
  }
  return null
}

// the first pair of non-adjacent segments of an open line that meet, or null
export function lineCrossing(line: Pt[]): [number, number] | null {
  for (let i = 0; i + 1 < line.length; i++) {
    for (let j = i + 2; j + 1 < line.length; j++) {
      if (segmentsMeet(line[i], line[i + 1], line[j], line[j + 1])) return [i, j]
    }
  }
  return null
}

// twice the ring's signed area (shoelace); 0 when its points are in a line
export function ringArea2(ring: Pt[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  }
  return a
}

// do two closed rings share any point on their edges?
export function ringsTouch(a: Pt[], b: Pt[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsMeet(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return false
}

// the first point where an open line turns straight back or repeats the point before it, or −1
export function lineFoldBack(line: Pt[]): number {
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]
    const [bx, bz] = line[i]
    if (ax === bx && az === bz) return i
    if (i + 1 < line.length) {
      const [cx, cz] = line[i + 1]
      const ux = bx - ax
      const uz = bz - az
      const vx = cx - bx
      const vz = cz - bz
      if (ux * vz - uz * vx === 0 && ux * vx + uz * vz < 0) return i
    }
  }
  return -1
}

export function lineLength(line: Pt[]): number {
  let s = 0
  for (let i = 1; i < line.length; i++) {
    const dx = line[i][0] - line[i - 1][0]
    const dz = line[i][1] - line[i - 1][1]
    s += Math.sqrt(dx * dx + dz * dz)
  }
  return s
}

// is p inside the ring (even-odd; points on an edge count as inside)?
export function inRing(ring: Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (orient(a, b, p) === 0 && within(a, b, p)) return true
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

// a barrier's line (§3.6): points on the lattice, segments along the axes or the diagonals, none of zero length.
// Returns the index of the first bad point and why, or null.
export function barrierProblem(line: Pt[]): [number, string] | null {
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i]
    if (!Number.isInteger(x / LATTICE) || !Number.isInteger(z / LATTICE)) {
      return [
        i,
        `must lie on the ${LATTICE} m lattice (cell corners): try [${Math.round(x / LATTICE) * LATTICE}, ${Math.round(z / LATTICE) * LATTICE}]`,
      ]
    }
    if (i === 0) continue
    const dx = x - line[i - 1][0]
    const dz = z - line[i - 1][1]
    if (dx === 0 && dz === 0) return [i, 'repeats the point before it']
    if (dx !== 0 && dz !== 0 && Math.abs(dx) !== Math.abs(dz)) {
      return [i, 'the segment to it must run along an axis or a diagonal (8 directions)']
    }
  }
  return null
}

// the point at distance s along a polyline, and the unit tangent there: [x, z, tx, tz]
export function pointAt(line: Pt[], s: number): [number, number, number, number] {
  let acc = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k]
    const [bx, bz] = line[k + 1]
    const dx = bx - ax
    const dz = bz - az
    const L = Math.sqrt(dx * dx + dz * dz)
    if (acc + L >= s || k + 2 === line.length) {
      const t = Math.min(1, Math.max(0, (s - acc) / L))
      return [ax + t * dx, az + t * dz, dx / L, dz / L]
    }
    acc += L
  }
  return [line[0][0], line[0][1], 1, 0]
}

// the part of a polyline between distances a < b along it: its points at a and b and every vertex between
export function stretch(line: Pt[], a: number, b: number): Pt[] {
  const out: Pt[] = [pointAt(line, a).slice(0, 2) as Pt]
  let acc = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const dx = line[k + 1][0] - line[k][0]
    const dz = line[k + 1][1] - line[k][1]
    acc += Math.sqrt(dx * dx + dz * dz)
    if (acc > a && acc < b) out.push(line[k + 1])
  }
  out.push(pointAt(line, b).slice(0, 2) as Pt)
  return out
}

// every point where two polylines cross, in order along the first; exact, on whole centimetres (integers). A point
// lying exactly on the other line is decided by "simulation of simplicity": the first line is taken as shifted by an
// infinitesimal step along PERTURB, a direction no segment on a map is parallel to (its x is 1000003 times its z, and
// no segment spans a million centimetres), so every decision is the same from either line's side. A line passing
// through a vertex of the other then crosses exactly once; a touch crosses nowhere or twice at the same point, and such
// a coincident pair is removed. A line's own first or last point on the other line takes its neighbour's side, so a
// road that only ends on a bank does not cross it. Lines running along each other do not cross.
const PERTURB = [1000003, 1]
export function crossings(a: Pt[], b: Pt[]): Pt[] {
  const A = a.map(p => [icm(p[0]), icm(p[1])])
  const B = b.map(p => [icm(p[0]), icm(p[1])])
  const turn = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const sgn = (v: number) => (v > 0 ? 1 : -1)
  // the side of L[k] against segment p→q; `shift` is +1 when L is the shifted line, −1 when the segment's line is
  const sideOf = (L: number[][], k: number, p: number[], q: number[], shift: number): number => {
    const v = turn(p, q, L[k])
    if (v !== 0) return sgn(v)
    if (L.length > 1 && (k === 0 || k === L.length - 1)) {
      const w = turn(p, q, L[k === 0 ? 1 : k - 1])
      if (w !== 0) return sgn(w)
    }
    return sgn(shift * ((q[0] - p[0]) * PERTURB[1] - (q[1] - p[1]) * PERTURB[0]))
  }
  const hits: { at: number; p: Pt }[] = []
  for (let i = 0; i + 1 < A.length; i++) {
    for (let j = 0; j + 1 < B.length; j++) {
      const p = A[i]
      const q = A[i + 1]
      const r = B[j]
      const s = B[j + 1]
      if (
        Math.max(p[0], q[0]) < Math.min(r[0], s[0]) ||
        Math.max(r[0], s[0]) < Math.min(p[0], q[0]) ||
        Math.max(p[1], q[1]) < Math.min(r[1], s[1]) ||
        Math.max(r[1], s[1]) < Math.min(p[1], q[1])
      ) {
        continue
      }
      if (
        sideOf(A, i, r, s, 1) === sideOf(A, i + 1, r, s, 1) ||
        sideOf(B, j, p, q, -1) === sideOf(B, j + 1, p, q, -1)
      ) {
        continue
      }
      // where, for the record (the decision above is exact; this point is only reported)
      const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0])
      const t =
        d === 0 ? 0 : Math.min(1, Math.max(0, ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d))
      hits.push({ at: i + t, p: [a[i][0] + t * (a[i + 1][0] - a[i][0]), a[i][1] + t * (a[i + 1][1] - a[i][1])] })
    }
  }
  hits.sort((x, y) => x.at - y.at)
  // a touch: two crossings at the same point, one after the other along the line; they cancel
  const out: Pt[] = []
  for (let k = 0; k < hits.length; k++) {
    const h = hits[k]
    const n = hits[k + 1]
    if (n && Math.abs(n.p[0] - h.p[0]) < 1e-6 && Math.abs(n.p[1] - h.p[1]) < 1e-6) {
      k++
      continue
    }
    out.push(h.p)
  }
  return out
}
