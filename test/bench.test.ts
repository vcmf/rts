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
  MS_ROUTING,
  ROUND_PINNED,
  ROUND_STEPPED,
  ROUND_FOLLOWED,
  ROUND_FELL_BACK,
  stepWhole,
  formationHandle,
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
  'x18-pinned-from-the-flank', // after the rout two of its regiments pass through each other
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
const ORDER_TODAY = new Set([
  'x01-clash',
  'x15-pushed-back',
  'x16-pushed-onto-friend',
  'x17-pushed-onto-enemy',
  'x18-pinned-from-the-flank',
  'x20-brigade-lines',
])
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

// a melee's rounds (docs/plans/active/c1-claims.md, step 4): a veteran regiment charges a raw one at the halt (X-15),
// with a friend (X-16) or an enemy (X-17) just behind the raw one. Played until the raw one (slot 0) breaks
function untilRout(id: string, watch = [0, 1]) {
  const out = { melee: -1, rout: -1, z: [] as number[], at: [] as number[], pinned: -1, stepped: 0, followed: 0 }
  play(caseOf(id), {
    every: 1,
    each: w => {
      if (out.melee < 0 && w.f.foe[0]) {
        out.melee = w.meta[M_TICK]
        out.z = watch.map(i => w.f.z[i])
      }
      const S = w.scratch.melee
      if (S && S.roundAt[0] === w.meta[M_TICK] && out.rout < 0) {
        if (out.pinned < 0 && S.round[0] === ROUND_PINNED) out.pinned = w.meta[M_TICK]
        if (S.round[0] === ROUND_STEPPED) out.stepped++
        if (S.round[1] === ROUND_FOLLOWED) out.followed++
      }
      if (out.rout < 0 && w.f.mstate[0] >= MS_ROUTING) {
        out.rout = w.meta[M_TICK]
        out.at = watch.map(i => w.f.z[i])
      }
    },
  })
  return out
}
// plays the world on until battalion i's next round; the melee step's record of it
function untilRound(w: World, i: number) {
  const start = w.meta[M_TICK]
  while (!(w.scratch.melee && w.scratch.melee.roundAt[i] > start)) advanceTick(w)
  return w.scratch.melee
}
describe("with claims: a melee's rounds", () => {
  // X-15 with claims, played once for the cases that compare with it
  let x15: ReturnType<typeof untilRout> | null = null
  const open = () => (x15 ??= untilRout('x15-pushed-back-claims'))
  it('X-15: the raw regiment steps back round by round and the veteran follows it', () => {
    const a = open()
    const b = untilRout('x15-pushed-back')
    expect(a.melee).toBeGreaterThan(0)
    expect(a.rout).toBeGreaterThan(a.melee)
    expect(b.rout).toBeGreaterThan(b.melee)
    // it stood at z 40 facing south: two rounds lost, 2 m each, northward; without claims it stands
    expect(a.at[0]).toBeCloseTo(44, 6)
    expect(b.at[0]).toBeCloseTo(40, 6)
    expect(a.at[1] - a.z[1]).toBeCloseTo(4, 6)
    expect(a.pinned).toBe(-1)
  })
  it('X-16: a friend behind it: it steps back until the friend is in the way, then is pinned', () => {
    const a = open()
    const b = untilRout('x16-pushed-onto-friend-claims')
    expect(b.at[0]).toBeCloseTo(42, 6)
    expect(b.pinned).toBeGreaterThan(b.melee)
    expect(b.rout).toBeLessThanOrEqual(a.rout)
  })
  it('X-17: an enemy just behind it: it is pinned at once and breaks sooner', () => {
    const a = open()
    const b = untilRout('x17-pushed-onto-enemy-claims')
    expect(b.at[0]).toBeCloseTo(40, 6)
    expect(b.pinned).toBeGreaterThan(b.melee)
    expect(b.rout - b.melee).toBeLessThan(a.rout - a.melee)
  })
  it('X-18: a steady regiment steps back round by round until a charge in its flank breaks it', () => {
    const a = untilRout('x18-pinned-from-the-flank-claims')
    expect(a.melee).toBeGreaterThan(0)
    expect(a.stepped).toBeGreaterThanOrEqual(1)
    expect(a.followed).toBe(a.stepped)
    expect(a.rout).toBeGreaterThan(a.melee)
  })
  it('X-19: two lines offset 20 m are judged and step back as two lines met square on', () => {
    // (after a minute its squadrons in contact are spent and the melee ends; it faces about, wavering)
    const a = untilRout('x19-offset-lines-claims')
    expect(a.rout).toBeGreaterThan(a.melee)
    expect(a.stepped).toBeGreaterThanOrEqual(2)
    expect(a.followed).toBe(a.stepped)
  })
  it('X-20: in a brigade line both raw regiments step back, each followed by its own veteran', () => {
    const a = untilRout('x20-brigade-lines-claims', [0, 1, 2, 3])
    expect(a.at[0]).toBeGreaterThan(a.z[0] + 3.9)
    expect(a.at[1]).toBeGreaterThan(a.z[1] + 3.9)
    expect(a.at[2] - a.z[2]).toBeCloseTo(a.at[0] - a.z[0], 6)
  })
  it('a loser with a second enemy on its flank is pinned, not stepped back', () => {
    // X-16 as the melee starts; the friend behind made an enemy on the raw one's east flank, fighting it
    const w = play(caseOf('x16-pushed-onto-friend-claims'), { seconds: 26 })
    const f = w.f
    expect(f.foe[0]).not.toBe(0)
    f.side[2] = f.side[1]
    f.heading[2] = -Math.PI / 2
    f.x[2] = 80
    f.z[2] = 42
    f.foe[2] = formationHandle(w, 0)
    const R = untilRound(w, 0)
    expect(R.round[0]).toBe(ROUND_PINNED)
    expect(f.z[0]).toBeCloseTo(40, 6)
  })
  it('a step its foe cannot follow keeps the melee; the loser has fallen back alone', () => {
    // X-15 as the melee starts; the veteran (the winner) fought on its east flank by a third regiment
    const w = play(caseOf('x16-pushed-onto-friend-claims'), { seconds: 26 })
    const f = w.f
    f.side[2] = f.side[0]
    f.heading[2] = -Math.PI / 2
    f.x[2] = 82
    f.z[2] = 34
    f.foe[2] = formationHandle(w, 1)
    const z0 = f.z[0]
    const z1 = f.z[1]
    const R = untilRound(w, 0)
    expect(R.round[0]).toBe(ROUND_FELL_BACK)
    expect(f.z[0]).toBeCloseTo(z0 + 2, 6)
    expect(f.z[1]).toBeCloseTo(z1, 6)
    expect(f.foe[0]).toBe(formationHandle(w, 1))
  })
  it('a refused step leaves the formation exactly where it stood', () => {
    // X-17: the enemy just behind refuses the raw one's step, whatever its direction off the axes
    const w = play(caseOf('x17-pushed-onto-enemy-claims'), { seconds: 26 })
    const f = w.f
    // northward into it, 200 directions and lengths that are not round numbers (an undo by subtraction drifts by an
    // ulp in about one in a hundred)
    f.x[0] += 0.37295000000836644
    f.z[0] += 0.0137219903
    const x = f.x[0]
    const z = f.z[0]
    for (let k = 0; k < 200; k++) {
      const a = 0.7 * Math.sin(k * 1.618)
      const d = 8.5 + 0.731 * Math.cos(k * 2.414)
      expect(stepWhole(w, 0, Math.sin(a) * d, Math.cos(a) * d, -1)).toBe(false)
      expect([f.x[0], f.z[0]]).toEqual([x, z])
    }
  })
})
