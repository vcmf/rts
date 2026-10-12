// Expansion (docs/proposals/map-engine.md §3.4, §4): every generator run, every feature at its exact shape. In
// M1 there are no generators yet (they arrive in M3), so a map without `gen` expands to itself in the expanded
// form: features sorted by id. A `gen` is reported, not run. Assumes a valid map (src/map/validate.ts).
import type { MapFile } from './schema.ts'
import type { Issue } from './catalogue.ts'

export const EXPAND_VERSION = 1   // recorded in a generated feature's `origin`; bump when any generator's output changes

export function expand(map: MapFile): { map: MapFile; issues: Issue[] } {
  const issues: Issue[] = []
  map.features.forEach((f, i) => {
    if (f.gen) issues.push({ id: f.id, path: `features[${i}].gen`, message: `the "${Object.keys(f.gen)[0]}" generator arrives in M3; pin this feature's exact shape until then` })
  })
  const features = [...map.features].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { map: { ...map, features }, issues }
}
