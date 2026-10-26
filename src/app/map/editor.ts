/// <reference types="vite/client" />
// The map editor on the map page (docs/plans/active/m7-editor.md M7a, decision 0066): the map's intent, read from its
// file, edited in the page's memory and compiled live from there, saved through the dev server (tools/map-save.ts)
// with only what changed rewritten (src/map/write.ts). The built page has no server to save through: it selects but
// does not edit.
//
// One state machine owns the copy: idle, pressing (on the selection, not yet moved 4 px), dragging. Only an idle
// editor takes a command (undo, redo, Delete, a double click, a save, a selection); a file read in during a press is
// a conflict, never swapped under it. Every edit of a shape is gated by the validator (the engine's rules): an edit
// that adds a problem is refused and the copy keeps its last good state. Deleting a feature is not gated: what it
// breaks (a bridge's road) shows in place, and undo brings it back. A save's reply is taken only for the file and base
// it was sent for. Tested in test/map-editor.test.ts.
import type { Catalogue, Feature, MapFile, Pt } from '../../map/schema.ts'
import { validate } from '../../map/validate.ts'
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
  ovalRing,
  pick,
  removePoint,
  roundStep,
  type Handle,
  type Place,
  type Project,
} from './edit.ts'

/** What the editor needs from the page. */
export interface Host {
  ctx: CanvasRenderingContext2D
  project: Project
  toWorld(sx: number, sy: number): Pt
  ppm(): number
  shown(): Feature[] // the shapes on screen: the last compiled (expanded) map's
  groundPath(pts: Pt[], close: boolean): void // a path of ground points through the view
  recompile(): void // compile the editor's copy
  redraw(): void
  changed(): void // the selection, the copy or the save's state changed: refresh the panel
}

/** A map file's text as the editor's copy: null unless it is a JSON object with a list of features. */
function parseDoc(text: string): MapFile | null {
  try {
    const doc = JSON.parse(text) as MapFile
    return typeof doc === 'object' && doc !== null && Array.isArray(doc.features) ? doc : null
  } catch {
    return null
  }
}

/** A press on the selection: on one of its handles, or on its shape; a drag once it moves DRAG_PX. */
interface Press {
  kind: 'pressing' | 'dragging'
  handle: Handle | null
  before: MapFile // the copy when the press began
  f0: Feature
  from: Pt // the press on the ground
  at: [number, number] // the press on screen
}
type Mode = { kind: 'idle' } | Press

const DRAG_PX = 4 // a press that moves less is a click
const SNAP_PX = 14 // a barrier's point snaps to a valid place within this many pixels
const SELECTED = '#d0601a'
const BUSY = 'finish the drag first'

export class Editor {
  /** Whether the page edits (the dev server saves); the built page only selects. */
  readonly enabled = import.meta.env.DEV
  file: string | null = null
  /** The file's text as last read or saved: the save's base. */
  base: string | null = null
  /** The map's intent as edited, or null when the file is not a map's JSON. */
  doc: MapFile | null = null
  selected: string | null = null
  /** The file's text on disk when it changed under unsaved edits (or a press), else null. */
  conflict: string | null = null
  message = ''
  private host: Host
  private mode: Mode = { kind: 'idle' }
  private history = new History<MapFile>()
  private hover: Handle | null = null
  private cat: Catalogue | null = null
  /** The copy as the file holds it (parsed from `base`): unsaved edits are a difference from it. */
  private baseDoc: MapFile | null = null
  /** Writes a changed feature: in the file's bytes as last read from disk, when an undo brought it back. */
  private writer: FeatureWriter = writerFrom(null)
  private textCache: { doc: MapFile; base: string | null; text: string } | null = null
  /** The validator's problems of a copy, as keys, for the gate. */
  private problems = new WeakMap<MapFile, Set<string>>()
  private saving: Promise<boolean> | null = null

  constructor(host: Host) {
    this.host = host
  }

  /** The catalogue the gate validates with (the page reads it with every compile). */
  setCatalogue(cat: Catalogue | null): void {
    this.cat = cat
    this.problems = new WeakMap()
  }

