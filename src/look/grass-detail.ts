// The player's grass detail (docs/plans/active/grass-detail.md, issue #257, decision 0095): Full, the meadow as
// decision 0085 draws it, and Balanced, a share of the near ring's grass clumps shrunk away beyond a cut up close, for
// the frame's sake on farmland. Read from the page's query (?grassdetail=full|balanced) and the panel; the numbers the
// near ring's Balanced program (meadow.vert, GRASS_THIN) reads as uniforms, and the same rule in JS for the tests.
// Pure: no Babylon, so the tests read it.
import { CLOSE_ZOOM, RINGS } from './meadow-spec.ts'
import { sstep } from './noise.ts'

/** The levels, in the settings panel's order */
export const GRASS_DETAILS = ['full', 'balanced'] as const
export type GrassDetail = (typeof GRASS_DETAILS)[number]
/** Balanced, map windows included (the owner, 2026-10-31, decision 0095); Full where there is no meadow to thin */
export const GRASS_DETAIL_DEFAULT: GrassDetail = 'balanced'
/** Whether a string is a level (the query's value, the panel's) */
export const isGrassDetail = (v: string): v is GrassDetail => (GRASS_DETAILS as readonly string[]).includes(v)

/** The page's grass detail from its query: ?grassdetail=full|balanced, the default (Balanced) when absent; throws on
 * any other value. Without the meadow (WebGL1, ?meadow=off) there is no grass to thin: Full, whatever the address
 * says (a saved address with Balanced still opens) */
export function grassDetailOf(params: URLSearchParams, meadowOn: boolean): GrassDetail {
  const v = params.get('grassdetail')
  if (v !== null && !isGrassDetail(v)) throw new Error(`?grassdetail must be ${GRASS_DETAILS.join(' or ')}, not ${v}`)
  return meadowOn ? (v ?? GRASS_DETAIL_DEFAULT) : 'full'
}
/** The address's search string (location.search) for a level in force: the same string when it already says that
 * level (none named is the default, Balanced: an address without grassdetail at Balanced untouched), else only that
 * key edited (grassdetail=full, or gone for the default), every other part kept as written (no re-encoding) */
export function searchWithGrassDetail(search: string, level: GrassDetail): string {
  const parts = search
    .replace(/^\?/, '')
    .split('&')
    .filter(p => p !== '')
  const isKey = (p: string) => p === 'grassdetail' || p.startsWith('grassdetail=')
  const now = parts.find(isKey)
  // (the level the address says: the default when it names none)
  if ((now === undefined ? GRASS_DETAIL_DEFAULT : now.slice('grassdetail='.length)) === level) return search
  const want = level === GRASS_DETAIL_DEFAULT ? undefined : `grassdetail=${level}`
  const at = parts.findIndex(isKey)
  const kept = parts.filter(p => !isKey(p))
  if (want) kept.splice(at < 0 ? kept.length : at, 0, want)
  return kept.length ? `?${kept.join('&')}` : ''
}

/** Where Balanced thins, m from the focus: its share ramps in across [0..1] and back out across [2..3], the near
 * ring's own band out, where the middle ring fades in at full density (so no step in density where they meet) */
export const THIN_RAMP: [number, number, number, number] = [8, 12, RINGS[0].band[2], RINGS[0].band[3]]
/** The share of the near ring's grass clumps Balanced culls between the ramps, up close (another THIN_SOFT of them
 * shrunk, above it) */
export const BALANCED_DROP = 0.5
/** How far (in the clumps' own hash) a clump shrinks from whole to nothing below the share: no clump pops */
export const THIN_SOFT = 0.2

/** Balanced's share at the camera's radius (m), the hash under which a clump starts to shrink (meadow.vert's
 * uThin.x): BALANCED_DROP + THIN_SOFT up close, so BALANCED_DROP of the clumps are culled and THIN_SOFT more shrunk;
 * none from the end of CLOSE_ZOOM out (the combed clumps' zoom, src/look/meadow-spec.ts), so the default zoom (125 m)
 * is Full's */
export const dropAtZoom = (radius: number): number =>
  (BALANCED_DROP + THIN_SOFT) * (1 - sstep(CLOSE_ZOOM[0], CLOSE_ZOOM[1], radius))
/** Whether the near ring draws with Balanced's program at a level and the camera's radius: Full's from CLOSE_ZOOM's
 * end out, where nothing drops */
export const thinOn = (level: GrassDetail, radius: number): boolean => level === 'balanced' && dropAtZoom(radius) > 0

/** The share of the grass clumps dropped at a distance d (m) from the focus, at a share s at this zoom (meadow.vert:
 * uThin.x, eased, times the ramps of THIN_RAMP, uThinRamp) */
export const dropShare = (d: number, s: number): number =>
  s * sstep(THIN_RAMP[0], THIN_RAMP[1], d) * (1 - sstep(THIN_RAMP[2], THIN_RAMP[3], d))
/** How much of a grass clump with the drop's hash hd (0..1) stands at a share: whole above the share, shrinking to
 * nothing THIN_SOFT below it, so as the share moves the clump shrinks away and grows back, never pops; 0 is culled
 * (meadow.vert: grow times this); whole at a share of none (the hash is never negative). A crop is never thinned */
export const thinKeep = (hd: number, share: number): number => sstep(share - THIN_SOFT, share, hd)

/** How long Balanced's share takes to ease from none to its whole (BALANCED_DROP + THIN_SOFT) or back, s, after its
 * program switches on or before it switches off: a switch never pops the clumps (the program with a share of none
 * draws Full's clumps) */
export const THIN_EASE_S = 0.3

/** Balanced on the near ring from frame to frame (src/look/meadow.ts): the program in force (GRASS_THIN on or off),
 * the share it shows (meadow.vert's uThin.x), eased, and the program it asks for. On: as soon as Balanced wants it,
 * at a share of none, the share then easing up; off: once the share has eased down to none */
export class ThinEase {
  /** GRASS_THIN in force on the near ring's material */
  program = false
  /** the share shown this frame */
  share = 0
  private readonly easeS: number
  /** easeS: THIN_EASE_S, or 0 to snap (the look tools' frozen page renders a view in a few frames) */
  constructor(easeS = THIN_EASE_S) {
    this.easeS = easeS
  }
  /** A frame at a level and the camera's radius (m), dt s after the last: eases the share toward its target (none
   * while the program is off or Balanced does not want it) and returns the program to ask for */
  step(level: GrassDetail, radius: number, dt: number): boolean {
    const want = thinOn(level, radius)
    const target = this.target(level, radius)
    const most = this.easeS > 0 ? ((BALANCED_DROP + THIN_SOFT) / this.easeS) * Math.max(0, dt) : Infinity
    this.share += Math.max(-most, Math.min(most, target - this.share))
    return want || this.share > 0
  }
  /** The share this frame eases toward: the zoom's while the program is in force and Balanced wants it, else none */
  target(level: GrassDetail, radius: number): number {
    return this.program && thinOn(level, radius) ? dropAtZoom(radius) : 0
  }
  /** Whether Balanced has come to rest at a level and radius: the program asked for in force and the share at its
   * target (the look tools wait on it before a still: src/look/main.ts, __look.meadowSettled) */
  settled(level: GrassDetail, radius: number): boolean {
    const asks = thinOn(level, radius) || this.share > 0
    return asks === this.program && this.share === this.target(level, radius)
  }
}
