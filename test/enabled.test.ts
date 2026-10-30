// A unit's enabled formations (docs/plans/active/formations.md § C3): each shape of its type it may form or not, by
// unit; its type's set by default, a spawn's own, and the `enable` command (later research, a general).
import { describe, it, expect } from 'vitest'
import { Sim, OPEN_DATA, openBattlefield } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { compileRuleset, type Ruleset } from '../src/sim/index.ts'
import { unitCard } from '../src/app/unit-card.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const inf = napoleonic.types.infantry
// infantry whose type enables only these shapes
const only = (enabled: string[]): Ruleset => ({
  ...napoleonic,
  types: { ...napoleonic.types, infantry: { ...inf, enabled } },
})
const sim = (rs: Ruleset = napoleonic) => new Sim(1, rs, openBattlefield(rs), OPEN_DATA)
// the reasons the command was dropped, applied now
function why(s: Sim, c: Parameters<Sim['cmd']>[0]): string[] {
  const n = s.dropped.length
  s.order(c)
  return s.dropped.slice(n).map(d => d.reason)
}

describe('enabled formations', () => {
  it("every shape by default; the type's set compiled as a bit per shape", () => {
    const U = compileRuleset(napoleonic).types[0]
    expect(U.enabled).toBe((1 << U.shapes.length) - 1)
    const V = compileRuleset(only(['line', 'column'])).types[0]
    expect(V.enabled).toBe((1 << V.shapeIndex('line')) | (1 << V.shapeIndex('column')))
  })
  it('refuses a type whose set names no shape of it, or leaves out its start', () => {
    expect(() => compileRuleset(only(['line', 'phalanx']))).toThrow(/enabled shape phalanx is not one of its shapes/)
    expect(() => compileRuleset(only(['column']))).toThrow(/its start shape line is not enabled/)
  })
  it('refuses a form into a shape not enabled, and takes it once enabled', () => {
    const s = sim(only(['line', 'column']))
    const h = s.spawn(0, 0, 0, 'line', FULL.infantry)
    expect(why(s, { type: 'form', id: h, shape: 'square' })).toEqual(['formation not enabled'])
    expect(why(s, { type: 'enable', id: h, shape: 'square' })).toEqual([])
    expect(why(s, { type: 'form', id: h, shape: 'square' })).toEqual([])
    expect(s.shape(h)).toBe('line → square')
  })
  it("a spawn's own set: it must hold the shape it spawns in", () => {
    const s = sim()
    expect(why(s, { type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, men: 50, forms: 'line' })).toEqual([])
    expect(
      why(s, { type: 'debug-spawn', side: 0, x: 100, z: 0, heading: 0, shape: 'square', men: 50, forms: 'line' }),
    ).toEqual(['formation not enabled'])
    expect(why(s, { type: 'debug-spawn', side: 0, x: 100, z: 0, heading: 0, men: 50, forms: 'line,wedge' })).toEqual([
      'no such shape',
    ])
  })
  it('disabled while it stands in it, it keeps the shape until it forms another; a form queued before is dropped', () => {
    const s = sim()
    const h = s.spawn(0, 0, 0, 'line', FULL.infantry)
    s.order({ type: 'enable', id: h, shape: 'line', on: false })
    expect(s.shape(h)).toBe('line')
    s.cmd({ type: 'form', id: h, shape: 'column' })
    s.cmd({ type: 'enable', id: h, shape: 'column', on: false })
    s.tick()
    s.advance(1)
    expect(s.shape(h)).toBe('line')
    expect(s.orders(h)).toBe(0)
  })
  it('the standing behaviour does not form a refuge that is not enabled', () => {
    for (const on of [true, false]) {
      const s = sim()
      const h = s.spawn(0, 0, 0, 'line', FULL.infantry, 1)
      if (!on) s.order({ type: 'enable', id: h, shape: 'square', on: false })
      s.spawn(0, -150, 0, 'line', FULL.cavalry, 0, 'cavalry')
      s.advance(30)
      expect(s.shape(h).includes('square')).toBe(on)
    }
  })
  it('disabling the shape it is changing into turns the change back; a form back into the shape it leaves is taken', () => {
    const s = sim()
    const h = s.spawn(0, 0, 0, 'line', FULL.infantry)
    s.order({ type: 'form', id: h, shape: 'column' })
    s.advance(5)
    s.order({ type: 'enable', id: h, shape: 'column', on: false })
    expect(s.shape(h)).toBe('line → line') // turned back: from where its sections stand, into line
    const g = s.spawn(200, 0, 0, 'line', FULL.infantry)
    s.order({ type: 'enable', id: g, shape: 'line', on: false })
    s.order({ type: 'form', id: g, shape: 'column' })
    s.advance(5)
    expect(why(s, { type: 'form', id: g, shape: 'line' })).toEqual([])
    expect(s.shape(g)).toBe('line → line')
  })
  it('a shape disabled while it sheltered in the square: it does not form back into it, and stays in the square', () => {
    const s = sim()
    const h = s.spawn(0, 0, 0, 'column', FULL.infantry, 1)
    const c = s.spawn(0, -150, 0, 'line', FULL.cavalry, 0, 'cavalry')
    s.until(() => s.shape(h) !== 'square', 120)
    expect(s.shape(h)).toBe('square')
    s.order({ type: 'enable', id: h, shape: 'column', on: false })
    s.order({ type: 'move', id: c, append: false, points: [[0, -600]] })
    s.advance(180)
    expect(s.shape(h)).toBe('square')
    expect(s.w.f.autoFrom[s.slot(h)]).toBe(0)
  })
  it('the info box lists what it may form and what not', () => {
    const s = sim()
    const h = s.spawn(0, 0, 0, 'line', FULL.infantry, 0)
    s.order({ type: 'enable', id: h, shape: 'march', on: false })
    expect(unitCard(s.w, s.slot(h)).join('\n')).toContain('formations: line, square, column (not enabled: march)')
  })
})
