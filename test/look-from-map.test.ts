// The look compiler (docs/plans/active/look-austerlitz-a1.md, PR a): a window of a map's layers into the look world's
// inputs, on small hand-made layers: the heights rebased, each kind's cover class, the arable's strips, the roads'
// lines and marks, the trees in the woods and the orchards' rows; the page's window query; the data's world and trees.
import { describe, expect, it } from 'vitest'
import type { Layers } from '../src/map/apply.ts'
import type { Resolved } from '../src/map/resolve.ts'
import type { Pt } from '../src/map/schema.ts'
import { D } from '../src/look/spec.ts'
import { COVER, coarsenCover, isField } from '../src/look/world/cover.ts'
import {
  boxCover,
  cellAt,
  fillRings,
  mapRects,
  fineAreas,
  ringsOf,
  checkWindowInside,
  cropFor,
  fieldAt,
  groundClass,
  ihash,
  mapCover,
  mapTrees,
  packTrees,
  runsInside,
  wayLines,
  windowHeights,
} from '../src/look/world/from-map.ts'
import {
  TREE_FLOATS,
  TREE_SPECIES,
  checkTileAt,
  decodeLook,
  encodeLook,
  moveLook,
  type LookData,
} from '../src/look/world/data.ts'
import { WINDOWS, windowOf, type LookWindow } from '../src/look/world/windows.ts'
import { TILE_O, TileFollow, tileWanted } from '../src/look/tile.ts'
import { noRiver } from '../src/look/river.ts'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import { apply, heightOf } from '../src/map/apply.ts'
import { segD } from '../src/look/world/geom.ts'
import { D as SPEC_D, ROAD_SLOTS, ringFor } from '../src/look/spec.ts'

const WIN: LookWindow = { map: 'test', name: 'test', x: 0, z: 0 }
const N = 60 // cells a side: 120 m, from −60 m
// the features, as the layers' table holds them (a layer's value k is table[k − 1])
const TABLE: Resolved[] = [
  { id: 'arable', kind: 'ground.field', priority: 5, attrs: { stage: 'ploughed', growth: 'low' } },
  { id: 'meadow', kind: 'ground.meadow', priority: 10, attrs: {} },
  { id: 'pines', kind: 'veg.wood', priority: 40, attrs: { leaf: 'needle', density: 1, height: 20, growth: 'stand' } },
  {
    id: 'apples',
    kind: 'veg.orchard',
    priority: 35,
    attrs: { height: 6, growth: 'stand', rows: { dir: 0, spacing: 9 } },
  },
  { id: 'pond', kind: 'water.pond', priority: 60, attrs: {} },
  { id: 'hamlet', kind: 'built.village', priority: 60, attrs: {} },
]
const K = Object.fromEntries(TABLE.map((r, k) => [r.id, k + 1]))

// the layers' features' own shapes (as layers() paints their cells)
const square = (x0: number, z0: number, x1: number, z1: number): Pt[][] => [
  [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
]
const FEATURES = [
  { id: 'arable', area: square(-60, -60, 60, 60) },
  { id: 'meadow', area: square(-60, -60, 0, 0) },
  { id: 'pines', area: square(0, 0, 60, 60) },
  { id: 'apples', area: square(0, -40, 60, 0) },
  { id: 'hamlet', area: square(-30, 0, -10, 20) },
]

/** Layers of N² cells over the arable: a meadow, a wood, an orchard, a pond and a village's cells in quarters. */
function layers(): Layers {
  const n = N * N
  const U = () => new Uint16Array(n)
  const L: Layers = {
    cell: 2,
    nx: N,
    nz: N,
    x0: -N,
    z0: -N,
    height: new Float64Array((N + 1) * (N + 1)),
    table: TABLE,
    ground: U(),
    veg: U(),
    water: U(),
    way: U(),
    barrier: U(),
    built: U(),
    zone: U(),
    edit: U(),
    density: new Uint8Array(n),
    depth: U(),
    streams: [],
    trees: [],
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      const x = L.x0 + (i + 0.5) * 2
      const z = L.z0 + (j + 0.5) * 2
      L.ground[k] = x < 0 && z < 0 ? K.meadow : K.arable
      if (x >= 0 && z >= 0) [L.veg[k], L.density[k]] = [K.pines, 255]
      if (x >= 0 && z < 0 && z > -40) [L.veg[k], L.density[k]] = [K.apples, 89]
      if (x < -40 && z > 20) L.water[k] = K.pond
      if (x < -10 && x > -30 && z > 0 && z < 20) L.built[k] = K.hamlet
    }
  }
  return L
}

