// The maps scenarios are placed on (data/<name>.simdata, built by tools/build-sim-data.ts from maps/), with the data
// version each scenario was placed for: a rebuilt map fails to load until its version here is updated.
import { FIELD_DATA_VERSION } from './s1b-field.ts'

export const MAP_VERSIONS: Record<string, number> = {
  'formation-field': FIELD_DATA_VERSION,
  battlefield: 0xad83ce9c,   // maps/battlefield.ts (S1e-1)
}
export const DEFAULT_MAP = 'formation-field'
