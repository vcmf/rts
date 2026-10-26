/// <reference types="vite/client" />
// The map editor on the map page (docs/plans/active/m7-editor.md M7a, decision 0066): the map's intent, read from its
// file, edited in the page's memory and compiled live from there, saved through the dev server (tools/map-save.ts)
// with only what changed rewritten (src/map/write.ts). The built page has no server to save through: it selects but
// does not edit.
//
// - One state machine owns the copy: idle, pressing (on the selection's outline or a handle, not yet moved 4 px),
//   dragging, drawing (a new feature, or a reference set again, click by click: ./draw.ts, M7b). Only an idle editor
//   takes a command (undo, redo, Delete, a double click, a save, a selection); a file read in during a press or a
//   drawing is a conflict, never swapped under it.
// - The disk is known as the file's last text (`base`) and whether the file is there (`exists`): a new map's is not
//   yet, a deleted one's no longer, and a save then creates it. A creation, a change and a deletion on disk come
//   through one path (`onDisk`); a file there that is not what the page knows is a conflict, whatever made it.
// - Clicks are paired here: the second click of a double click is that gesture, never a click of its own.
// - An edit always applies, as a hand edit does: what the validator finds in it is shown at once (the selection drawn
//   red, the problem in the panel, the page's list), and undo is one key. The editor holds no copy of the language's
//   rules; snapping only helps.
// - A file whose structure the editor cannot read (`wellFormed`) opens read-only, saying why.
// - A save's reply is taken only for the file and base it was sent for.
// Tested in test/map-editor.test.ts.
import type { Catalogue, Feature, MapFile, Pt, RefName, ShapeName } from '../../map/schema.ts'
import { kindMetaOf, type KindMeta } from '../../map/catalogue.ts'
import { featureKind, validate, type Issue } from '../../map/validate.ts'
import { sameJson, writeMap, writerFrom, type FeatureWriter } from '../../map/write.ts'
import {
  handleAt,
  handles,
  History,
  insertPoint,
  isBarrier,
  movable,
  moveHandle,
  moveShape,
  onShape,
  followGaps,
  ringSegments,
  ovalRing,
  pick,
  removePoint,
  roundStep,
  wellFormed,
  type Handle,
  type Place,
  type Project,
} from './edit.ts'
import {
  addPoint,
  back,
  done,
  drawSteps,
  endStep,
  preview,
  prompt,
  refAccepts,
  setRef,
  startDraft,
  stepOf,
  type Draft,
} from './draw.ts'
import { presetsOf, setField } from './fields.ts'

/** What the editor needs from the page. */
export interface Host {
  ctx: CanvasRenderingContext2D
  project: Project
  toWorld(sx: number, sy: number): Pt | null // null where the view shows no ground
  ppm(): number
  shown(): Feature[] // the shapes on screen: the last compiled (expanded) map's
  groundPath(pts: Pt[], close: boolean): void // a path of ground points through the view
  recompile(): void // compile the editor's copy
  problems(issues: Issue[]): void // what the validator finds in the copy, at once (the compile's list follows)
  redraw(): void
  changed(): void // the selection, the copy or the save's state changed: refresh the panel
}

/** A press on the selection: on one of its handles, or on its outline; a drag once it moves DRAG_PX. */
interface Press {
  kind: 'pressing' | 'dragging'
  handle: Handle | null
  before: MapFile // the copy when the press began
  f0: Feature
  from: Pt // the press on the ground
  at: [number, number] // the press on screen
}
/** A click that may begin a double click: where, when, the drawing's step it fell in (-1: none), if it selected. */
interface FirstClick {
  at: number
  sx: number
  sy: number
  step: number
  selected: boolean
}
/** A feature being drawn (`old` null), or a reference of `old` being set again, click by click. */
interface Drawing {
  kind: 'drawing'
  draft: Draft
  old: Feature | null
}
type Mode = { kind: 'idle' } | Press | Drawing
/** A step of the history: the copy, and the selection it had (a feature brought back by an undo is selected again). */
interface Snapshot {
  doc: MapFile
  selected: string | null
}

const DRAG_PX = 4 // a press that moves less is a click
const SNAP_PX = 14 // a barrier's point snaps to a valid place within this many pixels
const SELECTED = '#d0601a'
const WRONG = '#c0201a'
const BUSY = 'finish the drag first'
const DRAWING = 'finish the drawing first (Enter), or drop it (Escape)'
const DRAFT = '#1a70c0'
const DOUBLE_MS = 600 // longer than a double click's two clicks apart

