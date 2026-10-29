// A map's ways traced off its scan (docs/plans/active/m8-austerlitz.md M8c): each road read as a few waypoints on the
// scan, and between each two a least-cost path over the scan that follows the line the surveyor drew (a pixel darker
// than the paper around it is cheap, paper is dear), placed through the scan's fit and the relief piece into the map,
// cut to the map and simplified. Roads meet exactly: a junction named once in the inputs is one pixel on every road
// through it, and a road with an end running along another is cut back to where it leaves it (the fork kept on both).
// Only the ways the tool makes (way kinds with the scan as their source and the tool's note) are written again; every
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

/** Ink: darker than its box by 8 levels or more, a faint line too (cost 1 + 30 × (1 − 8 / 25), `inkCost` defaults). */
const INK = 21.5

/**
 * A waypoint moved onto the ink within `r` of it, if it is not on it: the nearest pixel costing no more than the
 * cheapest there by `slack` (a waypoint already on its line stays, however faint the line; one clicked beside it moves
 * onto the line, not onto a darker letter or hatching beyond it). `ink`: the cost at or under which a pixel is on
 * a line.
 */
export function snapToInk(cost: Float32Array, w: number, h: number, p: Pt, r: number, slack = 2, ink = INK): Pt {
  const [u, v] = [Math.round(p[0]), Math.round(p[1])]
  if (!(u >= 0 && v >= 0 && u < w && v < h)) throw new Error(`pixel ${p.join(', ')} is off the ${w} × ${h} image`)
  // on ink already (a faint line too): it stays
  if (cost[v * w + u] <= ink) return [u, v]
  const near: [Pt, number, number][] = []
  for (let y = Math.max(0, v - r); y <= Math.min(h - 1, v + r); y++) {
    for (let x = Math.max(0, u - r); x <= Math.min(w - 1, u + r); x++) {
      const d = (x - u) ** 2 + (y - v) ** 2
      if (d <= r * r) near.push([[x, y], cost[y * w + x], d])
    }
  }
  const least = Math.min(...near.map(n => n[1]))
  return near.filter(n => n[1] <= least + slack).sort((a, b) => a[2] - b[2])[0][0]
}

/** A traced way: its pixels, and the indices in them it must keep (its ends, its junctions, its forks). */
export interface Traced {
  px: Pt[]
  keep: Set<number>
}

/**
 * A way's pixels through its waypoints, leg by leg, keeping its ends and its fixed waypoints (the junctions other roads
 * meet at). Where a leg comes back along the one before within `spur` pixels of a waypoint not fixed (the waypoint
 * beside the road, a spur), both are cut back to where they part, never past a junction: a road does not turn back on
 * itself in a few pixels (a turn sharper than about 20° at a plain waypoint is cut at its tip; one needed is given as a
 * junction).
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
      // never back past a point kept (a junction: its pixel stays on the way)
      const end = px.length - 1
      const last = Math.max(...keep)
      let cut: [number, number] = [end, 0]
      for (let i = Math.max(last, end - spur); i <= end; i++) {
        for (let j = Math.min(leg.length - 2, spur); j >= 0; j--) {
          if (near(px[i], leg[j], 2) && end - i + j > Math.max(SPUR_MIN, end - cut[0] + cut[1])) cut = [i, j]
        }
      }
      px.length = cut[0] + 1
      px.push(...leg.slice(cut[1] + 1))
    }
  }
  keep.add(px.length - 1)
  return { px, keep }
}

// a straight pass (the pixels 2 before and the one after meet within 2) scores up to 2, a right-angled corner up to 4;
// a spur 3 px deep or more scores over 4
const SPUR_MIN = 4

const near = (a: Pt, b: Pt, r: number) => Math.abs(a[0] - b[0]) <= r && Math.abs(a[1] - b[1]) <= r

const key = (p: Pt) => p[1] * 65536 + p[0]

/** The ways through each pixel of a set of ways. */
function owners(ways: Traced[]): Map<number, Set<number>> {
  const by = new Map<number, Set<number>>()
  ways.forEach((t, n) =>
    t.px.forEach(p => {
      const o = by.get(key(p))
      if (o) o.add(n)
      else by.set(key(p), new Set([n]))
    }),
  )
  return by
}

