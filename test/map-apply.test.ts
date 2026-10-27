// Applying a map into its layers, and the draft raster (docs/plans/done/m1-language.md, M1b): the barrier cell
// rule of proposal §3.6, painting order, the relief, determinism against committed hashes, and locality.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import type { Layers } from '../src/map/apply.ts'
import { apply, barrierCells, CELL, LAYER_NAMES } from '../src/map/apply.ts'
import { draft } from '../src/map/draft.ts'
import { fnv1a, hex } from '../src/sim/index.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const example = JSON.parse(fs.readFileSync(path.join(root, 'maps/two-ridges.map.json'), 'utf8')) as MapFile
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
const hashLayers = (L: Layers) =>
  hex(
    LAYER_NAMES.reduce(
      (h, n) => fnv1a(bytes(L[n]), h),
      fnv1a(bytes(L.depth), fnv1a(bytes(L.height), fnv1a(bytes(L.density)))),
    ),
  )

// a barrier's cells on an open grid around the origin: a set of "i,j" with i, j counted from (x0, z0) = (−40, −40)
const X0 = -40
const cellsOf = (line: Pt[], thickness = 2, gaps?: { every: number; width: number }) => {
  const s = new Set<string>()
  barrierCells(line, thickness, gaps, (i, j) => s.add(`${i},${j}`), X0, X0)
  return s
}
const centre = (key: string): Pt => {
  const [i, j] = key.split(',').map(Number)
  return [X0 + i * CELL + 1, X0 + j * CELL + 1]
}
// can a walker moving between free cells (8 directions) get from a to b inside the box?
function reach(blocked: Set<string>, a: [number, number], b: [number, number], lo = 0, hi = 40): boolean {
  const seen = new Set([`${a[0]},${a[1]}`])
  const q = [a]
  while (q.length) {
    const [i, j] = q.shift()!
    if (i === b[0] && j === b[1]) return true
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const n: [number, number] = [i + di, j + dj]
        const k = `${n[0]},${n[1]}`
        if (n[0] < lo || n[1] < lo || n[0] > hi || n[1] > hi || blocked.has(k) || seen.has(k)) continue
        seen.add(k)
        q.push(n)
      }
    }
  }
  return false
}

