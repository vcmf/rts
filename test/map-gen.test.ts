// The generators (docs/plans/done/m3-generators.md, M3a): seeds, the base ground's noise, meander, clump, expansion
// with origins, the validator's generator checks, and the fast paths' equality with the plain ones.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { hash32, random, seedOf } from '../src/map/seed.ts'
import { fbm, addFbmGrid } from '../src/map/noise.ts'
import { meander } from '../src/map/meander.ts'
import { villageZone } from '../src/map/street-village.ts'
import { clump } from '../src/map/clump.ts'
import { expand } from '../src/map/expand.ts'
import { validate } from '../src/map/validate.ts'
import { apply, nearLine, nearScan } from '../src/map/apply.ts'
import { crossings, inRing, lineCrossing, lineLength, ringCrossing } from '../src/map/geometry.ts'
import { engineMap } from '../maps/engine.ts'
import { distanceTo, distanceToPolygon } from '../src/map/reach.ts'
import { buildSimData } from '../tools/build-sim-data.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { loadSimData, compileRuleset, makeWorld, attachScenario, advanceTick, M_TICK } from '../src/sim/index.ts'
import { m2Valley } from '../src/scenarios/m2-valley.ts'
import { longIt } from './fx.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const mini = (features: MapFile['features'], seed = 7): MapFile => ({
  format: 1,
  id: 'mini',
  name: 'Mini',
  seed,
  season: 'summer',
  extent: { w: 1200, h: 1200 },
  play: { w: 800, h: 800 },
  features,
})
const GUIDE: Pt[] = [
  [-560, 0],
  [0, 40],
  [560, -20],
]
const BROOK = { id: 'brook', kind: 'water.stream', line: GUIDE, width: 6, gen: { meander: { amplitude: 30 } } }
const WOOD = {
  id: 'wood',
  kind: 'veg.wood',
  circle: [[100, -200], 60] as [Pt, number],
  gen: { clump: { coherence: 0.5 } },
}
const gen = (m: MapFile, id: string) => expand(m, cat).map.features.find(f => f.id === id)!

describe('M3a: seeds', () => {
  it('hash32 is stable, and separates its parts', () => {
    expect(hash32(7, 'brook', 'meander')).toBe(hash32(7, 'brook', 'meander'))
    expect(hash32('ab', 'c')).not.toBe(hash32('a', 'bc'))
    expect(seedOf(7, 'brook', 'meander')).not.toBe(seedOf(8, 'brook', 'meander'))
    const r = random(42)
    const xs = [r(), r(), r()]
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
    expect(random(42)()).toBe(xs[0])
  })
  it('a generated feature depends on its own id and the map seed, not on other features or the file order', () => {
    const a = gen(mini([BROOK, WOOD]), 'brook')
    expect(gen(mini([WOOD, BROOK]), 'brook')).toEqual(a) // order
    expect(gen(mini([BROOK, { ...WOOD, circle: [[-300, 300], 90] }]), 'brook')).toEqual(a) // another feature moved
    expect(gen(mini([BROOK, WOOD], 8), 'brook').line).not.toEqual(a.line) // another map seed
    expect(gen(mini([{ ...BROOK, id: 'brook-2' }, WOOD]), 'brook-2').line).not.toEqual(a.line) // another id
  })
})

describe('M3a: meander', () => {
  const line = meander(GUIDE, 6, { amplitude: 30 }, 1234)
  const offGuide = (p: Pt) => nearScan(GUIDE, p[0], p[1]).d
  it('stays near its belt, starts and ends on its guide, never crosses itself, and winds', () => {
    expect(line[0]).toEqual(GUIDE[0])
    expect(line[line.length - 1]).toEqual(GUIDE[GUIDE.length - 1])
    expect(Math.max(...line.map(offGuide))).toBeLessThan(30 * 1.35)
    expect(lineCrossing(line)).toBeNull()
    expect(lineLength(line) / lineLength(GUIDE)).toBeGreaterThan(1.1)
    for (const p of line) for (const v of p) expect(Math.round(v * 100) / 100).toBe(v)
  })
  it('is the same line for the same seed, another for another', () => {
    expect(meander(GUIDE, 6, { amplitude: 30 }, 1234)).toEqual(line)
    expect(meander(GUIDE, 6, { amplitude: 30 }, 1235)).not.toEqual(line)
  })
  it('on a straight guide it never crosses itself nor throws, whatever the seed (review round 1)', () => {
    const straight: Pt[] = [
      [-1100, 0],
      [1100, 0],
    ]
    for (const bend of [0.5, 1.2, 1.45]) {
      for (const amplitude of [6, 30]) {
        for (let seed = 0; seed < 40; seed++) {
          const l = meander(straight, 6, { amplitude, bend }, seed)
          expect(lineCrossing(l)).toBeNull()
          expect(Math.max(...l.map(q => Math.abs(q[1])))).toBeLessThan(amplitude * 1.35 + 6)
        }
      }
    }
  })
  it('a guide turning 90° keeps the line clean; a sharper turn and a belt narrower than the stream are refused (review round 1)', () => {
    const turn: Pt[] = [
      [-1000, 0],
      [0, 0],
      [0, 1000],
    ]
    for (let seed = 0; seed < 40; seed++) expect(lineCrossing(meander(turn, 6, { amplitude: 60 }, seed))).toBeNull()
    expect(() =>
      meander(
        [
          [-1000, 0],
          [0, 0],
          [-500, 300],
        ],
        6,
        { amplitude: 30 },
        1,
      ),
    ).toThrow(/90°/)
    expect(() => meander(GUIDE, 30, { amplitude: 10 }, 1)).toThrow(/at least the stream's width/)
    const { issues } = expand(mini([{ ...BROOK, width: 30, gen: { meander: { amplitude: 10 } } }]), cat)
    expect(issues[0]).toMatchObject({ id: 'brook', path: 'features[0].gen.meander' })
  })
  it('a turn too tight for the belt is refused, whatever the seed; turns the guide may take never fold (review round 2)', () => {
    expect(() =>
      meander(
        [
          [0, 0],
          [1000, 0],
          [1000, 20],
          [1000, 1000],
        ],
        20,
        { amplitude: 200 },
        1,
      ),
    ).toThrow(/too short for its turn/)
    const r = random(21)
    for (let n = 0; n < 30; n++) {
      // a random guide of four points, each turn at most 80°, its segments long enough for the belt
      const amp = 20 + r() * 60
      const pts: Pt[] = [[-900, 0]]
      let ang = 0
      for (let k = 0; k < 3; k++) {
        ang += (r() - 0.5) * 2.8
        const L = 300 + r() * 300
        const [x, z] = pts[pts.length - 1]
        pts.push([Math.round(x + L * Math.cos(ang)), Math.round(z + L * Math.sin(ang))])
      }
      let line: Pt[] | null = null
      try {
        line = meander(pts, 6, { amplitude: amp }, n)
      } catch {
        continue
      } // refused: the turn or the segments
      expect(lineCrossing(line)).toBeNull()
    }
  })
  it('a smaller bend winds less', () => {
    const tight = lineLength(meander(GUIDE, 6, { amplitude: 30, bend: 1.6 }, 9))
    const gentle = lineLength(meander(GUIDE, 6, { amplitude: 30, bend: 0.5 }, 9))
    expect(gentle).toBeLessThan(tight)
  })
})

describe('M3a: clump', () => {
  it('a simple polygon whose radius stays within its bounds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ring = clump([0, 0], 60, 60, 0, { coherence: 0.2, raggedness: 1 }, seed)
      expect(ringCrossing(ring)).toBeNull()
      for (const [x, z] of ring) {
        const r = Math.hypot(x, z)
        expect(r).toBeGreaterThan(0.4 * 60 - 0.01)
        expect(r).toBeLessThan(1.7 * 60)
      }
    }
  })
  it('coherence 1 is the circle, to 1 cm', () => {
    for (const [x, z] of clump([10, 20], 50, 50, 0, { coherence: 1 }, 99)) {
      expect(Math.abs(Math.hypot(x - 10, z - 20) - 50)).toBeLessThan(0.015)
    }
  })
})

