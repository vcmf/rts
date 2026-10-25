// The visual bench's cases (docs/plans/active/c0-bench.md; docs/proposals/collision-and-orders.md, § The bench),
// played in Node. Each case's invariants and outcome are written as the proposal wants them; those today's sim fails
// are `it.fails`, with today's behaviour beside them, and C1–C4 turn them into plain tests as they land.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { root, longIt } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { BENCH_CASES, CLAIM_CASES, type BenchCase } from '../src/scenarios/bench.ts'
import {
  loadSimData,
  compileRuleset,
  makeWorld,
  attachScenario,
  advanceTick,
  mkPlaced,
  placeAll,
  formedOverlaps,
  sectionHashes,
  typeOf,
  M_TICK,
  TICK_HZ,
  O_MOVE,
  type World,
} from '../src/sim/index.ts'

const data = loadSimData(new Uint8Array(fs.readFileSync(path.join(root, 'data/bench.simdata'))), MAP_VERSIONS.bench)
const cr = compileRuleset(napoleonic)
const caseOf = (id: string): BenchCase => [...BENCH_CASES, ...CLAIM_CASES].find(c => c.id === id)!

// plays a case for `seconds` (its own length by default), calling `each` every `every` ticks
function play(
  c: BenchCase,
  opts: { seconds?: number; reverse?: boolean; every?: number; each?: (w: World) => void } = {},
) {
  const w = makeWorld(data, cr, 1)
  if (opts.reverse) {
    w.scratch.reverse = true
    w.scratch.reverseMoves = true
  }
  attachScenario(w, c.scenario)
  c.scenario.setup(w)
  const end = Math.round((opts.seconds ?? c.seconds) * TICK_HZ)
  while (w.meta[M_TICK] < end) {
    advanceTick(w)
    if (opts.each && w.meta[M_TICK] % (opts.every ?? 10) === 0) opts.each(w)
  }
  return w
}
// the first tick two formations both in the fight overlap, or −1
function firstOverlap(c: BenchCase, seconds?: number): number {
  let first = -1
  let P: ReturnType<typeof mkPlaced> | null = null
  play(c, {
    seconds,
    every: 10,
    each: w => {
      if (first >= 0) return
      P ??= mkPlaced(w)
      if (formedOverlaps(w, placeAll(w, P)).length) first = w.meta[M_TICK]
    },
  })
  return first
}
// the moves a formation has queued, as [x, z]
const moves = (w: World, i: number): [number, number][] => {
  const out: [number, number][] = []
  for (let n = w.f.ordHead[i]; n >= 0; n = w.ord.next[n]) {
    if (w.ord.type[n] === O_MOVE) out.push([w.ord.x[n], w.ord.z[n]])
  }
  return out
}
const near = (w: World, i: number, x: number, z: number, d: number) => Math.hypot(w.f.x[i] - x, w.f.z[i] - z) < d

// today formations pass through each other: these cases overlap (and C1–C3 make them pass)
const OVERLAP_TODAY = new Set([
  'x02-meet',
  'x03-brigade-charge', // the charging regiment rides on into the regiments it meets
  'x05-into-friend',
  'x06-three-on-a-gap',
  'x07-threading',
  'x08-wheel-into-friend',
  'x09-square-forming',
  'x11-rally-in-a-friend', // the router runs to the map's edge and rallies there, inside the friend that stands there
  'x13-passage-of-lines',
  'x14-forty-crossing',
])

describe('invariant 1: no two formed bodies overlap', () => {
  for (const c of BENCH_CASES) {
    if (c.id === 'x14-forty-crossing') continue
    const test = OVERLAP_TODAY.has(c.id) ? it.fails : it
    test(`${c.id}`, () => expect(firstOverlap(c)).toBe(-1))
  }
  // forty battalions: five minutes is enough for their paths to cross
  longIt.fails('x14-forty-crossing', () => expect(firstOverlap(caseOf('x14-forty-crossing'), 300)).toBe(-1), 120_000)
})

