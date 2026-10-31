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
  cellAt,
  fillRings,
  fineAreas,
  ringsOf,
  checkWindowInside,
  cropFor,
  fieldAt,
  groundClass,
  ihash,
  mapCover,
  BAYS_MEAN,
  mapTrees,
  packTrees,
  standOf,
  THICKET_MEAN,
  treeScale,
  type MapTree,
  WOOD_CHANCE_TOP,
  WOOD_STEP,
  woodNoiseMeans,
  woodSeeds,
  woodTrees,
  runsInside,
  wayLines,
  windowHeights,
} from '../src/look/world/from-map.ts'
import { TREE_FLOATS, TREE_SPECIES, decodeLook, encodeLook, type TreeSpecies } from '../src/look/world/data.ts'
import { WINDOWS, windowOf, type LookWindow } from '../src/look/world/windows.ts'
import { noRiver } from '../src/look/river.ts'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import { apply } from '../src/map/apply.ts'
import { segD } from '../src/look/world/geom.ts'
import { D as SPEC_D, ROAD_SLOTS } from '../src/look/spec.ts'

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

  it('refuses a window whose far ring leaves the map, or whose centre is off even metres', () => {
    const L = layers()
    expect(() => checkWindowInside(L, WIN, 100)).not.toThrow()
    expect(() => checkWindowInside(L, WIN, 140)).toThrow(/leaves the map/)
    expect(() => checkWindowInside(L, { ...WIN, x: 1 }, 100)).toThrow(/even metres/)
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
    expect(wood.length).toBeGreaterThan(0)
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

  it("keeps a small wood's trees per hectare at its density, on average over a dozen maps' seeds (within 15 %)", () => {
    // the 60 m wood at full density, one tree a 36 m²; a wood this small takes its thickets, clearings and bays from a
    // patch of the noises, so one seed's count ranges about ±60 %
    let count = 0
    for (let seed = 0; seed < 12; seed++) {
      count += mapTrees(L, fineAreas(L, FEATURES, WIN, 120, 1), WIN, seed).filter(t => t.x > 0 && t.z > 0).length
    }
    expect(count / 12 / (60 ** 2 / 36)).toBeGreaterThan(0.85)
    expect(count / 12 / (60 ** 2 / 36)).toBeLessThan(1.15)
  })

  it('packs each tree as x, z, its species index and its scale', () => {
    const a = packTrees(trees.slice(0, 2))
    expect(a.length).toBe(2 * TREE_FLOATS)
    expect(TREE_SPECIES[a[2]]).toBe(trees[0].sp)
    expect(a[3]).toBeCloseTo(trees[0].s, 5)
  })
})

// a large wood, to judge its scatter as a forest: a square of FOREST_HALF m a side's half in layers of 2 m cells
// over 440 m, mixed at full density unless asked
const FOREST_HALF = 180
const FOREST_N = 220

/**
 * How the large wood grows: its leaf, its density (0..1), 6 m rides cleared through it north–south from each x and
 * 6 m glades cleared in it (squares about each centre).
 */
interface ForestOpts {
  leaf?: string
  density?: number
  rides?: number[]
  glades?: Pt[]
}

/** The large wood's layers, centred on the map point `at` (its trees are a function of them and the map's seed). */
function forestLayers(
  at: Pt = [0, 0],
  { leaf = 'mixed', density = 1, rides = [], glades = [] }: ForestOpts = {},
): Layers {
  const n = FOREST_N * FOREST_N
  const U = () => new Uint16Array(n)
  const wood: Resolved = { id: 'forest', kind: 'veg.wood', priority: 40, attrs: { leaf, density, height: 20 } }
  const L: Layers = {
    ...layers(),
    nx: FOREST_N,
    nz: FOREST_N,
    x0: at[0] - FOREST_N,
    z0: at[1] - FOREST_N,
    height: new Float64Array((FOREST_N + 1) * (FOREST_N + 1)),
    table: [wood],
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
  }
  for (let j = 0; j < FOREST_N; j++) {
    for (let i = 0; i < FOREST_N; i++) {
      const x = L.x0 + (i + 0.5) * 2 - at[0]
      const z = L.z0 + (j + 0.5) * 2 - at[1]
      const inRide =
        rides.some(r => x > r && x < r + 6) ||
        glades.some(([gx, gz]) => Math.max(Math.abs(x - gx), Math.abs(z - gz)) < 3)
      // (the density stays over the ride: only the vegetation's layer clears it)
      if (Math.max(Math.abs(x), Math.abs(z)) < FOREST_HALF) {
        L.density[j * FOREST_N + i] = Math.round(255 * density)
        if (!inRide) L.veg[j * FOREST_N + i] = 1
      }
    }
  }
  return L
}

