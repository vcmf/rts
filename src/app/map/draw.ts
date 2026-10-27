// The map editor's drawing of a new feature (docs/plans/done/m7-editor.md M7b): a kind's shape drawn click by click,
// then each reference it takes set by clicking its target, as pure functions on a draft. A draft is never in the map's
// copy: the editor adds the feature it makes in one edit when the last step is done. The steps come from the
// catalogue's `shapes` and `refs` (never a kind's name: decision 0015). Points are rounded as a drag rounds them, a
// barrier's snapped to the lattice in 8 directions; what the validator then finds is shown at once (decision 0078).
// Tested in test/map-draw.test.ts.
import type { Ellipse, Feature, MapFile, Pt, RefName, ShapeName } from '../../map/schema.ts'
import { ID, REFS } from '../../map/schema.ts'
import type { KindMeta } from '../../map/catalogue.ts'
import { presetsOf, refTargetProblem } from '../../map/validate.ts'
import { barrierProblem, isClosedLine, lineLength } from '../../map/geometry.ts'
import { cm } from '../../map/util.ts'
import { isPts, onLattice, radiusTo, roundPt, roundTo, snapBarrier, type Place } from './edit.ts'

/**
 * One step of a drawing: the shape, click by click, or one reference, by clicking its target (`want`, as the catalogue
 * names it: 'water:line', 'way', 'point').
 */
export type Step = { kind: 'shape'; shape: ShapeName } | { kind: 'ref'; ref: RefName; want: string; optional: boolean }

/** A feature being drawn: what it has so far, its steps, and the clicks of the step in progress. */
export interface Draft {
  feature: Feature
  steps: Step[]
  step: number // the step in progress; steps.length when every step is done
  pts: Pt[] // the shape step's clicks so far
  from: { id: string; s: number } | null // `along`'s first click: the line and the metres along it
  closed: number[] // the shape steps ended by a click back on their first point (which Backspace takes back)
}

/**
 * The id proposed for a new feature of a kind: the kind's last name, numbered from 2 when taken (`wood2`: never
 * `wood-2`, the form of a generated child's id, reserved while its parent generates).
 */
export function proposeId(kind: string, taken: Iterable<string>): string {
  const ids = new Set(taken)
  const name = kind.split('.').pop()!.toLowerCase()
  const base = ID.test(name) ? name : 'feature'
  if (!ids.has(base)) return base
  for (let n = 2; ; n++) if (!ids.has(`${base}${n}`)) return `${base}${n}`
}

/** The steps of drawing a kind (its inherited `KindMeta`) as one of its shapes ('none': by its references alone). */
export function drawSteps(meta: KindMeta, shape: ShapeName | 'none'): Step[] {
  const steps: Step[] = shape === 'none' ? [] : [{ kind: 'shape', shape }]
  for (const ref of REFS) {
    const want = meta.refs[ref]
    if (want) steps.push({ kind: 'ref', ref, want, optional: meta.optional.includes(ref) })
  }
  return steps
}

/** A draft of a feature (its id and kind set, or an existing feature whose references are set again). */
export const startDraft = (feature: Feature, steps: Step[]): Draft => ({
  feature,
  steps,
  step: 0,
  pts: [],
  from: null,
  closed: [],
})

/** The step in progress, or null when every step is done. */
export const stepOf = (d: Draft): Step | null => d.steps[d.step] ?? null
export const done = (d: Draft): boolean => d.step >= d.steps.length

const advance = (d: Draft, feature: Feature, closed = false): Draft => ({
  ...d,
  feature,
  step: d.step + 1,
  pts: [],
  from: null,
  closed: closed ? [...d.closed, d.step] : d.closed,
})
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]
const VERB: Record<RefName, string> = {
  on: 'it is on',
  carries: 'it carries',
  crosses: 'it crosses',
  along: 'it runs along',
  near: 'it is near',
}

/** What to click next, for the panel. */
export function prompt(d: Draft): string {
  const s = stepOf(d)
  if (!s) return 'done'
  const n = d.pts.length
  if (s.kind === 'shape') {
    switch (s.shape) {
      case 'point':
        return 'click where it is'
      case 'line':
        return n === 0
          ? "click the line's first point"
          : `click the next point; Enter or a double click ends the line${n >= 3 ? ', its first point closes it' : ''}`
      case 'area':
        return n === 0
          ? "click the area's first corner"
          : `click the next corner${n >= 3 ? '; Enter, a double click or its first corner closes the area' : ''}`
      case 'circle':
        return n === 0 ? 'click the centre' : 'click a point on its edge'
      case 'ellipse':
        return ['click the centre', 'click the end of its long radius (it sets the angle)', 'click its side'][n]
    }
  }
  const skip = s.optional ? '; Enter skips it' : ''
  if (s.want === 'point') return `click the point ${VERB[s.ref]}${skip}`
  const [cat, shape] = s.want.split(':')
  const target = `the ${cat} ${shape ?? 'feature'}`
  if (s.ref === 'along') {
    return d.from ? `click where it ends on ${d.from.id}` : `click ${target} ${VERB.along}, where it starts${skip}`
  }
  return `click ${target} ${VERB[s.ref]}${skip}`
}

