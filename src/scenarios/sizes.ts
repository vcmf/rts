// The division scale in the scenarios (decision 0076; docs/proposals/division-scale.md): each unit type's full
// strength, what a scenario spawns when it means a unit at full strength, read from the shipped ruleset's blocks (a
// figure stands for its menPerFigure, 25 men); and the ratio of a unit's width now to S1c's battalion of 400 (about
// 54 m to 93 m), by which the places laid out for those battalions are drawn in (the S1e battle, the bench).
import { napoleonic } from '../rulesets/napoleonic.ts'

const full = (t: keyof typeof napoleonic.types): number => {
  const g = napoleonic.types[t].geometry
  return g.companies * g.files * g.ranks
}
export const FULL = { infantry: full('infantry'), cavalry: full('cavalry'), battery: full('battery') } as const
export const WIDTH_RATIO = 0.58