describe('the window heights', () => {
  it('reads the map round the window centre, rebased so the lowest node is 0', () => {
    const at = (x: number, z: number) => 50 + 0.01 * x - 0.02 * z
    const w = { x: 400, z: -200 }
    const { hf, far, base } = windowHeights(at, w, D)
    expect(
      Math.min(
        hf.h.reduce((a, b) => Math.min(a, b)),
        far.h.reduce((a, b) => Math.min(a, b)),
      ),
    ).toBe(0)
    // a node's height is the map's at the window's point plus the centre, less the base
    const k = 7 * hf.n + 11
    const x = hf.x0 + 11 * hf.cell
    const z = hf.z0 + 7 * hf.cell
    expect(hf.h[k]).toBeCloseTo(at(x + w.x, z + w.z) - base, 3)
    expect(hf.n).toBe(D.spec.tileSub + 1 + 2 * D.hfMargin)
    expect(far.n).toBe(D.spec.farSub + 1)
  })

  it("reads a map world's far ring where ringFor puts it, off the window's centre (G3a)", () => {
    const at = (x: number, z: number) => 50 + 0.01 * x - 0.02 * z
    const w = { x: 400, z: -200 }
    const ring = ringFor(D, { x0: -1300, z0: -1700, x1: 1700, z1: 1300 }, 550)
    const { far, base } = windowHeights(at, w, D, ring)
    expect([far.n, far.cell, far.x0, far.z0]).toEqual([ring.n, D.farCell, ring.x0, ring.z0])
    for (const [i, j] of [
      [0, 0],
      [17, 203],
      [ring.n - 1, ring.n - 1],
    ]) {
      const x = Math.fround(ring.x0 + i * D.farCell) + w.x
      const z = Math.fround(ring.z0 + j * D.farCell) + w.z
      expect(far.h[j * far.n + i]).toBeCloseTo(at(x, z) - base, 3)
    }
  })

  it("puts the map's play area about the map's centre and its edge at the layers', in the window's metres (G3a)", () => {
    const L = layers() // (120 m from −60)
    expect(mapRects(L, { w: 100, h: 80 }, { x: 10, z: -20 })).toEqual({
      play: { x0: -60, z0: -20, x1: 40, z1: 60 },
      edge: { x0: -70, z0: -40, x1: 50, z1: 80 },
    })
  })

  it("covers a square off the window's centre as the window's own cover does, the default past the map (G3a)", () => {
    const L = layers()
    const box = { x0: -100, z0: -80, side: 240 }
    const g = boxCover(L, FEATURES as never, WIN, box, 4)
    expect([g.n, g.cell, g.x0, g.z0]).toEqual([60, 4, -100, -80])
    // the window's own cover over 240 m about its centre: its cells are the box's, 5 columns and 10 rows on
    const own = mapCover(fineAreas(L, FEATURES as never, WIN, 240, 4), L.table, WIN, [])
    let same = 0
    for (let j = 0; j < 50; j++) {
      for (let i = 0; i < 55; i++) {
        const a = (j * 60 + i) * 4
        const b = ((j + 10) * 60 + i + 5) * 4
        expect(Array.from(g.tex.subarray(a, a + 4))).toEqual(Array.from(own.tex.subarray(b, b + 4)))
        same++
      }
    }
    expect(same).toBe(2750)
    // past the map's east edge (60 m): the default cover
    const i = Math.floor((100 - box.x0) / 4)
    const j = Math.floor((0 - box.z0) / 4)
    expect(g.tex[(j * 60 + i) * 4]).toBe(COVER.meadow)
  })

  it('refuses a window whose tile leaves the map (its far ring may: paper), or whose centre is off even metres', () => {
    const L = layers()
    expect(() => checkWindowInside(L, WIN, 100)).not.toThrow()
    expect(() => checkWindowInside(L, WIN, 140)).toThrow(/leaves the map/)
    expect(() => checkWindowInside(L, { ...WIN, x: 1 }, 100)).toThrow(/even metres/)
  })

  it("past the map's edge (G1: a far ring may leave it): no cells, the edge's heights held, the default cover, no trees", () => {
    const L = layers()
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) L.height[j * (N + 1) + i] = i * 0.5
    const east = L.x0 + N * L.cell
    expect(cellAt(L, east + 50, 0)).toBe(-1)
    expect(heightOf(L, east + 300, 0)).toBe(heightOf(L, east, 0))
    expect(groundClass(L, -1, east + 50, 0).cls).toBe(COVER.meadow)
    // a far ring twice the layers' size: every tree still on the layers
    const trees = mapTrees(L, fineAreas(L, FEATURES, WIN, 240, 1), WIN)
    expect(trees.length).toBeGreaterThan(0)
    for (const t of trees) expect(Math.max(Math.abs(t.x), Math.abs(t.z))).toBeLessThanOrEqual(N)
  })
})

