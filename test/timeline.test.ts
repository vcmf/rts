// The bench's timeline (src/app/timeline.ts, docs/plans/active/c0-bench.md): going back to a tick and playing on gives
// the world the first pass gave, orders logged after the tick included; an order given there branches the log, and
// the session still replays.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { root } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { BENCH_CASES } from '../src/scenarios/bench.ts'
import { mkTimeline, order, step, goTo, SNAP_EVERY, MAX_SNAPS, type Timeline } from '../src/app/timeline.ts'
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
// plays to tick T, giving the friendly line a move at tick 1000 (it marches off) when `orders`
function run(tl: Timeline, w: World, T: number, orders = true): World {
  while (w.meta[M_TICK] < T) {
    if (orders && w.meta[M_TICK] === 1000) {
      order(tl, w, { type: 'move', id: unitHandle(0), points: [[100, 40]], append: false })
    }
    step(tl, w)
  }
  return w
}
const hashAt = (tl: Timeline, tick: number) => tl.hashes.find(h => h.tick === tick)!.hash

describe('timeline', () => {
  it('going back and playing on gives the first pass, with the orders logged after the tick', () => {
    const tl = mkTimeline()
    const first = run(tl, fresh(), 2400)
    const end = hashWorld(first)
    expect(tl.log.length).toBe(1)
    // back before the order (from a fresh world), and from a save after it
    for (const T of [700, 1300]) {
      const w = run(tl, goTo(tl, T, fresh, load), 2400, false)
      expect(w.meta[M_TICK]).toBe(2400)
      expect(hashWorld(w)).toBe(end)
    }
  })
  it('a tick back is the tick as first seen', () => {
    const tl = mkTimeline()
    run(tl, fresh(), 2 * SNAP_EVERY + 50)
    const w = goTo(tl, 2 * SNAP_EVERY + 19, fresh, load)
    expect(w.meta[M_TICK]).toBe(2 * SNAP_EVERY + 19)
    const again = run(tl, w, 2 * SNAP_EVERY + 20, false)
    expect(hashWorld(again)).toBe(hashAt(tl, 2 * SNAP_EVERY + 20))
  })
  it('an order on the tick after a save is taken again from that save', () => {
    const tl = mkTimeline()
    const w = run(tl, fresh(), SNAP_EVERY, false)
    order(tl, w, { type: 'move', id: unitHandle(0), points: [[100, 40]], append: false })
    const end = hashWorld(run(tl, w, 3 * SNAP_EVERY, false))
    const back = goTo(tl, SNAP_EVERY + 5, fresh, load)
    expect(hashWorld(run(tl, back, 3 * SNAP_EVERY, false))).toBe(end)
  })
  it('going forward past the furthest tick takes every hash point, with no gap', () => {
    const tl = mkTimeline()
    run(tl, fresh(), 500)
    goTo(tl, 1700, fresh, load)
    const ticks = tl.hashes.map(h => h.tick)
    expect(ticks).toEqual(ticks.map((_, k) => (k + 1) * 20))
    expect(ticks.at(-1)).toBe(1700)
  })
  it('keeps at most MAX_SNAPS saves, thinning the old ones', () => {
    const tl = mkTimeline()
    run(tl, fresh(), (MAX_SNAPS + 10) * SNAP_EVERY, false)
    expect(tl.snaps.length).toBeLessThanOrEqual(MAX_SNAPS)
    expect(tl.snaps.at(-1)!.tick).toBe((MAX_SNAPS + 10) * SNAP_EVERY)
    expect(tl.snaps[0].tick).toBe(SNAP_EVERY)
  })
  it('an order after going back forgets the old future, and the session replays', () => {
    const tl = mkTimeline()
    run(tl, fresh(), 2400)
    const w = goTo(tl, 800, fresh, load)
    order(tl, w, { type: 'move', id: unitHandle(0), points: [[-100, 40]], append: false })
    expect(tl.log.map(s => s.tick)).toEqual([801])
    expect(tl.hashes.every(h => h.tick <= 800)).toBe(true)
    run(tl, w, 2000, false)
    const replay = {
      simVersion: SIM_VERSION,
      dataVersion: data.version,
      ruleset: cr.hash,
      scenario: scenario.name,
      seed: 1,
      ticks: 2000,
      log: tl.log,
    }
    expect(play(replay, data, cr, scenario, tl.hashes)).toBeNull()
  })
  it('going back after a branch plays the branch, not the old future', () => {
    const tl = mkTimeline()
    run(tl, fresh(), 2400)
    const w = goTo(tl, 800, fresh, load)
    order(tl, w, { type: 'move', id: unitHandle(0), points: [[-100, 40]], append: false })
    expect(tl.snaps.every(s => s.tick <= 800)).toBe(true)
    const end = hashWorld(run(tl, w, 2000, false))
    expect(hashWorld(run(tl, goTo(tl, 1300, fresh, load), 2000, false))).toBe(end)
  })
})