describe('M1b: the barrier cell rule (proposal §3.6)', () => {
  it('along an axis, a 2-thick barrier is 2 cells: one each side of the line', () => {
    const s = cellsOf([
      [0, 0],
      [20, 0],
    ])
    const zs = [...new Set([...s].map(k => centre(k)[1]))].sort((a, b) => a - b)
    expect(zs).toEqual([-1, 1])
    expect(s.size).toBe(20) // 10 cells along, 2 across
  })
  it('the ends are cut square: nothing past the first or last point', () => {
    const xs = [
      ...cellsOf([
        [0, 0],
        [20, 0],
      ]),
    ].map(k => centre(k)[0])
    expect(Math.min(...xs)).toBe(1)
    expect(Math.max(...xs)).toBe(19)
  })
  it('along a diagonal, a staircase 3 cells across that nothing crosses, even moving diagonally', () => {
    const s = cellsOf([
      [0, 0],
      [40, 40],
    ])
    const row = (z: number) => [...s].filter(k => centre(k)[1] === z).length
    expect(row(11)).toBe(3)
    expect(row(21)).toBe(3)
    // from below-right of the line to above-left, with the line running corner to corner of the box
    // the line runs past the box both ways, so its square-cut ends are outside it
    const full = cellsOf([
      [-80, -80],
      [80, 80],
    ])
    expect(reach(full, [39, 1], [1, 39], 0, 39)).toBe(false)
  })
  it('two walls 4 m apart leave a 2-cell gate open', () => {
    const s = new Set([
      ...cellsOf([
        [-40, 0],
        [0, 0],
      ]),
      ...cellsOf([
        [4, 0],
        [40, 0],
      ]),
    ])
    expect(s.has('20,19') || s.has('20,20')).toBe(false) // the gate's cells: x 1 and 3, z ±1
    expect(s.has('21,19') || s.has('21,20')).toBe(false)
    expect(reach(s, [20, 5], [20, 35])).toBe(true)
  })
  it('a corner stays sealed', () => {
    const s = cellsOf([
      [-40, 0],
      [0, 0],
      [0, 40],
    ])
    // the inside of the L from the outside, within the box the L closes
    expect(reach(s, [10, 30], [30, 10], 0, 39)).toBe(false)
  })
  it('a closed line has no free ends: a walled yard is sealed all round', () => {
    const yard = cellsOf([
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
      [-20, -20],
    ])
    expect(reach(yard, [20, 20], [2, 2], 0, 40)).toBe(false)
    // stopping 20 m short leaves a gap; stopping 2 m short does not (the southern wall's band fills the corner)
    expect(
      reach(
        cellsOf([
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, 0],
        ]),
        [20, 20],
        [2, 2],
        0,
        40,
      ),
    ).toBe(true)
    expect(
      reach(
        cellsOf([
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, -18],
        ]),
        [20, 20],
        [2, 2],
        0,
        40,
      ),
    ).toBe(false)
  })
  it('gaps open whole cells at steps [every·k, every·k + width), k ≥ 1', () => {
    const s = cellsOf(
      [
        [0, 0],
        [40, 0],
      ],
      2,
      { every: 6, width: 2 },
    )
    const along = [...new Set([...s].map(k => (centre(k)[0] - 1) / 2))].sort((a, b) => a - b)
    expect(along).toEqual([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 14, 15, 16, 17]) // 20 steps; gaps at 6–7, 12–13, 18–19
  })
  it('an even thickness of 4 is 4 cells on an axis', () => {
    expect(
      [
        ...new Set(
          [
            ...cellsOf(
              [
                [0, 0],
                [20, 0],
              ],
              4,
            ),
          ].map(k => centre(k)[1]),
        ),
      ].sort((a, b) => a - b),
    ).toEqual([-3, -1, 1, 3])
  })
})

const mini = (features: MapFile['features']): MapFile => ({
  format: 1,
  id: 'mini',
  name: 'Mini',
  seed: 1,
  season: 'summer',
  extent: { w: 400, h: 400 },
  play: { w: 200, h: 200 },
  features,
})
const at = (L: Layers, layer: (typeof LAYER_NAMES)[number], x: number, z: number) => {
  const k = L[layer][Math.floor((z - L.z0) / L.cell) * L.nx + Math.floor((x - L.x0) / L.cell)]
  return k ? L.table[k - 1].id : null
}
const hAt = (L: Layers, x: number, z: number) =>
  L.height[Math.round((z - L.z0) / L.cell) * (L.nx + 1) + Math.round((x - L.x0) / L.cell)]

