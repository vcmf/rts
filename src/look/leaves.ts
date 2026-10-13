// The leaf-clump atlas for the card crowns (docs/plans/done/l7a-canopy-cards.md): four clumps in a 2×2 grid of
// CELL² cells, R the painted value (normalised), A the coverage, G and B each leaf's tilt (L7b: the value's gradient,
// read as a height; 0.5 is flat). Made from a picture of four clumps on black (any
// layout: split at the empty gutters nearest the middle) or drawn procedurally. The palette paints it (the
// picture's colours are never used: docs/art-bible.md §4b).
import { mulberry } from './noise.ts'

export const CELL = 512
const BLACK = 14   // brightness at or below this is background

// a picture's brightness, 0..255 per pixel
function brightnessOf(img: CanvasImageSource & { width: number; height: number }): { w: number; h: number; l: Float32Array } {
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
  const g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, cv.width, cv.height).data, l = new Float32Array(cv.width * cv.height)
  for (let i = 0; i < l.length; i++) l[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  return { w: cv.width, h: cv.height, l }
}

// the empty line (row or column) nearest the middle between lo and hi, or the middle itself
function gutter(empty: (k: number) => boolean, lo: number, hi: number): number {
  const mid = (lo + hi) >> 1
  for (let d = 0; d < (hi - lo) / 2; d++) { if (empty(mid - d)) return mid - d; if (empty(mid + d)) return mid + d }
  return mid
}

export function atlasFromPicture(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const { w, h, l } = brightnessOf(img)
  const rowEmpty = (y: number, x0: number, x1: number) => { for (let x = x0; x < x1; x++) if (l[y * w + x] > BLACK) return false; return true }
  const colEmpty = (x: number, y0: number, y1: number) => { for (let y = y0; y < y1; y++) if (l[y * w + x] > BLACK) return false; return true }
  const gx = gutter(x => colEmpty(x, 0, h), 0, w)
  const boxes: [number, number, number, number][] = []
  for (const [x0, x1] of [[0, gx], [gx, w]]) {
    const gy = gutter(y => rowEmpty(y, x0, x1), 0, h)
    for (const [y0, y1] of [[0, gy], [gy, h]]) {
      // the clump's bounds inside its quarter
      let bx0 = x1, by0 = y1, bx1 = x0, by1 = y0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (l[y * w + x] > BLACK) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y) }
      if (bx1 < bx0) throw new Error('the leaf picture needs four clumps on black, one per quarter')
      boxes.push([bx0, by0, bx1 + 1, by1 + 1])
    }
  }
  // the value range of every clump's pixels, so the darkest leaf maps near 0 and the brightest near 1
  const vals: number[] = []
  for (let i = 0; i < l.length; i += 7) if (l[i] > 40) vals.push(l[i])
  vals.sort((a, b) => a - b)
  const v0 = vals[Math.floor(vals.length * 0.02)] ?? 40, v1 = vals[Math.floor(vals.length * 0.98)] ?? 255
  const out = document.createElement('canvas'); out.width = out.height = CELL * 2
  const og = out.getContext('2d')!, od = og.createImageData(CELL * 2, CELL * 2)
  boxes.forEach(([bx0, by0, bx1, by1], k) => {
    // fit the clump to its cell, centred, with a small margin so mips never bleed into a neighbour
    const s = Math.max(bx1 - bx0, by1 - by0) / (CELL * 0.94), cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2
    const ox = (k >> 1) * CELL, oy = (k & 1) * CELL
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const sx = cx + (x + 0.5 - CELL / 2) * s, sy = cy + (y + 0.5 - CELL / 2) * s
      let v = 0
      if (sx >= bx0 && sx < bx1 - 1 && sy >= by0 && sy < by1 - 1) {   // bilinear
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy, at = (u: number, t: number) => l[t * w + u]
        v = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
      }
      const a = Math.min(1, Math.max(0, (v - BLACK) / 24)), q = ((oy + y) * CELL * 2 + ox + x) * 4
      const n = v1 - v0 < 1 ? 0.6 : Math.min(1, Math.max(0, (v - v0) / (v1 - v0)))   // a flat picture: one mid value
      od.data[q] = od.data[q + 1] = od.data[q + 2] = Math.round(n * 255); od.data[q + 3] = Math.round(a * 255)
    }
  })
  og.putImageData(od, 0, 0)
  return withTilt(out)
}