describe('the cover classes', () => {
  const L = layers()
  const cls = (x: number, z: number) => groundClass(L, cellAt(L, x, z), x, z).cls

  it('maps each kind to its class: wood, meadow, the orchard and the water as meadow, the arable as crops', () => {
    expect(cls(30, 30)).toBe(COVER.wood)
    expect(cls(-30, -30)).toBe(COVER.meadow)
    expect(cls(30, -20)).toBe(COVER.meadow) // the orchard's floor
    expect(cls(-50, 40)).toBe(COVER.meadow) // the pond's cells
    // winter's arable: ploughed, green, stubble or grass
    const allowed: number[] = [COVER.ploughed, COVER.green, COVER.stubble, COVER.pasture, COVER.meadow]
    expect(allowed).toContain(cls(30, -50))
  })

  it("cuts the arable into strips that agree whatever the window, each with a field id and the block's turn", () => {
    const a = fieldAt(1234, -567, 'standing')
    expect(fieldAt(1234, -567, 'standing')).toEqual(a)
    expect(a.id).toBeGreaterThanOrEqual(1)
    expect(a.id).toBeLessThanOrEqual(255)
    expect(a.dir).toBeGreaterThanOrEqual(0)
    expect(a.dir).toBeLessThan(Math.PI)
    // many strips over a km, and each class of the season among them
    const ids = new Set<number>()
    const seen = new Set<number>()
    for (let x = 0; x < 1000; x += 5) {
      const f = fieldAt(x, 300, 'standing')
      ids.add(f.id)
      seen.add(f.cls)
    }
    expect(ids.size).toBeGreaterThan(10)
    for (const c of [COVER.wheat, COVER.green, COVER.ploughed, COVER.stubble]) expect(seen).toContain(c)
  })

  it('gives each stage its crops: no standing wheat in winter, nothing but meadow on fallow', () => {
    for (let u = 0; u < 1; u += 0.01) {
      expect(cropFor('ploughed', u)).not.toBe(COVER.wheat)
      expect(cropFor('fallow', u)).toBe(COVER.meadow)
    }
  })

  it('lays the roads over the ground, the village over all, and wears the ground by its distance to them', () => {
    const lines = [{ pts: [[-60, -40] as const, [60, -40] as const], w: 6, cls: COVER.road }]
    const sq = (x0: number, z0: number, x1: number, z1: number): Pt[][] => [
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
    ]
    const features = [
      { id: 'arable', area: sq(-60, -60, 60, 60) },
      { id: 'meadow', area: sq(-60, -60, 0, 0) },
      { id: 'hamlet', area: sq(-30, 0, -10, 20) },
    ]
    const g = mapCover(fineAreas(L, features, WIN, 100, 1), TABLE, WIN, lines)
    expect(g.cell).toBe(1)
    const at = (x: number, z: number) => {
      const o = (Math.floor((z - g.z0) / g.cell) * g.n + Math.floor((x - g.x0) / g.cell)) * 4
      return g.tex.subarray(o, o + 4)
    }
    expect(at(10, -40)[0]).toBe(COVER.road)
    expect(at(10, -40)[3]).toBe(0)
    // the cell centred 10.5 m from the road's edge (13.5 from its centre line): worn 10.5 m
    expect(at(10.5, -26.5)[3]).toBe(105)
    expect(at(-20, 10)[0]).toBe(COVER.village)
    expect(at(-20, 10)[1]).toBe(0)
    expect(at(-40, -20)[0]).toBe(COVER.meadow)
    // the road's grass verge (2.5 m past its edge) between it and the arable, the arable past it
    expect(at(10.5, -44.5)[0]).toBe(COVER.pasture)
    expect(isField(at(10.5, -48.5)[0]) || at(10.5, -48.5)[0] === COVER.meadow).toBe(true)
    // a field's texel names its furrow; a road's has no field id
    expect(at(10, -40)[1]).toBe(0)
    const field = at(30, -47)
    if (isField(field[0])) expect(field[1]).toBeGreaterThan(0)
  })

  it("rasterises an area at the look's own cells, by their centres, holes left out", () => {
    const n = 20
    const grid = new Uint16Array(n * n)
    // a slanted band and a hole in it: the cells whose centres fall inside, on 1 m cells from −10
    const outer: Pt[] = [
      [-10, -10],
      [10, -2],
      [10, 10],
      [-10, 2],
    ]
    const hole: Pt[] = [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ]
    fillRings([outer, hole], grid, n, -10, 1, 7)
    const inside = (x: number, z: number) => {
      const lo = -10 + ((x + 10) * 8) / 20
      return z > lo && z < lo + 12 && !(Math.abs(x) < 2 && Math.abs(z) < 2)
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) expect(grid[j * n + i] === 7).toBe(inside(-9.5 + i, -9.5 + j))
    }
  })

  it('gives an ellipse its outline, turned by its angle', () => {
    const [ring] = ringsOf({ id: 'p', ellipse: [[100, 50], 20, 5, Math.PI / 2] })
    expect(ring.length).toBe(64)
    // its long axis along z
    expect(ring[0][0]).toBeCloseTo(100, 6)
    expect(ring[0][1]).toBeCloseTo(70, 6)
  })
})