describe('M1b: applying features into the layers', () => {
  it('the higher priority wins a cell; at equal priority, the later id', () => {
    const L = apply(
      mini([
        {
          id: 'b-meadow',
          kind: 'ground.meadow',
          area: [
            [
              [-100, -100],
              [100, -100],
              [100, 100],
              [-100, 100],
            ],
          ],
        },
        {
          id: 'a-field',
          kind: 'ground.field',
          area: [
            [
              [-20, -20],
              [20, -20],
              [20, 20],
              [-20, 20],
            ],
          ],
        },
        {
          id: 'a-meadow',
          kind: 'ground.meadow',
          area: [
            [
              [50, 50],
              [90, 50],
              [90, 90],
              [50, 90],
            ],
          ],
        },
      ]),
      cat,
    )
    expect(at(L, 'ground', 1, 1)).toBe('a-field') // priority 20 over 10
    expect(at(L, 'ground', 71, 71)).toBe('b-meadow') // equal priority: b after a
    expect(at(L, 'ground', -61, 1)).toBe('b-meadow')
  })
  it('a hill peaks at its height; a ridge is steeper on its steep side; edits apply after landforms', () => {
    const L = apply(
      mini([
        { id: 'hill', kind: 'relief.hill', point: [-100, 100], height: 10, width: 120 },
        {
          id: 'ridge',
          kind: 'relief.ridge',
          line: [
            [-150, -100],
            [150, -100],
          ],
          height: 12,
          width: 100,
          steep: 'right',
        },
        { id: 'flat', kind: 'relief.level', circle: [[-100, 100], 20], to: 3, edge: 10 },
        {
          id: 'ditch',
          kind: 'relief.ditch',
          line: [
            [100, 50],
            [150, 50],
          ],
          depth: 1.5,
          width: 4,
        },
      ]),
      cat,
    )
    expect(hAt(L, -100, 100)).toBeCloseTo(3, 9) // levelled to 3 m on top of the hill
    expect(hAt(L, -100, 40)).toBeCloseTo(0, 9)
    expect(hAt(L, 0, -100)).toBeCloseTo(12, 9)
    expect(hAt(L, 0, -130)).toBeLessThan(hAt(L, 0, -70)) // right of eastward travel is south: steeper there
    expect(hAt(L, 120, 50)).toBeCloseTo(-1.5, 9)
    expect(at(L, 'edit', 121, 51)).toBe('ditch')
  })
  it('a mend rebuilds the ground under an embankment and in a pit from the ground around them (decision 0073)', () => {
    // sloping ground: the flank of a broad hill far to the north-east
    const slope = { id: 'hill', kind: 'relief.hill', point: [900, 700] as Pt, height: 60, width: 2400 }
    const bank = {
      id: 'bank',
      kind: 'relief.ridge',
      line: [
        [-200, 0],
        [200, 0],
      ] as Pt[],
      height: 5,
      width: 30,
    }
    // a pit in the landforms (as a quarry is in the real relief): a sunken plateau
    const pit = {
      id: 'pit',
      kind: 'relief.plateau',
      circle: [[-100, -120] as Pt, 25] as [Pt, number],
      height: -6,
      edge: 8,
    }
    const ground = apply(mini([slope]), cat)
    const works = apply(mini([slope, bank, pit]), cat)
    const mended = apply(
      mini([
        slope,
        bank,
        pit,
        {
          id: 'mend-bank',
          kind: 'relief.mend',
          line: [
            [-150, 0],
            [150, 0],
          ],
          width: 40,
          edge: 10,
        },
        { id: 'mend-pit', kind: 'relief.mend', circle: [[-100, -120], 35], edge: 10 },
      ]),
      cat,
    )
    for (const [x, z] of [
      [0, 0],
      [60, 5],
      [-90, -8],
      [-100, -120],
      [-90, -110],
    ] as Pt[]) {
      // the work stood a metre or more off the ground; mended, within 15 cm of it
      expect(Math.abs(hAt(works, x, z) - hAt(ground, x, z))).toBeGreaterThan(1)
      expect(Math.abs(hAt(mended, x, z) - hAt(ground, x, z))).toBeLessThan(0.15)
    }
    // past its reach the ground is as it was
    expect(hAt(mended, 0, 60)).toBe(hAt(works, 0, 60))
    // the mends first: an 1805 cut painted before the mend by id still lands on the mended ground
    const cut = apply(
      mini([
        slope,
        bank,
        {
          id: 'a-cut',
          kind: 'relief.cut',
          line: [
            [-50, 0],
            [50, 0],
          ],
          depth: 1,
          width: 6,
        },
        {
          id: 'z-mend',
          kind: 'relief.mend',
          line: [
            [-150, 0],
            [150, 0],
          ],
          width: 40,
          edge: 10,
        },
      ]),
      cat,
    )
    expect(Math.abs(hAt(cut, 0, 0) - hAt(ground, 0, 0) + 1)).toBeLessThan(0.15)
  })
  it('a mend is part of the relief: water is levelled on the mended ground, bends mend, the order of mends is moot', () => {
    const slope = { id: 'hill', kind: 'relief.hill', point: [900, 700] as Pt, height: 60, width: 2400 }
    const pit = {
      id: 'pit',
      kind: 'relief.plateau',
      circle: [[-100, -120] as Pt, 25] as [Pt, number],
      height: -6,
      edge: 8,
    }
    const mendPit = { id: 'mend-pit', kind: 'relief.mend', circle: [[-100, -120] as Pt, 35] as [Pt, number], edge: 10 }
    const brook = {
      id: 'brook',
      kind: 'water.stream',
      line: [
        [-190, -120],
        [-10, -120],
      ] as Pt[],
    }
    // a stream across a mended pit: its level from the mended ground, not the pit's floor
    const dry = apply(mini([slope, pit, mendPit]), cat)
    const wet = apply(mini([slope, pit, mendPit, brook]), cat)
    expect(hAt(dry, -100, -120) - hAt(wet, -100, -120)).toBeLessThan(2)
    // an embankment with a bend, mended along the same bend: the inside and the outside of the bend too
    const bend: Pt[] = [
      [-150, 0],
      [0, 0],
      [0, 150],
    ]
    const ground = apply(mini([slope]), cat)
    const mended = apply(
      mini([
        slope,
        { id: 'bank', kind: 'relief.ridge', line: bend, height: 5, width: 30 },
        { id: 'mend', kind: 'relief.mend', line: bend, width: 40, edge: 10 },
      ]),
      cat,
    )
    for (const [x, z] of [
      [-8, 8],
      [-4, 4],
      [10, -10],
      [-30, 3],
      [3, 40],
    ] as Pt[]) {
      expect(Math.abs(hAt(mended, x, z) - hAt(ground, x, z))).toBeLessThan(0.3)
    }
    // two overlapping mends: the same ground whichever id sorts first
    const line = {
      kind: 'relief.mend',
      line: [
        [-250, -120],
        [50, -120],
      ] as Pt[],
      width: 20,
      edge: 10,
    }
    // an embankment along the line crosses the circle's rim: the circle's plane must not read it, whichever goes first
    const bank = { id: 'bank', kind: 'relief.ridge', line: line.line, height: 5, width: 16 }
    const a = apply(mini([slope, pit, bank, { ...mendPit, id: 'a' }, { ...line, id: 'b' }]), cat)
    const b = apply(mini([slope, pit, bank, { ...mendPit, id: 'b' }, { ...line, id: 'a' }]), cat)
    expect(Array.from(a.height)).toEqual(Array.from(b.height))
  })
  it('water, ways, barriers and buildings land in their layers; a bridge decks the road over the water', () => {
    const L = apply(
      mini([
        {
          id: 'brook',
          kind: 'water.stream',
          line: [
            [-200, 0],
            [200, 0],
          ],
          width: 6,
        },
        {
          id: 'road',
          kind: 'way.road.lane',
          line: [
            [10, -200],
            [10, 200],
          ],
        },
        { id: 'bridge', kind: 'built.bridge', carries: 'road', crosses: 'brook' },
        {
          id: 'hedge',
          kind: 'barrier.hedge',
          line: [
            [-100, 40],
            [-40, 40],
          ],
        },
        {
          id: 'house',
          kind: 'built.house',
          area: [
            [
              [60, 60],
              [72, 60],
              [72, 70],
              [60, 70],
            ],
          ],
        },
      ]),
      cat,
    )
    expect(at(L, 'water', -101, 1)).toBe('brook')
    expect(at(L, 'way', 11, 101)).toBe('road')
    expect(at(L, 'built', 11, 1)).toBe('bridge')
    expect(at(L, 'barrier', -71, 41)).toBe('hedge')
    expect(at(L, 'barrier', -71, 39)).toBe('hedge')
    expect(at(L, 'barrier', -71, 43)).toBeNull()
    expect(at(L, 'built', 65, 65)).toBe('house')
  })
  it('a scarp is a step: its high side stays up past the face and returns over its back slope (review round 1)', () => {
    const L = apply(
      mini([
        {
          id: 'step',
          kind: 'relief.scarp',
          line: [
            [-150, 0],
            [150, 0],
          ],
          height: 6,
          width: 20,
          steep: 'left',
          edge: 100,
        },
      ]),
      cat,
    )
    expect(hAt(L, 0, -20)).toBeCloseTo(0, 9) // the low side, past the face
    expect(hAt(L, 0, 0)).toBeCloseTo(3, 9) // mid-face
    expect(hAt(L, 0, 10)).toBeCloseTo(6, 9) // the top of the face
    expect(hAt(L, 0, 40)).toBeGreaterThan(4) // still high 30 m back, no cliff at a box edge
    expect(hAt(L, 0, 110)).toBeCloseTo(0, 9) // back to the ground after the back slope
    // never rises again
    for (let z = 10; z < 110; z += 2) expect(hAt(L, 0, z + 2)).toBeLessThanOrEqual(hAt(L, 0, z) + 1e-12)
  })
  it('lines narrower than a cell still take the cells beside them (review round 1)', () => {
    const L = apply(
      mini([
        {
          id: 'path',
          kind: 'way.path',
          line: [
            [-100, 50],
            [100, 50],
          ],
        },
        {
          id: 'rill',
          kind: 'water.stream',
          line: [
            [-100, -50],
            [100, -50],
          ],
          width: 2,
        },
      ]),
      cat,
    )
    expect(at(L, 'way', 1, 51)).toBe('path')
    expect(at(L, 'way', 1, 49)).toBe('path')
    expect(at(L, 'way', 1, 53)).toBeNull()
    expect(at(L, 'water', 1, -49)).toBe('rill')
  })
  it('widths round the same way for every line: a 6 m stream and a 5 m road both take 4 m, a 10 m stream 8 m (review round 2)', () => {
    const L = apply(
      mini([
        {
          id: 'stream',
          kind: 'water.stream',
          line: [
            [-100, 0],
            [100, 0],
          ],
          width: 6,
        },
        {
          id: 'river',
          kind: 'water.river',
          line: [
            [-100, 100],
            [100, 100],
          ],
          width: 10,
        },
        {
          id: 'road',
          kind: 'way.road.lane',
          line: [
            [-100, -100],
            [100, -100],
          ],
          width: 5,
        },
      ]),
      cat,
    )
    const across = (layer: (typeof LAYER_NAMES)[number], z0: number) =>
      [-5, -3, -1, 1, 3, 5].filter(dz => at(L, layer, 1, z0 + dz) !== null).length * 2
    expect(across('water', 0)).toBe(4)
    expect(across('way', -100)).toBe(4)
    expect(across('water', 100)).toBe(8)
  })
  it('a raise over a ditch keeps the ditch marked (review round 2)', () => {
    const L = apply(
      mini([
        {
          id: 'a-ditch',
          kind: 'relief.ditch',
          line: [
            [-50, 0],
            [50, 0],
          ],
          depth: 1.5,
          width: 4,
        },
        { id: 'b-raise', kind: 'relief.raise', circle: [[0, 0], 20], height: 1 },
      ]),
      cat,
    )
    expect(at(L, 'edit', 1, 1)).toBe('a-ditch')
  })
  it("a scarp's ends fade over its back slope, not as a wall; edge 0 is no cliff (review round 2)", () => {
    const L = apply(
      mini([
        {
          id: 'step',
          kind: 'relief.scarp',
          line: [
            [-100, 0],
            [100, 0],
          ],
          height: 6,
          width: 20,
          steep: 'left',
          edge: 150,
        },
      ]),
      cat,
    )
    // gentler than the face's 6 m over 20 m
    for (let x = 100; x < 190; x += 2) expect(Math.abs(hAt(L, x + 2, 40) - hAt(L, x, 40))).toBeLessThan(0.35)
    const Z = apply(
      mini([
        {
          id: 'step',
          kind: 'relief.scarp',
          line: [
            [-100, 0],
            [100, 0],
          ],
          height: 6,
          width: 20,
          steep: 'left',
          edge: 0,
        },
      ]),
      cat,
    )
    // the face's steepest 2 m step is 1.5 × 6 m / 20 m × 2 m = 0.9 m; the back slope is never steeper
    for (let z = 0; z < 60; z += 2) expect(Math.abs(hAt(Z, 0, z + 2) - hAt(Z, 0, z))).toBeLessThanOrEqual(0.9 + 1e-9)
  })
  it('in the draft, cuts and ditches show; levelled ground keeps its colour (review round 1)', () => {
    const L = apply(
      mini([
        {
          id: 'meadow',
          kind: 'ground.meadow',
          area: [
            [
              [-200, -200],
              [200, -200],
              [200, 200],
              [-200, 200],
            ],
          ],
        },
        { id: 'flat', kind: 'relief.level', circle: [[-100, 0], 30], to: 0 },
        {
          id: 'ditch',
          kind: 'relief.ditch',
          line: [
            [60, 0],
            [140, 0],
          ],
          depth: 1.5,
          width: 4,
        },
      ]),
      cat,
    )
    const img = draft(L)
    const px = (x: number, z: number) => {
      const i = Math.floor((x - L.x0) / 2)
      const j = Math.floor((z - L.z0) / 2)
      const o = ((L.nz - 1 - j) * L.nx + i) * 4
      return [img.data[o], img.data[o + 1], img.data[o + 2]]
    }
    expect(px(-100, 1)).toEqual(px(-160, 101)) // levelled flat meadow = flat meadow elsewhere
    expect(px(101, 1)).not.toEqual(px(-160, 101)) // the ditch is drawn
  })
  it('a density ramp thins a wood toward its edge', () => {
    const L = apply(
      mini([
        {
          id: 'wood',
          kind: 'veg.wood',
          circle: [[0, 0], 80],
          density: {
            edge: [
              [0, 0.2],
              [40, 1],
            ],
          },
        },
      ]),
      cat,
    )
    const d = (x: number) => L.density[Math.floor((0 - L.z0) / 2) * L.nx + Math.floor((x - L.x0) / 2)]
    expect(d(1)).toBe(255)
    expect(d(77)).toBeLessThan(80)
  })
})

