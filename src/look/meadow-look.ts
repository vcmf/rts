// The meadow's looks (decision 0085, docs/plans/active/grass-upright.md): the combed clumps' (?grassup, GRASS_UP in
// src/look/meadow-spec.ts) and the wheat's fill (?wheatfill), read from the page's query and turned into the defines
// the shaders take. Pure: no Babylon, so the tests read it.
import {
  GRASS_UP,
  GRASS_UP_DEFAULT,
  type GrassUp,
  WHEAT_FILL_DEFAULT,
  WHEAT_FILL_LOOKS,
  WHEAT_FILL_WIDE,
} from './meadow-spec.ts'

/** The meadow's look: the combed clumps' and the wheat's fill (0 main's before it, 1 the fill) */
export interface MeadowLook {
  up: GrassUp
  wheatFill: number
}
/** The default look: the upright carpet and the wheat's fill (the owner, 2026-10-30) */
export const MEADOW_LOOK: MeadowLook = { up: GRASS_UP[GRASS_UP_DEFAULT], wheatFill: WHEAT_FILL_DEFAULT }

/** The choice ?k=<digit> among n looks, d when absent; throws on anything but one digit under n ("", "02", "3" of 3) */
export function lookChoice(params: URLSearchParams, k: string, n: number, d: number): number {
  const v = params.get(k)
  if (v === null) return d
  if (!/^\d$/.test(v) || +v >= n) throw new Error(`?${k} must be 0 to ${n - 1}, not ${v}`)
  return +v
}

/** The page's meadow look from its query: ?grassup=0|1|2 (only with the combed meadow, grassMode flow: as ?grassoff, it
 * fails loudly with ?grass=brush) and ?wheatfill=0|1 */
export function meadowLookOf(params: URLSearchParams, grassMode: 'flow' | 'brush'): MeadowLook {
  if (params.has('grassup') && grassMode !== 'flow') {
    throw new Error('?grassup takes the combed meadow (not ?grass=brush)')
  }
  return {
    up: GRASS_UP[lookChoice(params, 'grassup', GRASS_UP.length, GRASS_UP_DEFAULT)],
    wheatFill: lookChoice(params, 'wheatfill', WHEAT_FILL_LOOKS, WHEAT_FILL_DEFAULT),
  }
}

/** The look's defines every painted material takes (the one source: the meadow's clumps read them through the
 * materials' shared defines, the ground's under-layer in shore.glsl too): the wheat's fill and its width */
export const meadowLookDefines = (look: MeadowLook): string[] =>
  look.wheatFill ? ['#define WHEAT_FILL', `#define WHEAT_FILL_WIDE ${WHEAT_FILL_WIDE.toFixed(2)}`] : []
