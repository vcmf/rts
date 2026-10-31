// The player's grass detail (docs/plans/active/grass-detail.md, issue #257, decision 0092): Full, the meadow as
// decision 0085 draws it, and Balanced, a share of the near ring's grass clumps dropped beyond a cut up close, for
// the frame's sake on farmland. Read from the page's query (?grassdetail=full|balanced) and the panel; the share the
// near ring's Balanced material (meadow.vert, GRASS_THIN) drops at a distance and zoom. Pure: no Babylon, so the
// tests read it.
import { CLOSE_ZOOM } from './meadow-spec.ts'
import { sstep } from './noise.ts'

/** The levels, in the settings panel's order */
export const GRASS_DETAILS = ['full', 'balanced'] as const
export type GrassDetail = (typeof GRASS_DETAILS)[number]
/** Full everywhere, map windows included */
export const GRASS_DETAIL_DEFAULT: GrassDetail = 'full'
/** Whether a string is a level (the query's value, the panel's) */
export const isGrassDetail = (v: string): v is GrassDetail => (GRASS_DETAILS as readonly string[]).includes(v)

/** The page's grass detail from its query: ?grassdetail=full|balanced, Full when absent; throws on any other value.
 * Without the meadow (WebGL1, ?meadow=off) there is no grass to thin: Full, whatever the address says (a saved
 * address with Balanced still opens) */
export function grassDetailOf(params: URLSearchParams, meadowOn: boolean): GrassDetail {
  const v = params.get('grassdetail')
  if (v === null) return GRASS_DETAIL_DEFAULT
  if (!isGrassDetail(v)) throw new Error(`?grassdetail must be ${GRASS_DETAILS.join(' or ')}, not ${v}`)
  return meadowOn ? v : GRASS_DETAIL_DEFAULT
}

/** Balanced's cut, m from the focus: the share of the near ring's grass clumps dropped grows from 0 to BALANCED_DROP
 * across it (meadow.vert, GRASS_THIN) */
export const BALANCED_CUT: [number, number] = [8, 12]
/** The share of the grass clumps Balanced drops beyond the cut, up close */
export const BALANCED_DROP = 0.5

/** The share Balanced drops at the camera's radius (m), beyond the cut: BALANCED_DROP up close, none from the end of
 * CLOSE_ZOOM out (the combed clumps' zoom, src/look/meadow-spec.ts), so the default zoom (125 m) draws Full */
export const dropAtZoom = (radius: number): number => BALANCED_DROP * (1 - sstep(CLOSE_ZOOM[0], CLOSE_ZOOM[1], radius))

/** The share of the grass clumps Balanced drops at a distance d (m) from the focus and the camera's radius (meadow.vert
 * reads dropAtZoom as uThin and ramps it across BALANCED_CUT itself). The crops are never dropped: the shader's drop
 * lies on the grass branch only */
export const dropShare = (d: number, radius: number): number =>
  dropAtZoom(radius) * sstep(BALANCED_CUT[0], BALANCED_CUT[1], d)