describe('M3a: the base ground', () => {
  it('stays within ± its height, and is flat with none', () => {
    const L = apply(mini([{ id: 'terrain', kind: 'relief.base', height: 4, width: 300 }]), cat)
    let lo = Infinity
    let hi = -Infinity
    for (const h of L.height) {
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    expect(lo).toBeGreaterThanOrEqual(-4)
    expect(hi).toBeLessThanOrEqual(4)
    expect(hi - lo).toBeGreaterThan(2)
    expect(apply(mini([{ id: 'terrain', kind: 'relief.base' }]), cat).height.every(h => h === 0)).toBe(true)
  })
  it('no node reads past its lattice table, and a noise finer than the grid takes the per-node path (review round 1)', () => {
    for (const [w, scale] of [
      [196, 49],
      [206, 103],
      [400, 0.5],
    ] as const) {
      const n = w / 2
      const out = new Float64Array((n + 1) * (n + 1))
      addFbmGrid(out, 5, -w / 2, -w / 2, n, n, 2, scale, 1)
      expect(out.every(v => Number.isFinite(v))).toBe(true)
      for (const [i, j] of [
        [0, 0],
        [n, n],
        [n, 0],
        [7, 3],
      ]) {
        expect(out[j * (n + 1) + i]).toBe(fbm(5, (-w / 2 + i * 2) / scale, (-w / 2 + j * 2) / scale))
      }
    }
  })
  it('the grid fill gives fbm to the bit', () => {
    const out = new Float64Array(11 * 11)
    addFbmGrid(out, 77, -100, -60, 10, 10, 2, 300, 1)
    for (let j = 0; j <= 10; j++) {
      for (let i = 0; i <= 10; i++) expect(out[j * 11 + i]).toBe(fbm(77, (-100 + i * 2) / 300, (-60 + j * 2) / 300))
    }
  })
})

describe('M3a: the line index answers as the scan', () => {
  it('on a meandered brook, at points near and far, inside and outside its box', () => {
    const line = meander(
      [
        [-1000, 0],
        [1000, 30],
      ],
      6,
      { amplitude: 40 },
      5,
    )
    const r = random(3)
    for (let k = 0; k < 4000; k++) {
      const x = -1300 + r() * 2600
      const z = k % 2 ? -60 + r() * 120 : -600 + r() * 1200
      expect(nearLine(line, x, z)).toEqual(nearScan(line, x, z))
    }
  })
})

describe('M8b: a search cut off at a distance', () => {
  it('gives the full answer within it, and an answer beyond it farther, on both searches', () => {
    const line = meander(
      [
        [-1000, 0],
        [1000, 30],
      ],
      6,
      { amplitude: 40 },
      5,
    )
    const short = line.slice(0, 12) // the scan's path (24 points or fewer)
    const r = random(7)
    for (const l of [line, short]) {
      for (let k = 0; k < 3000; k++) {
        const x = -1300 + r() * 2600
        const z = -400 + r() * 800
        const maxD = [3, 20, 150][k % 3]
        const full = nearScan(l, x, z)
        const cut = nearLine(l, x, z, maxD)
        if (full.d <= maxD) expect(cut).toEqual(full)
        else expect(cut.d).toBeGreaterThan(maxD)
      }
    }
  })
})

describe('M3a: crossings (review rounds 1, 2)', () => {
  it('a road vertex exactly on a river segment, in decimal centimetres: a touch is 0, a pass is 1 (2000 cases each)', () => {
    const r = random(11)
    const cmv = (v: number) => Math.round(v) / 100
    const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : Math.abs(x))
    for (let n = 0; n < 2000; n++) {
      // a river segment in whole centimetres, and a point exactly on it (a lattice step along it)
      const rx = Math.floor(r() * 20000) - 10000
      const rz = Math.floor(r() * 20000) - 10000
      const dx = Math.floor(r() * 4000) + 1
      const dz = Math.floor(r() * 4000) - 2000
      const g = gcd(dx, dz)
      const sx = dx / g
      const sz = dz / g
      const k = 1 + Math.floor(r() * (g - 1 || 1))
      const river: Pt[] = [
        [cmv(rx - 3 * dx), cmv(rz - 3 * dz)],
        [cmv(rx), cmv(rz)],
        [cmv(rx + dx), cmv(rz + dz)],
        [cmv(rx + 4 * dx), cmv(rz + 4 * dz)],
      ]
      const m: Pt = [cmv(rx + k * sx), cmv(rz + k * sz)]
      const nx = -dz
      const nz = dx // the river's left
      const off = (sideSign: number, along: number): Pt => [
        cmv(rx + k * sx + sideSign * nx * 0.7 + along * dx * 0.3),
        cmv(rz + k * sz + sideSign * nz * 0.7 + along * dz * 0.3),
      ]
      // in from the right, back to the right: a touch
      expect(crossings([off(-1, -1), m, off(-1, 1)], river)).toHaveLength(0)
      // right to left through the point: a crossing
      expect(crossings([off(-1, -1), m, off(1, 1)], river)).toHaveLength(1)
    }
  })
  it("both lines through one vertex, the road passing from inside the river's bend to outside: one crossing", () => {
    expect(
      crossings(
        [
          [0.2, -2],
          [0, 0],
          [-1, -0.5],
        ],
        [
          [-1, -1],
          [0, 0],
          [1, -1],
        ],
      ),
    ).toHaveLength(1)
  })
  it('a road that only ends on the bank does not cross it', () => {
    expect(
      crossings(
        [
          [0, -50],
          [0, 0],
        ],
        [
          [-100, 0],
          [100, 0],
        ],
      ),
    ).toHaveLength(0)
    expect(
      crossings(
        [
          [0, 0],
          [0, -50],
        ],
        [
          [-100, 0],
          [100, 0],
        ],
      ),
    ).toHaveLength(0)
  })
  it('a crossing through a vertex counts once; a touch at a vertex is none; a plain crossing is one', () => {
    const water: Pt[] = [
      [-100, 0],
      [0, 0],
      [100, 0],
    ]
    expect(
      crossings(
        [
          [0, -50],
          [0, 50],
        ],
        water,
      ),
    ).toHaveLength(1) // through the water's vertex
    expect(
      crossings(
        [
          [-30, -50],
          [0, 0],
          [30, 50],
        ],
        water,
      ),
    ).toHaveLength(1) // the road's vertex on the water, passing over
    expect(
      crossings(
        [
          [-30, -50],
          [0, 0],
          [30, -50],
        ],
        water,
      ),
    ).toHaveLength(0) // a V that only touches
    expect(
      crossings(
        [
          [50, -50],
          [50, 50],
        ],
        water,
      ),
    ).toHaveLength(1)
  })
})

