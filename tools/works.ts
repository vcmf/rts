// A map's modern works mended out of its real relief (docs/plans/active/m8-austerlitz.md M8d, decision 0073): each
// embankment or cutting (a motorway, a railway) given as a few waypoints in the map, and between each two the cheapest
// path over the relief that follows the work (a node standing well off the mean of the ground around it is cheap, the
// plain ground dear), evened and simplified into a `relief.mend` line; each pit or platform (a quarry, a tank farm)
// given as a shape, a `relief.mend` area. Only the mends the tool makes (those with its note) are written again; every
// other feature is kept (the stable save, src/map/write.ts).
//   node tools/works.ts <map.json> <works inputs.json>
// The inputs: { piece, lines: [{ id, width, edge?, note, pts: [[x, z], …] }], areas: [{ id, edge?, note, circle |
// area }] }, in the map's metres; a line's width and edge in the map's metres too (a scale model's halves).
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { decodeRdem, demPlace, toFile, toMap } from '../src/map/dem.ts'
import { writeMap } from '../src/map/write.ts'
import { gridOf, simplify, type Grid } from './streams.ts'
import { evenKept, snapToInk, traceWay } from './ways.ts'
import { mapPieces } from './water.ts'

// a mend line's shortest piece inside the map, and its simplification's tolerance, in m of field (40 and 2 m: the
// 20 m and 1 m of map the 2× Austerlitz had)
const MIN_PIECE = 40
const TOLERANCE = 2

/** The tool's inputs for one map (a committed file beside it). */
export interface WorkInputs {
  piece: string
  lines: { id: string; width: number; edge?: number; note: string; pts: Pt[] }[]
  areas: ({ id: string; edge?: number; note: string } & Pick<Feature, 'circle' | 'area'>)[]
}

/**
 * Each node's cost to pass, for a path along a work: 1 where the ground stands `full` m or more off the mean of the
 * `r`-node box around it (an embankment's crest, a cutting's floor), up to 1 + `dear` on plain ground.
 */
export function workCost(g: Grid, r = 10, full = 1.5, dear = 30): Float32Array {
  const { nx: w, nz: h, h: h0 } = g
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += h0[y * w + x]
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
      const off = Math.abs(h0[y * w + x] - sum / ((x1 - x0) * (y1 - y0)))
      cost[y * w + x] = 1 + dear * (1 - Math.min(1, off / full))
    }
  }
  return cost
}

/**
 * A line with every loop it makes cut out: where two of its segments cross or touch, the points between are dropped for
 * the point they meet at (a path traced over a faint work can turn back on itself, a spur out and back).
 */
export function untangle(line: Pt[]): Pt[] {
  const out = line.slice()
  const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1]
  for (let i = 0; i + 1 < out.length; i++) {
    // a point the line comes back to: the loop between dropped
    for (let m = out.length - 1; m > i + 1; m--) {
      if (same(out[m], out[i])) {
        out.splice(i + 1, m - i)
        break
      }
    }
    for (let j = out.length - 2; j > i + 1; j--) {
      const [a, b, c, d] = [out[i], out[i + 1], out[j], out[j + 1]]
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
      if (den === 0) continue
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
      // crossing or touching, ends included (an out-and-back spur meets itself at a point)
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const x: Pt = [
          Math.round((a[0] + t * (b[0] - a[0])) * 100) / 100,
          Math.round((a[1] + t * (b[1] - a[1])) * 100) / 100,
        ]
        out.splice(i + 1, j - i, x)
        break
      }
    }
  }
  // the meeting points can repeat their neighbours
  return out.filter((p, k) => k === 0 || !same(p, out[k - 1]))
}

