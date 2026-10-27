// A map's labels for the staff map (docs/plans/active/m8-austerlitz.md M8g): each place named where its feature lies
// (a line at its middle, a village at the middle of its stretch of street, a pond or an area at its centre) or at
// the highest point of the compiled ground in a box (a hill). Only the labels the tool makes (with its note) are
// written again; every other feature is kept (the stable save, src/map/write.ts).
//   node tools/labels.ts <map.json> <labels inputs.json>
// The inputs: { lang, labels: [{ id, text, of?: a feature's id (along?: where on a line, 0 to 1, its middle by
// default), peak?: [west, south, east, north], at?: [x, z] }] }, in the map's metres; one of of, peak and at each.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { lineLength, pointAt } from '../src/map/geometry.ts'
import { cm } from '../src/map/util.ts'
import { writeMap } from '../src/map/write.ts'
import { layersOf } from '../maps/engine.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface LabelInputs {
  lang: string
  labels: { id: string; text: string; of?: string; along?: number; peak?: [number, number, number, number]; at?: Pt }[]
}

/**
 * Where a feature's label goes: on a line, `along` of its length (its middle by default); a village's stretch's
 * middle; a shape's centre (an area's centroid); null if none.
 */
export function anchorOf(f: Feature, byId: Map<string, Feature>, along = 0.5): Pt | null {
  if (f.line) {
    const length = lineLength(f.line)
    if (!(length > 0)) return f.line[0]
    const [x, z] = pointAt(f.line, length * along)
    return [x, z]
  }
  if (f.along) {
    const way = byId.get(f.along.id)
    if (!way?.line) return null
    const [x, z] = pointAt(way.line, (f.along.from + f.along.to) / 2)
    return [x, z]
  }
  if (f.circle) return f.circle[0]
  if (f.ellipse) return f.ellipse[0]
  if (f.area) {
    // the outer ring's centroid (its corners' mean leans toward its densely traced sides)
    const r = f.area[0]
    let [a2, cx, cz] = [0, 0, 0]
    for (let k = 0; k < r.length; k++) {
      const [p, q] = [r[k], r[(k + 1) % r.length]]
      const cross = p[0] * q[1] - q[0] * p[1]
      a2 += cross
      cx += (p[0] + q[0]) * cross
      cz += (p[1] + q[1]) * cross
    }
    return a2 ? [cx / (3 * a2), cz / (3 * a2)] : r[0]
  }
  if (f.point) return f.point
  return null
}

function main(): void {
  const [mapFile, inputsFile] = process.argv.slice(2)
  if (!mapFile || !inputsFile) {
    console.error('usage: node tools/labels.ts <map.json> <labels inputs.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(mapFile, 'utf8')
  const map = JSON.parse(text) as MapFile
  const ins = JSON.parse(fs.readFileSync(inputsFile, 'utf8')) as LabelInputs
  const byId = new Map(map.features.map(f => [f.id, f]))
  // the compiled ground, for the hills
  const L = ins.labels.some(l => l.peak) ? layersOf(path.resolve(mapFile)).layers : null
  const NOTE = ': a name for the staff map'
  const features: Record<string, unknown>[] = []
  const ids = new Set<string>()
  for (const l of ins.labels) {
    if (ids.has(l.id)) throw new Error(`${l.id}: listed twice`)
    ids.add(l.id)
    if ([l.of, l.peak, l.at].filter(v => v !== undefined).length !== 1) {
      throw new Error(`${l.id}: give one of of, peak and at`)
    }
    let p: Pt | null = l.at ?? null
    if (l.of) {
      const f = byId.get(l.of)
      if (!f) throw new Error(`${l.id}: no feature ${l.of}`)
      p = anchorOf(f, byId, l.along)
    } else if (l.peak && L) {
      // the highest node in the box, over its nodes only
      const [w, s, e, n] = l.peak
      let best = -Infinity
      const [i0, i1] = [Math.max(0, Math.ceil((w - L.x0) / L.cell)), Math.min(L.nx, Math.floor((e - L.x0) / L.cell))]
      const [j0, j1] = [Math.max(0, Math.ceil((s - L.z0) / L.cell)), Math.min(L.nz, Math.floor((n - L.z0) / L.cell))]
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const h = L.height[j * (L.nx + 1) + i]
          if (h > best) [best, p] = [h, [L.x0 + i * L.cell, L.z0 + j * L.cell]]
        }
      }
    }
    if (!p) throw new Error(`${l.id}: no place for it`)
    features.push({
      id: l.id,
      kind: 'zone.label',
      point: [cm(p[0]), cm(p[1])],
      text: l.text,
      lang: ins.lang,
      note: `${l.text}${NOTE}`,
    })
  }
  const mine = (f: Feature) => f.kind === 'zone.label' && (f.note ?? '').endsWith(NOTE)
  const others = map.features.filter(f => !mine(f))
  for (const f of features) {
    if (others.some(o => o.id === f.id)) throw new Error(`${String(f.id)}: another feature has this id`)
  }
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${features.length} labels`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
