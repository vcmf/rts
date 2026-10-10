// The scenarios the page offers (?scenario=), all on the formation field (FIELD_DATA_VERSION): the S1b drill
// and bench, the S1c firefight (the default) and the S1c-2 brigade fight.
import type { Scenario } from '../sim/index.ts'
import { S1B_SCENARIOS } from './s1b-field.ts'
import { s1cFirefight, s1cBrigade } from './s1c-firefight.ts'

export const PAGE_SCENARIOS: Record<string, Scenario> = { 's1c-firefight': s1cFirefight, 's1c-brigade': s1cBrigade, ...S1B_SCENARIOS }
export const DEFAULT_SCENARIO = 's1c-firefight'
// where the page opens on each: centre x, z and pixels per metre
export const PAGE_VIEWS: Record<string, [number, number, number]> = { 's1c-firefight': [-50, -150, 4], 's1c-brigade': [-60, -35, 2.5] }
