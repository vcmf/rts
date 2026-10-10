// The S1b scenarios: a few battalions per side on the formation field, to drill with the mouse, and the
// 40-battalion cost bench. Both spawn holding their fire (S1c): the drill fights only when ordered to
// (Fire at will), and the bench measures marching, not a battle.
import type { World, Scenario } from '../sim/index.ts'
import { issue } from '../sim/index.ts'

// the formation field these scenarios are placed on (data/formation-field.simdata): a rebuilt field fails to load
export const FIELD_DATA_VERSION = 0x6ae782ed

function setup(w: World): void {
  const E = 1.5707963267948966
  for (const [x, z, shape] of [[-130, -55, 'line'], [-130, 55, 'line'], [-160, 0, 'column']] as const) issue(w, { type: 'debug-spawn', side: 0, x, z, heading: E, shape, men: 400, fire: 'hold' })
  for (const [x, z, shape] of [[20, -60, 'line'], [20, 50, 'line'], [-60, 150, 'march']] as const) issue(w, { type: 'debug-spawn', side: 1, x, z, heading: -E, shape, men: 400, fire: 'hold' })
}
export const s1bField: Scenario = { name: 's1b-field', setup }

// the cost bench: 40 battalions of 400 (16,000 men) in column, 7 a row across the field west of the stream
// (the page at ?scenario=s1b-bench)
function bench(w: World): void {
  for (let k = 0; k < 40; k++) issue(w, { type: 'debug-spawn', side: k % 2, x: -165 + (k % 7) * 33, z: -150 + Math.floor(k / 7) * 55, heading: 0, shape: 'column', men: 400, fire: 'hold' })
}
export const s1bBench: Scenario = { name: 's1b-bench', setup: bench }
export const S1B_SCENARIOS: Record<string, Scenario> = { 's1b-field': s1bField, 's1b-bench': s1bBench }
