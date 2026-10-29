// The campaign map prototype's theatre tool (docs/plans/active/k1-theatre-look.md): its projection and grid, the
// lakes' rings kept through simplification, and the road router.
import { describe, it, expect } from 'vitest'
import {
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

describe('lines and rings', () => {
  it('keeps a closed lake ring through simplification', () => {
    // a closed ring: its first point is its last, as GeoJSON writes them
    const ring: Pt[] = []
    for (let k = 0; k <= 40; k++) {
      ring.push([Math.cos((k / 40) * 2 * Math.PI) * 5000, Math.sin((k / 40) * 2 * Math.PI) * 5000])
    }
    const kept = simplify(ring, 125)
    expect(kept.length).toBeGreaterThan(8)
    expect(inRing(kept, [0, 0])).toBe(true)
    expect(inRing(kept, [6000, 0])).toBe(false)
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
    // every segment, not only its points, stays out of the water
    for (let k = 1; k < path.length; k++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const p: Pt = [
          path[k - 1][0] + (path[k][0] - path[k - 1][0]) * t,
          path[k - 1][1] + (path[k][1] - path[k - 1][1]) * t,
        ]
        expect(inRing(lake, p)).toBe(false)
      }
    }
  })

  it('never cuts between two closed cells on a diagonal', () => {
    // a wall of single closed cells along the anti-diagonal: only a diagonal step could slip through it
    const grid = routeGrid(frame, 500, () => 0, [])
    for (let i = 0; i < grid.gx; i++) grid.closed[(grid.gz - 1 - i) * grid.gx + i] = 1
    expect(() => route(grid, [-8000, -8000], [8000, 8000], 0.04)).toThrow(/no route/)
  })
})
