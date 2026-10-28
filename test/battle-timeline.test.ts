// The bench's timeline in the battle (docs/plans/active/battle-threads.md, PR 7; decision 0081): Battle.goTo,
// stepTick, a branch, the soldier layer laid out again; the timeline's tails the sim worker sends (tailOf).
import { describe, it, expect } from 'vitest'
import { dataBytes, GOLDEN_DATA_VERSION } from './fx.ts'
import { loadSimData, compileRuleset, makeHandle, KIND_FORMATION, M_TICK, TICK_HZ, play } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { PAGE_SCENARIOS } from '../src/scenarios/page.ts'
import { Battle, goToTick, tailOf, applyTail, JUMP } from '../src/app/battle.ts'

const data = loadSimData(dataBytes(), GOLDEN_DATA_VERSION)
const cr = compileRuleset(napoleonic)
const scenario = PAGE_SCENARIOS['s1b-field']
const move = (b: Battle, x: number) =>
  b.command({ type: 'move', id: makeHandle(KIND_FORMATION, 0, 1), points: [[x, 0]], append: false })

describe('the battle goes to a time', () => {
  it('back and on again gives the hash first seen; its men are laid out again, their revisions past the old', () => {
    const b = new Battle(data, scenario, cr)
    move(b, -40)
    b.advanceBy(10)
    const at = b.w.meta[M_TICK]
    const first = b.hash()
    const was = b.layer
    const after = was.revAfter()
    expect(b.goTo(at - 50)).toEqual({ tick: at - 50, capped: false, error: '' })
    expect([b.w.meta[M_TICK], b.speed]).toEqual([at - 50, 0])
    expect(b.layer).not.toBe(was)
    expect(Math.min(...[...b.layer.units.values()].map(u => u.rev))).toBeGreaterThanOrEqual(after)
    expect(b.layer.men.n).toBe(was.men.n)
    b.goTo(at - 1)
    b.stepTick()
    expect([b.w.meta[M_TICK], b.hash(), b.tl.warnings]).toEqual([at, first, 0])
  })
  it('an order given back there branches: the later log dropped, the session the new pass, reproduced', () => {
    const b = new Battle(data, scenario, cr)
    move(b, -40)
    b.advanceBy(5)
    move(b, 40)
    b.advanceBy(5)
    const cuts = b.cuts
    b.goTo(2 * TICK_HZ)
    expect(b.log.length).toBe(2)
    expect(b.session().replay.log.length).toBe(1)
    move(b, 0)
    expect(b.cuts).toBeGreaterThan(cuts)
    expect(b.log.map(s => s.tick)).toEqual([1, 2 * TICK_HZ + 1])
    b.advanceBy(3)
    const { replay, hashes } = b.session()
    expect(play(replay, data, cr, scenario, hashes)).toBeNull()
  })
  it('marks a moment at its tick; the session leaves out marks past the world after going back', () => {
    const b = new Battle(data, scenario, cr)
    b.advanceBy(2)
    b.mark('first')
    b.advanceBy(2)
    b.mark('second')
    b.goTo(3 * TICK_HZ)
    expect(b.session().marks.map(m => m.note)).toEqual(['first'])
    expect(b.marks.length).toBe(2)
  })
  it('the target is clamped to the battle and at most five minutes on', () => {
    expect(goToTick(-5, 100, 200, 0)).toEqual({ tick: 0, capped: false })
    // no time limit: ten minutes past the furthest tick played
    expect(goToTick(1e9, 100, 200, 0)).toEqual({ tick: 100 + JUMP, capped: true })
    expect(goToTick(150.4, 100, 200, 120)).toEqual({ tick: 120, capped: false })
    expect(goToTick(200 + 600 * TICK_HZ, 200 + 600 * TICK_HZ - JUMP, 200, 0)).toEqual({
      tick: 200 + 600 * TICK_HZ,
      capped: false,
    })
  })
})

describe("the timeline's tails", () => {
  const [a, b, c, d] = [{ k: 'a' }, { k: 'b' }, { k: 'c' }, { k: 'd' }]
  it('a list only grown sends what was added; one cut or rewritten sends from its first change', () => {
    expect(tailOf([a, b], [a, b, c], true)).toEqual({ keep: 2, add: [c] })
    expect(tailOf([a, b, c], [a, d], false)).toEqual({ keep: 1, add: [d] })
    expect(tailOf([a, b, c], [a], false)).toEqual({ keep: 1, add: [] })
    // a copy of an entry is not the entry: sent again
    expect(tailOf([a, b], [a, { k: 'b' }], false)).toEqual({ keep: 1, add: [{ k: 'b' }] })
  })
  it('applied to the list sent, gives the list now, in place', () => {
    const page = [a, b, c]
    const same = page
    applyTail(page, tailOf([a, b, c], [a, d], false))
    expect(page).toBe(same)
    expect(page).toEqual([a, d])
  })
})