describe('M3a: the validator and expansion', () => {
  const issuesOf = (m: MapFile) => validate(m, cat).map(i => `${i.id} ${i.path}: ${i.message}`)
  it('bad generator parameters, a wrong input shape and an output the kind does not take are reported', () => {
    expect(issuesOf(mini([{ ...BROOK, gen: { meander: { amplitude: 30, wiggle: 2 } } }]))).toContainEqual(
      expect.stringMatching(/^brook features\[0\]\.gen\.meander\.wiggle: unknown parameter/),
    )
    expect(issuesOf(mini([{ ...BROOK, gen: { meander: { amplitude: 0 } } }]))).toContainEqual(
      expect.stringMatching(/^brook features\[0\]\.gen\.meander\.amplitude: must be at least 1/),
    )
    expect(issuesOf(mini([{ ...BROOK, gen: { meander: {} } }]))).toContainEqual(
      expect.stringMatching(/^brook features\[0\]\.gen\.meander\.amplitude: is required/),
    )
    expect(
      issuesOf(
        mini([
          {
            ...WOOD,
            circle: undefined,
            line: [
              [0, 0],
              [10, 0],
            ],
          },
        ]),
      ),
    ).toContainEqual(
      expect.stringMatching(/^wood features\[0\]\.line: the clump generator reads point, circle, ellipse/),
    )
    expect(issuesOf(mini([{ id: 'road', kind: 'way.road', point: [0, 0], gen: { clump: {} } }]))).toContainEqual(
      expect.stringMatching(
        /^road features\[0\]\.gen: the clump generator writes a area, which way\.road does not take/,
      ),
    )
    expect(issuesOf(mini([BROOK, WOOD]))).toEqual([])
    // round 2: a generator on a kind that may take no shape still needs its input; meander runs on streams and rivers
    expect(issuesOf(mini([{ id: 'g', kind: 'relief.base', gen: { clump: {} } }]))).toContainEqual(
      expect.stringMatching(/^g features\[0\]: needs a shape for its clump generator/),
    )
    expect(
      issuesOf(
        mini([
          {
            id: 'h',
            kind: 'barrier.hedge',
            line: [
              [0, 0],
              [100, 0],
            ],
            gen: { meander: { amplitude: 10 } },
          },
        ]),
      ),
    ).toContainEqual(
      expect.stringMatching(/^h features\[0\]\.gen: the meander generator runs on water\.stream, water\.river/),
    )
    expect(expand(mini([{ ...WOOD, gen: { clump: { radius: 200 } } }]), cat).issues[0]).toMatchObject({
      id: 'wood',
      path: 'features[0].gen.clump',
    })
  })
  it('a generated feature takes its output shape, records its origin, and the expanded map validates', () => {
    const m = mini([BROOK, WOOD])
    const { map, issues } = expand(m, cat)
    expect(issues).toEqual([])
    const w = map.features.find(f => f.id === 'wood')!
    expect([w.gen, w.circle, Array.isArray(w.area)]).toEqual([undefined, undefined, true])
    expect(w.origin).toEqual({ generator: 'clump', params: { coherence: 0.5 }, version: 3 })
    expect(validate(map, cat)).toEqual([])
    // pinned: the expanded feature written back into a map is just a feature
    expect(issuesOf(mini([BROOK, w]))).toEqual([])
  })
  it('a bridge whose road crosses its meandered water twice must say near', () => {
    const road = {
      id: 'road',
      kind: 'way.road.lane',
      line: [
        [-400, 60],
        [-400, -60],
        [-200, -60],
        [-200, 60],
      ] as Pt[],
    } // down over the brook and back up
    const m = mini([
      {
        ...BROOK,
        line: [
          [-560, 0],
          [560, 0],
        ] as Pt[],
        gen: { meander: { amplitude: 6, bend: 0.3 } },
      },
      road,
      { id: 'bridge', kind: 'built.bridge', carries: 'road', crosses: 'brook' },
    ])
    const { issues } = expand(m, cat)
    // its index in the file the author wrote
    expect(issues.map(i => `${i.id} ${i.path}`)).toContain('bridge features[2].near')
    const near = clone(m)
    near.features[2].near = [-300, 0]
    expect(expand(near, cat).issues).toEqual([])
  })
})