describe('the coarse cover', () => {
  it('takes the class from the cell past its centre and the least wear of its block', () => {
    const n = 4
    const tex = new Uint8Array(n * n * 4)
    for (let c = 0; c < n * n; c++) [tex[c * 4], tex[c * 4 + 3]] = [COVER.wheat, 50]
    // block (0, 0): its centre's cell (1, 1) gives the field's id; block (1, 0): the cell at (2, 1) worn least
    tex[(1 * n + 1) * 4 + 1] = 9
    tex[(1 * n + 2) * 4 + 3] = 20
    // block (0, 1): a track off its centre: the centre's class kept, the track's wear 0 taken
    tex[(2 * n + 0) * 4] = COVER.track
    tex[(2 * n + 0) * 4 + 3] = 0
    const g = coarsenCover({ n, cell: 1, x0: -2, z0: -2, tex }, 2)
    expect([g.n, g.cell, g.x0, g.z0]).toEqual([2, 2, -2, -2])
    expect([g.tex[1], g.tex[3]]).toEqual([9, 50])
    expect(g.tex[7]).toBe(20)
    expect([g.tex[8], g.tex[11]]).toEqual([COVER.wheat, 0])
    expect(coarsenCover(g, 2)).toBe(g)
  })
})

describe('the roads', () => {
  it('keeps the runs of a line that touch the window, a lane as a track, widths from the painted reach', () => {
    const runs = runsInside(
      [
        [-200, 0],
        [-100, 0],
        [0, 0],
        [100, 0],
        [200, 0],
        [300, 0],
        [400, 0],
      ],
      150,
    )
    expect(runs).toEqual([
      [
        [-200, 0],
        [-100, 0],
        [0, 0],
        [100, 0],
        [200, 0],
      ],
    ])
    const table: Resolved[] = [
      { id: 'r', kind: 'way.road', priority: 50, attrs: { width: 5 } },
      { id: 'l', kind: 'way.road.lane', priority: 50, attrs: { width: 3 } },
    ]
    const lines = wayLines(
      [
        {
          id: 'r',
          line: [
            [100, -50],
            [100, 50],
          ],
        },
        {
          id: 'l',
          line: [
            [90, 0],
            [110, 0],
          ],
        },
      ],
      table,
      { ...WIN, x: 100 },
      200,
    )
    expect(lines.map(l => [l.cls, l.w])).toEqual([
      [COVER.road, 5],
      [COVER.track, 3],
    ])
    // in window metres, resampled every 8 m
    expect(lines[0].pts[0]).toEqual([0, -50])
    expect(lines[0].pts.length).toBe(14)
  })
})