/**
 * Where a click on the ground puts the next point of a line: rounded to the step; a barrier's on the lattice, snapped
 * where its segment from the last point runs in one of the 8 directions (the engine's rule decides), else the nearest
 * lattice point (the validator then says what is wrong).
 */
function nextPoint(d: Draft, to: Pt, place: Place): Pt {
  if (!place.barrier) return roundPt(to, place.step)
  const prev = d.pts[d.pts.length - 1]
  if (!prev) return onLattice(to)
  const fits = (c: Pt) => barrierProblem([prev, c]) === null
  return snapBarrier(to, [prev], place.reach, fits) ?? onLattice(to)
}

/**
 * A line closed on its first point: that point repeated at its end. A barrier's last segment must run in the 8
 * directions: if it does not, a lattice point between its last and first that makes both segments whole goes in
 * between; null when none is near.
 */
function closeLine(d: Draft, place: Place): Pt[] | null {
  const first = d.pts[0]
  const last = d.pts[d.pts.length - 1]
  if (!place.barrier || barrierProblem([last, first]) === null) return [...d.pts, [...first]]
  const fits = (c: Pt) => barrierProblem([last, c, first]) === null
  const mid: Pt = [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2]
  const c = snapBarrier(mid, [last, first], Math.max(place.reach, dist(last, first)), fits)
  return c ? [...d.pts, c, [...first]] : null
}

/**
 * A click on the ground in the shape step; returns the draft with it (a point, a circle or an ellipse may end it), or
 * why the click adds nothing.
 */
export function addPoint(d: Draft, to: Pt, place: Place): Draft | string {
  const s = stepOf(d)
  if (s?.kind !== 'shape') return d
  const { step } = place
  const at = roundPt(to, step)
  switch (s.shape) {
    case 'point':
      return advance(d, { ...d.feature, point: at })
    case 'line':
    case 'area': {
      // a click back on the first point closes the shape (an area ends; a line ends closed, its last point its first)
      if (d.pts.length >= 3 && dist(to, d.pts[0]) <= place.reach) {
        const closed = s.shape === 'area' ? d.pts : closeLine(d, place)
        if (closed) return advance(d, { ...d.feature, [s.shape]: s.shape === 'area' ? [closed] : closed }, true)
        // a barrier no lattice point closes from its last point: no point on its first (the line would run through
        // its start, open)
        return 'no lattice point closes the barrier from its last point: click a point nearer its start first'
      }
      const p = nextPoint(d, to, place)
      const last = d.pts[d.pts.length - 1]
      // the same point again (a double click's second click, a snap that did not move) adds nothing
      if (last && same(last, p)) return d
      return { ...d, pts: [...d.pts, p] }
    }
    case 'circle':
      if (!d.pts.length) return { ...d, pts: [at] }
      return advance(d, { ...d.feature, circle: [d.pts[0], radiusTo(d.pts[0], to, step)] })
    case 'ellipse':
      if (d.pts.length < 2) return { ...d, pts: [...d.pts, d.pts.length ? to : at] }
      return advance(d, { ...d.feature, ellipse: ellipseOf(d.pts[0], d.pts[1], to, step) })
  }
}
/** An ellipse from its centre, the end of its first radius (its angle) and a point on its side. */
function ellipseOf(c: Pt, a: Pt, b: Pt, step: number): Ellipse {
  const angle = Math.atan2(a[1] - c[1], a[0] - c[0])
  const across = Math.abs(-(b[0] - c[0]) * Math.sin(angle) + (b[1] - c[1]) * Math.cos(angle))
  return [c, radiusTo(c, a, step), Math.max(step, roundTo(across, step)), roundTo(angle, 0.01)]
}

/**
 * Enter (or a double click): ends a line or an area being drawn, or skips an optional reference. Returns the draft
 * after it, or why the step cannot end yet.
 */
export function endStep(d: Draft): Draft | string {
  const s = stepOf(d)
  if (!s) return d
  if (s.kind === 'ref') return s.optional ? advance(d, d.feature) : `${d.feature.id} needs "${s.ref}": ${prompt(d)}`
  if (s.shape === 'line') return d.pts.length >= 2 ? advance(d, { ...d.feature, line: d.pts }) : 'a line needs 2 points'
  if (s.shape === 'area') {
    return d.pts.length >= 3 ? advance(d, { ...d.feature, area: [d.pts] }) : 'an area needs 3 corners'
  }
  return prompt(d)
}

/**
 * Backspace: takes back the last click; at the start of a step, the click that ended the step before (an area or a
 * line closed on its first point reopens with every point; one ended by Enter loses its last). Returns the draft
 * unchanged when there is nothing to take back.
 */
