// The map editor's edits (docs/plans/active/m7-editor.md M7a): what a click picks, a feature's handles, and the edits
// of its shape, as pure functions on the map's intent features (never the expanded map: decision 0066). Every edit
// returns a new feature and leaves the old one as it was, so the history can keep both. Tested in
// test/map-edit.test.ts.
import type { Feature, Pt } from '../../map/schema.ts'
import { inRing, isClosedLine, LATTICE, ringArea2 } from '../../map/geometry.ts'

/** A part of a feature's shape that can be dragged. */
export type Handle =
  | { kind: 'line'; index: number } // a point of a line
  | { kind: 'ring'; ring: number; index: number } // a point of an area's ring
  | { kind: 'point' }
  | { kind: 'near' } // a reference's point (a ford's)
  | { kind: 'centre' } // a circle's or an ellipse's
  | { kind: 'radius' } // a circle's, east of its centre
  | { kind: 'rx' } // an ellipse's first radius, which turns it
  | { kind: 'rz' }

/** Screen pixels from a ground point, or null where the view cannot show it. */
export type Project = (x: number, z: number) => [number, number] | null

/** The tolerances of picking, in screen pixels. */
export const PICK = { handle: 8, point: 8, line: 6 }

/** Whether a line is closed, as the compiler reads it (a walled yard). */
const closed = isClosedLine
/** Whether a feature is a barrier, whose points lie on the lattice (proposal §3.6). */
export const isBarrier = (f: Feature) => (f.kind ?? '').startsWith('barrier.')

/** A feature's handles and where they are on the ground. A closed line's repeated last point is not one. */
export function handles(f: Feature): { handle: Handle; at: Pt }[] {
  const out: { handle: Handle; at: Pt }[] = []
  if (f.point) out.push({ handle: { kind: 'point' }, at: f.point })
  if (f.near) out.push({ handle: { kind: 'near' }, at: f.near })
  if (f.line) {
    const n = closed(f.line) ? f.line.length - 1 : f.line.length
    for (let k = 0; k < n; k++) out.push({ handle: { kind: 'line', index: k }, at: f.line[k] })
  }
  f.area?.forEach((ring, r) => ring.forEach((at, k) => out.push({ handle: { kind: 'ring', ring: r, index: k }, at })))
  if (f.circle) {
    const [[x, z], radius] = f.circle
    out.push({ handle: { kind: 'centre' }, at: [x, z] }, { handle: { kind: 'radius' }, at: [x + radius, z] })
  }
  if (f.ellipse) {
    const [[x, z], rx, rz, a] = f.ellipse
    out.push(
      { handle: { kind: 'centre' }, at: [x, z] },
      { handle: { kind: 'rx' }, at: [x + rx * Math.cos(a), z + rx * Math.sin(a)] },
      { handle: { kind: 'rz' }, at: [x - rz * Math.sin(a), z + rz * Math.cos(a)] },
    )
  }
  return out
}

/** The handle of a feature within PICK.handle pixels of a screen point, the nearest. */
export function handleAt(f: Feature, sx: number, sy: number, project: Project): Handle | null {
  let best: Handle | null = null
  let bestD = PICK.handle
  for (const { handle, at } of handles(f)) {
    const s = project(at[0], at[1])
    const d = s ? Math.hypot(s[0] - sx, s[1] - sy) : Infinity
    if (d <= bestD) {
      bestD = d
      best = handle
    }
  }
  return best
}

/** The screen distance from a point to a segment. */
function toSegment(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2)) : 0
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)
}
/** The screen distance from a point to a polyline (closed: its last point back to its first). */
function toPolyline(px: number, py: number, pts: Pt[], loop: boolean, project: Project): number {
  let d = Infinity
  const n = loop ? pts.length : pts.length - 1
  for (let k = 0; k < n; k++) {
    const a = project(...pts[k])
    const b = project(...pts[(k + 1) % pts.length])
    if (a && b) d = Math.min(d, toSegment(px, py, a, b))
  }
  return d
}
/** A circle's or an ellipse's outline as a ring of points (as the page draws it). */
export function ovalRing(c: Pt, a: number, b: number, ang: number, n = 48): Pt[] {
  return Array.from({ length: n }, (_, k): Pt => {
    const t = (k / n) * 2 * Math.PI
    const u = a * Math.cos(t)
    const v = b * Math.sin(t)
    return [c[0] + u * Math.cos(ang) - v * Math.sin(ang), c[1] + u * Math.sin(ang) + v * Math.cos(ang)]
  })
}

