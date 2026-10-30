// A formation's strengths and weaknesses as it stands (docs/proposals/formations.md § 5a): the one place the sim reads
// a shape's traits (the ruleset's TraitsDef, compiled to TypeTable.traits), and the one place that knows a change of
// shape is under way. Fire, melee and the sectors read a formation through it, never a shape's name or kind.
import { type World, typeOf, M_TICK } from './world.ts'
import { changeProgress } from './formation.ts'
import { T_LEN, T_HITS, T_FLANK, T_REAR, T_SIDED, T_MELEE, T_BRACE } from './ruleset.ts'
import { DT } from './time.ts'

/** Shape s of formation i's trait t (one of the T_ fields). */
const traitAt = (w: World, i: number, s: number, t: number): number => typeOf(w, i).traits[s * T_LEN + t]

/** Formation i's trait t in the shape it stands in (while changing: the shape it is leaving). */
export const traitOf = (w: World, i: number, t: number): number => traitAt(w, i, w.f.shape[i], t)

/**
 * Formation i's hits taken from fire whose weights on its face are (front, flank, rear) `wt`
 * (docs/proposals/sectors-model.md § 5): the front's, times front + flank × the flank's multiple + rear × the rear's;
 * the front's alone for a shape with neither given.
 */
export function hitsTaken(w: World, i: number, wt: ArrayLike<number>): number {
  const base = traitOf(w, i, T_HITS)
  if (!traitOf(w, i, T_SIDED)) return base
  return base * (wt[0] + wt[1] * traitOf(w, i, T_FLANK) + wt[2] * traitOf(w, i, T_REAR))
}
/** Whether formation i's hits taken depend on the side the fire comes from (else `hitsTaken` reads no weights). */
export const sided = (w: World, i: number): boolean => traitOf(w, i, T_SIDED) !== 0

/** Formation i's melee strength from its shape (before disorder and its morale state, melee.ts). */
export const meleeOf = (w: World, i: number): number => traitOf(w, i, T_MELEE)

/**
 * How far formation i is braced against a charge, 0..1: its shape's brace, and while changing, moved toward the new
 * shape's by the change's progress (a battalion forming square is partly braced).
 */
export function braceOf(w: World, i: number): number {
  const f = w.f
  const from = traitAt(w, i, f.shape[i], T_BRACE)
  if (!f.trans[i]) return from
  const to = traitAt(w, i, f.tShape[i], T_BRACE)
  return from + (to - from) * changeProgress(w, i, w.meta[M_TICK] * DT)
}
