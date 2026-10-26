// The tracing overlay on the map page (docs/plans/active/m7-editor.md M7e, decision 0069): a scan of a period map
// drawn under the editor's outlines at an opacity the panel sets, placed by its control points (./scan.ts) in each
// relief piece cut from its frame's file, moved as the piece is. A control point is two clicks through the editor
// (one edit): where a landmark shows on the scan, then where it is on the map. Points show as pairs joined by their
// residual and are listed with a button to remove each.
// - The lit view is tilted, so the image is drawn as a mesh of small triangles, each mapped by its own affine
//   transform (the ground to the screen is no affine map). Pieces are drawn into an offscreen canvas at full opacity
//   in painting order, clipped to their areas, then onto the view at the set opacity.
// - The opacity is a setting of the page, kept per map and scan in the browser, never in the file.
import type { Catalogue, MapFile, Pt, Source } from '../../map/schema.ts'
import type { Editor } from './editor.ts'
import { fitScan, frameAt, inPiece, scanPieces, type Piece, type ScanFit } from './scan.ts'
import { setField } from './fields.ts'

/** What the overlay needs from the page. */
export interface TraceHost {
  ctx: CanvasRenderingContext2D
  project(x: number, z: number): [number, number] | null
  groundPath(pts: Pt[], close: boolean): void
  redraw(): void
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

const MESH = 16 // cells of the mesh along each side of the image
const SEAM = 0.5 // px each triangle is widened by, so neighbours leave no hairline between them
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
    const image = scan?.file ? this.image(scan.file) : null
    const key = [doc, cat, scan, image]
    if (!force && key.length === this.last.length && key.every((k, i) => k === this.last[i])) return
    this.last = key
    this.ui.opacity.value = setting(this.key(`opacity:${scan?.id ?? ''}`)) ?? String(OPACITY)
    this.shown = null
    if (scan && cat && doc && image?.state === 'ready') {
      const img = image.img
      const fit = fitScan(scan.points ?? [], img.width, img.height, doc.extent)
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
      createImageBitmap(img).then(
        bmp => {
          this.images.set(file, { state: 'ready', img: bmp })
          this.update()
        },
        (err: Error) => {
          this.images.set(file, { state: 'missing', why: `maps/${file} could not be decoded: ${err.message}` })
          this.update()
        },
      )
    }
    img.onerror = () => {
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
    if (!scan) this.ui.state.textContent = ''
    else if (image?.state === 'missing') this.ui.state.textContent = image.why
    else if (!s) this.ui.state.textContent = image?.state === 'loading' ? 'reading the image…' : ''
    else {
      const n = s.fit.residuals.length
      const how =
        n === 0
          ? 'no control point: over the map, to place by points'
          : n === 1
            ? 'one point: moved onto it'
            : n === 2
              ? 'two points: moved, turned, scaled'
              : s.fit.degenerate
                ? `${n} points in a line: placed by the first two`
                : n === 3
                  ? 'three points: an affine fit through them (a fourth tells its error)'
                  : `${n} points, bent through each: ${s.fit.rms!.toFixed(1)} m root mean square where the others put each`
      const where = s.pieces.length ? '' : ' · its frame has no relief piece on the map: it shows nowhere'
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
        li.append(`${r.toFixed(1)} m `, rm) // the list numbers the points as the map does
        return li
      }),
    )
  }

  /** The copy with the shown scan's points replaced, or null when the scan is gone from it. */
  private withPoints(points: [number, number, number, number][]): MapFile | null {
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
    this.editor.capture(['click where a landmark shows on the scan', 'click where it is on the map'], ([on, at]) => {
      const s = this.shown
      if (!s) return 'the scan is not shown'
      const from = frameAt(s.pieces, on[0], on[1])
      const uv = from ? s.fit.toImage(from[0], from[1]) : null
      const [w, h] = [s.img.width, s.img.height]
      if (!uv || uv[0] < 0 || uv[1] < 0 || uv[0] > w || uv[1] > h) {
        return 'the first click is on the scan: where it shows the landmark'
      }
      const to = frameAt(s.pieces, at[0], at[1])
      if (!to) return 'the second click is where the scan shows (a relief piece cut from its frame)'
      const r = (v: number) => Math.round(v * 100) / 100
      const out = this.withPoints([...(s.scan.points ?? []), [r(uv[0]), r(uv[1]), r(to[0]), r(to[1])]])
      return out ?? 'the scan is gone from the map'
    })
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
    const p = s?.pieces[0]
    if (!s || !p) return null
    const [x, z] = s.fit.toFrame(u, v)
    return [x - p.shift.x, z - p.shift.z]
  }
  /** The last draw's time, ms. */
  ms = 0

  /** Draws the scan under the outlines, at the set opacity, and its control points. */
  draw(width: number, height: number, dpr: number): void {
    const s = this.shown
    if (!s) return
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
    for (const p of s.pieces) this.drawPiece(o, p, width, height)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = Number(this.ui.opacity.value)
    ctx.drawImage(off, 0, 0)
    ctx.restore()
    this.drawPoints()
    this.ms = performance.now() - t0
  }

  /** One piece of the scan: its mesh, clipped to the piece's area. */
  private drawPiece(o: CanvasRenderingContext2D, p: Piece, width: number, height: number): void {
    const s = this.shown!
    const { img, fit } = s
    const [w, h] = [img.width, img.height]
    const screen = (u: number, v: number) => {
      const [x, z] = fit.toFrame(u, v)
      return this.host.project(x - p.shift.x, z - p.shift.z)
    }
    o.save()
    if (p.area) {
      // the piece's rings as one path: its holes left out (even-odd)
      const path = new Path2D()
      for (const ring of p.area) {
        const pts = ring.map(q => this.host.project(q[0], q[1]))
        if (pts.some(q => !q)) continue
        pts.forEach((q, k) => (k ? path.lineTo(q![0], q![1]) : path.moveTo(q![0], q![1])))
        path.closePath()
      }
      o.clip(path, 'evenodd')
    }
    // the mesh's nodes on screen, then each cell as two triangles
    const n = MESH
    const nodes: ([number, number] | null)[][] = []
    for (let j = 0; j <= n; j++) {
      const row: ([number, number] | null)[] = []
      for (let i = 0; i <= n; i++) row.push(screen((w * i) / n, (h * j) / n))
      nodes.push(row)
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u0 = (w * i) / n
        const u1 = (w * (i + 1)) / n
        const v0 = (h * j) / n
        const v1 = (h * (j + 1)) / n
        const a = nodes[j][i]
        const b = nodes[j][i + 1]
        const c = nodes[j + 1][i]
        const d = nodes[j + 1][i + 1]
        if (!a || !b || !c || !d) continue
        // off screen: skipped
        const xs = [a[0], b[0], c[0], d[0]]
        const ys = [a[1], b[1], c[1], d[1]]
        if (Math.max(...xs) < 0 || Math.min(...xs) > width || Math.max(...ys) < 0 || Math.min(...ys) > height) continue
        triangle(o, img, [u0, v0, u1, v0, u0, v1], [a, b, c])
        triangle(o, img, [u1, v0, u1, v1, u0, v1], [b, d, c])
      }
    }
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
        if (!inPiece(p, at[0], at[1])) continue
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