describe('the trees', () => {
  const L = layers()
  const trees = mapTrees(L, fineAreas(L, FEATURES, WIN, 120, 1), WIN)

  it('stands the woods by their leaf and their rim, the orchards in rows, nowhere else', () => {
    const wood = trees.filter(t => t.x > 0 && t.z > 0)
    const orchard = trees.filter(t => t.x > 0 && t.z < 0)
    expect(trees.length).toBe(wood.length + orchard.length)
    expect(wood.length).toBeGreaterThan(40)
    for (const t of wood) expect(['spruce', 'pine', 'birch', 'hawthorn']).toContain(t.sp)
    expect(wood.some(t => t.sp === 'spruce' || t.sp === 'pine')).toBe(true)
    for (const t of orchard) {
      expect(t.sp).toBe('apple')
      // on its row, 9 m apart, give or take the planting's 0.3 m
      expect(Math.abs(t.z / 9 - Math.round(t.z / 9)) * 9).toBeLessThan(0.31)
    }
    expect(orchard.length).toBeGreaterThan(10)
  })

  it('stands the same trees whatever the window, moved by its centre', () => {
    const win = { ...WIN, x: 10, z: -10 }
    const moved = mapTrees(L, fineAreas(L, FEATURES, win, 80, 1), win)
    const t = moved.find(m => m.sp !== 'apple')!
    expect(
      trees.some(u => u.sp === t.sp && Math.abs(u.x - (t.x + 10)) < 1e-9 && Math.abs(u.z - (t.z - 10)) < 1e-9),
    ).toBe(true)
  })

  it('packs each tree as x, z, its species index and its scale', () => {
    const a = packTrees(trees.slice(0, 2))
    expect(a.length).toBe(2 * TREE_FLOATS)
    expect(TREE_SPECIES[a[2]]).toBe(trees[0].sp)
    expect(a[3]).toBeCloseTo(trees[0].s, 5)
  })
})

describe('the hash', () => {
  it('spreads lattice points over 0..1, the same each time', () => {
    const v = Array.from({ length: 1000 }, (_, k) => ihash(k, -k * 3, 7))
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...v)).toBeLessThan(1)
    expect(v.reduce((a, b) => a + b, 0) / v.length).toBeGreaterThan(0.45)
    expect(v.reduce((a, b) => a + b, 0) / v.length).toBeLessThan(0.55)
    expect(ihash(3, 4, 5)).toBe(ihash(3, 4, 5))
  })
})

