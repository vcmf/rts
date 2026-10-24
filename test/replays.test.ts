// Replays at their edges (docs/systems/sim-spine.md, Replays): what `play` reports when the recording and the run
// disagree in ways test/spine.test.ts does not try, and the properties a replay rests on: the same log gives the
// same hashes, a recording is made of the external commands only, and two worlds in one process never share state.
import { describe, it, expect } from 'vitest'
import {
  record,
  play,
  makeWorld,
  issue,
  advanceTick,
  hashWorld,
  makeHandle,
  KIND_FORMATION,
  SIM_VERSION,
  M_TICK,
  type World,
  type Command,
  type Scenario,
} from '../src/sim/index.ts'
import { attachScenario } from '../src/sim/plan.ts'
import { s1aDrill } from '../src/scenarios/s1a-drill.ts'
import { s1cFirefight } from '../src/scenarios/s1c-firefight.ts'
import { chargeFight } from '../src/scenarios/s1d-charge.ts'
import { data, shipped as cr, OPEN_DATA, openBattlefield } from './fx.ts'

const A = makeHandle(KIND_FORMATION, 0, 0)
const B = makeHandle(KIND_FORMATION, 1, 0)
// the drill with a few orders of its own early on, so a short recording has a log
const orders = (w: World, external: (c: Command) => void): void => {
  const t = w.meta[M_TICK]
  if (t === 30) external({ type: 'form', id: A, shape: 'column' })
  if (t === 30) external({ type: 'face', id: B })
  if (t === 95) external({ type: 'debug-kill', id: A, men: 5 })
  if (t === 150) external({ type: 'halt', id: B })
}
const TICKS = 300
const run = record(data, cr, s1aDrill, 7, TICKS, orders)

describe('play: what it reports', () => {
  it('the recording plays back clean, and its log holds the external commands only', () => {
    expect(play(run.replay, data, cr, s1aDrill, run.hashes)).toBeNull()
    expect(run.replay.log.map(s => [s.tick, s.cmd.type])).toEqual([
      [31, 'form'],
      [31, 'face'],
      [96, 'debug-kill'],
      [151, 'halt'],
    ])
    expect(run.hashes.map(h => h.tick)).toEqual(Array.from({ length: TICKS / 20 }, (_, k) => (k + 1) * 20))
  })
  it('a malformed command records and plays back; in place of a real one it is a mismatch, not a throw', () => {
    const junk = { type: 'nonsense', id: A } as unknown as Command
    const bad = record(data, cr, s1aDrill, 7, 60, (w, external) => {
      if (w.meta[M_TICK] === 10) external(junk)
    })
    expect(bad.replay.log.map(s => s.cmd)).toEqual([{ type: 'refused', reason: 'unknown command' }])
    expect(play(bad.replay, data, cr, s1aDrill, bad.hashes)).toBeNull()
    const log = run.replay.log.map((s, k) => (k === 0 ? { ...s, cmd: junk } : s))
    expect(play({ ...run.replay, log }, data, cr, s1aDrill, run.hashes)).toMatchObject({ tick: 40 })
  })
  it('refuses a replay from another sim version', () => {
    expect(() => play({ ...run.replay, simVersion: SIM_VERSION + 'x' }, data, cr, s1aDrill, run.hashes)).toThrow(
      /replay from sim/,
    )
  })
  it('names a logged sequence number that the re-issued command does not get', () => {
    const log = run.replay.log.map((s, k) => (k === 2 ? { ...s, seq: s.seq + 1 } : s))
    const m = play({ ...run.replay, log }, data, cr, s1aDrill, run.hashes)
    expect(m).toMatchObject({ tick: 96, section: 'command log', expected: `command seq ${log[2].seq}` })
  })
  it('a missing or an extra hash point is a mismatch, not a pass', () => {
    const fewer = play(run.replay, data, cr, s1aDrill, run.hashes.slice(0, -1))
    expect(fewer).toMatchObject({ tick: TICKS, expected: 'no more hashes' })
    const more = [...run.hashes, { ...run.hashes[0], tick: TICKS + 20 }]
    expect(play(run.replay, data, cr, s1aDrill, more)).toMatchObject({ expected: `${more.length} hashes` })
  })
  it('a recording without section hashes still finds the tick, and says it cannot name the table', () => {
    const bare = run.hashes.map(h => ({ ...h, sections: [] }))
    expect(play(run.replay, data, cr, s1aDrill, bare)).toBeNull()
    const log = run.replay.log.map(s => (s.cmd.type === 'debug-kill' ? { ...s, cmd: { ...s.cmd, men: 6 } } : s))
    expect(play({ ...run.replay, log }, data, cr, s1aDrill, bare)).toMatchObject({ tick: 100, section: 'not recorded' })
  })
  it('another seed is caught at the first hash point', () => {
    const m = play({ ...run.replay, seed: run.replay.seed + 1 }, data, cr, s1aDrill, run.hashes)
    // the seed keys the keyed draws and is state (meta): the first hash differs, in the meta section
    expect(m).toMatchObject({ tick: 20, section: 'meta' })
  })
})

