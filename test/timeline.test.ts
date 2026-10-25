// The bench's timeline (src/app/timeline.ts, docs/plans/active/c0-bench.md): going back to a tick and playing on gives
// the world the first pass gave, orders logged after the tick included; the same tick is the same world however it
// was reached; an order given there branches the timeline, and the session still replays; the saves stay evenly
// spaced; a tick played again that gives another world is caught, and leaves the timeline as it was.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { root, longIt } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { BENCH_CASES } from '../src/scenarios/bench.ts'
import {
  mkTimeline,
  order,
  step,
  mark,
  goTo,
  begin,
  SNAP_EVERY,
  MAX_SNAPS,
  type Timeline,
} from '../src/app/timeline.ts'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  attachScenario,
  deserialize,
  hashWorld,
  play,
  unitHandle,
  SIM_VERSION,
  M_TICK,
  type World,
} from '../src/sim/index.ts'

const data = loadSimData(new Uint8Array(fs.readFileSync(path.join(root, 'data/bench.simdata'))), MAP_VERSIONS.bench)
const cr = compileRuleset(napoleonic)
const scenario = BENCH_CASES.find(c => c.id === 'x05-into-friend')!.scenario
const fresh = (): World => {
  const w = makeWorld(data, cr, 1, false)
  attachScenario(w, scenario)
  scenario.setup(w)
  return w
}
const load = (bytes: Uint8Array): World => {
  const w = deserialize(bytes, data, cr, false)
  attachScenario(w, scenario)
  return w
}
const move = (x: number) => ({
  type: 'move' as const,
  id: unitHandle(0),
  points: [[x, 40]] as [number, number][],
  append: false,
})
// plays to tick T, giving the friendly line a move as the world stands at each tick of `at`
function run(tl: Timeline, w: World, T: number, at: number[] = []): World {
  while (w.meta[M_TICK] < T) {
    if (at.includes(w.meta[M_TICK])) order(tl, w, move(100))
    step(tl, w)
  }
  return w
}
const back = (tl: Timeline, T: number, now?: World) => goTo(tl, T, fresh, load, now)