describe('the page and the data', () => {
  it('draws the demo without ?map and a named window with it; refuses the rest', () => {
    expect(windowOf(new URLSearchParams(''))).toBeNull()
    expect(windowOf(new URLSearchParams('map=austerlitz&window=kobelnitz'))).toEqual(WINDOWS[0])
    expect(() => windowOf(new URLSearchParams('window=kobelnitz'))).toThrow(/needs \?map/)
    expect(() => windowOf(new URLSearchParams('map=austerlitz'))).toThrow(/kobelnitz/)
    expect(() => windowOf(new URLSearchParams('map=austerlitz&window=nowhere'))).toThrow(/no such window/)
  })

  it("carries the world it holds, a map's trees, its far ring's cover and its coarse light through the file", () => {
    const grid = { n: 2, cell: 1, x0: 0, z0: 0, h: new Float32Array(4) }
    const spans = { n: 1, cell: 1, x0: 0, z0: 0, ch: 4, spans: new Float32Array(0), tex: new Uint8Array(0) }
    const play = { x0: -1, z0: -2, x1: 3, z1: 4 }
    const edge = { x0: -5, z0: -6, x1: 7, z1: 8 }
    const world = { kind: 'map', map: 'test', window: 'test', x: 2, z: 4, base: 1.5, play, edge } as const
    const farCover = { n: 2, cell: 4, x0: -3, z0: -5, tex: Uint8Array.from({ length: 16 }, (_, k) => k % 5) }
    const light = {
      nx: 3,
      nz: 2,
      cell: 2,
      x0: -7,
      z0: -9,
      rg: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    }
    const c = encodeLook({
      hf: { ...grid, min: 0, max: 0 },
      far: grid,
      river: noRiver(),
      bank: { ...spans, ch: 3 },
      water: spans,
      roads: { segs: new Float32Array(0), n: 1, cell: 1, x0: 0, z0: 0, ids: new Float32Array(ROAD_SLOTS).fill(-1) },
      cover: { n: 1, cell: 1, x0: 0, z0: 0, tex: new Uint8Array(4) },
      world,
      trees: Float32Array.from([1, 2, 3, 4]),
      farCover,
      light,
      tileAt: [0, 0],
    })
    const back = decodeLook(c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer)
    expect(back.world).toEqual(world)
    expect(Array.from(back.trees)).toEqual([1, 2, 3, 4])
    expect(back.river.n).toBe(0)
    expect({ ...back.farCover!, tex: Array.from(back.farCover!.tex) }).toEqual({
      ...farCover,
      tex: Array.from(farCover.tex),
    })
    expect({ ...back.light!, rg: Array.from(back.light!.rg) }).toEqual({ ...light, rg: Array.from(light.rg) })
  })
})

describe("the areas by apply's rules", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
  // overlaps: a wood over the arable kept off a lane, a later meadow (a glade) clearing part of the wood, a line of
  // reeds, a house and a redoubt; slanted, so the cells' edges are not the axes (no corner on a cell's centre: a
  // point on a ring may fall either side)
  const map = {
    format: 1,
    id: 'overlaps',
    name: 'Overlaps',
    seed: 7,
    season: 'summer',
    extent: { w: 120, h: 120 },
    play: { w: 120, h: 120 },
    features: [
      { id: 'arable', kind: 'ground.field', area: square(-60, -60, 60, 60) },
      {
        id: 'wood',
        kind: 'veg.wood',
        area: [
          [
            [-50, -10],
            [10, -45],
            [45, 20],
            [-15, 50],
          ],
        ],
        clear: [{ id: 'lane' }, { id: 'hedge' }],
      },
      {
        id: 'glade',
        kind: 'ground.meadow',
        priority: 50,
        area: [
          [
            [-5, 0],
            [15, -8],
            [22, 12],
            [2, 18],
          ],
        ],
      },
      {
        id: 'lane',
        kind: 'way.road.lane',
        line: [
          [-60, -33],
          [60, 41],
        ],
      },
      {
        id: 'hedge',
        kind: 'barrier.hedge',
        line: [
          [-40, 30],
          [20, -30],
        ],
      },
      {
        id: 'reeds',
        kind: 'veg.reeds',
        line: [
          [-55, 55],
          [30, 52],
        ],
      },
      {
        id: 'house',
        kind: 'built.house',
        area: [
          [
            [30, -40],
            [42, -36],
            [39.3, -27.4],
            [27, -31],
          ],
        ],
      },
      { id: 'redoubt', kind: 'work.redoubt', area: square(-55, -55, -40, -42) },
    ],
  } as unknown as MapFile

  it('paints the ground, the vegetation and the built as apply does, at its own 2 m cells', () => {
    expect(validate(map, cat)).toEqual([])
    const ex = expand(map, cat).map
    const L = apply(ex, cat)
    const A = fineAreas(L, ex.features, { map: 't', name: 't', x: 0, z: 0 }, 120, 2)
    let differ = 0
    for (const layer of ['ground', 'veg', 'built'] as const) {
      for (let c = 0; c < A.n * A.n; c++) if (A[layer][c] !== L[layer][c]) differ++
    }
    // (the glade clears the wood; the wood keeps off the lane; the reeds' line is painted)
    const at = (x: number, z: number) => (Math.floor(z + 60) >> 1) * 60 + (Math.floor(x + 60) >> 1)
    const name = (v: number) => (v ? L.table[v - 1].id : '')
    expect(name(A.veg[at(10, 5)])).toBe('glade')
    expect(name(A.veg[at(-30, 0)])).toBe('wood')
    expect(name(A.veg[at(-20, -8.3)])).not.toBe('wood') // on the lane
    expect(name(A.veg[at(-10.3, 0.3)])).not.toBe('wood') // on the hedge
    expect(name(A.veg[at(0, 53)])).toBe('reeds')
    expect(name(A.built[at(-50, -50)])).toBe('redoubt')
    expect(differ).toBe(0)
  })
})

