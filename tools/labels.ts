// A map's labels for the staff map (docs/plans/active/m8-austerlitz.md M8g): each place named where its feature lies
// (a line at its middle, a village at the middle of its stretch of street, a pond or an area at its centre) or at
// the highest point of the compiled ground in a box (a hill). Only the labels the tool makes (with its note) are
// written again; every other feature is kept (the stable save, src/map/write.ts).
//   node tools/labels.ts <map.json> <labels inputs.json>
// The inputs: { labels: [{ id, text, of?: a feature's id, peak?: [west, south, east, north], at?: [x, z] }] }, in the
// map's metres.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { lineLength, pointAt } from '../src/map/geometry.ts'
import { cm } from '../src/map/util.ts'
import { writeMap } from '../src/map/write.ts'
import { layersOf } from '../maps/engine.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface LabelInputs {
  labels: { id: string; text: string; of?: string; peak?: [number, number, number, number]; at?: Pt }[]
}

/** Where a feature's label goes: a line's middle, a village's stretch's middle, a shape's centre; null if none. */
export function anchorOf(f: Feature, byId: Map<string, Feature>): Pt | null {
  if (f.line) {
    const [x, z] = pointAt(f.line, lineLength(f.line) / 2)
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
    const r = f.area[0]
    return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
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
  for (const l of ins.labels) {
    let p: Pt | null = l.at ?? null
    if (l.of) {
      const f = byId.get(l.of)
      if (!f) throw new Error(`${l.id}: no feature ${l.of}`)
      p = anchorOf(f, byId)
    } else if (l.peak && L) {
      const [w, s, e, n] = l.peak
      let best = -Infinity
      for (let j = 0; j <= L.nz; j++) {
        for (let i = 0; i <= L.nx; i++) {
          const [x, z] = [L.x0 + i * L.cell, L.z0 + j * L.cell]
          if (x < w || x > e || z < s || z > n) continue
          const h = L.height[j * (L.nx + 1) + i]
          if (h > best) [best, p] = [h, [x, z]]
        }
      }
    }
    if (!p) throw new Error(`${l.id}: no place for it`)
    features.push({ id: l.id, kind: 'zone.label', point: [cm(p[0]), cm(p[1])], text: l.text, note: `${l.text}${NOTE}` })
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
