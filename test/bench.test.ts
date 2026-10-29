// The visual bench's cases (docs/plans/active/c0-bench.md; docs/proposals/collision-and-orders.md, § The bench),
// played in Node. Each case's invariants and outcome are written as the proposal wants them; those today's sim fails
// are `it.fails`, with today's behaviour beside them, and C1–C4 turn them into plain tests as they land. The
// invariants of every case but X-14 are in test/bench-plain-*.test.ts and test/bench-claim-*.test.ts
// (test/bench-fx.ts); here X-14, the queue and the melee.
import { describe, it, expect } from 'vitest'
import { longIt } from './fx.ts'
import { caseOf, play, watched, moves, near } from './bench-fx.ts'
import { typeOf, MS_ROUTING, RP_HALTED, menOf, M_TICK, TICK_HZ, type World } from '../src/sim/index.ts'

// forty battalions: five minutes is enough for their paths to cross
describe('invariant 1: no two formed bodies overlap', () => {
  longIt.fails('x14-forty-crossing', () => expect(watched(caseOf('x14-forty-crossing'), 300).first).toBe(-1), 120_000)
})
describe('with claims: invariant 1', () => {
  longIt(
    'x14-forty-crossing-claims',
    () => expect(watched(caseOf('x14-forty-crossing-claims'), 300).first).toBe(-1),
    180_000,
  )
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
    ['x17-enemy-behind-claims', [0, 1]],
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
