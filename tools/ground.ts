// A map's woods, meadows and orchards read off its scan (docs/plans/active/m8-austerlitz.md M8f): the survey's green
// (its wash and its tree stipple, more saturated and greener than its paper, judged over a box) found pixel by pixel,
// split into its connected regions, each labelled by the inputs' seeds (a meadow, an orchard; a wood where none
// falls in it), traced around its pixels' edges, simplified and placed through the scan's fit and the relief piece
// into the map. The open land between is the survey's arable: one field over the whole map, under the meadows. Only
// the features the tool makes (with the scan as their source and its note) are written again; every other feature is
// kept (the stable save, src/map/write.ts).
//   node tools/ground.ts <map.json> <ground inputs.json>
// The inputs: { piece, scan, image (the scan's PNG copy), meadows: [[u, v], …] (a pixel in each meadow), orchards:
// [{ id, note, area: [[u, v], …] }] (drawn round, their beds' green dropped), minArea (m² of map) }, in the scan's
// pixels, v down.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { demPlace, toMap } from '../src/map/dem.ts'
import { inRing, ringArea2, ringCrossing } from '../src/map/geometry.ts'
import { cm } from '../src/map/util.ts'
import { writeMap } from '../src/map/write.ts'
import { read as readPng } from './png.mjs'
import { simplify } from './streams.ts'
import { scanFitOf } from './water.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface GroundInputs {
  piece: string
  scan: string
  image: string
  meadows: Pt[]
  orchards: { id: string; note: string; area: Pt[] }[]
  minArea: number
}

/** A box mean over `r` pixels each way of a w × h grid, by its integral. */
export function boxMean(a: Float64Array, w: number, h: number, r: number): Float64Array {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += a[y * w + x]
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row
    }
  }
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    const [y0, y1] = [Math.max(0, y - r), Math.min(h, y + r + 1)]
    for (let x = 0; x < w; x++) {
      const [x0, x1] = [Math.max(0, x - r), Math.min(w, x + r + 1)]
      out[y * w + x] =
        (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) /
        ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

/**
 * The survey's green: a pixel whose saturation over its box (`r` each way) exceeds `sat` and whose hue lies at
 * `hue`° or greener (the paper's is about 46°, its saturation about 0.31; the wash and the woods' about 0.45 at 50 to
 * 60°). 1 where green.
 */
export function greenOf(rgba: Uint8Array, w: number, h: number, r = 6, sat = 0.4, hue = 48): Uint8Array {
  const S = new Float64Array(w * h)
  const H = new Float64Array(w * h)
  for (let k = 0; k < w * h; k++) {
    const [R, G, B] = [rgba[4 * k], rgba[4 * k + 1], rgba[4 * k + 2]]
    const mx = Math.max(R, G, B)
    const d = mx - Math.min(R, G, B)
    let hh = 0
    if (d) hh = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4
    H[k] = (hh * 60 + 360) % 360
    S[k] = mx ? d / mx : 0
  }
  const s = boxMean(S, w, h, r)
  const hb = boxMean(H, w, h, r)
  const out = new Uint8Array(w * h)
  for (let k = 0; k < w * h; k++) out[k] = s[k] > sat && hb[k] >= hue && hb[k] <= 120 ? 1 : 0
  return out
}

/**
 * A mask with no two of its ones (or of its zeros) touching only at a corner: in every 2 × 2 block of ones on one
 * diagonal and zeros on the other, a zero becomes a one. Such a corner is where a traced ring would meet itself.
 */
export function noPinches(mask: Uint8Array, w: number, h: number): Uint8Array {
  const m = mask.slice()
  for (let pass = 0, changed = true; changed && pass < 8; pass++) {
    changed = false
    for (let y = 0; y + 1 < h; y++) {
      for (let x = 0; x + 1 < w; x++) {
        const [a, b, c, d] = [m[y * w + x], m[y * w + x + 1], m[(y + 1) * w + x], m[(y + 1) * w + x + 1]]
        if (a === d && b === c && a !== b) {
          if (a) m[y * w + x + 1] = 1
          else m[y * w + x] = 1
          changed = true
        }
      }
    }
  }
  return m
}

/** Each 4-connected region of a mask's ones, numbered from 1 (0 where the mask is 0), and their sizes in pixels. */
export function regions(mask: Uint8Array, w: number, h: number): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(w * h)
  const sizes = [0]
  const stack: number[] = []
  for (let k0 = 0; k0 < w * h; k0++) {
    if (!mask[k0] || label[k0]) continue
    const n = sizes.length
    sizes.push(0)
    label[k0] = n
    stack.push(k0)
    while (stack.length) {
      const k = stack.pop()!
      sizes[n]++
      const x = k % w
      for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (j >= 0 && j < w * h && mask[j] && !label[j]) {
          label[j] = n
          stack.push(j)
        }
      }
    }
  }
  return { label, sizes }
}