describe("the frame's coarse cover and the roads' gate", () => {
  it("never reads a wear past the ground's own distance to a road and a coarse cell's half diagonal", () => {
    const L = layers()
    const hw = 3
    const road = { pts: [[-55, -48] as const, [50, 37] as const], w: 2 * hw, cls: COVER.road }
    const fine = mapCover(fineAreas(L, FEATURES, WIN, 100, 1), TABLE, WIN, [road])
    const g = coarsenCover(fine, SPEC_D.spec.macro.cover)
    // the gate's slack (src/look/spec.ts: road.near ≥ edge + cover · 0.71 + 0.05)
    const slack = SPEC_D.spec.road.near - SPEC_D.spec.road.edge
    let worst = -Infinity
    for (let k = 0; k < 4000; k++) {
      const x = -48 + ihash(k, 1, 9) * 96
      const z = -48 + ihash(k, 2, 9) * 96
      const o = (Math.floor((z - g.z0) / g.cell) * g.n + Math.floor((x - g.x0) / g.cell)) * 4
      const wear = g.tex[o + 3] * 0.1
      const d = Math.max(0, segD(x, z, road.pts[0], road.pts[1]) - hw)
      if (wear < 25.4) worst = Math.max(worst, wear - d)
    }
    expect(worst).toBeLessThanOrEqual(slack)
    // a fine cell's half diagonal and the wear's rounding: well inside it
    expect(worst).toBeLessThanOrEqual(Math.SQRT1_2 + 0.05)
  })
})

