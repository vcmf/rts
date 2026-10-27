// A map's water from its relief and its scan (docs/plans/active/m8-austerlitz.md M8b): the streams the relief drains
// (tools/streams.ts) over a threshold, in the map's frame through its relief piece (shift and scale, decision 0070),
// cut to the map; and ponds read off the scan as ellipses in its pixels, placed through the scan's fit, each moved
// onto its valley's stream (whose stream then joins the map, whatever its size) and slid along it clear of the others.
// Only the features the tool makes are written again (the relief's streams, the scan's ponds); every other feature,
// a ford or a lake drawn by hand included, is kept, and an unnamed stream keeps the id it had where its mouth is where
// it was (the stable save, src/map/write.ts).
//   node tools/water.ts <map.json> <water inputs.json>
// The inputs: { piece, scan, minKm2, traceKm2, width, named: [{ at: [x, z], id, width, depth, note }], ponds: [[id, u,
// v, a, b, degrees]] }: a named stream is the largest chosen one passing within 300 m of field of its point (the file's
// frame); the ponds' pixels with v down.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { decodeRdem, demHalf, demPlace, toMap, type DemPlace } from '../src/map/dem.ts'
import { cm } from '../src/map/util.ts'
import { lineLength, pointAt } from '../src/map/geometry.ts'
import { nearScan } from '../src/map/apply.ts'
import { writeMap } from '../src/map/write.ts'
import { fitScan, type ScanFit } from '../src/app/map/scan.ts'
import { gridOf, streamsOf } from './streams.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface WaterInputs {
  piece: string // the relief.dem piece whose file the water is read from
  scan: string // the scan source the ponds are read off
  minKm2: number // the streams that become features: those draining this much or more, and every pond's
  traceKm2: number // the streams traced (a pond may dam a smaller one)
  width: number // a brook's width at no catchment, m; it grows 0.15 m a km², up to 3 m
  named: { at: Pt; id: string; width: number; depth: number; note: string }[]
  ponds: [string, number, number, number, number, number][]
}

/**
 * A segment cut to a square of half-side m (Liang–Barsky): the part inside, as the fractions of the segment where it
 * enters and leaves, or null when no part is inside.
 */
function clipSegment(a: Pt, b: Pt, m: number): [number, number] | null {
  let t0 = 0
  let t1 = 1
  const d = [b[0] - a[0], b[1] - a[1]]
  for (const k of [0, 1]) {
    for (const [p, q] of [
      [-d[k], a[k] + m],
      [d[k], m - a[k]],
    ]) {
      if (p === 0) {
        if (q < 0) return null
      } else {
        const r = q / p
        if (p < 0) t0 = Math.max(t0, r)
        else t1 = Math.min(t1, r)
      }
    }
  }
  return t0 <= t1 ? [t0, t1] : null
}

/**
 * A line of the file's frame in the map's, cut to a square of half-side `m`: its pieces inside, each cut exactly at
 * the square's edge where it leaves or enters (a stream runs off the map, not short of it; a segment across a corner,
 * both its ends outside, keeps the part inside). Pieces shorter than `minLen` m (a stream skimming the edge) left out.
 */
export function mapPieces(pts: Pt[], place: DemPlace, m: number, minLen = 50): Pt[][] {
  const map = pts.map(p => toMap(place, p[0], p[1]))
  const out: Pt[][] = []
  let cur: Pt[] = []
  const at = (a: Pt, b: Pt, t: number): Pt => [cm(a[0] + t * (b[0] - a[0])), cm(a[1] + t * (b[1] - a[1]))]
  for (let k = 1; k < map.length; k++) {
    const a = map[k - 1]
    const b = map[k]
    const c = clipSegment(a, b, m)
    if (!c) continue
    const p = at(a, b, c[0])
    const q = at(a, b, c[1])
    // a part that does not go on from the last one (the line left the square between): a new piece
    const last = cur[cur.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) {
      if (cur.length >= 2) out.push(cur)
      cur = [p]
    }
    if (q[0] !== p[0] || q[1] !== p[1]) cur.push(q)
    if (c[1] < 1) {
      if (cur.length >= 2) out.push(cur)
      cur = []
    }
  }
  if (cur.length >= 2) out.push(cur)
  return out.filter(l => l.length >= 2 && lineLength(l) >= minLen)
}

