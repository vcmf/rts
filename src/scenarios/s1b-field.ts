// The S1b scenario: a few battalions per side on the formation field, to drill with the mouse (no
// fighting yet: fire and morale come in S1c).
import type { World, Scenario } from '../sim/index.ts'
import { issue } from '../sim/index.ts'

// the formation field these scenarios are placed on (data/formation-field.simdata): a rebuilt field fails to load
export const FIELD_DATA_VERSION = 0x6ae782ed

function setup(w: World): void {
  const E = 1.5707963267948966
  for (const [x, z, shape] of [[-120, -20, 'line'], [-120, 20, 'line'], [-150, 0, 'column']] as const) issue(w, { type: 'debug-spawn', side: 0, x, z, heading: E, shape, men: 100 })
  for (const [x, z, shape] of [[20, -40, 'line'], [20, 0, 'line'], [50, 30, 'march']] as const) issue(w, { type: 'debug-spawn', side: 1, x, z, heading: -E, shape, men: 100 })
}
export const s1bField: Scenario = { name: 's1b-field', setup }

// the cost bench: 40 battalions (4000 men) in four shapes across the field (the page at ?scenario=s1b-bench)
function bench(w: World): void {
  const shapes = ['line', 'column', 'march', 'square'] as const
  for (let k = 0; k < 40; k++) issue(w, { type: 'debug-spawn', side: k % 2, x: -170 + (k % 8) * 30, z: -150 + Math.floor(k / 8) * 55, heading: 0, shape: shapes[k % 4], men: 100 })
}
export const s1bBench: Scenario = { name: 's1b-bench', setup: bench }
export const S1B_SCENARIOS: Record<string, Scenario> = { 's1b-field': s1bField, 's1b-bench': s1bBench }
