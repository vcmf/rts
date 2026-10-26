// The tracing overlay on the map page (docs/plans/active/m7-editor.md M7e, decision 0069): a scan of a period map
// drawn under the editor's outlines at an opacity the panel sets, placed by its control points (./scan.ts) in each
// relief piece cut from its frame's file, moved as the piece is. A control point is two clicks through the editor
// (one edit): where a landmark shows on the scan, then where it is on the map. Points show as pairs joined by their
// residual and are listed with a button to remove each.
// - The lit view is tilted, so the image is drawn on the GPU (./scan-gl.ts) through the view's own matrix: a mesh of
//   frame points over the image, its perspective exact, so the pixel drawn at a point is the pixel a click there takes.
//   Each piece of its frame is drawn there with its shift, composited into an offscreen canvas at full opacity in
//   painting order, clipped to its area (another file's piece on top erases what it covers), then onto the view at the
//   set opacity.
// - The opacity is a setting of the page, kept per map and scan in the browser, never in the file.
import type { Catalogue, MapFile, Pt, Source } from '../../map/schema.ts'
import type { Editor } from './editor.ts'
import {
  fitScan,
  frameAt,
  nearPoint,
  scanMesh,
  scanPieces,
  topAt,
  type ControlPoint,
  type Piece,
  type ScanFit,
} from './scan.ts'
import { setField } from './fields.ts'
import { ScanGl } from './scan-gl.ts'

/** What the overlay needs from the page. */
export interface TraceHost {
  ctx: CanvasRenderingContext2D
  project(x: number, z: number): [number, number] | null
  /** Adds a ring of ground points to a clip's path, closed, along the near limit where it passes behind the camera. */
  ringPath(path: Path2D, ring: Pt[]): void
  redraw(): void
  /** Gives the map the keyboard (a capture's Escape and Backspace). */
  focus(): void
  /** The view's matrix: a ground point (x, 0, z, 1) to clip space, column-major (the lit view's, or the flat one's). */
  viewMatrix(): Float32Array
  /** The map's file, which names the browser's settings. */
  file(): string | null
  /** The catalogue the pieces are resolved with (none yet: no scan shows). */
  catalogue(): Catalogue | null
}
/** The panel's elements of the overlay. */
export interface TraceUi {
  pick: HTMLSelectElement
  opacity: HTMLInputElement
  add: HTMLButtonElement
  state: HTMLElement
  points: HTMLElement
}

const PAIR = '#7a1fa2' // the control points' colour
const OPACITY = 0.6

/** A scan's image, read once a file: loading, there, or missing (and why). */
type Image = { state: 'loading' } | { state: 'ready'; img: ImageBitmap } | { state: 'missing'; why: string }

/** The scan sources of a map. */
const scansOf = (doc: MapFile | null): Source[] => (doc?.sources ?? []).filter(s => s?.kind === 'scan')

/**
 * The browser's setting under a key, or none; a browser that keeps none (private, blocked) is no error.
 */
function setting(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function keep(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not kept: the page works without it
  }
}

export class Trace {
  private host: TraceHost
  private editor: Editor
  private ui: TraceUi
  private images = new Map<string, Image>()
  private offscreen = document.createElement('canvas')
  /** The scan shown and its placement, worked out once per copy, catalogue and image. */
  private shown: { scan: Source; fit: ScanFit; pieces: Piece[]; img: ImageBitmap } | null = null
  private last: unknown[] = []
  /** The placement, worked out again only when the scan or its image changes (not on every edit of the copy). */
  private fitFor: { scan: Source; img: ImageBitmap; extent: MapFile['extent']; fit: ScanFit } | null = null
  /** The GPU's part, or why there is none (no WebGL2): made when a scan is first shown, not for every map. */
  private glMade: ScanGl | string | null = null
  private get gl(): ScanGl | string {
    if (this.glMade === null) {
      try {
        this.glMade = new ScanGl()
      } catch (err) {
        this.glMade = (err as Error).message
      }
    }
    return this.glMade
  }
  /** The scan (by map and id) whose opacity the slider shows: read from the browser only when it changes. */
  private opacityFor = ''

