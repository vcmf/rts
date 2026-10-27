// A map's water from its relief and its scan (docs/plans/active/m8-austerlitz.md M8b): lines cut exactly at the map's
// edge, ponds kept apart along their streams, the nearest point of a set of lines.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import { apart, ellipsesMeet, mapPieces, nearestOn, pointAlong, type Ellipse } from '../tools/water.ts'

const ID = { x: 0, z: 0, k: 1 }

describe("a map's water", () => {
  it('cuts a line exactly at the edge where it leaves and where it comes back, and drops slivers', () => {
    // from inside, out past x = 100, and back in
    const line: Pt[] = [
      [0, 0],
      [200, 0],
      [200, 50],
      [0, 50],
    ]
    expect(mapPieces(line, ID, 100, 0)).toEqual([
      [
        [0, 0],
        [100, 0],
      ],
      [
        [100, 50],
        [0, 50],
      ],
    ])
    // a piece shorter than its minimum length goes
    expect(mapPieces(line, ID, 100, 150)).toEqual([])
    // through the placement: the file's frame read at 2×, 500 m south
    expect(
      mapPieces(
        [
          [0, -500],
          [100, -300],
        ],
        { x: 0, z: -500, k: 2 },
        100,
        0,
      ),
    ).toEqual([
      [
        [0, 0],
        [50, 100],
      ],
    ])
  })
  it('keeps a crossing that falls on a point once', () => {
    const line: Pt[] = [
      [0, 0],
      [100, 0],
      [150, 0],
    ]
    expect(mapPieces(line, ID, 100, 0)).toEqual([
      [
        [0, 0],
        [100, 0],
      ],
    ])
  })
  it('finds the nearest point of a set of lines, and its distance along its line', () => {
    const lines = [
      {
        id: 1,
        pts: [
          [0, 0],
          [100, 0],
        ] as Pt[],
      },
      {
        id: 2,
        pts: [
          [0, 50],
          [0, 150],
        ] as Pt[],
      },
    ]
    expect(nearestOn(lines, [30, 10])).toEqual({ id: 1, at: [30, 0], d: 10, along: 30 })
    expect(nearestOn(lines, [5, 120])).toMatchObject({ id: 2, at: [0, 120], d: 5, along: 70 })
    expect(pointAlong(lines[0].pts, 40)).toEqual([40, 0])
    expect(pointAlong(lines[0].pts, 400)).toEqual([100, 0])
  })
  it('slides a pond along its stream until it meets none placed before it, and shrinks one that finds no room', () => {
    const stream: Pt[] = [
      [0, 0],
      [1000, 0],
    ]
    const e = (x: number, r: number): Ellipse => [[x, 0], r, r, 0]
    const out = apart(
      [
        { e: e(500, 50), line: stream, along: 500 },
        { e: e(520, 40), line: stream, along: 520 },
      ],
      10,
      10,
      300,
    )
    expect(out[0]).toEqual(e(500, 50))
    expect(ellipsesMeet(out[0], out[1], 10)).toBe(false)
    expect(out[1][1]).toBe(40) // slid, not shrunk
    expect(Math.abs(out[1][0][0] - 500)).toBeGreaterThanOrEqual(100)
    // with no stream to slide along, it is shrunk until it fits
    const boxed = apart(
      [
        { e: e(500, 50), line: null, along: 0 },
        { e: e(560, 40), line: null, along: 0 },
      ],
      0,
      10,
      300,
    )
    expect(ellipsesMeet(boxed[0], boxed[1])).toBe(false)
    expect(boxed[1][1]).toBeLessThan(40)
  })
  it('tells when two ellipses meet: overlapping, one inside the other, or apart', () => {
    expect(ellipsesMeet([[0, 0], 50, 20, 0], [[60, 0], 20, 20, 0])).toBe(true)
    expect(ellipsesMeet([[0, 0], 50, 20, 0], [[0, 0], 5, 5, 0])).toBe(true)
    expect(ellipsesMeet([[0, 0], 50, 20, 0], [[0, 60], 20, 20, 0])).toBe(false)
    // turned a quarter, the long axis reaches it
    expect(ellipsesMeet([[0, 0], 50, 20, Math.PI / 2], [[0, 60], 20, 20, 0])).toBe(true)
  })
})
