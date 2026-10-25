/// <reference types="vite/client" />
// The map editor on the map page (docs/plans/active/m7-editor.md M7a, decision 0066): the map's intent, read from its
// file, edited in the page's memory and compiled live from there; a click selects, a drag moves a handle or the
// selected shape, undo and redo, and the save through the dev server (tools/map-save.ts) with only what changed
// rewritten (src/map/write.ts). The edits themselves are pure (./edit.ts). The built page has no server to save
// through, so it selects but does not edit.
import type { Feature, MapFile, Pt } from '../../map/schema.ts'
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

const DRAG_PX = 4 // a press that moves less is a click
const SNAP_PX = 14 // a barrier's point snaps to a valid place within this many pixels
const SELECTED = '#d0601a'

export class Editor {
  /** Whether the page edits (the dev server saves); the built page only selects. */
  readonly enabled = import.meta.env.DEV
  file: string | null = null
  /** The file's text as last read or saved: the save's base. */
  base: string | null = null
  /** Writes a changed feature: in the file's bytes as last read from disk, when an undo brought it back. */
  private writer: FeatureWriter = writerFrom(null)
  /** Goes up whenever the copy is replaced other than by a drag (a load, an edit, undo, redo): a drag begun before is
   * dropped. */
  private generation = 0
  /** The map's intent as edited, or null when the file is not valid JSON. */
  doc: MapFile | null = null
  selected: string | null = null
  /** The file's text on disk when a save was refused (it changed since it was read), else null. */
  conflict: string | null = null
  message = ''
  private history = new History<MapFile>()
  private drag: {
    handle: Handle | null
    before: MapFile
    f0: Feature
    from: Pt
    at: [number, number] // the press, on screen
    moved: boolean // past DRAG_PX: a drag, not a click
    generation: number
  } | null = null
  private hover: Handle | null = null
  private cache: { doc: MapFile; base: string | null; text: string } | null = null

  private host: Host
  constructor(host: Host) {
    this.host = host
  }

