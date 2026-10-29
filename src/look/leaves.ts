// The leaf-clump atlas for the card crowns (docs/plans/done/l7a-canopy-cards.md): four clumps in a 2×2 grid of
// CELL² cells, R the painted value (normalised), A the coverage, G and B each leaf's tilt (L7b: the value's gradient,
// read as a height; 0.5 is flat). Made from a picture of four clumps on black (any
// layout: split at the empty gutters nearest the middle) or drawn procedurally. The palette paints it (the
// picture's colours are never used: docs/art-bible.md §4b).
import { mulberry } from './noise.ts'

export const CELL = 512
const BLACK = 14 // brightness at or below this is background

// a picture's brightness, 0..255 per pixel
function brightnessOf(img: CanvasImageSource & { width: number; height: number }): {
  w: number
  h: number
  l: Float32Array
} {
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, cv.width, cv.height).data
  const l = new Float32Array(cv.width * cv.height)
  for (let i = 0; i < l.length; i++) l[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  return { w: cv.width, h: cv.height, l }
}

// the empty line (row or column) nearest the middle between lo and hi, or the middle itself
function gutter(empty: (k: number) => boolean, lo: number, hi: number): number {
  const mid = (lo + hi) >> 1
  for (let d = 0; d < (hi - lo) / 2; d++) {
    if (empty(mid - d)) return mid - d
    if (empty(mid + d)) return mid + d
  }
  return mid
}

export function atlasFromPicture(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const { w, h, l } = brightnessOf(img)
  const rowEmpty = (y: number, x0: number, x1: number) => {
    for (let x = x0; x < x1; x++) if (l[y * w + x] > BLACK) return false
    return true
  }
  const colEmpty = (x: number, y0: number, y1: number) => {
    for (let y = y0; y < y1; y++) if (l[y * w + x] > BLACK) return false
    return true
  }
  const gx = gutter(x => colEmpty(x, 0, h), 0, w)
  const boxes: [number, number, number, number][] = []
  for (const [x0, x1] of [
    [0, gx],
    [gx, w],
  ]) {
    const gy = gutter(y => rowEmpty(y, x0, x1), 0, h)
    for (const [y0, y1] of [
      [0, gy],
      [gy, h],
    ]) {
      // the clump's bounds inside its quarter
      let bx0 = x1
      let by0 = y1
      let bx1 = x0
      let by1 = y0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (l[y * w + x] > BLACK) {
            bx0 = Math.min(bx0, x)
            bx1 = Math.max(bx1, x)
            by0 = Math.min(by0, y)
            by1 = Math.max(by1, y)
          }
        }
      }
      if (bx1 < bx0) throw new Error('the leaf picture needs four clumps on black, one per quarter')
      boxes.push([bx0, by0, bx1 + 1, by1 + 1])
    }
  }
  // the value range of every clump's pixels, so the darkest leaf maps near 0 and the brightest near 1
  const vals: number[] = []
  for (let i = 0; i < l.length; i += 7) if (l[i] > 40) vals.push(l[i])
  vals.sort((a, b) => a - b)
  const v0 = vals[Math.floor(vals.length * 0.02)] ?? 40
  const v1 = vals[Math.floor(vals.length * 0.98)] ?? 255
  const out = document.createElement('canvas')
  out.width = out.height = CELL * 2
  const og = out.getContext('2d')!
  const od = og.createImageData(CELL * 2, CELL * 2)
  boxes.forEach(([bx0, by0, bx1, by1], k) => {
    // fit the clump to its cell, centred, with a small margin so mips never bleed into a neighbour
    const s = Math.max(bx1 - bx0, by1 - by0) / (CELL * 0.94)
    const cx = (bx0 + bx1) / 2
    const cy = (by0 + by1) / 2
    const ox = (k >> 1) * CELL
    const oy = (k & 1) * CELL
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const sx = cx + (x + 0.5 - CELL / 2) * s
        const sy = cy + (y + 0.5 - CELL / 2) * s
        let v = 0
        if (sx >= bx0 && sx < bx1 - 1 && sy >= by0 && sy < by1 - 1) {
          // bilinear
          const ix = Math.floor(sx)
          const iy = Math.floor(sy)
          const fx = sx - ix
          const fy = sy - iy
          const at = (u: number, t: number) => l[t * w + u]
          v =
            (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) +
            (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
        }
        const a = Math.min(1, Math.max(0, (v - BLACK) / 24))
        const q = ((oy + y) * CELL * 2 + ox + x) * 4
        const n = v1 - v0 < 1 ? 0.6 : Math.min(1, Math.max(0, (v - v0) / (v1 - v0))) // a flat picture: one mid value
        od.data[q] = od.data[q + 1] = od.data[q + 2] = Math.round(n * 255)
        od.data[q + 3] = Math.round(a * 255)
      }
    }
  })
  og.putImageData(od, 0, 0)
  return withTilt(out)
}

