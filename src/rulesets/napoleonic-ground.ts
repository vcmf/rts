// The Napoleonic ruleset's reading of a map's ground (docs/plans/active/m2-sim.md): a cell's attributes to one of
// the terrain classes of src/rulesets/napoleonic.ts, decided in this order. Kept apart from the ruleset's table, so
// the ruleset's hash (and every golden replay) does not move with it.
// Interim, until the ruleset gains the classes (a ruleset change, with Track S): walls and fences read as hedges
// (an obstacle strip), buildings as dense woods (slow, covered), a no-go zone as deep water (impassable).
import type { Classify } from './ground.ts'

export const classifyNapoleonic: Classify = cell => {
  if (cell.built?.bridge) return 'bridge'
  if (cell.nogo) return 'water'                          // the map's override: impassable (the compiler gives it a depth past every limit)
  if (cell.water > 0) return 'water'                     // fords included: the depth decides who wades
  if (cell.way) return 'road'
  if (cell.barrier) return 'hedge'
  if (cell.built?.building) return 'denseWood'
  const g = cell.ground ?? {}, v = cell.veg
  if (g.material === 'peat' || (g.moisture ?? 0) >= 0.9) return 'marsh'
  if (v?.growth === 'stand') return v.density >= 0.75 || (v.undergrowth ?? 0) >= 0.7 ? 'denseWood' : 'woods'
  if (v?.stage === 'ploughed') return 'ploughed'
  if (v?.stage === 'standing' && (v.height ?? 0) >= 0.8) return 'crops'
  if ((g.stones ?? 0) >= 0.4) return 'rough'
  return 'open'
}