// the state but for which pool entries the orders took: the pool is served in visiting order, so two orders made in
// one tick take their entries the other way round in the reversed order (docs/systems/fire-morale.md, Open
// questions). The pool and the formations' links into it are left out, and each queue is compared by what is in it
const stateOf = (w: World) => ({
  sections: sectionHashes(w).filter(([n]) => n !== 'order pool' && n !== 'formations'),
  // the formations but for their queues' first and last entries in the pool
  formations: Object.entries(w.f)
    .filter(([k]) => k !== 'ordHead' && k !== 'ordTail')
    .map(([k, v]) => [k, Array.from(v as ArrayLike<number>)]),
  queues: [...w.f.alive].map((a, i) => {
    const q: number[] = []
    for (let n = w.f.ordHead[i]; a && n >= 0; n = w.ord.next[n]) q.push(w.ord.type[n], w.ord.x[n], w.ord.z[n])
    return q
  }),
})
// every step reversed, the formation step too: a charge steers at its target as moved earlier in that step, so two
// regiments charging each other depend on their slots today (#187)
const ORDER_TODAY = new Set(['x01-clash'])
describe('invariant 4: the visiting order changes nothing', () => {
  for (const c of BENCH_CASES) {
    if (c.id === 'x14-forty-crossing') continue
    const test = ORDER_TODAY.has(c.id) ? it.fails : it
    test(`${c.id}`, () => expect(stateOf(play(c, { reverse: true }))).toEqual(stateOf(play(c))))
  }
})

describe('the queue', () => {
  // today a form or a Face about replaces the queue: only a move appends (C4)
  it.fails('Q-01: each appended order runs in turn', () => {
    const w = play(caseOf('q01-shift-chain'))
    expect(typeOf(w, 0).shapes[w.f.shape[0]].name).toBe('line')
    expect(Math.cos(w.f.heading[0])).toBeLessThan(-0.9) // faced about, to the south
    expect(near(w, 0, 0, -150, 10)).toBe(true)
  })
  // today the charge's pursuit clears the queue, and the move after it is lost (#179, C4)
  it.fails('Q-02: the move after a charge runs once the charge ends', () => {
    const w = play(caseOf('q02-charge-in-a-chain'))
    expect(near(w, 0, -180, -150, 15)).toBe(true)
  })
  it('Q-03: the queue resumes after the square', () => {
    let squared = false
    const w = play(caseOf('q03-square-in-a-chain'), {
      each: v => {
        squared ||= typeOf(v, 0).shapes[v.f.shape[0]].name === 'square'
      },
    })
    expect(squared).toBe(true)
    expect(near(w, 0, 100, 40, 10)).toBe(true)
  })
  it('Q-04: a rout clears the queue', () => {
    const w = play(caseOf('q04-rout-in-a-chain'), { seconds: 60 })
    expect(w.f.mstate[0]).toBeGreaterThanOrEqual(3)
    expect(moves(w, 0).some(([x, z]) => Math.hypot(x - 150, z - 100) < 1)).toBe(false)
  })
  it('Q-05: a plain order replaces the queue', () => {
    const w = play(caseOf('q05-plain-order-in-a-chain'), { seconds: 30 })
    expect(moves(w, 0).map(([x, z]) => [Math.round(x), Math.round(z)])).toEqual([[-150, 100]])
  })
})

// the claim grid's prototype (docs/plans/active/c1-claims.md): the same cases with formations claiming cells
describe('with claims: invariant 1', () => {
  // a router rallies where it stopped, inside the friend: rallies on free ground are not in the prototype
  const STILL = new Set(['x11-rally-in-a-friend-claims'])
  for (const c of CLAIM_CASES) {
    if (c.id === 'x14-forty-crossing-claims') continue
    const test = STILL.has(c.id) ? it.fails : it
    test(`${c.id}`, () => expect(firstOverlap(c)).toBe(-1))
  }
  longIt(
    'x14-forty-crossing-claims',
    () => expect(firstOverlap(caseOf('x14-forty-crossing-claims'), 300)).toBe(-1),
    180_000,
  )
})
describe('with claims: invariant 4, the keyed order', () => {
  for (const c of CLAIM_CASES) {
    if (c.id === 'x14-forty-crossing-claims') continue
    it(`${c.id}`, () => {
      const s = Math.min(c.seconds, 120)
      expect(stateOf(play(c, { seconds: s, reverse: true }))).toEqual(stateOf(play(c, { seconds: s })))
    })
  }
})