  /**
   * Takes a file's text as read from disk. The history goes (its copies predate the text: an undo then a save would
   * overwrite it); a new file drops the selection too.
   */
  load(file: string, text: string): void {
    if (file !== this.file) this.selected = null
    this.history.clear()
    this.hover = null
    this.drag = null
    this.generation++
    this.file = file
    this.base = text
    this.writer = writerFrom(text)
    this.conflict = null
    this.doc = parseDoc(text)
    if (this.selected && !this.feature(this.selected)) this.selected = null
    this.host.changed()
  }
  /**
   * The file changed on disk: the same text as ours is our own save; with no unsaved edits it is read in; with
   * unsaved edits it is a conflict, shown until it is settled. Returns whether the copy changed (to recompile).
   */
  onDisk(text: string): boolean {
    if (text === this.base) {
      // our own save; or the file back as we read it, which settles a conflict
      if (this.conflict !== null) {
        this.conflict = null
        this.message = ''
        this.host.changed()
      }
      return false
    }
    if (!this.dirty) {
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
    const c = this.cache
    if (c && c.doc === this.doc && c.base === this.base) return c.text
    const text = writeMap(this.base, this.doc, this.writer)
    this.cache = { doc: this.doc, base: this.base, text }
    return text
  }
  /** Whether the copy differs from the file as last read or saved. */
  get dirty(): boolean {
    return !!this.doc && this.text !== this.base
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
  private place(): Place {
    const ppm = this.host.ppm()
    return { step: roundStep(ppm), reach: SNAP_PX / ppm }
  }
  private replace(doc: MapFile, f: Feature): MapFile {
    return { ...doc, features: doc.features.map(x => (x.id === f.id ? f : x)) }
  }
  /** Makes an edit: the copy before it goes into the history, and the copy is compiled. */
  private commit(doc: MapFile): void {
    this.history.push(this.doc!)
    this.hover = null // its indices may be the old shape's
    this.generation++
    this.doc = doc
    this.host.recompile()
    this.host.changed()
  }

  /** Selects the feature under a click (or none). */
  click(sx: number, sy: number): void {
    if (!this.doc) return
    const ids = new Set(this.doc.features.map(f => f.id))
    this.selected = pick(this.host.shown(), ids, sx, sy, this.host.toWorld(sx, sy), this.host.project)
    this.hover = null
    this.host.changed()
    this.host.redraw()
  }
  select(id: string | null): void {
    this.selected = id && this.feature(id) ? id : null
    this.hover = null
    this.host.changed()
    this.host.redraw()
  }

  /** A press: on one of the selection's handles, or on the selected shape, starts a drag. Returns whether it did. */
  down(sx: number, sy: number): boolean {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f || !movable(f)) return false
    const handle = handleAt(f, sx, sy, this.host.project)
    if (!handle) {
      const ids = new Set(this.doc.features.map(x => x.id))
      const on = pick([f], ids, sx, sy, this.host.toWorld(sx, sy), this.host.project)
      if (on !== f.id) return false
    }
    this.drag = {
      handle,
      before: this.doc,
      f0: f,
      from: this.host.toWorld(sx, sy),
      at: [sx, sy],
      moved: false,
      generation: this.generation,
    }
    return true
  }
  /** The pointer moved: drags, or notes the handle under it. Returns whether it is dragging. */
  move(sx: number, sy: number): boolean {
    const d = this.drag
    if (!d) {
      const f = this.selected ? this.feature(this.selected) : undefined
      const hover = f && this.enabled ? handleAt(f, sx, sy, this.host.project) : null
      if (JSON.stringify(hover) !== JSON.stringify(this.hover)) this.host.redraw()
      this.hover = hover
      return false
    }
    if (d.generation !== this.generation) {
      this.drag = null // the copy was replaced under the drag (the file read in, an undo): it is not ours to move
      return false
    }
    // a press that has not gone past DRAG_PX is still a click: nothing moves
    if (!d.moved && Math.hypot(sx - d.at[0], sy - d.at[1]) < DRAG_PX) return true
    const at = this.host.toWorld(sx, sy)
    const f = d.handle
      ? moveHandle(d.f0, d.handle, at, this.place())
      : moveShape(d.f0, at[0] - d.from[0], at[1] - d.from[1], this.place())
    this.doc = this.replace(d.before, f)
    d.moved = true
    this.host.redraw()
    return true
  }
  /** The press ended: a drag that changed the shape is an edit. Returns whether it was dragging. */
  up(): boolean {
    const d = this.drag
    this.drag = null
    if (!d) return false
    if (d.generation !== this.generation) return true // replaced under the drag: the new copy stays
    const after = this.doc!
    this.doc = d.before
    // a press that did not move, or moved less than the rounding, changes nothing and leaves no step in the history
    if (d.moved && !sameJson(after.features, d.before.features)) this.commit(after)
    return true
  }
  /** An interrupted press (the pointer cancelled, its capture lost): the copy goes back to before the drag. */
  cancel(): void {
    const d = this.drag
    this.drag = null
    if (d && d.generation === this.generation) {
      this.doc = d.before
      this.host.redraw()
    }
  }
  /** A double click on the selected line or ring adds a point there. */
  dblclick(sx: number, sy: number): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f) return
    const g = insertPoint(f, sx, sy, this.host.toWorld(sx, sy), this.host.project, this.place())
    if (g) this.commit(this.replace(this.doc, g))
  }
  /** Delete: the line's or the ring's point under the pointer, or else the selected feature. */
  remove(): void {
    const f = this.selected ? this.feature(this.selected) : undefined
    if (!this.enabled || !this.doc || !f) return
    const h = this.hover
    if (h && (h.kind === 'line' || h.kind === 'ring')) {
      const g = removePoint(f, h)
      this.hover = null
      if (g) this.commit(this.replace(this.doc, g))
      else {
        this.message = isBarrier(f)
          ? 'that point stays: the barrier would be too short, or leave the 8 directions'
          : 'that point stays: a line keeps 2 points, a ring 3'
        this.host.changed()
      }
      return
    }
    this.hover = null
    this.selected = null
    this.commit({ ...this.doc, features: this.doc.features.filter(x => x.id !== f.id) })
  }
  undo(): void {
    const d = this.doc && this.history.undo(this.doc)
    if (!d) return
    this.hover = null
    this.generation++
    this.doc = d
    this.host.recompile()
    this.host.changed()
  }
  redo(): void {
    const d = this.doc && this.history.redo(this.doc)
    if (!d) return
    this.hover = null
    this.generation++
    this.doc = d
    this.host.recompile()
    this.host.changed()
  }

  /**
   * Saves the copy through the dev server, over the text it was read from; refused (and kept) if the file changed on
   * disk since. With `overwrite`, a refused save's file is taken as the base and overwritten.
   */
  async save(overwrite = false): Promise<boolean> {
    // one save at a time: a second sent before the first replied would carry the old base, and be refused
    while (this.saving) await this.saving
    this.saving = this.write(overwrite)
    try {
      return await this.saving
    } finally {
      this.saving = null
    }
  }
  private saving: Promise<boolean> | null = null
  private async write(overwrite: boolean): Promise<boolean> {
    if (!this.enabled || !this.doc || !this.file) return false
    if (overwrite && this.conflict !== null) {
      this.base = this.conflict
      this.conflict = null
    }
    if (!this.dirty) return true
    const text = this.text
    let res: Response
    let r: { ok: boolean; current?: string; error?: string }
    try {
      res = await fetch('/__map/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: this.file, base: this.base, text }),
      })
      r = (await res.json()) as typeof r
    } catch (e) {
      this.message = `not saved: ${(e as Error).message} (is the dev server running?)`
      this.host.changed()
      return false
    }
    if (r.ok) {
      this.base = text
      this.conflict = null
      this.message = 'saved'
    } else if (res.status === 409 && typeof r.current === 'string') {
      this.conflict = r.current
      this.message = 'the file changed on disk: keep your edits and overwrite it, or take the file'
    } else this.message = `not saved: ${r.error ?? res.status}`
    this.host.changed()
    return r.ok
  }
  /** Settles a conflict by taking the file on disk: the edits and their history are dropped. */
  takeDisk(): void {
    if (this.conflict === null) return
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
    for (const { handle, at } of handles(f)) {
      const s = this.host.project(at[0], at[1])
      if (!s) continue
      const big = this.hover && JSON.stringify(this.hover) === JSON.stringify(handle)
      const r = big ? 5 : 3.5
      ctx.fillStyle = isBarrier(f) ? '#f0e0c0' : '#fff'
      ctx.fillRect(s[0] - r, s[1] - r, 2 * r, 2 * r)
      ctx.lineWidth = 1.5
      ctx.strokeRect(s[0] - r, s[1] - r, 2 * r, 2 * r)
    }
    ctx.restore()
  }
}
