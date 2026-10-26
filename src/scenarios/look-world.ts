// The scenarios on the look page's world (maps/painted-world.ts, docs/plans/active/battle-threads.md, PR 4a): the
// painted demo tile as a sim map. `look-cross`: four battalions a side in column on the open ground east of the
// river, 300 m apart, holding their fire (the map's check: a battle runs on it, its replay reproduced).
import type { World, Scenario } from '../sim/index.ts'
import { issue } from '../sim/index.ts'

// the look world's sim data (data/painted-world.simdata, built from data/painted-world.lookdata): a rebuilt one
// fails to load until this is updated
export const LOOK_DATA_VERSION = 0xd9a8cbc4

function cross(w: World): void {
  for (const side of [0, 1]) {
    for (const x of [-20, 40, 100, 160]) {
      issue(w, {
        type: 'debug-spawn',
        side,
        x,
        z: side ? 150 : -150,
        heading: side ? Math.PI : 0,
        shape: 'column',
        men: 400,
        fire: 'hold',
      })
    }
  }
}
export const lookCross: Scenario = { name: 'look-cross', setup: cross, map: 'painted-world' }