  constructor(host: TraceHost, editor: Editor, ui: TraceUi) {
    this.host = host
    this.editor = editor
    this.ui = ui
    ui.pick.addEventListener('change', () => {
      keep(this.key('scan'), ui.pick.value)
      this.update(true)
    })
    ui.opacity.addEventListener('input', () => {
      keep(this.key(`opacity:${ui.pick.value}`), ui.opacity.value)
      host.redraw()
    })
    ui.add.addEventListener('click', () => this.addPoint())
  }

  /** A setting's key: the page's, for the map shown. */
  private key(name: string): string {
    return `map-trace:${this.host.file() ?? ''}:${name}`
  }

  /** Follows the copy: the scans it has, the one chosen, its image and placement, the panel. */
  update(force = false): void {
    const doc = this.editor.doc
    const cat = this.host.catalogue()
    const scans = scansOf(doc)
    // the choice: the one kept for this map, else none
    const ids = ['', ...scans.map(s => s.id)]
    if ([...this.ui.pick.options].map(o => o.value).join('\n') !== ids.join('\n')) {
      this.ui.pick.replaceChildren(...ids.map(id => new Option(id || '—', id)))
    }
    const want = force ? this.ui.pick.value : (setting(this.key('scan')) ?? this.ui.pick.value)
    this.ui.pick.value = ids.includes(want) ? want : ''
    const scan = scans.find(s => s.id === this.ui.pick.value) ?? null
    // a scan chosen again reads a missing image again (fetched meanwhile); images no scan of the copy names go
    if (force && scan?.file && this.images.get(scan.file)?.state === 'missing') this.images.delete(scan.file)
    for (const [file, im] of [...this.images]) {
      if (scans.some(x => x.file === file)) continue
      if (im.state === 'ready') im.img.close()
      this.images.delete(file)
    }
    const image = scan?.file ? this.image(scan.file) : null
    const key = [doc, cat, scan, image]
    if (!force && key.length === this.last.length && key.every((k, i) => k === this.last[i])) return
    this.last = key
    const which = this.key(`opacity:${scan?.id ?? ''}`)
    if (which !== this.opacityFor) {
      this.opacityFor = which
      this.ui.opacity.value = setting(which) ?? String(OPACITY)
    }
    this.shown = null
    if (scan && cat && doc && image?.state === 'ready') {
      const img = image.img
      const f = this.fitFor
      // a placement with fewer than two points follows the map's extent too
      const same = f && f.scan === scan && f.img === img && f.extent === doc.extent
      const fit = same ? f.fit : fitScan(scan.points ?? [], img.width, img.height, doc.extent)
      this.fitFor = { scan, img, fit, extent: doc.extent }
      if (typeof this.gl !== 'string') {
        this.gl.setImage(img)
        if (!same) this.gl.setMesh(scanMesh(fit.toFrame, img.width, img.height))
      }
      this.shown = { scan, fit, pieces: scanPieces(doc, cat, scan), img }
    }
    this.panel(scan, image)
    this.host.redraw()
  }

  /** The image of a file, read once (a change on disk is read on the page's next load). */
  private image(file: string): Image {
    let im = this.images.get(file)
    if (im) return im
    im = { state: 'loading' }
    this.images.set(file, im)
    const img = new Image()
    // decoded once, off the page's thread, into a bitmap that stays decoded: a 16-megapixel scan drawn from the image
    // element took seconds on the draws that decoded it again
    img.onload = () => {
      // a scan larger than the GPU takes is not shown (shrunk, its control points would no longer name its pixels)
      const max = typeof this.gl === 'string' ? Infinity : this.gl.maxSide
      if (Math.max(img.naturalWidth, img.naturalHeight) > max) {
        this.images.set(file, {
          state: 'missing',
          why: `maps/${file} is ${img.naturalWidth} × ${img.naturalHeight} px: this GPU takes ${max} px a side at most`,
        })
        this.update()
        return
      }
      createImageBitmap(img).then(
        bmp => {
          // gone meanwhile (its scan removed): not kept
          if (this.images.get(file) !== im) return bmp.close()
          this.images.set(file, { state: 'ready', img: bmp })
          this.update()
        },
        (err: Error) => {
          if (this.images.get(file) !== im) return
          this.images.set(file, { state: 'missing', why: `maps/${file} could not be decoded: ${err.message}` })
          this.update()
        },
      )
    }
    img.onerror = () => {
      if (this.images.get(file) !== im) return // gone meanwhile, or read again
      this.images.set(file, {
        state: 'missing',
        why: `maps/${file} is not here: a scan is kept out of git; fetch it (tools/scan-wms.ts) or copy it there`,
      })
      this.update()
    }
    img.src = `/maps/${file}`
    return im
  }

