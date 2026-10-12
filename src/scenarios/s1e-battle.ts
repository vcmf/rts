// The S1e scenario (docs/plans/active/s1e1-battlefield.md, docs/plans/active/s1e2-sides.md) on the battlefield (maps/battlefield.ts): on
// each side six battalions in two lines of three on its ridge, a cavalry regiment on one flank and a battery on the
// other, firing at will. Side 0 holds the southern ridge facing north and is yours; side 1 the northern, facing
// south, and follows its plan. The stream runs between them: men and horses wade it but in its pools out on the
// flanks; guns cross only at the fords (x −260 and 330) and the bridge on the road near x 62. Each side's rear is
// set, so routers run behind it. A side with half its men out of the fight is broken; the battle is decided at 40
// minutes otherwise.
import type { World, Scenario, PlanStep } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'

// [unit, shape, men, x, z]: side 0's, mirrored through the centre for side 1. Units are numbered in spawn order:
// side 0's 0–7, side 1's 8–15
const SOUTH: [string, string, number, number, number][] = [
  // the first line, in line, and the second, in column
  ['infantry', 'line', 400, -200, -230], ['infantry', 'line', 400, -80, -230], ['infantry', 'line', 400, 40, -230],
  ['infantry', 'column', 400, -140, -330], ['infantry', 'column', 400, -20, -330], ['infantry', 'column', 400, 100, -330],
  ['cavalry', 'line', 256, 260, -310],        // the eastern flank, behind the ploughed field
  ['battery', 'unlimbered', 96, -330, -350],  // the western flank, south of the wood (and clear of the eastern one, mirrored)
]
const S1 = 8   // side 1's first unit
// side 1's plan: its first line comes down to the stream's north bank, wades it and closes on your first line to
// about 120 m; its second line follows to the bank and then over; its regiment charges your eastern battalion. The
// first line (units 8–10) stands at x 200, 80, −40, the second (11–13) at 140, 20, −100
const FIRST = [200, 80, -40], SECOND = [140, 20, -100]
const march = (at: number, unit: number, x: number, z: number): PlanStep => ({ at, unit, cmd: { type: 'move', points: [[x, z]], append: false } })
const PLAN: PlanStep[] = [
  ...FIRST.map((x, k) => march(60, S1 + k, x, 70)),
  ...FIRST.map((x, k) => march(240, S1 + k, x, -110)),
  ...SECOND.map((x, k) => march(300, S1 + 3 + k, x, 70)),
  { at: 480, unit: S1 + 6, cmd: { type: 'charge', target: 2 } },
  ...SECOND.map((x, k) => march(600, S1 + 3 + k, x, -60)),
]
export const s1eBattle: Scenario = {
  name: 's1e-battle',
  map: 'battlefield',
  player: 0,
  plan: PLAN,
  minutes: 40,
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: 0, z: -1 }); issue(w, { type: 'side', side: 1, x: 0, z: 1 })
    for (const side of [0, 1]) for (const [unit, shape, men, x, z] of SOUTH)
      issue(w, { type: 'debug-spawn', side, unit, shape, men, x: side ? -x : x, z: side ? -z : z, heading: side ? PI : 0, fire: 'at will' })
  },
}
