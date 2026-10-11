// The scenarios the page offers (?scenario=), all on the formation field (FIELD_DATA_VERSION): the S1b drill
// and bench, the S1c firefight (the default), the S1c-2 brigade fight, the S1d-1 arms (the unit types) and the
// S1d-2 charge and the S1d-3 guns.
import type { Scenario } from '../sim/index.ts'
import { S1B_SCENARIOS } from './s1b-field.ts'
import { s1cFirefight, s1cBrigade } from './s1c-firefight.ts'
import { s1dArms } from './s1d-arms.ts'
import { s1dCharge } from './s1d-charge.ts'
import { s1dGuns } from './s1d-guns.ts'

export const PAGE_SCENARIOS: Record<string, Scenario> = { 's1c-firefight': s1cFirefight, 's1c-brigade': s1cBrigade, 's1d-arms': s1dArms, 's1d-charge': s1dCharge, 's1d-guns': s1dGuns, ...S1B_SCENARIOS }
export const DEFAULT_SCENARIO = 's1c-firefight'
// where the page opens on each: centre x, z and pixels per metre
export const PAGE_VIEWS: Record<string, [number, number, number]> = { 's1c-firefight': [-100, 120, 3], 's1c-brigade': [-125, -10, 2], 's1d-arms': [-60, 10, 1.9], 's1d-charge': [-85, 40, 1.9], 's1d-guns': [25, 50, 1.6] }
