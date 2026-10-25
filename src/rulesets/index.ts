// The eras' rulesets and uniforms by name (decision 0015: the engine names no era; a scenario names its ruleset, and
// the page resolves it here): a ruleset's data and the uniforms its units wear
import type { Ruleset, Uniform } from '../sim/ruleset.ts'
import { napoleonic } from './napoleonic.ts'
import { UNIFORMS as NAPOLEONIC_UNIFORMS } from './napoleonic-uniforms.ts'

export const RULESETS: Readonly<Record<string, { ruleset: Ruleset; uniforms: Readonly<Record<string, Uniform>> }>> = {
  napoleonic: { ruleset: napoleonic, uniforms: NAPOLEONIC_UNIFORMS },
}
