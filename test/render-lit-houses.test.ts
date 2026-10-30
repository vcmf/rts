// The lit map's buildings (docs/plans/active/m6-lit-view.md, M6b; decision 0065): which stand on the cells, and
// their footprints' triangles (a concave one, a courtyard).
import { describe, it, expect } from 'vitest'
import type { Feature, Pt } from '../src/map/schema.ts'
import type { Resolved } from '../src/map/resolve.ts'
import { bridged, ccw, shadowQuads, standing, triangulate, type Standing } from '../src/render/lit/houses.ts'

const grid = { x0: -20, z0: -20, cell: 2, nx: 20, nz: 20 }
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]
// the built layer as apply paints it: each feature's 1-based index on the cells whose centres lie in its rectangle
function paint(houses: { k: number; r: Pt[] }[]): Uint16Array {
  const built = new Uint16Array(grid.nx * grid.nz)
  for (const { k, r } of houses) {
    for (let j = 0; j < grid.nz; j++) {
      for (let i = 0; i < grid.nx; i++) {
        const x = grid.x0 + (i + 0.5) * grid.cell
        const z = grid.z0 + (j + 0.5) * grid.cell
        if (x >= r[0][0] && x <= r[1][0] && z >= r[0][1] && z <= r[2][1]) built[j * grid.nx + i] = k
      }
    }
  }
  return built
}
const house = (id: string, attrs: Record<string, string | number> = {}): Resolved => ({
  id,
  kind: 'built.house',
  priority: 80,
  attrs: { wall: 4, roof: 'tile', ...attrs },
})
const area2 = (ring: Pt[], tris: [number, number, number][]) =>
  tris.reduce((s, [a, b, c]) => {
    const [p, q, r] = [ring[a], ring[b], ring[c]]
    return s + Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  }, 0) / 2

describe('M6b: which buildings stand', () => {
  it('a house on its own cells stands; one whose cells another took does not', () => {
    const a = rect(-8, -8, 0, 0)
    const b = rect(2, 2, 10, 10)
    const features: Feature[] = [
      { id: 'a', area: [a] },
      { id: 'b', area: [b] },
    ]
    // a bridge (index 3) took all of b's cells
    const built = paint([
      { k: 1, r: a },
      { k: 3, r: b },
    ])
    const out = standing(features, [house('a'), house('b'), house('bridge')], built, grid)
    expect(out.map(h => h.rings[0])).toEqual([ccw(a)])
  })
  it('a house that lost a cell to its neighbour on a shared wall still stands', () => {
    const a = rect(-8, -8, 0, 0)
    const b = rect(0, -8, 8, 0) // the two share the wall x = 0
    const built = paint([
      { k: 1, r: a },
      { k: 2, r: rect(-2, -8, 8, 0) }, // b painted after a, taking a's last column of cells
    ])
    const out = standing(
      [
        { id: 'a', area: [a] },
        { id: 'b', area: [b] },
      ],
      [house('a'), house('b')],
      built,
      grid,
    )
    expect(out.length).toBe(2)
  })
  it("takes a burnt house's roof away, and keeps a courtyard's ring", () => {
    const outer = rect(-10, -10, 10, 10)
    const yard = rect(-4, -4, 4, 4)
    const built = paint([{ k: 1, r: outer }])
    for (let j = 0; j < grid.nz; j++) {
      for (let i = 0; i < grid.nx; i++) {
        const x = grid.x0 + (i + 0.5) * grid.cell
        const z = grid.z0 + (j + 0.5) * grid.cell
        if (Math.abs(x) < 4 && Math.abs(z) < 4) built[j * grid.nx + i] = 0 // the courtyard is no house
      }
    }
    const [farm] = standing([{ id: 'farm', area: [outer, yard] }], [house('farm')], built, grid)
    expect(farm.rings.length).toBe(2)
    expect(farm.roof).toBe(true)
    const burnt = standing([{ id: 'farm', area: [outer, yard] }], [house('farm', { roof: 'none' })], built, grid)
    expect(burnt[0].roof).toBe(false)
  })
})