/** A file's text as a copy the editor can work on, or why it cannot. */
function parseDoc(text: string): { doc: MapFile | null; why: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { doc: null, why: 'the file is not valid JSON' }
  }
  const why = wellFormed(raw)
  return why ? { doc: null, why } : { doc: raw as MapFile, why: '' }
}

export class Editor {
  /** Whether the page edits (the dev server saves); the built page only selects. */
  readonly enabled = import.meta.env.DEV
  file: string | null = null
  /** The file's text as last read or saved: the save's base and the layout a save keeps; null for a map never saved. */
  base: string | null = null
  /** Whether the file is on disk: not for a new map, nor for one deleted under the page (a save creates it). */
  exists = false
  /** The map's intent as edited, or null when the file cannot be edited (`readOnly` says why). */
  doc: MapFile | null = null
  /** Why the file cannot be edited, or '' when it can. */
  readOnly = ''
  selected: string | null = null
  /** The file's text on disk when it is not what the page knows and the copy has edits (or a press), else null. */
  conflict: string | null = null
  /** What the conflict is, for the panel. */
  conflictWhy = ''
  message = ''
  private host: Host
  private mode: Mode = { kind: 'idle' }
  private history = new History<Snapshot>()
  private hover: Handle | null = null
  private cat: Catalogue | null = null
  /** The copy as the file holds it (parsed from `base`): unsaved edits are a difference from it. */
  private baseDoc: MapFile | null = null
  /** Writes a changed feature: in the file's bytes as last read from disk, when an undo brought it back. */
  private writer: FeatureWriter = writerFrom(null)
  private textCache: { doc: MapFile; base: string | null; text: string } | null = null
  private dirtyCache: { doc: MapFile | null; baseDoc: MapFile | null; exists: boolean; dirty: boolean } | null = null
  /** What the validator found in the copy, after the last edit. */
  private found: Issue[] = []
  /** The pointer's last place on the map, or null when it left: where the handle under it is looked for. */
  private pointer: [number, number] | null = null
  private saving: Promise<boolean> | null = null
  /** The text of the save on its way to the server, or null. */
  private inFlight: string | null = null

  constructor(host: Host) {
    this.host = host
  }

  /** The catalogue the validator reads the copy with (the page's newest compile's). */
  setCatalogue(cat: Catalogue | null): void {
    this.cat = cat
    // what the copy's selection is drawn as follows the new catalogue (the page's list comes with the compile)
    this.found = cat && this.doc ? validate(this.doc, cat) : []
    this.host.redraw()
    this.host.changed() // the form's rows, hints and problems follow the catalogue
  }

  /**
   * Takes a file's text as read from disk, as the copy. The history goes (its copies predate the text: an undo then a
   * save would overwrite it); a new file drops the selection too; a press in progress ends.
   */
  load(file: string, text: string): void {
    const { doc, why } = parseDoc(text)
    this.take(file, text, doc, why)
  }
  /**
   * Starts a new map: a copy with no file yet, to be saved as `file` (which the save creates, never over another).
   * Like a load, the history, the selection and any press go.
   */
  create(file: string, doc: MapFile): void {
    this.take(file, null, doc, '')
  }
  private take(file: string, base: string | null, doc: MapFile | null, why: string): void {
    if (file !== this.file) this.selected = null
    this.mode = { kind: 'idle' }
    this.lastClick = null
    this.history.clear()
    this.hover = null
    this.found = []
    this.file = file
    this.base = base
    this.exists = base !== null
    this.writer = writerFrom(base)
    this.conflict = null
    this.doc = doc
    this.readOnly = why
    this.baseDoc = base === null ? null : doc
    if (this.selected && !this.feature(this.selected)) this.selected = null
    // what the validator finds in the file as read (the page's list comes with the compile); no message left over
    this.found = this.cat && doc ? validate(doc, this.cat) : []
    this.message = ''
    this.host.changed()
  }
  /**
   * The file on disk was made, changed or deleted: its text, or null when it is gone. Gone, the copy stays (nothing
   * on disk can be lost) and the next save creates the file again. There with the text the page knows (our own save,
   * the file back as it was read, after a delete and a write of the same bytes), all is settled. Else, with no unsaved
   * edits and no press, it is read in; otherwise it is a conflict, shown until it is settled. Returns whether the copy
   * changed (to recompile).
   */
  onDisk(file: string, text: string | null): boolean {
    if (file !== this.file) return false // a read of another map than the one the editor holds
    // a save of ours on its way (the watcher may see its rename as the file gone, then back): its reply settles it
    if (this.inFlight !== null && (text === null || text === this.inFlight)) return false
    if (text === null) {
      if (!this.exists) return false
      this.exists = false
      this.conflict = null // the disk holds nothing now that a save could overwrite
      this.message = 'the file was deleted on disk: a save makes it again'
      this.host.changed()
      return false
    }
    const wasGone = !this.exists
    this.exists = true
    if (text === this.base) {
      // a conflict, or the file's deletion, is over; any other message (a save's, a problem's) stands
      if (this.conflict !== null || wasGone) {
        this.conflict = null
        this.message = ''
        this.host.changed()
      }
      return false
    }
    if (!this.dirty && this.mode.kind === 'idle') {
      this.load(this.file!, text)
      return true
    }
    this.conflicted(text)
    return false
  }
  /** The file on disk is not what the page knows, and the copy has edits: the page asks which to keep. */
  private conflicted(text: string): void {
    this.conflict = text
    this.conflictWhy =
      this.base === null
        ? 'A file of this name was made on disk since this map was made here.'
        : 'The file changed on disk since it was read.'
    this.message = 'keep your edits and overwrite the file, or take the file'
    this.host.changed()
  }

