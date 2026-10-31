// The player's grass detail (docs/plans/active/grass-detail.md, issue #257, decision 0092): Full, the meadow as
// decision 0085 draws it, and Balanced, a share of the near ring's grass clumps shrunk away beyond a cut up close, for
// the frame's sake on farmland. Read from the page's query (?grassdetail=full|balanced) and the panel; the numbers the
// near ring's Balanced program (meadow.vert, GRASS_THIN) reads as uniforms, and the same rule in JS for the tests.
// Pure: no Babylon, so the tests read it.
import { CLOSE_ZOOM, RINGS } from './meadow-spec.ts'
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
/** The address's query for a level: ?grassdetail=balanced, none for Full (the default), the rest kept */
export function withGrassDetail(params: URLSearchParams, level: GrassDetail): URLSearchParams {
  const p = new URLSearchParams(params)
  if (level === GRASS_DETAIL_DEFAULT) p.delete('grassdetail')
  else p.set('grassdetail', level)
  return p
}

/** Where Balanced thins, m from the focus: its share ramps in across [0..1] and back out across [2..3], the near
 * ring's own band out, where the middle ring fades in at full density (so no step in density where they meet) */
export const THIN_RAMP: [number, number, number, number] = [8, 12, RINGS[0].band[2], RINGS[0].band[3]]
/** The share of the near ring's grass clumps Balanced drops between the ramps, up close */
export const BALANCED_DROP = 0.5
/** How far below the share (in the clumps' own hash) a clump shrinks from whole to nothing: no clump pops */
export const THIN_SOFT = 0.2

/** The share Balanced drops at the camera's radius (m): BALANCED_DROP up close, none from the end of CLOSE_ZOOM out
 * (the combed clumps' zoom, src/look/meadow-spec.ts), so the default zoom (125 m) is Full's (meadow.vert's uThin.x) */
export const dropAtZoom = (radius: number): number => BALANCED_DROP * (1 - sstep(CLOSE_ZOOM[0], CLOSE_ZOOM[1], radius))
/** Whether the near ring draws with Balanced's program at a level and the camera's radius: Full's from CLOSE_ZOOM's
 * end out, where nothing drops */
export const thinOn = (level: GrassDetail, radius: number): boolean => level === 'balanced' && dropAtZoom(radius) > 0

/** The share of the grass clumps dropped at a distance d (m) from the focus and the camera's radius (meadow.vert:
 * uThin.x times the ramps of THIN_RAMP, uThinRamp) */
export const dropShare = (d: number, radius: number): number =>
  dropAtZoom(radius) * sstep(THIN_RAMP[0], THIN_RAMP[1], d) * (1 - sstep(THIN_RAMP[2], THIN_RAMP[3], d))
/** How much of a grass clump with the drop's hash hd (0..1) stands at a share: whole above the share, shrinking to
 * nothing THIN_SOFT below it, so as the share moves the clump shrinks away and grows back, never pops; 0 is culled
 * (meadow.vert: grow times this); whole at a share of none (the hash is never negative). A crop is never thinned */
export function thinKeep(hd: number, share: number): number {
  if (share <= 0) return 1
  return sstep(share - THIN_SOFT, share, hd)
}