  /** The panel: the scan's state, its error as placed, its points with their residuals. */
  private panel(scan: Source | null, image: Image | null): void {
    const s = this.shown
    this.ui.add.disabled = !s || !this.editor.enabled || !this.editor.doc
    this.ui.opacity.disabled = !s
    if (scan && typeof this.gl === 'string') this.ui.state.textContent = this.gl
    else if (!scan) this.ui.state.textContent = ''
    else if (image?.state === 'missing') this.ui.state.textContent = image.why
    else if (!s) this.ui.state.textContent = image?.state === 'loading' ? 'reading the image…' : ''
    else {
      const n = s.fit.residuals.length
      const how =
        n === 0
          ? 'no control point: over the map, to place by points'
          : n === 1
            ? 'one point: moved onto it'
            : s.fit.problem
              ? `${n} points: ${s.fit.problem}`
              : n === 2
                ? 'two points: moved, turned, scaled'
                : n === 3
                  ? 'three points: an affine fit through them (a fourth tells its error)'
                  : `${n} points, bent through each: ${s.fit.rms === null ? '—' : `${s.fit.rms.toFixed(1)} m`} root mean square where the others put each`
      const where = s.pieces.some(p => p.own) ? '' : ' · its frame has no relief piece on the map: it shows nowhere'
      this.ui.state.textContent = `${s.img.width} × ${s.img.height} px · ${how}${where}`
    }
    this.ui.points.replaceChildren(
      ...(s?.fit.residuals ?? []).map((r, k) => {
        const li = document.createElement('li')
        const rm = Object.assign(document.createElement('button'), {
          type: 'button',
          textContent: 'remove',
          disabled: !this.editor.enabled || !this.editor.doc,
        })
        rm.dataset.point = String(k)
        rm.addEventListener('click', () => this.removePoint(k))
        // the list numbers the points as the map does; a residual the others cannot give (in a line) shows as —
        li.append(`${Number.isFinite(r) ? `${r.toFixed(1)} m` : '—'} `, rm)
        return li
      }),
    )
  }

  /** The copy with the shown scan's points replaced, or null when the scan is gone from it. */
  private withPoints(points: ControlPoint[]): MapFile | null {
    const doc = this.editor.doc
    const id = this.shown?.scan.id
    const sources = doc?.sources ?? []
    const k = sources.findIndex(s => s.kind === 'scan' && s.id === id)
    if (!doc || k < 0) return null
    const scan = setField(sources[k], 'points', points.length ? points : undefined)
    return { ...doc, sources: sources.map((s, i) => (i === k ? scan : s)) }
  }

  /** Two clicks through the editor, one edit: where a landmark shows on the scan, then where it is on the map. */
  private addPoint(): void {
    if (!this.shown) return
    // the pixel under a click on the drawn scan, or why there is none
    const pixel = (on: Pt): Pt | string => {
      const s = this.shown
      if (!s) return 'the scan is not shown'
      const from = frameAt(s.pieces, on[0], on[1])
      const uv = from ? s.fit.toImage(from[0], from[1]) : null
      const [w, h] = [s.img.width, s.img.height]
      if (!uv || uv[0] < 0 || uv[1] < 0 || uv[0] > w || uv[1] > h) {
        return 'click on the scan, where it shows the landmark'
      }
      return uv
    }
    const started = this.editor.capture(
      ['click where a landmark shows on the scan', 'click where it is on the map'],
      ([on, at]) => {
        const s = this.shown
        const uv = pixel(on)
        if (!s || typeof uv === 'string') return typeof uv === 'string' ? uv : 'the scan is not shown'
        const to = frameAt(s.pieces, at[0], at[1])
        if (!to) return 'click where the scan shows (a relief piece cut from its frame)'
        const r = (v: number) => Math.round(v * 100) / 100
        const p: ControlPoint = [r(uv[0]), r(uv[1]), r(to[0]), r(to[1])]
        const points = s.scan.points ?? []
        // a second point on one pixel or place would pull the placement two ways at once
        const k = nearPoint(points, p)
        if (k >= 0) return `point ${k + 1} is there already: remove it first to place it again`
        const out = this.withPoints([...points, p])
        return out ?? 'the scan is gone from the map'
      },
      // the first click is checked on its own: a click off the scan is taken back at once
      ([on]) => {
        const uv = pixel(on)
        return typeof uv === 'string' ? uv : null
      },
    )
    if (started) this.host.focus()
  }

