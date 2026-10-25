/// <reference types="vite/client" />
// The draft page (docs/proposals/map-engine.md §7, docs/plans/done/m1-language.md M1b): a map from maps/ compiled
// in a worker and drawn flat, with pan and zoom, feature outlines and ids, a readout of the cell under the mouse,
// and the validator's errors. Saving the map file (or maps/kinds.json) recompiles and redraws; the last good
// drawing stays up while a file is broken. window.MAP exposes the state for headless checks.
import type { Feature, Pt } from '../../map/schema.ts'
import type { Issue } from '../../map/catalogue.ts'
import type { Compiled, CompileReply, CompileRequest, LayerName } from './protocol.ts'
import { demFileNames } from '../../map/dem.ts'
import { LitView, TILT } from '../../render/lit/view.ts'

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
const mode = $<HTMLSelectElement>('mode')
// the lit map view under the overlays (docs/plans/active/m6-lit-view.md); ?tilt= degrees off straight down
const lit = new LitView($<HTMLCanvasElement>('lit'))
const tiltParam = Number(new URLSearchParams(location.search).get('tilt'))
const tilt = Number.isFinite(tiltParam) && new URLSearchParams(location.search).has('tilt') ? tiltParam : TILT

const names = Object.keys(MAPS).sort()
for (const n of names) picker.append(new Option(n.replace('/maps/', '').replace('.map.json', ''), n))
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
function onReply(e: MessageEvent<CompileReply>): void {
  const r = e.data
  if (r.seq !== seq || !pending) return // an older compile, overtaken
  if (!r.ok && r.missing?.length) {
    // the worker lacks files it was counted as holding: send them again
    for (const name of r.missing) sentVersion.delete(name)
    void compile(pending.reason, pending.savedAt)
    return
  }
  if (r.ok) {
    const fresh = !current || current.map.id !== r.map.id
    current = r
    issues = []
    layers = Object.fromEntries(Object.entries(r.layers).map(([k, b]) => [k, new Uint16Array(b)]))
    height = new Float64Array(r.height)
    depth = new Uint16Array(r.depth)
    lit.setMap({
      x0: r.x0,
      z0: r.z0,
      cell: r.cell,
      nx: r.nx,
      nz: r.nz,
      datum: r.map.datum ?? 0,
      season: r.map.season,
      light: 'nw',
      height,
      relief: new Uint8Array(r.relief),
      masks: new Uint8Array(r.masks),
      flat: { w: r.w, h: r.h, rgba: new Uint8Array(r.rgba) },
    })
    if (fresh || !view.ppm) fit()
  } else issues = r.issues
  const now = performance.now()
  log.push({ reason: pending.reason, savedAt: pending.savedAt, drawnAt: Date.now(), ms: now - pending.t0 })
  pending = null
  draw()
  panel()
}

