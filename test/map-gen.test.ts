// The generators (docs/plans/active/m3-generators.md, M3a): seeds, the base ground's noise, meander, clump, expansion
// with origins, the validator's generator checks, and the fast paths' equality with the plain ones.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { hash32, random, seedOf } from '../src/map/seed.ts'
import { fbm, addFbmGrid } from '../src/map/noise.ts'
import { meander } from '../src/map/meander.ts'
import { clump } from '../src/map/clump.ts'
import { expand } from '../src/map/expand.ts'
import { validate } from '../src/map/validate.ts'
import { apply, nearLine, nearScan } from '../src/map/apply.ts'
import { lineCrossing, lineLength, ringCrossing } from '../src/map/geometry.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const mini = (features: MapFile['features'], seed = 7): MapFile => ({ format: 1, id: 'mini', name: 'Mini', seed, season: 'summer', extent: { w: 1200, h: 1200 }, play: { w: 800, h: 800 }, features })
const GUIDE: Pt[] = [[-560, 0], [0, 40], [560, -20]]
const BROOK = { id: 'brook', kind: 'water.stream', line: GUIDE, width: 6, gen: { meander: { amplitude: 30 } } }
const WOOD = { id: 'wood', kind: 'veg.wood', circle: [[100, -200], 60] as [Pt, number], gen: { clump: { coherence: 0.5 } } }
const gen = (m: MapFile, id: string) => expand(m, cat).map.features.find(f => f.id === id)!

describe('M3a: seeds', () => {
  it('hash32 is stable, and separates its parts', () => {
    expect(hash32(7, 'brook', 'meander')).toBe(hash32(7, 'brook', 'meander'))
    expect(hash32('ab', 'c')).not.toBe(hash32('a', 'bc'))
    expect(seedOf(7, 'brook', 'meander')).not.toBe(seedOf(8, 'brook', 'meander'))
    const r = random(42), xs = [r(), r(), r()]
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
    expect(random(42)()).toBe(xs[0])
  })
  it('a generated feature depends on its own id and the map seed, not on other features or the file order', () => {
    const a = gen(mini([BROOK, WOOD]), 'brook')
    expect(gen(mini([WOOD, BROOK]), 'brook')).toEqual(a)                                              // order
    expect(gen(mini([BROOK, { ...WOOD, circle: [[-300, 300], 90] }]), 'brook')).toEqual(a)           // another feature moved
    expect(gen(mini([BROOK, WOOD], 8), 'brook').line).not.toEqual(a.line)                             // another map seed
    expect(gen(mini([{ ...BROOK, id: 'brook-2' }, WOOD]), 'brook-2').line).not.toEqual(a.line)       // another id
  })
})

describe('M3a: meander', () => {
  const line = meander(GUIDE, 6, { amplitude: 30 }, 1234)
  const offGuide = (p: Pt) => nearScan(GUIDE, p[0], p[1]).d
  it('stays near its belt, starts and ends on its guide, never crosses itself, and winds', () => {
    expect(line[0]).toEqual(GUIDE[0]); expect(line[line.length - 1]).toEqual(GUIDE[GUIDE.length - 1])
    expect(Math.max(...line.map(offGuide))).toBeLessThan(30 * 1.35)
    expect(lineCrossing(line)).toBeNull()
    expect(lineLength(line) / lineLength(GUIDE)).toBeGreaterThan(1.1)
    for (const p of line) for (const v of p) expect(Math.round(v * 100) / 100).toBe(v)
  })
  it('is the same line for the same seed, another for another', () => {
    expect(meander(GUIDE, 6, { amplitude: 30 }, 1234)).toEqual(line)
    expect(meander(GUIDE, 6, { amplitude: 30 }, 1235)).not.toEqual(line)
  })
  it('a smaller bend winds less', () => {
    const tight = lineLength(meander(GUIDE, 6, { amplitude: 30, bend: 1.6 }, 9)), gentle = lineLength(meander(GUIDE, 6, { amplitude: 30, bend: 0.5 }, 9))
    expect(gentle).toBeLessThan(tight)
  })
})

describe('M3a: clump', () => {
  it('a simple polygon whose radius stays within its bounds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ring = clump([0, 0], 60, 60, 0, { coherence: 0.2, raggedness: 1 }, seed)
      expect(ringCrossing(ring)).toBeNull()
      for (const [x, z] of ring) { const r = Math.hypot(x, z); expect(r).toBeGreaterThan(0.4 * 60 - 0.01); expect(r).toBeLessThan(1.7 * 60) }
    }
  })
  it('coherence 1 is the circle, to 1 cm', () => {
    for (const [x, z] of clump([10, 20], 50, 50, 0, { coherence: 1 }, 99)) expect(Math.abs(Math.hypot(x - 10, z - 20) - 50)).toBeLessThan(0.015)
  })
})