// each leaf's tilt (L7b, docs/plans/done/l7b-crown-volume.md): the value read as a height, its gradient over
// TILT_PX pixels into G (across) and B (down), 0.5 flat. The canvas keeps colour premultiplied, so where there is no
// leaf G and B upload as 0 whatever is written: the shader divides them by the coverage, as it does the value
const TILT_PX = 3
const TILT_GAIN = 5
function withTilt(cv: HTMLCanvasElement): HTMLCanvasElement {
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const W = cv.width
  const H = cv.height
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const v = new Float32Array(W * H)
  for (let i = 0; i < v.length; i++) v[i] = d[i * 4 + 3] > 0 ? d[i * 4] / 255 : 0
  const at = (x: number, y: number) => v[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4
      if (d[q + 3] === 0) continue
      const gx = (at(x + TILT_PX, y) - at(x - TILT_PX, y)) / (2 * TILT_PX)
      const gy = (at(x, y + TILT_PX) - at(x, y - TILT_PX)) / (2 * TILT_PX)
      d[q + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, -gx * TILT_GAIN * TILT_PX)))
      d[q + 2] = Math.round(128 + 127 * Math.max(-1, Math.min(1, -gy * TILT_GAIN * TILT_PX)))
    }
  }
  g.putImageData(img, 0, 0)
  return cv
}

// four clumps of lobed leaves drawn with canvas paths: dense in the middle, loose single leaves at the edge
export function atlasProcedural(seed = 7): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = out.height = CELL * 2
  const g = out.getContext('2d')!
  const R = mulberry(seed)
  g.clearRect(0, 0, out.width, out.height)
  const leaf = (x: number, y: number, len: number, ang: number, v: number) => {
    // an oak-like leaf: a long oval with three rounded lobes a side
    g.save()
    g.translate(x, y)
    g.rotate(ang)
    g.beginPath()
    const wdt = len * 0.32
    g.moveTo(0, -len / 2)
    const lobe = (k: number, side: number, down: boolean) => {
      const t0 = -0.5 + k / 3
      const t1 = t0 + 1 / 3
      const wv = wdt * (0.75 + 0.25 * Math.sin((k + 1) * 1.1))
      g.quadraticCurveTo(side * wv * 1.25, (t0 + 1 / 6) * len, side * wv * 0.55, (down ? t1 : t0) * len)
    }
    for (let k = 0; k < 3; k++) lobe(k, 1, true) // down the right side to the tip
    g.lineTo(0, len / 2)
    for (let k = 2; k >= 0; k--) lobe(k, -1, false) // and back up the left
    g.closePath()
    const c = Math.round(255 * v)
    g.fillStyle = `rgb(${c},${c},${c})`
    g.fill()
    g.restore()
  }
  for (let k = 0; k < 4; k++) {
    const ox = (k >> 1) * CELL + CELL / 2
    const oy = (k & 1) * CELL + CELL / 2
    // back to front: darker, inner leaves first, brighter ones over them; a few loose ones round the edge
    for (let i = 0; i < 150; i++) {
      const t = i / 150
      const r = Math.sqrt(R()) * CELL * 0.36 * (1 - 0.35 * t)
      const a = R() * Math.PI * 2
      leaf(
        ox + Math.cos(a) * r,
        oy + Math.sin(a) * r,
        CELL * (0.11 + R() * 0.05),
        R() * Math.PI * 2,
        0.25 + 0.6 * t + (R() - 0.5) * 0.2,
      )
    }
    for (let i = 0; i < 9; i++) {
      const r = CELL * (0.38 + R() * 0.07)
      const a = R() * Math.PI * 2
      leaf(ox + Math.cos(a) * r, oy + Math.sin(a) * r, CELL * (0.08 + R() * 0.04), a + Math.PI / 2, 0.5 + R() * 0.3)
    }
  }
  return withTilt(out)
}

