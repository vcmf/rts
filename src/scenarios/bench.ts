// The visual bench's cases (docs/plans/active/c0-bench.md; docs/proposals/collision-and-orders.md, § The bench): the
// hard cases of collision and of the orders' queue, each a page scenario on the flat bench field (maps/bench.ts),
// scripted by its plan so that it plays on its own. They stage today's nearest thing where the sim lacks the rule
// (no infantry assault, no loose bodies, no passage of lines yet), so the bench first shows today's behaviour.
import type { World, Scenario, PlanStep, PlanCommand } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'
import { FULL } from './sizes.ts'

/** A bench case: its scenario, how long it plays, where the page frames it, and the moments worth looking at. */
export interface BenchCase {
  id: string
  title: string
  scenario: Scenario
  seconds: number
  view: [number, number, number]
  keys: number[] // seconds: the moments worth looking at, which the page's readout lists
}

const N = 0 // headings: compass bearings, 0 north (+z), PI/2 east
const E = PI / 2
const S = PI
const W = -PI / 2

type Spawn = {
  side: number
  x: number
  z: number
  heading: number
  shape: string
  unit?: string
  men?: number
  bar?: number // the bar's maximum, points (docs/proposals/morale-bar-model.md)
}
const step = (at: number, unit: number, cmd: PlanCommand): PlanStep => ({ at, unit, cmd })
const move = (x: number, z: number, append = false): PlanCommand => ({ type: 'move', points: [[x, z]], append })

// the cases were placed for S1c's battalions of 400, 93 m wide; at the division scale (240, about 54 m:
// docs/proposals/division-scale.md § 8) every position, move and view is scaled by the width's ratio about the
// field's centre, so formations meet as they did
export const BENCH_SCALE = 0.58
const K = BENCH_SCALE
const scaled = (c: PlanCommand): PlanCommand =>
  c.type === 'move' ? { ...c, points: c.points.map(([x, z]) => [x * K, z * K] as [number, number]) } : c

// a case's setup: each side's rear (south for side 0, north for side 1, so routers run away from the action unless a
// case says otherwise), then its formations in spawn order (the plan's unit numbers), all holding their fire
function bench(
  id: string,
  title: string,
  spawns: Spawn[],
  plan: PlanStep[],
  seconds: number,
  view: [number, number, number],
  keys: number[],
  rears: [number, number][] = [
    [0, -1],
    [0, 1],
  ],
): BenchCase {
  const setup = (w: World) => {
    rears.forEach(([x, z], side) => issue(w, { type: 'side', side, x, z }))
    for (const s of spawns) {
      const men = s.men ?? FULL[(s.unit ?? 'infantry') as keyof typeof FULL]
      issue(w, { type: 'debug-spawn', ...s, x: s.x * K, z: s.z * K, men, fire: 'hold' })
    }
  }
  return {
    id,
    title,
    scenario: {
      name: `bench-${id}`,
      map: 'bench',
      setup,
      plan: plan.map(p => ({ ...p, cmd: scaled(p.cmd) })),
      minutes: seconds / 60,
    },
    seconds,
    view: [view[0] * K, view[1] * K, view[2]],
    keys,
  }
}

const LINE = 'line'
const COL = 'column'
const CAV = 'cavalry'

// the melee's cases (C1, step 4): a veteran regiment charges a raw one at the halt, from 160 m, the veteran `dx`
// metres to the east; `extra` stand beside them. The raw one's bar is 145 (U2): the bar takes the impact's men lost at
// once, with its shock, and a smaller one breaks on contact, with no melee to hold
function charged(id: string, title: string, extra: Spawn[] = [], dx = 0, raw = 145): BenchCase {
  return bench(
    id,
    title,
    [
      { side: 1, x: 0, z: 40, heading: S, shape: LINE, unit: CAV, bar: raw },
      { side: 0, x: dx, z: -120, heading: N, shape: LINE, unit: CAV, bar: 157 },
      ...extra,
    ],
    [step(1, 1, { type: 'charge', target: 0 })],
    90,
    [dx / 2, 20, 3],
    [30, 40, 50],
  )
}