  /** What a save would write: the file's text with only what changed rewritten. */
  get text(): string {
    if (!this.doc) return this.base ?? ''
    const c = this.textCache
    if (c && c.doc === this.doc && c.base === this.base) return c.text
    const text = writeMap(this.base, this.doc, this.writer)
    this.textCache = { doc: this.doc, base: this.base, text }
    return text
  }
  /**
   * Whether the copy differs from the file as last read or saved, as values: a layout the writer would change on a
   * save is not an edit.
   */
  get dirty(): boolean {
    const c = this.dirtyCache
    if (c && c.doc === this.doc && c.baseDoc === this.baseDoc && c.exists === this.exists) return c.dirty
    // a copy with no file on disk is unsaved, whatever it holds
    const dirty = !!this.doc && (!this.exists || !sameJson(this.doc, this.baseDoc))
    this.dirtyCache = { doc: this.doc, baseDoc: this.baseDoc, exists: this.exists, dirty }
    return dirty
  }
  get idle(): boolean {
    return this.mode.kind === 'idle'
  }
  /** Whether a drawing is in progress (its clicks are the editor's), and what to click next. */
  get drawing(): boolean {
    return this.mode.kind === 'drawing'
  }
  get prompt(): string {
    return this.mode.kind === 'drawing' ? prompt(this.mode.draft) : ''
  }
  /** Whether the copy has no file on disk (a new map, or one deleted under the page): a save creates it. */
  get noFile(): boolean {
    return !!this.doc && !this.exists
  }
  get canUndo(): boolean {
    return this.history.canUndo
  }
  get canRedo(): boolean {
    return this.history.canRedo
  }

  feature(id: string): Feature | undefined {
    return this.doc?.features.find(f => f.id === id)
  }
  private place(f: Feature): Place {
    const ppm = this.host.ppm()
    return { step: roundStep(ppm), reach: SNAP_PX / ppm, barrier: isBarrier(f, this.doc?.presets) }
  }
  /** The copy with one feature (the one `old` is, by identity) replaced by `f`. */
  private replace(doc: MapFile, f: Feature, old = this.feature(f.id)): MapFile {
    return { ...doc, features: doc.features.map(x => (x === old ? f : x)) }
  }
  /** Whether a command may run now; says why not when it may not. */
  private ready(): boolean {
    if (this.mode.kind === 'idle') return true
    this.message = this.mode.kind === 'drawing' ? DRAWING : BUSY
    this.host.changed()
    return false
  }
  /**
   * Whether a feature can be edited: its id must be its own (two features sharing one, a hand edit's slip, cannot be
   * told apart: the file is fixed first); says why not.
   */
  private editable(f: Feature): boolean {
    if (this.doc!.features.filter(x => x.id === f.id).length === 1) return true
    this.message = `two features share the id ${f.id}: give one another id in the file first`
    this.host.changed()
    return false
  }

