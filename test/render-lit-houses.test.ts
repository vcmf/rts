// The lit map's buildings (docs/plans/active/m6-lit-view.md, M6b; decision 0065): which stand on the cells, and
// their footprints' triangles (a concave one, a courtyard).
import { describe, it, expect } from 'vitest'
import type { Feature, Pt } from '../src/map/schema.ts'
import type { Resolved } from '../src/map/resolve.ts'
import { bridged, ccw, standing, triangulate } from '../src/render/lit/houses.ts'

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
