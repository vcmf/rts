// The visual bench's cases (docs/plans/active/c0-bench.md; docs/proposals/collision-and-orders.md, § The bench): the
// hard cases of collision and of the orders' queue, each a page scenario on the flat bench field (maps/bench.ts),
// scripted by its plan so that it plays on its own. They stage today's nearest thing where the sim lacks the rule
// (no infantry assault, no loose bodies, no passage of lines yet), so the bench first shows today's behaviour.
import type { World, Scenario, PlanStep, PlanCommand } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'

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
}
const step = (at: number, unit: number, cmd: PlanCommand): PlanStep => ({ at, unit, cmd })
const move = (x: number, z: number, append = false): PlanCommand => ({ type: 'move', points: [[x, z]], append })

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
      const men = s.men ?? (s.unit === 'cavalry' ? 256 : s.unit === 'battery' ? 96 : 400)
      issue(w, { type: 'debug-spawn', ...s, men, fire: 'hold' })
    }
  }
  return {
    id,
    title,
    scenario: { name: `bench-${id}`, map: 'bench', setup, plan, minutes: seconds / 60 },
    seconds,
    view,
    keys,
  }
}

const LINE = 'line'
const COL = 'column'
const CAV = 'cavalry'

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
    [step(1, 0, { type: 'debug-morale', quality: 0 })],
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
    [step(1, 0, { type: 'debug-morale', quality: 0 }), step(15, 0, { type: 'debug-morale', quality: 0.75 })],
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
    [step(1, 0, { type: 'debug-morale', quality: 0 })],
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
      // west, east, south and north groups, each marching to the far side
      const [x, z, heading] = [
        [-260, r * 45, E],
        [260, r * 45 + 20, W],
        [r * 45 + 10, -260, N],
        [r * 45 - 10, 260, S],
      ][g]
      return { side: g % 2, x, z, heading, shape: COL }
    }),
    Array.from({ length: 40 }, (_, k) => {
      const g = Math.floor(k / 10)
      const r = (k % 10) - 4.5
      const [x, z] = [
        [240, r * 45],
        [-240, r * 45 + 20],
        [r * 45 + 10, 240],
        [r * 45 - 10, -240],
      ][g]
      return step(1, k, move(x, z))
    }),
    600,
    [0, 0, 1.4],
    [200, 300],
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
    [step(1, 0, move(100, -100)), step(1, 0, move(100, 40, true)), step(1, 1, move(0, 0)), step(70, 1, move(0, 280))],
    700,
    [0, -20, 2.5],
    [40, 120, 300, 600],
  ),
  bench(
    'q04-rout-in-a-chain',
    'Q-04: moves queued; the battalion broken by debug-morale',
    [{ side: 0, x: -150, z: -100, heading: E, shape: COL }],
    [step(1, 0, move(150, -100)), step(1, 0, move(150, 100, true)), step(20, 0, { type: 'debug-morale', quality: 0 })],
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
]

export const BENCH_SCENARIOS: Record<string, Scenario> = Object.fromEntries(
  BENCH_CASES.map(c => [c.scenario.name, c.scenario]),
)
export const BENCH_VIEWS: Record<string, [number, number, number]> = Object.fromEntries(
  BENCH_CASES.map(c => [c.scenario.name, c.view]),
)