export function back(d: Draft): Draft {
  if (d.pts.length) return { ...d, pts: d.pts.slice(0, -1) }
  if (d.from) return { ...d, from: null }
  if (d.step === 0) return d
  const s = d.steps[d.step - 1]
  const feature = { ...d.feature }
  let pts: Pt[] = []
  if (s.kind === 'ref') delete feature[s.ref]
  else {
    const f = d.feature
    // a closed line's repeated first point goes with the closing click (a barrier's point put in to close it stays)
    const closed = d.closed.includes(d.step - 1)
    if (s.shape === 'line') {
      pts = closed ? f.line!.slice(0, isClosedLine(f.line!) ? -1 : f.line!.length) : f.line!.slice(0, -1)
    }
    if (s.shape === 'area') pts = closed ? f.area![0] : f.area![0].slice(0, -1)
    if (s.shape === 'circle') pts = [f.circle![0]]
    if (s.shape === 'ellipse') {
      const [c, rx, , a] = f.ellipse!
      pts = [c, [c[0] + rx * Math.cos(a), c[1] + rx * Math.sin(a)]]
    }
    delete feature[s.shape]
  }
  return { ...d, feature, step: d.step - 1, pts, from: null, closed: d.closed.filter(k => k !== d.step - 1) }
}

/** Whether a value is a line the editor can measure along: 2 points at least. */
const isLine = (v: unknown): v is Pt[] => isPts(v, 2)

/**
 * Whether a click may pick a feature as a reference's target: by the validator's rule (`refTargetProblem`: of the
 * category the catalogue names, drawn as its shape if it names one), not the feature itself, and for `along` a line
 * (the stretch is measured along it, whatever the catalogue names).
 */
export function refAccepts(
  ref: RefName,
  want: string,
  self: string,
  t: Feature,
  presets: MapFile['presets'] = {},
): boolean {
  if (t.id === self || (ref === 'along' && !isLine(t.line))) return false
  return refTargetProblem(ref, want, t, presetsOf({ presets })) === null
}

/** The metres along a line to the point of it nearest `p`. */
export function alongAt(line: Pt[], p: Pt): number {
  let best = Infinity
  let at = 0
  let acc = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const [a, b] = [line[k], line[k + 1]]
    const len = dist(a, b)
    const t = len
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len ** 2))
      : 0
    const d = dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    if (d < best) {
      best = d
      at = acc + t * len
    }
    acc += len
  }
  return at
}

/**
 * A click in a reference step: on `target` (the feature picked there, already checked by `refAccepts`, or null), at
 * the ground point `at`. `near` takes the point; `along` takes two clicks on one line, where its stretch starts and
 * ends; the others take the target's id. Returns the draft after it, or why the click set nothing.
 */
export function setRef(d: Draft, target: Feature | null, at: Pt, place: Place): Draft | string {
  const s = stepOf(d)
  if (s?.kind !== 'ref') return prompt(d)
  if (s.want === 'point') return advance(d, { ...d.feature, [s.ref]: roundPt(at, place.step) })
  if (!target) return `nothing to pick there: ${prompt(d)}`
  if (s.ref !== 'along') return advance(d, { ...d.feature, [s.ref]: target.id })
  if (!isLine(target.line)) return `${target.id} is no line to run along: ${prompt(d)}`
  // a place on the line: rounded, never past its end (a measure along it is at most its length)
  const end = cm(Math.floor(lineLength(target.line) / place.step) * place.step)
  const sAt = Math.min(roundTo(alongAt(target.line, at), place.step), end)
  if (!d.from) return { ...d, from: { id: target.id, s: sAt } }
  if (target.id !== d.from.id) return `the stretch ends on the line it starts on: ${prompt(d)}`
  if (sAt === d.from.s) return `the stretch needs a length: ${prompt(d)}`
  const [from, to] = sAt < d.from.s ? [sAt, d.from.s] : [d.from.s, sAt]
  return advance(d, { ...d.feature, along: { id: target.id, from, to } })
}

/** The draft as it would be with the pointer's ground point as its next click: what the editor draws. */
export function preview(d: Draft, pointer: Pt | null, place: Place): Feature {
  const s = stepOf(d)
  if (s?.kind !== 'shape') return d.feature
  const pts = pointer ? [...d.pts, s.shape === 'line' ? nextPoint(d, pointer, place) : pointer] : d.pts
  switch (s.shape) {
    case 'line':
      return pts.length >= 2 ? { ...d.feature, line: pts } : d.feature
    case 'area':
      return pts.length >= 2 ? { ...d.feature, area: [pts] } : d.feature
    case 'circle':
      return pts.length >= 2 ? { ...d.feature, circle: [pts[0], dist(pts[0], pts[1])] } : d.feature
    case 'ellipse':
      if (pts.length === 2) return { ...d.feature, line: pts }
      return pts.length === 3 ? { ...d.feature, ellipse: ellipseOf(pts[0], pts[1], pts[2], place.step) } : d.feature
    case 'point':
      return d.feature
  }
}