/**
 * Draws one triangle of an image: the pixels (u, v) of `src`'s three corners onto the screen points `dst`, by the
 * affine map that takes the one to the other, clipped to the triangle widened by SEAM.
 */
function triangle(
  o: CanvasRenderingContext2D,
  img: ImageBitmap,
  src: [number, number, number, number, number, number],
  dst: [number, number][],
): void {
  const [u0, v0, u1, v1, u2, v2] = src
  const [[x0, y0], [x1, y1], [x2, y2]] = dst
  const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)
  if (det === 0) return
  // the affine map pixel → screen: [a c e; b d f]
  const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det
  const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det
  const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det
  const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det
  const e = x0 - a * u0 - c * v0
  const f = y0 - b * u0 - d * v0
  // the clip: the triangle pushed out from its centre by SEAM px
  const cx = (x0 + x1 + x2) / 3
  const cy = (y0 + y1 + y2) / 3
  const out = (x: number, y: number): [number, number] => {
    const l = Math.hypot(x - cx, y - cy) || 1
    return [x + ((x - cx) / l) * SEAM, y + ((y - cy) / l) * SEAM]
  }
  o.save()
  o.beginPath()
  const p0 = out(x0, y0)
  const p1 = out(x1, y1)
  const p2 = out(x2, y2)
  o.moveTo(p0[0], p0[1])
  o.lineTo(p1[0], p1[1])
  o.lineTo(p2[0], p2[1])
  o.closePath()
  o.clip()
  o.transform(a, b, c, d, e, f)
  // only the triangle's pixels are read: its box of the image
  const su = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1)
  const sv = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 1)
  const sw = Math.min(img.width, Math.ceil(Math.max(u0, u1, u2)) + 1) - su
  const sh = Math.min(img.height, Math.ceil(Math.max(v0, v1, v2)) + 1) - sv
  o.drawImage(img, su, sv, sw, sh, su, sv, sw, sh)
  o.restore()
}
