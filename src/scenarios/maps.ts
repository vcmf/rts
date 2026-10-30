// The maps scenarios are placed on (data/<name>.simdata, built by tools/build-sim-data.ts from maps/), with the data
// version each scenario was placed for: a rebuilt map fails to load until its version here is updated.
import { FIELD_DATA_VERSION } from './s1b-field.ts'
import { LOOK_DATA_VERSION } from './look-world.ts'

export const MAP_VERSIONS: Record<string, number> = {
  'formation-field': FIELD_DATA_VERSION,
  battlefield: 0xff0c79dc, // maps/battlefield.ts (S1e-1)
  'painted-world': LOOK_DATA_VERSION, // maps/painted-world.ts, the look page's world (battle threads PR 4a)
  bench: 0x2ed55326, // maps/bench.ts (C0, the visual bench)
  valley: 0xc13ebcfc, // maps/valley.map.json, compiled by the map engine (Track M, M2)
}
export const DEFAULT_MAP = 'formation-field'
