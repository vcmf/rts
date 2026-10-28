// A map's water from its relief and its scan (docs/plans/active/m8-austerlitz.md M8b): lines cut exactly at the map's
// edge, ponds kept apart along their streams, the nearest point of a set of lines.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  apart,
  ellipsesMeet,
  framedEllipse,
  mapPieces,
  nearestOn,
  scanSize,
  streamIds,
  type Ellipse,
} from '../tools/water.ts'

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
    expect(mapPieces(line, ID, [100, 100], 0)).toEqual([
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
    expect(mapPieces(line, ID, [100, 100], 150)).toEqual([])
    // through the placement: the file's frame read at 2×, 500 m south
    expect(
      mapPieces(
        [
          [0, -500],
          [100, -300],
        ],
        { x: 0, z: -500, k: 2 },
        [100, 100],
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
    expect(mapPieces(line, ID, [100, 100], 0)).toEqual([
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
      4,
    )
    expect(out[0]!.e).toEqual(e(500, 50))
    expect(ellipsesMeet(out[0]!.e, out[1]!.e, 10)).toBe(false)
    expect(out[1]!.e[1]).toBe(40) // slid, not shrunk
    expect(Math.abs(out[1]!.e[0][0] - 500)).toBeGreaterThanOrEqual(100)
    // with no stream to slide along, it is shrunk until it fits, never under its minimum
    const boxed = apart(
      [
        { e: e(500, 50), line: null, along: 0 },
        { e: e(560, 40), line: null, along: 0 },
      ],
      0,
      10,
      300,
      4,
    )
    expect(ellipsesMeet(boxed[0]!.e, boxed[1]!.e)).toBe(false)
    expect(boxed[1]!.shrunk).toBe(true)
    // one that would have to go under its minimum to fit is left out
    const none = apart(
      [
        { e: e(500, 50), line: null, along: 0 },
        { e: e(510, 40), line: null, along: 0 },
      ],
      0,
      10,
      300,
      30,
    )
    expect(none[1]).toBeNull()
  })
  it('keeps the part of a segment across a corner, both its ends outside', () => {
    // one that only touches the corner gives no piece
    expect(
      mapPieces(
        [
          [150, 50],
          [50, 150],
        ],
        ID,
        [100, 100],
        0,
      ),
    ).toEqual([])
    // through the square's corner region: x + z = 180 crosses the square from (100, 80) to (80, 100)
    expect(
      mapPieces(
        [
          [140, 40],
          [40, 140],
        ],
        ID,
        [100, 100],
        0,
      ),
    ).toEqual([
      [
        [100, 80],
        [80, 100],
      ],
    ])
  })
  it('keeps the id of the last run stream whose mouth is where it was, the next free brook id for the rest', () => {
    const ids = streamIds(
      [
        [0, 0],
        [500, 500],
        [900, 0],
      ],
      [
        { id: 'brook7', mouth: [10, 20] },
        { id: 'brook3', mouth: [900, 30] },
        { id: 'brook2', mouth: [3000, 0] }, // gone: its id is not handed to another stream
      ],
      new Set(['brook', 'goldbach']),
    )
    expect(ids).toEqual(['brook7', 'brook4', 'brook3'])
  })
  it('gives each mouth the nearest of the old ones, not the first within reach', () => {
    // two tributaries 30 m apart; the old ids listed in the other order
    const ids = streamIds(
      [
        [0, 0],
        [30, 0],
      ],
      [
        { id: 'brook9', mouth: [29, 0] },
        { id: 'brook4', mouth: [1, 0] },
      ],
      new Set(),
    )
    expect(ids).toEqual(['brook4', 'brook9'])
  })
  it("takes a pixel ellipse through the scan's local map: scaled, turned, its long axis kept long", () => {
    // a fit 2 m a pixel, v down (z = -2 v): a pixel ellipse 10 × 5 along u becomes 20 × 10 along x
    const fit = { toFrame: (u: number, v: number): Pt => [2 * u, -2 * v] }
    const [a, b, ang] = framedEllipse(fit, 100, 100, 10, 5, 0)
    expect(a).toBeCloseTo(20, 6)
    expect(b).toBeCloseTo(10, 6)
    expect(Math.abs(Math.sin(ang))).toBeCloseTo(0, 6)
    // along v in the image (90°, down) it lies along z
    const [a2, b2, ang2] = framedEllipse(fit, 100, 100, 10, 5, Math.PI / 2)
    expect(a2).toBeCloseTo(20, 6)
    expect(b2).toBeCloseTo(10, 6)
    expect(Math.abs(Math.cos(ang2))).toBeCloseTo(0, 6)
    // a fit stretched along v: a round pixel ellipse comes out long along z
    const tall = { toFrame: (u: number, v: number): Pt => [u, -3 * v] }
    const [a3, b3, ang3] = framedEllipse(tall, 0, 0, 10, 10, 0)
    expect(a3).toBeCloseTo(30, 6)
    expect(b3).toBeCloseTo(10, 6)
    expect(Math.abs(Math.cos(ang3))).toBeCloseTo(0, 6)
  })
  it('cuts to a map that is not square by its own half-sides', () => {
    expect(
      mapPieces(
        [
          [0, 0],
          [3500, 0],
        ],
        ID,
        [4000, 3000],
        0,
      ),
    ).toEqual([
      [
        [0, 0],
        [3500, 0],
      ],
    ])
  })
  it("reads a JPEG's size at any start of frame, past fill bytes", () => {
    // SOI, an APP0 of 4 bytes, fill bytes, then an arithmetic-coded frame (C9): height 300, width 400
    const b = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xff, 0xff, 0xc9, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90,
      0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')), 'x.jpg')
    fs.writeFileSync(f, b)
    expect(scanSize(f)).toEqual([400, 300])
  })
  it('tells when two ellipses meet: overlapping, one inside the other, or apart', () => {
    expect(ellipsesMeet([[0, 0], 50, 20, 0], [[60, 0], 20, 20, 0])).toBe(true)
    expect(ellipsesMeet([[0, 0], 50, 20, 0], [[0, 0], 5, 5, 0])).toBe(true)
    expect(ellipsesMeet([[0, 0], 50, 20, 0], [[0, 60], 20, 20, 0])).toBe(false)
    // turned a quarter, the long axis reaches it
    expect(ellipsesMeet([[0, 0], 50, 20, Math.PI / 2], [[0, 60], 20, 20, 0])).toBe(true)
    // a thin pond across a long one, between where 48 samples of the long one's outline would fall
    expect(ellipsesMeet([[0, 0], 400, 8, 0], [[13, 200], 300, 3, Math.PI / 2])).toBe(true)
  })
})