// ---------------------------------------------------------------- M3b: children, street-village, scatter, five seeds
describe('M3b: street-village', () => {
  const road = {
    id: 'road',
    kind: 'way.road.lane',
    line: [
      [0, -500],
      [0, 500],
    ] as Pt[],
    width: 6,
  }
  const brook = {
    id: 'brook',
    kind: 'water.stream',
    line: [
      [-560, 100],
      [560, 100],
    ] as Pt[],
    width: 6,
  }
  const village = (houses: number, from = 300, to = 520, gen: Record<string, unknown> = {}) => ({
    id: 'village',
    kind: 'built.village',
    along: { id: 'road', from, to },
    houses,
    gen: { 'street-village': gen },
  })
  it('houses on both sides of the road, within the stretch, facing it, clear of each other, the road and the water', () => {
    const { map, issues } = expand(mini([road, brook, village(10)]), cat)
    expect(issues).toEqual([])
    const houses = map.features.filter(f => f.origin?.parent === 'village')
    expect(houses).toHaveLength(10)
    expect(houses.map(h => h.id).sort()).toEqual([...Array(10).keys()].map(k => `village-${k + 1}`).sort())
    const sides = new Set(houses.map(h => Math.sign(h.area![0][0][0])))
    expect(sides).toEqual(new Set([-1, 1]))
    for (const h of houses) {
      const ring = h.area![0]
      for (const [x, z] of ring) {
        expect(Math.abs(x)).toBeGreaterThanOrEqual(3 + 3 - 0.01)
        expect(z).toBeGreaterThanOrEqual(-500 + 300 - 1)
        expect(z).toBeLessThanOrEqual(-500 + 520 + 1)
      }
      // facing the road: two of its edges run along it (constant x on this straight road)
      expect(Math.abs(ring[0][0] - ring[1][0])).toBeLessThan(0.02)
      for (const [, z] of ring) expect(Math.abs(z - 100)).toBeGreaterThan(3) // clear of the brook
      for (const o of houses) if (o !== h) expect(o.area![0].some(p => inRing(ring, p))).toBe(false)
    }
    // the village's ground is the hull of its houses
    const v = map.features.find(f => f.id === 'village')!
    for (const h of houses) for (const p of h.area![0]) expect(inRing(v.area![0], p)).toBe(true)
  })
  it('fewer houses than asked is an error naming the feature; min allows fewer', () => {
    const tight = expand(mini([road, village(30, 300, 360)]), cat)
    expect(tight.issues[0]).toMatchObject({ id: 'village', path: 'features[1].gen.street-village' })
    expect(tight.issues[0].message).toMatch(/placed \d+ of 30 houses/)
    expect(expand(mini([road, village(30, 300, 360, { min: 2 })]), cat).issues).toEqual([])
  })
})

describe('M3b: scatter', () => {
  const region = [
    [
      [-500, -500],
      [500, -500],
      [500, 500],
      [-500, 500],
    ],
  ] as Pt[][]
  const road = {
    id: 'road',
    kind: 'way.road.lane',
    line: [
      [0, -560],
      [0, 560],
    ] as Pt[],
    width: 6,
  }
  const pond = { id: 'pond', kind: 'water.pond', circle: [[-250, 250], 60] as [Pt, number] }
  const copses = (p: Record<string, unknown>) => ({
    id: 'copses',
    kind: 'veg.wood.broad',
    density: 0.7,
    area: region,
    gen: { scatter: { count: 8, radiusMin: 20, radiusMax: 40, avoid: ['water', 'way'], clearance: 20, ...p } },
  })
  it('children inside the region, clear of what they avoid and of each other; the region itself leaves the map', () => {
    const { map, issues } = expand(mini([road, pond, copses({})]), cat)
    expect(issues).toEqual([])
    expect(map.features.some(f => f.id === 'copses')).toBe(false)
    const kids = map.features.filter(f => f.origin?.parent === 'copses')
    expect(kids).toHaveLength(8)
    for (const k of kids) {
      expect(k.kind).toBe('veg.wood.broad')
      expect(k.density).toBe(0.7)
      expect(k.gen).toBeUndefined()
      for (const [x, z] of k.area![0]) {
        expect(Math.abs(x)).toBeLessThan(500)
        expect(Math.abs(z)).toBeLessThan(500)
        expect(Math.abs(x) - 3).toBeGreaterThanOrEqual(20 - 0.02) // the road's edge
        expect(Math.hypot(x + 250, z - 250) - 60).toBeGreaterThanOrEqual(20 - 0.02) // the pond's
      }
      for (const o of kids) if (o !== k) expect(o.area![0].some(p => inRing(k.area![0], p))).toBe(false)
    }
  })
  it('within keeps every child within reach of what it names', () => {
    const { map } = expand(mini([road, pond, copses({ count: 4, within: ['pond'], reach: 150 })]), cat)
    for (const k of map.features.filter(f => f.origin?.parent === 'copses')) {
      const [cx, cz] = k.area![0].reduce(
        ([a, b], [x, z]) => [a + x / k.area![0].length, b + z / k.area![0].length],
        [0, 0],
      )
      expect(Math.hypot(cx + 250, cz - 250) - 60).toBeLessThan(150 + 1)
    }
  })
  it('an impossible scatter is an error naming the feature; min lowers the bar; a name that is nothing is refused', () => {
    const impossible = expand(mini([road, pond, copses({ count: 200, radiusMin: 80, radiusMax: 90 })]), cat)
    expect(impossible.issues[0]).toMatchObject({ id: 'copses', path: 'features[2].gen.scatter' })
    expect(
      expand(mini([road, pond, copses({ count: 200, radiusMin: 80, radiusMax: 90, min: 1 })]), cat).issues,
    ).toEqual([])
    expect(validate(mini([road, pond, copses({ avoid: ['lava'] })]), cat).map(i => i.path)).toContain(
      'features[2].gen.scatter.avoid[0]',
    )
  })
  it('children are local: moving a feature they do not avoid leaves them; moving one they avoid may not', () => {
    const base = [
      road,
      pond,
      copses({}),
      { id: 'rough', kind: 'ground.rough', circle: [[300, -300], 50] as [Pt, number] },
    ]
    const kids = (fs: MapFile['features']) =>
      expand(mini(fs), cat).map.features.filter(f => f.origin?.parent === 'copses')
    const moved = clone(base)
    ;(moved[3] as { circle: [Pt, number] }).circle = [[-300, 300], 50]
    expect(kids(moved)).toEqual(kids(base))
  })
})