  /** Removes a control point: one edit of the map's sources. */
  private removePoint(k: number): void {
    const points = this.shown?.scan.points ?? []
    const out = this.withPoints(points.filter((_, i) => i !== k))
    if (out) this.editor.setMapField('sources', out.sources)
  }

  /** Where a pixel of the shown scan lies on the map, through its first piece (for checks), or null. */
  mapPoint(u: number, v: number): Pt | null {
    const s = this.shown
    const p = s?.pieces.find(q => q.own)
    if (!s || !p) return null
    const [x, z] = s.fit.toFrame(u, v)
    return [x - p.shift.x, z - p.shift.z]
  }
  /** The last draw's time, ms. */
  ms = 0

  /** Draws the scan under the outlines, at the set opacity, and its control points. */
  draw(width: number, height: number, dpr: number): void {
    const s = this.shown
    if (!s || typeof this.gl === 'string') return
    const t0 = performance.now()
    const { ctx } = this.host
    const off = this.offscreen
    if (off.width !== Math.round(width * dpr) || off.height !== Math.round(height * dpr)) {
      off.width = Math.round(width * dpr)
      off.height = Math.round(height * dpr)
    }
    const o = off.getContext('2d')!
    o.setTransform(dpr, 0, 0, dpr, 0, 0)
    o.clearRect(0, 0, width, height)
    for (const p of s.pieces) this.drawPiece(o, p, width, height, dpr)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = Number(this.ui.opacity.value)
    ctx.drawImage(off, 0, 0)
    ctx.restore()
    this.drawPoints()
    this.ms = performance.now() - t0
  }

  /**
   * One piece of the scan: its mesh, clipped to the piece's area; or, for another file's piece, the scan erased where
   * it lies on top.
   */
  private drawPiece(o: CanvasRenderingContext2D, p: Piece, width: number, height: number, dpr: number): void {
    o.save()
    const path = new Path2D()
    if (p.area) for (const ring of p.area) this.host.ringPath(path, ring)
    if (!p.own) {
      o.globalCompositeOperation = 'destination-out'
      if (p.area) o.fill(path, 'evenodd')
      else o.fillRect(0, 0, width, height)
      o.restore()
      return
    }
    // the piece's rings as one path: its holes left out (even-odd)
    if (p.area) o.clip(path, 'evenodd')
    // the scan through the view, moved as the piece is, on the GPU's canvas, then into the clip
    const gl = this.gl as ScanGl
    gl.render(Math.round(width * dpr), Math.round(height * dpr), this.host.viewMatrix(), p.shift)
    o.drawImage(gl.canvas, 0, 0, width, height)
    o.restore()
  }

  /**
   * The control points: where each pixel lies as placed (a ring) and where it belongs (a dot), joined, numbered; in
   * each piece that shows them. The capture's first click, while one is taken.
   */
  private drawPoints(): void {
    const s = this.shown!
    const { ctx } = this.host
    ctx.save()
    ctx.strokeStyle = PAIR
    ctx.fillStyle = PAIR
    ctx.lineWidth = 1.5
    ctx.font = '11px system-ui, sans-serif'
    ;(s.scan.points ?? []).forEach(([u, v, x, z], k) => {
      const [px, pz] = s.fit.toFrame(u, v)
      for (const p of s.pieces) {
        const at: Pt = [x - p.shift.x, z - p.shift.z]
        // shown through the piece on top there alone (another of the same file may hold the place too, moved)
        if (!p.own || topAt(s.pieces, at[0], at[1]) !== p) continue
        const a = this.host.project(px - p.shift.x, pz - p.shift.z)
        const b = this.host.project(at[0], at[1])
        if (!a || !b) continue
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(a[0], a[1], 5, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(b[0], b[1], 3, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillText(String(k + 1), b[0] + 6, b[1] - 6)
      }
    })
    for (const q of this.editor.captured) {
      const a = this.host.project(q[0], q[1])
      if (!a) continue
      ctx.beginPath()
      ctx.arc(a[0], a[1], 5, 0, 2 * Math.PI)
      ctx.stroke()
    }
    ctx.restore()
  }
}