describe('a moved tile (G3b-1)', () => {
  it('keeps a tile on the 200 m grid, and refuses one off it', () => {
    expect(() => checkTileAt([400, -1200], 200)).not.toThrow()
    expect(() => checkTileAt([0, 0], 200)).not.toThrow()
    expect(() => checkTileAt([401, 0], 200)).toThrow(/not on the 200 m grid/)
    expect(() => checkTileAt([0, NaN], 200)).toThrow(/not on the 200 m grid/)
  })

  it('moves every place in the data with the tile, and back again', () => {
    const grid = { n: 2, cell: 1, x0: -3, z0: -4, h: new Float32Array([1, 2, 3, 4]) }
    const spans = { n: 1, cell: 1, x0: -5, z0: -6, ch: 4, spans: new Float32Array(0), tex: new Uint8Array(0) }
    const play = { x0: -1, z0: -2, x1: 3, z1: 4 }
    const d: LookData = {
      hf: { ...grid, min: 1, max: 4 },
      far: { ...grid, x0: -30, z0: -40 },
      river: noRiver(),
      bank: { ...spans, ch: 3 },
      water: spans,
      roads: {
        segs: Float32Array.from({ length: 12 }, (_, k) => k + 1),
        n: 1,
        cell: 8,
        x0: -7,
        z0: -8,
        ids: new Float32Array(ROAD_SLOTS),
      },
      cover: { n: 1, cell: 1, x0: -9, z0: -10, tex: new Uint8Array(4) },
      world: { kind: 'map', map: 'test', window: 'test', x: 2, z: 4, base: 1.5, play, edge: play },
      trees: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      farCover: { n: 1, cell: 4, x0: -11, z0: -12, tex: new Uint8Array(4) },
      light: { nx: 1, nz: 1, cell: 2, x0: -13, z0: -14, rg: new Uint8Array(2) },
      tileAt: [0, 0],
    }
    const m = moveLook(d, [400, -200])
    expect(m.tileAt).toEqual([400, -200])
    for (const k of ['hf', 'far', 'bank', 'water', 'roads', 'cover', 'farCover', 'light'] as const) {
      expect([m[k]!.x0, m[k]!.z0]).toEqual([d[k]!.x0 + 400, d[k]!.z0 - 200])
    }
    // a segment's ends move, its distance along, half width, index, flags and mitres do not
    expect(Array.from(m.roads.segs)).toEqual([401, -198, 403, -196, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(Array.from(m.trees)).toEqual([401, -198, 3, 4, 405, -194, 7, 8])
    expect(m.world).toMatchObject({ play: { x0: 399, z0: -202, x1: 403, z1: -196 } })
    // the heights are shared, not copied; and back again is the data
    expect(m.hf.h).toBe(d.hf.h)
    const back = moveLook(m, [-400, 200])
    expect({
      ...back,
      roads: { ...back.roads, segs: Array.from(back.roads.segs) },
      trees: Array.from(back.trees),
    }).toEqual({
      ...d,
      roads: { ...d.roads, segs: Array.from(d.roads.segs) },
      trees: Array.from(d.trees),
    })
    // a world with a river is not moved (its samples' places are the demo's)
    expect(() => moveLook({ ...d, river: { ...d.river, n: 1 } }, [200, 0])).toThrow(/river/)
  })
})

describe('the tile following the focus (tileWanted, G3b-3)', () => {
  // Kobelnitz's frame: the map from −1274 to 1726 m east, −1676 to 1324 m north; the tile 800 m on the 200 m grid
  const edge = { x0: -1274, z0: -1676, x1: 1726, z1: 1324 }
  const want = (x: number, z: number) => tileWanted(x, z, edge, 200, 400, 200)
  it('keeps the tile while the focus lies 200 m or more inside it, and wants the nearest centre past that', () => {
    TILE_O.set(0, 0)
    expect(want(150, -199)).toBeNull()
    expect(want(201, 0)).toEqual([200, 0])
    expect(want(650, -320)).toEqual([600, -400])
    // after a move the focus lies within half a step of the centre: no move back
    TILE_O.set(600, -400)
    expect(want(650, -320)).toBeNull()
    TILE_O.set(0, 0)
  })
  it('keeps a whole tile inside the map near its edge, and wants no move when that is the tile now', () => {
    TILE_O.set(0, 0)
    // the most a centre can be: 1726 − 400 = 1326, on the grid 1200; the least −1274 + 400 = −874, on it −800
    expect(want(1700, 1300)).toEqual([1200, 800])
    expect(want(-1270, -1670)).toEqual([-800, -1200])
    TILE_O.set(1200, 800)
    expect(want(1700, 1300)).toBeNull()
    TILE_O.set(0, 0)
  })
})

describe("the follower's choices (TileFollow, G3b-3)", () => {
  it('asks for a tile that failed only once the focus wants another, and swaps in only the tile still wanted', () => {
    const f = new TileFollow()
    expect(f.ask([200, 0])).toBe(true)
    expect(f.ask(null)).toBe(false)
    // (the bug: a tile that failed was asked for again every frame)
    f.failedAt([200, 0])
    expect(f.ask([200, 0])).toBe(false)
    expect(f.ask([400, 0])).toBe(true)
    // a failure that names no tile keeps the last
    f.failedAt(null)
    expect(f.ask([200, 0])).toBe(false)
    f.moved()
    expect(f.ask([200, 0])).toBe(true)
    // (the focus moved on while it was built: not swapped in)
    expect(f.accept([200, 0], [200, 0])).toBe(true)
    expect(f.accept([200, 0], [0, 0])).toBe(false)
    expect(f.accept([200, 0], null)).toBe(false)
  })
})