/** The large wood's trees in map metres (`seed`: the map's), on every lattice cell of its square. */
function forestTrees(at: Pt = [0, 0], opts: ForestOpts = {}, seed = 0): MapTree[] {
  const n = Math.ceil(FOREST_HALF / WOOD_STEP) + 1
  const [a, b] = [Math.round(at[0] / WOOD_STEP), Math.round(at[1] / WOOD_STEP)]
  return woodTrees(forestLayers(at, opts), seed, a - n, a + n, b - n, b + n)
}

// four more places for the large wood, far apart on the map
const FAR_WOODS: Pt[] = [
  [3000, 0],
  [0, 3000],
  [-3000, -1500],
  [1500, -3000],
]

/** The trees a hectare of the large wood holds over its five places, against one per 36 m² at its density. */
function perHectare(opts: ForestOpts): number {
  const count = [[0, 0] as Pt, ...FAR_WOODS].reduce((n, at) => n + forestTrees(at, opts).length, 0)
  return count / (((5 * (2 * FOREST_HALF) ** 2) / 36) * (opts.density ?? 1))
}

/** Each tree's nearest neighbour among `trees`: its distance (m) and its direction (radians). */
function nearest(trees: readonly MapTree[]): { d: number; dir: number }[] {
  return trees.map(t => {
    let best = Infinity
    let dir = 0
    for (const u of trees) {
      const d = Math.hypot(u.x - t.x, u.z - t.z)
      if (u !== t && d < best) [best, dir] = [d, Math.atan2(u.z - t.z, u.x - t.x)]
    }
    return { d: best, dir }
  })
}