/** The painted atlases' kinds (docs/plans/active/crown-leaves.md): a rosette of pointed leaves, or pinnate sprays */
export type PaintedLeaves = 'painted' | 'sprays'

// a painted leaf in the clump's canvas space: its base, the way it points (radians, canvas x right and y down), its
// length and width, its tone (0..1) and its lean (the clump's dome at its place, canvas x and y, -1..1)
interface Leaf {
  x: number
  y: number
  ang: number
  len: number
  wid: number
  tone: number
  lean: [number, number]
}

const FOLD = 0.55 // how far each half of a leaf leans off its midrib (the lit half and the shaded half)
const EDGE = 0.7 // a leaf's edge, the share of its tone (a darker line round each leaf)
const GAP = 0.22 // the clear gap round a leaf, as a share of its half-width

// a pointed leaf's outline, from its base at the origin to its tip at (0, -len): widest a third of the way up
function leafPath(g: CanvasRenderingContext2D, len: number, wid: number): void {
  g.beginPath()
  g.moveTo(0, 0)
  g.bezierCurveTo(wid * 0.95, -len * 0.12, wid * 0.85, -len * 0.62, 0, -len)
  g.bezierCurveTo(-wid * 0.85, -len * 0.62, -wid * 0.95, -len * 0.12, 0, 0)
  g.closePath()
}

const byte = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)))
const tiltByte = (v: number) => Math.round(128 + 127 * Math.max(-1, Math.min(1, v)))

/**
 * Draws one leaf into the value canvas (a clear gap cut round it, its one flat tone, a darker edge) and into the
 * tilt canvas (R the lean across, G the lean down, as withTilt writes G and B: the clump's dome plus the fold, each
 * half of the leaf leaning away from the midrib)
 */
function paintLeaf(val: CanvasRenderingContext2D, tilt: CanvasRenderingContext2D, f: Leaf): void {
  // the leaf's axes in the canvas: it points along ang; across is its right hand
  const rot = f.ang + Math.PI / 2
  for (const g of [val, tilt]) {
    g.save()
    g.translate(f.x, f.y)
    g.rotate(rot)
    leafPath(g, f.len, f.wid)
  }
  // a clear gap round the leaf: what lies under its outline is cut away first, so overlapping leaves part
  val.globalCompositeOperation = 'destination-out'
  val.lineWidth = Math.max(2, f.wid * GAP)
  val.stroke()
  val.globalCompositeOperation = 'source-over'
  // one flat tone a leaf, a darker edge (the mips keep the parting where the gap is too thin to stay)
  val.fillStyle = `rgb(${byte(f.tone)},0,0)`
  val.fill()
  val.lineWidth = Math.max(1.5, f.wid * 0.06)
  val.strokeStyle = `rgb(${byte(f.tone * EDGE)},0,0)`
  val.stroke()
  // the fold: across the leaf (its local x) the halves lean apart, a hard crease at the midrib
  const ax = Math.cos(rot)
  const ay = Math.sin(rot)
  const side = (s: number) => `rgb(${tiltByte(f.lean[0] + s * FOLD * ax)},${tiltByte(f.lean[1] + s * FOLD * ay)},0)`
  const fold = tilt.createLinearGradient(-f.wid, 0, f.wid, 0)
  fold.addColorStop(0, side(-1))
  fold.addColorStop(0.5, side(-1))
  fold.addColorStop(0.5, side(1))
  fold.addColorStop(1, side(1))
  tilt.fillStyle = fold
  tilt.fill()
  tilt.lineWidth = val.lineWidth
  tilt.strokeStyle = `rgb(${tiltByte(f.lean[0])},${tiltByte(f.lean[1])},0)`
  tilt.stroke()
  val.restore()
  tilt.restore()
}

