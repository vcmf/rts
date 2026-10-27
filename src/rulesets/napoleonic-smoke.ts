// Era data: the black powder's smoke (docs/plans/active/smoke-puffs.md, decision 0080; docs/research/smoke.md §5): a
// thick white cloud at each discharge, grey in shadow, that hangs in still air and thins in a few seconds more; the
// volley's puffs along the front merge into a bank. Painted, not simulated: the look's values (the owner judges them)
import type { PuffDef } from '../sim/ruleset.ts'

/** a volley's smoke: a puff for every six files of a rank, so a 400-man battalion's three ranks make about 70 */
export const VOLLEY_SMOKE: PuffDef = {
  files: 6,
  life: [10, 14],
  erode: 0.55,
  radius: [0.7, 2.7],
  grow: 1.6,
  ahead: 1.0,
  height: 1.45,
  jet: [14, 0.55],
  rise: [0.4, 5],
  drift: 0.3,
  jitter: 0.3,
  // a warm grey: its lit side under the brightest coats', its shadow side in the ground's values (the art bible §9)
  colour: '#CFC9BC',
  flash: ['#FFD27A', 0.09],
}
