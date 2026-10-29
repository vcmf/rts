// The scenarios the page offers (?scenario=), each on its map (src/scenarios/maps.ts; the formation field unless it
// names another): the S1b drill and bench, the S1c firefight (the default), the S1c-2 brigade fight, the S1d-1 arms
// (the unit types) and the S1d-2 charge, the S1d-3 guns, the S1e battle on the 1.2 km battlefield, the same battle on
// the valley, the battlefield as a map-engine map (Track M, M2), and the visual bench's cases on the bench field
// (src/scenarios/bench.ts).
import type { Scenario } from '../sim/index.ts'
import { S1B_SCENARIOS } from './s1b-field.ts'
import { s1cFirefight, s1cBrigade } from './s1c-firefight.ts'
import { s1dArms } from './s1d-arms.ts'
import { s1dCharge } from './s1d-charge.ts'
import { s1dGuns } from './s1d-guns.ts'
import { s1eBattle } from './s1e-battle.ts'
import { m2Valley } from './m2-valley.ts'
import { BENCH_SCENARIOS, BENCH_VIEWS } from './bench.ts'

export const PAGE_SCENARIOS: Record<string, Scenario> = {
  's1c-firefight': s1cFirefight,
  's1c-brigade': s1cBrigade,
  's1d-arms': s1dArms,
  's1d-charge': s1dCharge,
  's1d-guns': s1dGuns,
  's1e-battle': s1eBattle,
  'm2-valley': m2Valley,
  ...S1B_SCENARIOS,
  ...BENCH_SCENARIOS,
}
export const DEFAULT_SCENARIO = 's1c-firefight'
// the seed the page plays every scenario at (tools/battle-report.ts runs a scenario with no orders at it too)
export const PAGE_SEED = 20261009
// where the page opens on each: centre x, z and pixels per metre
export const PAGE_VIEWS: Record<string, [number, number, number]> = {
  's1c-firefight': [-100, 120, 3],
  's1c-brigade': [-125, -10, 2],
  's1d-arms': [-60, 10, 1.9],
  's1d-charge': [-85, 40, 1.9],
  's1d-guns': [25, 50, 1.6],
  's1e-battle': [0, 0, 0.6],
  'm2-valley': [0, 0, 0.6],
  ...BENCH_VIEWS,
}
