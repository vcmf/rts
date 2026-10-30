// A formation's strengths and weaknesses as it stands (docs/proposals/formations.md § 5a): the one place the sim reads
// a shape's traits (the ruleset's TraitsDef, compiled to TypeTable.traits), and the one place that blends them while a
// change of shape is under way. Fire, melee and the sectors read a formation's traits through it, never a shape's name
// or kind.
import { type World, typeOf, M_TICK } from './world.ts'
import { changeProgress } from './formation.ts'
import { threatWeights } from './sectors.ts'
import type { FireGeo } from './fire.ts'
import {
  T_LEN,
  T_HITS,
  T_FLANK,
  T_REAR,
  T_SIDED,
  T_MELEE,
  T_BRACE,
  T_BRACE_FLANK,
  T_BRACE_REAR,
  T_ROUND,
  T_FIRE,
  T_SHOCK,
  T_FLANK_SHOCK,
  T_BLEND,
  T_MOVES,
} from './ruleset.ts'
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

/** Formation i's share of its musketry's hit chance from its shape. */
export const fireOf = (w: World, i: number): number => traitOf(w, i, T_FIRE)

/** The multiple of the morale shocks formation i takes (a charge's, contagion's, the drain) from its shape. */
export const shockOf = (w: World, i: number): number => traitOf(w, i, T_SHOCK)

/** The multiple of a charge's shock from formation i's flank. */
export const flankShockOf = (w: World, i: number): number => traitOf(w, i, T_FLANK_SHOCK)

/** The sector blend's centre for formation i (docs/proposals/sectors-model.md § 3): its shape's flankFrom. */
export const blendOf = (w: World, i: number): number => traitOf(w, i, T_BLEND)

/**
 * Whether formation i may be given a move: by the shape it stands in, or the one it is changing into (a square formed
 * or forming cannot; one forming line from it can).
 */
export function movesOf(w: World, i: number): boolean {
  const f = w.f
  return typeOf(w, i).traits[(f.trans[i] ? f.tShape[i] : f.shape[i]) * T_LEN + T_MOVES] !== 0
}

// shape s's bracing struck from the side weighted (front, flank, rear) in `side`; a shape braced alike on every side
// gives its bracing exactly (the weights' sum may round off 1, and the refuge's test is ≥ 1)
const braceAt = (T: Float64Array, s: number, side: Float64Array): number => {
  const o = s * T_LEN
  const bf = T[o + T_BRACE]
  const bl = T[o + T_BRACE_FLANK]
  const br = T[o + T_BRACE_REAR]
  if (bf === bl && bl === br) return bf
  return side[0] * bf + side[1] * bl + side[2] * br
}
/**
 * How far formation i is braced against a charge struck from the side weighted (front, flank, rear) in `side`, 0..1
 * (docs/proposals/formations.md § 2a): its shape's bracing by side, and while changing, moved toward the new shape's
 * by the change's progress (a battalion forming square is partly braced).
 */
export function braceOf(w: World, i: number, side: Float64Array): number {
  const f = w.f
  const T = typeOf(w, i).traits
  const from = braceAt(T, f.shape[i], side)
  if (!f.trans[i]) return from
  const to = braceAt(T, f.tShape[i], side)
  return from + (to - from) * changeProgress(w, i, w.meta[M_TICK] * DT)
}

/** Whether formation i stands fully braced against a charge from any side (its refuge formed: the square). */
export function bracedAllRound(w: World, i: number): boolean {
  return braceOf(w, i, FRONT) >= 1 && braceOf(w, i, FLANK) >= 1 && braceOf(w, i, REAR) >= 1
}
const FRONT = new Float64Array([1, 0, 0])
const FLANK = new Float64Array([0, 1, 0])
const REAR = new Float64Array([0, 0, 1])
