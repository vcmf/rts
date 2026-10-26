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
  giveGround,
  MS_ROUTING,
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
  'x16-pushed-onto-friend', // the veteran pursues the router through the regiment behind it
  'x17-pushed-onto-enemy', // the same, through a regiment of its own side
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
// regiments charging each other, or one pursuing a router, depend on their slots today (#187)
const ORDER_TODAY = new Set(['x01-clash', 'x15-pushed-back', 'x16-pushed-onto-friend', 'x17-pushed-onto-enemy'])
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
  // none left: a change of shape claims its sweep and a router forms only where it fits (step 3 of
  // docs/plans/active/c1-claims.md)
  const STILL = new Set<string>()
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
  // every step reversed: the claims step formations in a keyed order, whatever the slots, so the two regiments of
  // X-01 (#187 without claims) give the same state too
  for (const c of CLAIM_CASES) {
    if (c.id === 'x14-forty-crossing-claims') continue
    it(`${c.id}`, () => expect(stateOf(play(c, { reverse: true }))).toEqual(stateOf(play(c))))
  }
})

// the clash (docs/plans/active/c1-claims.md, step 4): a veteran regiment charges a raw one at the halt (X-15), with a
// friend (X-16) or an enemy (X-17) just behind the raw one. Played until the raw one (slot 0) breaks
function untilRout(id: string) {
  const out = { melee: -1, rout: -1, z1: 0, at: { z0: 0, z1: 0, disorder: 0 } }
  play(caseOf(id), {
    every: 1,
    each: w => {
      if (out.melee < 0 && w.f.foe[0]) {
        out.melee = w.meta[M_TICK]
        out.z1 = w.f.z[1]
      }
      if (out.rout < 0 && w.f.mstate[0] >= MS_ROUTING) {
        out.rout = w.meta[M_TICK]
        out.at = { z0: w.f.z[0], z1: w.f.z[1], disorder: w.f.disorder[0] }
      }
    },
  })
  return out
}
describe('with claims: the clash', () => {
  // X-15 with claims, played once for the three cases
  let x15: ReturnType<typeof untilRout> | null = null
  const open = () => (x15 ??= untilRout('x15-pushed-back-claims'))
  it('X-15: the raw regiment gives ground and the veteran follows it', () => {
    const a = open()
    const b = untilRout('x15-pushed-back')
    expect(a.melee).toBeGreaterThan(0)
    expect(a.rout).toBeGreaterThan(a.melee)
    expect(b.rout).toBeGreaterThan(b.melee)
    // it stood at z 40 facing south: it gave ground northward, and without claims it stands
    expect(a.at.z0).toBeGreaterThan(41)
    expect(b.at.z0).toBeCloseTo(40, 6)
    expect(a.at.z1).toBeGreaterThan(a.z1 + 1)
  })
  it('X-16: held by a friend behind, it gives less ground and loses its order', () => {
    const a = open()
    const b = untilRout('x16-pushed-onto-friend-claims')
    expect(b.rout).toBeGreaterThan(b.melee)
    expect(b.at.z0).toBeLessThan(a.at.z0)
    expect(b.at.disorder).toBeGreaterThan(0.1)
    expect(a.at.disorder).toBeLessThan(0.05)
  })
  it('X-17: held by an enemy behind, it breaks sooner', () => {
    const a = open()
    const b = untilRout('x17-pushed-onto-enemy-claims')
    expect(b.melee).toBeGreaterThan(0)
    expect(b.rout).toBeGreaterThan(b.melee)
    expect(b.rout - b.melee).toBeLessThan(a.rout - a.melee)
  })
  it('a battalion pressed on part of its front bends there; pressed on all of it, it steps back', () => {
    const w = play(caseOf('x15-pushed-back-claims'), { seconds: 1 })
    const f = w.f
    const U = typeOf(w, 0)
    const NB = U.NB
    const B = U.geo.bins
    const x = f.x[0]
    const z = f.z[0]
    // its four squadrons: the middle two engaged
    expect(giveGround(w, 0, 2, [0, 1, 1, 0])).toBeCloseTo(2, 9)
    const lags = Array.from(f.lags.slice(0, NB))
    for (let j = 0; j < 4 * B; j++) expect(lags[j]).toBeCloseTo(j >= B && j < 3 * B ? 2 : 0, 9)
    expect([f.x[0], f.z[0]]).toEqual([x, z])
    // the whole front: the bend comes out as the anchor stepping back (south-facing: back is +z)
    f.lags.fill(0, 0, NB)
    expect(giveGround(w, 0, 2, [1, 1, 1, 1])).toBeCloseTo(2, 9)
    expect(Array.from(f.lags.slice(0, NB)).every(l => Math.abs(l) < 1e-9)).toBe(true)
    expect(f.z[0]).toBeCloseTo(z + 2, 9)
  })
})
