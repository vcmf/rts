// The campaign map prototype's theatre tool (docs/plans/active/k1-theatre-look.md): its projection and grid, the PNG
// decoder for the terrain tiles, the lakes' rings kept through simplification, and the road router.
import zlib from 'node:zlib'
import { describe, it, expect } from 'vitest'
import {
  decodePng,
  frameGrid,
  inRing,
  lineLength,
  projection,
  route,
  routeGrid,
  simplify,
  smooth,
  type Pt,
} from '../tools/campaign-theatre-lib.ts'

/** A PNG of the given RGB rows, each row filtered with the given filter byte (the bytes already filtered). */
function png(width: number, height: number, filtered: number[][]): Uint8Array {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'latin1')
    return Buffer.concat([head, body, Buffer.alloc(4)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.from(filtered.flat())
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return new Uint8Array(
    Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
  )
}

describe('the theatre projection', () => {
  const proj = projection(48.5, 12.3)

  it('puts the centre at the origin and goes back to the same degrees', () => {
    expect(proj.forward(48.5, 12.3)).toEqual([0, 0])
    for (const [lat, lon] of [
      [48.208, 16.373],
      [50.076, 14.438],
      [46.624, 7.5],
    ]) {
      const [x, z] = proj.forward(lat, lon)
      const [la, lo] = proj.inverse(x, z)
      expect(la).toBeCloseTo(lat, 9)
      expect(lo).toBeCloseTo(lon, 9)
    }
  })

  it('keeps north up and distances true near the centre', () => {
    const [, zNorth] = proj.forward(49.5, 12.3)
    // a degree of latitude on the sphere: 2πR / 360
    expect(zNorth).toBeCloseTo((2 * Math.PI * 6371007.2) / 360, -2)
    const [xEast] = proj.forward(48.5, 13.3)
    expect(xEast).toBeGreaterThan(0)
  })
})

describe('the frame grid', () => {
  const frame = { lat0: 0, lon0: 0, halfX: 400000, halfZ: 250000 }

  it('spans the frame from edge to edge', () => {
    expect(frameGrid(frame, 250)).toEqual({ nx: 3201, nz: 2001 })
  })

  it('refuses a cell that does not divide the frame', () => {
    expect(() => frameGrid(frame, 300)).toThrow(/does not divide/)
  })
})

describe('the PNG decoder', () => {
  it('undoes every filter', () => {
    // 2 × 5 pixels, row r filtered with filter r; the pixels are chosen, and each row's bytes filtered here by hand
    const want = [
      [10, 20, 30, 40, 50, 60],
      [12, 22, 32, 45, 55, 65],
      [20, 10, 0, 255, 128, 1],
      [7, 9, 11, 13, 15, 17],
      [100, 50, 25, 90, 45, 20],
    ]
    const sub = (row: number[]) => row.map((v, i) => (v - (i >= 3 ? row[i - 3] : 0)) & 255)
    const up = (row: number[], prev: number[]) => row.map((v, i) => (v - prev[i]) & 255)
    const avg = (row: number[], prev: number[]) =>
      row.map((v, i) => (v - (((i >= 3 ? row[i - 3] : 0) + prev[i]) >> 1)) & 255)
    const paeth = (row: number[], prev: number[]) =>
      row.map((v, i) => {
        const a = i >= 3 ? row[i - 3] : 0
        const b = prev[i]
        const c = i >= 3 ? prev[i - 3] : 0
        const p = a + b - c
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        return (v - pred) & 255
      })
    const rows = [
      [0, ...want[0]],
      [1, ...sub(want[1])],
      [2, ...up(want[2], want[1])],
      [3, ...avg(want[3], want[2])],
      [4, ...paeth(want[4], want[3])],
    ]
    const image = decodePng(png(2, 5, rows))
    expect(image.channels).toBe(3)
    expect([...image.pixels]).toEqual(want.flat())
  })
})

describe('lines and rings', () => {
  it('keeps a closed lake ring through simplification', () => {
    // a closed ring: its first point is its last, as GeoJSON writes them
    const ring: Pt[] = []
    for (let k = 0; k <= 40; k++) {
      ring.push([Math.cos((k / 40) * 2 * Math.PI) * 5000, Math.sin((k / 40) * 2 * Math.PI) * 5000])
    }
    const kept = simplify(ring, 125)
    expect(kept.length).toBeGreaterThan(8)
    expect(inRing(kept, 0, 0)).toBe(true)
    expect(inRing(kept, 6000, 0)).toBe(false)
  })

  it('keeps a hairpin whose far points lie past its chord', () => {
    const hairpin: Pt[] = [
      [0, 0],
      [1000, 0],
      [1500, 0],
      [1000, 10],
      [500, 10],
    ]
    expect(simplify(hairpin, 50)).toContainEqual([1500, 0])
  })

  it('smooths a corner and keeps the ends', () => {
    const corner: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ]
    const s = smooth(corner, 2)
    expect(s[0]).toEqual([0, 0])
    expect(s[s.length - 1]).toEqual([100, 100])
    expect(lineLength(s)).toBeLessThan(lineLength(corner))
  })
})

describe('the road router', () => {
  const frame = { lat0: 0, lon0: 0, halfX: 10000, halfZ: 10000 }

  it('goes around a ridge rather than over it', () => {
    // a 400 m ridge along x = 0 from the south edge to z = 6 km; low ground north of it
    const height = (x: number, z: number) => (Math.abs(x) < 1500 && z < 6000 ? 400 : 0)
    const grid = routeGrid(frame, 500, height, [])
    const path = route(grid, [-5000, -5000], [5000, -5000], 0.04)
    expect(path[0]).toEqual([-5000, -5000])
    expect(path[path.length - 1]).toEqual([5000, -5000])
    // every point on the ridge's line lies north of its end
    const crossing = path.filter(([x]) => Math.abs(x) < 250)
    expect(crossing.length).toBeGreaterThan(0)
    for (const [, z] of crossing) expect(z).toBeGreaterThanOrEqual(6000)
  })

  it('never crosses a lake', () => {
    const lake: Pt[] = [
      [-2000, -8000],
      [2000, -8000],
      [2000, 8000],
      [-2000, 8000],
    ]
    const grid = routeGrid(frame, 500, () => 0, [lake])
    const path = route(grid, [-6000, 0], [6000, 0], 0.04)
    for (const [x, z] of path) expect(inRing(lake, x, z)).toBe(false)
  })
})