describe('determinism: the same inputs, the same hashes', () => {
  it('a recording made twice gives the same log and hashes', () => {
    const again = record(data, cr, s1aDrill, 7, TICKS, orders)
    expect(again.replay).toEqual(run.replay)
    expect(again.hashes).toEqual(run.hashes)
  })
  it('another seed gives another battle: the seed reaches the draws', () => {
    // a firefight: who falls in each volley is drawn
    const hashesOf = (seed: number) => {
      const w = makeWorld(data, cr, seed)
      attachScenario(w, s1cFirefight)
      s1cFirefight.setup(w)
      const out: number[] = []
      while (w.meta[M_TICK] < 1200) {
        const r = advanceTick(w)
        if (r.hash !== null) out.push(r.hash)
      }
      return { out, men: [...w.f.men.slice(0, 2 * cr.maxC)] }
    }
    const a = hashesOf(1)
    expect(hashesOf(1)).toEqual(a)
    expect(hashesOf(2).men).not.toEqual(a.men)
  })
  it('two worlds stepped in turn in one process give the hashes each gives alone', () => {
    // the sim keeps scratch buffers in its modules and in each world: none may carry one world's state to another
    const charge = chargeFight('cavalry')
    const make = (s: Scenario, d: typeof data, seed: number, open: boolean): World => {
      const w = makeWorld(d, cr, seed, true, open ? openBattlefield() : undefined)
      attachScenario(w, s)
      s.setup(w)
      return w
    }
    const alone = (s: Scenario, d: typeof data, seed: number, open: boolean): number[] => {
      const w = make(s, d, seed, open)
      const out: number[] = []
      for (let k = 0; k < 1000; k++) out.push(advanceTick(w).hash ?? 0)
      return out
    }
    const fire = alone(s1cFirefight, data, 3, false)
    const cav = alone(charge, OPEN_DATA, 4, true)
    const a = make(s1cFirefight, data, 3, false)
    const b = make(charge, OPEN_DATA, 4, true)
    const ta: number[] = []
    const tb: number[] = []
    for (let k = 0; k < 1000; k++) {
      ta.push(advanceTick(a).hash ?? 0)
      tb.push(advanceTick(b).hash ?? 0)
    }
    expect(ta).toEqual(fire)
    expect(tb).toEqual(cav)
    expect(hashWorld(a)).not.toBe(hashWorld(b))
  })
  it('commands stamped for one tick apply in the order they were issued', () => {
    // sequence order is the order of application: a halt then a move leaves the move; a move then a halt does not
    const final = (cmds: Command[]): number => {
      const w = makeWorld(data, cr, 1)
      s1aDrill.setup(w)
      for (let k = 0; k < 40; k++) advanceTick(w)
      for (const c of cmds) issue(w, c)
      advanceTick(w)
      return w.f.ordHead[0]
    }
    const move: Command = { type: 'move', id: A, points: [[-45, 60]], append: false }
    const halt: Command = { type: 'halt', id: A }
    expect(final([halt, move])).toBeGreaterThanOrEqual(0)
    expect(final([move, halt])).toBe(-1)
  })
})
