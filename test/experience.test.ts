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
  type Command,
  type LevelDef,
  type Ruleset,
} from '../src/sim/index.ts'

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
// a full formation of the unit: 400 men, a battery its slots
const menOf = (s: Sim, unit?: string): number =>
  unit === 'battery' ? s.w.cr.types.find(t => t.def.artillery)!.slots : 400
class S extends Sim {
  constructor(seed = 1, rs: Ruleset = napoleonic) {
    super(seed, rs, FIELD, OPEN_DATA)
  }
  put(c: Partial<Spawn>): number {
    const slot = this.w.free[this.w.meta[1] - 1]
    this.cmd({ type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'line', men: 400, fire: 'hold', ...c })
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
    s.put({ side: 1, z: art ? 200 : 100, heading: PI, bar: 10000 })
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
    const t = s.put({ level: target, side: 1, z: art ? 150 : 50, heading: PI, bar: 10000 })
    s.advance(sec)
    sum += 400 - s.men(t)
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
        expect(base).toBeGreaterThan(200)
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
      const cav = s.put({ unit: 'cavalry', z: -170, men: 256 })
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
      const cav = s.put({ level: lv, unit: 'cavalry', z: -100, men: 256, bar: 10000 })
      s.order({ type: 'charge', id: cav, target: foe })
      s.until(() => s.w.f.chPhase[s.slot(cav)] !== CH_PURSUIT, 120)
      expect(outOfFight(s.w.f.mstate[s.slot(foe)])).toBe(true)
      const ticks = s.w.f.chUntil[s.slot(cav)] - s.w.meta[M_TICK]
      expect(ticks).toBe(Math.round(napoleonic.types.cavalry.charge!.pursue * L[lv - 1].pursue * 20))
    }
  })
})
