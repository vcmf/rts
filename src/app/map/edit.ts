// The map editor's edits (docs/plans/active/m7-editor.md M7a): what a click picks, a feature's handles, and the edits
// of its shape, as pure functions on the map's intent features (never the expanded map: decision 0066). Every edit
// returns a new feature and leaves the old one as it was, so the history can keep both. Snapping only helps: an edit
// always applies, and what the validator then finds is shown at once (the engine's rules, never copies of them). A
// field that names a point by its place in a list (a shared edge's `at`) is kept in step as points come and go.
// Tested in test/map-edit.test.ts.
import type { Feature, MapFile, Pt } from '../../map/schema.ts'
import { barrierProblem, inRing, isClosedLine, isPt, LATTICE, ringArea2 } from '../../map/geometry.ts'
import { featureKind } from '../../map/validate.ts'
import { categoryOf } from '../../map/catalogue.ts'
import { childOf } from '../../map/generators.ts'
import { cm, listOf } from '../../map/util.ts'
import type { FollowEdge } from '../../map/follow.ts'

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

/** Whether a feature is a barrier (its kind its own or its preset's), whose points lie on the lattice (§3.6). */
export const isBarrier = (f: Feature, presets: MapFile['presets'] = {}) => {
  const kind = featureKind(f, presets as Record<string, Record<string, unknown>>)
  return kind !== undefined && categoryOf(kind) === 'barrier'
}