/** The nearest point of a set of lines to a point: its line, the point, its distance, its distance along the line. */
export function nearestOn(lines: { id: number; pts: Pt[] }[], p: Pt): { id: number; at: Pt; d: number; along: number } {
  let best = { id: -1, at: p, d: Infinity, along: 0 }
  for (const s of lines) {
    const q = nearScan(s.pts, p[0], p[1])
    if (q.d < best.d) {
      const [x, z] = pointAt(s.pts, q.along)
      best = { id: s.id, at: [x, z], d: q.d, along: q.along }
    }
  }
  return best
}

/** An ellipse: centre, semi-axes, the first's angle (rad from +x toward +z). */
export type Ellipse = [Pt, number, number, number]
/** Whether a point lies in an ellipse (its edge widened by `pad`). */
const inEllipse = ([c, a, b, ang]: Ellipse, [x, z]: Pt, pad = 0) => {
  const dx = x - c[0]
  const dz = z - c[1]
  const u = (dx * Math.cos(ang) + dz * Math.sin(ang)) / (a + pad)
  const v = (-dx * Math.sin(ang) + dz * Math.cos(ang)) / (b + pad)
  return u * u + v * v <= 1
}
/** Whether two ellipses meet (or come within `pad`): one's outline, sampled, in the other, or the other's in it. */
export function ellipsesMeet(p: Ellipse, q: Ellipse, pad = 0): boolean {
  const ring = (e: Ellipse) =>
    Array.from({ length: 48 }, (_, k) => {
      const t = (2 * Math.PI * k) / 48
      const [c, a, b, ang] = e
      const x = a * Math.cos(t)
      const z = b * Math.sin(t)
      return [c[0] + x * Math.cos(ang) - z * Math.sin(ang), c[1] + x * Math.sin(ang) + z * Math.cos(ang)] as Pt
    })
  return (
    inEllipse(p, q[0], pad) ||
    inEllipse(q, p[0], pad) ||
    ring(p).some(r => inEllipse(q, r, pad)) ||
    ring(q).some(r => inEllipse(p, r, pad))
  )
}

/**
 * Ponds placed one by one, each moved along its stream (alternately down and up, a step at a time) until it meets
 * none placed before it, by `gap` m: the survey's ponds were apart; moved onto their streams, some came to overlap.
 * One that finds no room within `reach` m keeps its place and is shrunk, its semi-axes no smaller than `minR`; one that
 * still meets another is left out (null).
 */
export function apart(
  ponds: { e: Ellipse; line: Pt[] | null; along: number }[],
  gap: number,
  step: number,
  reach: number,
  minR: number,
): ({ e: Ellipse; shrunk: boolean } | null)[] {
  const out: ({ e: Ellipse; shrunk: boolean } | null)[] = []
  for (const p of ponds) {
    const clear = (e: Ellipse) => out.every(o => !o || !ellipsesMeet(o.e, e, gap))
    let e = p.e
    if (!clear(e) && p.line) {
      for (let k = 1; k * step <= reach; k++) {
        const found = [p.along + k * step, p.along - k * step]
          .map(s => [pointAt(p.line!, s).slice(0, 2), e[1], e[2], e[3]] as Ellipse)
          .find(clear)
        if (found) {
          e = found
          break
        }
      }
    }
    let shrunk = false
    while (!clear(e) && Math.min(e[1], e[2]) * 0.9 >= minR) {
      e = [e[0], e[1] * 0.9, e[2] * 0.9, e[3]]
      shrunk = true
    }
    out.push(clear(e) ? { e, shrunk } : null)
  }
  return out
}

/**
 * The ids for this run's unnamed streams: each keeps the id of a stream of the last run whose mouth (its last point)
 * lies within 50 m of its own, so a ford or a bridge naming a brook still names it; the rest take the next free
 * `brook<n>`, none of `taken`.
 */
