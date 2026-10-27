// A map's ways traced off its scan (docs/plans/active/m8-austerlitz.md M8c): each road read as a few waypoints on the
// scan, and between each two a least-cost path over the scan that follows the line the surveyor drew (a pixel darker
// than the paper around it is cheap, paper is dear), placed through the scan's fit and the relief piece into the map,
// cut to the map and simplified. Only the ways the tool makes (way kinds with the scan as their source) are written
// again; every other feature is kept (the stable save, src/map/write.ts).
//   node tools/ways.ts <map.json> <ways inputs.json>
// The inputs: { piece, scan, image (a PNG copy of the scan, which git ignores like the scan: sips -s format png),
// ways: [{ id, kind, width?, note, pts: [[u, v], …] }] }, the waypoints in the scan's pixels, v down.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { demPlace } from '../src/map/dem.ts'
import { writeMap } from '../src/map/write.ts'
import { fitScan } from '../src/app/map/scan.ts'
import { read as readPng } from './png.mjs'
import { Heap, simplify } from './streams.ts'
import { mapPieces, scanSize } from './water.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface WayInputs {
  piece: string
  scan: string
  image: string
  ways: { id: string; kind: string; width?: number; note: string; pts: [number, number][] }[]
}
/** A grey image: w × h luminances, the top row first. */
export interface Grey {
  w: number
  h: number
  l: Float32Array
}

/** An RGBA image as luminance. */
export function grey({ w, h, data }: { w: number; h: number; data: Uint8Array }): Grey {
  const l = new Float32Array(w * h)
  for (let k = 0; k < w * h; k++) l[k] = 0.3 * data[4 * k] + 0.59 * data[4 * k + 1] + 0.11 * data[4 * k + 2]
  return { w, h, l }
}

/**
 * Each pixel's cost to pass: 1 on ink (darker than the mean of the `r`-pixel box around it by `contrast` or more), up
 * to 1 + `dear` on paper (no darker than its box). Local, because the sheets' paper differs from 0.65 to 0.95 of white.
 */
export function inkCost(g: Grey, r = 7, contrast = 25, dear = 30): Float32Array {
  const { w, h, l } = g
  // an integral image for the box means
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += l[y * w + x]
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row
    }
  }
  const cost = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      const dark = Math.max(0, Math.min(1, (mean - l[y * w + x]) / contrast))
      cost[y * w + x] = 1 + dear * (1 - dark)
    }
  }
  return cost
}

/**
 * The least-cost path between two pixels over a cost grid (8 neighbours, a diagonal step √2 as dear), searched in their
 * box widened by `pad` pixels: the pixels from a to b.
 */
export function cheapest(cost: Float32Array, w: number, h: number, a: Pt, b: Pt, pad = 80): Pt[] {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0])) - pad)
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1])) - pad)
  const x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0])) + pad)
  const y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1])) + pad)
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const dist = new Float64Array(bw * bh).fill(Infinity)
  const from = new Int32Array(bw * bh).fill(-1)
  const at = (p: Pt) => (Math.round(p[1]) - y0) * bw + (Math.round(p[0]) - x0)
  const start = at(a)
  const goal = at(b)
  dist[start] = 0
  const q = new Heap()
  q.push(start, 0)
  const DX = [1, 1, 0, -1, -1, -1, 0, 1]
  const DY = [0, 1, 1, 1, 0, -1, -1, -1]
  while (q.size) {
    const k = q.pop()
    if (k === goal) break
    const x = k % bw
    const y = (k - x) / bw
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d]
      const ny = y + DY[d]
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
      const n = ny * bw + nx
      const step = (d % 2 ? Math.SQRT2 : 1) * cost[(ny + y0) * w + nx + x0]
      if (dist[k] + step < dist[n]) {
        dist[n] = dist[k] + step
        from[n] = k
        q.push(n, dist[n])
      }
    }
  }
  const out: Pt[] = []
  for (let k = goal; k >= 0; k = k === start ? -1 : from[k]) out.push([(k % bw) + x0, Math.floor(k / bw) + y0])
  return out.reverse()
}

/**
 * A pixel path evened by a moving mean over `r` pixels on each side, narrowed near its ends so it stays centred (its
 * ends kept): the path steps between a road's two drawn edges and along its staircase of pixels, which simplified
 * would leave spikes and small loops.
 */
export function evenPath(px: Pt[], r: number): Pt[] {
  return px.map((p, k) => {
    const s = Math.min(r, k, px.length - 1 - k)
    if (s === 0) return p
    const a = k - s
    const b = k + s
    let x = 0
    let y = 0
    for (let i = a; i <= b; i++) {
      x += px[i][0]
      y += px[i][1]
    }
    return [x / (b - a + 1), y / (b - a + 1)]
  })
}

function main(): void {
  const [mapFile, inputsFile] = process.argv.slice(2)
  if (!mapFile || !inputsFile) {
    console.error('usage: node tools/ways.ts <map.json> <ways inputs.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(mapFile, 'utf8')
  const map = JSON.parse(text) as MapFile
  const ins = JSON.parse(fs.readFileSync(inputsFile, 'utf8')) as WayInputs
  const piece = map.features.find(f => f.id === ins.piece)
  const scan = map.sources?.find(s => s.id === ins.scan)
  if (!piece || !scan?.file) throw new Error(`no piece ${ins.piece} or scan ${ins.scan}`)
  const place = demPlace(piece as unknown as Record<string, unknown>)
  const dir = path.dirname(mapFile)
  const [iw, ih] = scanSize(path.join(dir, scan.file))
  const img = readPng(fs.readFileSync(path.join(dir, ins.image))) as { w: number; h: number; data: Uint8Array }
  if (img.w !== iw || img.h !== ih) throw new Error(`${ins.image} is ${img.w} × ${img.h}, the scan ${iw} × ${ih}`)
  const g = grey(img)
  const cost = inkCost(g)
  const fit = fitScan(scan.points ?? [], iw, ih, {
    w: map.extent.w * place.k,
    h: map.extent.h * place.k,
    x: place.x,
    z: place.z,
  })
  const half: Pt = [map.extent.w / 2, map.extent.h / 2]
  const features: Record<string, unknown>[] = []
  const report: string[] = []
  for (const way of ins.ways) {
    // the path through each pair of waypoints, joined (each leg's first pixel is the last one's last)
    const px: Pt[] = []
    for (let k = 1; k < way.pts.length; k++) {
      const leg = cheapest(cost, g.w, g.h, way.pts[k - 1], way.pts[k])
      px.push(...(k > 1 ? leg.slice(1) : leg))
    }
    // evened, in the file's frame, simplified to 3 m of field, then into the map and cut to it (no sliver under 20 m)
    const frame = simplify(
      evenPath(px, 8).map(([u, v]) => fit.toFrame(u + 0.5, v + 0.5)),
      3,
    )
    const pieces = mapPieces(frame, place, half, 20)
    pieces.forEach((line, k) => {
      features.push({
        id: k ? `${way.id}${k + 1}` : way.id,
        kind: way.kind,
        source: ins.scan,
        line,
        ...(way.width !== undefined ? { width: way.width } : {}),
        note: `${way.note}: traced off the survey along its line`,
      })
    })
    report.push(`${way.id}: ${px.length} px traced, ${pieces.length} piece(s) in the map`)
  }
  // the ways this tool made last time: replaced; every other feature kept
  const mine = (f: Feature) => (f.kind ?? '').startsWith('way.') && f.source === ins.scan
  const others = map.features.filter(f => !mine(f))
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${features.length} ways`)
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