// X-17's raw regiment breaks a little sooner, with men enough to run once its way clears (bench.test.ts)
const RAW17 = 130
export const BENCH_CASES: BenchCase[] = [
  bench(
    'x01-clash',
    'X-01: two regiments charge each other head on (no infantry assault yet; infantry would form square)',
    [
      { side: 0, x: 0, z: -170, heading: N, shape: LINE, unit: CAV },
      { side: 1, x: 0, z: 170, heading: S, shape: LINE, unit: CAV },
    ],
    [step(1, 0, { type: 'charge', target: 1 }), step(1, 1, { type: 'charge', target: 0 })],
    90,
    [0, 0, 3],
    [30, 45, 60],
  ),
  bench(
    'x02-meet',
    'X-02: two lines march into each other with no charge',
    [
      { side: 0, x: 0, z: -80, heading: N, shape: LINE },
      { side: 1, x: 0, z: 80, heading: S, shape: LINE },
    ],
    [step(1, 0, move(0, 80)), step(1, 1, move(0, -80))],
    150,
    [0, 0, 3],
    [80, 100],
  ),
  bench(
    'x03-brigade-charge',
    'X-03: a regiment charges the middle one of three standing regiments; its wing reaches the next one first',
    [
      { side: 1, x: -177, z: 100, heading: S, shape: LINE, unit: CAV },
      { side: 1, x: 0, z: 100, heading: S, shape: LINE, unit: CAV },
      { side: 1, x: 177, z: 100, heading: S, shape: LINE, unit: CAV },
      { side: 0, x: 60, z: -150, heading: N, shape: LINE, unit: CAV },
    ],
    [step(1, 3, { type: 'charge', target: 1 })],
    90,
    [0, 20, 2],
    [40, 55],
  ),
  bench(
    'x04-recoil',
    'X-04: a regiment charges a formed square and rides off from contact',
    [
      { side: 1, x: 0, z: 80, heading: S, shape: 'square' },
      { side: 0, x: 0, z: -140, heading: N, shape: LINE, unit: CAV },
    ],
    [step(1, 1, { type: 'charge', target: 0 })],
    90,
    [0, 0, 3],
    [40, 55],
  ),
  bench(
    'x05-into-friend',
    'X-05: a column marches into a halted friendly line',
    [
      { side: 0, x: 0, z: 40, heading: N, shape: LINE },
      { side: 0, x: 0, z: -120, heading: N, shape: COL },
    ],
    [step(1, 1, move(0, 180))],
    240,
    [0, 30, 3],
    [150, 200],
  ),
  bench(
    'x06-three-on-a-gap',
    'X-06: three battalions ordered to the same point',
    [
      { side: 0, x: -150, z: -100, heading: E, shape: COL },
      { side: 0, x: 150, z: -100, heading: W, shape: COL },
      { side: 0, x: 0, z: -220, heading: N, shape: COL },
    ],
    [step(1, 0, move(0, 0)), step(1, 1, move(0, 0)), step(1, 2, move(0, 0))],
    240,
    [0, -80, 2.5],
    [150, 200],
  ),
  bench(
    'x07-threading',
    'X-07: a column marches between two halted lines 20 m apart, too close for it',
    [
      { side: 0, x: -57, z: 0, heading: N, shape: LINE },
      { side: 0, x: 57, z: 0, heading: N, shape: LINE },
      { side: 0, x: 0, z: -150, heading: N, shape: COL },
    ],
    [step(1, 2, move(0, 150))],
    300,
    [0, 0, 3],
    [150, 200],
  ),
  bench(
    'x08-wheel-into-friend',
    'X-08: a line wheels a quarter turn into a halted friend',
    [
      { side: 0, x: 0, z: 0, heading: N, shape: LINE },
      { side: 0, x: 0, z: 55, heading: E, shape: COL },
    ],
    [step(1, 0, { type: 'wheel', angle: PI / 2 })],
    240,
    [-20, 40, 3],
    [40, 90],
  ),
  bench(
    'x09-square-forming',
    'X-09: a battalion forms square while a friendly column marches through where it forms',
    [
      { side: 0, x: 0, z: 0, heading: N, shape: LINE },
      { side: 0, x: -100, z: 10, heading: E, shape: COL },
    ],
    [step(1, 0, { type: 'form', shape: 'square' }), step(1, 1, move(220, 10))],
    240,
    [0, 0, 3],
    [60, 90, 150],
  ),
  bench(
    'x10-router-through-friends',
    'X-10: a battalion broken by debug-morale runs north through two friendly lines',
    [
      { side: 0, x: 0, z: -150, heading: N, shape: LINE },
      { side: 0, x: 0, z: -50, heading: N, shape: LINE },
      { side: 0, x: 0, z: 50, heading: N, shape: LINE },
    ],
    [step(1, 0, { type: 'debug-morale', bar: -100 })],
    150,
    [0, -20, 2.5],
    [40, 80],
    [
      [0, 1],
      [0, -1],
    ],
  ),
  bench(
    'x11-rally-in-a-friend',
    'X-11: a router runs north into a line by the map edge and rallies where it stops',
    [
      { side: 0, x: 0, z: 150, heading: N, shape: LINE },
      { side: 0, x: 0, z: 295, heading: N, shape: LINE },
    ],
    [step(1, 0, { type: 'debug-morale', bar: -100 })], // its bar's maximum is untouched: it may rally
    150,
    [0, 230, 3],
    [40, 100],
    [
      [0, 1],
      [0, -1],
    ],
  ),
  bench(
    'x12-gunners-to-a-square',
    'X-12: a battery broken by debug-morale runs north past a friendly square',
    [
      { side: 0, x: 0, z: -100, heading: S, shape: 'unlimbered', unit: 'battery' },
      { side: 0, x: 0, z: -20, heading: N, shape: 'square' },
    ],
    [step(1, 0, { type: 'debug-morale', bar: -100 })],
    240,
    [0, -40, 3],
    [80, 160],
    [
      [0, 1],
      [0, -1],
    ],
  ),
  bench(
    'x13-passage-of-lines',
    'X-13: a second line marches through the first',
    [
      { side: 0, x: 0, z: 0, heading: N, shape: LINE },
      { side: 0, x: 0, z: -80, heading: N, shape: LINE },
    ],
    [step(1, 1, move(0, 100))],
    300,
    [0, 0, 3],
    [90, 120, 200],
  ),
  bench(
    'x14-forty-crossing',
    "X-14: forty battalions in four groups of ten, ordered across each other's paths",
    Array.from({ length: 40 }, (_, k): Spawn => {
      const g = Math.floor(k / 10)
      const r = (k % 10) - 4.5
      // west, east, south and north groups, each marching to the far side; 52 m apart, 30 m at the bench's scale,
      // so the 27 m columns stand clear of each other
      const [x, z, heading] = [
        [-260, r * 52, E],
        [260, r * 52 + 20, W],
        [r * 52 + 10, -260, N],
        [r * 52 - 10, 260, S],
      ][g]
      return { side: g % 2, x, z, heading, shape: COL }
    }),
    Array.from({ length: 40 }, (_, k) => {
      const g = Math.floor(k / 10)
      const r = (k % 10) - 4.5
      const [x, z] = [
        [240, r * 52],
        [-240, r * 52 + 20],
        [r * 52 + 10, 240],
        [r * 52 - 10, -240],
      ][g]
      return step(1, k, move(x, z))
    }),
    600,
    [0, 0, 1.4],
    [200, 300],
  ),
  charged(
    'x15-melee-holds',
    'X-15: a veteran regiment charges a raw one at the halt; the melee holds until one breaks',
  ),
  // just behind: 9 m behind the raw one, a depth the bench's scale leaves alone (40 + 9 / K)
  charged('x16-friend-behind', 'X-16: as X-15, with a friendly regiment standing just behind the raw one', [
    { side: 1, x: 0, z: 40 + 9 / K, heading: S, shape: LINE, unit: CAV },
  ]),
  charged(
    'x17-enemy-behind',
    'X-17: as X-15, with an enemy regiment just behind the raw one: broken, it has no way out and is cut down',
    [{ side: 0, x: 0, z: 40 + 9 / K, heading: N, shape: LINE, unit: CAV }],
    0,
    RAW17,
  ),
  bench(
    'x18-flank-charge',
    'X-18: a veteran regiment charges a steady one at the halt; a second regiment charges it in its east flank',
    [
      { side: 1, x: 0, z: 40, heading: S, shape: LINE, unit: CAV, bar: 145 },
      { side: 0, x: 0, z: -120, heading: N, shape: LINE, unit: CAV, bar: 157 },
      { side: 0, x: 170, z: 42, heading: W, shape: COL, unit: CAV, bar: 57 },
    ],
    [step(1, 1, { type: 'charge', target: 0 }), step(20, 2, { type: 'charge', target: 0 })],
    90,
    [60, 20, 3],
    [30, 40, 50],
  ),
  charged('x19-offset-lines', 'X-19: as X-15, the veteran 20 m to the east, so the two lines meet offset', [], 20),
  bench(
    'x20-brigade-lines',
    'X-20: two raw regiments abreast, each charged by a veteran regiment',
    [
      { side: 1, x: -80, z: 40, heading: S, shape: LINE, unit: CAV, bar: 145 },
      { side: 1, x: 82, z: 40, heading: S, shape: LINE, unit: CAV, bar: 145 },
      { side: 0, x: -80, z: -120, heading: N, shape: LINE, unit: CAV, bar: 157 },
      { side: 0, x: 82, z: -120, heading: N, shape: LINE, unit: CAV, bar: 157 },
    ],
    [step(1, 2, { type: 'charge', target: 0 }), step(1, 3, { type: 'charge', target: 1 })],
    90,
    [0, 20, 2],
    [30, 40, 50],
  ),
  bench(
    'q01-shift-chain',
    'Q-01: a move, then form line, face about and a move, each appended',
    [{ side: 0, x: 0, z: -150, heading: N, shape: COL }],
    [
      step(1, 0, move(0, -40)),
      step(1, 0, { type: 'form', shape: LINE }),
      step(1, 0, { type: 'face' }),
      step(1, 0, move(0, -150, true)),
    ],
    300,
    [0, -90, 3],
    [60, 140, 220],
  ),
  bench(
    'q02-charge-in-a-chain',
    'Q-02: a charge, then a move appended after it',
    [
      { side: 0, x: 0, z: -150, heading: N, shape: LINE, unit: CAV },
      { side: 1, x: 0, z: 80, heading: S, shape: LINE },
    ],
    [step(1, 0, { type: 'charge', target: 1 }), step(1, 0, move(-180, -150, true))],
    150,
    [0, -20, 2.5],
    [40, 90],
  ),
  bench(
    'q03-square-in-a-chain',
    'Q-03: moves queued; a regiment comes near, the square forms; the regiment rides off',
    [
      { side: 0, x: -100, z: -100, heading: E, shape: COL },
      { side: 1, x: 0, z: 150, heading: S, shape: LINE, unit: CAV },
    ],
    // the regiment rides off beyond refuge.alert (200 m, not scaled) of the battalion's way
    [step(1, 0, move(100, -100)), step(1, 0, move(100, 40, true)), step(1, 1, move(0, 0)), step(70, 1, move(0, 400))],
    700,
    [0, -20, 2.5],
    [40, 120, 300, 600],
  ),
  bench(
    'q04-rout-in-a-chain',
    'Q-04: moves queued; the battalion broken by debug-morale',
    [{ side: 0, x: -150, z: -100, heading: E, shape: COL }],
    [step(1, 0, move(150, -100)), step(1, 0, move(150, 100, true)), step(20, 0, { type: 'debug-morale', bar: -100 })],
    150,
    [0, -50, 2],
    [25, 60],
  ),
  bench(
    'q05-plain-order-in-a-chain',
    'Q-05: moves queued, then a plain move elsewhere',
    [{ side: 0, x: -150, z: -100, heading: E, shape: COL }],
    [step(1, 0, move(150, -100)), step(1, 0, move(150, 100, true)), step(20, 0, move(-150, 100))],
    200,
    [0, 0, 2],
    [25, 120],
  ),
  // the sectors' cases (U1, docs/plans/active/u1-sectors.md): a line at the origin facing north, and an enemy where
  // its front, flank and rear meet; the overlay's Sectors layer shows each formation's front, flank and rear
  bench(
    's01-enfilade',
    'S-01: a line fired on from its flank by a line at right angles to it, 120 m off its east end',
    [
      { side: 0, x: 0, z: 0, heading: N, shape: LINE },
      { side: 1, x: 170, z: -20, heading: W, shape: LINE },
    ],
    [step(1, 1, { type: 'fire', mode: 'at will' })],
    120,
    [60, -10, 2.5],
    [10, 60],
  ),
  bench(
    's02-end-of-a-line',
    'S-02: an enemy ahead of one end of a long line, then walked round to its flank',
    [
      { side: 0, x: 0, z: 0, heading: N, shape: LINE },
      { side: 1, x: 70, z: 90, heading: S, shape: COL },
    ],
    [step(10, 1, move(140, 30)), step(10, 1, move(140, -40, true))],
    150,
    [40, 20, 2],
    [5, 40, 90],
  ),
  bench(
    's03-across-the-front',
    "S-03: a column of route crossing a line's front at 150 m",
    [
      { side: 0, x: 0, z: 0, heading: N, shape: LINE },
      { side: 1, x: -220, z: 150, heading: E, shape: 'march' },
    ],
    [step(1, 1, move(220, 150))],
    200,
    [0, 80, 1.6],
    [20, 80, 140],
  ),
]

/** A case with the claim grid's prototype on (docs/plans/active/c1-claims.md): `bench-…-claims` on the page. */
export const withClaims = (c: BenchCase): BenchCase => ({
  ...c,
  id: `${c.id}-claims`,
  title: `${c.title} (with claims)`,
  scenario: { ...c.scenario, name: `${c.scenario.name}-claims`, claims: true },
})
export const CLAIM_CASES: BenchCase[] = BENCH_CASES.map(withClaims)

export const BENCH_SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  [...BENCH_CASES, ...CLAIM_CASES].map(c => [c.scenario.name, c.scenario]),
)
export const BENCH_VIEWS: Record<string, [number, number, number]> = Object.fromEntries(
  [...BENCH_CASES, ...CLAIM_CASES].map(c => [c.scenario.name, c.view]),
)