export function streamIds(mouths: Pt[], before: { id: string; mouth: Pt }[], taken: Set<string>): string[] {
  const used = new Set(taken)
  const ids = mouths.map(m => {
    const prev = before.find(b => !used.has(b.id) && Math.hypot(b.mouth[0] - m[0], b.mouth[1] - m[1]) <= 50)
    if (!prev) return null
    used.add(prev.id)
    return prev.id
  })
  let n = 0
  const next = () => {
    let id: string
    do id = `brook${++n === 1 ? '' : n}`
    while (used.has(id))
    used.add(id)
    return id
  }
  return ids.map(id => id ?? next())
}

/** A JPEG's or a PNG's size in pixels, from its header (the scan is read in the page, not here). */
export function scanSize(file: string): [number, number] {
  const b = fs.readFileSync(file)
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  // JPEG: the markers in turn (fill bytes 0xFF skipped) to a start of frame, any of C0–CF but C4, C8 and CC
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) break
    while (b[i] === 0xff && b[i + 1] === 0xff) i++
    const marker = b[i + 1]
    const len = b.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
    }
    i += 2 + len
  }
  throw new Error(`${file}: no size in its header`)
}

function main(): void {
  const [mapFile, inputsFile] = process.argv.slice(2)
  if (!mapFile || !inputsFile) {
    console.error('usage: node tools/water.ts <map.json> <water inputs.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(mapFile, 'utf8')
  const map = JSON.parse(text) as MapFile
  const ins = JSON.parse(fs.readFileSync(inputsFile, 'utf8')) as WaterInputs
  const piece = map.features.find(f => f.id === ins.piece)
  const dem = map.sources?.find(s => s.id === piece?.source)
  const scan = map.sources?.find(s => s.id === ins.scan)
  if (!piece || !dem?.file || !scan?.file) throw new Error(`no piece ${ins.piece}, its dem source, or scan ${ins.scan}`)
  const place = demPlace(piece as unknown as Record<string, unknown>)
  const d = decodeRdem(new Uint8Array(fs.readFileSync(path.join(path.dirname(mapFile), dem.file))))
  // traced over the whole file: a basin by the map's edge drains through its own outlet beyond it, not straight to
  // the edge of a box cut close around the map; then cut to the map
  const M = Math.min(map.extent.w, map.extent.h) / 2 - 10
  const { x: hx, z: hz } = demHalf(d)
  const all = streamsOf(gridOf(d, [-hx, -hz, hx, hz]), ins.traceKm2)
  // the scan's placement: its fit over the extent as the piece reads it (as the page draws it)
  const img = scanSize(path.join(path.dirname(mapFile), scan.file))
  const fit: ScanFit = fitScan(scan.points ?? [], img[0], img[1], {
    w: map.extent.w * place.k,
    h: map.extent.h * place.k,
    x: place.x,
    z: place.z,
  })
  const MIN_R = 6 // m of map: the smallest pond's semi-axis written
  // the ponds in the file's frame, each onto the nearest traced stream within 400 m of field, its semi-axes as written
  const placed = ins.ponds.map(([id, u, v, a, b, deg]) => {
    const th = (deg * Math.PI) / 180
    const c = fit.toFrame(u, v)
    const pa = fit.toFrame(u + a * Math.cos(th), v + a * Math.sin(th))
    const pb = fit.toFrame(u - b * Math.sin(th), v + b * Math.cos(th))
    const near = nearestOn(all, c)
    const on = near.d <= 400 ? near : null
    const e: Ellipse = [
      on ? on.at : c,
      Math.max(Math.hypot(pa[0] - c[0], pa[1] - c[1]), MIN_R * place.k),
      Math.max(Math.hypot(pb[0] - c[0], pb[1] - c[1]), MIN_R * place.k),
      Math.atan2(pa[1] - c[1], pa[0] - c[0]),
    ]
    return { id, e, on, line: on ? all.find(s => s.id === on.id)!.pts : null, along: on?.along ?? 0 }
  })
  // only the ponds inside the map (padded by their larger semi-axis) count, and bring their streams
  const inside = (e: Ellipse) => {
    const m = toMap(place, e[0][0], e[0][1])
    const r = Math.max(e[1], e[2]) / place.k
    return Math.abs(m[0]) + r <= M && Math.abs(m[1]) + r <= M
  }
  const report: string[] = []
  const kept = placed.filter(p => {
    if (inside(p.e)) return true
    report.push(`${p.id}: outside the map, left out`)
    return false
  })
  // apart from each other by 20 m of field, slid along their streams in 20 m steps up to 600 m
  const sep = apart(kept, 20, 20, 600, MIN_R * place.k)
  const chosen = new Set(all.filter(s => s.km2 >= ins.minKm2).map(s => s.id))
  kept.forEach((p, i) => {
    if (sep[i] && p.on) chosen.add(p.on.id)
  })
  // a chosen stream brings the streams it flows into, down to one that leaves the map: its water goes somewhere
  for (const id of [...chosen]) {
    let s = all.find(x => x.id === id)
    while (s && s.into !== null && !chosen.has(s.into)) {
      chosen.add(s.into)
      s = all.find(x => x.id === s!.into)
    }
  }
  const streams = [...all].filter(x => chosen.has(x.id)).sort((a, b) => b.km2 - a.km2)
  // each name to the largest chosen stream passing within 300 m of field of its point that no other name took
  const names = new Map<number, WaterInputs['named'][number]>()
  for (const nm of ins.named) {
    const near = streams.filter(x => !names.has(x.id) && nearestOn([x], nm.at).d <= 300)
    if (!near.length) {
      report.push(`the name ${nm.id}: no stream of its own within 300 m of its point, not given`)
      continue
    }
    names.set(near[0].id, nm)
  }
  // the features this tool made last time: replaced; every other feature kept
  const mine = (f: Feature) =>
    (f.kind === 'water.stream' && f.source === piece.source) || (f.kind === 'water.pond' && f.source === ins.scan)
  const isNamed = (id: string) => ins.named.some(n => id === n.id || new RegExp(`^${n.id}\\d+$`).test(id))
  const before = map.features
    .filter(f => mine(f) && f.line && !isNamed(f.id))
    .map(f => ({ id: f.id, mouth: f.line![f.line!.length - 1] }))
  const others = map.features.filter(f => !mine(f))
  const lines: { s: (typeof streams)[number]; line: Pt[]; k: number }[] = []
  for (const s of streams) mapPieces(s.pts, place, M).forEach((line, k) => lines.push({ s, line, k }))
  const unnamed = lines.filter(l => !names.has(l.s.id))
  const ids = streamIds(
    unnamed.map(l => l.line[l.line.length - 1]),
    before,
    new Set([...others.map(f => f.id), ...ins.named.map(n => n.id), ...ins.ponds.map(p => p[0])]),
  )
  const features: Record<string, unknown>[] = []
  for (const l of lines) {
    const named = names.get(l.s.id)
    const id = named ? (l.k ? `${named.id}${l.k + 1}` : named.id) : ids[unnamed.indexOf(l)]
    features.push({
      id,
      kind: 'water.stream',
      source: piece.source,
      line: l.line,
      width: named?.width ?? cm(Math.min(3, ins.width + 0.15 * l.s.km2)),
      depth: named?.depth ?? 0.4,
      note: `${named ? named.note + ': ' : ''}its course from the relief (it drains ${l.s.km2.toFixed(1)} km² of the field here), where the survey shows water`,
    })
  }
  kept.forEach((p, i) => {
    const r = sep[i]
    if (!r) {
      report.push(`${p.id}: no room for it between its neighbours, left out`)
      return
    }
    const [c, a, b, ang] = r.e
    const m = toMap(place, c[0], c[1])
    const slid = Math.hypot(c[0] - p.e[0][0], c[1] - p.e[0][1])
    const how = [
      p.on
        ? `moved ${p.on.d.toFixed(0)} m of field onto its valley's stream`
        : 'where the survey has it (no stream near)',
      slid > 0.5 ? `${slid.toFixed(0)} m along it clear of the next` : '',
      r.shrunk ? 'shrunk to fit between its neighbours' : '',
    ].filter(Boolean)
    report.push(`${p.id}: ${how.join(', ')}`)
    features.push({
      id: p.id,
      kind: 'water.pond',
      source: ins.scan,
      ellipse: [[cm(m[0]), cm(m[1])], cm(a / place.k), cm(b / place.k), cm(ang)],
      note: `the survey's pond, ${how.join(', ')}`,
    })
  })
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(
    `${features.filter(f => f.kind === 'water.stream').length} streams, ${features.filter(f => f.kind === 'water.pond').length} ponds`,
  )
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
