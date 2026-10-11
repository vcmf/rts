// The S1e scenario (docs/plans/active/s1e1-battlefield.md) on the battlefield (maps/battlefield.ts): on each side six
// battalions in two lines of three on its ridge, a cavalry regiment on one flank and a battery on the other,
// all holding fire. Side 0 holds the southern ridge facing north, side 1 the northern facing south; the stream
// runs between them, with fords at x −260 and 330 and the bridge on the road near x 60. Each side's rear is set,
// so routers run off the field behind them. S1e-1 deploys and moves them from the page; S1e-2 gives side 1 a plan.
import type { World, Scenario } from '../sim/index.ts'
import { issue, PI } from '../sim/index.ts'

// [side, unit, shape, men, x, z]: side 0's, mirrored through the centre for side 1
const SOUTH: [string, string, number, number, number][] = [
  // the first line, in line, and the second, in column
  ['infantry', 'line', 400, -200, -230], ['infantry', 'line', 400, -80, -230], ['infantry', 'line', 400, 40, -230],
  ['infantry', 'column', 400, -140, -330], ['infantry', 'column', 400, -20, -330], ['infantry', 'column', 400, 100, -330],
  ['cavalry', 'line', 256, 260, -310],        // the eastern flank, behind the ploughed field
  ['battery', 'unlimbered', 96, -330, -300],  // the western flank, south of the wood
]
export const s1eBattle: Scenario = {
  name: 's1e-battle',
  map: 'battlefield',
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: 0, z: -1 }); issue(w, { type: 'side', side: 1, x: 0, z: 1 })
    for (const side of [0, 1]) for (const [unit, shape, men, x, z] of SOUTH)
      issue(w, { type: 'debug-spawn', side, unit, shape, men, x: side ? -x : x, z: side ? -z : z, heading: side ? PI : 0, fire: 'hold' })
  },
}