// the leaves of one clump around (0, 0), back to front, within a radius of 0.46 CELL (the card's inset: cardUV)
function clumpLeaves(kind: PaintedLeaves, R: () => number): Leaf[] {
  const out: Leaf[] = []
  const reach = CELL * 0.46
  // a dome: a leaf leans out of the clump by its distance from the middle
  const lean = (x: number, y: number, k = 0.75): [number, number] => [(x / reach) * k, (y / reach) * k]
  // three tones, the deeper leaves darker; t: 0 the back, 1 the front
  const tone = (t: number) => {
    const u = R()
    return u < 0.3 - 0.2 * t ? 0.32 : u < 0.75 - 0.15 * t ? 0.62 : 0.92
  }
  if (kind === 'painted') {
    // a rosette: leaves pointing out of the middle, the outer ones first (lower on the dome), the middle ones on top;
    // each placed by its middle, so the middle of the clump is covered too
    const n = 38
    for (let i = 0; i < n; i++) {
      const t = i / n
      const len = CELL * (0.16 + R() * 0.05)
      const r = Math.sqrt(1 - t) * (reach - len / 2) * (0.8 + 0.2 * R())
      const a = R() * Math.PI * 2
      const ang = a + (R() - 0.5) * 0.9
      const mx = Math.cos(a) * r
      const my = Math.sin(a) * r
      const x = mx - (Math.cos(ang) * len) / 2
      const y = my - (Math.sin(ang) * len) / 2
      out.push({ x, y, ang, len, wid: len * (0.3 + R() * 0.05), tone: tone(t), lean: lean(mx, my) })
    }
    return out
  }
  // sprays: stems out of the middle, each with leaves in pairs along it and one at its tip, the far sprays first
  const sprays = 7
  for (let s = 0; s < sprays; s++) {
    const t = s / sprays
    const a = (s / sprays) * Math.PI * 2 + (R() - 0.5) * 0.7
    const start = CELL * (0.02 + R() * 0.06)
    const leafLen = CELL * (0.13 + R() * 0.03)
    const stem = reach - leafLen - start
    const pairs = 4
    const bend = (R() - 0.5) * 0.5
    for (let p = 0; p <= pairs; p++) {
      const u = p / pairs
      const d = start + stem * u
      const sa = a + bend * u
      const x = Math.cos(sa) * d
      const y = Math.sin(sa) * d
      const len = leafLen * (p === pairs ? 1.05 : 0.8 + 0.25 * u)
      if (p === pairs) {
        out.push({ x, y, ang: sa, len, wid: len * 0.38, tone: tone(t * 0.6 + u * 0.4), lean: lean(x, y) })
        continue
      }
      for (const side of [-1, 1]) {
        // the pair: each leaf off the stem at about 50 degrees, pointing on toward the stem's tip
        const la = sa + side * (0.75 + (R() - 0.5) * 0.25)
        out.push({ x, y, ang: la, len, wid: len * 0.38, tone: tone(t * 0.6 + u * 0.4), lean: lean(x, y) })
      }
    }
  }
  return out
}

/**
 * The painted atlas (docs/plans/active/crown-leaves.md): four clumps of pointed, stylised leaves in the 2×2 cells,
 * value in R, each leaf's tilt in G and B (written per leaf, not from the value's gradient), coverage in A: plain
 * almond leaves, no veins or lobes, three flat values one per leaf, a clear gap round each, each leaf a lit half and a
 * shaded half by its tilt; 'painted' a rosette of 38 (the owner's simple-leaf sheet, interim), 'sprays' pinnate
 * sprays closer to Tiny Glade's
 */
export function atlasPainted(kind: PaintedLeaves, seed = 11): HTMLCanvasElement {
  const S = CELL * 2
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = c.height = S
    return [c, c.getContext('2d', { willReadFrequently: true })!] as const
  }
  const [vc, vg] = mk()
  const [, tg] = mk()
  const R = mulberry(seed)
  for (let k = 0; k < 4; k++) {
    const ox = (k >> 1) * CELL
    const oy = (k & 1) * CELL
    for (const g of [vg, tg]) {
      g.save()
      g.beginPath()
      g.rect(ox + CELL * 0.025, oy + CELL * 0.025, CELL * 0.95, CELL * 0.95) // never into a neighbour's mips
      g.clip()
      g.translate(ox + CELL / 2, oy + CELL / 2)
    }
    for (const f of clumpLeaves(kind, R)) paintLeaf(vg, tg, f)
    vg.restore()
    tg.restore()
  }
  const v = vg.getImageData(0, 0, S, S)
  const t = tg.getImageData(0, 0, S, S).data
  for (let i = 0; i < v.data.length; i += 4) {
    v.data[i + 1] = v.data[i + 3] ? t[i] : 0
    v.data[i + 2] = v.data[i + 3] ? t[i + 1] : 0
  }
  vg.putImageData(v, 0, 0)
  return vc
}

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((ok, no) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => no(new Error(`the leaf picture ${src} did not load`))
    img.src = src
  })