/** The nearest pixel within `r` of `p` on a way other than `n`, and that way, or null. */
function nearOther(by: Map<number, Set<number>>, p: Pt, n: number, r: number): [number, Pt] | null {
  let best: [number, Pt] | null = null
  let bd = Infinity
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const q: Pt = [p[0] + dx, p[1] + dy]
      const o = by.get(key(q))
      if (!o || dx * dx + dy * dy >= bd || dx * dx + dy * dy > r * r) continue
      for (const j of o) {
        if (j !== n) {
          ;[best, bd] = [[j, q], dx * dx + dy * dy]
          break
        }
      }
    }
  }
  return best
}

/**
 * Each way with an end running along another way (within `r` pixels for more than `run`) cut back to where it leaves
 * it, and joined to that way's nearest pixel, which that way keeps: the shared stretch belongs to one way, and the two
 * meet exactly at the fork. The ways are taken in turn, each against the others as they are left (so of two ways whose
 * ends run along each other, the first is cut). A way wholly along others is left empty. A fork's pixel cut from its
 * way later is an error, as is a junction on a cut end (the junction is to be on the way it runs along).
 */
export function forks(ways: Traced[], r: number, run: number, names = ways.map((_, n) => `way ${n}`)): Traced[] {
  const by = owners(ways)
  const pins = ways.map(() => new Set<number>()) // the pixels of the forks onto each way
  const out = ways.map(t => ({ px: t.px, keep: new Set(t.keep) }))
  const leave = (n: number, pts: Pt[]) => pts.forEach(p => by.get(key(p))?.delete(n))
  out.forEach((t, n) => {
    const { px, keep } = t
    const along = px.map(p => nearOther(by, p, n, r))
    let a = 0
    while (a < px.length && along[a]) a++
    if (a === px.length) {
      leave(n, px)
      out[n] = { px: [], keep: new Set() }
      return
    }
    let b = px.length
    while (b > a && along[b - 1]) b--
    const s = a > run ? a : 0
    const e = px.length - b > run ? b : px.length
    const head = s ? [along[s - 1]!] : []
    const tail = e < px.length ? [along[e]!] : []
    for (const [j, q] of [...head, ...tail]) pins[j].add(key(q))
    leave(n, [...px.slice(0, s), ...px.slice(e)])
    for (const k of keep) {
      if (k > 0 && k < px.length - 1 && (k < s || k >= e)) {
        throw new Error(`${names[n]}: a junction lies on the end it runs along ${names[along[k]![0]]}`)
      }
    }
    const kept = new Set<number>()
    for (const k of keep) if (k >= s && k < e) kept.add(k - s + head.length)
    const cut = [...head.map(h => h[1]), ...px.slice(s, e), ...tail.map(h => h[1])]
    kept.add(0)
    kept.add(cut.length - 1)
    out[n] = { px: cut, keep: kept }
  })
  out.forEach((t, n) => {
    for (const k of pins[n]) {
      const at = t.px.findIndex(p => key(p) === k)
      if (at < 0) throw new Error(`a fork onto ${names[n]} lies on a stretch of it cut since`)
      t.keep.add(at)
    }
  })
  return out
}

/**
 * The longest stretch of a way within `r` pixels of another, over `run` pixels, as [way, other, pixels], or null: a
 * stretch traced twice in both ways' middles, which `forks` cannot cut (the way is to be split at the fork).
 */
