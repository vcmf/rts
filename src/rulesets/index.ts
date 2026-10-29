// The eras' rulesets and uniforms by name (decision 0015: the engine names no era; a scenario names its ruleset, and
// the page resolves it here): a ruleset's data and the uniforms its units wear
import type { Dress, DyeSet, PuffDef, Ruleset } from '../sim/ruleset.ts'
import { napoleonic } from './napoleonic.ts'
import { DYES as NAPOLEONIC_DYES } from './napoleonic-dyes.ts'
import { VOLLEY_SMOKE as NAPOLEONIC_VOLLEY_SMOKE } from './napoleonic-smoke.ts'
import { UNIFORMS as NAPOLEONIC_UNIFORMS } from './napoleonic-uniforms.ts'

// uniforms: each names its cloth parts' dyes from the era's dye set (decision 0068; the look resolves them); smoke:
// what its units' fire leaves in the air (decision 0081: the volley's)
export const RULESETS: Readonly<
  Record<
    string,
    { ruleset: Ruleset; uniforms: Readonly<Record<string, Dress>>; dyes: DyeSet; smoke: { volley: PuffDef } }
  >
> = {
  napoleonic: {
    ruleset: napoleonic,
    uniforms: NAPOLEONIC_UNIFORMS,
    dyes: NAPOLEONIC_DYES,
    smoke: { volley: NAPOLEONIC_VOLLEY_SMOKE },
  },
}