// each leaf's tilt (L7b, docs/plans/done/l7b-crown-volume.md): the value read as a height, its gradient over
// TILT_PX pixels into G (across) and B (down), 0.5 flat. The canvas keeps colour premultiplied, so where there is no
// leaf G and B upload as 0 whatever is written: the shader divides them by the coverage, as it does the value
const TILT_PX = 3, TILT_GAIN = 5
function withTilt(cv: HTMLCanvasElement): HTMLCanvasElement {
  const g = cv.getContext('2d', { willReadFrequently: true })!, W = cv.width, H = cv.height, img = g.getImageData(0, 0, W, H), d = img.data
  const v = new Float32Array(W * H); for (let i = 0; i < v.length; i++) v[i] = d[i * 4 + 3] > 0 ? d[i * 4] / 255 : 0
  const at = (x: number, y: number) => v[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = (y * W + x) * 4
    if (d[q + 3] === 0) continue
    const gx = (at(x + TILT_PX, y) - at(x - TILT_PX, y)) / (2 * TILT_PX), gy = (at(x, y + TILT_PX) - at(x, y - TILT_PX)) / (2 * TILT_PX)
    d[q + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, -gx * TILT_GAIN * TILT_PX))); d[q + 2] = Math.round(128 + 127 * Math.max(-1, Math.min(1, -gy * TILT_GAIN * TILT_PX)))
  }
  g.putImageData(img, 0, 0)
  return cv
}

// four clumps of lobed leaves drawn with canvas paths: dense in the middle, loose single leaves at the edge
export function atlasProcedural(seed = 7): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = out.height = CELL * 2
  const g = out.getContext('2d')!, R = mulberry(seed)
  g.clearRect(0, 0, out.width, out.height)
  const leaf = (x: number, y: number, len: number, ang: number, v: number) => {
    // an oak-like leaf: a long oval with three rounded lobes a side
    g.save(); g.translate(x, y); g.rotate(ang); g.beginPath()
    const wdt = len * 0.32
    g.moveTo(0, -len / 2)
    const lobe = (k: number, side: number, down: boolean) => {
      const t0 = -0.5 + k / 3, t1 = t0 + 1 / 3, wv = wdt * (0.75 + 0.25 * Math.sin((k + 1) * 1.1))
      g.quadraticCurveTo(side * wv * 1.25, (t0 + 1 / 6) * len, side * wv * 0.55, (down ? t1 : t0) * len)
    }
    for (let k = 0; k < 3; k++) lobe(k, 1, true)       // down the right side to the tip
    g.lineTo(0, len / 2)
    for (let k = 2; k >= 0; k--) lobe(k, -1, false)    // and back up the left
    g.closePath()
    const c = Math.round(255 * v); g.fillStyle = `rgb(${c},${c},${c})`; g.fill(); g.restore()
  }
  for (let k = 0; k < 4; k++) {
    const ox = (k >> 1) * CELL + CELL / 2, oy = (k & 1) * CELL + CELL / 2
    // back to front: darker, inner leaves first, brighter ones over them; a few loose ones round the edge
    for (let i = 0; i < 150; i++) {
      const t = i / 150, r = Math.sqrt(R()) * CELL * 0.36 * (1 - 0.35 * t), a = R() * Math.PI * 2
      leaf(ox + Math.cos(a) * r, oy + Math.sin(a) * r, CELL * (0.11 + R() * 0.05), R() * Math.PI * 2, 0.25 + 0.6 * t + (R() - 0.5) * 0.2)
    }
    for (let i = 0; i < 9; i++) {
      const r = CELL * (0.38 + R() * 0.07), a = R() * Math.PI * 2
      leaf(ox + Math.cos(a) * r, oy + Math.sin(a) * r, CELL * (0.08 + R() * 0.04), a + Math.PI / 2, 0.5 + R() * 0.3)
    }
  }
  return withTilt(out)
}

export const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((ok, no) => {
  const img = new Image(); img.onload = () => ok(img); img.onerror = () => no(new Error(`the leaf picture ${src} did not load`)); img.src = src
})