const REGION = [
  [
    [-500, -500],
    [500, -500],
    [500, 500],
    [-500, 500],
  ],
] as Pt[][]
const kidsOf = (m: MapFile, parent: string) => m.features.filter(f => f.origin?.parent === parent)
const apart = (as: MapFile['features'], bs: MapFile['features']) =>
  as.every(a =>
    bs.every(
      b => a === b || (!a.area![0].some(p => inRing(b.area![0], p)) && !b.area![0].some(p => inRing(a.area![0], p))),
    ),
  )
const sc = (id: string, kind: string, p: Record<string, unknown>) => ({
  id,
  kind,
  area: REGION,
  gen: { scatter: { count: 3, radiusMin: 20, radiusMax: 30, clearance: 5, ...p } },
})
const ROAD = {
  id: 'road',
  kind: 'way.road.lane',
  line: [
    [-400, 0],
    [400, 0],
  ] as Pt[],
}
const VILLAGE = {
  id: 'village',
  kind: 'built.village',
  along: { id: 'road', from: 300, to: 500 },
  houses: 6,
  gen: { 'street-village': { min: 1 } },
}

describe('M3b: houses (review rounds)', () => {
  const road = {
    id: 'road',
    kind: 'way.road.lane',
    line: [
      [0, -560],
      [0, 560],
    ] as Pt[],
    width: 6,
  }
  const village = {
    id: 'village',
    kind: 'built.village',
    along: { id: 'road', from: 400, to: 720 },
    houses: 12,
    gen: { 'street-village': { min: 1 } },
  }
  it('no house straddles a stream crossing its road (the house tested as a polygon, not by its corners)', () => {
    const brook = {
      id: 'brook',
      kind: 'water.stream',
      line: [
        [-560, 0],
        [560, 0],
      ] as Pt[],
      width: 6,
    }
    for (let seed = 1; seed <= 20; seed++) {
      const { map, issues } = expand(mini([road, brook, village], seed), cat)
      expect(issues).toEqual([])
      const houses = kidsOf(map, 'village')
      expect(houses).toHaveLength(12)
      for (const h of houses) {
        const zs = h.area![0].map(p => p[1])
        expect(Math.min(...zs) > 5 || Math.max(...zs) < -5).toBe(true)
      }
    }
  })
  it('a village at a crossroads keeps its houses off the other road', () => {
    const lane = {
      id: 'lane',
      kind: 'way.track',
      line: [
        [0, -400],
        [0, 400],
      ] as Pt[],
      width: 3,
    }
    const v = { ...VILLAGE, along: { id: 'road', from: 300, to: 520 }, houses: 10 }
    for (let seed = 1; seed <= 30; seed++) {
      const { map, issues } = expand(mini([ROAD, lane, v], seed), cat)
      expect(issues).toEqual([])
      expect(kidsOf(map, 'village')).toHaveLength(10)
      for (const h of kidsOf(map, 'village')) expect(h.area![0].every(([x]) => Math.abs(x) > 1.5 + 1)).toBe(true)
    }
  })
  it('houses avoid a building of any shape and no-go zones; min 0 with no room gives an empty village', () => {
    const hut = { id: 'hut', kind: 'built.house', circle: [[8, -100], 6] as [Pt, number] }
    for (const h of kidsOf(
      expand(mini([road, hut, { ...village, along: { id: 'road', from: 420, to: 500 } }]), cat).map,
      'village',
    )) {
      expect(h.area![0].every(([x, z]) => Math.hypot(x - 8, z + 100) > 6)).toBe(true)
    }
    const nogo = {
      id: 'keep-out',
      kind: 'zone.nogo',
      area: [
        [
          [-200, 2],
          [200, 2],
          [200, 40],
          [-200, 40],
        ],
      ] as Pt[][],
    }
    const near = expand(mini([ROAD, nogo, { ...VILLAGE, along: { id: 'road', from: 300, to: 500 } }]), cat)
    expect(near.issues).toEqual([])
    for (const h of kidsOf(near.map, 'village')) {
      expect(h.area![0].every(([x, z]) => !(Math.abs(x) <= 200 && z >= 2 && z <= 40))).toBe(true)
    }
    const pond = {
      id: 'pond',
      kind: 'water.lake',
      area: [
        [
          [-200, -200],
          [200, -200],
          [200, 200],
          [-200, 200],
        ],
      ] as Pt[][],
    }
    const empty = expand(
      mini([
        road,
        pond,
        { ...village, along: { id: 'road', from: 400, to: 700 }, gen: { 'street-village': { min: 0 } } },
      ]),
      cat,
    )
    expect(empty.issues).toEqual([])
    expect(empty.map.features.find(f => f.id === 'village')!.area).toBeUndefined()
  })
  it("a house inside an area's hole is outside the area", () => {
    const lake = {
      id: 'lake',
      kind: 'water.lake',
      area: [
        [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
        ],
        [
          [-40, -40],
          [40, -40],
          [40, 40],
          [-40, 40],
        ],
      ] as Pt[][],
    }
    expect(
      distanceToPolygon(lake, {}, [
        [-5, -5],
        [5, -5],
        [5, 5],
        [-5, 5],
      ]),
    ).toBeCloseTo(35, 9)
    expect(
      distanceToPolygon(lake, {}, [
        [60, -5],
        [70, -5],
        [70, 5],
        [60, 5],
      ]),
    ).toBe(0)
  })
})

