// A map's labels for the staff map (docs/plans/active/m8-austerlitz.md M8g): where each place's name goes.
import { describe, it, expect } from 'vitest'
import type { Feature } from '../src/map/schema.ts'
import { anchorOf } from '../tools/labels.ts'

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
})
