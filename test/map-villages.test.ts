// A map's villages read off its scan (docs/plans/active/m8-austerlitz.md M8e): the street a village's stretch lies on,
// a church's ground beside its street, where it goes when its side is taken, and what it keeps clear of.
import { describe, it, expect } from 'vitest'
import type { Feature, Pt } from '../src/map/schema.ts'
import { ringArea2 } from '../src/map/geometry.ts'
import { churchAt, churchClear, nearestWay, placeChurch } from '../tools/villages.ts'

const street: Pt[] = [
  [0, 0],
  [200, 0],
]

describe("a map's villages", () => {
  it('takes the way nearest both ends of a stretch, and their distances along it', () => {
    const ways = [
      { id: 'far', line: street.map(([x, z]): Pt => [x, z + 50]) },
      { id: 'near', line: street },
    ]
    expect(nearestWay(ways, [30, 4], [150, -3])).toEqual({ id: 'near', from: 30, to: 150 })
  })
  it("lays a church along its street, off the street's edge, on the side asked, counter-clockwise", () => {
    const left = churchAt(street, 100, true, 2.5)
    const zs = left.map(p => p[1])
    // left of an eastward street is north: from the edge (2.5) plus 6 m, 11 m deep
    expect(Math.min(...zs)).toBeCloseTo(8.5, 6)
    expect(Math.max(...zs)).toBeCloseTo(19.5, 6)
    const xs = left.map(p => p[0])
    expect(Math.min(...xs)).toBeCloseTo(88, 6)
    expect(Math.max(...xs)).toBeCloseTo(112, 6)
    expect(ringArea2(left)).toBeGreaterThan(0)
    expect(Math.max(...churchAt(street, 100, false, 2.5).map(p => p[1]))).toBeCloseTo(-8.5, 6)
  })
  it("puts a church on the survey's side if it may, else across the street, else along it", () => {
    const at: Pt = [100, 10]
    expect(Math.min(...placeChurch(street, at, 2.5, () => true)!.map(p => p[1]))).toBeGreaterThan(0)
    // the north side taken: across
    const south = placeChurch(street, at, 2.5, r => r.every(p => p[1] < 0))!
    expect(Math.max(...south.map(p => p[1]))).toBeLessThan(0)
    // both sides taken near x = 100: slid along the street until its ground is clear
    const slid = placeChurch(street, at, 2.5, r => r.every(p => p[0] > 130))!
    expect(Math.min(...slid.map(p => p[0]))).toBeGreaterThan(130)
    expect(placeChurch(street, at, 2.5, () => false)).toBeNull()
  })
  it('keeps a church clear of a pond, of a stream across it between its corners, and its own street by its setback', () => {
    const ring = churchAt(street, 100, true, 2.5) // x 88 … 112, z 8.5 … 19.5
    const own = { f: { id: 'street', kind: 'way.road', line: street } as Feature, attrs: { width: 5 } }
    expect(churchClear(ring, [own], 'street', 3)).toBe(true)
    // a pond lying under it
    const pond = { f: { id: 'pond', kind: 'water.pond', ellipse: [[100, 14], 30, 10, 0] } as Feature, attrs: {} }
    expect(churchClear(ring, [own, pond], 'street', 3)).toBe(false)
    // a 2 m brook across its long sides, 6 m from every corner and side's middle
    const brook = {
      f: {
        id: 'brook',
        kind: 'water.stream',
        line: [
          [94, 0],
          [94, 30],
        ],
      } as Feature,
      attrs: { width: 2 },
    }
    expect(churchClear(ring, [own, brook], 'street', 3)).toBe(false)
    // its own street bending in under it
    const bent = {
      f: {
        id: 'street',
        kind: 'way.road',
        line: [
          [0, 0],
          [105, 0],
          [112, 12],
        ],
      } as Feature,
      attrs: { width: 5 },
    }
    expect(churchClear(ring, [bent], 'street', 3)).toBe(false)
  })
})