/**
 * The boundaries of the pixels where `inside` holds, as rings of pixel corners (outer rings counter-clockwise in the
 * image's x right, y down, holes clockwise), walked along the pixels' edges; at a corner where two inside pixels meet
 * only diagonally the walk keeps them apart, so every ring is simple.
 */
export function rings(inside: (x: number, y: number) => boolean, w: number, h: number): Pt[][] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y)
  // each directed edge with the inside on its left, keyed by its start corner; four directions: 0 +x, 1 +y, 2 −x, 3 −y
  const DX = [1, 0, -1, 0]
  const DY = [0, 1, 0, -1]
  const seen = new Set<number>()
  const key = (x: number, y: number, d: number) => ((y * (w + 1) + x) << 2) | d
  // an edge from corner (x, y) in direction d has the inside on its left when the pixel left of it is inside and the
  // one right of it is not (image coordinates: y down, so "left" of +x is the pixel above, y − 1)
  const leftPx = (x: number, y: number, d: number): [number, number] =>
    d === 0 ? [x, y - 1] : d === 1 ? [x, y] : d === 2 ? [x - 1, y] : [x - 1, y - 1]
  const rightPx = (x: number, y: number, d: number): [number, number] =>
    d === 0 ? [x, y] : d === 1 ? [x - 1, y] : d === 2 ? [x - 1, y - 1] : [x, y - 1]
  const isEdge = (x: number, y: number, d: number) => at(...leftPx(x, y, d)) && !at(...rightPx(x, y, d))
  const out: Pt[][] = []
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (let d0 = 0; d0 < 4; d0++) {
        if (seen.has(key(x, y, d0)) || !isEdge(x, y, d0)) continue
        const ring: Pt[] = []
        let [cx, cy, d] = [x, y, d0]
        while (!seen.has(key(cx, cy, d))) {
          seen.add(key(cx, cy, d))
          ring.push([cx, cy])
          ;[cx, cy] = [cx + DX[d], cy + DY[d]]
          // the next edge: turn left if it is an edge (keeps diagonal neighbours apart), else straight, else right
          const l = (d + 3) % 4
          const r = (d + 1) % 4
          d = isEdge(cx, cy, l) ? l : isEdge(cx, cy, d) ? d : r
        }
        out.push(ring)
      }
    }
  }
  return out
}

