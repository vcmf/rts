// A scenario's plan at its edges (src/sim/plan.ts, docs/systems/sides.md): when it may be attached, the order its
// steps run in, a target left out, and the time limit alone. test/sides.test.ts covers the plan in a battle.
import { describe, it, expect } from 'vitest'
import {
  makeWorld,
  issue,
  advanceTick,
  attachScenario,
  hashWorld,
  unitHandle,
  formationHandle,
  M_LIMIT,
  M_TICK,
  M_PLAN,
  M_END,
  M_WINNER,
  END_DRAW,
  type PlanStep,
  type World,
} from '../src/sim/index.ts'
import { data, shipped as cr } from './fx.ts'

// a world on the formation field with a battalion on each side (units 0 and 1), the plan attached first
function withPlan(plan: PlanStep[], minutes?: number): World {
  const w = makeWorld(data, cr, 1)
  attachScenario(w, { plan, minutes })
  issue(w, { type: 'debug-spawn', side: 0, x: -60, z: -60, heading: 0, shape: 'line', men: 50 })
  issue(w, { type: 'debug-spawn', side: 1, x: -60, z: 100, heading: 3.14159, shape: 'line', men: 50 })
  advanceTick(w)
  return w
}

describe('attaching a plan', () => {
  it('refuses a step before the first tick', () => {
    const w = makeWorld(data, cr, 1)
    expect(() => attachScenario(w, { plan: [{ at: 0.02, unit: 0, cmd: { type: 'halt' } }] })).toThrow(
      /comes before the first tick/,
    )
  })
  it('refuses a plan attached after the first tick', () => {
    const w = makeWorld(data, cr, 1)
    advanceTick(w)
    expect(() => attachScenario(w, { plan: [{ at: 1, unit: 0, cmd: { type: 'halt' } }] })).toThrow(
      /before the first tick/,
    )
  })
  it('no plan and no limit records nothing: the world hashes as one never attached', () => {
    const a = makeWorld(data, cr, 1)
    const b = makeWorld(data, cr, 1)
    attachScenario(b, {})
    attachScenario(b, { plan: [], minutes: 0 }) // again: still nothing
    expect(hashWorld(b)).toBe(hashWorld(a))
  })
  it('a time limit alone is recorded, and keys the plan hash', () => {
    const a = makeWorld(data, cr, 1)
    attachScenario(a, { minutes: 2 })
    expect(a.meta[M_LIMIT]).toBe(2 * 60 * 20)
    expect(a.meta[M_PLAN]).not.toBe(0)
    const b = makeWorld(data, cr, 1)
    attachScenario(b, { minutes: 3 })
    expect(b.meta[M_PLAN]).not.toBe(a.meta[M_PLAN])
    expect(() => attachScenario(a, { minutes: 3 })).toThrow(/another plan or time limit/)
    attachScenario(a, { minutes: 2 }) // the same again: accepted
  })
})

describe('running a plan', () => {
  it('steps given out of order run at their ticks; on one tick, in the order the plan lists them', () => {
    // at 0.5 s unit 0 is given the preset keep and then push: the later one stands (in the other order, keep would);
    // listed first but due later, at 1 s, unit 1 forms column
    const w = withPlan([
      { at: 1, unit: 1, cmd: { type: 'form', shape: 'column' } },
      { at: 0.5, unit: 0, cmd: { type: 'style', preset: 'keep' } },
      { at: 0.5, unit: 0, cmd: { type: 'style', preset: 'push' } },
    ])
    expect(w.planDue).toEqual([10, 10, 20])
    while (w.meta[M_TICK] < 12) advanceTick(w)
    expect(w.f.style[0]).toBe(cr.presetIndex('push'))
    expect(w.f.trans[1]).toBe(0)
    while (w.meta[M_TICK] < 22) advanceTick(w)
    expect(w.f.trans[1]).toBe(1)
  })
  it('a fire step with a negative target, or none, prefers no target; a unit number names the target', () => {
    const w = withPlan([
      { at: 0.5, unit: 0, cmd: { type: 'fire', mode: 'hold', target: 1 } },
      { at: 1, unit: 0, cmd: { type: 'fire', mode: 'at will', target: -1 } },
      { at: 1.5, unit: 1, cmd: { type: 'fire', mode: 'hold', target: 0 } },
      { at: 2, unit: 1, cmd: { type: 'fire', mode: 'at will' } },
    ])
    while (w.meta[M_TICK] < 10) advanceTick(w)
    expect(w.f.prefer[0]).toBe(unitHandle(1))
    expect(unitHandle(1)).toBe(formationHandle(w, 1))
    while (w.meta[M_TICK] < 20) advanceTick(w)
    expect(w.f.prefer[0]).toBe(0)
    while (w.meta[M_TICK] < 30) advanceTick(w)
    expect(w.f.prefer[1]).toBe(unitHandle(0))
    while (w.meta[M_TICK] < 40) advanceTick(w)
    expect(w.f.prefer[1]).toBe(0)
  })
  it('at the time limit with both sides whole the battle is a draw, decided once', () => {
    const w = withPlan([], 0.05) // 60 ticks
    while (w.meta[M_TICK] < 59) advanceTick(w)
    expect(w.meta[M_END]).toBe(0)
    advanceTick(w)
    expect([w.meta[M_END], w.meta[M_WINNER]]).toEqual([60, END_DRAW])
    advanceTick(w)
    expect(w.meta[M_END]).toBe(60)
  })
})
