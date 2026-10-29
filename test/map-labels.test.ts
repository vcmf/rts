// A map's labels for the staff map (docs/plans/active/m8-austerlitz.md M8g): where each place's name goes.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Feature, MapFile } from '../src/map/schema.ts'
import { cm } from '../src/map/util.ts'
import { anchorOf, type LabelInputs } from '../tools/labels.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const road: Feature = {
  id: 'road',
  kind: 'way.road',
  line: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
}
const byId = new Map([[road.id, road]])

describe("a map's labels", () => {
  it('names a line at its middle, a village at the middle of its stretch, a shape at its centre', () => {
    expect(anchorOf(road, byId)).toEqual([100, 0])
    const village: Feature = { id: 'v', kind: 'built.village', along: { id: 'road', from: 20, to: 60 } }
    expect(anchorOf(village, byId)).toEqual([40, 0])
    expect(anchorOf({ id: 'p', kind: 'water.pond', ellipse: [[5, 6], 10, 4, 0] }, byId)).toEqual([5, 6])
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as [number, number][]
    expect(anchorOf({ id: 'a', kind: 'veg.wood', area: [square] }, byId)).toEqual([5, 5])
    // a village on a way that is not there has no place
    expect(anchorOf({ id: 'w', kind: 'built.village', along: { id: 'gone', from: 0, to: 1 } }, byId)).toBeNull()
  })
  it("puts an area's name at its centroid, not its corners' mean", () => {
    // an L whose long arm has many corners: their mean leans into the arm; the centroid does not
    const ring = [
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
      [40, 10],
      [10, 10],
      [10, 40],
      [0, 40],
    ] as [number, number][]
    const [x, z] = anchorOf({ id: 'l', kind: 'veg.wood', area: [ring] }, byId)!
    expect(x).toBeCloseTo(13.571, 2)
    expect(z).toBeCloseTo(13.571, 2)
  })
  it("keeps Austerlitz's committed names where their features are (a rerun of a tool that moves one shows here)", () => {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'maps/austerlitz.map.json'), 'utf8')) as MapFile
    const ins = JSON.parse(fs.readFileSync(path.join(root, 'maps/austerlitz-labels.json'), 'utf8')) as LabelInputs
    const ids = new Map(map.features.map(f => [f.id, f]))
    for (const l of ins.labels) {
      const label = ids.get(l.id)!
      expect(label.kind).toBe('zone.label')
      if (l.at) expect(label.point).toEqual(l.at)
      if (!l.of) continue
      const p = anchorOf(ids.get(l.of)!, ids, l.along)!
      expect(label.point).toEqual([cm(p[0]), cm(p[1])])
    }
  })
})
