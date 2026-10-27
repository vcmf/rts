// A map's modern works mended out of its real relief (docs/plans/active/m8-austerlitz.md M8d, decision 0073): each
// embankment or cutting (a motorway, a railway) given as a few waypoints in the map, and between each two the cheapest
// path over the relief that follows the work (a node standing well off the mean of the ground around it is cheap, the
// plain ground dear), evened and simplified into a `relief.mend` line; each pit or platform (a quarry, a tank farm)
// given as a shape, a `relief.mend` area. Only the mends the tool makes (those with its note) are written again; every
// other feature is kept (the stable save, src/map/write.ts).
//   node tools/works.ts <map.json> <works inputs.json>
// The inputs: { piece, lines: [{ id, width, edge?, note, pts: [[x, z], …] }], areas: [{ id, edge?, note, circle |
// ellipse | area }] }, in the map's metres; a line's width and edge in the map's metres too (a scale model's halves).
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { decodeRdem, demPlace, toFile, toMap, type Dem } from '../src/map/dem.ts'
import { writeMap } from '../src/map/write.ts'
import { simplify } from './streams.ts'
import { evenKept, snapToInk, traceWay } from './ways.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface WorkInputs {
  piece: string
  lines: { id: string; width: number; edge?: number; note: string; pts: Pt[] }[]
  areas: ({ id: string; edge?: number; note: string } & Pick<Feature, 'circle' | 'ellipse' | 'area'>)[]
}

/** A part of a heightfield as a grid: w × h heights, the south row first, its node (0, 0) at (x0, z0), `cell` apart. */
export interface Grid {
  w: number
  h: number
  x0: number
  z0: number
  cell: number
  h0: Float64Array
}

/** The part of a relief file over a box of its frame (west, south, east, north), whole nodes. */
export function gridOf(d: Dem, box: [number, number, number, number]): Grid {
  const i0 = Math.max(0, Math.floor(box[0] / d.cell + (d.nx - 1) / 2))
  const j0 = Math.max(0, Math.floor(box[1] / d.cell + (d.nz - 1) / 2))
  const i1 = Math.min(d.nx - 1, Math.ceil(box[2] / d.cell + (d.nx - 1) / 2))
  const j1 = Math.min(d.nz - 1, Math.ceil(box[3] / d.cell + (d.nz - 1) / 2))
  const w = i1 - i0 + 1
  const h = j1 - j0 + 1
  const h0 = new Float64Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) h0[j * w + i] = d.base + d.cm[(j0 + j) * d.nx + i0 + i] / 100
  return {
    w,
    h,
    x0: (i0 - (d.nx - 1) / 2) * d.cell,
    z0: (j0 - (d.nz - 1) / 2) * d.cell,
    cell: d.cell,
    h0,
  }
}

/**
 * Each node's cost to pass, for a path along a work: 1 where the ground stands `full` m or more off the mean of the
 * `r`-node box around it (an embankment's crest, a cutting's floor), up to 1 + `dear` on plain ground.
 */
export function workCost(g: Grid, r = 10, full = 1.5, dear = 30): Float32Array {
  const { w, h, h0 } = g
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
  // the file over the map's extent, a little more
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
    if (!(p[0] >= 0 && p[1] >= 0 && p[0] <= g.w - 1 && p[1] <= g.h - 1)) throw new Error(`${x}, ${z} is off the relief`)
    return p
  }
  const toPoint = ([i, j]: Pt): Pt => {
    const [x, z] = toMap(place, g.x0 + i * g.cell, g.z0 + j * g.cell)
    return [Math.round(x * 100) / 100, Math.round(z * 100) / 100]
  }
  const NOTE = ': a modern work, mended from the ground around it'
  const features: Record<string, unknown>[] = []
  const report: string[] = []
  for (const w of ins.lines) {
    if (w.pts.length < 2) throw new Error(`${w.id}: a line needs two points or more`)
    // the waypoints onto the work within 4 nodes (20 m of field), then the path along it, evened over 6 nodes
    const pts = w.pts.map(p => snapToInk(cost, g.w, g.h, toNode(p), 4))
    const t = traceWay(
      cost,
      g.w,
      g.h,
      pts,
      pts.map(() => false),
    )
    const line = untangle(simplify(evenKept(t, 6).map(toPoint), 1))
    features.push({
      id: w.id,
      kind: 'relief.mend',
      line,
      width: w.width,
      ...(w.edge !== undefined ? { edge: w.edge } : {}),
      note: `${w.note}${NOTE}`,
    })
    report.push(`${w.id}: ${t.px.length} nodes traced, ${line.length} points`)
  }
  for (const a of ins.areas) {
    const { id, edge, note, ...shape } = a
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
