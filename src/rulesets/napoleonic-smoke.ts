// Era data: the black powder's smoke (docs/plans/active/smoke-bank.md, decision 0080; docs/research/smoke.md §5): a
// thick white plume jetting from each muzzle, the volley's plumes merging at once into one bank along the front that
// hangs in still air, rolls ahead a little, rises, and thins away in ten to fifteen seconds. Painted, not simulated:
// the look's values (the owner judges them)
import type { PuffDef } from '../sim/ruleset.ts'

/** a volley's smoke: a puff for every six files of a rank, so a 400-man battalion's three ranks make about 70, each
 *  its own (size, reach, rise, density), the companies going off a little apart */
export const VOLLEY_SMOKE: PuffDef = {
  files: 6,
  life: [9, 14],
  erode: 0.4,
  radius: [0.3, 1.8],
  grow: 1.8,
  ahead: 0.7,
  height: 1.5,
  jet: [2, 0.3],
  plume: [3.5, 0.6],
  roll: 0.06,
  bank: 1.7,
  rise: [0.06, 6],
  drift: 0.2,
  jitter: 0.25,
  stagger: 0.8,
  vary: 0.8,
  opacity: 0.95,
  // a warm white: bright in the sun, a pale cool grey in its shade, never dark (the art bible §9)
  colour: '#F3EFE6',
  flash: ['#FFE2A0', 0.07],
}
