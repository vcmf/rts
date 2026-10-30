// The levels' effects (docs/proposals/morale-bar-model.md § 8): each factor of a level's row against level 2's, on an
// open, level field. Drill, react and pursue are times, read off exactly; reload is read off each new reload; precision
// and toughness change expected hits, so their tests run the same volleys at level 2 and at a level that differs from
// it in that factor alone (the same seeds draw the same volleys), and compare the losses.
import { describe, it, expect } from 'vitest'
import { Sim, longIt, openBattlefield, OPEN_DATA } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import {
  makeHandle,
  KIND_FORMATION,
  CH_PURSUIT,
  M_TICK,
  outOfFight,
  MS_ROUTING,
  creditMen,
  creditRepulse,
  compileRuleset,
  type Command,
  type LevelDef,
  type Ruleset,
} from '../src/sim/index.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const PI = Math.PI
const FIELD = openBattlefield()
const L = napoleonic.levels
const FACTORS = ['toughness', 'reload', 'precision', 'drill', 'react', 'pursue'] as const
type Factor = (typeof FACTORS)[number]
// the shipped ruleset with level 6's factors all level 2's but one, set to v
const only = (k: Factor, v: number): Ruleset => {
  const row: LevelDef = { ...L[5] }
  for (const f of FACTORS) row[f] = L[1][f]
  row[k] = v
  return { ...napoleonic, levels: [...L.slice(0, 5), row] }
}