/**
 * The feature a click picks among the shapes shown (the expanded map's): a point within PICK.point pixels, else a
 * line within PICK.line pixels (the nearest), else the smallest area, circle or ellipse holding the click's ground
 * point. Returns the intent feature's id: a generated child picks the feature it came from.
 */
export function pick(
  shown: Feature[],
  intent: Set<string>,
  sx: number,
  sy: number,
  ground: Pt,
  project: Project,
): string | null {
  const owner = (f: Feature): string | null => {
    if (intent.has(f.id)) return f.id
    const parent = f.origin?.parent ?? f.id.split('/')[0]
    return intent.has(parent) ? parent : null
  }
  let best: { id: string; d: number } | null = null
  const near = (f: Feature, d: number, limit: number) => {
    const id = owner(f)
    if (id && d <= limit && (!best || d < best.d)) best = { id, d }
  }
  for (const f of shown) {
    for (const p of [f.point, f.near]) {
      const s = p && project(p[0], p[1])
      if (s) near(f, Math.hypot(s[0] - sx, s[1] - sy), PICK.point)
    }
  }
  if (best) return (best as { id: string }).id
  for (const f of shown) {
    if (f.line) near(f, toPolyline(sx, sy, f.line, false, project), PICK.line)
  }
  if (best) return (best as { id: string }).id
  let small: { id: string; area: number } | null = null
  for (const f of shown) {
    const id = owner(f)
    if (!id) continue
    let area = Infinity
    if (f.area && inRing(f.area[0], ground) && !f.area.slice(1).some(h => inRing(h, ground))) {
      area = Math.abs(ringArea2(f.area[0])) / 2
    } else if (f.circle && Math.hypot(ground[0] - f.circle[0][0], ground[1] - f.circle[0][1]) <= f.circle[1]) {
      area = Math.PI * f.circle[1] ** 2
    } else if (f.ellipse) {
      const [[x, z], rx, rz, a] = f.ellipse
      const u = (ground[0] - x) * Math.cos(a) + (ground[1] - z) * Math.sin(a)
      const v = -(ground[0] - x) * Math.sin(a) + (ground[1] - z) * Math.cos(a)
      if ((u / rx) ** 2 + (v / rz) ** 2 <= 1) area = Math.PI * rx * rz
    }
    if (area < (small?.area ?? Infinity)) small = { id, area }
  }
  return small?.id ?? null
}

/** The step a dragged point is rounded to: the coarsest of 1, 0.1 and 0.01 m under a screen pixel. */
export function roundStep(ppm: number): number {
  for (const step of [1, 0.1]) if (step * ppm <= 1) return step
  return 0.01
}
/** A number rounded to a step, with no binary fraction left over (0.1 × 3 is 0.3). */
export const roundTo = (v: number, step: number): number => Number((Math.round(v / step) * step).toFixed(2)) || 0
const roundPt = (p: Pt, step: number): Pt => [roundTo(p[0], step), roundTo(p[1], step)]
const onLattice = (p: Pt): Pt => roundPt(p, LATTICE)

// the 8 directions as 4 lines through a point
const DIRS: Pt[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]
/** Whether the segment from a to b runs in one of the 8 directions and is not empty. */
const eightWay = (a: Pt, b: Pt) => {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  return (dx !== 0 || dz !== 0) && (dx === 0 || dz === 0 || Math.abs(dx) === Math.abs(dz))
}

/**
 * Where a barrier's dragged point goes (proposal §3.6): on the lattice, at the point nearest `to` where both its
 * segments (to its neighbours) run in the 8 directions, if one is within `reach` metres; else on one of the lines
 * through a neighbour, if within reach; else the lattice point nearest `to`.
 */