describe('a large wood', () => {
  const trees = forestTrees()
  // well inside the wood, off its rim
  const inner = trees.filter(t => Math.max(Math.abs(t.x), Math.abs(t.z)) < 150)
  const nn = nearest(inner)

  it('shows no lattice: no period along the map axes', () => {
    // the power of the trees' positions at a period of P m along x or along z: about 1 for a random scatter, of the
    // order of the trees' count for a lattice of that period (the old placement's 6 m: some 140)
    const power = (P: number, along: (t: MapTree) => number) => {
      let c = 0
      let s = 0
      for (const t of inner) {
        c += Math.cos((2 * Math.PI * along(t)) / P)
        s += Math.sin((2 * Math.PI * along(t)) / P)
      }
      return (c * c + s * s) / inner.length
    }
    let peak = 0
    for (let P = 2; P <= 12; P += 0.125) {
      peak = Math.max(
        peak,
        power(P, t => t.x),
        power(P, t => t.z),
      )
    }
    expect(peak).toBeLessThan(12)
  })

  it('spaces its trees unevenly: close pairs, open ground, no two trunks in one place', () => {
    const d = nn.map(v => v.d)
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length)
    expect(sd / mean).toBeGreaterThan(0.3)
    expect(d.filter(v => v < 2.8).length / d.length).toBeGreaterThan(0.05)
    expect(Math.min(...d)).toBeGreaterThan(1.1)
    // clearings: 12 m squares of the inside (24 a side) with no tree
    const held = new Set(
      inner
        .filter(t => Math.max(Math.abs(t.x), Math.abs(t.z)) < 144)
        .map(t => `${Math.floor(t.x / 12)},${Math.floor(t.z / 12)}`),
    )
    expect(576 - held.size).toBeGreaterThan(10)
  })

  it('keeps the trees per hectare at the density (one a 36 m² at full), within 10 %, at any density and leaf', () => {
    // over five woods in five places of the map, so their noises' thickets and clearings even out
    for (const opts of [{}, { density: 0.5 }, { leaf: 'broad' }, { leaf: 'needle' }]) {
      const v = perHectare(opts)
      expect(v, JSON.stringify(opts)).toBeGreaterThan(0.9)
      expect(v, JSON.stringify(opts)).toBeLessThan(1.1)
    }
  })

  it("never asks a chance above 1 (the factors' tops together), so the factors' means hold everywhere", () => {
    expect(WOOD_CHANCE_TOP).toBeLessThanOrEqual(1)
  })

  it("holds the noises' means as the map's noise gives them (THICKET_MEAN, BAYS_MEAN), whatever its seed", () => {
    for (const seed of [0, 1805]) {
      const m = woodNoiseMeans(seed)
      expect(Math.abs(m.thicket / THICKET_MEAN - 1)).toBeLessThan(0.02)
      expect(Math.abs(m.bays / BAYS_MEAN - 1)).toBeLessThan(0.02)
    }
  })

  it("grows other woods from another map's seed", () => {
    const other = forestTrees([0, 0], {}, 1805)
    const same = other.filter(t => trees.some(u => u.x === t.x && u.z === t.z)).length
    expect(same / other.length).toBeLessThan(0.7)
  })

  it('stands the conifers closer and the oaks wider than their shares', () => {
    const share = (sp: string) => inner.filter(t => t.sp === sp).length / inner.length
    // the mixed leaf's shares: oak 0.3, spruce 0.2, pine 0.1
    expect(share('oak')).toBeLessThan(0.28)
    expect(share('spruce') + share('pine')).toBeGreaterThan(0.32)
  })

  it('turns its stands off the map axes: no border runs north–south or east–west', () => {
    // over a 400 m square at 1 m: of the steps where the stand changes along x, the share where it changes at the same
    // x one metre on along z (a north–south border), and the same across; a lattice on the axes keeps most of them
    const S = woodSeeds(0)
    const id = (x: number, z: number) => standOf(S, x, z).join(',')
    let steps = 0
    let straight = 0
    for (let z = -200; z < 200; z++) {
      for (let x = -200; x < 200; x++) {
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
        ]) {
          if (id(x, z) === id(x + dx, z + dz)) continue
          steps++
          if (id(x + dz, z + dx) !== id(x + dz + dx, z + dx + dz)) straight++
        }
      }
    }
    expect(straight / steps).toBeLessThan(0.5)
  })

  it('spreads their scales, a hawthorn kept at its own and the others within a modest spread of theirs', () => {
    const s = inner.filter(t => t.sp === 'beech').map(t => t.s)
    expect(Math.max(...s) / Math.min(...s)).toBeGreaterThan(1.5)
    // the wood is 20 m high: treeScale's largest, then 1.15 for the stand's age and 1.12 for a veteran
    const top = (sp: TreeSpecies) => Math.max(...trees.filter(t => t.sp === sp).map(t => t.s))
    expect(top('hawthorn')).toBeLessThanOrEqual(treeScale('hawthorn', 20, 1))
    for (const sp of ['oak', 'beech', 'lime', 'birch', 'spruce', 'pine'] as const) {
      expect(top(sp)).toBeLessThanOrEqual(treeScale(sp, 20, 1) * 1.15 * 1.12 + 1e-9)
    }
  })

  it('stands a ragged rim: its depth and its trees vary along the edge', () => {
    // along the south edge, in 20 m stretches: the deepest hawthorn (a rim's alone) and the trees within 8 m
    const deepest: number[] = []
    const edge: number[] = []
    for (let x0 = -160; x0 < 160; x0 += 20) {
      const stretch = trees.filter(t => t.x >= x0 && t.x < x0 + 20 && Math.abs(t.x) < 160)
      const thorns = stretch.filter(t => t.sp === 'hawthorn' && t.z < -FOREST_HALF + 20)
      deepest.push(Math.max(0, ...thorns.map(t => t.z + FOREST_HALF)))
      edge.push(stretch.filter(t => t.z < -FOREST_HALF + 8).length)
    }
    expect(Math.max(...deepest) - Math.min(...deepest)).toBeGreaterThan(3)
    expect(Math.max(...edge)).toBeGreaterThan(2 * Math.min(...edge))
  })

  it("stands the same trees in every window, by the map's layers alone, never by a window's 1 m areas", () => {
    // the layers clear rides just past smaller windows' edges that the wood's 1 m areas do not know: where they
    // differ, a window's areas must not decide; each smaller window (300 m a side) against the whole wood's trees
    const centres = [-20, 0, 10, 20]
    const rides = centres.flatMap(x => [x + 150, x - 156])
    const L = forestLayers([0, 0], { rides })
    const features = [{ id: 'forest', area: square(-FOREST_HALF, -FOREST_HALF, FOREST_HALF, FOREST_HALF) }]
    const treesOf = (win: LookWindow, far: number) =>
      mapTrees(L, fineAreas(L, features, win, far, 1), win).map(t => ({ ...t, x: t.x + win.x, z: t.z + win.z }))
    const key = (t: MapTree) => `${t.x},${t.z},${t.sp},${t.s}`
    const whole = treesOf(WIN, 2 * FOREST_N)
    for (const x of centres) {
      const inSmall = (t: MapTree) => Math.max(Math.abs(t.x - x), Math.abs(t.z)) < 150
      const want = whole.filter(inSmall).map(key).sort()
      expect(want.length).toBeGreaterThan(1000)
      expect(
        treesOf({ ...WIN, x }, 300)
          .filter(inSmall)
          .map(key)
          .sort(),
        `${x}`,
      ).toEqual(want)
    }
  })

  it("gives a glade inside the wood its rim, as its outline, though the edge band's depth reaches past it", () => {
    // 6 m glades every 40 m: hawthorns (a rim's alone) within 2 m of them, as along the outline
    const glades: Pt[] = []
    for (let x = -140; x <= 140; x += 40) for (let z = -140; z <= 140; z += 40) glades.push([x, z])
    const near = forestTrees([0, 0], { glades }).filter(
      t => t.sp === 'hawthorn' && glades.some(([x, z]) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) < 5),
    )
    expect(near.length).toBeGreaterThan(10)
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

  it("carries the world it holds and a map's trees through the file", () => {
    const grid = { n: 2, cell: 1, x0: 0, z0: 0, h: new Float32Array(4) }
    const spans = { n: 1, cell: 1, x0: 0, z0: 0, ch: 4, spans: new Float32Array(0), tex: new Uint8Array(0) }
    const world = { kind: 'map', map: 'test', window: 'test', x: 2, z: 4, base: 1.5 } as const
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
    })
    const back = decodeLook(c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer)
    expect(back.world).toEqual(world)
    expect(Array.from(back.trees)).toEqual([1, 2, 3, 4])
    expect(back.river.n).toBe(0)
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

  it("stands the same wood trees in every window: a slanted outline and a lane's keep-off at one window's edge", () => {
    // the wood's trees are the map's: small windows against the whole map's, each over its own square
    const ex = expand(map, cat).map
    const L = apply(ex, cat)
    const treesOf = (win: LookWindow, far: number) =>
      mapTrees(L, fineAreas(L, ex.features, win, far, 1), win, map.seed).map(t => ({
        ...t,
        x: t.x + win.x,
        z: t.z + win.z,
      }))
    const key = (t: MapTree) => `${t.x},${t.z},${t.sp},${t.s}`
    const whole = treesOf({ map: 't', name: 't', x: 0, z: 0 }, 120)
    let compared = 0
    // small windows 24 m a side over the wood, every 4 m (even metres, as a window's centre), their edges across its
    // outline, the lane and the hedge
    for (let x = -36; x <= 36; x += 4) {
      for (let z = -36; z <= 36; z += 4) {
        const inSmall = (t: MapTree) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) < 12
        const want = whole.filter(inSmall).map(key).sort()
        compared += want.length
        const got = treesOf({ map: 't', name: 't', x, z }, 24).filter(inSmall).map(key).sort()
        expect(got, `${x}, ${z}`).toEqual(want)
      }
    }
    expect(compared).toBeGreaterThan(30)
  })

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
