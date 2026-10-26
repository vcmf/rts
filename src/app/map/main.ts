/// <reference types="vite/client" />
// The map page (docs/proposals/map-engine.md §7, docs/plans/done/m1-language.md M1b): a map from maps/ compiled
// in a worker and drawn in the lit view, with pan and zoom, feature outlines and ids, a readout of the cell under the
// mouse, and the validator's errors. Saving the map file (or maps/kinds.json) recompiles and redraws; the last good
// drawing stays up while a file is broken. The editor (./editor.ts, M7) edits the map in the page and saves it.
// window.MAP exposes the state for headless checks.
import type { Catalogue, Feature, MapFile, Pt, ShapeName } from '../../map/schema.ts'
import { ID, REFS, SEASONS } from '../../map/schema.ts'
import { kindMetaOf } from '../../map/catalogue.ts'
import type { Issue } from '../../map/catalogue.ts'
import type { Compiled, CompileReply, CompileRequest, LayerName, OverlayReply, OverlayRequest } from './protocol.ts'
import type { OverlaySpec } from '../../render/lit/overlays.ts'
import { demFileNames } from '../../map/dem.ts'
import { LitView, TILT } from '../../render/lit/view.ts'
import { standing } from '../../render/lit/houses.ts'
import { lineLength, pointAt } from '../../map/geometry.ts'
import { Editor } from './editor.ts'
import { ovalRing } from './edit.ts'
import { newestOnly } from './latest.ts'
import { proposeId } from './draw.ts'
import { Form } from './form.ts'

