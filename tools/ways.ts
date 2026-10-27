// A map's ways traced off its scan (docs/plans/active/m8-austerlitz.md M8c): each road read as a few waypoints on the
// scan, and between each two a least-cost path over the scan that follows the line the surveyor drew (a pixel darker
// than the paper around it is cheap, paper is dear), placed through the scan's fit and the relief piece into the map,
// cut to the map and simplified. Roads meet exactly: a junction named once in the inputs is one pixel on every road
// through it, and a road running along an earlier one is cut back to where it leaves it (the fork kept on both).
// Only the ways the tool makes (way kinds with the scan as their source, the inputs' ids) are written again; every
// other feature is kept (the stable save, src/map/write.ts).
//   node tools/ways.ts <map.json> <ways inputs.json>
// The inputs: { piece, scan, image (a PNG copy of the scan, which git ignores like the scan: sips -s format png),
// junctions: { name: [u, v] }, ways: [{ id, kind, width?, note, pts: [[u, v] or a junction's name, …] }] }, in the
// scan's pixels, v down.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { demPlace } from '../src/map/dem.ts'
import { writeMap } from '../src/map/write.ts'
import { read as readPng } from './png.mjs'
import { Heap, simplify } from './streams.ts'
import { mapPieces, scanFitOf } from './water.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface WayInputs {
  piece: string
  scan: string
  image: string
  junctions: Record<string, Pt>
  ways: { id: string; kind: string; width?: number; note: string; pts: (Pt | string)[] }[]
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
  for (const p of [a, b]) {
    if (!(p[0] >= 0 && p[1] >= 0 && Math.round(p[0]) < w && Math.round(p[1]) < h)) {
      throw new Error(`pixel ${p.join(', ')} is off the ${w} × ${h} image`)
    }
  }
  const at = (p: Pt) => (Math.round(p[1]) - y0) * bw + (Math.round(p[0]) - x0)
  const start = at(a)
  const goal = at(b)
  dist[start] = 0
  const done = new Uint8Array(bw * bh)
  const q = new Heap()
  q.push(start, 0)
  const DX = [1, 1, 0, -1, -1, -1, 0, 1]
  const DY = [0, 1, 1, 1, 0, -1, -1, -1]
  while (q.size) {
    const k = q.pop()
    if (done[k]) continue // a stale entry: the node was settled at a lower cost
    done[k] = 1
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

/** The cheapest pixel within `r` of a waypoint (the nearest of equal cost): a waypoint clicked beside its line. */
export function snapToInk(cost: Float32Array, w: number, h: number, p: Pt, r: number): Pt {
  const [u, v] = [Math.round(p[0]), Math.round(p[1])]
  let best: Pt = [u, v]
  let bc = Infinity
  let bd = Infinity
  for (let y = Math.max(0, v - r); y <= Math.min(h - 1, v + r); y++) {
    for (let x = Math.max(0, u - r); x <= Math.min(w - 1, u + r); x++) {
      const d = (x - u) ** 2 + (y - v) ** 2
      if (d > r * r) continue
      const c = cost[y * w + x]
      if (c < bc || (c === bc && d < bd)) [best, bc, bd] = [[x, y], c, d]
    }
  }
  return best
}

/** A traced way: its pixels, and the indices in them it must keep (its ends, its junctions, its forks). */
export interface Traced {
  px: Pt[]
  keep: Set<number>
}

/**
 * A way's pixels through its waypoints, leg by leg, keeping its ends and its fixed waypoints (the junctions other roads
 * meet at). Where a leg comes back along the one before within `spur` pixels of a waypoint not fixed (the waypoint
 * beside the road, a spur), both are cut back to where they part: a road does not turn back on itself in a few pixels.
 */
export function traceWay(cost: Float32Array, w: number, h: number, pts: Pt[], fixed: boolean[], spur = 12): Traced {
  const px: Pt[] = []
  const keep = new Set<number>([0])
  for (let k = 1; k < pts.length; k++) {
    const leg = cheapest(cost, w, h, pts[k - 1], pts[k])
    if (k === 1) px.push(...leg)
    else if (fixed[k - 1]) {
      keep.add(px.length - 1)
      px.push(...leg.slice(1))
    } else {
      // the pixel of the way so far and the one of the leg that meet (within 2: a road is drawn about 4 px wide)
      // farthest from the waypoint: cut there
      const end = px.length - 1
      let cut: [number, number] = [end, 0]
      for (let i = Math.max(1, end - spur); i <= end; i++) {
        for (let j = Math.min(leg.length - 2, spur); j >= 0; j--) {
          if (near(px[i], leg[j], 2) && end - i + j > end - cut[0] + cut[1]) cut = [i, j]
        }
      }
      px.length = cut[0] + 1
      px.push(...leg.slice(cut[1] + 1))
    }
  }
  keep.add(px.length - 1)
  return { px, keep }
}

const near = (a: Pt, b: Pt, r: number) => Math.abs(a[0] - b[0]) <= r && Math.abs(a[1] - b[1]) <= r

/**
 * Each way after the first with an end running along an earlier way (within `r` pixels for more than `run`) cut back
 * to where it leaves it, and joined to that way's nearest pixel, which the earlier way keeps: the shared stretch
 * belongs to one way, and the two meet exactly at the fork. A way wholly along earlier ones is left empty.
 */
export function forks(ways: Traced[], r: number, run: number): Traced[] {
  const owner = new Map<number, [number, number]>() // a pixel (y * 65536 + x) → [way, index]
  const out: Traced[] = []
  const nearest = (p: Pt): [number, number] | null => {
    let best: [number, number] | null = null
    let bd = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const o = owner.get((p[1] + dy) * 65536 + p[0] + dx)
        if (o && dx * dx + dy * dy < bd) [best, bd] = [o, dx * dx + dy * dy]
      }
    }
    return best
  }
  ways.forEach((wy, n) => {
    let { px, keep } = wy
    const along = px.map(p => nearest(p))
    // the run along an earlier way at each end
    let a = 0
    while (a < px.length && along[a]) a++
    let b = px.length
    while (b > a && along[b - 1]) b--
    if (a === px.length) {
      out.push({ px: [], keep: new Set() })
      return
    }
    const cut = (from: number, to: number) => {
      const idx = new Set<number>()
      for (const k of keep) if (k >= from && k < to) idx.add(k - from)
      return idx
    }
    let s = 0
    let e = px.length
    const head: Pt[] = []
    const tail: Pt[] = []
    if (a > run) {
      const [j, m] = along[a - 1]!
      out[j].keep.add(m)
      head.push(out[j].px[m])
      s = a
    }
    if (px.length - b > run) {
      const [j, m] = along[b]!
      out[j].keep.add(m)
      tail.push(out[j].px[m])
      e = b
    }
    const mid = cut(s, e)
    px = [...head, ...px.slice(s, e), ...tail]
    keep = new Set([...mid].map(k => k + head.length))
    keep.add(0)
    keep.add(px.length - 1)
    px.forEach((p, k) => owner.set(p[1] * 65536 + p[0], [n, k]))
    out.push({ px, keep })
  })
  return out
}