  /**
   * Takes a file's text as read from disk, as the copy. The history goes (its copies predate the text: an undo then a
   * save would overwrite it); a new file drops the selection too; a press in progress ends.
   */
  load(file: string, text: string): void {
    if (file !== this.file) this.selected = null
    this.mode = { kind: 'idle' }
    this.history.clear()
    this.hover = null
    this.file = file
    this.base = text
    this.writer = writerFrom(text)
    this.conflict = null
    this.doc = parseDoc(text)
    this.baseDoc = this.doc
    if (this.selected && !this.feature(this.selected)) this.selected = null
    this.host.changed()
  }
  /**
   * The file changed on disk. The same text as the base is our own save (or the file back as we read it, which
   * settles a conflict); with no unsaved edits and no press it is read in; else it is a conflict, shown until it is
   * settled. Returns whether the copy changed (to recompile).
   */
  onDisk(text: string): boolean {
    if (text === this.base) {
      if (this.conflict !== null) {
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
    this.conflict = text
    this.message = 'the file changed on disk: keep your edits and overwrite it, or take the file'
    this.host.changed()
    return false
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
    return !!this.doc && !sameJson(this.doc, this.baseDoc)
  }
  get idle(): boolean {
    return this.mode.kind === 'idle'
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
  private replace(doc: MapFile, f: Feature): MapFile {
    return { ...doc, features: doc.features.map(x => (x.id === f.id ? f : x)) }
  }
  /** Whether a command may run now; says why not when it may not. */
  private ready(): boolean {
    if (this.mode.kind === 'idle') return true
    this.message = BUSY
    this.host.changed()
    return false
  }

  /** The validator's problems in a copy, as keys (remembered per copy). */
  private problemsOf(doc: MapFile): Set<string> {
    let p = this.problems.get(doc)
    if (!p) {
      p = new Set(this.cat ? validate(doc, this.cat).map(i => `${i.id}\u0000${i.path}\u0000${i.message}`) : [])
      this.problems.set(doc, p)
    }
    return p
  }
  /**
   * The gate: the first problem the validator finds in `after` that `before` did not have, or null when there is
   * none. With no catalogue (it failed to read), nothing can be checked: the edit passes, and the compile reports.
   */
  private refusal(before: MapFile, after: MapFile): string | null {
    if (!this.cat) return null
    const old = this.problemsOf(before)
    for (const key of this.problemsOf(after)) {
      if (!old.has(key)) {
        const [id, path, message] = key.split('\u0000')
        return `${id && id !== 'null' ? `[${id}] ` : ''}${path ? `${path}: ` : ''}${message}`
      }
    }
    return null
  }
  /** Makes an edit if the gate lets it: the copy before it goes into the history, and the copy is compiled. */
  private commit(doc: MapFile): boolean {
    const why = this.refusal(this.doc!, doc)
    if (why) {
      this.message = `not done: ${why}`
      this.host.changed()
      return false
    }
    this.history.push(this.doc!)
    this.hover = null // its indices may be the old shape's
    this.doc = doc
    this.message = ''
    this.host.recompile()
    this.host.changed()
    return true
  }

  /** A click: on a handle of the selection it keeps the selection; elsewhere it selects what is under it (or none). */
  click(sx: number, sy: number): void {
    if (!this.doc || this.mode.kind !== 'idle') return
    const f = this.selected ? this.feature(this.selected) : undefined
    if (f && handleAt(f, sx, sy, this.host.project)) return
    const ids = new Set(this.doc.features.map(x => x.id))
    this.select(pick(this.host.shown(), ids, sx, sy, this.host.toWorld(sx, sy), this.host.project))
  }
  select(id: string | null): void {
    if (this.mode.kind !== 'idle') return
    const next = id && this.feature(id) ? id : null
    if (next !== this.selected) this.hover = null
    this.selected = next
    this.host.changed()
    this.host.redraw()
  }

  /** A press: on one of the selection's handles, or on the selected shape, it is the editor's. Returns whether. */
  down(sx: number, sy: number): boolean {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !movable(f) || this.mode.kind !== 'idle') return false
    const handle = handleAt(f, sx, sy, this.host.project)
    if (!handle) {
      const on = pick([f], new Set([f.id]), sx, sy, this.host.toWorld(sx, sy), this.host.project)
      if (on !== f.id) return false
    }
    this.mode = {
      kind: 'pressing',
      handle,
      before: this.doc,
      f0: f,
      from: this.host.toWorld(sx, sy),
      at: [sx, sy],
    }
    return true
  }
  /** The pointer moved: a press past DRAG_PX drags; else the handle under it is noted. Returns whether it drags. */
  move(sx: number, sy: number): boolean {
    const m = this.mode
    if (m.kind === 'idle') {
      const f = this.selected ? this.feature(this.selected) : undefined
      const hover = f && this.enabled ? handleAt(f, sx, sy, this.host.project) : null
      if (JSON.stringify(hover) !== JSON.stringify(this.hover)) this.host.redraw()
      this.hover = hover
      return false
    }
    if (m.kind === 'pressing' && Math.hypot(sx - m.at[0], sy - m.at[1]) < DRAG_PX) return true
    m.kind = 'dragging'
    const at = this.host.toWorld(sx, sy)
    const place = this.place(m.f0)
    const f = m.handle
      ? moveHandle(m.f0, m.handle, at, place)
      : moveShape(m.f0, at[0] - m.from[0], at[1] - m.from[1], place)
    // the drag shows only shapes the gate lets through: a refused one leaves the last good one
    const next = this.replace(m.before, f)
    const why = this.refusal(m.before, next)
    if (why) this.message = `not there: ${why}`
    else {
      this.doc = next
      this.message = ''
    }
    this.host.changed()
    this.host.redraw()
    return true
  }
  /** The press ended: a drag that changed the copy is an edit. Returns whether the press was the editor's. */
  up(): boolean {
    const m = this.mode
    if (m.kind === 'idle') return false
    this.mode = { kind: 'idle' }
    const after = this.doc!
    this.doc = m.before
    // a press that did not move, or moved less than the rounding, changes nothing and leaves no step in the history
    if (m.kind === 'dragging' && !sameJson(after.features, m.before.features)) this.commit(after)
    else this.host.redraw()
    return true
  }
  /** An interrupted press (the pointer cancelled, its capture lost): the copy goes back to before it. */
  cancel(): void {
    const m = this.mode
    if (m.kind === 'idle') return
    this.mode = { kind: 'idle' }
    this.doc = m.before
    this.host.redraw()
  }
  /** A double click on the selected line or ring adds a point there. */
  dblclick(sx: number, sy: number): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !this.ready()) return
    const g = insertPoint(f, sx, sy, this.host.toWorld(sx, sy), this.host.project, this.place(f))
    if (g) this.commit(this.replace(this.doc, g))
  }
  /** Delete: the line's or the ring's point under the pointer, or else the selected feature. */
  remove(): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !this.ready()) return
    const h = this.hover
    if (h && (h.kind === 'line' || h.kind === 'ring')) {
      const g = removePoint(f, h)
      if (g) this.commit(this.replace(this.doc, g))
      else {
        this.message = 'that point stays: a line keeps 2 points, a ring 3'
        this.host.changed()
      }
      return
    }
    // the feature itself: not gated (what it breaks shows in place; undo brings it back)
    this.history.push(this.doc)
    this.hover = null
    this.selected = null
    this.doc = { ...this.doc, features: this.doc.features.filter(x => x.id !== f.id) }
    this.message = ''
    this.host.recompile()
    this.host.changed()
  }
  undo(): void {
    if (!this.doc || !this.ready()) return
    const d = this.history.undo(this.doc)
    if (d) this.restore(d)
  }
  redo(): void {
    if (!this.doc || !this.ready()) return
    const d = this.history.redo(this.doc)
    if (d) this.restore(d)
  }
  private restore(d: MapFile): void {
    this.hover = null
    this.doc = d
    if (this.selected && !this.feature(this.selected)) this.selected = null
    this.host.recompile()
    this.host.changed()
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
      // the file on disk becomes the base; a file that is no map is written afresh
      this.base = this.conflict
      this.baseDoc = parseDoc(this.conflict)
      this.conflict = null
    }
    if (!this.dirty && this.text === this.base) return true
    // what this save is for: its reply counts only if the editor still holds that file and base
    const sent = { file: this.file, base: this.base, doc: this.doc, text: this.text }
    let status = 0
    let r: { ok: boolean; current?: string; error?: string }
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
    }
    if (this.file !== sent.file || this.base !== sent.base) return r.ok // the editor moved on: not ours to apply
    if (r.ok) {
      this.base = sent.text
      this.baseDoc = sent.doc
      this.conflict = null
      this.message = 'saved'
    } else if (status === 409 && typeof r.current === 'string') {
      this.conflict = r.current
      this.message = 'the file changed on disk: keep your edits and overwrite it, or take the file'
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

  /** Draws the selection: its intent shape and its handles. */
  draw(): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!f) return
    const { ctx } = this.host
    ctx.save()
    ctx.strokeStyle = SELECTED
    ctx.lineWidth = 2
    const path = (pts: Pt[], close: boolean) => {
      this.host.groundPath(pts, close)
      ctx.stroke()
    }
    if (f.line) path(f.line, false)
    f.area?.forEach(r => path(r, true))
    if (f.circle) path(ovalRing(f.circle[0], f.circle[1], f.circle[1], 0), true)
    if (f.ellipse) path(ovalRing(...f.ellipse), true)
    const barrier = isBarrier(f, this.doc?.presets)
    for (const { handle, at } of handles(f)) {
      const s = this.host.project(at[0], at[1])
      if (!s) continue
      const big = this.hover && JSON.stringify(this.hover) === JSON.stringify(handle)
      const r = big ? 5 : 3.5
      ctx.fillStyle = barrier ? '#f0e0c0' : '#fff'
      ctx.fillRect(s[0] - r, s[1] - r, 2 * r, 2 * r)
      ctx.lineWidth = 1.5
      ctx.strokeRect(s[0] - r, s[1] - r, 2 * r, 2 * r)
    }
    ctx.restore()
  }
}
