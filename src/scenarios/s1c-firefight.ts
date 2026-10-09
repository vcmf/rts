// The S1c scenarios (docs/plans/active/s1c-fire-morale.md): two lines exchange fire across open ground on
// the formation field (the strip at z = −165, west of the stream), the second of lower quality. Each side's
// rear is set, so a router runs away from the fight. `firefight` makes one at any range; `runFirefight` runs
// it to the first rout (the calibration, tools/calibrate-fire.ts, and the tests). The calibration runs on
// `levelled` data: the strip rolls (a rise at x ≈ −13 hides the lines from each other beyond about 140 m),
// and the fire model's numbers are tuned apart from what the ground does to them.
import type { World, Scenario, SimData, Compiled } from '../sim/index.ts'
import { issue, makeWorld, advanceTick, menOf, MS_ROUTING } from '../sim/index.ts'

export const FIGHT_Z = -165, FIGHT_X = -50
export const STRONG = 0.8, WEAK = 0.65
const E = 1.5707963267948966

export function firefight(range: number, qa = STRONG, qb = WEAK): Scenario {
  return {
    name: range === 100 && qa === STRONG && qb === WEAK ? 's1c-firefight' : `s1c-firefight-${range}`,
    setup(w: World) {
      issue(w, { type: 'side', side: 0, x: -1, z: 0 }); issue(w, { type: 'side', side: 1, x: 1, z: 0 })
      issue(w, { type: 'debug-spawn', side: 0, x: FIGHT_X - range / 2, z: FIGHT_Z, heading: E, shape: 'line', men: 100, quality: qa })
      issue(w, { type: 'debug-spawn', side: 1, x: FIGHT_X + range / 2, z: FIGHT_Z, heading: -E, shape: 'line', men: 100, quality: qb })
    },
  }
}
export const s1cFirefight = firefight(100)

// the same field with its heightfield levelled to 0 (classes and water kept): not a replayable data set
export const levelled = (d: SimData): SimData => ({ ...d, height: { ...d.height, h: new Float64Array(d.height.h.length) } })

// first: the slot that routed first (−1: none); termLosses, termRecent: the two morale terms of the router at
// the break (how much each took off its quality)
export interface FightResult { first: number; tick: number; lossA: number; lossB: number; termLosses: number; termRecent: number }
// runs a firefight to the first rout or `maxTicks`; slot 0 is the stronger line, slot 1 the weaker
export function runFirefight(data: SimData, cr: Compiled, seed: number, range: number, maxTicks: number, qa = STRONG, qb = WEAK): FightResult {
  const w = makeWorld(data, cr, seed, false); firefight(range, qa, qb).setup(w)
  for (let t = 0; t < maxTicks; t++) {
    advanceTick(w)
    const a = w.f.mstate[0] === MS_ROUTING, b = w.f.mstate[1] === MS_ROUTING
    if (a || b) { const i = a ? 0 : 1, M = cr.rs.morale, start = w.f.startMen[i]
      return { first: i, tick: w.meta[0], lossA: 100 - menOf(w, 0), lossB: 100 - menOf(w, 1), termLosses: M.losses * (start - menOf(w, i)) / start, termRecent: M.recent * w.f.recent[i] / start } }
  }
  return { first: -1, tick: maxTicks, lossA: 100 - menOf(w, 0), lossB: 100 - menOf(w, 1), termLosses: 0, termRecent: 0 }
}