describe('M3b: the chain (decision 0028): each generator after what it reads; a cycle is an error', () => {
  it("the file's order never matters", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'maps/generated.map.json'), 'utf8')) as MapFile
    expect(expand({ ...raw, features: [...raw.features].reverse() }, cat).map).toEqual(expand(raw, cat).map)
  })
  it("a village waits for a scatter of ponds and keeps clear of the ponds, never of the scatter's region", () => {
    const ponds = sc('ponds', 'water.pond', { count: 4, radiusMin: 15, radiusMax: 25, avoid: ['way'], clearance: 20 })
    for (const fs of [
      [ROAD, { ...VILLAGE, houses: 10, along: { id: 'road', from: 300, to: 520 } }, ponds],
      [ponds, ROAD, { ...VILLAGE, houses: 10, along: { id: 'road', from: 300, to: 520 } }],
    ]) {
      const { map, issues } = expand(mini(fs as MapFile['features']), cat)
      expect(issues).toEqual([])
      expect(kidsOf(map, 'village')).toHaveLength(10)
      expect(kidsOf(map, 'ponds')).toHaveLength(4)
      for (const h of kidsOf(map, 'village')) {
        for (const p of kidsOf(map, 'ponds')) expect(distanceToPolygon(p, {}, h.area![0])).toBeGreaterThan(2)
      }
    }
  })
  it("a scatter avoiding another's kind, or naming one of its children, waits for it whatever the ids", () => {
    for (const [w, fi] of [
      ['a-woods', 'b-fields'],
      ['b-woods', 'a-fields'],
    ]) {
      const { map, issues } = expand(
        mini([
          sc(w, 'veg.wood', { count: 5, radiusMin: 30, radiusMax: 50 }),
          sc(fi, 'ground.field', { count: 5, avoid: ['veg'], clearance: 10 }),
        ]),
        cat,
      )
      expect(issues).toEqual([])
      expect(apart(kidsOf(map, fi), kidsOf(map, w))).toBe(true)
    }
    const woods = sc('woods', 'veg.wood', { count: 4, radiusMin: 30, radiusMax: 40 })
    const named = expand(mini([woods, sc('aaa', 'ground.field', { count: 4, avoid: ['woods-1'], clearance: 30 })]), cat)
    expect(named.issues).toEqual([])
    expect(apart(kidsOf(named.map, 'aaa'), [named.map.features.find(f => f.id === 'woods-1')!])).toBe(true)
    expect(expand(mini([woods, sc('aaa', 'ground.field', { within: ['woods-1'], reach: 200 })]), cat).issues).toEqual(
      [],
    )
  })
  it('generators that read each other are a cycle: an error on each member naming the others and how to break it', () => {
    const two = expand(
      mini([sc('woods', 'veg.wood', { avoid: ['ground.field'] }), sc('fields', 'ground.field', { avoid: ['veg'] })]),
      cat,
    )
    expect(two.issues.map(i => i.id).sort()).toEqual(['fields', 'woods'])
    expect(two.issues.find(i => i.id === 'woods')!.message).toMatch(
      /reads "fields" \(by 'ground\.field'\).*must form a chain.*one scatter's mix/,
    )
    const ring = expand(
      mini([
        sc('aa', 'veg.wood', { avoid: ['ground'] }),
        sc('bb', 'ground.field', { avoid: ['water'] }),
        sc('cc', 'water.pond', { avoid: ['veg'] }),
      ]),
      cat,
    )
    expect(ring.issues.map(i => i.id).sort()).toEqual(['aa', 'bb', 'cc'])
    const mutual = expand(mini([ROAD, VILLAGE, sc('ponds', 'water.pond', { avoid: ['built'] })]), cat)
    expect(mutual.issues.map(i => i.id).sort()).toEqual(['ponds', 'village'])
    expect(mutual.issues[0].message).toMatch(/Drop one side's read/)
    expect(mutual.issues[0].message).not.toMatch(/mix/) // a village cannot join a mix
  })
  it("a mix scatter's own kind is never on the map, so it is not read", () => {
    const g2 = {
      id: 'g2',
      kind: 'veg.wood.broad',
      area: REGION,
      gen: {
        scatter: {
          mix: [{ kind: 'ground.field.wheat', count: 3, radiusMin: 20, radiusMax: 30 }],
          avoid: ['water'],
          clearance: 10,
        },
      },
    }
    expect(expand(mini([g2, sc('h', 'water.pond', { avoid: ['veg'] })]), cat).issues).toEqual([])
  })
  it('street villages are peers: neither reads the other; their reaches must lie apart, whatever the seeds', () => {
    const va = { ...VILLAGE, id: 'va', along: { id: 'road', from: 50, to: 250 } }
    const vb = { ...VILLAGE, id: 'vb', along: { id: 'road', from: 500, to: 700 } }
    for (let seed = 1; seed <= 5; seed++) {
      const { map, issues } = expand(mini([ROAD, va, vb], seed), cat)
      expect(issues).toEqual([])
      expect(kidsOf(map, 'va')).toHaveLength(6)
      expect(kidsOf(map, 'vb')).toHaveLength(6)
      // pinning one (its expanded form and its houses) leaves the other as it was
      const pinned = map.features.filter(f => f.id === 'va' || f.origin?.parent === 'va')
      const again = expand(mini([ROAD, ...pinned, vb], seed), cat)
      expect(again.issues).toEqual([])
      expect(kidsOf(again.map, 'vb')).toEqual(kidsOf(map, 'vb'))
    }
    // too close is an error on both, before anything runs, so on every seed alike
    for (let seed = 1; seed <= 10; seed++) {
      const close = expand(mini([ROAD, va, { ...vb, along: { id: 'road', from: 260, to: 400 } }], seed), cat)
      expect(close.issues.map(i => i.id)).toEqual(['va', 'vb'])
      expect(close.issues[0].message).toMatch(
        /could come within 1 m of "vb" \(their zones meet\): street-village generators do not see each other.*move their stretches apart/,
      )
    }
    // a village's own area counts: another village's reach must keep off it
    const walled = {
      ...va,
      area: [
        [
          [-60, -20],
          [60, -20],
          [60, 20],
          [-60, 20],
        ],
      ] as Pt[][],
      along: { id: 'road', from: 0, to: 100 },
    }
    expect(
      expand(mini([ROAD, walled, { ...vb, along: { id: 'road', from: 300, to: 400 } }]), cat).issues.map(i => i.id),
    ).toEqual(['va', 'vb'])
  })
  it("a village's zone holds every house and its whole ground (edges too), on bends too", () => {
    const bent = {
      id: 'road',
      kind: 'way.road.lane',
      line: [
        [-300, -400],
        [0, 0],
        [300, -400],
      ] as Pt[],
    }
    for (const [from, to, houses] of [
      [200, 500, 20],
      [280, 450, 40],
      [380, 620, 60],
    ]) {
      for (let seed = 1; seed <= 5; seed++) {
        const { map, issues } = expand(
          mini(
            [bent, { ...VILLAGE, houses, along: { id: 'road', from, to }, gen: { 'street-village': { min: 1 } } }],
            seed,
          ),
          cat,
        )
        expect(issues).toEqual([])
        const zone = villageZone(bent.line, 5, from, to)
        const ring = [...zone.hull, zone.hull[0]]
        const outBy = (x: number, z: number) => (inRing(zone.hull, [x, z]) ? 0 : nearLine(ring, x, z).d)
        for (const f of map.features.filter(g => g.id === 'village' || g.origin?.parent === 'village')) {
          const r = f.area![0]
          for (let k = 0; k < r.length; k++) {
            for (let t = 0; t <= 1; t += 0.05) {
              const [ax, az] = r[k]
              const [bx, bz] = r[(k + 1) % r.length]
              expect(outBy(ax + t * (bx - ax), az + t * (bz - az))).toBeLessThanOrEqual(zone.reach)
            }
          }
        }
      }
    }
  })
  it('a village inside the bend of another is an error on both, whatever their ids', () => {
    const bent = {
      id: 'road',
      kind: 'way.road.lane',
      line: [
        [-300, -400],
        [0, 0],
        [300, -400],
      ] as Pt[],
    }
    const lane = {
      id: 'lane',
      kind: 'way.track',
      line: [
        [-30, -90],
        [30, -90],
      ] as Pt[],
    }
    const big = {
      ...VILLAGE,
      houses: 60,
      along: { id: 'road', from: 380, to: 620 },
      gen: { 'street-village': { min: 1 } },
    }
    for (const id of ['a-vil', 'z-vil']) {
      const out = expand(
        mini([
          bent,
          lane,
          big,
          { ...VILLAGE, id, houses: 2, along: { id: 'lane', from: 20, to: 40 }, gen: { 'street-village': { min: 0 } } },
        ]),
        cat,
      )
      expect(out.issues.map(i => i.id).sort()).toEqual([id, 'village'].sort())
      expect(out.issues[0].message).toMatch(/\((their zones meet|\d+\.\d m between their zones)\)/)
      // with its own area, its ground is that area:
      // its houses reach only the stretch, so the inside of the bend is free
      const walled = {
        ...big,
        area: [
          [
            [-80, -60],
            [80, -60],
            [80, -20],
            [-80, -20],
          ],
        ] as Pt[][],
      }
      expect(
        expand(
          mini([
            bent,
            lane,
            walled,
            {
              ...VILLAGE,
              id,
              houses: 2,
              along: { id: 'lane', from: 20, to: 40 },
              gen: { 'street-village': { min: 0 } },
            },
          ]),
          cat,
        ).issues,
      ).toEqual([])
    }
  })
  it('a generator reading a cycle or a failed generator is skipped: only the first errors are reported', () => {
    const cyc = expand(
      mini([
        sc('aa', 'veg.wood', { avoid: ['bb'] }),
        sc('bb', 'ground.field', { avoid: ['aa'] }),
        sc('cc', 'water.pond', { within: ['aa'] }),
      ]),
      cat,
    )
    expect(cyc.issues.map(i => i.id).sort()).toEqual(['aa', 'bb'])
    const village = { ...VILLAGE, along: { id: 'road', from: 300, to: 320 }, houses: 30, gen: { 'street-village': {} } }
    expect(
      expand(mini([ROAD, village, sc('woods', 'veg.wood', { within: ['village'] })]), cat).issues.map(i => i.id),
    ).toEqual(['village'])
  })
  it('names: a typo for a child is caught; a scatter that placed nothing is finished; a pinned scatter is still named by its id', () => {
    expect(
      expand(mini([sc('aa', 'veg.wood', { avoid: ['bb-5'] }), sc('bb', 'ground.field', { count: 3 })]), cat).issues.map(
        i => i.message,
      ),
    ).toContainEqual(expect.stringMatching(/"bb-5" names nothing/))
    expect(
      expand(
        mini([
          sc('zero', 'veg.wood', { radiusMin: 400, radiusMax: 450, min: 0 }),
          sc('cc', 'ground.field', { avoid: ['zero'] }),
        ]),
        cat,
      ).issues,
    ).toEqual([])
    const woods = sc('woods', 'veg.wood', { count: 2, radiusMin: 30, radiusMax: 40 })
    const pinned = kidsOf(expand(mini([woods]), cat).map, 'woods')
    const m = mini([...pinned, sc('fields', 'ground.field', { count: 2, avoid: ['woods'], clearance: 10 })])
    expect(validate(m, cat)).toEqual([])
    const out = expand(m, cat)
    expect(out.issues).toEqual([])
    expect(apart(kidsOf(out.map, 'fields'), pinned)).toBe(true)
    expect(validate(mini([woods, pinned[0]]), cat).map(i => i.message)).toContainEqual(
      expect.stringMatching(/remove "woods" itself \(its region leaves the map\)/),
    )
  })
  it('a within matching only shapeless features is "nothing matches"; an id equal to a category is refused', () => {
    expect(
      expand(mini([{ id: 'terrain', kind: 'relief.base' }, sc('w', 'veg.wood', { within: ['terrain'] })]), cat)
        .issues[0]?.message,
    ).toMatch(/nothing matches within/)
    expect(
      validate(mini([{ id: 'water', kind: 'veg.wood', circle: [[0, 0], 20] as [Pt, number] }]), cat).map(
        i => i.message,
      ),
    ).toContainEqual(expect.stringMatching(/a category's name/))
  })
  it('a long thin ellipse is avoided by its true distance; a scatter of 200 stays quick', () => {
    const thin = { id: 'thin', kind: 'zone.nogo', ellipse: [[0, 0], 200, 10, 0] as [Pt, number, number, number] }
    expect(distanceTo(thin, {}, 190, 12)).toBeLessThan(10)
    for (const k of kidsOf(
      expand(mini([thin, sc('w', 'veg.wood', { count: 6, avoid: ['thin'], clearance: 15 })]), cat).map,
      'w',
    )) {
      for (const [x, z] of k.area![0]) expect((x / 200) * (x / 200) + (z / 10) * (z / 10)).toBeGreaterThan(1)
    }
    const t0 = performance.now()
    const { issues } = expand(
      mini([
        {
          id: 'road',
          kind: 'way.road',
          line: [
            [-560, 0],
            [560, 0],
          ] as Pt[],
        },
        sc('many', 'veg.wood', { count: 200, radiusMin: 5, radiusMax: 8, avoid: ['way'], min: 150 }),
      ]),
      cat,
    )
    expect(issues).toEqual([])
    // measured 14–26 ms on the dev Mac (about 970 ms before the pruning); loose, as the machine is often loaded
    expect(performance.now() - t0).toBeLessThan(3000)
  })
})

describe("M3b: scatter's mix: several kinds placed jointly", () => {
  const mixed = (mix: unknown[], p: Record<string, unknown> = {}) => ({
    id: 'groves',
    kind: 'veg.wood',
    area: REGION,
    gen: { scatter: { mix, clearance: 12, ...p } },
  })
  it('each entry gets its count and kind; every child keeps clear of every other, whatever their kinds; set applies', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { map, issues } = expand(
        mini(
          [
            ROAD,
            mixed(
              [
                { kind: 'veg.wood.broad', count: 5, radiusMin: 25, radiusMax: 40, set: { density: 0.8 } },
                { kind: 'ground.field.wheat', count: 4, radiusMin: 20, radiusMax: 30 },
                { kind: 'veg.orchard', count: 3, radiusMin: 15, radiusMax: 20 },
              ],
              { avoid: ['way'] },
            ),
          ],
          seed,
        ),
        cat,
      )
      expect(issues).toEqual([])
      const kids = kidsOf(map, 'groves')
      expect(kids.filter(k => k.kind === 'veg.wood.broad')).toHaveLength(5)
      expect(kids.filter(k => k.kind === 'ground.field.wheat')).toHaveLength(4)
      expect(kids.filter(k => k.kind === 'veg.orchard')).toHaveLength(3)
      expect(kids.filter(k => k.kind === 'veg.wood.broad').every(k => k.density === 0.8)).toBe(true)
      expect(apart(kids, kids)).toBe(true)
      const road = map.features.find(f => f.id === 'road')!
      // clear of the road
      for (const k of kids) expect(distanceToPolygon(road, {}, k.area![0])).toBeGreaterThan(1.5 + 1)
    }
  })
  it('an entry that cannot be placed gives up without starving the others', () => {
    const { map, issues } = expand(
      mini([
        mixed([
          { kind: 'veg.wood.broad', count: 6, radiusMin: 30, radiusMax: 40, min: 4 },
          { kind: 'water.pond', count: 1, radiusMin: 600, radiusMax: 600, min: 0 },
        ]),
      ]),
      cat,
    )
    expect(issues).toEqual([])
    expect(kidsOf(map, 'groves').filter(k => k.kind === 'veg.wood.broad').length).toBeGreaterThanOrEqual(4)
  })
  it('a shortfall names the entries that fell short; min per entry lowers the bar', () => {
    const tight = expand(
      mini([
        mixed([
          { kind: 'veg.wood', count: 40, radiusMin: 80, radiusMax: 90 },
          { kind: 'ground.field', count: 2, radiusMin: 20, radiusMax: 25 },
        ]),
      ]),
      cat,
    )
    expect(tight.issues[0]?.message).toMatch(/placed \d+ of 40 veg\.wood/)
    expect(
      expand(
        mini([
          mixed([
            { kind: 'veg.wood', count: 40, radiusMin: 80, radiusMax: 90, min: 1 },
            { kind: 'ground.field', count: 2, radiusMin: 20, radiusMax: 25, min: 1 },
          ]),
        ]),
        cat,
      ).issues,
    ).toEqual([])
  })
  it('the validator checks each entry against the catalogue', () => {
    const paths = (mix: unknown[], p: Record<string, unknown> = {}) =>
      validate(mini([mixed(mix, p)]), cat).map(i => `${i.path}: ${i.message}`)
    expect(paths([{ kind: 'veg.jungle', count: 2 }])).toContainEqual(
      expect.stringMatching(/mix\[0\]\.kind: must name a kind/),
    )
    expect(paths([{ kind: 'way.road', count: 2 }])).toContainEqual(
      expect.stringMatching(/mix\[0\]\.kind: way\.road takes no area/),
    )
    expect(paths([{ kind: 'veg.wood' }])).toContainEqual(expect.stringMatching(/mix\[0\]\.count: is required/))
    expect(paths([{ kind: 'veg.wood', count: 2, colour: 'red' }])).toContainEqual(
      expect.stringMatching(/mix\[0\]\.colour: unknown field/),
    )
    expect(paths([{ kind: 'veg.wood', count: 2, set: { roof: 'tile' } }])).toContainEqual(
      expect.stringMatching(/mix\[0\]\.set\.roof: is not an attribute of veg/),
    )
    expect(paths([{ kind: 'veg.wood', count: 2 }], { count: 3 })).toContainEqual(
      expect.stringMatching(/scatter\.count: belongs to each entry of a mix/),
    )
    expect(paths([{ kind: 'veg.wood', count: 2, radiusMin: 30, radiusMax: 20 }])).toContainEqual(
      expect.stringMatching(/mix\[0\]\.radiusMax: is below radiusMin/),
    )
    expect(
      paths([
        { kind: 'veg.wood', count: 2 },
        { kind: 'ground.field', count: 2 },
      ]),
    ).toEqual([])
    // reported, never thrown
    expect(paths([null])).toEqual([expect.stringMatching(/scatter\.mix: must be a list of objects/)])
    expect(paths('veg' as unknown as unknown[])).toEqual([
      expect.stringMatching(/scatter\.mix: must be a list of objects/),
    ])
    const own = validate(mini([{ ...mixed([{ kind: 'veg.wood', count: 2 }]), density: 0.5 }]), cat).map(i => i.message)
    expect(own).toContainEqual(
      expect.stringMatching(
        /the scatter's own density reach no child of a mix: each child takes only its entry's kind and set/,
      ),
    )
    // a wrong parameter hides none of the generator's own checks
    expect(
      validate(mini([{ ...sc('w', 'veg.wood', {}), gen: { scatter: { clearance: -1 } } }]), cat).map(i => i.path),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/clearance$/), expect.stringMatching(/count$/)]))
  })
})