export function snapBarrier(to: Pt, neighbours: Pt[], reach: number): Pt {
  const both: Pt[] = []
  const one: Pt[] = []
  for (const n of neighbours) {
    for (const d of DIRS) {
      // the lattice point on the line through n along d nearest `to`
      const t = Math.round(((to[0] - n[0]) * d[0] + (to[1] - n[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]) / LATTICE)
      one.push([n[0] + t * LATTICE * d[0], n[1] + t * LATTICE * d[1]])
    }
  }
  if (neighbours.length === 2) {
    const [p, q] = neighbours
    for (const a of DIRS) {
      for (const b of DIRS) {
        const det = a[0] * -b[1] + a[1] * b[0]
        if (!det) continue
        // p + s a = q + t b
        const s = ((q[0] - p[0]) * -b[1] + (q[1] - p[1]) * b[0]) / det
        const x: Pt = [p[0] + s * a[0], p[1] + s * a[1]]
        if (Number.isInteger(x[0] / LATTICE) && Number.isInteger(x[1] / LATTICE)) both.push(x)
      }
    }
  }
  const valid = (c: Pt) => neighbours.every(n => eightWay(n, c))
  const nearest = (cs: Pt[]) => {
    let best: Pt | null = null
    let bestD = reach
    for (const c of cs) {
      const d = Math.hypot(c[0] - to[0], c[1] - to[1])
      if (d <= bestD && valid(c)) {
        bestD = d
        best = c
      }
    }
    return best
  }
  const oneOk = (c: Pt) => neighbours.some(n => eightWay(n, c)) && !neighbours.some(n => n[0] === c[0] && n[1] === c[1])
  let fallback: Pt | null = null
  let fd = reach
  for (const c of one) {
    const d = Math.hypot(c[0] - to[0], c[1] - to[1])
    if (d <= fd && oneOk(c)) {
      fd = d
      fallback = c
    }
  }
  return nearest(both) ?? fallback ?? onLattice(to)
}

/** How an edit places points: the rounding step, and the reach of a barrier's snap, m. */
export interface Place {
  step: number
  reach: number
}

/** The feature with one handle moved to a ground point. */
export function moveHandle(f: Feature, h: Handle, to: Pt, place: Place): Feature {
  const at = roundPt(to, place.step)
  const out: Feature = { ...f }
  switch (h.kind) {
    case 'point':
      out.point = at
      break
    case 'near':
      out.near = at
      break
    case 'line': {
      const line = f.line!.map(p => [...p] as Pt)
      const loop = closed(line)
      const n = loop ? line.length - 1 : line.length
      // a closed line's first point is also its last: its neighbours wrap
      const neighbours = [
        h.index > 0 ? line[h.index - 1] : loop ? line[n - 1] : null,
        h.index < n - 1 || loop ? line[(h.index + 1) % n] : null,
      ].filter((p): p is Pt => !!p)
      const p = isBarrier(f) ? snapBarrier(to, neighbours, place.reach) : at
      line[h.index] = p
      if (loop && h.index === 0) line[line.length - 1] = [...p]
      out.line = line
      break
    }
    case 'ring': {
      out.area = f.area!.map((ring, r) => (r === h.ring ? ring.map((p, k) => (k === h.index ? at : p)) : ring))
      break
    }
    case 'centre':
      if (f.circle) out.circle = [at, f.circle[1]]
      if (f.ellipse) out.ellipse = [at, f.ellipse[1], f.ellipse[2], f.ellipse[3]]
      break
    case 'radius': {
      const c = f.circle![0]
      out.circle = [c, Math.max(place.step, roundTo(Math.hypot(to[0] - c[0], to[1] - c[1]), place.step))]
      break
    }
    case 'rx':
    case 'rz': {
      const [c, rx, rz] = f.ellipse!
      const r = Math.max(place.step, roundTo(Math.hypot(to[0] - c[0], to[1] - c[1]), place.step))
      // the first radius turns the ellipse toward the pointer; the second follows a quarter turn behind
      const a = Math.atan2(to[1] - c[1], to[0] - c[0]) - (h.kind === 'rz' ? Math.PI / 2 : 0)
      const angle = roundTo(a, 0.01)
      out.ellipse = h.kind === 'rx' ? [c, r, rz, angle] : [c, rx, r, angle]
      break
    }
  }
  return out
}

/** The feature moved by (dx, dz) m: a barrier by whole lattice steps, the rest rounded to the step. */
export function moveShape(f: Feature, dx: number, dz: number, place: Place): Feature {
  const step = isBarrier(f) ? LATTICE : place.step
  const ddx = roundTo(dx, step)
  const ddz = roundTo(dz, step)
  const by = (p: Pt): Pt => [roundTo(p[0] + ddx, 0.01), roundTo(p[1] + ddz, 0.01)]
  const out: Feature = { ...f }
  if (f.point) out.point = by(f.point)
  if (f.near) out.near = by(f.near)
  if (f.line) out.line = f.line.map(by)
  if (f.area) out.area = f.area.map(r => r.map(by))
  if (f.circle) out.circle = [by(f.circle[0]), f.circle[1]]
  if (f.ellipse) out.ellipse = [by(f.ellipse[0]), f.ellipse[1], f.ellipse[2], f.ellipse[3]]
  return out
}

/** Whether a feature has a shape that can move. */
export const movable = (f: Feature): boolean => !!(f.point || f.near || f.line || f.area || f.circle || f.ellipse)

/**
 * The feature with a point added on the segment of its line or ring nearest a screen point (within PICK.line px), at
 * the ground point given; null if no segment is that near. A barrier's new point goes on the lattice.
 */
export function insertPoint(
  f: Feature,
  sx: number,
  sy: number,
  at: Pt,
  project: Project,
  place: Place,
): Feature | null {
  let best: { ring: number; index: number; d: number } | null = null
  const consider = (pts: Pt[], loop: boolean, ring: number) => {
    const n = loop ? pts.length : pts.length - 1
    for (let k = 0; k < n; k++) {
      const a = project(...pts[k])
      const b = project(...pts[(k + 1) % pts.length])
      const d = a && b ? toSegment(sx, sy, a, b) : Infinity
      if (d <= PICK.line && (!best || d < best.d)) best = { ring, index: k + 1, d }
    }
  }
  if (f.line) consider(f.line, false, -1)
  f.area?.forEach((ring, r) => consider(ring, true, r))
  if (!best) return null
  const { ring, index } = best as { ring: number; index: number }
  let p = roundPt(at, place.step)
  if (isBarrier(f) && f.line) {
    // between its two neighbours, where both new segments run in the 8 directions (none: no point added)
    const nb = [f.line[index - 1], f.line[index]]
    p = snapBarrier(at, nb, place.reach)
    if (!nb.every(n => eightWay(n, p))) return null
  }
  const out: Feature = { ...f }
  if (ring < 0) out.line = [...f.line!.slice(0, index), p, ...f.line!.slice(index)]
  else out.area = f.area!.map((r, k) => (k === ring ? [...r.slice(0, index), p, ...r.slice(index)] : r))
  return out
}

/**
 * The feature with a line's or a ring's point removed; null if a line would keep under 2 points (a closed one under
 * 3), a ring under 3, or a barrier's neighbours would not join in one of the 8 directions.
 */
export function removePoint(f: Feature, h: Handle): Feature | null {
  if (h.kind === 'line') {
    const line = f.line!
    const loop = closed(line)
    if (line.length - (loop ? 1 : 0) <= (loop ? 3 : 2)) return null
    const kept = line.filter((_, k) => k !== h.index)
    // a closed line losing its first point closes on its new first
    if (loop && h.index === 0) kept[kept.length - 1] = [...kept[0]]
    if (isBarrier(f) && !kept.every((p, k) => k === 0 || eightWay(kept[k - 1], p))) return null
    return { ...f, line: kept }
  }
  if (h.kind === 'ring') {
    if (f.area![h.ring].length <= 3) return null
    return { ...f, area: f.area!.map((r, k) => (k === h.ring ? r.filter((_, i) => i !== h.index) : r)) }
  }
  return null
}

/** Undo and redo over snapshots: one a finished edit, at most `limit` kept. */
export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private limit: number
  constructor(limit = 200) {
    this.limit = limit
  }
  /** Records the state before an edit. */
  push(before: T): void {
    this.past.push(before)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }
  /** The state to go back to from `now`, or null. */
  undo(now: T): T | null {
    const s = this.past.pop()
    if (s === undefined) return null
    this.future.push(now)
    return s
  }
  /** The state to go forward to from `now`, or null. */
  redo(now: T): T | null {
    const s = this.future.pop()
    if (s === undefined) return null
    this.past.push(now)
    return s
  }
  clear(): void {
    this.past = []
    this.future = []
  }
  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }
}