  /**
   * Shows what the validator finds in the copy, at once: the page's list, the selection drawn red, and in the panel
   * the first problem of the feature just edited (none: the message clears).
   */
  private check(edited: string | null): void {
    this.found = this.cat && this.doc ? validate(this.doc, this.cat) : []
    this.host.problems(this.found)
    const mine = edited ? this.found.find(i => i.id === edited) : undefined
    this.message = mine ? `now wrong: [${mine.id}] ${mine.path ? `${mine.path}: ` : ''}${mine.message}` : ''
  }
  /** Makes an edit: the copy before it goes into the history, the copy is checked, compiled and drawn. */
  private commit(doc: MapFile, edited: string | null, select = this.selected): void {
    this.history.push({ doc: this.doc!, selected: this.selected })
    this.doc = doc
    this.selected = select
    this.check(edited)
    this.hoverAt() // the handle now under the pointer: the old one's indices may be the old shape's
    this.host.recompile()
    this.host.changed()
    this.host.redraw()
  }

  /**
   * A click, or the second click of a double click (one within DOUBLE_MS and DRAG_PX of the last), which is that
   * gesture and never a click of its own. A click while drawing is the drawing's; else, on the selection's drawn shape
   * (a handle, its line, a ring's edge) it keeps the selection, and elsewhere selects what is under it (or none).
   */
  click(sx: number, sy: number): void {
    const now = performance.now()
    const prev = this.lastClick
    if (prev && now - prev.at < DOUBLE_MS && Math.hypot(sx - prev.sx, sy - prev.sy) < DRAG_PX) {
      this.lastClick = null
      return this.double(sx, sy, prev)
    }
    const m = this.mode
    const first: FirstClick = { at: now, sx, sy, step: m.kind === 'drawing' ? m.draft.step : -1, selected: false }
    this.lastClick = first
    if (m.kind === 'drawing') return this.drawClick(sx, sy)
    if (!this.doc || m.kind !== 'idle') return
    const f = this.selected ? this.feature(this.selected) : undefined
    if (f && onShape(f, sx, sy, this.host.project)) return
    const before = this.selected
    this.select(this.pickAt(sx, sy))
    first.selected = this.selected !== before
  }
  /** The last click, which the next may make a double click. */
  private lastClick: FirstClick | null = null
  /**
   * The view moved (a pan, a zoom) or a press dragged: the next click at the same spot on screen is another place
   * on the map, never the second of a double click.
   */
  forgetClick(): void {
    this.lastClick = null
  }
  /**
   * The feature under a screen point among the shapes on screen (the last good compile's) and the copy's own (a map
   * that does not compile yet, or a feature an edit broke, can still be picked), of those `accept` takes.
   */
  private pickAt(sx: number, sy: number, accept?: (id: string) => boolean): string | null {
    const doc = this.doc!
    const ids = new Set(doc.features.map(x => x.id))
    const shapes = [...this.host.shown(), ...doc.features]
    return pick(shapes, ids, sx, sy, this.host.toWorld(sx, sy), this.host.project, accept)
  }
  select(id: string | null): void {
    if (this.mode.kind !== 'idle') return
    const next = id && this.feature(id) ? id : null
    if (next !== this.selected) this.hover = null
    this.selected = next
    this.host.changed()
    this.host.redraw()
  }

