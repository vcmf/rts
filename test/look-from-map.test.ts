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
  mapTrees,
  packTrees,
  runsInside,
  wayLines,
  windowHeights,
} from '../src/look/world/from-map.ts'
import { TREE_FLOATS, TREE_SPECIES, decodeLook, encodeLook } from '../src/look/world/data.ts'
import { WINDOWS, windowOf, type LookWindow } from '../src/look/world/windows.ts'
import { noRiver } from '../src/look/river.ts'
import { ROAD_SLOTS } from '../src/look/spec.ts'

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
  it('takes each coarse cell from the fine cell past its centre, and leaves a cover already coarse as it is', () => {
    const n = 4
    const tex = new Uint8Array(n * n * 4)
    for (let c = 0; c < n * n; c++) tex[c * 4] = c
    const fine = { n, cell: 1, x0: -2, z0: -2, tex }
    const g = coarsenCover(fine, 2)
    expect([g.n, g.cell, g.x0, g.z0]).toEqual([2, 2, -2, -2])
    // coarse (i, j) from fine (2i + 1, 2j + 1)
    expect([g.tex[0], g.tex[4], g.tex[8], g.tex[12]]).toEqual([5, 7, 13, 15])
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
  const trees = mapTrees(L, WIN, 120)

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
    const moved = mapTrees(L, { ...WIN, x: 10, z: -10 }, 80)
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
