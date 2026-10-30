// The visual bench's harness (docs/plans/active/c0-bench.md; docs/proposals/collision-and-orders.md, § The bench):
// its cases played in Node, and the two invariants every case is checked for. The tests are split over several files
// (test/bench*.test.ts) because vitest runs files in parallel and a file's tests one after another
// (docs/plans/active/ci-faster-tests.md).
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { root } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { BENCH_CASES, CLAIM_CASES, BENCH_SCALE, type BenchCase } from '../src/scenarios/bench.ts'
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
  M_TICK,
  TICK_HZ,
  O_MOVE,
  type World,
} from '../src/sim/index.ts'

const data = loadSimData(new Uint8Array(fs.readFileSync(path.join(root, 'data/bench.simdata'))), MAP_VERSIONS.bench)
const cr = compileRuleset(napoleonic)
/** The bench case (plain or with claims) of that id. */
export const caseOf = (id: string): BenchCase => [...BENCH_CASES, ...CLAIM_CASES].find(c => c.id === id)!

/**
 * Plays a case for `seconds` (its own length by default), calling `each` every `every` ticks; under `rules`, else the
 * shipped ruleset.
 */
export function play(
  c: BenchCase,
  opts: { seconds?: number; reverse?: boolean; every?: number; each?: (w: World) => void; rules?: typeof cr } = {},
): World {
  const w = makeWorld(data, opts.rules ?? cr, 1)
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

/**
 * Plays a case forward, watching it: the first tick two formations both in the fight overlap (−1 if none), and the
 * world it ends in, the same as `play`'s. Placing the men fills the sim's slot cache (`w.scratch.filled`), so the
 * watching places them with a cache of its own and leaves the sim's as the sim left it.
 */
export function watched(c: BenchCase, seconds?: number): { first: number; w: World } {
  let first = -1
  let P: ReturnType<typeof mkPlaced> | null = null
  let own: World['scratch']['filled']
  const w = play(c, {
    seconds,
    every: 10,
    each: w => {
      if (first >= 0) return
      const sims = w.scratch.filled
      w.scratch.filled = own
      P ??= mkPlaced(w)
      if (formedOverlaps(w, placeAll(w, P)).length) first = w.meta[M_TICK]
      own = w.scratch.filled
      w.scratch.filled = sims
    },
  })
  return { first, w }
}

/** The moves a formation has queued, as [x, z] in its case's own coordinates (before the bench's scale). */
export const moves = (w: World, i: number): [number, number][] => {
  const out: [number, number][] = []
  for (let n = w.f.ordHead[i]; n >= 0; n = w.ord.next[n]) {
    if (w.ord.type[n] === O_MOVE) out.push([w.ord.x[n] / BENCH_SCALE, w.ord.z[n] / BENCH_SCALE])
  }
  return out
}
/** Whether formation `i` stands within `d` m of (x, z), a point in its case's own coordinates (scaled as the case). */
export const near = (w: World, i: number, x: number, z: number, d: number) =>
  Math.hypot(w.f.x[i] - x * BENCH_SCALE, w.f.z[i] - z * BENCH_SCALE) < d

/**
 * The state but for which pool entries the orders took: the pool is served in visiting order, so two orders made in
 * one tick take their entries the other way round in the reversed order (docs/systems/fire-morale.md, Open
 * questions). The pool and the formations' links into it are left out, and each queue is compared by what is in it.
 */
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

/** Every `n`th case, from the `k`th: one file's share of a list of cases. */
export const share = <T>(cases: readonly T[], k: number, n: number): T[] => cases.filter((_, i) => i % n === k)

/**
 * Registers the two invariants for each case, under the describes' titles: invariant 1 (no two formed bodies overlap)
 * and invariant 4 (the visiting order changes nothing). Both read one forward play of the case, played by whichever
 * test runs first; invariant 4 plays it reversed too. A case in `overlapToday` or `orderToday` fails that invariant
 * today (`it.fails`).
 */
export function invariants(
  cases: readonly BenchCase[],
  titles: { overlap: string; order: string },
  today: { overlap?: ReadonlySet<string>; order?: ReadonlySet<string> } = {},
): void {
  const seen = new Map<string, { first: number; state: ReturnType<typeof stateOf> }>()
  const forward = (c: BenchCase) => {
    let r = seen.get(c.id)
    if (!r) {
      const { first, w } = watched(c)
      seen.set(c.id, (r = { first, state: stateOf(w) }))
    }
    return r
  }
  describe(titles.overlap, () => {
    for (const c of cases) {
      const test = today.overlap?.has(c.id) ? it.fails : it
      test(`${c.id}`, () => expect(forward(c).first).toBe(-1))
    }
  })
  describe(titles.order, () => {
    for (const c of cases) {
      const test = today.order?.has(c.id) ? it.fails : it
      test(`${c.id}`, () => expect(stateOf(play(c, { reverse: true }))).toEqual(forward(c).state))
    }
  })
}

// x14 (forty battalions) is played on its own (test/bench.test.ts): five minutes, not its full length
export const BIG = new Set(['x14-forty-crossing', 'x14-forty-crossing-claims'])

// today formations pass through each other: these cases overlap (and C1–C3 make them pass)
export const OVERLAP_TODAY = new Set([
  'x02-meet',
  'x05-into-friend',
  'x06-three-on-a-gap',
  'x07-threading',
  'x08-wheel-into-friend',
  'x09-square-forming',
  'x13-passage-of-lines',
  'x14-forty-crossing',
  'x16-friend-behind', // the veteran pursues the router through the regiment behind it
  'x17-enemy-behind', // the same, through a regiment of its own side
  'x18-flank-charge', // after the rout two of its regiments pass through each other
])
// every step reversed, the formation step too: a charge steers at its target as moved earlier in that step, so two
// regiments charging each other, or one pursuing a router, depend on their slots today (#187)
export const ORDER_TODAY = new Set([
  'x01-clash',
  'q02-charge-in-a-chain', // at the division scale the charge's result follows the slots' order too
  'x18-flank-charge',
])

/** The plain cases' invariants, the `k`th of `n` shares. */
export const plainInvariants = (k: number, n: number) =>
  invariants(
    share(
      BENCH_CASES.filter(c => !BIG.has(c.id)),
      k,
      n,
    ),
    { overlap: 'invariant 1: no two formed bodies overlap', order: 'invariant 4: the visiting order changes nothing' },
    { overlap: OVERLAP_TODAY, order: ORDER_TODAY },
  )

/**
 * The claim grid's prototype (docs/plans/active/c1-claims.md): the same cases with formations claiming cells, the
 * `k`th of `n` shares. None still overlaps: a change of shape claims its sweep and a router forms only where it fits
 * (step 3 of docs/plans/active/c1-claims.md). Every step reversed, the claims step formations in a keyed order,
 * whatever the slots, so the two regiments of X-01 (#187 without claims) give the same state too.
 */
export const claimInvariants = (k: number, n: number) =>
  invariants(
    share(
      CLAIM_CASES.filter(c => !BIG.has(c.id)),
      k,
      n,
    ),
    { overlap: 'with claims: invariant 1', order: 'with claims: invariant 4, the keyed order' },
  )
