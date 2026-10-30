// The battle report (tools/battle-report.ts, docs/plans/active/s1e3-playtest.md): a saved session played back with
// its marks, and a session that does not reproduce refused.
import { describe, it, expect } from 'vitest'
import { battleData, data, longIt } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { s1eBattle } from '../src/scenarios/s1e-battle.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import {
  compileRuleset,
  record,
  formationHandle,
  formationSlot,
  makeWorld,
  issue,
  advanceTick,
  TICK_HZ,
  type Scenario,
} from '../src/sim/index.ts'
import { reportSession, reporter, type Session } from '../tools/battle-report.ts'

const cr = compileRuleset(napoleonic)
const T = 150 * TICK_HZ

describe('the battle report', () => {
  // two and a half minutes: your western battalion forms column at 10 s; a mark at 90 s
  const rec = record(battleData, cr, s1eBattle, 7, T, (w, ext) => {
    if (w.meta[0] === 10 * TICK_HZ) ext({ type: 'form', id: formationHandle(w, 0), shape: 'column' })
  })
  const session: Session = { ...rec, marks: [{ tick: 90 * TICK_HZ, note: 'the column' }] }
  it("plays a session back: its orders, the scenario's plan, and at each mark where everyone stood", () => {
    const lines = reportSession(battleData, cr, s1eBattle, session)
    expect(lines[0]).toBe('s1e-battle, a session of 02:30 with 1 orders and 1 marks')
    expect(lines).toContain('00:10  side 0 #0 infantry: forming column')
    expect(lines.some(l => /^0[01]:\d\d {2}side 0 #0 infantry: column$/.test(l))).toBe(true)
    const m = lines.indexOf('01:30  MARK the column')
    expect(m).toBeGreaterThan(0)
    expect(lines.slice(m + 1, m + 17).every(l => / men at \(-?\d+, -?\d+\)$/.test(l))).toBe(true) // the 16 formations
    // the end table (side 1's battery has hit it)
    expect(lines).toContain('  side 0 #0 infantry: column, steady, 229 of 240 men')
  })
  it('refuses a session that does not reproduce', () => {
    const bad: Session = {
      ...session,
      hashes: session.hashes.map((h, k) => (k === 3 ? { ...h, hash: h.hash ^ 1 } : h)),
    }
    expect(() => reportSession(battleData, cr, s1eBattle, bad)).toThrow(/does not reproduce/)
  })
  it("reports the first played tick's changes, as with no orders: the reporter starts before it", () => {
    // the scenarios spawn in tick 1, which the report passes over silently; one whose setup has played that tick
    // already, so an order changes a battalion's shape in the first tick play() plays (tick 2)
    const begun: Scenario = {
      ...s1eBattle,
      setup: w => {
        s1eBattle.setup(w)
        advanceTick(w)
      },
    }
    const first = record(battleData, cr, begun, 7, 5 * TICK_HZ, (w, ext) => {
      if (w.meta[0] === 1) ext({ type: 'form', id: formationHandle(w, 0), shape: 'column' })
    })
    expect(first.replay.log.map(e => e.tick)).toEqual([2])
    const lines = reportSession(battleData, cr, begun, first)
    expect(lines).toContain('00:00  side 0 #0 infantry: forming column')
  })
  it('refuses marks out of tick order, past the end, or with a note that is not text', () => {
    const marked = (marks: unknown): Session => ({ ...session, marks: marks as Session['marks'] })
    const run = (marks: unknown) => () => reportSession(battleData, cr, s1eBattle, marked(marks))
    expect(
      run([
        { tick: 90, note: 'b' },
        { tick: 30, note: 'a' },
      ]),
    ).toThrow(/mark 2: at tick 30, before the mark/)
    expect(run([{ tick: T + 1, note: 'late' }])).toThrow(/mark 1: its tick is not one of the replay's/)
    expect(run([{ tick: 1.5, note: 'half' }])).toThrow(/mark 1: its tick/)
    expect(run([{ tick: 30, note: 7 }])).toThrow(/mark 1: its note is not text/)
    expect(run([{ tick: 30 }])).toThrow(/mark 1: its note is not text/)
    expect(run({ tick: 30, note: 'a' })).toThrow(/marks are not a list/)
  })
  it('names who left the field, with its men, and who was destroyed, each by its own side', () => {
    // on the open 360 m field, as in morale.test.ts with the sides swapped: side 1's #1 breaks, is shattered and
    // runs west off the field; its #2 loses every man
    const w = makeWorld(levelled(data), cr, 1)
    issue(w, { type: 'side', side: 0, x: 1, z: 0 })
    issue(w, { type: 'side', side: 1, x: -1, z: 0 })
    const spawn = (side: number, x: number, z: number, heading: number) =>
      issue(w, { type: 'debug-spawn', side, x, z, heading, shape: 'line', men: 100, fire: 'hold' })
    spawn(0, 170, -35, -Math.PI / 2)
    spawn(1, -60, -35, Math.PI / 2)
    spawn(1, -60, 40, Math.PI / 2)
    advanceTick(w)
    const runner = formationHandle(w, 1)
    const r = reporter(w)
    w.f.bar[1] = -100 // breaks at the next tick
    r.tick(advanceTick(w))
    issue(w, { type: 'debug-kill', id: runner, men: 51 })
    issue(w, { type: 'debug-kill', id: formationHandle(w, 2), men: 100 })
    for (let n = 0; n < 20 * 240 && formationSlot(w, runner) >= 0; n++) r.tick(advanceTick(w))
    const lines = r.end()
    expect(lines.some(l => /^\d\d:\d\d {2}side 1 #1 \S+ left the field \(49 men\)$/.test(l))).toBe(true)
    expect(lines.some(l => /^\d\d:\d\d {2}side 1 #2 \S+ destroyed$/.test(l))).toBe(true)
    expect(lines.some(l => /side 0 #[12]/.test(l))).toBe(false)
  })
  // the battle to its end: about 20 minutes of play
  longIt('with no orders, stops a minute after the end', () => {
    const lines = reportSession(battleData, cr, s1eBattle, null, 40 * 60 * TICK_HZ)
    const end = lines.findIndex(l => / {2}THE END: /.test(l))
    expect(end).toBeGreaterThan(0)
    const [m, s] = lines[end].slice(0, 5).split(':').map(Number)
    const stop = `${String(m + 1).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    expect(lines[0]).toBe(`s1e-battle, no orders, ${stop}, stopped a minute after the end`)
  })
  it('with no session, runs the scenario with no orders', () => {
    const lines = reportSession(battleData, cr, s1eBattle, null, 60 * TICK_HZ)
    expect(lines[0]).toBe('s1e-battle, no orders, 01:00')
    expect(lines).toContain('01:00  in the fight: side 0 100%, side 1 100%')
  })
})
