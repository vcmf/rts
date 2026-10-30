// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a; G2): the light that does not change (the sun's soft
// shadow and the open sky), and the cells' mask.
import { describe, it, expect } from 'vitest'
import {
  bakeInk,
  bakeLight,
  bakeMasks,
  cellField,
  clampSun,
  INK_RANGE,
  lightCache,
  SUN,
  sunFrom,
  sunXZ,
  waysOf,
  type Sun,
} from '../src/render/lit/bake.ts'
import { SUN_TOWARD } from '../src/look/sun.ts'
import type { Pt } from '../src/map/schema.ts'
import type { Resolved } from '../src/map/resolve.ts'

const N = 81 // nodes a side, 2 m apart
// a flat field with a block 20 m high in its middle (nodes 35..45)
const block = (() => {
  const h = new Float64Array(N * N)
  for (let j = 35; j <= 45; j++) for (let i = 35; i <= 45; i++) h[j * N + i] = 20
  return h
})()

const sunAt = (az: number, el = 30, size = 2.5): Sun => ({ el, az, size })
// the light bake on every node, its R (the sun) and G (the sky) at node (i, j)
const lit = (h: Float64Array, sun: Sun) => {
  const b = bakeLight(h, N, N, 2, sun, 1, 1)
  return (i: number, j: number) => [b.data[(j * N + i) * 4], b.data[(j * N + i) * 4 + 1]]
}

