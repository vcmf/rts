// The shipped block and the ceiling (decision 0076, docs/proposals/division-scale.md; first decision 0018): the
// shipped block (4 sections of 20 files × 3 ranks, 240 figures) and the ceiling (45 files, 540) drill, gate and
// re-pack like the small block the terrain tests use, past the old 32-bit masks (60 slots a section, 135 for the
// ceiling).
import { describe, it, expect } from 'vitest'
import { Sim, ceiling, STREAM_X, openBattlefield, OPEN_DATA } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { removeMan, anyWet, wetBins, aimOf, type Ruleset, withBlock } from '../src/sim/index.ts'
import { mkBits, hasBit } from '../src/sim/bits.ts'

const SHIPPED = { rs: napoleonic, men: 240 }
const CEILING = { rs: ceiling, men: 540 }
const both = [
  ['240', SHIPPED],
  ['540', CEILING],
] as const
// the battlefield, levelled and open: room for every shape of a unit of 540 (the 360 m field's edge holds them)
const roomy = (rs: Ruleset): Sim => new Sim(1, rs, openBattlefield(rs), OPEN_DATA)
const companies = (n: number): Ruleset =>
  withBlock({ ...napoleonic, name: `${n} companies` }, 'infantry', { companies: n })

describe('the blocks', () => {
  it('every shape, for 4, 6 and 8 companies and the ceiling: no two places closer than the minimum spacing; the square turns about', () => {
    const worst: Record<string, number> = {}
    // an open or overlapping square
    for (const n of [2, 3, 5, 7]) expect(() => new Sim(1, companies(n))).toThrow(/square/)
    for (const rs of [companies(4), napoleonic, companies(8), ceiling]) {
      for (const shape of Object.keys(rs.types.infantry.formations)) {
        const s = new Sim(1, rs)
        const U = s.w.cr.types[0]
        const g = U.geo
        const h = s.spawn(-60, -60, 0, shape, U.slots)
        const p = s.places(h)
        expect(p.length).toBe(U.slots)
        let m = Infinity
        for (let a = 0; a < p.length; a++) {
          for (let b = a + 1; b < p.length; b++) m = Math.min(m, Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]))
        }
        worst[`${g.companies}×${g.files} ${shape}`] = +m.toFixed(3)
        expect(m).toBeGreaterThanOrEqual(g.minSpacing - 1e-9)
        if (shape === 'square') expect(U.shapes[U.shapeIndex('square')].turn).not.toBeNull()
      }
    }
    console.log('closest places', worst)
  })
  it('the shipped block holds 240 figures and the ceiling 540; one more is refused', () => {
    for (const [rs, n] of [
      [napoleonic, 240],
      [ceiling, 540],
    ] as const) {
      const s = new Sim(1, rs)
      s.spawn(-60, -60, 0, 'line', n)
      expect(s.dropped).toEqual([])
      s.spawn(-60, 60, 0, 'line', n + 1)
      expect(s.dropped.map(d => d.reason)).toEqual(['no room for those men'])
    }
  })
})

describe.each(both)('battalions of %s', (_, { rs, men }) => {
  it('change through every shape, march and Face about, keeping their men and their feet dry', () => {
    const s = roomy(rs)
    const h = s.spawn(-60, -150, 0, 'line', men)
    for (const shape of ['column', 'square', 'line', 'march', 'column', 'line']) {
      s.order({ type: 'form', id: h, shape })
      s.until(() => s.busy(h), 240)
      expect(s.shape(h)).toBe(shape)
      // 10 m ahead (a 93 m line turning about takes minutes: its outer flank walks a half circle)
      s.order({
        type: 'move',
        id: h,
        points: [[s.x(h) + 10 * Math.sin(s.heading(h)), s.z(h) + 10 * Math.cos(s.heading(h))]],
        append: false,
      })
      s.until(() => s.busy(h), 120)
      expect(s.busy(h)).toBe(false)
      if (shape !== 'march') {
        const a = s.heading(h)
        s.order({ type: 'face', id: h })
        s.until(() => s.busy(h), 30)
        expect(Math.abs(Math.cos(s.heading(h) - a) + 1)).toBeLessThan(1e-9)
      }
      expect(s.men(h)).toBe(men)
      expect(s.placesInDeep(h)).toBe(0)
      expect(s.status(h)).toBe('')
    }
  })
  it('a march column follows its trail through a 90° turn (the ring holds its depth)', () => {
    const s = roomy(rs)
    const h = s.spawn(-120, -150, 0, 'march', men)
    s.order({
      type: 'move',
      id: h,
      points: [
        [-120, -40],
        [-20, -40],
      ],
      append: false,
    })
    s.until(() => s.busy(h), 600)
    expect(s.busy(h)).toBe(false)
    expect(Math.hypot(s.x(h) + 20, s.z(h) + 40)).toBeLessThan(1)
    expect(s.men(h)).toBe(men)
    expect(s.placesInDeep(h)).toBe(0)
  })
  it('a line marching into the stream halts, every man dry', () => {
    const s = new Sim(1, rs)
    // 400: the ceiling's full line overruns the field
    const h = s.spawn(20, 10, Math.PI / 2, 'line', Math.min(men, 400))
    s.order({ type: 'move', id: h, points: [[100, 10]], append: false })
    s.until(() => s.busy(h), 300)
    expect(s.status(h)).toBe('halted: impassable ground')
    expect(s.placesInDeep(h)).toBe(0)
    expect(anyWet(s.w, s.slot(h))).toBe(false)
  })
  it('a diagonal column losing half its men along the bank never puts a man on impassable ground', () => {
    let positions = 0
    for (const heading of [-Math.PI / 4, (3 * Math.PI) / 4]) {
      for (const z of [-100, 60]) {
        for (let x = 20; x <= 60; x += 2) {
          const s = new Sim(1, rs)
          const h = s.spawn(x, z, heading, 'column', men)
          const i = s.slot(h)
          const C = s.w.cr.types[0].C
          if (anyWet(s.w, i)) continue
          positions++
          for (let n = 0; n < men / 2; n++) {
            removeMan(s.w, i, n % C)
            if (anyWet(s.w, i)) throw new Error(`wet at x ${x}, z ${z}, heading ${heading}, loss ${n}`)
          }
          expect(s.men(h)).toBe(men - men / 2)
        }
      }
    }
    expect(positions).toBeGreaterThan(10)
  })
})

