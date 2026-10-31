// Vitest's global setup: the map windows' look data is built, not committed (G3a,
// docs/plans/done/g3a-the-whole-map-far.md), so a missing or out-of-version one is built before the tests read it.
import { buildMissingWindows } from '../tools/build-look-data.ts'

export default function setup(): void {
  const t0 = performance.now()
  const built = buildMissingWindows()
  if (built.length) console.log(`look data: built ${built.join(', ')} in ${(performance.now() - t0).toFixed(0)} ms`)
}