describe('G2: the light bake', () => {
  it('flat ground: in the sun and open to the whole sky', () => {
    expect(lit(new Float64Array(N * N), SUN)(40, 40)).toEqual([255, 255])
  })
  for (const az of [0, 90, 180, 270, 308]) {
    it(`a block casts its shadow away from a sun at ${az}°, never toward it`, () => {
      const [sx, sz] = sunXZ(sunAt(az))
      const L = lit(block, sunAt(az))
      // 16 nodes from the block's middle (11 past its edge along an axis), away from the sun and toward it
      const off = (k: number) => [40 + Math.round(sx * k), 40 + Math.round(sz * k)] as const
      expect(L(...off(-16))[0]).toBeLessThan(64)
      expect(L(...off(16))[0]).toBe(255)
    })
  }
  it("the shadow's length comes from the sun's height", () => {
    // a sun in the east 45° high: the block's 20 m cast 20 m (10 nodes) west of its edge (node 35)
    const L = lit(block, sunAt(90, 45))
    expect(L(30, 40)[0]).toBeLessThan(64)
    expect(L(18, 40)[0]).toBe(255)
    // lower, it reaches further
    expect(lit(block, sunAt(90, 20))(18, 40)[0]).toBeLessThan(64)
  })
  it("a larger sun's disc softens the shadow's edge", () => {
    const partial = (size: number) => {
      const L = lit(block, sunAt(90, 30, size))
      let n = 0
      for (let i = 0; i < 35; i++) if (L(i, 40)[0] > 10 && L(i, 40)[0] < 245) n++
      return n
    }
    expect(partial(10)).toBeGreaterThan(partial(1))
  })
  it("the highest ground's shadow keeps its soft edge: the disc's lower rim, not its middle, ends the ray", () => {
    // a sun in the east 30° high, its disc 10° across: the block (the highest ground) shades nodes 17 and 18 in part
    // (36 and 34 m west of its edge), where the disc's middle already clears the block but its lower rim does not
    const L = lit(block, sunAt(90, 30, 10))
    for (const i of [17, 18]) {
      expect(L(i, 40)[0]).toBeGreaterThan(10)
      expect(L(i, 40)[0]).toBeLessThan(245)
    }
  })
  it('a narrow bank shades every node in its shadow, not one in a few', () => {
    // a bank 6 m wide (three nodes) and 8 m high, raised three times as the map's light reads it; a sun in the east
    // 20° high casts it 66 m west
    const M = 121
    const bank = new Float64Array(M * M)
    for (let j = 0; j < M; j++) for (const i of [100, 101, 102]) bank[j * M + i] = 8
    const b = bakeLight(bank, M, M, 2, sunAt(90, 20), 1, 3)
    const missed: number[] = []
    // 10 to 56 m west of the bank: well inside its shadow
    for (let i = 72; i <= 95; i++) if (b.data[(60 * M + i) * 4] > 64) missed.push(i)
    expect(missed).toEqual([])
  })
  it('a sun on the horizon or with no disc (?sun=0, ?soft=0) still lights flat ground', () => {
    for (const sun of [sunAt(90, 0), sunAt(90, 30, 0), sunAt(90, -5)]) {
      expect(lit(new Float64Array(N * N), sun)(40, 40)[0]).toBe(255)
      expect(clampSun(sun).el - clampSun(sun).size / 2).toBeGreaterThan(0)
    }
  })
  it('the light cache bakes again only when the heights, the sun or z change, and copies its bytes', () => {
    let baked = 0
    const bake = lightCache((...a) => (baked++, bakeLight(...a)))
    const h = Float64Array.from(block)
    const a = bake(h, N, N, 2, SUN, 1, 1)
    const b = bake(h, N, N, 2, SUN, 1, 1)
    expect(baked).toBe(1)
    expect(b.data).not.toBe(a.data)
    expect(b.data).toEqual(a.data)
    h[20 * N + 20] = 30 // a tower west of the block
    expect(bake(h, N, N, 2, SUN, 1, 1).data).toEqual(bakeLight(h, N, N, 2, SUN, 1, 1).data)
    expect(bake(h, N, N, 2, sunAt(90), 1, 1).data).toEqual(bakeLight(h, N, N, 2, sunAt(90), 1, 1).data)
    expect(bake(h, N, N, 2, sunAt(90), 1, 3).data).toEqual(bakeLight(h, N, N, 2, sunAt(90), 1, 3).data)
    expect(baked).toBe(4)
  })
  it("the light cache sees an edit that only flips the heights' signs (a raise turned into a lower)", () => {
    const bake = lightCache()
    const h = new Float64Array(N * N)
    for (let j = 35; j <= 45; j++) for (let i = 35; i <= 44; i++) h[j * N + i] = 5 // an even count of nodes
    bake(h, N, N, 2, SUN, 1, 1)
    for (let j = 35; j <= 45; j++) for (let i = 35; i <= 44; i++) h[j * N + i] = -5
    expect(bake(h, N, N, 2, SUN, 1, 1).data).toEqual(bakeLight(h, N, N, 2, SUN, 1, 1).data)
  })
  it("a pit's floor sees less of the sky than the ground round it", () => {
    const pit = Float64Array.from(block, v => -v)
    const L = lit(pit, SUN)
    expect(L(40, 40)[1]).toBeLessThan(L(5, 40)[1] - 40)
    expect(L(5, 5)[1]).toBe(255)
  })
  it('on every second node, the same light as on every node there', () => {
    const full = bakeLight(block, N, N, 2, SUN, 1)
    const half = bakeLight(block, N, N, 2, SUN, 2)
    expect([half.nx, half.nz, half.step]).toEqual([41, 41, 2])
    for (const [i, j] of [
      [10, 20],
      [17, 17],
      [30, 5],
    ]) {
      const a = (j * 41 + i) * 4
      const b = (2 * j * N + 2 * i) * 4
      expect([half.data[a], half.data[a + 1]]).toEqual([full.data[b], full.data[b + 1]])
    }
  })
  it("is lit by the 3D world's sun (the owner, 2026-10-30: one sun for both views)", () => {
    const w = sunFrom(...SUN_TOWARD, SUN.size)
    expect(SUN.el).toBeCloseTo(w.el, 6)
    expect(SUN.az).toBeCloseTo(w.az, 6)
    // north-west, about 27° high
    expect(SUN.az).toBeGreaterThan(270)
    expect(SUN.el).toBeGreaterThan(20)
  })
})