describe('timeline', () => {
  it('going back and playing on gives the first pass, with the orders logged after the tick', () => {
    const tl = mkTimeline()
    const end = hashWorld(run(tl, begin(tl, fresh()), 2400, [1000]))
    for (const T of [700, 1300]) expect(hashWorld(run(tl, back(tl, T), 2400))).toBe(end)
  })
  it('the same tick is the same world, stepped to or gone to; an order there keeps what the world holds', () => {
    const tl = mkTimeline()
    run(tl, begin(tl, fresh()), 2000, [1000])
    const stepped = run(tl, back(tl, 995), 1000)
    const steppedNext = tl.next
    const jumped = back(tl, 1000)
    expect(hashWorld(stepped)).toBe(hashWorld(jumped))
    expect(tl.next).toBe(steppedNext)
    // the order logged for tick 1001 is pending in both: a new order now keeps it
    order(tl, jumped, move(-100))
    expect(tl.log.map(s => s.tick)).toEqual([1001, 1001])
  })
  it('an order given on a save tick, after the save, is taken again from that save', () => {
    const tl = mkTimeline()
    const end = hashWorld(run(tl, begin(tl, fresh()), 3 * SNAP_EVERY, [SNAP_EVERY]))
    expect(hashWorld(run(tl, back(tl, SNAP_EVERY + 5), 3 * SNAP_EVERY))).toBe(end)
  })
  it('going forward past the furthest tick takes every hash point, with no gap', () => {
    const tl = mkTimeline()
    run(tl, begin(tl, fresh()), 500)
    back(tl, 1700)
    const ticks = tl.hashes.map(h => h.tick)
    expect(ticks).toEqual(ticks.map((_, k) => (k + 1) * 20))
    expect(ticks.at(-1)).toBe(1700)
  })
  longIt(
    'keeps at most MAX_SNAPS saves, evenly spaced',
    () => {
      const tl = mkTimeline()
      run(tl, begin(tl, fresh()), (MAX_SNAPS + 10) * SNAP_EVERY)
      expect(tl.snaps.length).toBeLessThanOrEqual(MAX_SNAPS)
      expect(tl.every).toBe(2 * SNAP_EVERY)
      expect(tl.snaps.map(s => s.tick)).toEqual(tl.snaps.map((_, k) => (k + 1) * tl.every))
      // going back among the thinned saves, and a branch early on brings the interval back down
      const end = hashWorld(run(tl, back(tl, 5 * SNAP_EVERY + 7), (MAX_SNAPS + 10) * SNAP_EVERY))
      const w = back(tl, 3 * SNAP_EVERY + 7)
      expect(hashWorld(run(tl, back(tl, 3 * SNAP_EVERY + 7), (MAX_SNAPS + 10) * SNAP_EVERY))).toBe(end)
      order(tl, back(tl, 3 * SNAP_EVERY + 7), move(-100))
      expect(tl.every).toBe(SNAP_EVERY)
      expect(w.meta[M_TICK]).toBe(3 * SNAP_EVERY + 7)
    },
    60_000,
  )
  it('an order after going back drops the future, its marks too, and the session replays', () => {
    const tl = mkTimeline()
    const w0 = run(tl, begin(tl, fresh()), 1800, [1000])
    mark(tl, w0, 'later')
    run(tl, w0, 2400)
    const w = back(tl, 800)
    order(tl, w, move(-100))
    expect(tl.log.map(s => s.tick)).toEqual([801])
    expect(tl.marks).toEqual([])
    expect(tl.hashes.every(h => h.tick <= 800) && tl.snaps.every(s => s.tick <= 800)).toBe(true)
    run(tl, w, 2000)
    const replay = { simVersion: SIM_VERSION, dataVersion: data.version, ruleset: cr.hash, scenario: scenario.name }
    expect(play({ ...replay, seed: 1, ticks: 2000, log: tl.log }, data, cr, scenario, tl.hashes)).toBeNull()
    // going back again plays the branch
    const end = hashWorld(w)
    expect(hashWorld(run(tl, back(tl, 1300), 2000))).toBe(end)
  })
  it('a tick played again that gives another world throws, and leaves the timeline as it was', () => {
    const tl = mkTimeline()
    run(tl, begin(tl, fresh()), 900, [300])
    tl.hashes.find(h => h.tick === 600)!.hash += 1
    const before = JSON.stringify({ ...tl, snaps: tl.snaps.length })
    expect(() => back(tl, 700)).toThrow(/played again/)
    expect(JSON.stringify({ ...tl, snaps: tl.snaps.length })).toBe(before)
  })
  it("a tick of the page's own world that gives another world breaks the timeline until it goes to a time", () => {
    const tl = mkTimeline()
    run(tl, begin(tl, fresh()), 900, [500])
    const w = back(tl, 590)
    tl.hashes.find(h => h.tick === 600)!.hash += 1
    expect(() => run(tl, w, 620)).toThrow(/played again/)
    expect(w.meta[M_TICK]).toBe(600)
    // it refuses to tick on, and the world it broke on was handed its next orders
    expect(() => step(tl, w)).toThrow(/played again/)
    expect(tl.log[tl.next - 1].tick).toBeLessThanOrEqual(601)
    // going to a time mends it (the tampered point is the copy's to check again: put it right first)
    tl.hashes.find(h => h.tick === 600)!.hash -= 1
    const v = back(tl, 610)
    expect(tl.broken).toBe('')
    expect(v.meta[M_TICK]).toBe(610)
  })
  it('a branch on a save tick keeps the order already logged for the next tick, and the session replays', () => {
    const tl = mkTimeline()
    run(tl, begin(tl, fresh()), 2400, [SNAP_EVERY * 2])
    // back to the save tick: the order stamped for its next tick is pending, and a new one keeps it
    const w = back(tl, SNAP_EVERY * 2)
    order(tl, w, move(-100))
    expect(tl.log.map(s => s.tick)).toEqual([SNAP_EVERY * 2 + 1, SNAP_EVERY * 2 + 1])
    run(tl, w, 2000)
    const replay = { simVersion: SIM_VERSION, dataVersion: data.version, ruleset: cr.hash, scenario: scenario.name }
    expect(play({ ...replay, seed: 1, ticks: 2000, log: tl.log }, data, cr, scenario, tl.hashes)).toBeNull()
  })
  it('going to a time from the world as it stands plays only what is left, and the hash points stay whole', () => {
    const tl = mkTimeline()
    const w = run(tl, begin(tl, fresh()), 790, [300])
    const v = back(tl, 799, w)
    expect(v.meta[M_TICK]).toBe(799)
    run(tl, v, 1400)
    const replay = { simVersion: SIM_VERSION, dataVersion: data.version, ruleset: cr.hash, scenario: scenario.name }
    expect(play({ ...replay, seed: 1, ticks: 1400, log: tl.log }, data, cr, scenario, tl.hashes)).toBeNull()
  })
})
