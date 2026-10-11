// The S1d-1 scenario (docs/plans/active/s1d1-unit-types.md): on each side a battalion of 400, a cavalry regiment
// of 250 and a foot battery of 96 on the formation field, holding their fire, to drill the three unit types with
// the mouse. Side 0 in the south facing north: the battalion in line, the regiment in column of route east of
// the wood, the battery limbered; side 1 in the north facing south: the battalion and the regiment in line, the
// battery unlimbered. Everything stays on the map when deployed (the field is 360 m; a regiment's line is 157 m
// and its column of route 190 m: docs/known-issues.md, the map's edge). Fighting between the types comes with
// S1d-2 (charges) and S1d-3 (the battery's fire).
import type { World, Scenario } from '../sim/index.ts'
import { issue, PI as S } from '../sim/index.ts'

const UNITS: [side: number, unit: string, shape: string, men: number, x: number, z: number, heading: number][] = [
  [0, 'infantry', 'line', 400, -110, -120, 0], [0, 'cavalry', 'march', 250, 10, 20, 0], [0, 'battery', 'limbered', 96, -120, 10, 0],
  [1, 'infantry', 'line', 400, -110, 150, S], [1, 'cavalry', 'line', 250, -60, 110, S], [1, 'battery', 'unlimbered', 96, 0, 130, S],
]
export const s1dArms: Scenario = {
  name: 's1d-arms',
  setup(w: World) { for (const [side, unit, shape, men, x, z, heading] of UNITS) issue(w, { type: 'debug-spawn', side, x, z, heading, shape, men, unit, fire: 'hold' }) },
}
