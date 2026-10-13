// The battle report (tools/battle-report.ts, docs/plans/active/s1e3-playtest.md): a saved session played back with
// its marks, and a session that does not reproduce refused.
import { describe, it, expect } from 'vitest'
import { battleData } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { s1eBattle } from '../src/scenarios/s1e-battle.ts'
import { compileRuleset, record, formationHandle, TICK_HZ } from '../src/sim/index.ts'
import { reportSession, type Session } from '../tools/battle-report.ts'

const cr = compileRuleset(napoleonic), T = 150 * TICK_HZ

describe('the battle report', () => {
  // two and a half minutes: your western battalion forms column at 10 s; a mark at 90 s
  const rec = record(battleData, cr, s1eBattle, 7, T, (w, ext) => { if (w.meta[0] === 10 * TICK_HZ) ext({ type: 'form', id: formationHandle(w, 0), shape: 'column' }) })
  const session: Session = { ...rec, marks: [{ tick: 90 * TICK_HZ, note: 'the column' }] }
  it('plays a session back: its orders, the scenario\'s plan, and at each mark where everyone stood', () => {
    const lines = reportSession(battleData, cr, s1eBattle, session)
    expect(lines[0]).toBe('s1e-battle, a session of 02:30 with 1 orders and 1 marks')
    expect(lines).toContain('00:10  side 0 #0 infantry: forming column')
    expect(lines.some(l => /^0[01]:\d\d {2}side 0 #0 infantry: column$/.test(l))).toBe(true)
    const m = lines.indexOf('01:30  MARK the column')
    expect(m).toBeGreaterThan(0)
    expect(lines.slice(m + 1, m + 17).every(l => / men at \(-?\d+, -?\d+\)$/.test(l))).toBe(true)   // the 16 formations
    expect(lines).toContain('  side 0 #0 infantry: column, steady, 375 of 400 men')   // the end table (side 1's battery has hit it)
  })
  it('refuses a session that does not reproduce', () => {
    const bad: Session = { ...session, hashes: session.hashes.map((h, k) => k === 3 ? { ...h, hash: h.hash ^ 1 } : h) }
    expect(() => reportSession(battleData, cr, s1eBattle, bad)).toThrow(/does not reproduce/)
  })
  it('with no session, runs the scenario with no orders', () => {
    const lines = reportSession(battleData, cr, s1eBattle, null, 60 * TICK_HZ)
    expect(lines[0]).toBe('s1e-battle, no orders, 01:00')
    expect(lines).toContain('01:00  in the fight: side 0 100%, side 1 100%')
  })
})
