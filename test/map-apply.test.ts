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
  it("an area's mend meets the ground all round its rim, on ground no plane fits (the pit at Újezd, G2)", () => {
    // a broad hill's flank curving across the work, as the ground round the pit at Újezd: no plane fits its rim
    const hill = { id: 'hill', kind: 'relief.hill', point: [0, 200] as Pt, height: 15, width: 500 }
    const pit = {
      id: 'pit',
      kind: 'relief.plateau',
      area: [
        [
          [-150, -30],
          [150, -30],
          [150, 30],
          [-150, 30],
        ],
      ] as Pt[][],
      height: -6,
      edge: 4,
    }
    const mend = {
      id: 'mend-pit',
      kind: 'relief.mend',
      area: [
        [
          [-160, -40],
          [160, -40],
          [160, 40],
          [-160, 40],
        ],
      ] as Pt[][],
      edge: 5,
    }
    const ground = apply(mini([hill]), cat)
    const mended = apply(mini([hill, pit, mend]), cat)
    // along its outline, every 10 m: the mended ground within 0.4 m of the real ground (the blend's 5 m past it
    // eases in the rest); a plane through the rim missed it by 2.4 m here, and by 3 m at Újezd
    let worst = 0
    for (let t = -160; t <= 160; t += 10) {
      for (const [x, z] of [
        [t, 40],
        [t, -40],
        [160, t / 4],
        [-160, t / 4],
      ] as Pt[]) {
        worst = Math.max(worst, Math.abs(hAt(mended, x, z) - hAt(ground, x, z)))
      }
    }
    expect(worst).toBeLessThan(0.4)
    // inside, within its rim's range of ground (a membrane's maximum principle): what the work took away no fill from
    // the rim can know, so the promise is the rim's range
    const rim: number[] = []
    for (let t = -160; t <= 160; t += 10) rim.push(hAt(ground, t, 45), hAt(ground, t, -45))
    for (let t = -40; t <= 40; t += 10) rim.push(hAt(ground, 165, t), hAt(ground, -165, t))
    for (let x = -140; x <= 140; x += 20) {
      for (let z = -30; z <= 30; z += 10) {
        expect(hAt(mended, x, z)).toBeGreaterThanOrEqual(Math.min(...rim) - 0.05)
        expect(hAt(mended, x, z)).toBeLessThanOrEqual(Math.max(...rim) + 0.05)
      }
    }
  })
  it("an area's mend never reads ground another mend reaches: an embankment through its rim stays mended", () => {
    const slope = { id: 'hill', kind: 'relief.hill', point: [900, 700] as Pt, height: 60, width: 2400 }
    const pit = { id: 'pit', kind: 'relief.plateau', circle: [[0, 0] as Pt, 30] as [Pt, number], height: -6, edge: 6 }
    // an embankment 5 m high passing 45 m from the pit's centre: through the ring the pit's membrane is held to
    const bank = {
      id: 'bank',
      kind: 'relief.ridge',
      line: [
        [-180, 45],
        [180, 45],
      ] as Pt[],
      height: 5,
      width: 20,
    }
    const mendPit = { id: 'mend-pit', kind: 'relief.mend', circle: [[0, 0] as Pt, 36] as [Pt, number], edge: 5 }
    const mendBank = {
      id: 'mend-bank',
      kind: 'relief.mend',
      line: [
        [-170, 45],
        [170, 45],
      ] as Pt[],
      width: 30,
      edge: 8,
    }
    const ground = apply(mini([slope]), cat)
    const mended = apply(mini([slope, pit, bank, mendPit, mendBank]), cat)
    // the pit and the embankment where it passes the pit: the ground, not the bank pulled back in by the membrane
    for (const [x, z] of [
      [0, 0],
      [0, 20],
      [0, 38],
      [20, 30],
      [-20, 30],
      [0, 45],
    ] as Pt[]) {
      expect(Math.abs(hAt(mended, x, z) - hAt(ground, x, z))).toBeLessThan(0.3)
    }
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
  it("a mend by the map's edge reads only the side on the map; a subkind mends; three mends sum whatever their ids", () => {
    const slope = { id: 'hill', kind: 'relief.hill', point: [900, 700] as Pt, height: 60, width: 2400 }
    // an embankment 12 m from the north edge: its north side lies off the map, so the south side alone sets the ground
    const edgeLine: Pt[] = [
      [-150, 188],
      [150, 188],
    ]
    const ground = apply(mini([slope]), cat)
    const mended = apply(
      mini([
        slope,
        { id: 'bank', kind: 'relief.ridge', line: edgeLine, height: 5, width: 30 },
        { id: 'mend', kind: 'relief.mend', line: edgeLine, width: 20, edge: 10 },
      ]),
      cat,
    )
    for (const x of [-60, 0, 60]) expect(Math.abs(hAt(mended, x, 188) - hAt(ground, x, 188))).toBeLessThan(0.1)
    // a subkind of relief.mend mends like it
    const sub = clone(cat)
    sub.kinds['relief.mend.rail'] = { set: { width: 20 } }
    const pit = {
      id: 'pit',
      kind: 'relief.plateau',
      circle: [[-100, -120] as Pt, 25] as [Pt, number],
      height: -6,
      edge: 8,
    }
    const rail = apply(
      mini([
        slope,
        { id: 'bank', kind: 'relief.ridge', line: edgeLine, height: 5, width: 30 },
        { id: 'mend', kind: 'relief.mend.rail', line: edgeLine, edge: 10 },
      ]),
      sub,
    )
    expect(Math.abs(hAt(rail, 0, 188) - hAt(ground, 0, 188))).toBeLessThan(0.1)
    // three mends overlapping at the pit: the same bits whichever ids they carry
    const three = (ids: string[]) =>
      apply(
        mini([
          slope,
          pit,
          { id: ids[0], kind: 'relief.mend', circle: [[-100, -120], 35], edge: 10 },
          {
            id: ids[1],
            kind: 'relief.mend',
            line: [
              [-200, -120],
              [0, -120],
            ],
            width: 20,
            edge: 10,
          },
          {
            id: ids[2],
            kind: 'relief.mend',
            line: [
              [-100, -200],
              [-100, -40],
            ],
            width: 20,
            edge: 10,
          },
        ]),
        cat,
      ).height
    const first = Array.from(three(['a', 'b', 'c']))
    for (const ids of [
      ['c', 'b', 'a'],
      ['b', 'c', 'a'],
    ]) {
      expect(Array.from(three(ids))).toEqual(first)
    }
  })
  it("a circle mend mostly off the map takes its free rim's mean, not a plane tilted on a sliver of it", () => {
    const slope = { id: 'hill', kind: 'relief.hill', point: [900, 700] as Pt, height: 60, width: 2400 }
    // a bump on the sliver of rim that lies on the map, which a plane through that sliver tilts on
    const bump = { id: 'bump', kind: 'relief.hill', point: [176, 190] as Pt, height: 6, width: 24 }
    const pit = {
      id: 'pit',
      kind: 'relief.plateau',
      circle: [[200, 200] as Pt, 14] as [Pt, number],
      height: -6,
      edge: 6,
    }
    const ground = apply(mini([slope, bump]), cat)
    const mended = apply(
      mini([slope, bump, pit, { id: 'mend', kind: 'relief.mend', circle: [[214, 214], 30], edge: 10 }]),
      cat,
    )
    for (const [x, z] of [
      [198, 198],
      [195, 199],
      [199, 192],
    ] as Pt[]) {
      expect(Math.abs(hAt(mended, x, z) - hAt(ground, x, z))).toBeLessThan(1)
    }
  })
  it('a pond across a slope fills its low end: never cut more than its depth into the ground, dry uphill (#230)', () => {
    // ground rising 10 m across the pond's 60 m (northward), the pond 1.5 m deep
    const slope = {
      id: 'slope',
      kind: 'relief.ridge',
      line: [
        [-200, 150],
        [200, 150],
      ] as Pt[],
      height: 40,
      width: 600,
    }
    const pond = { id: 'pond', kind: 'water.pond', circle: [[0, -20] as Pt, 30] as [Pt, number] }
    const dry = apply(mini([slope]), cat)
    const wet = apply(mini([slope, pond]), cat)
    let deepest = 0
    let water = 0
    let dryInside = 0
    for (let j = 0; j <= wet.nz; j++) {
      for (let i = 0; i <= wet.nx; i++) {
        const [x, z] = [wet.x0 + i * wet.cell, wet.z0 + j * wet.cell]
        if (x * x + (z + 20) * (z + 20) >= 30 * 30) continue
        deepest = Math.max(deepest, hAt(dry, x, z) - hAt(wet, x, z))
      }
    }
    for (let j = 0; j < wet.nz; j++) {
      for (let i = 0; i < wet.nx; i++) {
        const [x, z] = [wet.x0 + (i + 0.5) * wet.cell, wet.z0 + (j + 0.5) * wet.cell]
        if (x * x + (z + 20) * (z + 20) >= 28 * 28) continue
        if (wet.water[j * wet.nx + i]) water++
        else dryInside++
      }
    }
    // the ground across the pond rises more than its depth
    expect(hAt(dry, 0, 8) - hAt(dry, 0, -48)).toBeGreaterThan(3)
    expect(deepest).toBeLessThanOrEqual(1.5 + 0.4 + 1e-9)
    expect(water).toBeGreaterThan(0)
    expect(dryInside).toBeGreaterThan(0)
  })
  it('a pond with its own level is cut as given; a flat pond keeps its whole outline (#230 review)', () => {
    const count = (L: Layers) => L.water.reduce((n, v) => n + (v ? 1 : 0), 0)
    const sunk = apply(mini([{ id: 'pond', kind: 'water.pond', circle: [[0, 0], 30], level: -5 }]), cat)
    expect(count(sunk)).toBeGreaterThan(700)
    expect(hAt(sunk, 0, 0)).toBeCloseTo(-6.5, 6)
    // on flat ground every cell whose centre lies inside is the pond's, its shallow shore ring too
    const flat = apply(mini([{ id: 'pond', kind: 'water.pond', circle: [[0, 0], 30] }]), cat)
    let inside = 0
    for (let j = 0; j < flat.nz; j++) {
      for (let i = 0; i < flat.nx; i++) {
        const [x, z] = [flat.x0 + (i + 0.5) * flat.cell, flat.z0 + (j + 0.5) * flat.cell]
        if (x * x + z * z < 900) inside++
      }
    }
    expect(count(flat)).toBe(inside)
  })
  it('a stream through a pond on a slope keeps its water below it, and no cliff is left (#230 review)', () => {
    const slope = {
      id: 'slope',
      kind: 'relief.ridge',
      line: [
        [-200, 150],
        [200, 150],
      ] as Pt[],
      height: 40,
      width: 600,
    }
    const pond = { id: 'z-pond', kind: 'water.pond', circle: [[0, -20] as Pt, 30] as [Pt, number] }
    const brook = {
      id: 'brook',
      kind: 'water.stream',
      line: [
        [0, 40],
        [0, -150],
      ] as Pt[],
    }
    const L = apply(mini([slope, pond, brook]), cat)
    // the stream's cells below the pond still hold water
    for (const z of [-53, -55, -57]) {
      const cell = Math.floor((z - L.z0) / L.cell) * L.nx + Math.floor((0.5 - L.x0) / L.cell)
      expect(L.depth[cell]).toBeGreaterThan(0)
    }
    // downhill, across the pond's low shore and the stream through it, no step between neighbouring nodes over 1.5 m
    for (let z = -50; z > -80; z -= 2) expect(Math.abs(hAt(L, 20, z) - hAt(L, 20, z - 2))).toBeLessThan(1.5)
  })
  it('a pond on a slope: no deeper than its depth over a stream, no bank uphill, any order (#230 review 2)', () => {
    const slope = {
      id: 'slope',
      kind: 'relief.ridge',
      line: [
        [-200, 150],
        [200, 150],
      ] as Pt[],
      height: 40,
      width: 600,
    }
    const pond = { id: 'z-pond', kind: 'water.pond', circle: [[0, -20] as Pt, 30] as [Pt, number] }
    const brook = {
      id: 'brook',
      kind: 'water.stream',
      line: [
        [0, 40],
        [0, -150],
      ] as Pt[],
    }
    const dry = apply(mini([slope]), cat)
    const streamOnly = apply(mini([slope, brook]), cat)
    const both = apply(mini([slope, pond, brook]), cat)
    // over the stream the pond never cuts below the deeper of the stream's channel and its own depth (and freeboard)
    for (const z of [-10, -22, -35]) {
      const floor = Math.min(hAt(streamOnly, 0, z), hAt(dry, 0, z) - 1.5 - 0.4)
      expect(hAt(both, 0, z)).toBeGreaterThanOrEqual(floor - 1e-9)
    }
    // no slot walls across the stream below the pond, no bank at the uphill shore: no step over 1.6 m in 2 m
    for (let z = -60; z <= -50; z += 2) {
      for (let x = -10; x < 10; x += 2) expect(Math.abs(hAt(both, x, z) - hAt(both, x + 2, z))).toBeLessThan(1.6)
    }
    const alone = apply(mini([slope, pond]), cat)
    for (let z = -40; z < 10; z += 2) expect(Math.abs(hAt(alone, 0, z) - hAt(alone, 0, z + 2))).toBeLessThan(1)
    // two ponds near each other: the same ground whatever their ids
    const pair = (a: string, b: string) =>
      apply(
        mini([
          slope,
          { id: a, kind: 'water.pond', circle: [[0, 0], 20] },
          { id: b, kind: 'water.pond', circle: [[0, -30], 6] },
        ]),
        cat,
      ).height
    expect(Array.from(pair('a-pond', 'b-pond'))).toEqual(Array.from(pair('z-pond', 'b-pond')))
    // a ditch just below the pond keeps its cut
    const ditch = {
      id: 'ditch',
      kind: 'relief.ditch',
      line: [
        [-40, -56],
        [40, -56],
      ] as Pt[],
      depth: 1.5,
      width: 4,
    }
    const ponded = apply(mini([slope, pond, ditch]), cat)
    const cut = apply(mini([slope, ditch]), cat)
    expect(hAt(ponded, 0, -56)).toBeCloseTo(hAt(cut, 0, -56), 6)
  })
  it('a pond levelled from its shore: flat as before, no water above its line, any order, slivers kept (#230 redesign)', () => {
    // on flat ground the same ground as the old rule, which a given level still follows
    const flatOwn = apply(mini([{ id: 'pond', kind: 'water.pond', circle: [[0, 0], 30] }]), cat)
    const flatGiven = apply(mini([{ id: 'pond', kind: 'water.pond', circle: [[0, 0], 30], level: -0.4 }]), cat)
    expect(Array.from(flatOwn.height)).toEqual(Array.from(flatGiven.height))
    const slope = {
      id: 'slope',
      kind: 'relief.ridge',
      line: [
        [-200, 150],
        [200, 150],
      ] as Pt[],
      height: 40,
      width: 600,
    }
    const pond = { id: 'pond', kind: 'water.pond', circle: [[0, -20] as Pt, 30] as [Pt, number] }
    // no water above its line up the slope: every water cell has a corner no higher than the lowest point of the pond's
    // shore (the most its water can reach): a cell at the waterline straddles it, none lies wholly above it
    const bare = apply(mini([slope]), cat)
    let shoreMin = Infinity
    for (let a = 0; a < 360; a += 2) {
      const t = (a * Math.PI) / 180
      shoreMin = Math.min(shoreMin, hAt(bare, 30 * Math.cos(t), -20 + 30 * Math.sin(t)))
    }
    const L = apply(mini([slope, pond]), cat)
    let highest = -Infinity
    for (let j = 0; j < L.nz; j++) {
      for (let i = 0; i < L.nx; i++) {
        if (!L.water[j * L.nx + i]) continue
        const W = L.nx + 1
        const corners = [
          L.height[j * W + i],
          L.height[j * W + i + 1],
          L.height[(j + 1) * W + i],
          L.height[(j + 1) * W + i + 1],
        ]
        highest = Math.max(highest, Math.min(...corners))
      }
    }
    expect(highest).toBeLessThan(shoreMin + 0.05)
    // and it holds water at its low end (shallow: on a slope this steep, about 17 %, a pond with no dam is a wedge)
    expect(Math.max(...L.depth)).toBeGreaterThan(100)
    // a stream through it: the same ground whichever sorts first
    const brook = (id: string) => ({
      id,
      kind: 'water.stream',
      line: [
        [0, 40],
        [0, -150],
      ] as Pt[],
    })
    expect(Array.from(apply(mini([slope, pond, brook('a-brook')]), cat).height)).toEqual(
      Array.from(apply(mini([slope, pond, brook('z-brook')]), cat).height),
    )
    // a pond narrower than a cell keeps its cells
    const sliver = apply(mini([{ id: 'sliver', kind: 'water.pond', ellipse: [[0, 1], 30, 0.8, 0] }]), cat)
    expect(sliver.water.some(v => v > 0)).toBe(true)
    // ground inside the outline that holds no water is never cut: a node whose cells are all dry is the bare ground
    for (let j = 1; j < L.nz; j++) {
      for (let i = 1; i < L.nx; i++) {
        const cells = [
          L.water[(j - 1) * L.nx + i - 1],
          L.water[(j - 1) * L.nx + i],
          L.water[j * L.nx + i - 1],
          L.water[j * L.nx + i],
        ]
        if (cells.every(v => !v)) expect(L.height[j * (L.nx + 1) + i]).toBe(bare.height[j * (L.nx + 1) + i])
      }
    }
    // a finger of the outline narrower than a cell, up the slope, holds no water up there
    const finger = {
      id: 'finger',
      kind: 'water.pond',
      area: [
        [
          [-30, -50],
          [30, -50],
          [30, 10],
          [1.6, 10],
          [1.6, 40],
          [0.4, 40],
          [0.4, 10],
          [-30, 10],
        ],
      ] as Pt[][],
    }
    const F = apply(mini([slope, finger]), cat)
    for (let j = Math.floor((15 - F.z0) / F.cell); j < F.nz; j++) {
      for (let i = 0; i < F.nx; i++) expect(F.water[j * F.nx + i]).toBe(0)
    }
    // the edits count: ground lowered under the level inside the pond (clear of its shore, which sets the level) is
    // its water
    const lower = {
      id: 'lower',
      kind: 'relief.lower',
      area: [
        [
          [-10, -40],
          [10, -40],
          [10, -20],
          [-10, -20],
        ],
      ] as Pt[][],
      height: 6,
      edge: 0,
    }
    const at = (X: Layers, x: number, z: number) =>
      X.water[Math.floor((z - X.z0) / X.cell) * X.nx + Math.floor((x - X.x0) / X.cell)]
    expect(at(L, 0, -25)).toBe(0)
    expect(at(apply(mini([slope, pond, lower]), cat), 0, -25)).toBeGreaterThan(0)
    // a ditch across a flat pond's shore does not pull its level down: the pond keeps its depth
    const ditched = apply(
      mini([
        { id: 'pond', kind: 'water.pond', circle: [[0, 0], 30] },
        {
          id: 'ditch',
          kind: 'relief.ditch',
          line: [
            [-50, 0],
            [-10, 0],
          ],
          depth: 1.6,
          width: 4,
        },
      ]),
      cat,
    )
    expect(at(ditched, 10, 10)).toBeGreaterThan(0)
    expect(
      ditched.depth[Math.floor((10 - ditched.z0) / 2) * ditched.nx + Math.floor((10 - ditched.x0) / 2)],
    ).toBeGreaterThan(1000)
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
