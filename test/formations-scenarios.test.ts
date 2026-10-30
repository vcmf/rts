// The formations' scenarios (docs/proposals/formations.md § 4, docs/proposals/unit-scenarios.md § B): what each
// shape's strengths and weaknesses give in play, on the shipped ruleset on the open field. B-12 and B-13 (the assault)
// come with U3; B-16 and B-17 (the thin line) with step C3.
import { describe, it, expect } from 'vitest'
import { Sim, OPEN_DATA, openBattlefield, paint, longIt } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { compileRuleset, moraleShare, outOfFight } from '../src/sim/index.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const PI = Math.PI
const FIELD = openBattlefield()
const sim = (seed: number) => new Sim(seed, napoleonic, FIELD, OPEN_DATA)

// what a shooter in `shape` kills in `sec` seconds at `gap` metres of a line that does not answer
function killed(shape: string, seed: number, gap = 50, sec = 300): number {
  const s = sim(seed)
  s.spawn(0, 0, 0, shape, FULL.infantry, 0)
  const t = s.spawn(0, gap, PI, 'line', FULL.infantry, 1)
  s.order({ type: 'fire', id: t, mode: 'hold' })
  s.advance(sec)
  return FULL.infantry - s.men(t)
}

describe('B-11: a line and an attack column exchange fire at 50 m', () => {
  longIt('the column fires about 0.3 of the line (its head, and the trait over what its depth masks)', () => {
    let line = 0
    let column = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      line += killed('line', seed)
      column += killed('column', seed)
    }
    expect(column / line).toBeGreaterThan(0.2)
    expect(column / line).toBeLessThan(0.4)
  })
  longIt('both firing, the line wins clearly', () => {
    for (const seed of [1, 2, 3]) {
      const s = sim(seed)
      const ln = s.spawn(0, 0, 0, 'line', FULL.infantry, 0)
      const col = s.spawn(0, 50, PI, 'column', FULL.infantry, 1)
      s.until(() => !outOfFight(s.w.f.mstate[s.slot(ln)]) && !outOfFight(s.w.f.mstate[s.slot(col)]), 1200)
      expect(outOfFight(s.w.f.mstate[s.slot(col)])).toBe(true)
      expect(outOfFight(s.w.f.mstate[s.slot(ln)])).toBe(false)
      expect(FULL.infantry - s.men(col)).toBeGreaterThan(2 * (FULL.infantry - s.men(ln)))
    }
  })
})

describe('B-15: a square under a battery (held there by cavalry, the 27th at Waterloo)', () => {
  longIt('bleeds far faster than a line in the same place', () => {
    const lost = (shape: string, seed: number) => {
      const s = sim(seed)
      s.spawn(0, 0, 0, 'unlimbered', FULL.battery, 0, 'battery')
      const t = s.spawn(0, 400, PI, shape, FULL.infantry, 1)
      s.order({ type: 'fire', id: t, mode: 'hold' })
      s.advance(300)
      return FULL.infantry - s.men(t)
    }
    let line = 0
    let square = 0
    for (const seed of [1, 2, 3]) {
      line += lost('line', seed)
      square += lost('square', seed)
    }
    expect(square).toBeGreaterThan(1.5 * line)
  })
})

describe("B-19: an attack column takes a line's fire in its flank", () => {
  longIt('enfiladed, it loses more and its morale falls further than fired on head on', () => {
    const run = (flank: boolean, seed: number) => {
      const s = sim(seed)
      const col = s.spawn(0, 0, 0, 'column', FULL.infantry, 1)
      s.order({ type: 'fire', id: col, mode: 'hold' })
      // a line 50 m off its right side facing it, or 50 m ahead of its head
      s.spawn(flank ? 50 : 0, flank ? -8 : 50, flank ? -PI / 2 : PI, 'line', FULL.infantry, 0)
      s.advance(120)
      return { lost: FULL.infantry - s.men(col), share: moraleShare(s.w, s.slot(col)) }
    }
    let front = { lost: 0, share: 0 }
    let side = { lost: 0, share: 0 }
    for (const seed of [1, 2, 3]) {
      const a = run(false, seed)
      const b = run(true, seed)
      front = { lost: front.lost + a.lost, share: front.share + a.share }
      side = { lost: side.lost + b.lost, share: side.share + b.share }
    }
    expect(side.lost).toBeGreaterThan(front.lost)
    expect(side.share).toBeLessThan(front.share)
  })
})

describe('B-20: a column and a line through rough ground', () => {
  const run = (shape: string) => {
    const woods = paint(FIELD, [{ x0: -60, z0: 20, x1: 60, z1: 120, cls: 'woods' }], compileRuleset(napoleonic))
    const s = new Sim(1, napoleonic, woods, OPEN_DATA)
    const h = s.spawn(0, 0, 0, shape, FULL.infantry, 0)
    s.order({ type: 'move', id: h, points: [[0, 140]], append: false })
    let worst = 0
    const t = s.until(() => {
      worst = Math.max(worst, s.w.f.disorder[s.slot(h)])
      return s.busy(h)
    }, 900)
    return { t, worst }
  }
  it('the column keeps its pace: through 100 m of wood it arrives well before the line', () => {
    expect(run('column').t).toBeLessThan(0.9 * run('line').t)
  })
  // not today (docs/plans/active/formations.md, C2's results): the disorder model reads the lag across a front, so
  // a line meeting a straight edge keeps its order, and a deep column crossing it loses all of its own
  it.fails('the column keeps its order, the line loses its own', () => {
    expect(run('column').worst).toBeLessThan(run('line').worst)
  })
})