type Spawn = Extract<Command, { type: 'debug-spawn' }>
// a full formation of the unit (src/scenarios/sizes.ts)
const menOf = (s: Sim, unit?: string): number => FULL[(unit ?? 'infantry') as keyof typeof FULL]
class S extends Sim {
  constructor(seed = 1, rs: Ruleset = napoleonic) {
    super(seed, rs, FIELD, OPEN_DATA)
  }
  put(c: Partial<Spawn>): number {
    const slot = this.w.free[this.w.meta[1] - 1]
    this.cmd({
      type: 'debug-spawn',
      side: 0,
      x: 0,
      z: 0,
      heading: 0,
      shape: 'line',
      men: FULL.infantry,
      fire: 'hold',
      ...c,
    })
    this.tick()
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
}

// a time read off by `until`, T or a tick short of it (the change may end on the tick it is checked)
const near = (t: number, T: number): boolean => t >= T - 0.05 - 1e-9 && t <= T + 1e-9

describe('drill', () => {
  it('a change of shape and a Face about take their times × the level’s drill', () => {
    for (const lv of [1, 2, 3, 6]) {
      const s = new S()
      const h = s.put({ level: lv })
      s.order({ type: 'form', id: h, shape: 'square' })
      expect(
        near(
          s.until(() => s.busy(h), 200),
          100 * L[lv - 1].drill,
        ),
      ).toBe(true)
      const a = new S()
      const g = a.put({ level: lv })
      a.order({ type: 'face', id: g })
      expect(
        near(
          a.until(() => a.busy(g), 20),
          napoleonic.faceTime * L[lv - 1].drill,
        ),
      ).toBe(true)
    }
  })
})

describe('reload', () => {
  // each company's reload after a volley, as a multiple of the type's: within the jitter of the level's factor
  const reloads = (lv: number, unit?: string): number[] => {
    const s = new S()
    const art = unit === 'battery'
    const sh = s.put({ level: lv, unit, shape: art ? 'unlimbered' : 'line', men: menOf(s, unit), fire: 'at will' })
    s.put({ side: 1, z: art ? 200 : 40, heading: PI, bar: 10000 })
    const i = s.slot(sh)
    const CS = s.w.cr.maxC
    const C = s.w.cr.types[s.w.f.type[i]].C
    const R = art ? napoleonic.types.battery.artillery!.reload : napoleonic.fire.reload
    const out: number[] = []
    for (let n = 0; n < 60 * 20; n++) {
      s.tick()
      for (let c = 0; c < C; c++) {
        if (s.w.f.volleyTick[i * CS + c] === s.w.meta[M_TICK]) out.push(s.w.f.reload[i * CS + c] / R)
      }
    }
    return out
  }
  it('a battalion’s and a battery’s reload is the type’s × the level’s, within the jitter', () => {
    for (const [unit, J] of [
      [undefined, napoleonic.fire.reloadJitter],
      ['battery', napoleonic.types.battery.artillery!.reloadJitter],
    ] as const) {
      for (const lv of [1, 2, 6]) {
        const r = reloads(lv, unit)
        expect(r.length).toBeGreaterThan(5)
        for (const v of r) {
          expect(v).toBeGreaterThanOrEqual(L[lv - 1].reload * (1 - J) - 1e-9)
          expect(v).toBeLessThanOrEqual(L[lv - 1].reload * (1 + J) + 1e-9)
        }
      }
    }
  })
})

// the target's losses after `sec` seconds of fire, summed over seeds 1..n: a line at 50 m (or a battery at canister
// range) with `shooter`'s level at a target line with `target`'s, the target holding fire with a bar it cannot lose.
// A minute for the line: longer, the target's shrinking front takes companies out of the fire and blurs the ratio
const losses = (rs: Ruleset, shooter: number, target: number, unit?: string): number => {
  const [sec, n] = unit ? [120, 8] : [60, 16]
  let sum = 0
  for (let seed = 1; seed <= n; seed++) {
    const s = new S(seed, rs)
    const art = unit === 'battery'
    s.put({ level: shooter, unit, shape: art ? 'unlimbered' : 'line', men: menOf(s, unit), fire: 'at will' })
    const t = s.put({ level: target, side: 1, z: art ? 150 : 20, heading: PI, bar: 10000 })
    s.advance(sec)
    sum += FULL.infantry - s.men(t)
  }
  return sum
}

describe('precision and toughness', () => {
  // the ratio to level 2's losses, within 0.05: the same seeds, so the same volleys with more or fewer hits
  for (const unit of [undefined, 'battery']) {
    const what = unit ? 'canister' : 'a volley'
    longIt(
      `${what}: hits × the shooter’s precision; men owed ÷ the target’s toughness`,
      () => {
        const base = losses(napoleonic, 2, 2, unit)
        expect(base).toBeGreaterThan(100)
        for (const v of [0.85, 1.25]) expect(losses(only('precision', v), 6, 2, unit) / base).toBeCloseTo(v, 1)
        for (const v of [0.9, 1.4]) expect(losses(only('toughness', v), 2, 6, unit) / base).toBeCloseTo(1 / v, 1)
      },
      300_000,
    )
  }
})

describe('react', () => {
  it('a battalion forms square after refuge.react × its level’s react', () => {
    for (const lv of [1, 2, 4]) {
      const s = new S()
      const ln = s.put({ level: lv, side: 1, z: 100, heading: PI })
      const cav = s.put({ unit: 'cavalry', z: -170, men: FULL.cavalry })
      s.order({ type: 'charge', id: cav, target: ln })
      s.until(() => !s.w.f.alertAt[s.slot(ln)], 60)
      const t0 = s.t
      s.until(() => !s.w.f.trans[s.slot(ln)], 20)
      expect(s.t - t0).toBeCloseTo(napoleonic.melee.refuge.react * L[lv - 1].react, 1)
    }
  })
})

describe('pursue', () => {
  it('a regiment pursues a broken foe for charge.pursue × its level’s pursue', () => {
    for (const lv of [1, 2, 3]) {
      const s = new S(1, {
        ...napoleonic,
        melee: { ...napoleonic.melee, refuge: { ...napoleonic.melee.refuge, alert: 0 } },
      })
      const foe = s.put({ side: 1, z: 60, heading: PI, bar: 20 })
      const cav = s.put({ level: lv, unit: 'cavalry', z: -100, men: FULL.cavalry, bar: 10000 })
      s.order({ type: 'charge', id: cav, target: foe })
      s.until(() => s.w.f.chPhase[s.slot(cav)] !== CH_PURSUIT, 120)
      expect(outOfFight(s.w.f.mstate[s.slot(foe)])).toBe(true)
      const ticks = s.w.f.chUntil[s.slot(cav)] - s.w.meta[M_TICK]
      expect(ticks).toBe(Math.round(napoleonic.types.cavalry.charge!.pursue * L[lv - 1].pursue * 20))
    }
  })
})

const P = napoleonic.points
describe('P-38: points', () => {
  it('a line firing on a target of level 2 is credited points.man for each man it strikes', () => {
    const s = new S()
    const a = s.put({ fire: 'at will' })
    const t = s.put({ side: 1, z: 20, heading: PI, bar: 10000 })
    s.advance(60)
    const struck = FULL.infantry - s.men(t)
    expect(struck).toBeGreaterThan(5)
    expect(s.w.f.pts[s.slot(a)] - L[1].points).toBeCloseTo(struck * P.man, 6)
  })
  it('a line losing men is credited points.fire a second while it lost one in the last points.window seconds', () => {
    const s = new S()
    s.put({ fire: 'at will', z: -12 })
    const t = s.put({ side: 1, z: 20, heading: PI, bar: 10000 })
    const i = s.slot(t)
    let want = L[1].points
    for (let n = 0; n < 60 * 20; n++) {
      s.tick()
      const f = s.w.f
      if (f.lastLoss[i] > 0 && s.w.meta[M_TICK] - f.lastLoss[i] < P.window * 20) want += P.fire / 20
    }
    expect(want).toBeGreaterThan(L[1].points + 1)
    expect(s.w.f.pts[i]).toBeCloseTo(want, 9)
  })
  it('a square is credited points.repulse for each charge it turns away', () => {
    const s = new S()
    const sq = s.put({ side: 1, z: 100, heading: PI, shape: 'square' })
    const cav = s.put({ unit: 'cavalry', z: -150, men: FULL.cavalry })
    s.order({ type: 'charge', id: cav, target: sq })
    s.until(() => s.w.f.chPhase[s.slot(cav)] !== 0, 120)
    expect(s.w.f.blownUntil[s.slot(cav)]).toBeGreaterThan(s.w.meta[M_TICK])
    expect(s.w.f.pts[s.slot(sq)]).toBe(L[1].points + P.repulse)
  })
  it('an enemy broken in front, in range, credits points.broke; not one on the flank, out of range, or to a router', () => {
    const s = new S()
    const e = s.put({ side: 1, z: 40, heading: PI, bar: 10000 })
    const front = s.put({}) // 40 m in front of it
    const flank = s.put({ x: 80, z: 40, heading: -PI / 2 }) // on its flank, facing it: it is in this one's front
    const side = s.put({ x: 65, z: 40, heading: 0 }) // beside it, facing the same way: it on the flank
    const far = s.put({ z: 40 - napoleonic.fire.maxRange - 50 })
    const run = s.put({ x: -120, z: 40, heading: PI / 2 })
    s.w.f.mstate[s.slot(run)] = MS_ROUTING
    s.w.f.bar[s.slot(e)] = -100
    s.tick()
    expect(outOfFight(s.w.f.mstate[s.slot(e)])).toBe(true)
    const got = [front, flank, side, far, run].map(h => s.w.f.pts[s.slot(h)] - L[1].points)
    expect(got).toEqual([P.broke, P.broke, 0, 0, 0])
  })
  it('none to a formation out of the fight', () => {
    const s = new S()
    const h = s.put({})
    const i = s.slot(h)
    s.w.f.mstate[i] = MS_ROUTING
    creditMen(s.w, i, 10)
    creditRepulse(s.w, i)
    expect(s.w.f.pts[i]).toBe(L[1].points)
  })
})

describe('P-39: the level up', () => {
  it('on the tick its points reach the next level’s: the level, the bar scaled and full, the cost written off', () => {
    const s = new S()
    const h = s.put({ bar: 90 })
    const i = s.slot(h)
    const f = s.w.f
    f.bar[i] = 50
    f.cost[i] = 20
    f.pts[i] = L[2].points - 0.01
    s.tick()
    expect([f.level[i], f.up[i]]).toEqual([2, 0])
    f.pts[i] = L[2].points
    s.tick()
    expect([f.level[i], f.up[i], f.cost[i], f.drill[i]]).toEqual([3, 1, 0, L[2].drill])
    expect(f.barMax[i]).toBeCloseTo((90 * L[2].bar) / L[1].bar, 9)
    expect(f.bar[i]).toBe(f.barMax[i])
  })
  it('at most one a battle; none past level 6; the level never falls', () => {
    const s = new S()
    const a = s.put({})
    const b = s.put({ level: 6, x: 200 })
    const f = s.w.f
    f.pts[s.slot(a)] = 1e6
    f.pts[s.slot(b)] = 1e6
    s.advance(2)
    expect([f.level[s.slot(a)], f.level[s.slot(b)]]).toEqual([3, 6])
    f.pts[s.slot(a)] = 0
    s.advance(1)
    expect(f.level[s.slot(a)]).toBe(3)
  })
  it('the ruleset refuses negative credits and a window not above 0', () => {
    for (const p of [{ man: -1 }, { fire: -0.1 }, { repulse: -1 }, { broke: -1 }, { window: 0 }]) {
      expect(() => compileRuleset({ ...napoleonic, points: { ...P, ...p } })).toThrow(/points/)
    }
    expect(() => compileRuleset(napoleonic)).not.toThrow()
  })
})

describe('the ruleset hash', () => {
  it('changes with a level’s factor, a credit, and the sectors', () => {
    const h = compileRuleset(napoleonic).hash
    expect(compileRuleset(only('toughness', 1.5)).hash).not.toBe(h)
    expect(compileRuleset({ ...napoleonic, points: { ...P, broke: 30 } }).hash).not.toBe(h)
    expect(compileRuleset({ ...napoleonic, sectors: { ...napoleonic.sectors, slices: 4 } }).hash).not.toBe(h)
  })
})

describe('roundshot', () => {
  it('a battery is credited for the enemies its balls strike, not for its friends', () => {
    // a wide spread (0.3 rad), so balls aimed at the enemy line 600 m off, where they come down, graze a friendly line
    // beside it; both are out of canister's range
    const B = napoleonic.types.battery
    const A = B.artillery!
    const wide: Ruleset = {
      ...napoleonic,
      types: { ...napoleonic.types, battery: { ...B, artillery: { ...A, ray: { ...A.ray, spread: 0.3 } } } },
    }
    let friends = 0
    let foes = 0
    let credited = 0
    for (let seed = 1; seed <= 8; seed++) {
      const s = new S(seed, wide)
      const b = s.put({ unit: 'battery', shape: 'unlimbered', men: menOf(s, 'battery'), fire: 'at will' })
      const fr = s.put({ x: 110, z: 600, bar: 10000 })
      const en = s.put({ side: 1, z: 600, heading: PI, bar: 10000 })
      s.advance(120)
      friends += FULL.infantry - s.men(fr)
      foes += FULL.infantry - s.men(en)
      credited += s.w.f.pts[s.slot(b)] - L[1].points
    }
    expect(friends).toBeGreaterThan(0)
    // the credits are the enemy's expected losses: near the men it lost, nowhere near both sides'
    expect(Math.abs(credited / P.man - foes)).toBeLessThan(Math.max(4, foes * 0.5))
    expect(credited / P.man).toBeLessThan(foes + friends / 2)
  })
})