function main(): void {
  const [mapFile, inputsFile] = process.argv.slice(2)
  if (!mapFile || !inputsFile) {
    console.error('usage: node tools/ground.ts <map.json> <ground inputs.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(mapFile, 'utf8')
  const map = JSON.parse(text) as MapFile
  const ins = JSON.parse(fs.readFileSync(inputsFile, 'utf8')) as GroundInputs
  const piece = map.features.find(f => f.id === ins.piece)
  const scan = map.sources?.find(s => s.id === ins.scan)
  if (!piece || !scan?.file) throw new Error(`no piece ${ins.piece} or scan ${ins.scan}`)
  const place = demPlace(piece as unknown as Record<string, unknown>)
  const dir = path.dirname(mapFile)
  const fit = scanFitOf(map, place, scan, dir)
  const img = readPng(fs.readFileSync(path.join(dir, ins.image))) as { w: number; h: number; data: Uint8Array }
  if (img.w !== fit.size[0] || img.h !== fit.size[1]) throw new Error(`${ins.image} is not the scan's size`)
  const { w, h } = img
  const toPoint = ([u, v]: Pt): Pt => {
    const [fx, fz] = fit.toFrame(u, v)
    const [x, z] = toMap(place, fx, fz)
    return [cm(x), cm(z)]
  }
  // the green, only on the map: a pixel's centre 3 m inside its edge, so its corners (under 1.5 m from it) are too
  const green = greenOf(img.data, w, h)
  const [hw, hh] = [map.extent.w / 2, map.extent.h / 2]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!green[y * w + x]) continue
      const [fx, fz] = fit.toFrame(x + 0.5, y + 0.5)
      const [mx, mz] = toMap(place, fx, fz)
      if (Math.abs(mx) > hw - 3 || Math.abs(mz) > hh - 3) green[y * w + x] = 0
    }
  }
  const { label, sizes } = regions(noPinches(green, w, h), w, h)
  // each region's box and centre, in one pass
  const box = sizes.map(() => [w, h, -1, -1, 0, 0])
  for (let k = 0; k < w * h; k++) {
    const n = label[k]
    if (!n) continue
    const [x, y] = [k % w, (k - (k % w)) / w]
    const b = box[n]
    ;[b[0], b[1], b[2], b[3]] = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
    b[4] += x
    b[5] += y
  }
  // each region's kind by the seeds in it; a region centred in an orchard drawn round is dropped
  const kindOf = new Map<number, string>()
  // a seed takes the region nearest it within 10 px (a ribbon of wash is a few pixels wide); one near none is an error
  const seed = ([u, v]: Pt): number => {
    let best = 0
    let bd = Infinity
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const [x, y] = [Math.round(u) + dx, Math.round(v) + dy]
        if (x < 0 || y < 0 || x >= w || y >= h || !label[y * w + x] || dx * dx + dy * dy >= bd) continue
        ;[best, bd] = [label[y * w + x], dx * dx + dy * dy]
      }
    }
    if (!best) throw new Error(`no green within 10 px of the meadow seed ${u}, ${v}`)
    return best
  }
  for (const p of ins.meadows) kindOf.set(seed(p), 'ground.meadow')
  const inOrchard = (n: number) => {
    const [cx, cy] = [box[n][4] / sizes[n], box[n][5] / sizes[n]]
    return ins.orchards.some(o => inRing(o.area, [cx, cy]))
  }
  const pxArea = (() => {
    const [a, b, c] = [toPoint([w / 2, h / 2]), toPoint([w / 2 + 1, h / 2]), toPoint([w / 2, h / 2 + 1])]
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  })()
  const NOTE = ': read off the survey'
  const features: Record<string, unknown>[] = []
  const count = new Map<string, number>()
  for (let n = 1; n < sizes.length; n++) {
    if (sizes[n] * pxArea < ins.minArea || inOrchard(n)) continue
    // its rings: the outer and its holes (holes under the size limit filled)
    const [x0, y0, x1, y1] = box[n]
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    const pxRings = rings((x, y) => label[(y + y0) * w + x + x0] === n, bw, bh)
    const traced: Pt[][] = []
    for (const r of pxRings) {
      // simplified by 1.5 px, less where that makes it cross itself (the pixels' own edges never do)
      const px = r.map(([x, y]) => [x + x0, y + y0] as Pt)
      let ring: Pt[] = []
      for (const tol of [1.5, 0.75, 0]) {
        const pts = tol ? simplify(px, tol) : px
        if (pts.length < 3) break
        ring = pts.map(toPoint)
        if (!ringCrossing(ring)) break
      }
      if (ring.length >= 3 && Math.abs(ringArea2(ring)) / 2 >= ins.minArea) traced.push(ring)
    }
    if (!traced.length) continue
    // the largest ring is the outer one, counter-clockwise in the map (z up); the rest are holes, clockwise
    traced.sort((a, b) => Math.abs(ringArea2(b)) - Math.abs(ringArea2(a)))
    const area = traced.map((r, i) => (ringArea2(r) > 0 === (i === 0) ? r : r.slice().reverse()))
    const kind = kindOf.get(n) ?? 'veg.wood'
    const stem = kind.split('.')[1]
    const k = (count.get(stem) ?? 0) + 1
    count.set(stem, k)
    features.push({ id: `${stem}${k}`, kind, source: ins.scan, area, note: `the survey's ${stem}${NOTE}` })
  }
  // the orchards, as drawn round
  for (const o of ins.orchards) {
    const ring = o.area.map(toPoint)
    features.push({
      id: o.id,
      kind: 'veg.orchard',
      source: ins.scan,
      area: [ringArea2(ring) > 0 ? ring : ring.reverse()],
      note: `${o.note}${NOTE}`,
    })
  }
  // the arable: the whole map, under the meadows and the marsh (a field's priority is 20, a meadow's 10)
  const [ex, ez] = [map.extent.w / 2, map.extent.h / 2]
  features.push({
    id: 'arable',
    kind: 'ground.field',
    source: ins.scan,
    area: [
      [
        [-ex, -ez],
        [ex, -ez],
        [ex, ez],
        [-ex, ez],
      ],
    ],
    priority: 5,
    note: `the open fields, the survey's paper between its woods, meadows and villages${NOTE}`,
  })
  const mine = (f: Feature) =>
    f.source === ins.scan && (f.note ?? '').endsWith(NOTE) && /^(ground|veg)\./.test(f.kind ?? '')
  const others = map.features.filter(f => !mine(f))
  for (const f of features) {
    if (others.some(o => o.id === f.id)) throw new Error(`${String(f.id)}: another feature has this id`)
  }
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log([...count].map(([s, n]) => `${n} ${s}`).join(', ') + ', the arable')
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