describe('M6a: the cell mask', () => {
  it('reads the depth, the water and the yards', () => {
    const table: Resolved[] = [
      { id: 'wood', kind: 'veg.wood', priority: 0, attrs: { growth: 'stand' } },
      { id: 'meadow', kind: 'ground.meadow', priority: 0, attrs: { growth: 'low' } },
      { id: 'brook', kind: 'water.stream', priority: 0, attrs: {} },
      { id: 'hamlet', kind: 'built.village', priority: 0, attrs: {} },
    ]
    const L = {
      nx: 3,
      nz: 1,
      way: new Uint16Array([0, 0, 0]),
      built: new Uint16Array([0, 4, 0]),
      ground: new Uint16Array([0, 0, 0]),
      water: new Uint16Array([0, 0, 3]),
      depth: new Uint16Array([0, 0, 750]),
      table,
    }
    const m = bakeMasks(L)
    expect([...m.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...m.slice(4, 8)]).toEqual([0, 0, 0, 255]) // the village's yard
    expect([...m.slice(8, 12)]).toEqual([128, 0, 255, 0])
  })
})

describe('M6b: the ink distance fields', () => {
  const nx = 20
  const nz = 20
  const cell = 2
  const grid = { x0: -20, z0: -20, cell, nx, nz }
  const cells = () => new Uint16Array(nx * nz)
  const at = (i: number, j: number) => j * nx + i
  // the signed metres a channel stores at a point (the cell holding it)
  const read = (out: Uint8Array, ch: number, x: number, z: number) => {
    const c = Math.floor((z - grid.z0) / cell) * nx + Math.floor((x - grid.x0) / cell)
    return ((out[c * 4 + ch] - 128) / 127) * INK_RANGE
  }
  const layers = (
    o: Partial<{ veg: Uint16Array; water: Uint16Array; barrier: Uint16Array; way: Uint16Array; table: Resolved[] }>,
  ) => ({
    ...grid,
    veg: o.veg ?? cells(),
    water: o.water ?? cells(),
    barrier: o.barrier ?? cells(),
    way: o.way ?? cells(),
    table: o.table ?? [],
  })
  // the way cells along row j0..j1 (columns i0..i1)
  const wayCells = (i0: number, i1: number, j0: number, j1: number) => {
    const w = cells()
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) w[at(i, j)] = 1
    return w
  }
  it("a way's field is negative inside its width, 0 at its edges, positive beyond, its free ends square", () => {
    const line: Pt[] = [
      [-6, 1],
      [6, 1],
    ]
    const out = bakeInk(layers({ way: wayCells(7, 12, 9, 11) }), [{ line, half: 3 }])
    expect(read(out, 0, 0, 1)).toBeCloseTo(-3, 1) // the cell centred on the line
    expect(read(out, 0, 0, 5)).toBeCloseTo(1, 1) // 4 m from the line, 1 m past its edge
    expect(read(out, 0, 7, 1)).toBeCloseTo(1, 1) // 1 m past its end, beside its cells: outside by 1 m (square)
    expect(read(out, 0, 0, 15)).toBeCloseTo(INK_RANGE, 1) // out of reach
  })
  it("a way's field keeps the contract: road at its cells' centres, not road at every other cell's", () => {
    const line: Pt[] = [
      [-20, 1],
      [20, 1],
    ]
    const way = wayCells(0, 19, 9, 11)
    for (let j = 9; j <= 11; j++) for (let i = 8; i <= 12; i++) way[at(i, j)] = 0 // a stretch with no way cells
    const out = bakeInk(layers({ way }), [{ line, half: 3 }])
    const field = (c: number) => ((out[c * 4] - 128) / 127) * INK_RANGE
    const wrong = [...way.keys()].filter(c => (way[c] ? field(c) >= 0 : field(c) <= 0))
    expect(wrong).toEqual([])
    expect(read(out, 0, -10, 1)).toBeLessThan(0) // the road
    expect(read(out, 0, -3, 1)).toBeGreaterThan(0) // the cell beside the gap, on the line: not road
  })
  it('waysOf gives each way the half-width apply paints it at (lineReach: at least just over half a cell)', () => {
    const line: Pt[] = [
      [0, 0],
      [10, 0],
    ]
    const table: Resolved[] = [
      { id: 'road', kind: 'way.road', priority: 0, attrs: { width: 6 } },
      { id: 'path', kind: 'way.path', priority: 0, attrs: { width: 1.5 } },
      { id: 'brook', kind: 'water.stream', priority: 0, attrs: { width: 4 } },
    ]
    const ways = waysOf(
      [
        { id: 'road', line },
        { id: 'path', line },
        { id: 'brook', line },
      ],
      table,
    )
    expect(ways.map(w => w.half)).toEqual([3, 1.01])
  })
  it("a cell mask's field has its 0 on the cells' sides", () => {
    const m = new Uint8Array(nx * nz)
    for (let j = 8; j < 12; j++) for (let i = 8; i < 12; i++) m[at(i, j)] = 1 // a block of 4 × 4 cells, 8 m
    const f = cellField(m, nx, nz, cell, false)
    expect(f[at(8, 10)]).toBeCloseTo(-1, 5) // the inside cell at the edge: its centre 1 m in
    expect(f[at(7, 10)]).toBeCloseTo(1, 5) // the outside cell beside it: 1 m out
    expect(f[at(10, 10)]).toBeLessThan(-2)
  })
  it('a smoothed field runs a diagonal edge straight through its steps', () => {
    const m = new Uint8Array(nx * nz)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) m[at(i, j)] = i + j < 20 ? 1 : 0
    const f = cellField(m, nx, nz, cell, true)
    // along the diagonal edge, the field at the inside cells next to it is the same everywhere: no stairs
    const edge = [5, 8, 11].map(i => f[at(i, 19 - i)])
    for (const v of edge) expect(v).toBeCloseTo(edge[0], 3)
  })
  // the width a smoothed field draws across a straight band of cells (columns i0..i1 of row 10's neighbourhood): where
  // the field, read linearly between the cells' centres, is below 0
  const drawnWidth = (f: Float32Array, j: number) => {
    let w = 0
    for (let i = 0; i + 1 < nx; i++) {
      const a = f[at(i, j)]
      const b = f[at(i + 1, j)]
      if (a < 0 && b < 0) w += cell
      else if (a < 0 !== b < 0) w += (cell * Math.abs(a < 0 ? a : b)) / Math.abs(a - b)
    }
    return w
  }
  it('a stream one or two cells wide survives the smoothing, about as wide as its cells', () => {
    for (const cells of [1, 2]) {
      const m = new Uint8Array(nx * nz)
      for (let j = 0; j < nz; j++) for (let i = 9; i < 9 + cells; i++) m[at(i, j)] = 1
      const f = cellField(m, nx, nz, cell, true)
      expect(f[at(9, 10)]).toBeLessThan(0)
      expect(drawnWidth(f, 10)).toBeGreaterThanOrEqual(cells * cell * 0.5)
    }
  })
  it('a feature one cell wide stepping diagonally stays one line: its cells join at their corners', () => {
    for (const smooth of [true, false]) {
      const m = new Uint8Array(nx * nz)
      for (let k = 0; k < nx; k++) m[at(k, k)] = 1
      const f = cellField(m, nx, nz, cell, smooth)
      // the corner shared by (9, 9), (10, 10) and the two cells beside them: bilinear, the mean of the four centres
      const corner = (f[at(9, 9)] + f[at(10, 10)] + f[at(10, 9)] + f[at(9, 10)]) / 4
      expect(corner).toBeLessThan(0)
    }
  })
  it('a clearing one cell wide stepping diagonally through a wood stays one clearing', () => {
    const m = new Uint8Array(nx * nz).fill(1)
    for (let k = 0; k < nx; k++) m[at(k, k)] = 0
    const f = cellField(m, nx, nz, cell, true, 'outside')
    const corner = (f[at(9, 9)] + f[at(10, 10)] + f[at(10, 9)] + f[at(9, 10)]) / 4
    expect(corner).toBeGreaterThan(0)
  })
  it('the contract (decision 0065): every cell reads as its own kind at its centre, whatever the shape', () => {
    const shapes: Record<string, (i: number, j: number) => boolean> = {
      'a stair-step shore': (i, j) => i + j < 20,
      'a saddle checkerboard': (i, j) => (i + j) % 2 === 0,
      'a line one cell wide': i => i === 9,
      'a diagonal one cell wide': (i, j) => i === j,
      'a blob': (i, j) => (i - 9.5) ** 2 + (j - 9.5) ** 2 < 30,
      'a ring of clearings': (i, j) => (i - 9.5) ** 2 + (j - 9.5) ** 2 > 12 || (i + j) % 3 === 0,
    }
    for (const [what, inside] of Object.entries(shapes)) {
      const m = new Uint8Array(nx * nz)
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) m[at(i, j)] = inside(i, j) ? 1 : 0
      for (const smooth of [true, false]) {
        for (const join of ['inside', 'outside'] as const) {
          const f = cellField(m, nx, nz, cell, smooth, join)
          const wrong = [...m.keys()].filter(c => (m[c] ? f[c] >= 0 : f[c] <= 0))
          expect(wrong, `${what}, smooth ${smooth}, join ${join}`).toEqual([])
        }
      }
    }
  })
  it('a stair-step shore is no saddle: its dry cells keep their distance', () => {
    const m = new Uint8Array(nx * nz)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) m[at(i, j)] = i + j < 20 ? 1 : 0
    const f = cellField(m, nx, nz, cell, false)
    expect(f[at(10, 10)]).toBeCloseTo(1, 5) // a dry step cell: its raw distance, half a cell from the water's side
  })
  it('a clearing one cell wide in a wood stays open after the smoothing', () => {
    const m = new Uint8Array(nx * nz).fill(1)
    for (let j = 0; j < nz; j++) m[at(10, j)] = 0
    const f = cellField(m, nx, nz, cell, true)
    expect(f[at(10, 10)]).toBeGreaterThan(0)
  })
  it('the woods come from the cells: a clearing a field took by priority stays open', () => {
    const veg = cells()
    for (let j = 4; j < 16; j++) for (let i = 4; i < 16; i++) veg[at(i, j)] = 1 // the wood
    for (let j = 8; j < 12; j++) for (let i = 8; i < 12; i++) veg[at(i, j)] = 2 // a field painted over it
    const table: Resolved[] = [
      { id: 'wood', kind: 'veg.wood.broad', priority: 0, attrs: { growth: 'stand' } },
      { id: 'clearing', kind: 'ground.field', priority: 50, attrs: { growth: 'low' } },
    ]
    const out = bakeInk(layers({ veg, table }), [])
    expect(read(out, 3, -10, -10)).toBeLessThan(0) // in the wood
    expect(read(out, 3, 1, 1)).toBeGreaterThan(0) // in the clearing
  })
  it("the barriers' field is their cells', so a gate stays open", () => {
    const barrier = cells()
    for (let i = 0; i < nx; i++) if (i !== 10) barrier[at(i, 10)] = 1 // a row of cells, a gate at i = 10
    const out = bakeInk(layers({ barrier }), [])
    expect(read(out, 2, -5, 1)).toBeLessThan(0) // a barrier cell
    expect(read(out, 2, 1, 1)).toBeGreaterThan(0) // the gate
  })
})