export function doubled(ways: Traced[], r: number, run: number): [number, number, number] | null {
  const by = owners(ways)
  let worst: [number, number, number] | null = null
  ways.forEach((t, n) => {
    // a run near any other way (a third road crossing it does not break it), named by the way most of it is near
    let len = 0
    let count = new Map<number, number>()
    for (const p of t.px) {
      const o = nearOther(by, p, n, r)
      if (!o) {
        len = 0
        count = new Map()
        continue
      }
      len++
      count.set(o[0], (count.get(o[0]) ?? 0) + 1)
      if (len > run && (!worst || len > worst[2])) {
        const other = [...count].sort((a, b) => b[1] - a[1])[0][0]
        worst = [n, other, len]
      }
    }
  })
  return worst
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
  const ids = new Set<string>()
  for (const way of ins.ways) {
    if (ids.has(way.id)) throw new Error(`${way.id}: listed twice`)
    ids.add(way.id)
    if (way.pts.length < 2) throw new Error(`${way.id}: a way needs two points or more`)
    if (!way.kind.startsWith('way.')) throw new Error(`${way.id}: ${way.kind} is not a way kind`)
  }
  const g = grey(img)
  const cost = inkCost(g)
  // the waypoints onto the ink within 4 px (15 m of field); a junction once, so every road through it shares its pixel
  const SNAP = 4
  const junctions = new Map(
    Object.entries(ins.junctions ?? {}).map(([name, p]) => [name, snapToInk(cost, g.w, g.h, p, SNAP)] as const),
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
  ins.ways.forEach((way, n) => {
    if (traced[n].px.length < 2) throw new Error(`${way.id}: its points are all on one pixel`)
  })
  // a shared stretch belongs to one way: one with an end along another within 3 px for more than 8 starts at the fork;
  // one left in two ways' middles is an error (a way to split at the fork), more than 32 px (120 m of field)
  const joined = forks(
    traced,
    3,
    8,
    ins.ways.map(w => w.id),
  )
  const twice = doubled(joined, 3, 32)
  if (twice) {
    const [n, j, len] = twice
    throw new Error(`${ins.ways[n].id} runs along ${ins.ways[j].id} for ${len} px: split one of them at the fork`)
  }
  // an end within 4 px of another way and not on it: a junction given as a plain waypoint (to be named, to meet)
  const all = joined.flatMap((t, n) => t.px.map(p => [n, key(p)] as const))
  const onWay = new Map<number, Set<number>>()
  for (const [n, k] of all) onWay.set(k, (onWay.get(k) ?? new Set()).add(n))
  const report: string[] = []
  joined.forEach((t, n) => {
    for (const e of [t.px[0], t.px.at(-1)]) {
      if (!e) continue
      let close = -1
      for (let dy = -4; dy <= 4 && close < 0; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const o = onWay.get(key([e[0] + dx, e[1] + dy]))
          const j = o && [...o].find(m => m !== n)
          if (j !== undefined && !onWay.get(key(e))!.has(j)) close = j
        }
      }
      if (close >= 0) {
        report.push(`warning: ${ins.ways[n].id} ends near ${ins.ways[close].id} but not on it: name a junction`)
      }
    }
  })
  const half: Pt = [map.extent.w / 2, map.extent.h / 2]
  // the tool's ways: a way kind with the scan as its source and the tool's note (a way drawn by hand stays, whatever
  // its source; one dropped from the inputs goes)
  const TRACED = ': traced off the survey along its line'
  const mine = (f: Feature) =>
    (f.kind ?? '').startsWith('way.') && f.source === ins.scan && (f.note ?? '').endsWith(TRACED)
  const others = map.features.filter(f => !mine(f))
  const taken = new Set(others.map(f => f.id))
  const features: Record<string, unknown>[] = []
  ins.ways.forEach((way, n) => {
    const t = joined[n]
    if (t.px.length < 2) {
      report.push(`${way.id}: wholly along other ways, left out`)
      return
    }
    // evened between its kept points, in the file's frame, simplified to 3 m of field with its kept points, then into
    // the map and cut to it (no sliver under 20 m)
    // (a pixel's centre: the fit reads the image as continuous, pixel u spanning u to u + 1, as the page draws it)
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
        note: `${way.note}${TRACED}`,
      })
    })
    report.push(`${way.id}: ${t.px.length} px traced, ${pieces.length} piece(s) in the map`)
  })
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${features.length} ways`)
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
