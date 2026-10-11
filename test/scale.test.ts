// The 400-man battalion and the ceiling (decision 0018, docs/plans/active/s1c4-battalion-scale.md): the
// shipped block (6 companies of 23 files × 3 ranks) and the ceiling (45 files, 810 men) drill, gate and
// re-pack like the small block the terrain tests use, past the old 32-bit masks (48 and 90 bins, 69 and 135
// slots a company).
import { describe, it, expect } from 'vitest'
import { Sim, ceiling, STREAM_X, battleData } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { removeMan, anyWet, wetBins, aimOf, buildTerrain, rebuildImpassable, compileRuleset, type Ruleset, withBlock } from '../src/sim/index.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import { mkBits, hasBit } from '../src/sim/bits.ts'

const SHIPPED = { rs: napoleonic, men: 400 }, CEILING = { rs: ceiling, men: 810 }
const both = [['400', SHIPPED], ['810', CEILING]] as const
// the battlefield, levelled and open: room for every shape of a battalion of 810 (the 360 m field's edge holds them)
const OPEN = levelled(battleData)
const roomy = (rs: Ruleset): Sim => { const t = buildTerrain(OPEN, compileRuleset(rs)); t.cls.fill(Object.keys(rs.terrain).indexOf('open')); t.depth.fill(0); rebuildImpassable(t); return new Sim(1, rs, t, OPEN) }
const companies = (n: number): Ruleset => withBlock({ ...napoleonic, name: `${n} companies` }, 'infantry', { companies: n })

describe('the blocks', () => {
  it('every shape, for 4, 6 and 8 companies and the ceiling: no two places closer than the minimum spacing; the square turns about', () => {
    const worst: Record<string, number> = {}
    for (const n of [2, 3, 5, 7]) expect(() => new Sim(1, companies(n))).toThrow(/square/)   // an open or overlapping square
    for (const rs of [companies(4), napoleonic, companies(8), ceiling]) for (const shape of Object.keys(rs.types.infantry.formations)) {
      const s = new Sim(1, rs), U = s.w.cr.types[0], g = U.geo, h = s.spawn(-60, -60, 0, shape, U.slots), p = s.places(h)
      expect(p.length).toBe(U.slots)
      let m = Infinity
      for (let a = 0; a < p.length; a++) for (let b = a + 1; b < p.length; b++) m = Math.min(m, Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]))
      worst[`${g.companies}×${g.files} ${shape}`] = +m.toFixed(3)
      expect(m).toBeGreaterThanOrEqual(g.minSpacing - 1e-9)
      if (shape === 'square') expect(U.shapes[U.shapeIndex('square')].turn).not.toBeNull()
    }
    console.log('closest places', worst)
  })
  it('the shipped block holds 414 men and the ceiling 810; one more is refused', () => {
    for (const [rs, n] of [[napoleonic, 414], [ceiling, 810]] as const) {
      const s = new Sim(1, rs); s.spawn(-60, -60, 0, 'line', n); expect(s.dropped).toEqual([])
      s.spawn(-60, 60, 0, 'line', n + 1); expect(s.dropped.map(d => d.reason)).toEqual(['no room for those men'])
    }
  })
})