describe('M3a: the base ground', () => {
  it('stays within ± its height, and is flat with none', () => {
    const L = apply(mini([{ id: 'ground', kind: 'relief.base', height: 4, width: 300 }]), cat)
    let lo = Infinity, hi = -Infinity
    for (const h of L.height) { lo = Math.min(lo, h); hi = Math.max(hi, h) }
    expect(lo).toBeGreaterThanOrEqual(-4); expect(hi).toBeLessThanOrEqual(4); expect(hi - lo).toBeGreaterThan(2)
    expect(apply(mini([{ id: 'ground', kind: 'relief.base' }]), cat).height.every(h => h === 0)).toBe(true)
  })
  it('the grid fill gives fbm to the bit', () => {
    const out = new Float64Array(11 * 11)
    addFbmGrid(out, 77, -100, -60, 10, 10, 2, 300, 1)
    for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) expect(out[j * 11 + i]).toBe(fbm(77, (-100 + i * 2) / 300, (-60 + j * 2) / 300))
  })
})

describe('M3a: the line index answers as the scan', () => {
  it('on a meandered brook, at points near and far, inside and outside its box', () => {
    const line = meander([[-1000, 0], [1000, 30]], 6, { amplitude: 40 }, 5), r = random(3)
    for (let k = 0; k < 4000; k++) {
      const x = -1300 + r() * 2600, z = (k % 2 ? -60 + r() * 120 : -600 + r() * 1200)
      expect(nearLine(line, x, z)).toEqual(nearScan(line, x, z))
    }
  })
})

describe('M3a: the validator and expansion', () => {
  const issuesOf = (m: MapFile) => validate(m, cat).map(i => `${i.id} ${i.path}: ${i.message}`)
  it('bad generator parameters, a wrong input shape and an output the kind does not take are reported', () => {
    expect(issuesOf(mini([{ ...BROOK, gen: { meander: { amplitude: 30, wiggle: 2 } } }]))).toContainEqual(expect.stringMatching(/^brook features\[0\]\.gen\.meander\.wiggle: unknown parameter/))
    expect(issuesOf(mini([{ ...BROOK, gen: { meander: { amplitude: 0 } } }]))).toContainEqual(expect.stringMatching(/^brook features\[0\]\.gen\.meander\.amplitude: must be at least 1/))
    expect(issuesOf(mini([{ ...BROOK, gen: { meander: {} } }]))).toContainEqual(expect.stringMatching(/^brook features\[0\]\.gen\.meander\.amplitude: is required/))
    expect(issuesOf(mini([{ ...WOOD, circle: undefined, line: [[0, 0], [10, 0]] }]))).toContainEqual(expect.stringMatching(/^wood features\[0\]\.line: the clump generator reads point, circle, ellipse/))
    expect(issuesOf(mini([{ id: 'road', kind: 'way.road', point: [0, 0], gen: { clump: {} } }]))).toContainEqual(expect.stringMatching(/^road features\[0\]\.gen: the clump generator writes a area, which way\.road does not take/))
    expect(issuesOf(mini([BROOK, WOOD]))).toEqual([])
  })
  it('a generated feature takes its output shape, records its origin, and the expanded map validates', () => {
    const m = mini([BROOK, WOOD]), { map, issues } = expand(m, cat)
    expect(issues).toEqual([])
    const w = map.features.find(f => f.id === 'wood')!
    expect([w.gen, w.circle, Array.isArray(w.area)]).toEqual([undefined, undefined, true])
    expect(w.origin).toEqual({ generator: 'clump', params: { coherence: 0.5 }, version: 2 })
    expect(validate(map, cat)).toEqual([])
    // pinned: the expanded feature written back into a map is just a feature
    expect(issuesOf(mini([BROOK, w]))).toEqual([])
  })
  it('a bridge whose road crosses its meandered water twice must say near', () => {
    const road = { id: 'road', kind: 'way.road.lane', line: [[-400, 60], [-400, -60], [-200, -60], [-200, 60]] as Pt[] }   // down over the brook and back up
    const m = mini([{ ...BROOK, line: [[-560, 0], [560, 0]] as Pt[], gen: { meander: { amplitude: 5, bend: 0.3 } } }, road, { id: 'bridge', kind: 'built.bridge', carries: 'road', crosses: 'brook' }])
    const { issues } = expand(m, cat)
    expect(issues.map(i => `${i.id} ${i.path}`)).toContain('bridge features[2].near')   // its index in the file the author wrote
    const near = clone(m); near.features[2].near = [-300, 0]
    expect(expand(near, cat).issues).toEqual([])
  })
})
