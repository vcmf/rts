// The S1d-2 scenarios (docs/plans/active/s1d2-charges.md): a cavalry regiment of 256 charges a battalion of 400,
// or another regiment. `chargeFight` sets up one case on an open, level field (the calibration paints one, so the
// stream and the wood do not decide it: tools/calibrate-charge.ts, the tests) and `runCharge` runs it; `s1dCharge`
// is the page's: a regiment against a battalion in line and one in square on the formation field.
import type { World, Scenario, SimData, Compiled, Terrain } from '../sim/index.ts'
import { issue, makeWorld, advanceTick, menOf, outOfFight, makeHandle, KIND_FORMATION, CH_NONE, PI } from '../sim/index.ts'

export const CAV = 256, INF = 400
// the cases: a battalion in square, in line or in column charged from the front from about 270 m; a line
// charged in the flank from about 150 m; two regiments charging each other from about 340 m
export const CASES = ['square', 'line', 'column', 'flank', 'cavalry'] as const
export type ChargeCase = typeof CASES[number]
const h = (slot: number) => makeHandle(KIND_FORMATION, slot, 0)   // a fresh world hands out slot 0, then 1

// slot 0 is the charging regiment (side 0, from the south); slot 1 the battalion or the other regiment (side 1)
export function chargeFight(kind: ChargeCase): Scenario {
  return {
    name: `s1d-charge-${kind}`,
    setup(w: World) {
      issue(w, { type: 'side', side: 0, x: 0, z: -1 }); issue(w, { type: 'side', side: 1, x: 0, z: 1 })
      if (kind === 'flank') {
        issue(w, { type: 'debug-spawn', side: 0, unit: 'cavalry', x: 60, z: -95, heading: 0, shape: 'line', men: CAV })
        issue(w, { type: 'debug-spawn', side: 1, x: 60, z: 100, heading: PI / 2, shape: 'line', men: INF })
      } else if (kind === 'cavalry') {
        issue(w, { type: 'debug-spawn', side: 0, unit: 'cavalry', x: 0, z: -170, heading: 0, shape: 'line', men: CAV })
        issue(w, { type: 'debug-spawn', side: 1, unit: 'cavalry', x: 0, z: 170, heading: PI, shape: 'line', men: CAV })
        issue(w, { type: 'charge', id: h(1), target: h(0) })
      } else {
        issue(w, { type: 'debug-spawn', side: 0, unit: 'cavalry', x: 0, z: -170, heading: 0, shape: 'line', men: CAV })
        issue(w, { type: 'debug-spawn', side: 1, x: 0, z: 100, heading: PI, shape: kind, men: INF })
      }
      issue(w, { type: 'charge', id: h(0), target: h(1) })
    },
  }
}

// broke: slot 1 out of the fight; first: the slot that went out of the fight first (−1 none); contact: the
// charger met its target; recoiled: its charge ended without contact or a break; tick: the first break, or the
// end; losses of each
export interface ChargeResult { first: number; contact: boolean; recoiled: boolean; tick: number; loss0: number; loss1: number }
export function runCharge(data: SimData, cr: Compiled, terrain: Terrain, seed: number, kind: ChargeCase, maxTicks: number): ChargeResult {
  const w = makeWorld(data, cr, seed, false, terrain); chargeFight(kind).setup(w)
  let contact = false, charged = false
  for (let t = 0; t < maxTicks; t++) {
    advanceTick(w)
    const f = w.f
    if (f.foe[0]) contact = true
    if (f.chPhase[0] !== CH_NONE) charged = true
    const a = outOfFight(f.mstate[0]), b = outOfFight(f.mstate[1])
    if (a || b) return { first: b ? 1 : 0, contact, recoiled: false, tick: w.meta[0], loss0: f.startMen[0] - menOf(w, 0), loss1: f.startMen[1] - menOf(w, 1) }
  }
  const f = w.f
  return { first: -1, contact, recoiled: charged && !contact && f.chPhase[0] === CH_NONE, tick: maxTicks, loss0: f.startMen[0] - menOf(w, 0), loss1: f.startMen[1] - menOf(w, 1) }
}

// the page's: in the open strip west of the wood, a regiment in column facing north, and two battalions to the
// north facing it, one in line and one in square to its north-east, holding their fire. The page charges them
// (check:app: the line, caught forming square, breaks; the square holds)
export const s1dCharge: Scenario = {
  name: 's1d-charge',
  setup(w: World) {
    issue(w, { type: 'side', side: 0, x: 0, z: -1 }); issue(w, { type: 'side', side: 1, x: 0, z: 1 })
    issue(w, { type: 'debug-spawn', side: 0, unit: 'cavalry', x: -125, z: -10, heading: 0, shape: 'column', men: CAV, fire: 'hold' })
    issue(w, { type: 'debug-spawn', side: 1, x: -125, z: 120, heading: PI, shape: 'line', men: INF, fire: 'hold' })
    issue(w, { type: 'debug-spawn', side: 1, x: -60, z: 160, heading: PI, shape: 'square', men: INF, fire: 'hold' })
  },
}
