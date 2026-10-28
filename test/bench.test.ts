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
  RP_HALTED,
  menOf,
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
  'x05-into-friend',
  'x06-three-on-a-gap',
  'x07-threading',
  'x08-wheel-into-friend',
  'x09-square-forming',
  'x11-rally-in-a-friend', // the router runs to the map's edge and rallies there, inside the friend that stands there
  'x13-passage-of-lines',
  'x14-forty-crossing',
  'x16-friend-behind', // the veteran pursues the router through the regiment behind it
  'x17-enemy-behind', // the same, through a regiment of its own side
  'x18-flank-charge', // after the rout two of its regiments pass through each other
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
  'x15-melee-holds',
  'x16-friend-behind',
  'x17-enemy-behind',
  'x18-flank-charge',
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

// whether slot 0, broken, has tried every direction of its fan and is halted (morale.ts: five)
const noWay = (w: World): boolean => w.f.mstate[0] >= MS_ROUTING && w.f.routPhase[0] === RP_HALTED && w.f.runs[0] >= 5
// a melee holds (docs/plans/active/c1-claims.md, step 4): a veteran regiment charges a raw one at the halt (X-15),
// with a friend (X-16) or an enemy (X-17) just behind the raw one. Played to its end: where the watched stood when
// the raw one's (slot 0's) melee began and at its last tick in it (a break, or a fall-back after it, faces it about),
// and when it broke
function untilRout(id: string, watch = [0, 1]) {
  const out = { melee: -1, rout: -1, z: [] as number[][], at: [] as number[][] }
  play(caseOf(id), {
    every: 1,
    each: w => {
      if (out.melee < 0 && w.f.foe[0]) {
        out.melee = w.meta[M_TICK]
        out.z = watch.map(i => [w.f.x[i], w.f.z[i]])
      }
      if (out.rout < 0 && w.f.mstate[0] >= MS_ROUTING) out.rout = w.meta[M_TICK]
      if (w.f.foe[0] && w.f.mstate[0] < MS_ROUTING) out.at = watch.map(i => [w.f.x[i], w.f.z[i]])
    },
  })
  return out
}
describe('with claims: a melee holds', () => {
  // X-15, played once for the cases that read it
  let x15: ReturnType<typeof untilRout> | null = null
  const open = () => (x15 ??= untilRout('x15-melee-holds-claims'))
  for (const [id, watch] of [
    ['x15-melee-holds-claims', [0, 1]],
    ['x16-friend-behind-claims', [0, 1]],
    // not X-17: an enemy just behind the raw regiment drains it to shaken (decision 0081), and the impact breaks it at
    // contact, with no melee to hold (its router's cases are below)
    ['x19-offset-lines-claims', [0, 1]],
    ['x20-brigade-lines-claims', [0, 1, 2, 3]],
  ] as const) {
    it(`${id}: nobody gives ground; the raw regiment stands where the melee found it until it ends`, () => {
      const a = id === 'x15-melee-holds-claims' ? open() : untilRout(id, [...watch])
      expect(a.melee).toBeGreaterThan(0)
      expect(a.rout).toBeGreaterThan(a.melee)
      watch.forEach((_, k) => a.at[k].forEach((v, d) => expect(v).toBeCloseTo(a.z[k][d], 6)))
    })
  }
  it('X-18: the broken regiment runs clear of the regiment it fought', () => {
    // the pair once stood in each other's cores, and the router, still on its foe's cells, could not move off them
    let broke = false
    const w = play(caseOf('x18-flank-charge-claims'), {
      every: 1,
      each: w => void (broke ||= w.f.mstate[0] >= MS_ROUTING),
    })
    expect(broke).toBe(true)
    expect(w.f.alive[0]).toBe(1)
    expect(w.f.z[0]).toBeGreaterThan(80)
  })
  it('X-17: a router with an enemy just behind it, held on every way out, is cut down where it stands', () => {
    let pinned = -1
    let menThen = 0
    const w = play(caseOf('x17-enemy-behind-claims'), {
      every: 1,
      each: w => {
        if (pinned >= 0 || !w.f.alive[0] || !noWay(w)) return
        pinned = w.meta[M_TICK]
        menThen = menOf(w, 0)
      },
    })
    // held 2 s, then the fan's four other directions, one every 5 s
    expect(pinned / TICK_HZ).toBeGreaterThan(29.4 + 20)
    expect(menThen).toBeGreaterThan(0)
    // no one leaves the field: it is cut down where it stands
    expect(w.sides.left[1]).toBe(0)
    expect(w.f.alive[0] ? menOf(w, 0) : 0).toBeLessThan(menThen / 2)
  })
  it('X-17: a router held on every way out runs once its way clears', () => {
    // the regiment just behind it is gone (its men struck off, reaped that tick) once every way has been tried
    let at = -1
    let far = 0
    play(caseOf('x17-enemy-behind-claims'), {
      seconds: 120,
      every: 1,
      each: w => {
        if (!w.f.alive[0]) return
        if (at >= 0) far = Math.max(far, w.f.z[0])
        if (at >= 0 || !noWay(w)) return
        at = w.meta[M_TICK]
        w.f.men.fill(0, 2 * w.cr.maxC, 3 * w.cr.maxC)
      },
    })
    expect(at).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(80)
  })
})
