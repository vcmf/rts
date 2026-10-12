// The S1e battle on the valley (docs/plans/done/m2-sim.md): the same armies, plan and rules as s1e-battle
// (src/scenarios/s1e-battle.ts), on maps/valley.map.json, the S1e battlefield's layout written in the map language
// and compiled by the map engine. It runs beside s1e-battle until S1e itself moves to the map (with Track S).
import type { Scenario } from '../sim/index.ts'
import { s1eBattle } from './s1e-battle.ts'

export const m2Valley: Scenario = { ...s1eBattle, name: 'm2-valley', map: 'valley' }
