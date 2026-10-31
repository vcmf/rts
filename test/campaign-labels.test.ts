// The campaign map's labels (src/render/campaign/labels.ts, docs/plans/active/k2d-ink.md) and the test that hides
// one behind the relief (src/render/campaign/camera.ts seenFrom).
import { describe, it, expect } from 'vitest'
import {
  nameSpots,
  overlaps,
  Placement,
  regionStyle,
  riverNamed,
  riverNamePlace,
  riverShown,
  townFont,
  townMark,
  townsShown,
  turnedBox,
  type Box,
} from '../src/render/campaign/labels.ts'
import { seenFrom } from '../src/render/campaign/camera.ts'

/** A seeded generator of numbers in [0, 1). */
function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('the towns', () => {
  const towns = [
    { id: 'a', size: 1 },
    { id: 'b', size: 4 },
    { id: 'c', size: 2 },
    { id: 'd', size: 3 },
  ]

  it('show by their size and the zoom, the largest first', () => {
    expect(townsShown(towns, 0.5).map(t => t.id)).toEqual(['b'])
    expect(townsShown(towns, 1).map(t => t.id)).toEqual(['b', 'd'])
    expect(townsShown(towns, 3).map(t => t.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('have a mark that grows with the town and a little with the zoom, a capital name in spaced capitals', () => {
    expect(townMark(4, 1)).toBeGreaterThan(townMark(1, 1))
    expect(townMark(2, 10)).toBeCloseTo(3.4 * 1.3, 9)
    expect(townFont(4)).toEqual({ px: 21, big: true, spacingEm: 0.12 })
    expect(townFont(1)).toEqual({ px: 14, big: false, spacingEm: 0.02 })
  })

  it('try their name right, left, above and below the mark, clear of it', () => {
    const spots = nameSpots(100, 100, 4, 50, 16)
    const mark: Box = [96, 96, 8, 8]
    expect(spots).toHaveLength(4)
    for (const { box } of spots) expect(overlaps(box, mark)).toBe(false)
    expect(spots[0].box[0]).toBeGreaterThan(104)
    expect(spots[1].box[0] + spots[1].box[2]).toBeLessThan(96)
  })
})

describe('the placement', () => {
  it('never lets a name overlap a name or a mark, on a crowded screen', () => {
    const R = mulberry(7)
    const p = new Placement()
    const marks: Box[] = []
    for (let k = 0; k < 120; k++) {
      const m: Box = [R() * 400, R() * 300, 6, 6]
      marks.push(m)
      p.mark(m)
    }
    let placed = 0
    for (const m of marks) {
      const spots = nameSpots(m[0] + 3, m[1] + 3, 3, 30 + R() * 60, 14)
      if (
        p.take(
          spots.map(s => s.box),
          m,
        ) >= 0
      ) {
        placed++
      }
    }
    expect(placed).toBeGreaterThan(10)
    for (let i = 0; i < p.names.length; i++) {
      for (let j = i + 1; j < p.names.length; j++) expect(overlaps(p.names[i], p.names[j])).toBe(false)
      for (const m of p.marks) expect(overlaps(p.names[i], m)).toBe(false)
    }
  })

  it('takes the first free place, or none', () => {
    const p = new Placement()
    p.mark([0, 0, 10, 10])
    expect(
      p.take([
        [5, 5, 10, 10],
        [20, 0, 10, 10],
      ]),
    ).toBe(1)
    expect(p.take([[22, 2, 4, 4]])).toBe(-1)
  })
})

describe('the rivers', () => {
  it('show and carry their names by rank and zoom', () => {
    expect(riverShown(3, 0)).toBe(true)
    expect(riverShown(6, 0.5)).toBe(false)
    expect(riverShown(6, 0.6)).toBe(true)
    expect(riverNamed(6, 1)).toBe(false)
    expect(riverNamed(6, 2)).toBe(true)
    expect(riverNamed(9, 2)).toBe(false)
  })

  it('name the longest run on screen, at its middle, upright along the course', () => {
    const inside = ([x, y]: [number, number]) => x > 0 && y > 0 && x < 1000 && y < 1000
    // a short run, and a long one going right to left and down (its angle turned upright)
    const short: [number, number][] = [
      [10, 10],
      [60, 10],
    ]
    const long: [number, number][] = Array.from({ length: 11 }, (_, k): [number, number] => [
      900 - k * 80,
      100 + k * 10,
    ])
    const place = riverNamePlace([short, long], inside)!
    expect(place.run).toBe(1)
    expect(place.at).toEqual(long[5])
    expect(place.angle).toBeCloseTo(Math.atan2(-10, 80), 9)
    expect(riverNamePlace([short], inside)).toBeNull()
  })
})

describe('a turned name', () => {
  it('takes the box round its text as turned: as wide as long when level, as tall as long when upright', () => {
    const level = turnedBox([100, 100], 0, 60, -18, 1)
    expect(level).toEqual([70, 82, 60, 19])
    const upright = turnedBox([100, 100], Math.PI / 2, 60, -18, 1)
    expect(upright[2]).toBeCloseTo(19, 9)
    expect(upright[3]).toBeCloseTo(60, 9)
  })

  it('keeps a town name clear of a steep river name it would have overlapped as a level box', () => {
    const river = turnedBox([100, 100], 1.2, 80, -18, 1)
    const town: Box = [96, 60, 30, 12]
    expect(overlaps([60, 82, 80, 19], town)).toBe(false)
    expect(overlaps(river, town)).toBe(true)
  })
})

describe('the regions', () => {
  it('fade out as the camera closes in, their letters growing with the zoom', () => {
    expect(regionStyle(1).alpha).toBe(0.5)
    expect(regionStyle(4).alpha).toBe(0)
    expect(regionStyle(0.1).px).toBe(13)
    expect(regionStyle(10).px).toBe(46)
  })
})

describe('the ink hidden behind the relief', () => {
  // a ridge 3 km high along x = 10 km, 1 km wide; flat ground elsewhere
  const rise = (x: number) => (Math.abs(x - 10) < 0.5 ? 3 : 0)

  it('hides a point behind a ridge from an eye low enough, and shows it from higher', () => {
    expect(seenFrom([0, 4, 0], [20, 0, 0], rise)).toBe(false)
    expect(seenFrom([0, 8, 0], [20, 0, 0], rise)).toBe(true)
  })

  it('shows a point in the open and one on the ridge itself', () => {
    expect(seenFrom([0, 4, 0], [5, 0, 0], rise)).toBe(true)
    expect(seenFrom([0, 4, 0], [10, 3, 0], rise)).toBe(true)
  })
})
