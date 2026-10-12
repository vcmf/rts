// The maps scenarios are placed on (data/<name>.simdata, built by tools/build-sim-data.ts from maps/), with the data
// version each scenario was placed for: a rebuilt map fails to load until its version here is updated.
import { FIELD_DATA_VERSION } from './s1b-field.ts'

export const MAP_VERSIONS: Record<string, number> = {
  'formation-field': FIELD_DATA_VERSION,
  battlefield: 0xff0c79dc,   // maps/battlefield.ts (S1e-1)
  valley: 0x3dec81b2,        // maps/valley.map.json, compiled by the map engine (Track M, M2)
}
export const DEFAULT_MAP = 'formation-field'
