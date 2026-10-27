// A map's water from its relief and its scan (docs/plans/active/m8-austerlitz.md M8b): the streams the relief drains
// (tools/streams.ts) over a threshold, in the map's frame through its relief piece (shift and scale, decision 0070),
// cut to the map; and ponds read off the scan as ellipses in its pixels, placed through the scan's fit, each moved
// onto its valley's stream (whose stream then joins the map, whatever its size) and slid along it clear of the others.
// The map's water features are written again, every other feature kept (the stable save, src/map/write.ts).
//   node tools/water.ts <map.json> <water inputs.json>
// The inputs: { piece, scan, minKm2, traceKm2, width, named: [{ at: [x, z], id, width, depth, note }], ponds: [[id, u,
// v, a, b, degrees]] }: a named stream is the chosen one passing nearest its point (the file's frame); the ponds'
// pixels with v down.
import fs from 'node:fs'
import path from 'node:path'
import type { MapFile, Pt } from '../src/map/schema.ts'
import { decodeRdem, demHalf, demPlace, toMap, type DemPlace } from '../src/map/dem.ts'
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

const cm = (v: number) => Math.round(v * 100) / 100

/**
 * A line of the file's frame in the map's, cut to a square of half-side `m`: its pieces inside, 2 points or more, each
 * cut exactly at the square's edge where it leaves or enters (a stream runs off the map, not short of it); pieces
 * shorter than `minLen` m (a stream skimming the edge) left out.
 */
export function mapPieces(pts: Pt[], place: DemPlace, m: number, minLen = 50): Pt[][] {
  const out: Pt[][] = []
  let cur: Pt[] = []
  const inside = ([x, z]: Pt) => Math.abs(x) <= m && Math.abs(z) <= m
  // where the segment from a (inside) toward b (outside) meets the edge
  const edge = (a: Pt, b: Pt): Pt => {
    let t = 1
    for (const k of [0, 1]) {
      const d = b[k] - a[k]
      if (d > 0 && b[k] > m) t = Math.min(t, (m - a[k]) / d)
      if (d < 0 && b[k] < -m) t = Math.min(t, (-m - a[k]) / d)
    }
    return [cm(a[0] + t * (b[0] - a[0])), cm(a[1] + t * (b[1] - a[1]))]
  }
  const map = pts.map(p => toMap(place, p[0], p[1]).map(cm) as Pt)
  map.forEach((q, k) => {
    const prev = k ? map[k - 1] : null
    if (inside(q)) {
      if (prev && !inside(prev)) cur.push(edge(q, prev))
      cur.push(q)
    } else {
      if (prev && inside(prev)) cur.push(edge(prev, q))
      if (cur.length >= 2) out.push(cur)
      cur = []
    }
  })
  if (cur.length >= 2) out.push(cur)
  // a crossing on a point (to the centimetre) repeats it: once; a sliver along the edge (under minLen m) goes
  const len = (l: Pt[]) => l.slice(1).reduce((a, q, k) => a + Math.hypot(q[0] - l[k][0], q[1] - l[k][1]), 0)
  return out
    .map(l => l.filter((q, k) => !k || q[0] !== l[k - 1][0] || q[1] !== l[k - 1][1]))
    .filter(l => l.length >= 2 && len(l) >= minLen)
}

/** The nearest point of a set of lines to a point, its line and its distance along it. */
export function nearestOn(
  lines: { id: number; pts: Pt[] }[],
  [x, z]: Pt,
): { id: number; at: Pt; d: number; along: number } {
  let best = { id: -1, at: [x, z] as Pt, d: Infinity, along: 0 }
  for (const s of lines) {
    let acc = 0
    for (let k = 1; k < s.pts.length; k++) {
      const [ax, az] = s.pts[k - 1]
      const [bx, bz] = s.pts[k]
      const dx = bx - ax
      const dz = bz - az
      const L = Math.hypot(dx, dz)
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))) : 0
      const q: Pt = [ax + t * dx, az + t * dz]
      const d = Math.hypot(q[0] - x, q[1] - z)
      if (d < best.d) best = { id: s.id, at: q, d, along: acc + t * L }
      acc += L
    }
  }
  return best
}

/** The point at a distance along a line (clamped to its ends). */
export function pointAlong(pts: Pt[], s: number): Pt {
  let acc = 0
  for (let k = 1; k < pts.length; k++) {
    const L = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
    if (acc + L >= s) {
      const t = L ? (s - acc) / L : 0
      return [pts[k - 1][0] + t * (pts[k][0] - pts[k - 1][0]), pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1])]
    }
    acc += L
  }
  return pts[pts.length - 1]
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
 * One that finds no room within `reach` m keeps its place and is shrunk until it fits.
 */
