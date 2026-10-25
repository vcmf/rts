// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a): the relief's light, cast shadow and exposure for
// every direction of the light, and the cells' mask.
import { describe, it, expect } from 'vitest'
import { bakeInk, bakeMasks, bakeRelief, inkOf, INK_RANGE, LIGHTS, type LightDir } from '../src/render/lit/bake.ts'
import type { Pt } from '../src/map/schema.ts'
import type { Resolved } from '../src/map/resolve.ts'

const N = 81 // nodes a side, 2 m apart
const at = (out: Uint8Array, i: number, j: number) => [...out.slice((j * N + i) * 4, (j * N + i) * 4 + 3)]
// a flat field with a block 20 m high in its middle (nodes 35..45)
const block = (() => {
  const h = new Float64Array(N * N)
  for (let j = 35; j <= 45; j++) for (let i = 35; i <= 45; i++) h[j * N + i] = 20
  return h
})()

describe('M6a: the relief bake', () => {
  it('flat ground: the slope light in its middle, lit, evenly exposed', () => {
    const out = bakeRelief(new Float64Array(N * N), N, N, 2, 'nw')
    const [r, g, b] = at(out, 40, 40)
    expect(r).toBe(128)
    expect(g).toBe(255)
    expect(b).toBe(128)
  })
  for (const dir of Object.keys(LIGHTS) as LightDir[]) {
    it(`a block casts its shadow away from a light from the ${dir}, never toward it`, () => {
      const [di, dj] = LIGHTS[dir]
      const out = bakeRelief(block, N, N, 2, dir)
      // 10 nodes (20 m) beyond the block's edge, away from the light and toward it
      const away = at(out, 40 - di * 11, 40 - dj * 11)[1]
      const toward = at(out, 40 + di * 11, 40 + dj * 11)[1]
      expect(away).toBeLessThan(64)
      expect(toward).toBe(255)
    })
  }
  it("a uniform slope's light is the same at the grid's edges as inside it (no seam)", () => {
    const h = new Float64Array(N * N)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = i * 0.5 + j * 0.25
    const out = bakeRelief(h, N, N, 2, 'nw')
    for (const [i, j] of [
      [0, 40],
      [N - 1, 40],
      [40, 0],
      [40, N - 1],
    ]) {
      expect(at(out, i, j)[0]).toBe(at(out, 40, 40)[0])
    }
  })
  it("the block's top stands exposed and its foot in a hollow", () => {
    const out = bakeRelief(block, N, N, 2, 'nw')
    expect(at(out, 40, 40)[2]).toBeGreaterThan(160)
    expect(at(out, 33, 40)[2]).toBeLessThan(110)
  })
})

describe('M6a: the cell mask', () => {
  it('reads the depth, the woods (a stand), the water and the yards', () => {
    const table: Resolved[] = [
      { id: 'wood', kind: 'veg.wood', priority: 0, attrs: { growth: 'stand' } },
      { id: 'meadow', kind: 'ground.meadow', priority: 0, attrs: { growth: 'low' } },
      { id: 'brook', kind: 'water.stream', priority: 0, attrs: {} },
      { id: 'hamlet', kind: 'built.village', priority: 0, attrs: {} },
    ]
    const L = {
      nx: 3,
      nz: 1,
      veg: new Uint16Array([1, 2, 0]),
      built: new Uint16Array([0, 4, 0]),
      ground: new Uint16Array([0, 0, 0]),
      water: new Uint16Array([0, 0, 3]),
      depth: new Uint16Array([0, 0, 750]),
      table,
    }
    const m = bakeMasks(L)
    expect([...m.slice(0, 4)]).toEqual([0, 255, 0, 0])
    expect([...m.slice(4, 8)]).toEqual([0, 0, 0, 255]) // the village's yard
    expect([...m.slice(8, 12)]).toEqual([128, 0, 255, 0])
  })
})