describe('M6b: footprints into triangles', () => {
  it('a convex ring and an L-shaped one: the triangles cover exactly the footprint', () => {
    const square = ccw(rect(0, 0, 4, 4))
    expect(area2(square, triangulate(square))).toBeCloseTo(16, 9)
    const L: Pt[] = ccw([
      [0, 0],
      [6, 0],
      [6, 2],
      [2, 2],
      [2, 6],
      [0, 6],
    ])
    expect(area2(L, triangulate(L))).toBeCloseTo(20, 9)
  })
  it('a corner on a straight edge is dropped, not a sliver', () => {
    const ring = ccw([
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ])
    expect(area2(ring, triangulate(ring))).toBeCloseTo(16, 9)
  })
  it('a courtyard bridged into the outline leaves its area uncovered', () => {
    const outline = bridged([rect(-10, -10, 10, 10), rect(-4, -4, 4, 4)])
    expect(area2(outline, triangulate(outline))).toBeCloseTo(400 - 64, 6)
  })
})

describe("G2b: the buildings' shadows on the ground", () => {
  // a sun in the east 30° high
  const east = { el: 30, az: 90, size: 2.5 }
  const house = (rings: Pt[][], height: number, roof = true): Standing => ({
    rings: rings.map(ccw),
    height,
    church: false,
    roof,
  })
  // whether a point lies in the shadow's triangles
  const shaded = (s: { xz: number[]; tris: number[] }, [x, z]: Pt) => {
    const P = (k: number): Pt => [s.xz[2 * k], s.xz[2 * k + 1]]
    for (let t = 0; t < s.tris.length; t += 3) {
      const [a, b, c] = [P(s.tris[t]), P(s.tris[t + 1]), P(s.tris[t + 2])]
      const d = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
      const [d1, d2, d3] = [d(a, b, [x, z]), d(b, c, [x, z]), d(c, a, [x, z])]
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true
    }
    return false
  }
  it("falls away from the sun, as long as the wall over the tangent of the sun's height", () => {
    // a 10 m house 6 m high, from x 30 to 40: its shadow runs 10.4 m west of its west wall, to x 19.6
    const s = shadowQuads([house([rect(30, 25, 40, 35)], 6)], east)
    expect(shaded(s, [25, 30])).toBe(true)
    expect(shaded(s, [19.8, 30])).toBe(true)
    expect(shaded(s, [19.4, 30])).toBe(false)
    expect(shaded(s, [41, 30])).toBe(false) // none toward the sun
    expect(shaded(s, [25, 36])).toBe(false) // none beside it
  })
  it('from a height raised bz times, at most SHADOW_REACH, and none from a negative bz', () => {
    const h = [house([rect(30, 25, 40, 35)], 6)]
    expect(shaded(shadowQuads(h, east, 3), [0, 30])).toBe(true)
    expect(shaded(shadowQuads(h, { ...east, el: 1 }, 1), [30 - 101, 30])).toBe(false)
    expect(shaded(shadowQuads(h, east, -1), [29, 30])).toBe(false)
  })
  it('terraced houses on one wall cast one shadow, with no stripe along their party wall', () => {
    const s = shadowQuads([house([rect(30, 20, 40, 31)], 6), house([rect(30, 31, 40, 40)], 6)], east)
    for (const z of [30.9, 31, 31.1]) expect(shaded(s, [25, z])).toBe(true)
  })
  it("a courtyard's walls shade it in part; a roofless ruin's floor by its walls", () => {
    // a 20 m square with an 8 m courtyard (x 36 to 44), 3 m high: the east wing's inner face shades 5.2 m of it
    const yard = shadowQuads([house([rect(30, 20, 50, 40), rect(36, 26, 44, 34)], 3)], east)
    expect(shaded(yard, [42, 30])).toBe(true)
    expect(shaded(yard, [37, 30])).toBe(false)
    const ruin = shadowQuads([house([rect(30, 25, 40, 35)], 3, false)], east)
    expect(shaded(ruin, [37, 30])).toBe(true)
    expect(shaded(ruin, [31, 30])).toBe(false)
  })
})
