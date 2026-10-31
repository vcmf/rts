// Era ruleset: the Napoleonic armies at the division scale (decision 0099, after the campaign track's proposed scale,
// PR #234: a unit stands for a division, a figure for 25 men; docs/plans/active/division-armies.md). The shipped
// ruleset (src/rulesets/napoleonic.ts) with the division scale's blocks, as the sim's division scale sets them (#280),
// and the two unit types it does not ship yet: light infantry in open order and cuirassiers. Once #280 is on main its
// blocks equal these and the overrides go. Also the corps' compositions (ruleset data). Decision 0015: every number
// here is data.
import type { Composition, Geometry, Ruleset, UnitType } from '../sim/ruleset.ts'
import { napoleonic } from './napoleonic.ts'

const types = napoleonic.types
const block = (t: UnitType, g: Partial<Geometry>): UnitType => ({ ...t, geometry: { ...t.geometry, ...g } })

// line infantry: 240 figures in 4 sections of 20 files × 3 ranks, about 54 m wide in line
const infantry = block(types.infantry, { companies: 4, files: 20 })
// light infantry (skirmishers): 160 figures in 4 sections of 20 files × 2 ranks, in open order (a file 1 m, a rank
// 1.5 m: first picks); the line's shapes and drill
const light = block(types.infantry, { companies: 4, files: 20, ranks: 2, fileSpacing: 1.0, rankSpacing: 1.5 })
// light cavalry: 80 figures in 2 squadrons of 20 files × 2 ranks
const cavalry = block(types.cavalry, { companies: 2, files: 20, bins: 5 })
// cuirassiers, the reserve cavalry corps' (PR #234's scale): 120 figures in 3 squadrons of 20 × 2, a heavier unit than
// the light cavalry (no size given: the plan's open question)
const cuirassiers = block(types.cavalry, { companies: 3, files: 20, bins: 5 })
// a corps' battery: 4 guns, each a detachment of 12 (48)
const battery = block(types.battery, { companies: 4 })

export const napoleonicDivision: Ruleset = {
  ...napoleonic,
  name: `${napoleonic.name}, the division scale`,
  types: { infantry, light, cavalry, cuirassiers, battery },
}

/** the corps (decision 0099, PR #234's scale): an infantry corps of 8–10 units (4–5 line, 1–2 light infantry, 1–2
 *  light cavalry, a battery), here 9 and 1,568 figures; the reserve cavalry corps, only the main army's: cuirassiers
 *  and a battery */
export const CORPS: Readonly<Record<'infantry' | 'cavalryReserve', Composition>> = {
  infantry: [
    { type: 'infantry', count: 5 },
    { type: 'light', count: 1 },
    { type: 'cavalry', count: 2 },
    { type: 'battery', count: 1 },
  ],
  cavalryReserve: [
    { type: 'cuirassiers', count: 4 },
    { type: 'battery', count: 1 },
  ],
}