// the maps and the catalogue, bundled for the built page; in dev they are fetched fresh on every save
const MAPS = import.meta.glob('/maps/*.map.json', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>
const KINDS = import.meta.glob('/maps/kinds.json', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>
// the heightfields beside them (docs/plans/done/m5-relief.md), as URLs: fetched only when a map's source names one
const RDEMS = import.meta.glob('/maps/*.rdem', { query: '?url', import: 'default' }) as Record<
  string,
  () => Promise<string>
>
// The heightfields a map's dem sources name, read beside it. A file's version goes up when it is saved; the worker
// keeps the bytes of the version it was last sent, so only a new version is fetched and sent. A file that is missing
// or fails to load is left out, and the validator reports it against its source.
const fileVersion = new Map<string, number>()
const RDEM_SETTLE = 300 // ms after a heightfield's last save before it is read
let rdemTimer: ReturnType<typeof setTimeout> | undefined
let sentVersion = new Map<string, number>()
async function readFiles(mapText: string): Promise<CompileRequest['files']> {
  let names: string[]
  try {
    names = demFileNames(JSON.parse(mapText))
  } catch {
    return {}
  }
  const out: CompileRequest['files'] = {}
  await Promise.all(
    names.map(async name => {
      const version = fileVersion.get(name) ?? 0
      if (sentVersion.get(name) === version) {
        out[name] = { version }
        return
      }
      try {
        const key = `/maps/${name}`
        const url = import.meta.env.DEV ? key : await RDEMS[key]?.()
        if (!url) return
        const res = await fetch(url, { cache: import.meta.env.DEV ? 'no-store' : 'default' })
        if (res.ok) out[name] = { version, bytes: await res.arrayBuffer() }
      } catch {
        // left out: reported as not found
      }
    }),
  )
  return out
}
async function read(file: string, bundled: Record<string, () => Promise<string>>): Promise<string> {
  if (!import.meta.env.DEV) return bundled[file]()
  const res = await fetch(file, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${file}: ${res.status} ${res.statusText}`)
  return res.text()
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = $<HTMLCanvasElement>('map')
const ctx = canvas.getContext('2d')!
const picker = $<HTMLSelectElement>('picker')
const status = $('status')
const errors = $('errors')
const readout = $('readout')
const showOutlines = $<HTMLInputElement>('outlines')
const showIds = $<HTMLInputElement>('ids')
const overlaySelect = $<HTMLSelectElement>('overlay')
const overlayHint = $('overlayHint')
const mode = $<HTMLSelectElement>('mode')
const editState = $('editState')
const formBox = $('form')
const saveButton = $<HTMLButtonElement>('save')
const undoButton = $<HTMLButtonElement>('undo')
const redoButton = $<HTMLButtonElement>('redo')
const conflictBox = $('conflict')
const conflictWhy = $('conflictWhy')
const addKind = $<HTMLSelectElement>('addKind')
const addShape = $<HTMLSelectElement>('addShape')
const addId = $<HTMLInputElement>('addId')
const drawPrompt = $('drawPrompt')
const refsBox = $('refs')
// the lit map view under the overlays (docs/plans/active/m6-lit-view.md); ?tilt= degrees off straight down
// the lit view needs WebGL2 (decision 0046): without it the page still compiles, lists errors and reads cells
let lit: LitView | null = null
let litError = ''
try {
  lit = new LitView($<HTMLCanvasElement>('lit'))
} catch (e) {
  litError = (e as Error).message
}
const tiltParam = Number(new URLSearchParams(location.search).get('tilt'))
const tilt = Number.isFinite(tiltParam) && new URLSearchParams(location.search).has('tilt') ? tiltParam : TILT

const names = Object.keys(MAPS).sort()
/** The picker's entry for a map file, named by its id. */
const mapOption = (file: string) => new Option(file.replace('/maps/', '').replace('.map.json', ''), file)
for (const n of names) picker.append(mapOption(n))
const asked = new URLSearchParams(location.search).get('map')
picker.value =
  names.find(n => n.endsWith(`/${asked}.map.json`)) ?? names.find(n => n.includes('two-ridges')) ?? names[0]

// the view: world point at the canvas centre, and pixels per metre; kept across reloads of the same map
let view = { cx: 0, cz: 0, ppm: 0 }
let current: Compiled | null = null
let issues: Issue[] = []
let layers: Partial<Record<LayerName, Uint16Array>> = {}
let height = new Float64Array(0)
let depth = new Uint16Array(0)
const log: { reason: string; savedAt?: number; drawnAt: number; ms: number }[] = []
let frameMs = 0 // the last frame's CPU time in the lit view
let readyWait: Promise<void> | null = null
// one draw a displayed frame, however many pointer and wheel events arrive in it
let queued = false
function redraw(): void {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    draw()
  })
}

let seq = 0
let pending: { reason: string; t0: number; savedAt?: number } | null = null
// a compile that ends without a drawing (a read failed, the worker died): its error shows, the last drawing stays
function failed(message: string): void {
  issues = [{ id: null, path: '', message }]
  if (pending) {
    log.push({
      reason: pending.reason,
      savedAt: pending.savedAt,
      drawnAt: Date.now(),
      ms: performance.now() - pending.t0,
    })
  }
  pending = null
  draw()
  panel()
}
// the worker catches the compiler's errors itself; an error here means the worker is broken (it failed to load, or
// threw outside a compile), so it is replaced and whatever it held is lost
let worker = makeWorker()
function makeWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = onReply
  w.onerror = e => {
    e.preventDefault()
    w.terminate()
    sentVersion = new Map() // the new worker holds no file
    worker = makeWorker()
    failed(`the compile worker failed: ${e.message || 'it did not load'}`)
  }
  return w
}
function onReply(e: MessageEvent<CompileReply | OverlayReply>): void {
  if ('type' in e.data && e.data.type === 'overlay') {
    onOverlay(e.data)
    return
  }
  const r = e.data as CompileReply
  if (r.seq !== seq || !pending) return // an older compile, overtaken
  if (!r.ok && r.missing?.length) {
    // the worker lacks files it was counted as holding: send them again
    for (const name of r.missing) sentVersion.delete(name)
    void compile(pending.reason, pending.savedAt)
    return
  }
  if (r.ok) {
    const fresh = !current || current.map.id !== r.map.id
    issues = []
    layers = Object.fromEntries(Object.entries(r.layers).map(([k, b]) => [k, new Uint16Array(b)]))
    height = new Float64Array(r.height)
    depth = new Uint16Array(r.depth)
    lit?.setMap({
      x0: r.x0,
      z0: r.z0,
      cell: r.cell,
      nx: r.nx,
      nz: r.nz,
      datum: r.map.datum ?? 0,
      season: r.map.season,
      light: r.light,
      height,
      relief: new Uint8Array(r.relief),
      masks: new Uint8Array(r.masks),
      ink: new Uint8Array(r.ink),
      flat: { w: r.w, h: r.h, rgba: new Uint8Array(r.rgba) },
    })
    fillOverlays(r.units)
    requestOverlay()
    lit?.setHouses(standing(r.map.features, r.table, new Uint16Array(r.layers.built), r))
    labels = namesOf(r)
    // the bakes live on the GPU now: the page keeps only what it reads (36 MB each at 6 km)
    current = {
      ...r,
      relief: new ArrayBuffer(0),
      masks: new ArrayBuffer(0),
      ink: new ArrayBuffer(0),
      rgba: new ArrayBuffer(0),
    }
    // the first frame after a new map may come before its shader compiles: draw again once it is ready (one wait at
    // a time; a shader that never compiles is reported)
    if (lit && !readyWait) {
      readyWait = lit
        .ready()
        .then(draw, (e: Error) => {
          litError = e.message
          panel()
        })
        .finally(() => {
          readyWait = null
        })
    }
    if (fresh || !view.ppm) fit()
  } else issues = r.issues
  const now = performance.now()
  log.push({ reason: pending.reason, savedAt: pending.savedAt, drawnAt: Date.now(), ms: now - pending.t0 })
  pending = null
  draw()
  panel()
}

let editorKinds: string | null = null // the catalogue's text the editor validates with
let catalogue: Catalogue | null = null // and as read (the add box's kinds)
// each compile takes its number before it reads the files, so a slower, older read can never replace a newer one
async function compile(reason: string, savedAt?: number): Promise<void> {
  const mine = ++seq
  const t0 = performance.now()
  pending = { reason, t0, savedAt }
  let mapText: string
  let kindsText: string
  let files: CompileRequest['files']
  try {
    // the editor's copy of the map when it holds one, else the file, read into the editor
    const file = picker.value
    const own = editor.file === file && editor.doc
    ;[mapText, kindsText] = await Promise.all([own ? editor.text : read(file, MAPS), read('/maps/kinds.json', KINDS)])
    if (mine === seq) {
      if (!own) editor.load(file, mapText)
      // the catalogue the editor validates its copy with, when it changed (the newest compile's alone)
      if (kindsText !== editorKinds) {
        editorKinds = kindsText
        try {
          catalogue = JSON.parse(kindsText) as Catalogue
        } catch {
          catalogue = null
        }
        editor.setCatalogue(catalogue)
        kindList()
      }
    }
    files = await readFiles(mapText)
  } catch (err) {
    if (mine === seq) failed(`cannot read the map: ${(err as Error).message}`)
    return
  }
  if (mine !== seq) return
  for (const [name, f] of Object.entries(files)) if (f.bytes) sentVersion.set(name, f.version)
  worker.postMessage(
    { seq: mine, mapText, kindsText, files } satisfies CompileRequest,
    Object.values(files).flatMap(f => (f.bytes ? [f.bytes] : [])),
  )
}

function fit(): void {
  if (!current) return
  const r = canvas.getBoundingClientRect()
  const w = current.nx * current.cell
  const h = current.nz * current.cell
  view = { cx: 0, cz: 0, ppm: Math.min(r.width / w, r.height / h) * 0.95 }
}
// the camera follows the view; every point drawn or picked goes through it
const place = () => lit?.setCamera({ ...view, tilt })
// without the lit view (no WebGL2), straight down and flat, as the page drew before it
const flatScreen = (x: number, z: number): [number, number] => {
  const r = canvas.getBoundingClientRect()
  return [r.width / 2 + (x - view.cx) * view.ppm, r.height / 2 - (z - view.cz) * view.ppm]
}
const flatWorld = (sx: number, sy: number): Pt => {
  const r = canvas.getBoundingClientRect()
  return [view.cx + (sx - r.width / 2) / view.ppm, view.cz - (sy - r.height / 2) / view.ppm]
}
const toScreen = (x: number, z: number): [number, number] | null => (lit ? lit.project(x, z) : flatScreen(x, z))
/**
 * Adds a polyline (or a ring) of ground points to the 2D path, clipped where it passes behind the tilted camera: the
 * part of a segment too near the camera's plane is left out, never drawn mirrored (LitView.depth).
 */
function groundPath(pts: Pt[], close: boolean): void {
  ctx.beginPath()
  if (!lit) {
    pts.forEach((p, k) => {
      const [x, y] = flatScreen(p[0], p[1])
      if (k) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    if (close) ctx.closePath()
    return
  }
  const L = lit
  const room = (p: Pt) => L.depth(p[0], p[1]) // above 0: far enough in front to draw
  const along = (q: Pt, p: Pt, t: number): Pt => [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]
  let pen = false
  const to = (p: Pt) => {
    const s = L.project(p[0], p[1])
    if (!s) return
    if (pen) ctx.lineTo(s[0], s[1])
    else ctx.moveTo(s[0], s[1])
    pen = true
  }
  const seq = close ? [...pts, pts[0]] : pts
  for (let k = 0; k < seq.length; k++) {
    const p = seq[k]
    const rp = room(p)
    if (k > 0) {
      const q = seq[k - 1]
      const rq = room(q)
      if (rq > 0 !== rp > 0) {
        // where the segment meets the near limit (the depth is linear along it), a hair on the drawable side
        const t = rq / (rq - rp)
        to(along(q, p, rp > 0 ? t + 1e-6 : t - 1e-6))
        if (rp <= 0) pen = false
      }
    }
    if (rp > 0) to(p)
  }
}
const toWorld = (sx: number, sy: number): Pt =>
  lit ? (lit.unproject(sx, sy) ?? [view.cx, view.cz]) : flatWorld(sx, sy)

// the editor (M7): it compiles its copy of the map through the page, and draws its selection over the outlines
const addGo = $<HTMLButtonElement>('addGo')
/** A map with no file on disk (new, or deleted under the page) has nothing to come back to: its entry goes with it. */
const dropUnsavedNew = () => {
  if (editor.noFile) [...picker.options].find(o => o.value === editor.file)?.remove()
}
const editor = new Editor({
  ctx,
  project: (x, z) => toScreen(x, z),
  // where the view shows no ground (a ray off the tilted plane), none: the editor neither picks nor moves there
  toWorld: (sx, sy) => (lit ? lit.unproject(sx, sy) : flatWorld(sx, sy)),
  ppm: () => view.ppm,
  shown: () => current?.map.features ?? [],
  groundPath,
  recompile: () => void compile('edit'),
  // what the validator finds in the edited copy, listed and outlined at once; the compile's list replaces it
  problems: found => {
    issues = found
    panel()
  },
  redraw,
  changed: () => editPanel(),
})
// the selection's fields, or the map's (M7c); a new map's id moves it to the file of that name
const form = new Form(formBox, editor)
form.onMapId = id => {
  const file = `/maps/${id}.map.json`
  const why = !ID.test(id)
    ? 'its id names its file: lower-case letters and digits, in words joined by "-"'
    : [...picker.options].some(o => o.value === file)
      ? `a map ${id} exists`
      : ''
  if (why) return editor.note(`the id stays: ${why}`)
  // the list first: the editor's recompile reads the map the list shows (its copy, under its new file)
  const was = editor.file!
  const option = [...picker.options].find(o => o.value === was)
  const moved = mapOption(file)
  option?.replaceWith(moved)
  picker.value = file
  if (!editor.renameMap(file, id)) {
    moved.replaceWith(option ?? mapOption(was))
    picker.value = was
    return
  }
  const q = new URLSearchParams(location.search)
  q.set('map', id)
  history.replaceState(null, '', `?${q}`)
}
/** The editor's part of the panel: the selection, unsaved edits, the save's state, a conflict with the disk. */
function editPanel(): void {
  const f = editor.selected ? editor.feature(editor.selected) : undefined
  form.update(catalogue)
  const dirty = editor.dirty
  editState.textContent = !editor.enabled
    ? 'editing needs the dev server (npm run dev)'
    : !editor.doc
      ? `read-only: ${editor.readOnly}; fix it by hand to edit`
      : `${dirty ? 'unsaved edits' : 'no unsaved edits'}${editor.message ? ` · ${editor.message}` : ''}`
  saveButton.disabled = !editor.enabled || !dirty
  undoButton.disabled = !editor.enabled || !editor.canUndo
  redoButton.disabled = !editor.enabled || !editor.canRedo
  conflictBox.hidden = editor.conflict === null
  conflictWhy.textContent = editor.conflictWhy
  drawPrompt.textContent = editor.prompt
  addGo.disabled = !editor.enabled || !editor.doc || editor.drawing
  // a new feature's id: the proposal follows the copy's ids (it is taken once the feature is made)
  if (!editor.drawing) proposeAddId()
  refButtons(f)
}
/** The add box's kinds, by category, from the catalogue. */
function kindList(): void {
  const was = addKind.value
  addKind.replaceChildren()
  const groups = new Map<string, HTMLOptGroupElement>()
  for (const k of Object.keys(catalogue?.kinds ?? {})) {
    const cat = k.split('.')[0]
    if (!groups.has(cat)) groups.set(cat, Object.assign(document.createElement('optgroup'), { label: cat }))
    groups.get(cat)!.append(new Option(k, k))
  }
  addKind.append(...groups.values())
  if (was && catalogue?.kinds[was]) addKind.value = was
  shapeList()
}
/** The shapes the kind picked takes ('none': drawn by its references alone). */
function shapeList(): void {
  const shapes = (catalogue && addKind.value && kindMetaOf(catalogue, addKind.value)?.shapes) || []
  const was = addShape.value
  addShape.replaceChildren(...shapes.map(sh => new Option(sh === 'none' ? 'by its references' : sh, sh)))
  if (shapes.includes(was as ShapeName)) addShape.value = was
  proposeAddId()
}
/** Proposes a new feature's id from the kind, unless the box holds one the author typed that is free. */
function proposeAddId(): void {
  if (addId.value !== '' && addId.value !== addId.dataset.proposed && !editor.feature(addId.value)) return
  const id = addKind.value ? proposeId(addKind.value, editor.doc?.features.map(f => f.id) ?? []) : ''
  addId.value = id
  addId.dataset.proposed = id
}
/**
 * The selection's references, each with a button to set it again by clicking its target; rebuilt only when what they
 * show changes (a button replaced under a press would lose its click).
 */
let refsShown = ''
function refButtons(f: Feature | undefined): void {
  const refs = (f && editor.metaOf(f)?.refs) || {}
  const shown = JSON.stringify([f?.id, REFS.map(r => (refs[r] ? (f![r] ?? null) : undefined)), editor.drawing])
  if (shown === refsShown) return
  refsShown = shown
  const buttons = REFS.filter(r => refs[r]).map(r => {
    const b = document.createElement('button')
    const v = f![r]
    b.textContent = `${r}: ${v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v)}`
    b.title = `click to set "${r}" again by clicking its target`
    b.disabled = !editor.enabled || editor.drawing
    b.addEventListener('click', () => editor.pickRef(r))
    return b
  })
  refsBox.replaceChildren(...buttons)
}

const CATEGORY_INK: Record<string, string> = {
  relief: '#7a5a2a',
  ground: '#4f6b2a',
  veg: '#1f4d1a',
  water: '#1d4f8a',
  way: '#8a5a20',
  barrier: '#2b2b2b',
  built: '#7a2a1a',
  work: '#5a3a1a',
  zone: '#a01818',
}
function outline(f: Feature, colour?: string, width = 1): void {
  const ink = colour ?? CATEGORY_INK[(f.kind ?? '').split('.')[0]] ?? '#333'
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = width
  const path = (pts: Pt[], close: boolean) => {
    groundPath(pts, close)
    ctx.stroke()
  }
  if (f.line) path(f.line, false)
  if (f.area) f.area.forEach(r => path(r, true))
  // a circle or an ellipse as a ring of points on the ground, so it leans with the view
  if (f.circle) path(ovalRing(f.circle[0], f.circle[1], f.circle[1], 0), true)
  if (f.ellipse) path(ovalRing(...f.ellipse), true)
  const at = anchor(f)
  const mark = (f.point || f.near) && toScreen(...(f.point ?? f.near!))
  if (mark) {
    ctx.beginPath()
    ctx.arc(mark[0], mark[1], 3, 0, 2 * Math.PI)
    ctx.fill()
  }
  const label = showIds.checked && at && toScreen(at[0], at[1])
  if (label) {
    ctx.font = '11px ui-monospace, Menlo, monospace'
    ctx.fillText(f.id, label[0] + 4, label[1] - 4)
  }
}

// The debug overlays (src/render/lit/overlays.ts), computed by the worker on the last compiled map: the setting's
// choices are the ruleset's unit kinds' passability, the water's depth, the slope, and sight from a clicked point
const SIGHT_RADIUS = 1500 // m
let sightAt: Pt | null = null
let overlaySeq = 0
let overlayMs = 0
let overlays = 0 // replies taken, and the cells the last one painted (for checks)
let overlayCells = 0
let overlayError = '' // the last overlay's failure, shown in the panel
/** Fills the overlay setting's choices: none, passability for each of the ruleset's unit kinds, depth, slope, sight. */
function fillOverlays(units: string[]): void {
  const keep = overlaySelect.value
  const options: [string, string][] = [
    ['', 'none'],
    ...units.map((u): [string, string] => [`pass:${u}`, `passable: ${u}`]),
    ['depth', 'water depth, as the sim takes it'],
    ['slope', 'slope'],
    ['sight', 'sight from a point'],
  ]
  overlaySelect.replaceChildren(...options.map(([v, t]) => new Option(t, v)))
  overlaySelect.value = options.some(([v]) => v === keep) ? keep : ''
}
/** The overlay the setting asks for (sight needs its eye: none until the map is clicked). */
function overlaySpec(): OverlaySpec | null {
  const v = overlaySelect.value
  if (v.startsWith('pass:')) return { kind: 'pass', unit: v.slice(5) }
  if (v === 'depth' || v === 'slope') return { kind: v }
  if (v === 'sight') return sightAt ? { kind: 'sight', x: sightAt[0], z: sightAt[1], radius: SIGHT_RADIUS } : null
  return null
}
/** Asks the worker for the setting's overlay, on the ground of the map the page shows. */
function requestOverlay(): void {
  overlayHint.hidden = !(overlaySelect.value === 'sight' && !sightAt)
  if (!current) return
  worker.postMessage({
    type: 'overlay',
    seq: ++overlaySeq,
    of: current.seq,
    spec: overlaySpec(),
  } satisfies OverlayRequest)
}
/** Shows the worker's overlay, if it is the last asked for and fits the map shown. */
function onOverlay(r: OverlayReply): void {
  if (r.seq !== overlaySeq) return // an older request, overtaken
  overlayMs = r.ms
  overlayError = r.error ?? ''
  panel()
  // an overlay made for another grid than the one shown (a compile that did not reach the page) is dropped
  const fits = current && r.rgba && r.rgba.byteLength === current.nx * current.nz * 4
  const rgba = fits ? new Uint8Array(r.rgba!) : null
  overlays++
  overlayCells = 0
  if (rgba) for (let c = 3; c < rgba.length; c += 4) if (rgba[c]) overlayCells++
  lit?.setOverlay(rgba)
  draw()
}

// the map's names, read once a compile (namesOf), drawn every frame
let labels: { at: Pt; text: string }[] = []
/** The map's names: each `zone.label`'s text at its anchor (its point, the middle of its line). */
function namesOf(c: Compiled): { at: Pt; text: string }[] {
  const byId = new Map(c.table.map(r => [r.id, r]))
  return c.map.features.flatMap(f => {
    const r = byId.get(f.id)
    if (!r || !r.kind.startsWith('zone.label') || typeof r.attrs.text !== 'string' || !r.attrs.text) return []
    // a line's name at the middle of its length, a point's at the point
    const mid = f.line && pointAt(f.line, lineLength(f.line) / 2)
    const at: Pt | null = mid ? [mid[0], mid[1]] : anchor(f)
    return at ? [{ at, text: r.attrs.text }] : []
  })
}
/** Writes the map's names on the overlay: italic, with a paper halo. */
function drawNames(): void {
  if (!current) return
  ctx.save() // its stroke and font stay its own
  ctx.font = 'italic 15px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  for (const { at, text } of labels) {
    const p = toScreen(at[0], at[1])
    if (!p) continue
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(236, 222, 186, 0.85)'
    ctx.strokeText(text, p[0], p[1])
    ctx.fillStyle = '#3a3128'
    ctx.fillText(text, p[0], p[1])
  }
  ctx.restore()
}

// where a feature's id is written: its point, the middle of its line, its area's first corner
function anchor(f: Feature): Pt | null {
  if (f.point) return f.point
  if (f.near) return f.near
  if (f.line) return f.line[Math.floor((f.line.length - 1) / 2)]
  if (f.area) return f.area[0][0]
  if (f.circle) return f.circle[0]
  if (f.ellipse) return f.ellipse[0]
  return null
}

function draw(): void {
  const r = canvas.getBoundingClientRect()
  const dpr = devicePixelRatio
  if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
    canvas.width = Math.round(r.width * dpr)
    canvas.height = Math.round(r.height * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, r.width, r.height)
  const tint = () => {
    if (!issues.length) return
    ctx.fillStyle = 'rgba(160, 20, 20, .08)'
    ctx.fillRect(0, 0, r.width, r.height)
  }
  if (!current) {
    // no map to show (another was picked): not the last map's picture under the new one's errors
    lit?.clear()
    tint()
    return
  }
  place()
  frameMs = lit?.render() ?? 0
  // the play area
  const p = current.map.play
  const corners: Pt[] = [
    [-p.w / 2, -p.h / 2],
    [p.w / 2, -p.h / 2],
    [p.w / 2, p.h / 2],
    [-p.w / 2, p.h / 2],
  ]
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = 'rgba(0,0,0,.45)'
  groundPath(corners, true)
  ctx.stroke()
  ctx.setLineDash([])
  if (lit && mode.value !== 'flat') drawNames()
  if (showOutlines.checked) for (const f of current.map.features) outline(f)
  // errors in place: the features the validator names, outlined in red over everything (the last good map's shapes)
  if (issues.length) {
    const wrong = new Set(issues.map(i => i.id).filter((id): id is string => !!id))
    for (const f of current.map.features) if (wrong.has(f.id)) outline(f, '#c0201a', 3)
  }
  editor.draw()
  editor.viewChanged() // after a fit, a resize or a look: the handle under the resting pointer
  // the sight overlay's eye
  if (overlaySelect.value === 'sight' && sightAt) {
    const p = toScreen(sightAt[0], sightAt[1])
    if (p) {
      ctx.beginPath()
      ctx.arc(p[0], p[1], 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#c0201a'
      ctx.fill()
    }
  }
  tint()
}

function panel(): void {
  const c = current
  status.textContent =
    (litError ? `${litError}: only the panel works. ` : '') +
    (c
      ? `${c.map.name}: ${c.map.features.length} features, ${c.nx}×${c.nz} cells of ${c.cell} m · validate ${c.ms.validate.toFixed(0)} ms, apply ${c.ms.apply.toFixed(0)} ms, draw ${c.ms.draw.toFixed(0)} ms, bake ${c.ms.bake.toFixed(0)} ms, ground ${c.ms.ground.toFixed(0)} ms${overlayError ? ` · ${overlayError}` : ''}`
      : 'compiling…')
  errors.replaceChildren(
    ...issues.map(i => {
      const li = document.createElement('li')
      li.textContent = `${i.id ? `[${i.id}] ` : ''}${i.path || '(map)'}: ${i.message}`
      // a feature the last good map has: a click takes the view to it
      const f = i.id ? current?.map.features.find(x => x.id === i.id) : undefined
      const at = f && anchor(f)
      if (at) {
        li.className = 'at'
        li.onclick = () => {
          view.cx = at[0]
          view.cz = at[1]
          view.ppm = Math.max(view.ppm, 2)
          draw()
        }
      }
      return li
    }),
  )
  errors.parentElement!.hidden = !issues.length
}

function hover(sx: number, sy: number): void {
  if (!current) return
  const [x, z] = toWorld(sx, sy)
  const c = current
  const i = Math.floor((x - c.x0) / c.cell)
  const j = Math.floor((z - c.z0) / c.cell)
  if (i < 0 || j < 0 || i >= c.nx || j >= c.nz) {
    readout.textContent = ''
    return
  }
  const W = c.nx + 1
  const h = (height[j * W + i] + height[j * W + i + 1] + height[(j + 1) * W + i] + height[(j + 1) * W + i + 1]) / 4
  const rows = [`x ${x.toFixed(1)}  z ${z.toFixed(1)}  cell ${i},${j}`, `height ${h.toFixed(2)} m`]
  if (depth[j * c.nx + i]) rows.push(`water ${(depth[j * c.nx + i] / 1000).toFixed(2)} m deep`)
  for (const n of Object.keys(layers) as LayerName[]) {
    const k = layers[n]![j * c.nx + i]
    if (k) {
      const t = c.table[k - 1]
      rows.push(`${n.padEnd(8)}${t.id} (${t.kind})`)
    }
  }
  readout.textContent = rows.join('\n')
}

// pan with the mouse, zoom with the wheel about the cursor
// a drag keeps the ground point it started on under the pointer
// a press on the selection's handle or shape drags it (the editor), anywhere else pans
// one press at a time: a second pointer (another finger) is ignored until the first is up
let drag: { at: Pt; sx: number; sy: number; edit: boolean; id: number } | null = null
canvas.addEventListener('pointerdown', e => {
  if (drag) return
  const edit = overlaySelect.value !== 'sight' && editor.down(e.offsetX, e.offsetY)
  drag = { at: toWorld(e.offsetX, e.offsetY), sx: e.offsetX, sy: e.offsetY, edit, id: e.pointerId }
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // a pointer the browser does not track (a synthetic one): no capture needed
  }
})
canvas.addEventListener('pointerup', e => {
  if (drag && drag.id !== e.pointerId) return
  const click = drag && Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) < 4
  if (drag?.edit) editor.up()
  // a click, not a drag (on the selection too): with the sight overlay, the eye moves there; else it selects
  if (click && overlaySelect.value === 'sight' && !editor.drawing) {
    sightAt = toWorld(e.offsetX, e.offsetY)
    requestOverlay()
  } else if (click) editor.click(e.offsetX, e.offsetY)
  drag = null
  editor.move(e.offsetX, e.offsetY) // the handle under the pointer, after a pan or a drag
})
// an interrupted press (touch or pen cancelled, the capture lost): a drag of the editor's is undone, a pan ends
const interrupted = (e: PointerEvent) => {
  if (!drag || drag.id !== e.pointerId) return
  if (drag.edit) editor.cancel()
  drag = null
}
canvas.addEventListener('pointercancel', interrupted)
canvas.addEventListener('pointerleave', () => editor.leave())
canvas.addEventListener('lostpointercapture', interrupted)
canvas.addEventListener('pointermove', e => {
  if (drag && drag.id !== e.pointerId) return
  // the editor drags, or notes the handle under the pointer; a press elsewhere pans
  if (!drag || drag.edit) editor.move(e.offsetX, e.offsetY)
  else {
    const now = toWorld(e.offsetX, e.offsetY)
    if (Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) >= 4) editor.forgetClick() // a pan, not a click
    view.cx += drag.at[0] - now[0]
    view.cz += drag.at[1] - now[1]
    place()
    redraw()
  }
  hover(e.offsetX, e.offsetY)
})
canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    editor.forgetClick() // the spot on screen is another place on the map now
    const before = toWorld(e.offsetX, e.offsetY)
    view.ppm = Math.max(0.05, Math.min(40, view.ppm * Math.exp(-e.deltaY * 0.0015)))
    place()
    const after = toWorld(e.offsetX, e.offsetY)
    view.cx += before[0] - after[0]
    view.cz += before[1] - after[1]
    place()
    redraw()
    hover(e.offsetX, e.offsetY)
    editor.move(e.offsetX, e.offsetY) // the handle under the pointer, after the zoom
  },
  { passive: false },
)
addEventListener('resize', draw)
picker.addEventListener('change', () => {
  if (!editor.idle) {
    picker.value = editor.file!
    editor.note('finish the drawing or the drag first')
    return
  }
  if (editor.dirty && !confirm('The map has unsaved edits. Drop them and open another map?')) {
    picker.value = editor.file!
    return
  }
  dropUnsavedNew()
  current = null
  const q = new URLSearchParams(location.search) // the other settings (?tilt=) stay
  q.set('map', picker.selectedOptions[0].text)
  sightAt = null // another map: the eye is the old map's
  history.replaceState(null, '', `?${q}`)
  void compile('pick')
})
showOutlines.addEventListener('change', draw)
overlaySelect.addEventListener('change', () => {
  requestOverlay()
  draw()
})
lit?.setFlat(mode.value === 'flat') // a value the browser restored on reload
lit?.onLost(() => {
  litError = 'the WebGL context was lost: reload the page'
  panel()
})
mode.addEventListener('change', () => {
  lit?.setFlat(mode.value === 'flat')
  draw()
})
showIds.addEventListener('change', draw)

// the editor's keys: save, undo, redo, clear the selection, delete; not while typing in a field
addEventListener('keydown', e => {
  // not while typing text; Delete and Escape only on the map (not on a focused list, box or button), the shortcuts
  // with Cmd or Ctrl from anywhere else
  const target = e.target as HTMLElement
  if (target.closest?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=button])')) return
  const onMap = target === document.body || target === canvas
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (mod && key === 's') {
    e.preventDefault()
    void editor.save()
  } else if (mod && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) editor.redo()
    else editor.undo()
  } else if (mod && key === 'y') {
    e.preventDefault()
    editor.redo()
  } else if (e.key === 'Escape' && onMap) {
    if (editor.drawing) editor.drop()
    else editor.select(null)
  } else if (e.key === 'Enter' && onMap && editor.drawing) {
    e.preventDefault()
    editor.enter()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && onMap) {
    e.preventDefault()
    if (editor.drawing) editor.takeBack()
    else editor.remove()
  }
})
saveButton.addEventListener('click', () => void editor.save())
addKind.addEventListener('change', shapeList)
addGo.addEventListener('click', () => {
  // the map takes the drawing's keys (Enter, Backspace, Escape)
  if (editor.add(addKind.value, addShape.value as ShapeName | 'none', addId.value.trim())) canvas.focus()
})
// a new map (M7b): a copy with no file yet, the first save creates maps/<id>.map.json
const newSeason = $<HTMLSelectElement>('newSeason')
newSeason.append(...SEASONS.map(x => new Option(x, x)))
newSeason.value = 'summer'
const newSeed = $<HTMLInputElement>('newSeed')
newSeed.value = String(Math.floor(Math.random() * 2 ** 32))
$('newMake').addEventListener('click', () => {
  const val = (id: string) => $<HTMLInputElement>(id).value.trim()
  const id = val('newId')
  const size = Number(val('newSize'))
  const play = Number(val('newPlay'))
  // no seed given: a random one
  const seed = val('newSeed') === '' ? Math.floor(Math.random() * 2 ** 32) : Number(val('newSeed'))
  // the id names the file (the save's rule); the rest is the validator's to judge, at once, like any edit
  const why = !editor.enabled
    ? 'making maps needs the dev server (npm run dev)'
    : !editor.idle
      ? 'finish the drawing or the drag first'
      : !ID.test(id)
        ? 'its id names its file: lower-case letters and digits, in words joined by "-"'
        : [...picker.options].some(o => o.text === id)
          ? `a map ${id} exists`
          : ''
  if (why) return editor.note(`no new map: ${why}`)
  if (editor.dirty && !confirm('The map has unsaved edits. Drop them and make a new map?')) return
  dropUnsavedNew()
  const file = `/maps/${id}.map.json`
  const doc: MapFile = {
    format: 1,
    id,
    name: val('newName') || id,
    seed,
    season: newSeason.value as MapFile['season'],
    extent: { w: size, h: size },
    play: { w: play, h: play },
    features: [],
  }
  picker.append(mapOption(file))
  picker.value = file
  current = null
  sightAt = null
  const q = new URLSearchParams(location.search)
  q.set('map', id)
  history.replaceState(null, '', `?${q}`)
  editor.create(file, doc)
  newSeed.value = String(Math.floor(Math.random() * 2 ** 32))
  void compile('new')
})
undoButton.addEventListener('click', () => editor.undo())
redoButton.addEventListener('click', () => editor.redo())
$('overwrite').addEventListener('click', () => void editor.save(true))
$('takeDisk').addEventListener('click', () => editor.takeDisk())
addEventListener('beforeunload', e => {
  if (editor.dirty) e.preventDefault()
})

// a saved map file, catalogue or heightfield (vite.config.ts sends `map-changed` with the file and the time it was
// seen); any heightfield recompiles, since the map's text alone says which it reads
const diskRead = newestOnly()
if (import.meta.hot) {
  import.meta.hot.on('map-changed', (d: { file: string; at: number; type: 'create' | 'update' | 'delete' }) => {
    // a map file made since the page loaded (by hand, or another page's new map) joins the list; one deleted leaves
    // it, unless the page shows it (the editor keeps its copy, which a save makes again)
    if (d.file.endsWith('.map.json') && d.file !== picker.value) {
      const listed = [...picker.options].find(o => o.value === d.file)
      if (d.type === 'delete') listed?.remove()
      else if (!listed) picker.append(mapOption(d.file))
    }
    if (d.file.endsWith('.rdem')) {
      // a heightfield is large and written in one go: wait until the saves stop before reading it, so a file still
      // being written is not kept as the new version
      const name = d.file.replace('/maps/', '')
      fileVersion.set(name, (fileVersion.get(name) ?? 0) + 1)
      clearTimeout(rdemTimer)
      rdemTimer = setTimeout(() => void compile('save', d.at), RDEM_SETTLE)
    } else if (d.file === picker.value) {
      // the map file, made, changed or deleted: through the editor, which ignores its own save and keeps unsaved
      // edits (a conflict); the newest read alone counts, a deletion too (an older read may resolve after it)
      const file = d.file
      const disk = d.type === 'delete' ? Promise.resolve({ text: null }) : read(file, MAPS).then(text => ({ text }))
      void diskRead<{ text: string | null }>(disk).then(
        got => {
          if (got && picker.value === file && editor.onDisk(file, got.text)) void compile('save', d.at)
        },
        // said in the editor's panel: the page's compile in flight (an edit's) must still be drawn
        (err: Error) => editor.note(`cannot read the file on disk: ${err.message}`),
      )
    } else if (d.file === '/maps/kinds.json') void compile('save', d.at)
  })
}

declare global {
  interface Window {
    MAP: unknown
  }
}
window.MAP = {
  get log() {
    return log
  },
  get issues() {
    return issues
  },
  get compiled() {
    return current?.map.id ?? null
  },
  // the compiled heights, for checks that compare the page's compile with Node's
  get height() {
    return height
  },
  // the lit view: the last compile's bake time and the last frame's CPU time, ms; draw a frame
  get bakeMs() {
    return current?.ms.bake ?? null
  },
  get frameMs() {
    return frameMs
  },
  // the debug overlays: choose one by its setting's value ('pass:line', 'depth', 'slope', 'sight'), the sight's eye,
  // and the last overlay's time in the worker, ms
  overlay(value: string, at?: Pt) {
    overlaySelect.value = value
    if (at) sightAt = at
    requestOverlay()
  },
  get overlayMs() {
    return overlayMs
  },
  get overlays() {
    return overlays
  },
  get overlayCells() {
    return overlayCells
  },
  // whether the lit view can draw now (for checks)
  // the map's cells (for checks)
  get cells() {
    return current ? current.nx * current.nz : 0
  },
  get litReady() {
    return lit?.isReady() ?? false
  },
  draw,
  // centre the view on a ground point at a zoom (px a metre), for checks
  look(x: number, z: number, ppm: number) {
    view = { cx: x, cz: z, ppm }
    draw()
  },
  compile: () => compile('manual'),
  // the editor (M7): select a feature, the selection, what a save would write, save, undo, redo, unsaved edits, and
  // a ground point's screen position (to drive the pointer in checks)
  select: (id: string | null) => editor.select(id),
  get selected() {
    return editor.selected
  },
  get text() {
    return editor.text
  },
  save: () => editor.save(),
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  get dirty() {
    return editor.dirty
  },
  get idle() {
    return editor.idle
  },
  // drawing (M7b): start one, Enter, what to click next, whether one is in progress, whether the map is new
  add: (kind: string, shape: ShapeName | 'none', id: string) => editor.add(kind, shape, id),
  enter: () => editor.enter(),
  get prompt() {
    return editor.prompt
  },
  get drawing() {
    return editor.drawing
  },
  get noFile() {
    return editor.noFile
  },
  get conflict() {
    return editor.conflict
  },
  project: (x: number, z: number) => toScreen(x, z),
  fit: () => {
    fit()
    draw()
  },
}
void compile('load')
