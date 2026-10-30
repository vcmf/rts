// The S1d-1 scenario (docs/plans/active/s1d1-unit-types.md): on each side a line infantry unit, a light cavalry
// unit and a battery at full strength (src/scenarios/sizes.ts) on the formation field, holding their fire, to drill
// the three unit types with the mouse. Side 0 in the south facing north: the infantry in line, the cavalry in column
// of route east of the wood, the battery limbered; side 1 in the north facing south: the infantry and the cavalry in
// line, the battery unlimbered. Everything stays on the map when deployed (the field is 360 m). Fighting between the
// types comes with S1d-2 (charges) and S1d-3 (the battery's fire).
import type { World, Scenario } from '../sim/index.ts'
import { issue, PI as S } from '../sim/index.ts'
import { FULL } from './sizes.ts'

const UNITS: [side: number, unit: string, shape: string, men: number, x: number, z: number, heading: number][] = [
  [0, 'infantry', 'line', FULL.infantry, -110, -120, 0],
  [0, 'cavalry', 'march', FULL.cavalry, 10, 20, 0],
  [0, 'battery', 'limbered', FULL.battery, -120, 10, 0],
  [1, 'infantry', 'line', FULL.infantry, -110, 150, S],
  [1, 'cavalry', 'line', FULL.cavalry, -60, 110, S],
  [1, 'battery', 'unlimbered', FULL.battery, 0, 130, S],
]
export const s1dArms: Scenario = {
  name: 's1d-arms',
  setup(w: World) {
    for (const [side, unit, shape, men, x, z, heading] of UNITS) {
      issue(w, { type: 'debug-spawn', side, x, z, heading, shape, men, unit, fire: 'hold' })
    }
  },
}