describe('M3b: five seeds of one intent, five battlefields', () => {
  longIt(
    'each validates, expands, compiles to sim data and runs two minutes of the S1e battle with finite state; all differ',
    () => {
      const seen = new Set<string>()
      for (const seed of [1, 2, 3, 4, 5]) {
        const raw = JSON.parse(fs.readFileSync(path.join(root, 'maps/generated.map.json'), 'utf8')) as MapFile
        raw.seed = seed
        expect(validate(raw, cat)).toEqual([])
        const { map, issues } = expand(raw, cat)
        expect(issues).toEqual([])
        seen.add(JSON.stringify(map.features.filter(f => f.origin)))
        const d = loadSimData(
          buildSimData(engineMap('generated', 'maps/generated.map.json', napoleonic, classifyNapoleonic, seed)),
        )
        const cr = compileRuleset(napoleonic)
        const w = makeWorld(d, cr, 3)
        attachScenario(w, m2Valley)
        m2Valley.setup(w)
        while (w.meta[M_TICK] < 2400) advanceTick(w)
        for (const a of [w.f.x, w.f.z, w.f.heading]) {
          for (let i = 0; i < 16; i++) expect(Number.isFinite(a[i])).toBe(true)
        }
      }
      expect(seen.size).toBe(5)
    },
  )
})
