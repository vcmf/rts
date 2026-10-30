// A formation's strengths and weaknesses as it stands (docs/proposals/formations.md § 5a): the one place the sim reads
// a shape's traits (the ruleset's TraitsDef, compiled to TypeTable.traits), and the one place that blends them while a
// change of shape is under way. Fire, melee and the sectors read a formation's traits through it, never a shape's name
// or kind.
import { type World, typeOf, M_TICK } from './world.ts'
import { changeProgress } from './formation.ts'
import { threatWeights } from './sectors.ts'
import type { FireGeo } from './fire.ts'
import { T_LEN, T_HITS, T_FLANK, T_REAR, T_SIDED, T_MELEE, T_BRACE, T_ROUND } from './ruleset.ts'
import { DT } from './time.ts'

/** Formation i's trait t (one of the T_ fields) in the shape it stands in (while changing: the shape it is leaving). */
export const traitOf = (w: World, i: number, t: number): number => typeOf(w, i).traits[w.f.shape[i] * T_LEN + t]

const wt = new Float64Array(3)
/**
 * Formation j's hits taken from company k's fire (docs/proposals/sectors-model.md § 5): its shape's hits from the
 * front, times front + flank × the flank's multiple + rear × the rear's, the weights (front, flank, rear) of k's block
 * on j's face; the front's alone for a shape with neither multiple. G must be this tick's geometry (its faces are
 * built with it).
 */
export function hitsTaken(w: World, G: FireGeo, k: number, j: number): number {
  const T = typeOf(w, j).traits
  const o = w.f.shape[j] * T_LEN
  if (!T[o + T_SIDED]) return T[o + T_HITS]
  threatWeights(w, G, j, Math.floor(k / w.cr.maxC), k, wt)
  return T[o + T_HITS] * (wt[0] + wt[1] * T[o + T_FLANK] + wt[2] * T[o + T_REAR])
}

/** Formation i's melee strength from its shape (before its disorder and its morale state, melee.ts). */
export const meleeOf = (w: World, i: number): number => traitOf(w, i, T_MELEE)

/** Whether formation i's shape has no flank (every side a front: the square). */
export const allRoundOf = (w: World, i: number): boolean => traitOf(w, i, T_ROUND) !== 0

/**
 * How far formation i is braced against a charge, 0..1: its shape's brace, and while changing, moved toward the new
 * shape's by the change's progress (a battalion forming square is partly braced).
 */
export function braceOf(w: World, i: number): number {
  const f = w.f
  const T = typeOf(w, i).traits
  const from = T[f.shape[i] * T_LEN + T_BRACE]
  if (!f.trans[i]) return from
  const to = T[f.tShape[i] * T_LEN + T_BRACE]
  return from + (to - from) * changeProgress(w, i, w.meta[M_TICK] * DT)
}