/** A feature's handles and where they are on the ground. A closed line's repeated last point is not one. */
export function handles(f: Feature): { handle: Handle; at: Pt }[] {
  const out: { handle: Handle; at: Pt }[] = []
  if (f.point) out.push({ handle: { kind: 'point' }, at: f.point })
  if (f.near) out.push({ handle: { kind: 'near' }, at: f.near })
  if (f.line) {
    const n = isClosedLine(f.line) ? f.line.length - 1 : f.line.length
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
/**
 * The segments of a polyline on screen (a loop's last back to its first), each with the index of its end point; a
 * loop's segments ending at a point in `gaps` are left out (where a shared edge runs: `followGaps`).
 */
function* screenSegments(pts: Pt[], loop: boolean, project: Project, gaps: Set<number> = NO_GAPS) {
  const n = loop ? pts.length : pts.length - 1
  for (let k = 0; k < n; k++) {
    if (loop && gaps.has((k + 1) % pts.length)) continue
    const a = project(...pts[k])
    const b = project(...pts[(k + 1) % pts.length])
    if (a && b) yield { a, b, end: k + 1 }
  }
}
/** The screen distance from a point to a polyline (closed: its last point back to its first). */
function toPolyline(px: number, py: number, pts: Pt[], loop: boolean, project: Project, gaps?: Set<number>): number {
  let d = Infinity
  for (const { a, b } of screenSegments(pts, loop, project, gaps)) d = Math.min(d, toSegment(px, py, a, b))
  return d
}
const NO_GAPS = new Set<number>()
/**
 * Where an area's outer ring is open for its shared edges (decision 0030): the indices of the points each edge goes
 * before (`at`, 0 when absent), so the segment into that point is the edge's, not the ring's. None for other rings.
 */
export function followGaps(f: Feature, ring: number): Set<number> {
  const n = f.area?.[0]?.length ?? 0
  if (ring !== 0 || f.follow === undefined || !n) return NO_GAPS
  return new Set(
    listOf<FollowEdge>(f.follow).flatMap(e => {
      const at = e.at ?? 0
      return typeof at === 'number' && Number.isInteger(at) ? [((at % n) + n) % n] : []
    }),
  )
}
/** A ring's segments as lines of two points, leaving out its gaps (`followGaps`): how an open outer ring is drawn. */
export function ringSegments(ring: Pt[], gaps: Set<number>): Pt[][] {
  return ring.flatMap((p, k) => (gaps.has((k + 1) % ring.length) ? [] : [[p, ring[(k + 1) % ring.length]]]))
}
/**
 * Whether a screen point is on a feature's drawn shape: one of its handles, or within PICK.line of its line, a ring's
 * edge, a circle's or an ellipse's outline (not merely inside an area: what lies inside can still be picked).
 */
export function onShape(f: Feature, sx: number, sy: number, project: Project): boolean {
  if (handleAt(f, sx, sy, project)) return true
  const rings: [Pt[], Set<number>][] = (f.area ?? []).map((r, k) => [r, followGaps(f, k)])
  if (f.circle) rings.push([ovalRing(f.circle[0], f.circle[1], f.circle[1], 0), NO_GAPS])
  if (f.ellipse) rings.push([ovalRing(...f.ellipse), NO_GAPS])
  return (
    (!!f.line && toPolyline(sx, sy, f.line, false, project) <= PICK.line) ||
    rings.some(([r, gaps]) => toPolyline(sx, sy, r, true, project, gaps) <= PICK.line)
  )
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
  ground: Pt | null, // the click's ground point; null where the view shows no ground (only points and lines pick)
  project: Project,
  accept: (id: string) => boolean = () => true, // which intent features may be picked (a reference's targets)
): string | null {
  const owner = (f: Feature): string | null => {
    const parent = f.origin?.parent ?? childOf(f.id)?.parent
    const id = intent.has(f.id) ? f.id : parent !== undefined && intent.has(parent) ? parent : null
    return id !== null && accept(id) ? id : null
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
  if (!ground) return null
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
export const roundTo = (v: number, step: number): number => cm(Math.round(v / step) * step) || 0
export const roundPt = (p: Pt, step: number): Pt => [roundTo(p[0], step), roundTo(p[1], step)]
export const onLattice = (p: Pt): Pt => roundPt(p, LATTICE)

// the 8 directions as 4 lines through a point
const DIRS: Pt[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

/**
 * Where a barrier's point goes (proposal §3.6): of the lattice points that keep its segments in the 8 directions (on
 * the lines through its neighbours, and where two such lines meet), and the lattice point nearest `to`, the nearest
 * to `to` within `reach` metres that `fits` (the line with it passes the engine's barrier rule); null if none does.
 */
export function snapBarrier(to: Pt, neighbours: Pt[], reach: number, fits: (p: Pt) => boolean): Pt | null {
  const candidates: Pt[] = [onLattice(to)]
  for (const n of neighbours) {
    for (const d of DIRS) {
      // the lattice point on the line through n along d nearest `to`
      const t = Math.round(((to[0] - n[0]) * d[0] + (to[1] - n[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]) / LATTICE)
      candidates.push([n[0] + t * LATTICE * d[0], n[1] + t * LATTICE * d[1]])
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
        if (Number.isInteger(x[0] / LATTICE) && Number.isInteger(x[1] / LATTICE)) candidates.push(x)
      }
    }
  }
  const dist = (c: Pt) => Math.hypot(c[0] - to[0], c[1] - to[1])
  return (
    candidates
      .filter(c => dist(c) <= reach)
      .sort((a, b) => dist(a) - dist(b))
      .find(fits) ?? null
  )
}

/** A radius from a centre to a ground point, rounded to the step and never under it (a circle needs one). */
export const radiusTo = (c: Pt, to: Pt, step: number): number =>
  Math.max(step, roundTo(Math.hypot(to[0] - c[0], to[1] - c[1]), step))

/** How an edit places points: the rounding step, the reach of a barrier's snap, m, and whether it is a barrier. */
export interface Place {
  step: number
  reach: number
  barrier: boolean
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
      const loop = isClosedLine(line)
      const n = loop ? line.length - 1 : line.length
      // a closed line's first point is also its last: its neighbours wrap
      const neighbours = [
        h.index > 0 ? line[h.index - 1] : loop ? line[n - 1] : null,
        h.index < n - 1 || loop ? line[(h.index + 1) % n] : null,
      ].filter((p): p is Pt => !!p)
      // the engine's rule on the point and its two segments only, so a barrier broken elsewhere can be mended a point
      // at a time
      const fits = (c: Pt) =>
        barrierProblem(neighbours.length === 2 ? [neighbours[0], c, neighbours[1]] : [...neighbours, c]) === null
      // a barrier's point goes where its segments stay whole, if such a lattice point is near; else to the nearest
      // lattice point, and the validator says what is wrong
      const p = place.barrier ? (snapBarrier(to, neighbours, place.reach, fits) ?? onLattice(to)) : at
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
      out.circle = [c, radiusTo(c, to, place.step)]
      break
    }
    case 'rx':
    case 'rz': {
      const [c, rx, rz] = f.ellipse!
      const r = radiusTo(c, to, place.step)
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
  const step = place.barrier ? LATTICE : place.step
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
    for (const { a, b, end } of screenSegments(pts, loop, project, loop ? followGaps(f, ring) : NO_GAPS)) {
      const d = toSegment(sx, sy, a, b)
      if (d <= PICK.line && (!best || d < best.d)) best = { ring, index: end, d }
    }
  }
  // on an existing point, nothing is added (it would repeat it)
  if (handleAt(f, sx, sy, project)) return null
  if (f.line) consider(f.line, false, -1)
  f.area?.forEach((ring, r) => consider(ring, true, r))
  if (!best) return null
  const { ring, index } = best as { ring: number; index: number }
  let p: Pt | null = roundPt(at, place.step)
  if (place.barrier && ring < 0) {
    // between its two neighbours, on a lattice point that keeps its two new segments whole, else the nearest one
    const line = f.line!
    const fits = (c: Pt) => barrierProblem([line[index - 1], c, line[index]]) === null
    p = snapBarrier(at, [line[index - 1], line[index]], place.reach, fits) ?? onLattice(at)
  }
  const out: Feature = { ...f }
  if (ring < 0) out.line = [...f.line!.slice(0, index), p, ...f.line!.slice(index)]
  else {
    out.area = f.area!.map((r, k) => (k === ring ? [...r.slice(0, index), p, ...r.slice(index)] : r))
    if (ring === 0) shiftFollow(out, index, +1)
  }
  return out
}

/**
 * Keeps a shared edge's place in step with its outer ring (decision 0030: `at` is the index of the ring's point the
 * edge goes before): a point added at `index` or before moves it on by one, one removed before it moves it back.
 */
function shiftFollow(f: Feature, index: number, by: 1 | -1): void {
  if (f.follow === undefined) return
  const shift = (e: FollowEdge): FollowEdge => {
    const at = e.at ?? 0
    if (typeof at !== 'number') return e // not a place (a hand edit's slip): left for the validator to name
    const moves = by > 0 ? index <= at : index < at
    return moves ? { ...e, at: at + by } : e
  }
  f.follow = Array.isArray(f.follow) ? f.follow.map(e => shift(e as FollowEdge)) : shift(f.follow as FollowEdge)
}

/**
 * The feature with a line's or a ring's point removed; null if a line would keep under 2 points (a closed one under
 * 3), a ring under 3, or an outer ring whose rest is a shared edge (`follow`) under 1.
 */
export function removePoint(f: Feature, h: Handle): Feature | null {
  if (h.kind === 'line') {
    const line = f.line!
    const loop = isClosedLine(line)
    if (line.length - (loop ? 1 : 0) <= (loop ? 3 : 2)) return null
    const kept = line.filter((_, k) => k !== h.index)
    // a closed line losing its first point closes on its new first
    if (loop && h.index === 0) kept[kept.length - 1] = [...kept[0]]
    return { ...f, line: kept }
  }
  if (h.kind === 'ring') {
    const least = h.ring === 0 && listOf(f.follow).length ? 1 : 3
    if (f.area![h.ring].length <= least) return null
    const out: Feature = { ...f, area: f.area!.map((r, k) => (k === h.ring ? r.filter((_, i) => i !== h.index) : r)) }
    if (h.ring === 0) shiftFollow(out, h.index, -1)
    return out
  }
  return null
}

/** Whether a value is a list of at least `least` points. */
export const isPts = (v: unknown, least: number): v is Pt[] => Array.isArray(v) && v.length >= least && v.every(isPt)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Why a map's copy cannot be edited, or null when it can: the editor works on a map whose structure it can read (an
 * object, its features objects with a text id, its presets objects, each shape as its kind of value). What is wrong
 * inside that (a line that crosses itself, a barrier off its lattice) is the validator's to report, and can be mended
 * in the editor.
 */
export function wellFormed(doc: unknown): string | null {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return 'the file is not a JSON object'
  const m = doc as Record<string, unknown>
  if (!Array.isArray(m.features)) return 'the file has no list of features'
  const presets = m.presets
  if (presets !== undefined) {
    const ok = typeof presets === 'object' && presets !== null && !Array.isArray(presets)
    if (!ok || Object.values(presets).some(p => typeof p !== 'object' || p === null || Array.isArray(p))) {
      return 'its presets are not objects'
    }
  }
  for (const [k, f] of m.features.entries()) {
    if (typeof f !== 'object' || f === null || Array.isArray(f)) return `features[${k}] is not an object`
    const g = f as Record<string, unknown>
    if (typeof g.id !== 'string') return `features[${k}] has no text id`
    const bad = (shape: string) => `${g.id}: its ${shape} is not one`
    if (g.point !== undefined && !isPt(g.point)) return bad('point')
    if (g.near !== undefined && !isPt(g.near)) return bad('near point')
    if (g.line !== undefined && !isPts(g.line, 1)) return bad('line')
    if (g.area !== undefined && !(Array.isArray(g.area) && g.area.length > 0 && g.area.every(r => isPts(r, 1)))) {
      return bad('area')
    }
    if (g.circle !== undefined && !(Array.isArray(g.circle) && isPt(g.circle[0]) && isNum(g.circle[1]))) {
      return bad('circle')
    }
    const e = g.ellipse
    if (e !== undefined && !(Array.isArray(e) && isPt(e[0]) && isNum(e[1]) && isNum(e[2]) && isNum(e[3]))) {
      return bad('ellipse')
    }
    const edges = g.follow === undefined ? [] : listOf<unknown>(g.follow)
    const edgeOk = (x: unknown) =>
      typeof x === 'object' && x !== null && ((x as FollowEdge).at === undefined || isNum((x as FollowEdge).at))
    if (!edges.every(edgeOk)) return bad('shared edge')
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
