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

/**
 * The atlas from a picture of four clumps on black. painted: a sheet of flat-valued simple leaves (the owner's,
 * docs/plans/active/crown-leaves.md) read as the painter's layers (layered)
 */
export function atlasFromPicture(
  img: CanvasImageSource & { width: number; height: number },
  painted = false,
  leafScale = 1,
): HTMLCanvasElement {
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
  return painted ? layered(out, leafScale) : withTilt(out)
}

// the layered sheet (docs/plans/active/crown-leaves.md): the painter's layers, a dark base, mid leaves, light leaves
// and a few highlight leaves over them, each layer one flat value in R the shader paints (LAYER in canopy.frag)
export const LAYER = [0.12, 0.42, 0.72, 1.0]
const SPLIT = [0.44, 0.82] // a sheet's normalised value: under the first dark, under the second mid, else light
const HIGHLIGHT = 0.3 // the share of the light leaves (each a patch of one value) that become highlights
export const CLUMP_REACH = 0.46 // a layered clump's farthest leaf from its cell's middle (cardUV reads to 0.47)
const SHRINK = 0.8 // a layered cell: three clumps at this scale over each other (smaller leaves, the cell still full)

/**
 * The clumps a layered cell k is painted from, back to front: [sheet clump, x and y offset (cells), turn]: about
 * 3 / leafScale² clumps on a sunflower spiral within the cell, the outer ones first, the cell's own clump last in
 * the middle, so the cell keeps its outline and stays full
 */
export function clumpCopies(k: number, leafScale: number): [number, number, number, number][] {
  const n = Math.ceil(3 / (leafScale * leafScale))
  // the copies' centres: each clump (half-extent 0.47 of a cell at scale 1) stays inside CLUMP_REACH of the cell's
  // middle, so no leaf is cut by the cell's clip (a straight edge across the card, crossing its crown)
  const reach = Math.max(0, CLUMP_REACH - 0.47 * SHRINK * leafScale)
  const out: [number, number, number, number][] = []
  for (let i = n - 1; i >= 1; i--) {
    const r = reach * Math.sqrt(i / (n - 1))
    const a = i * 2.39996 + k * 1.7
    out.push([(k + i) % 4, Math.cos(a) * r, Math.sin(a) * r, (i * 1.37 + k) % (Math.PI * 2)])
  }
  out.push([k, 0, 0, 0])
  return out
}

/**
 * A sheet's clumps as painted layers: each cell the sheet's clumps at SHRINK × leafScale (clumpCopies), so the leaves
 * are smaller and the cell stays full; each pixel's value snapped to its layer (the
 * sheet's dark, mid and light), a share of the light leaves lifted to highlights (a patch of one value at a time,
 * seeded); G each leaf's draw (it drops a layer toward the shade), B flat (no tilt: the crown's own light shades it)
 */
function layered(atlas: HTMLCanvasElement, leafScale: number, seed = 5): HTMLCanvasElement {
  const W = CELL * 2
  const out = document.createElement('canvas')
  out.width = out.height = W
  const g = out.getContext('2d', { willReadFrequently: true })!
  for (let k = 0; k < 4; k++) {
    const ox = (k >> 1) * CELL
    const oy = (k & 1) * CELL
    g.save()
    g.beginPath()
    g.rect(ox + CELL * 0.03, oy + CELL * 0.03, CELL * 0.94, CELL * 0.94) // never into a neighbour's mips
    g.clip()
    for (const [j, dx, dy, rot] of clumpCopies(k, leafScale)) {
      g.save()
      g.translate(ox + CELL * (0.5 + dx), oy + CELL * (0.5 + dy))
      g.rotate(rot)
      g.scale(SHRINK * leafScale, SHRINK * leafScale)
      g.drawImage(atlas, (j >> 1) * CELL, (j & 1) * CELL, CELL, CELL, -CELL / 2, -CELL / 2, CELL, CELL)
      g.restore()
    }
    g.restore()
  }
  const img = g.getImageData(0, 0, W, W)
  const d = img.data
  // the layer of each covered pixel: the sheet's three values (normalised 0..1 by atlasFromPicture), split between
  // their peaks (the owner's sheet: dark 0.17–0.4, mid 0.47–0.74, light 0.9–1)
  const layer = new Int8Array(W * W).fill(-1)
  for (let i = 0; i < layer.length; i++) {
    if (d[i * 4 + 3] > 0) layer[i] = d[i * 4] < SPLIT[0] * 255 ? 0 : d[i * 4] < SPLIT[1] * 255 ? 1 : 2
  }
  // the stray pixels (the sheet's grain near a split, its edges resampled) take their neighbourhood's commonest layer
  const clean = layer.slice()
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (layer[i] < 0) continue
      const n = [0, 0, 0]
      for (let v = -1; v <= 1; v++) {
        for (let u = -1; u <= 1; u++) if (layer[i + v * W + u] >= 0) n[layer[i + v * W + u]]++
      }
      clean[i] = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2
    }
  }
  layer.set(clean)
  // each leaf's patch (4-connected pixels of one layer, mid or light) its own draw in G (the shader drops a leaf to
  // the layer below by it, toward the shade); a share of the light patches lifted to highlights
  const R = mulberry(seed)
  const seen = new Uint8Array(W * W)
  const pick = new Uint8Array(W * W).fill(128)
  const stack: number[] = []
  for (let i = 0; i < layer.length; i++) {
    const L = layer[i]
    if (L < 1 || seen[i]) continue
    const lift = L === 2 && R() < HIGHLIGHT
    const draw = Math.round(R() * 255)
    stack.push(i)
    seen[i] = 1
    while (stack.length) {
      const p = stack.pop()!
      pick[p] = draw
      if (lift) layer[p] = 3
      const x = p % W
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= layer.length || seen[q] || layer[q] !== L) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue
        seen[q] = 1
        stack.push(q)
      }
    }
  }
  for (let i = 0; i < layer.length; i++) {
    if (layer[i] < 0) continue
    d[i * 4] = Math.round(LAYER[layer[i]] * 255)
    d[i * 4 + 1] = pick[i]
    d[i * 4 + 2] = 128
  }
  g.putImageData(img, 0, 0)
  return out
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

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((ok, no) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => no(new Error(`the leaf picture ${src} did not load`))
    img.src = src
  })