export function apart(
  ponds: { e: Ellipse; line: Pt[] | null; along: number }[],
  gap: number,
  step: number,
  reach: number,
): Ellipse[] {
  const out: Ellipse[] = []
  for (const p of ponds) {
    const clear = (e: Ellipse) => out.every(o => !ellipsesMeet(o, e, gap))
    let e = p.e
    if (!clear(e) && p.line) {
      for (let k = 1; k * step <= reach; k++) {
        const found = [p.along + k * step, p.along - k * step]
          .map(s => [pointAlong(p.line!, s), e[1], e[2], e[3]] as Ellipse)
          .find(clear)
        if (found) {
          e = found
          break
        }
      }
    }
    while (!clear(e) && e[1] > 4) e = [e[0], e[1] * 0.9, e[2] * 0.9, e[3]]
    out.push(e)
  }
  return out
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
  // the ponds in the file's frame, each onto the nearest traced stream within 400 m of field
  const chosen = new Set(all.filter(s => s.km2 >= ins.minKm2).map(s => s.id))
  const placed = ins.ponds.map(([id, u, v, a, b, deg]) => {
    const th = (deg * Math.PI) / 180
    const c = fit.toFrame(u, v)
    const pa = fit.toFrame(u + a * Math.cos(th), v + a * Math.sin(th))
    const pb = fit.toFrame(u - b * Math.sin(th), v + b * Math.cos(th))
    const near = nearestOn(all, c)
    const on = near.d <= 400 ? near : null
    if (on) chosen.add(on.id)
    const e: Ellipse = [
      on ? on.at : c,
      Math.hypot(pa[0] - c[0], pa[1] - c[1]),
      Math.hypot(pb[0] - c[0], pb[1] - c[1]),
      Math.atan2(pa[1] - c[1], pa[0] - c[0]),
    ]
    return {
      id,
      e,
      moved: on ? on.d : null,
      line: on ? all.find(s => s.id === on.id)!.pts : null,
      along: on?.along ?? 0,
    }
  })
  // a chosen stream brings the streams it flows into, down to one that leaves the map: its water goes somewhere
  for (const id of [...chosen]) {
    let s = all.find(x => x.id === id)
    while (s && s.into !== null && !chosen.has(s.into)) {
      chosen.add(s.into)
      s = all.find(x => x.id === s!.into)
    }
  }
  // apart from each other by 20 m of field, slid along their streams in 20 m steps up to 600 m
  const sep = apart(placed, 20, 20, 600)
  const features: Record<string, unknown>[] = []
  const report: string[] = []
  let n = 0
  const kept = [...all].filter(x => chosen.has(x.id)).sort((a, b) => b.km2 - a.km2)
  // each name to the largest chosen stream passing within 300 m of field of its point (a tributary may pass nearer)
  const names = new Map(
    ins.named.map(nm => {
      const near = kept.filter(x => nearestOn([x], nm.at).d <= 300)
      return [(near.length ? near : [kept.find(x => x.id === nearestOn(kept, nm.at).id)!])[0].id, nm] as const
    }),
  )
  for (const s of kept) {
    const named = names.get(s.id)
    mapPieces(s.pts, place, M).forEach((line, k) => {
      const id = named ? (k ? `${named.id}${k + 1}` : named.id) : `brook${++n === 1 ? '' : n}`
      features.push({
        id,
        kind: 'water.stream',
        source: piece.source,
        line,
        width: named?.width ?? cm(Math.min(3, ins.width + 0.15 * s.km2)),
        depth: named?.depth ?? 0.4,
        note: `${named ? named.note + ': ' : ''}its course from the relief (it drains ${s.km2.toFixed(1)} km² of the field here), where the survey shows water`,
      })
    })
  }
  placed.forEach((p, i) => {
    const [c, a, b, ang] = sep[i]
    const m = toMap(place, c[0], c[1])
    const ra = a / place.k
    if (Math.abs(m[0]) + ra > M || Math.abs(m[1]) + ra > M) {
      report.push(`${p.id}: outside the map, left out`)
      return
    }
    const slid = Math.hypot(c[0] - p.e[0][0], c[1] - p.e[0][1])
    report.push(
      `${p.id}: ${p.moved === null ? 'no stream near, as the survey has it' : `moved ${p.moved.toFixed(0)} m of field onto its stream`}${slid > 0.5 ? `, slid ${slid.toFixed(0)} m along it clear of another` : ''}`,
    )
    features.push({
      id: p.id,
      kind: 'water.pond',
      source: ins.scan,
      ellipse: [[cm(m[0]), cm(m[1])], cm(Math.max(ra, 6)), cm(Math.max(b / place.k, 6)), cm(ang)],
      note: `the survey's pond, ${p.moved === null ? 'where the survey has it (no stream near)' : `moved ${p.moved.toFixed(0)} m of field onto its valley's stream${slid > 0.5 ? `, ${slid.toFixed(0)} m along it clear of the next` : ''}`}`,
    })
  })
  const others = map.features.filter(f => !(f.kind ?? '').startsWith('water.'))
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(
    `${features.filter(f => f.kind === 'water.stream').length} streams, ${features.filter(f => f.kind === 'water.pond').length} ponds`,
  )
  console.log(report.join('\n'))
}

/** A JPEG's or a PNG's size in pixels, from its header (the scan is read in the page, not here). */
export function scanSize(file: string): [number, number] {
  const b = fs.readFileSync(file)
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  for (let i = 2; i < b.length;) {
    if (b[i] !== 0xff) break
    const marker = b[i + 1]
    const len = b.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
    i += 2 + len
  }
  throw new Error(`${file}: no size in its header`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