/** A path evened between the points it keeps, each stretch by `evenPath` (so the kept points stay where they are). */
export function evenKept({ px, keep }: Traced, r: number): Pt[] {
  const marks = [...keep].filter(k => k >= 0 && k < px.length).sort((a, b) => a - b)
  if (marks[0] !== 0) marks.unshift(0)
  if (marks[marks.length - 1] !== px.length - 1) marks.push(px.length - 1)
  const out: Pt[] = [px[0]]
  for (let i = 1; i < marks.length; i++) out.push(...evenPath(px.slice(marks[i - 1], marks[i] + 1), r).slice(1))
  return out
}

/** A feature id is one of the tool's ways or of their pieces (the id and a number). */
export const isWayId = (ids: string[], id: string) =>
  ids.some(w => id === w || (id.startsWith(w) && /^\d+$/.test(id.slice(w.length))))

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
  const fit = scanFitOf(map, place, scan, dir)
  const [iw, ih] = fit.size
  const img = readPng(fs.readFileSync(path.join(dir, ins.image))) as { w: number; h: number; data: Uint8Array }
  if (img.w !== iw || img.h !== ih) throw new Error(`${ins.image} is ${img.w} × ${img.h}, the scan ${iw} × ${ih}`)
  const g = grey(img)
  const cost = inkCost(g)
  // the waypoints onto the ink within 4 px (15 m of field); a junction once, so every road through it shares its pixel
  const SNAP = 4
  const junctions = new Map(
    Object.entries(ins.junctions).map(([name, p]) => [name, snapToInk(cost, g.w, g.h, p, SNAP)] as const),
  )
  const traced = ins.ways.map(way => {
    const pts = way.pts.map(p => {
      if (typeof p !== 'string') return snapToInk(cost, g.w, g.h, p, SNAP)
      const j = junctions.get(p)
      if (!j) throw new Error(`${way.id}: no junction ${p}`)
      return j
    })
    return traceWay(
      cost,
      g.w,
      g.h,
      pts,
      way.pts.map(p => typeof p === 'string'),
    )
  })
  // a shared stretch belongs to the first way listed: one along it within 3 px for more than 8 starts at the fork
  const joined = forks(traced, 3, 8)
  const half: Pt = [map.extent.w / 2, map.extent.h / 2]
  const ids = ins.ways.map(w => w.id)
  const mine = (f: Feature) => (f.kind ?? '').startsWith('way.') && f.source === ins.scan && isWayId(ids, f.id)
  const others = map.features.filter(f => !mine(f))
  const taken = new Set(others.map(f => f.id))
  const features: Record<string, unknown>[] = []
  const report: string[] = []
  ins.ways.forEach((way, n) => {
    const t = joined[n]
    if (t.px.length < 2) {
      report.push(`${way.id}: wholly along the ways before it, left out`)
      return
    }
    // evened between its kept points, in the file's frame, simplified to 3 m of field with its kept points, then into
    // the map and cut to it (no sliver under 20 m)
    const frame = evenKept(t, 8).map(([u, v]) => fit.toFrame(u + 0.5, v + 0.5))
    // evenKept keeps each pixel's index, so a kept pixel's point is the frame's at its index
    const kept = new Set([...t.keep].map(k => frame[k]))
    const pieces = mapPieces(
      simplify(frame, 3, p => kept.has(p)),
      place,
      half,
      20,
    )
    pieces.forEach((line, k) => {
      const id = k ? `${way.id}${k + 1}` : way.id
      if (taken.has(id)) throw new Error(`${id}: another feature has this id`)
      taken.add(id)
      features.push({
        id,
        kind: way.kind,
        source: ins.scan,
        line,
        ...(way.width !== undefined ? { width: way.width } : {}),
        note: `${way.note}: traced off the survey along its line`,
      })
    })
    report.push(`${way.id}: ${t.px.length} px traced, ${pieces.length} piece(s) in the map`)
  })
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${features.length} ways`)
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