describe.each(both)('battalions of %s', (_, { rs, men }) => {
  it('change through every shape, march and Face about, keeping their men and their feet dry', () => {
    const s = roomy(rs), h = s.spawn(-60, -150, 0, 'line', men)
    for (const shape of ['column', 'square', 'line', 'march', 'column', 'line']) {
      s.order({ type: 'form', id: h, shape }); s.until(() => s.busy(h), 240)
      expect(s.shape(h)).toBe(shape)
      // 10 m ahead (a 93 m line turning about takes minutes: its outer flank walks a half circle)
      s.order({ type: 'move', id: h, points: [[s.x(h) + 10 * Math.sin(s.heading(h)), s.z(h) + 10 * Math.cos(s.heading(h))]], append: false }); s.until(() => s.busy(h), 120)
      expect(s.busy(h)).toBe(false)
      if (shape !== 'march') { const a = s.heading(h); s.order({ type: 'face', id: h }); s.until(() => s.busy(h), 30); expect(Math.abs(Math.cos(s.heading(h) - a) + 1)).toBeLessThan(1e-9) }
      expect(s.men(h)).toBe(men); expect(s.placesInDeep(h)).toBe(0); expect(s.status(h)).toBe('')
    }
  })
  it('a march column follows its trail through a 90° turn (the ring holds its depth)', () => {
    const s = roomy(rs), h = s.spawn(-120, -150, 0, 'march', men)
    s.order({ type: 'move', id: h, points: [[-120, -40], [-20, -40]], append: false }); s.until(() => s.busy(h), 600)
    expect(s.busy(h)).toBe(false); expect(Math.hypot(s.x(h) + 20, s.z(h) + 40)).toBeLessThan(1)
    expect(s.men(h)).toBe(men); expect(s.placesInDeep(h)).toBe(0)
  })
  it('a line marching into the stream halts, every man dry', () => {
    const s = new Sim(1, rs), h = s.spawn(20, 10, Math.PI / 2, 'line', Math.min(men, 400))   // 400: the ceiling's full line overruns the field
    s.order({ type: 'move', id: h, points: [[100, 10]], append: false }); s.until(() => s.busy(h), 300)
    expect(s.status(h)).toBe('halted: impassable ground'); expect(s.placesInDeep(h)).toBe(0); expect(anyWet(s.w, s.slot(h))).toBe(false)
  })
  it('a diagonal column losing half its men along the bank never puts a man on impassable ground', () => {
    let positions = 0
    for (const heading of [-Math.PI / 4, 3 * Math.PI / 4]) for (const z of [-100, 60]) for (let x = 20; x <= 60; x += 2) {
      const s = new Sim(1, rs), h = s.spawn(x, z, heading, 'column', men), i = s.slot(h), C = s.w.cr.types[0].C
      if (anyWet(s.w, i)) continue
      positions++
      for (let n = 0; n < men / 2; n++) { removeMan(s.w, i, n % C); if (anyWet(s.w, i)) throw new Error(`wet at x ${x}, z ${z}, heading ${heading}, loss ${n}`) }
      expect(s.men(h)).toBe(men - men / 2)
    }
    expect(positions).toBeGreaterThan(10)
  })
})

describe('bins past 32', () => {
  it('a line with only its eastern company over the stream reports that company\'s bins, all past bit 32', () => {
    const s = new Sim(1, napoleonic), z = 40, h = s.spawn(STREAM_X(z) - 52, z, 0, 'line', 400), i = s.slot(h), B = s.w.cr.types[0].geo.bins
    expect(anyWet(s.w, i)).toBe(false)
    s.w.f.x[i] += 10   // the eastern company's files over the water (a probe: no tick runs)
    const wet = wetBins(s.w, i, mkBits(s.w.cr.maxNB)), set: number[] = []
    for (let j = 0; j < s.w.cr.maxNB; j++) if (hasBit(wet, j)) set.push(j)
    expect(set.length).toBeGreaterThan(0)
    expect(Math.min(...set)).toBeGreaterThanOrEqual(4 * B)   // companies 4 and 5: bins 32..47
  })
})

describe('friendly cover at 400', () => {
  // a 400-man line reaches 46 m from its anchor: a sight line more than 40 m from a friend's anchor can still
  // cross its outer company, so the cover cull must use each battalion's extent (fire.ts, FireGeo.reach; the
  // fix had no failing test while battalions reached under 40 m)
  it('a friend 45 m off the axis covers the company behind its outer company (a third of its rays clear, two thirds with a 40 m cull)', () => {
    const s = new Sim(1, napoleonic), E = Math.PI / 2, z = 0
    const a = s.spawn(-120, z, E, 'line', 400, 0); s.spawn(-20, z, -E, 'line', 400, 1); s.spawn(-100, z + 45, E, 'line', 400, 0)
    s.advance(40)
    const i = s.slot(a), frames = s.companyFrames(a)
    const covered = frames.map((f, c) => c).filter(c => frames[c].z > 1 && frames[c].z < 12)
    expect(covered.length).toBeGreaterThan(0)
    for (const c of covered) expect(aimOf(s.w, i, c).share).toBeLessThan(0.5)
  })
})
