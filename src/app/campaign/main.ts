// The campaign page (app/campaign.html; docs/systems/campaign-map.md, docs/plans/active/k2b-page.md): the campaign map
// drawn from the tool's output (tools/campaign-tiles.ts). It loads the manifest, the far level's tiles and its
// fields, and hands them to the view (src/render/campaign/view.ts); up close, the view streams the 100 m tiles. Drag
// to pan, the wheel to zoom to the cursor.
// URL: ?tiles= the manifest, of this page's origin (by default the tool's output, which `npm run dev` serves);
// ?view=x,z,km the camera's target in km from the centre (east, north) and its distance; ?upscale=off|<factor> the
// FSR 1 upscale on high-resolution screens; ?fps=0 hides the frame rate.
import { unpackFields } from '../../render/campaign/fields.ts'
import { assembleLevel, readManifest, tilePath, tilesOf } from '../../render/campaign/level.ts'
import { inflate, unpackTile, type Level, type Manifest, type Tile } from '../../render/campaign/tiles.ts'
import { CampaignMapView, type Upscale } from '../../render/campaign/view.ts'

const DEFAULT_TILES = '/scratch/campaign/manifest.json'
// the far level's tiles fetched this many at once
const FETCHES = 8

const t0 = performance.now()
const Q = new URLSearchParams(location.search)

/** An element of the page by id. */
const $ = (id: string) => document.getElementById(id)!

/** The manifest's URL: ?tiles= when it is of this page's origin, else the default. */
function manifestUrl(): URL {
  const given = Q.get('tiles')
  if (given) {
    const url = new URL(given, location.href)
    if (url.origin === location.origin) return url
    console.warn('?tiles= ignored: not of this page’s origin')
  }
  return new URL(DEFAULT_TILES, location.href)
}

