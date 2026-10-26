// The eras' rulesets and uniforms by name (decision 0015: the engine names no era; a scenario names its ruleset, and
// the page resolves it here): a ruleset's data and the uniforms its units wear
import type { Dress, DyeSet, Ruleset, Uniform } from '../sim/ruleset.ts'
import { napoleonic } from './napoleonic.ts'
import { DRESS as NAPOLEONIC_DRESS, DYES as NAPOLEONIC_DYES } from './napoleonic-dyes.ts'
import { UNIFORMS as NAPOLEONIC_UNIFORMS } from './napoleonic-uniforms.ts'

// dyes and dress: the dye palette's test set (?uniforms=dyes, decision 0068, proposed), not yet the uniforms worn
export const RULESETS: Readonly<
  Record<
    string,
    {
      ruleset: Ruleset
      uniforms: Readonly<Record<string, Uniform>>
      dyes?: DyeSet
      dress?: Readonly<Record<string, Dress>>
    }
  >
> = {
  napoleonic: { ruleset: napoleonic, uniforms: NAPOLEONIC_UNIFORMS, dyes: NAPOLEONIC_DYES, dress: NAPOLEONIC_DRESS },
}