// each compile takes its number before it reads the files, so a slower, older read can never replace a newer one
async function compile(reason: string, savedAt?: number): Promise<void> {
  const mine = ++seq
  const t0 = performance.now()
  pending = { reason, t0, savedAt }
  let mapText: string
  let kindsText: string
  let files: CompileRequest['files']
  try {
    ;[mapText, kindsText] = await Promise.all([read(picker.value, MAPS), read('/maps/kinds.json', KINDS)])
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
const place = () => lit.setCamera({ ...view, tilt })
const toScreen = (x: number, z: number): [number, number] => lit.project(x, z)
const toWorld = (sx: number, sy: number): Pt => lit.unproject(sx, sy) ?? [view.cx, view.cz]

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
function outline(f: Feature): void {
  const ink = CATEGORY_INK[(f.kind ?? '').split('.')[0]] ?? '#333'
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1
  const path = (pts: Pt[], close: boolean) => {
    ctx.beginPath()
    pts.forEach((p, k) => {
      const [x, y] = toScreen(p[0], p[1])
      if (k) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    if (close) ctx.closePath()
    ctx.stroke()
  }
  if (f.line) path(f.line, false)
  if (f.area) f.area.forEach(r => path(r, true))
  // a circle or an ellipse as a ring of points on the ground, so it leans with the view
  const ring = (c: Pt, a: number, b: number, ang: number) =>
    Array.from({ length: 48 }, (_, k): Pt => {
      const t = (k / 48) * 2 * Math.PI
      const u = a * Math.cos(t)
      const v = b * Math.sin(t)
      return [c[0] + u * Math.cos(ang) - v * Math.sin(ang), c[1] + u * Math.sin(ang) + v * Math.cos(ang)]
    })
  if (f.circle) path(ring(f.circle[0], f.circle[1], f.circle[1], 0), true)
  if (f.ellipse) path(ring(...f.ellipse), true)
  const at = anchor(f)
  if (f.point || f.near) {
    const [x, y] = toScreen(...(f.point ?? f.near!))
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, 2 * Math.PI)
    ctx.fill()
  }
  if (showIds.checked && at) {
    const [x, y] = toScreen(at[0], at[1])
    ctx.font = '11px ui-monospace, Menlo, monospace'
    ctx.fillText(f.id, x + 4, y - 4)
  }
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
  if (!current) return
  place()
  frameMs = lit.render()
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
  ctx.beginPath()
  corners.forEach((c, k) => {
    const [x, y] = toScreen(c[0], c[1])
    if (k) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  })
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])
  if (showOutlines.checked) for (const f of current.map.features) outline(f)
  if (issues.length) {
    ctx.fillStyle = 'rgba(160, 20, 20, .08)'
    ctx.fillRect(0, 0, r.width, r.height)
  }
}

function panel(): void {
  const c = current
  status.textContent = c
    ? `${c.map.name}: ${c.map.features.length} features, ${c.nx}×${c.nz} cells of ${c.cell} m · validate ${c.ms.validate.toFixed(0)} ms, apply ${c.ms.apply.toFixed(0)} ms, draw ${c.ms.draw.toFixed(0)} ms, bake ${c.ms.bake.toFixed(0)} ms`
    : 'compiling…'
  errors.replaceChildren(
    ...issues.map(i => {
      const li = document.createElement('li')
      li.textContent = `${i.id ? `[${i.id}] ` : ''}${i.path || '(map)'}: ${i.message}`
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
let drag: { at: Pt } | null = null
canvas.addEventListener('pointerdown', e => {
  drag = { at: toWorld(e.offsetX, e.offsetY) }
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointerup', () => {
  drag = null
})
canvas.addEventListener('pointermove', e => {
  if (drag) {
    const now = toWorld(e.offsetX, e.offsetY)
    view.cx += drag.at[0] - now[0]
    view.cz += drag.at[1] - now[1]
    draw()
  }
  hover(e.offsetX, e.offsetY)
})
canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    const before = toWorld(e.offsetX, e.offsetY)
    view.ppm = Math.max(0.05, Math.min(40, view.ppm * Math.exp(-e.deltaY * 0.0015)))
    place()
    const after = toWorld(e.offsetX, e.offsetY)
    view.cx += before[0] - after[0]
    view.cz += before[1] - after[1]
    draw()
    hover(e.offsetX, e.offsetY)
  },
  { passive: false },
)
addEventListener('resize', draw)
picker.addEventListener('change', () => {
  current = null
  history.replaceState(null, '', `?map=${picker.selectedOptions[0].text}`)
  void compile('pick')
})
showOutlines.addEventListener('change', draw)
mode.addEventListener('change', () => {
  lit.setFlat(mode.value === 'flat')
  draw()
})
showIds.addEventListener('change', draw)

// a saved map file, catalogue or heightfield (vite.config.ts sends `map-changed` with the file and the time it was
// seen); any heightfield recompiles, since the map's text alone says which it reads
if (import.meta.hot) {
  import.meta.hot.on('map-changed', (d: { file: string; at: number }) => {
    if (d.file.endsWith('.rdem')) {
      // a heightfield is large and written in one go: wait until the saves stop before reading it, so a file still
      // being written is not kept as the new version
      const name = d.file.replace('/maps/', '')
      fileVersion.set(name, (fileVersion.get(name) ?? 0) + 1)
      clearTimeout(rdemTimer)
      rdemTimer = setTimeout(() => void compile('save', d.at), RDEM_SETTLE)
    } else if (d.file === picker.value || d.file === '/maps/kinds.json') void compile('save', d.at)
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
  draw,
  compile: () => compile('manual'),
  fit: () => {
    fit()
    draw()
  },
}
void compile('load')