/** Fetches a file's bytes; throws with its URL and status on a failure. */
async function fetchBytes(url: URL): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url.pathname}: ${r.status} ${r.statusText}`)
  return new Uint8Array(await r.arrayBuffer())
}

/** One tile of a level: fetched, inflated and unpacked (refused if it is another place's). */
async function loadTile(base: URL, index: number, level: Level, column: number, row: number): Promise<Tile> {
  const bytes = await inflate(await fetchBytes(new URL(tilePath(level, column, row), base)))
  return unpackTile(bytes, { level: index, column, row })
}

/** Runs `job` over `items`, `count` at once, and returns the results in the items' order. */
async function pool<T, R>(items: T[], count: number, job: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const k = next++
      out[k] = await job(items[k])
    }
  }
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, worker))
  return out
}

/** The ?view= parameter, if given as three numbers. */
function viewParam() {
  const v = (Q.get('view') ?? '').split(',').map(Number)
  return v.length === 3 && v.every(Number.isFinite) ? { x: v[0], z: v[1], dist: v[2] } : null
}

/** The ?upscale= parameter. */
function upscaleParam(): Upscale {
  const asked = Q.get('upscale')
  if (asked === 'off') return 'off'
  const factor = Number(asked)
  return asked && Number.isFinite(factor) ? factor : 'auto'
}

/** Pans by dragging the map and zooms to the cursor with the wheel. */
function bindInput(canvas: HTMLCanvasElement, view: CampaignMapView) {
  let drag: [number, number] | null = null
  canvas.addEventListener('pointerdown', e => {
    drag = view.groundAt(e.clientX, e.clientY)
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', e => {
    if (!drag) return
    const now = view.groundAt(e.clientX, e.clientY)
    if (!now) return
    const v = view.view
    view.setView({ ...v, x: v.x + drag[0] - now[0], z: v.z + drag[1] - now[1] })
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, () => {
      drag = null
    })
  }
  canvas.addEventListener(
    'wheel',
    e => {
      e.preventDefault()
      const before = view.groundAt(e.clientX, e.clientY)
      // in pixels: a wheel that counts lines (Firefox) or pages scaled to about Chrome's pixels a notch
      const pixels =
        e.deltaY *
        (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 33 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1)
      view.setView({ ...view.view, dist: view.view.dist * Math.exp(pixels * 0.0012) })
      const after = view.groundAt(e.clientX, e.clientY)
      if (before && after) {
        const v = view.view
        view.setView({ ...v, x: v.x + before[0] - after[0], z: v.z + before[1] - after[1] })
      }
    },
    { passive: false },
  )
  addEventListener('resize', () => view.resize())
}

/**
 * The frame rate (?fps=0 hides it): frames a second over the last half second, the CPU time of a frame, the upscale
 * and the detail area's tiles.
 */
function fpsMeter(view: CampaignMapView) {
  const on = Q.get('fps') !== '0'
  if (!on) $('fps').style.display = 'none'
  let frames = 0
  let cpu = 0
  let since = performance.now()
  view.onFrame = cpuMs => {
    frames++
    cpu += cpuMs
    const now = performance.now()
    if (!on || now - since < 500) return
    $('fpsN').textContent = String(Math.round((frames * 1000) / (now - since)))
    const factor = view.upscaleFactor()
    const up = factor > 1 ? ` · FSR ×${factor.toFixed(2)}` : ''
    const d = view.detailState()
    const tiles = d ? ` · tiles ${d.tiles}${d.loading ? '+' : ''}` : ''
    $('fpsD').textContent = `cpu ${(cpu / frames).toFixed(1)} ms${up}${tiles}`
    frames = 0
    cpu = 0
    since = now
  }
}

/** The scale bar for `ppk` screen pixels a km: the first round length at least 90 px long (the prototype's). */
function drawScale(ppk: number) {
  const km = [5, 10, 20, 25, 50, 100, 200].find(k => k * ppk >= 90) ?? 200
  $('scaleBar').style.width = `${Math.round(km * ppk)}px`
  $('scaleText').textContent = `${km} km`
}

/** The cartouche: the projection, the grid and the credit. */
function cartouche(m: Manifest) {
  const far = m.levels[m.fields.level]
  const { lat0, lon0 } = m.frame
  $('meta').innerHTML =
    `Lambert equal-area ${lat0}° N ${lon0}° E · ${far.nx - 1} × ${far.nz - 1} cells of ${far.cell} m<br>` +
    `relief raised ×${m.params.vert} · sun ${m.params.sunEl}° high from ${m.params.sunAz}°`
  $('credit').textContent = m.credit
}

/** Loads the manifest, the far level and its fields, and starts the view; the checks' hooks on `window`. */
async function main() {
  const canvas = $('c') as HTMLCanvasElement
  const url = manifestUrl()
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url.pathname}: ${r.status} ${r.statusText}: run node tools/campaign-tiles.ts`)
  const manifest = readManifest(await r.json())
  const farIndex = manifest.fields.level
  const far = manifest.levels[farIndex]
  const [fields, tiles] = await Promise.all([
    fetchBytes(new URL(manifest.fields.path, url)).then(inflate).then(unpackFields),
    pool(tilesOf(far), FETCHES, ([column, row]) => loadTile(url, farIndex, far, column, row)),
  ])
  const loadedMs = Math.round(performance.now() - t0)
  const view = new CampaignMapView(canvas)
  view.setMap(manifest, assembleLevel(far, tiles), fields)
  // the close zoom: the finest level, when it is not the far one
  const closeIndex = manifest.levels.length - 1
  if (closeIndex !== farIndex) {
    const close = manifest.levels[closeIndex]
    view.setDetail(close, (column, row) => loadTile(url, closeIndex, close, column, row))
  }
  const asked = viewParam()
  view.setView(asked ?? { x: 0, z: 0, dist: 1150 })
  view.setUpscale(upscaleParam())
  cartouche(manifest)
  fpsMeter(view)
  bindInput(canvas, view)
  view.onViewChanged = drawScale
  view.start()
  const readyMs = Math.round(performance.now() - t0)
  // for the checks (tools/shot.mjs): the view's controls and when the page was ready
  Object.assign(window, {
    __campaign: {
      loadedMs,
      readyMs,
      view: () => view.view,
      setView: (x: number, z: number, dist: number) => view.setView({ x, z, dist }),
      detail: () => view.detailState(),
      upscale: () => view.upscaleFactor(),
      bench: (n?: number) => view.bench(n),
    },
  })
}

main().catch((e: unknown) => {
  const missing = $('missing')
  missing.textContent = `The campaign map could not load: ${e instanceof Error ? e.message : String(e)}`
  missing.style.display = 'grid'
  throw e
})
