// A map's villages read off its scan (docs/plans/active/m8-austerlitz.md M8e): the street a village's stretch lies on,
// a church's ground beside its street, and where it goes when its side is taken.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import { churchAt, nearestWay, placeChurch } from '../tools/villages.ts'

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
    const area2 = left.reduce((s, p, k) => s + p[0] * left[(k + 1) % 4][1] - left[(k + 1) % 4][0] * p[1], 0)
    expect(area2).toBeGreaterThan(0)
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
})