describe('M1b: determinism and locality', () => {
  const ex = expand(example, cat).map
  it('the example applies and draws to the same bytes every time, and to the committed hashes', () => {
    expect(validate(ex, cat)).toEqual([])
    const a = apply(ex, cat)
    const b = apply(ex, cat)
    expect(hashLayers(a)).toBe(hashLayers(b))
    const img = draft(a)
    expect({ layers: hashLayers(a), draft: hex(fnv1a(bytes(img.data))) }).toEqual({
      layers: '0xea8f2c5c',
      draft: '0xa24b56b3',
    })
  })
  it('moving one wood changes only the cells it covered or covers, and no height', () => {
    const moved = clone(ex)
    const wood = moved.features.find(f => f.id === 'west-wood')!
    wood.area = wood.area!.map(r => r.map(([x, z]) => [x + 40, z] as Pt))
    const A = apply(ex, cat)
    const B = apply(moved, cat)
    // only veg and density moved (not the water's depth)
    expect(hashLayers({ ...A, ground: B.ground, veg: B.veg, density: B.density } as Layers)).toBe(hashLayers(B))
    expect(Buffer.compare(Buffer.from(bytes(A.height)), Buffer.from(bytes(B.height)))).toBe(0)
    const woodIx = (L: Layers) => L.table.findIndex(t => t.id === 'west-wood') + 1
    for (let c = 0; c < A.veg.length; c++) {
      if (A.veg[c] !== B.veg[c] || A.density[c] !== B.density[c]) {
        expect(A.veg[c] === woodIx(A) || B.veg[c] === woodIx(B)).toBe(true)
      }
    }
  })
})