function main(): void {
  const [mapFile, inputsFile] = process.argv.slice(2)
  if (!mapFile || !inputsFile) {
    console.error('usage: node tools/works.ts <map.json> <works inputs.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(mapFile, 'utf8')
  const map = JSON.parse(text) as MapFile
  const ins = JSON.parse(fs.readFileSync(inputsFile, 'utf8')) as WorkInputs
  const piece = map.features.find(f => f.id === ins.piece)
  const dem = map.sources?.find(s => s.id === piece?.source)
  if (!piece || !dem?.file) throw new Error(`no piece ${ins.piece} or its dem source`)
  const place = demPlace(piece as unknown as Record<string, unknown>)
  const d = decodeRdem(new Uint8Array(fs.readFileSync(path.join(path.dirname(mapFile), dem.file))))
  // the file over the map's extent and 100 m more (the nodes inside that box)
  const [hw, hh] = [map.extent.w / 2 + 100, map.extent.h / 2 + 100]
  const [wx, sz] = toFile(place, -hw, -hh)
  const [ex, nz] = toFile(place, hw, hh)
  const g = gridOf(d, [wx, sz, ex, nz])
  const cost = workCost(g)
  const ids = new Set<string>()
  for (const w of [...ins.lines, ...ins.areas]) {
    if (ids.has(w.id)) throw new Error(`${w.id}: listed twice`)
    ids.add(w.id)
  }
  // a map point's node in the grid, and back (the node's own point: the grid's nodes are the file's)
  const toNode = ([x, z]: Pt): Pt => {
    const [fx, fz] = toFile(place, x, z)
    const p: Pt = [(fx - g.x0) / g.cell, (fz - g.z0) / g.cell]
    if (!(p[0] >= 0 && p[1] >= 0 && p[0] <= g.nx - 1 && p[1] <= g.nz - 1)) {
      throw new Error(`${x}, ${z} is off the relief`)
    }
    return p
  }
  const toPoint = ([i, j]: Pt): Pt => {
    const [x, z] = toMap(place, g.x0 + i * g.cell, g.z0 + j * g.cell)
    return [Math.round(x * 100) / 100, Math.round(z * 100) / 100]
  }
  const NOTE = ': a modern work, mended from the ground around it'
  const half: Pt = [map.extent.w / 2, map.extent.h / 2]
  const features: Record<string, unknown>[] = []
  const made = new Set<string>()
  const report: string[] = []
  for (const w of ins.lines) {
    if (w.pts.length < 2) throw new Error(`${w.id}: a line needs two points or more`)
    // the waypoints onto the work within 4 nodes (20 m of field), then the path along it, evened over 6 nodes
    // (on the work: a node 0.75 m or more off its box's mean, half the full discount, costing 16 or less)
    const pts = w.pts.map(p => snapToInk(cost, g.nx, g.nz, toNode(p), 4, 2, 16))
    const t = traceWay(
      cost,
      g.nx,
      g.nz,
      pts,
      pts.map(() => false),
    )
    // cut at the map's edge (the grid reaches 100 m past it; no piece under MIN_PIECE m of field), simplified within
    // TOLERANCE m of field: both in the field's metres, so a scale model keeps the same works (G1)
    const minPiece = MIN_PIECE / place.k
    const pieces = mapPieces(
      untangle(simplify(evenKept(t, 6).map(toPoint), TOLERANCE / place.k)),
      { x: 0, z: 0, k: 1 },
      half,
      minPiece,
    )
    if (!pieces.length) throw new Error(`${w.id}: no piece of ${minPiece} m or more inside the map`)
    pieces.forEach((line, k) => {
      const id = k ? `${w.id}${k + 1}` : w.id
      if (made.has(id)) throw new Error(`${id}: the tool makes two features with this id`)
      made.add(id)
      features.push({
        id,
        kind: 'relief.mend',
        line,
        width: w.width,
        ...(w.edge !== undefined ? { edge: w.edge } : {}),
        note: `${w.note}${NOTE}`,
      })
    })
    report.push(`${w.id}: ${t.px.length} nodes traced, ${pieces.length} piece(s)`)
  }
  for (const a of ins.areas) {
    const { id, edge, note, ...shape } = a
    if (made.has(id)) throw new Error(`${id}: the tool makes two features with this id`)
    made.add(id)
    features.push({
      id,
      kind: 'relief.mend',
      ...shape,
      ...(edge !== undefined ? { edge } : {}),
      note: `${note}${NOTE}`,
    })
    report.push(`${id}: an area`)
  }
  const mine = (f: Feature) => f.kind === 'relief.mend' && (f.note ?? '').endsWith(NOTE)
  const others = map.features.filter(f => !mine(f))
  for (const f of features) {
    if (others.some(o => o.id === f.id)) throw new Error(`${String(f.id)}: another feature has this id`)
  }
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${features.length} mends`)
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