describe('M6b: the ink distance field', () => {
  const grid = { x0: -20, z0: -20, cell: 2, nx: 20, nz: 20 }
  const none = new Uint16Array(grid.nx * grid.nz)
  // the signed metres a channel stores at a point (the cell holding it)
  const read = (out: Uint8Array, ch: number, x: number, z: number) => {
    const c = Math.floor((z - grid.z0) / grid.cell) * grid.nx + Math.floor((x - grid.x0) / grid.cell)
    return ((out[c * 4 + ch] - 128) / 127) * INK_RANGE
  }
  const across: Pt[] = [
    [-20, 1],
    [20, 1],
  ]
  const sq = (r: number, cx = 0): Pt[] => [
    [cx - r, -r],
    [cx + r, -r],
    [cx + r, r],
    [cx - r, r],
  ]
  it("a way's distance is negative inside its width, 0 at its edges, positive beyond", () => {
    const out = bakeInk(grid, { way: [{ line: across, half: 3 }], water: [], wood: [] }, none)
    expect(read(out, 0, 0, 1)).toBeCloseTo(-3, 1) // the cell centred on the line
    expect(read(out, 0, 0, 5)).toBeCloseTo(1, 1) // 4 m from the line, 1 m past its edge
    expect(read(out, 0, 0, 15)).toBeCloseTo(INK_RANGE, 1) // out of reach
    expect(read(out, 1, 0, 1)).toBeCloseTo(INK_RANGE, 1) // no water there
  })
  it('a line narrower than a cell keeps a cell of half-width, so it never vanishes between cell centres', () => {
    const between: Pt[] = [
      [-20, 0],
      [20, 0],
    ] // midway between two rows of cell centres
    const out = bakeInk(grid, { way: [{ line: between, half: 0.75 }], water: [], wood: [] }, none)
    expect(read(out, 0, 0, 1)).toBeLessThan(0)
    expect(read(out, 0, 0, -1)).toBeLessThan(0)
  })
  it("an area's distance is negative inside its ring, positive outside, and keeps out of its holes", () => {
    const out = bakeInk(grid, { way: [], water: [{ rings: [sq(9), sq(3)], half: 0 }], wood: [] }, none)
    expect(read(out, 1, 7, 1)).toBeCloseTo(-2, 1) // in the ring, 2 m from its outer edge
    expect(read(out, 1, 1, 1)).toBeCloseTo(2, 1) // in the hole, 2 m from its edge
    expect(read(out, 1, 13, 1)).toBeCloseTo(4, 1) // outside
  })
  it('a wood keeps clear of the band of a line it clears', () => {
    const out = bakeInk(
      grid,
      { way: [], water: [], wood: [{ rings: [sq(15)], half: 0, cut: [{ line: across, near: 3 }] }] },
      none,
    )
    expect(read(out, 3, 5, 1)).toBeGreaterThan(0) // on the line: out of the wood
    expect(read(out, 3, 5, 5)).toBeLessThan(0) // 4 m from it: in the wood
    expect(read(out, 3, 5, 3)).toBeCloseTo(1, 0) // 2 m from it: 1 m inside the band, out of the wood
  })
  it("the barriers' field is their cells', so a gap in a hedge stays open", () => {
    const cells = new Uint16Array(grid.nx * grid.nz)
    for (let i = 0; i < grid.nx; i++) if (i !== 10) cells[10 * grid.nx + i] = 1 // a row of cells, gap at i = 10
    const out = bakeInk(grid, { way: [], water: [], wood: [] }, cells)
    expect(read(out, 2, -5, 1)).toBeLessThan(0) // a barrier cell
    expect(read(out, 2, 1, 1)).toBeGreaterThan(0) // the gap
  })
  it("inkOf takes each feature's width from its resolved attributes, and a wood's cleared lines with their reach", () => {
    const line: Pt[] = [
      [0, 0],
      [10, 0],
    ]
    const features = [
      { id: 'road', line },
      { id: 'brook', line },
      { id: 'pond', circle: [[0, 0], 5] as [Pt, number] },
      { id: 'copse', circle: [[20, 0], 8] as [Pt, number], clear: [{ id: 'road', offset: 1 }] },
    ]
    const table: Resolved[] = [
      { id: 'road', kind: 'way.road', priority: 0, attrs: { width: 6 } },
      { id: 'brook', kind: 'water.stream', priority: 0, attrs: { width: 4 } },
      { id: 'pond', kind: 'water.pond', priority: 0, attrs: {} },
      { id: 'copse', kind: 'veg.wood.broad', priority: 0, attrs: { growth: 'stand' } },
    ]
    const ink = inkOf(features, table)
    expect(ink.way.map(i => i.half)).toEqual([3])
    expect(ink.water.map(i => i.half)).toEqual([2, 0])
    expect(ink.water[1].rings).toBeTruthy()
    expect(ink.wood.length).toBe(1)
    expect(ink.wood[0].cut).toEqual([{ line, near: 4 }]) // the road's reach (3 m) and the offset
  })
})