  /**
   * A press on one of the selection's handles or on its outline (its line, a ring's edge) is the editor's: a drag
   * moves the handle or the whole shape. Inside an area the press is the page's (a pan). Returns whether.
   */
  down(sx: number, sy: number): boolean {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !movable(f) || this.mode.kind !== 'idle') return false
    if (!onShape(f, sx, sy, this.host.project)) return false
    const from = this.host.toWorld(sx, sy)
    if (!from || !this.editable(f)) return false
    const handle = handleAt(f, sx, sy, this.host.project)
    this.mode = { kind: 'pressing', handle, before: this.doc, f0: f, from, at: [sx, sy] }
    return true
  }
  /** The pointer moved: a press past DRAG_PX drags; else the handle under it is noted. Returns whether it drags. */
  move(sx: number, sy: number): boolean {
    const m = this.mode
    this.pointer = [sx, sy]
    if (m.kind === 'idle') {
      this.hoverAt()
      return false
    }
    if (m.kind === 'drawing') {
      this.host.redraw() // the draft follows the pointer
      return false
    }
    if (m.kind === 'pressing' && Math.hypot(sx - m.at[0], sy - m.at[1]) < DRAG_PX) return true
    if (m.kind === 'pressing') this.lastClick = null // a drag: no double click across it
    m.kind = 'dragging'
    const at = this.host.toWorld(sx, sy)
    if (!at) return true // no ground under the pointer: the shape stays where it last was
    const place = this.place(m.f0)
    const f = m.handle
      ? moveHandle(m.f0, m.handle, at, place)
      : moveShape(m.f0, at[0] - m.from[0], at[1] - m.from[1], place)
    const next = this.replace(m.before, f, m.f0)
    if (!sameJson(next.features, this.doc?.features)) {
      this.doc = next
      this.host.redraw()
    }
    return true
  }
  /** A message for the panel from the page (a read of the file that failed). */
  note(message: string): void {
    this.message = message
    this.host.changed()
  }
  /** The view moved (a fit, a resize, a new tilt): the handle under the resting pointer is looked for again. */
  viewChanged(): void {
    if (this.mode.kind === 'idle') this.hoverAt()
  }
  /** The pointer left the map: no handle is under it. */
  leave(): void {
    this.pointer = null
    this.hoverAt()
  }
  /** Notes the selection's handle under the pointer (none when it is off the map), redrawing if it changed. */
  private hoverAt(): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    const p = this.pointer
    const hover = f && p && this.enabled ? handleAt(f, p[0], p[1], this.host.project) : null
    if (JSON.stringify(hover) !== JSON.stringify(this.hover)) this.host.redraw()
    this.hover = hover
  }
  /** After a press: a conflict that came during it, with nothing edited, is the file read in after all. */
  private settle(): void {
    if (this.conflict === null || this.dirty) return
    this.load(this.file!, this.conflict)
    this.host.recompile()
  }
  /** The press ended: a drag that changed the copy is an edit. Returns whether the press was the editor's. */
  up(): boolean {
    const m = this.mode
    if (m.kind !== 'pressing' && m.kind !== 'dragging') return false
    this.mode = { kind: 'idle' }
    const after = this.doc!
    this.doc = m.before
    // a press that did not move, or moved less than the rounding, changes nothing and leaves no step in the history
    if (m.kind === 'dragging' && !sameJson(after.features, m.before.features)) this.commit(after, m.f0.id)
    else this.host.redraw()
    this.settle()
    return true
  }
  /** An interrupted press (the pointer cancelled, its capture lost): the copy goes back to before it. */
  cancel(): void {
    const m = this.mode
    if (m.kind !== 'pressing' && m.kind !== 'dragging') return
    this.mode = { kind: 'idle' }
    this.doc = m.before
    this.host.redraw()
    this.host.changed()
    this.settle()
  }
  /**
   * A double click, after its first click acted. Drawing a line or an area, it ends it when its first click only
   * added a point (one that ended the step, or the drawing, leaves nothing to end). Idle, on the selected line or ring
   * it adds a point, unless its first click changed the selection.
   */
  private double(sx: number, sy: number, first: FirstClick): void {
    const m = this.mode
    if (first.step >= 0) {
      const s = m.kind === 'drawing' && m.draft.step === first.step ? stepOf(m.draft) : null
      if (s?.kind === 'shape' && (s.shape === 'line' || s.shape === 'area')) this.enter()
      return
    }
    if (first.selected) return
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !this.ready() || !this.editable(f)) return
    const at = this.host.toWorld(sx, sy)
    const g = at && insertPoint(f, sx, sy, at, this.host.project, this.place(f))
    if (g) this.commit(this.replace(this.doc, g), f.id)
  }
  /** Delete: the line's or the ring's point under the pointer; with the pointer off the shape, the feature. */
  remove(): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !this.ready() || !this.editable(f)) return
    const h = this.hover
    if (h && (h.kind === 'line' || h.kind === 'ring')) {
      // the hover follows the pointer: the next Delete takes the point now there
      const g = removePoint(f, h)
      if (g) this.commit(this.replace(this.doc, g), f.id)
      else {
        this.message =
          'that point stays: a shape keeps its fewest points (a line 2, a closed line or a ring 3, ' +
          'the rest of a ring with a shared edge 1)'
        this.host.changed()
      }
      return
    }
    // the pointer on the shape's line or edge but on no handle (a point just removed, the key held): nothing, not
    // the whole feature; on another handle (a point feature's, a centre) or off the shape, the feature goes
    const p = this.pointer
    if (!h && p && onShape(f, p[0], p[1], this.host.project)) {
      this.message = 'point at a point to remove it; Delete off the shape removes the feature'
      this.host.changed()
      return
    }
    this.commit({ ...this.doc, features: this.doc.features.filter(x => x !== f) }, null, null)
  }
  undo(): void {
    if (!this.doc || !this.ready()) return
    const d = this.history.undo({ doc: this.doc, selected: this.selected })
    if (d) this.restore(d)
  }
  redo(): void {
    if (!this.doc || !this.ready()) return
    const d = this.history.redo({ doc: this.doc, selected: this.selected })
    if (d) this.restore(d)
  }
  /**
   * Back or forward to a step: its copy. The selection stays where it is (none stays none), but for a feature the step
   * brings back that was selected when it was taken (a deletion undone), and one the step takes away (it goes).
   */
  private restore(step: Snapshot): void {
    const back = step.selected && !this.feature(step.selected) ? step.selected : null
    this.doc = step.doc
    if (this.selected && !this.feature(this.selected)) this.selected = null
    if (back && this.feature(back)) this.selected = back
    this.hover = null
    this.check(this.selected)
    this.hoverAt()
    this.host.recompile()
    this.host.changed()
    this.host.redraw()
    this.settle() // back to the file as read: a conflict that came meanwhile is the file read in
  }

  /**
   * Starts drawing a new feature of a kind as one of its shapes ('none': by its references alone), with its id. Its
   * clicks are the editor's until the last step makes the feature (one edit), Escape drops it. What the drawing sets is
   * the validator's to judge, at once; refused only are a kind the catalogue does not have (its steps come from it) and
   * an id already used (two features of one id cannot be edited). Returns whether it started; says why not.
   */
  add(kind: string, shape: ShapeName | 'none', id: string): boolean {
    if (!this.enabled || !this.doc || !this.ready()) return false
    const meta = this.cat && kindMetaOf(this.cat, kind)
    const why = !meta ? `no kind ${kind} in the catalogue` : this.feature(id) ? `the id ${id} is taken` : ''
    if (why) {
      this.message = why
      this.host.changed()
      return false
    }
    const f: Feature = { id, kind }
    this.begin(startDraft(f, drawSteps(meta!, shape)), null)
    return true
  }
  /** Whether an edit may be made now (of `f`, a feature; null: of the map); says why not (a refusal always does). */
  private canEdit(f: Feature | null | undefined): boolean {
    if (!this.enabled) this.note('editing needs the dev server (npm run dev)')
    else if (!this.doc) this.note(`the file cannot be edited: ${this.readOnly}`)
    else if (f === undefined) this.note('no feature is selected')
    else return this.ready()
    return false
  }
  /**
   * The fields (M7c): one edit each, judged by the validator at once like any other. Each returns whether it changed
   * the copy: true, false when it was refused (the message says why), null when there was nothing to change. A field of
   * the selection set, or removed (`undefined`: it inherits). Its id is not one: a feature's id is set when it is made,
   * and renamed in the file (an id is also what seeds its generator and names its children).
   */
  setField(key: string, value: unknown): boolean | null {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.canEdit(f) || !f || !this.doc || !this.editable(f)) return false
    if (key === 'id') {
      this.note('an id is set when its feature is made: rename it in the file')
      return false
    }
    const g = setField(f, key, value)
    if (sameJson(g, f)) return null
    this.commit(this.replace(this.doc, g), f.id)
    return true
  }
  /** A field of the map set, or removed; not its features (each its own edits) nor its id (it names its file). */
  setMapField(key: string, value: unknown): boolean | null {
    if (!this.canEdit(null) || !this.doc) return false
    if (key === 'features' || key === 'id') {
      this.note(
        key === 'id' ? "a map's id names its file: it is set when the map is made" : 'features are edited one by one',
      )
      return false
    }
    // the field alone is compared (not the whole map, its features with it)
    if (sameJson(value, (this.doc as unknown as Record<string, unknown>)[key])) return null
    this.commit(setField(this.doc, key, value), null)
    return true
  }
  /** What the validator found in the copy at the last edit. */
  get issues(): Issue[] {
    return this.found
  }

  /** A feature's kind's metadata (its kind its own or its preset's), or null when the catalogue has none. */
  metaOf(f: Feature): KindMeta | null {
    const kind = this.doc ? featureKind(f, presetsOf(this.doc)) : undefined
    return this.cat && kind ? kindMetaOf(this.cat, kind) : null
  }
  /** Sets one reference of the selection again by clicking its target. Returns whether it started; says why not. */
  pickRef(ref: RefName): boolean {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !this.ready() || !this.editable(f)) return false
    const want = this.metaOf(f)?.refs[ref]
    if (!want) {
      this.message = `${f.id} takes no "${ref}"`
      this.host.changed()
      return false
    }
    // set again, it is not skipped: taking an optional reference away is the fields' (M7c)
    this.begin(startDraft(f, [{ kind: 'ref', ref, want, optional: false }]), f)
    return true
  }
  private begin(draft: Draft, old: Feature | null): void {
    this.mode = { kind: 'drawing', draft, old }
    this.hover = null
    this.message = ''
    if (done(draft)) return this.finishDraft() // a kind with no shape and no reference: made at once
    this.host.changed()
    this.host.redraw()
  }
  /** A click while drawing: the shape's next point, or a reference's target (a feature it accepts, or a point). */
  private drawClick(sx: number, sy: number): void {
    const m = this.mode as Drawing
    const at = this.host.toWorld(sx, sy)
    if (!at) return this.note('no ground there: click on the map')
    const s = stepOf(m.draft)
    const place = this.place(m.draft.feature)
    if (s?.kind !== 'ref' || s.want === 'point') {
      return this.step(s?.kind === 'shape' ? addPoint(m.draft, at, place) : setRef(m.draft, null, at, place))
    }
    const self = m.draft.feature.id
    const presets = this.doc!.presets
    // the end of a stretch is on the line it starts on: only that line picks (another may be nearer at a junction)
    const from = m.draft.from
    const accepts = (id: string) => {
      const t = this.feature(id)
      return !!t && (!from || id === from.id) && refAccepts(s.ref, s.want, self, t, presets)
    }
    const id = this.pickAt(sx, sy, accepts)
    this.step(setRef(m.draft, id ? this.feature(id)! : null, at, place))
  }
  /** The drawing after a click or a key: on to its next step (the last makes the feature), or why it stays. */
  private step(next: Draft | string): void {
    const m = this.mode as Drawing
    if (typeof next === 'string') return this.note(next)
    m.draft = next
    this.message = ''
    if (done(next)) return this.finishDraft()
    this.host.changed()
    this.host.redraw()
  }
  /** Ends the drawing: the feature it made is added (or the reference set) in one edit, and selected. */
  private finishDraft(): void {
    const m = this.mode as Drawing
    this.mode = { kind: 'idle' }
    const f = m.draft.feature
    const doc = this.doc!
    if (m.old && sameJson(f, m.old)) {
      this.host.changed()
      this.host.redraw()
    } else if (m.old) this.commit(this.replace(doc, f, m.old), f.id)
    else {
      this.commit({ ...doc, features: [...doc.features, f] }, f.id, f.id)
    }
    this.settle()
  }
  /** Enter (or a double click) while drawing: ends a line or an area, or skips an optional reference. */
  enter(): void {
    if (this.mode.kind === 'drawing') this.step(endStep(this.mode.draft))
  }
  /** Backspace while drawing: takes back the last click. */
  takeBack(): void {
    if (this.mode.kind !== 'drawing') return
    this.mode.draft = back(this.mode.draft)
    this.message = ''
    this.host.changed()
    this.host.redraw()
  }
  /** Escape while drawing: drops it; the copy is as it was. */
  drop(): void {
    if (this.mode.kind !== 'drawing') return
    this.mode = { kind: 'idle' }
    this.message = ''
    this.host.changed()
    this.host.redraw()
    this.settle()
  }

  /**
   * Saves the copy through the dev server, over the text it was read from; refused (and kept) if the file changed on
   * disk since. With `overwrite`, a conflict's file is taken as the base and overwritten. One save at a time.
   */
  async save(overwrite = false): Promise<boolean> {
    while (this.saving) await this.saving
    if (!this.ready()) return false
    this.saving = this.write(overwrite)
    try {
      return await this.saving
    } finally {
      this.saving = null
    }
  }
  private async write(overwrite: boolean): Promise<boolean> {
    if (!this.enabled || !this.doc || !this.file) return false
    if (overwrite && this.conflict !== null) {
      // the file on disk becomes the base (a file the editor cannot read is written afresh)
      this.base = this.conflict
      this.baseDoc = parseDoc(this.conflict).doc
      this.exists = true
      this.conflict = null
      this.host.changed()
    }
    if (!this.dirty && this.text === this.base) return true
    // what this save is for: its reply counts only if the editor still holds that file and base; with no file on disk
    // it creates one (never over a file made meanwhile)
    const sent = {
      file: this.file,
      base: this.exists ? this.base : null,
      known: this.base,
      doc: this.doc,
      text: this.text,
    }
    let status = 0
    let r: { ok: boolean; current?: string; error?: string }
    this.inFlight = sent.text
    try {
      const res = await fetch('/__map/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: sent.file, base: sent.base, text: sent.text }),
      })
      status = res.status
      const body = await res.text()
      try {
        r = JSON.parse(body) as typeof r
      } catch {
        r = { ok: false, error: `${res.status} ${body.slice(0, 120) || res.statusText}` }
      }
    } catch (e) {
      r = { ok: false, error: `${(e as Error).message} (is the dev server running?)` }
    } finally {
      this.inFlight = null
    }
    // the editor moved on (another file, another base, the file there or gone meanwhile): not ours to apply
    if (this.file !== sent.file || this.base !== sent.known || this.exists !== (sent.base !== null)) return r.ok
    if (r.ok) {
      this.base = sent.text
      this.baseDoc = sent.doc
      this.exists = true
      // a change on disk seen while the save was out, other than the save itself, still stands
      if (this.conflict === sent.text) this.conflict = null
      if (this.conflict === null) this.message = 'saved'
    } else if (status === 409 && typeof r.current === 'string') {
      // the file on disk is not what the page knows (changed, or made since this map was): the same conflict
      this.exists = true
      this.conflicted(r.current)
    } else this.message = `not saved: ${r.error ?? status}`
    this.host.changed()
    return r.ok
  }
  /** Settles a conflict by taking the file on disk: the edits and their history are dropped. */
  takeDisk(): void {
    if (this.conflict === null || !this.ready()) return
    this.load(this.file!, this.conflict)
    this.message = ''
    this.host.recompile()
    this.host.changed()
  }

  /**
   * Draws the selection (its intent shape, red while the validator finds it wrong, and its handles) and a drawing in
   * progress (as it would be with the pointer as its next click).
   */
  draw(): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (f) this.drawFeature(f, this.found.some(i => i.id === f.id) ? WRONG : SELECTED, this.hover)
    if (this.mode.kind !== 'drawing') return
    const d = this.mode.draft
    const p = this.pointer && this.host.toWorld(this.pointer[0], this.pointer[1])
    this.drawFeature(preview(d, p, this.place(d.feature)), DRAFT, null)
    const { ctx } = this.host
    ctx.save()
    ctx.fillStyle = DRAFT
    for (const q of d.pts) {
      const s = this.host.project(q[0], q[1])
      if (s) ctx.fillRect(s[0] - 3, s[1] - 3, 6, 6)
    }
    ctx.restore()
  }
  private drawFeature(f: Feature, colour: string, hover: Handle | null): void {
    const { ctx } = this.host
    ctx.save()
    ctx.strokeStyle = colour
    ctx.lineWidth = 2
    const path = (pts: Pt[], close: boolean) => {
      this.host.groundPath(pts, close)
      ctx.stroke()
    }
    if (f.line) path(f.line, false)
    // an outer ring is open where a shared edge runs: the edge is the line it follows
    f.area?.forEach((r, k) => {
      const gaps = followGaps(f, k)
      if (!gaps.size) path(r, true)
      else for (const seg of ringSegments(r, gaps)) path(seg, false)
    })
    if (f.circle) path(ovalRing(f.circle[0], f.circle[1], f.circle[1], 0), true)
    if (f.ellipse) path(ovalRing(...f.ellipse), true)
    const barrier = isBarrier(f, this.doc?.presets)
    for (const { handle, at } of handles(f)) {
      const s = this.host.project(at[0], at[1])
      if (!s) continue
      const big = hover && JSON.stringify(hover) === JSON.stringify(handle)
      const r = big ? 5 : 3.5
      ctx.fillStyle = barrier ? '#f0e0c0' : '#fff'
      ctx.fillRect(s[0] - r, s[1] - r, 2 * r, 2 * r)
      ctx.lineWidth = 1.5
      ctx.strokeRect(s[0] - r, s[1] - r, 2 * r, 2 * r)
    }
    ctx.restore()
  }
}
