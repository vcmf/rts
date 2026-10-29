// Era data: the black powder's smoke (docs/plans/active/smoke-bank.md, decision 0083; docs/research/smoke.md §5): a
// thick white plume jetting from each muzzle, the volley's plumes merging at once into one bank along the front that
// hangs in still air, rolls ahead a little, rises, and thins away in ten to fifteen seconds. Painted, not simulated:
// the look's values (the owner judges them)
import type { PuffDef } from '../sim/ruleset.ts'

/** a volley's smoke: a puff for every six files of a rank, so a 400-man battalion's three ranks make about 70, each
 *  its own (size, reach, rise, density), the companies going off a little apart */
export const VOLLEY_SMOKE: PuffDef = {
  files: 6,
  strung: [1, 1],
  life: [9, 14],
  erode: 0.4,
  radius: [0.3, 1.8],
  grow: 1.8,
  ahead: 0.7,
  height: 1.5,
  rankReach: 0.35,
  rankLift: 0.12,
  lateral: 3,
  section: 12,
  clumps: [7.3, 11.9, 19.7],
  body: 0.9,
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

/** a gun's shot (docs/plans/active/artillery-smoke.md): one big white blast, a string of puffs from the muzzle, the
 *  nearest a fat cloud round it, the farther ones carried by the jet up to about 15 m ahead, larger and fainter; they
 *  grow for seconds, hug the ground, roll on a little and linger about half as long again as a volley's smoke; a
 *  battery firing in turn lays a row of them before its guns. The muzzle on the foot battery's figure (the barrel's
 *  mouth 2 m before the piece's root, its axis 1.1 m up: data/figures/fr-foot-artillery's Barrel); a piece is one
 *  muzzle, its own lag the script's */
export const GUN_SMOKE: PuffDef = {
  files: 1,
  strung: [4, 1.8],
  life: [14, 22],
  erode: 0.45,
  radius: [1.5, 4.2],
  grow: 1.5,
  ahead: 2,
  height: 1.1,
  rankReach: 0,
  rankLift: 0,
  lateral: 1,
  section: 1,
  clumps: [7.3, 11.9, 19.7],
  body: 0.9,
  jet: [24, 0.35],
  plume: [3, 0.5],
  roll: 0.12,
  bank: 1.3,
  rise: [0.04, 8],
  drift: 0.2,
  jitter: 0,
  stagger: 0,
  vary: 0.6,
  opacity: 0.95,
  colour: '#F3EFE6',
  flash: ['#FFE2A0', 0.12],
}