describe('bins past 32', () => {
  it("a line with only its eastern section over the stream reports that section's bins, all past bit 32", () => {
    // the ceiling's line (4 sections of 15 bins): its eastern section's bins are 45..59
    const s = new Sim(1, ceiling)
    const z = 40
    const h = s.spawn(STREAM_X(z) - 70, z, 0, 'line', 540)
    const i = s.slot(h)
    const B = s.w.cr.types[0].geo.bins
    expect(anyWet(s.w, i)).toBe(false)
    s.w.f.x[i] += 14 // the eastern section's files over the water (a probe: no tick runs)
    const wet = wetBins(s.w, i, mkBits(s.w.cr.maxNB))
    const set: number[] = []
    for (let j = 0; j < s.w.cr.maxNB; j++) if (hasBit(wet, j)) set.push(j)
    expect(set.length).toBeGreaterThan(0)
    expect(Math.min(...set)).toBeGreaterThanOrEqual(3 * B) // section 3: bins 45..59
  })
})

describe('friendly cover at the ceiling', () => {
  // the ceiling's line reaches about 60 m from its anchor: a sight line more than 40 m from a friend's anchor can
  // still cross its outer section, so the cover cull must use each unit's extent (fire.ts, FireGeo.reach; the
  // shipped line of 240 reaches 27 m, under any such cull)
  it('a friend 60 m off the axis covers the section behind its outer section', () => {
    const s = new Sim(1, ceiling)
    const E = Math.PI / 2
    const z = 0
    const a = s.spawn(-120, z, E, 'line', 540, 0)
    s.spawn(-40, z, -E, 'line', 540, 1)
    s.spawn(-100, z + 60, E, 'line', 540, 0)
    s.advance(40)
    const i = s.slot(a)
    const frames = s.companyFrames(a)
    const covered = frames.map((f, c) => c).filter(c => frames[c].z > 1 && frames[c].z < 20)
    expect(covered.length).toBeGreaterThan(0)
    for (const c of covered) expect(aimOf(s.w, i, c).share).toBeLessThan(0.5)
  })
})

describe('the division scale’s distances (docs/proposals/division-scale.md § 5, P-57)', () => {
  it('each distance is its group’s: the fire’s × 0.4, the unit’s × 0.58, the charge’s, the guns’ and the ground’s unchanged', () => {
    const N = napoleonic
    const A = N.types.battery.artillery!
    const C = N.types.cavalry.charge!
    // the fire's: S1c's 250 m and its table, × 0.4; the rally's 250 m
    expect(N.fire.maxRange).toBe(100)
    expect(N.fire.pRange.map(([d]) => d)).toEqual([0, 50, 100, 150, 200, 250].map(d => d * 0.4))
    expect(N.morale.rally.safe).toBe(100)
    // the unit's: S1c-4's reaches (560, 280, 280) by the width, rounded
    expect([N.morale.contagion.front, N.morale.contagion.back, N.morale.support.reach]).toEqual([325, 163, 163])
    // the charge's, unchanged (a pace and a time)
    expect([C.gallopAt, C.test, C.build, C.recoil, N.melee.refuge.alert]).toEqual([150, 60, 50, 80, 200])
    // the guns': canister unchanged, roundshot 1 km, the guns' minimum at bayonet range
    expect([A.cone.range, A.ray.range, A.min]).toEqual([300, 1000, 15])
    expect(N.sectors.reach).toBe(300)
  })
})
