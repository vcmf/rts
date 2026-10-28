// Era data: the black powder's smoke (docs/plans/active/smoke-bank.md, decision 0080; docs/research/smoke.md §5): a
// thick white plume jetting from each muzzle, the volley's plumes merging at once into one bank along the front that
// hangs in still air, rolls ahead a little, rises, and thins away in ten to fifteen seconds. Painted, not simulated:
// the look's values (the owner judges them)
import type { PuffDef } from '../sim/ruleset.ts'

/** a volley's smoke: a puff for every six files of a rank, so a 400-man battalion's three ranks make about 70 */
export const VOLLEY_SMOKE: PuffDef = {
  files: 6,
  life: [10, 15],
  erode: 0.4,
  radius: [0.6, 3.2],
  grow: 1.6,
  ahead: 0.3,
  height: 1.45,
  jet: [5, 0.3],
  plume: [3.5, 0.9],
  roll: 0.15,
  bank: 2.0,
  rise: [0.2, 6],
  drift: 0.3,
  jitter: 0.3,
  opacity: 0.75,
  // a warm white: bright in the sun, a pale cool grey in its shade, never dark (the art bible §9)
  colour: '#F3EFE6',
  flash: ['#FFD27A', 0.09],
}
