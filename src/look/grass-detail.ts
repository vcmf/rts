// The player's grass detail (docs/plans/active/grass-detail.md, issue #257, decision 0092): Full, the meadow as
// decision 0085 draws it, and Balanced, fewer blades past the closest metres up close, for the frame's sake on
// farmland. Read from the page's query (?grassdetail=full|balanced); the rings the meadow builds for both levels and
// what each draws at a level and zoom (src/look/meadow.ts, shaders/meadow.vert). Pure: no Babylon, so the tests read
// it.
import { CLOSE_ZOOM, CLUMP_RADIUS, RINGS, type Ring } from './meadow-spec.ts'
import { sstep } from './noise.ts'

/** The levels, in the settings panel's order */
export const GRASS_DETAILS = ['full', 'balanced'] as const
export type GrassDetail = (typeof GRASS_DETAILS)[number]
/** Full everywhere, map windows included */
export const GRASS_DETAIL_DEFAULT: GrassDetail = 'full'

/** The page's grass detail from its query: ?grassdetail=full|balanced, Full when absent; throws on any other value.
 * Without the meadow (WebGL1, ?meadow=off) there are no rings to thin: Full, whatever the address says (a saved
 * address with Balanced still opens) */
export function grassDetailOf(params: URLSearchParams, meadowOn: boolean): GrassDetail {
  const v = params.get('grassdetail')
  if (v === null) return GRASS_DETAIL_DEFAULT
  if (!(GRASS_DETAILS as readonly string[]).includes(v)) {
    throw new Error(`?grassdetail must be ${GRASS_DETAILS.join(' or ')}, not ${v}`)
  }
  return meadowOn ? (v as GrassDetail) : GRASS_DETAIL_DEFAULT
}

/** A ring's band of distance from the focus, m: in from [0] to [1], out from [2] to [3] (Ring.band) */
export type Band = [number, number, number, number]
/** Balanced's cut, m from the focus: inside it the near ring's large clumps, beyond it (to the near ring's edge) the
 * cut ring's thinned grass and the crop ring's crops; up close only: across CLOSE_ZOOM (the camera's radius over
 * which the combed clumps widen up close, src/look/meadow-spec.ts) it hands back to Full, so the default zoom (125 m)
 * draws Full */
export const BALANCED_CUT: [number, number] = [8, 12]

/** A meadow ring and its part in the grass detail:
 * - main: as main draws it, grass and crops;
 * - near: the near (0.5 m) ring, its large clump out to the cut at Balanced (band) and to main's edge (main) at Full;
 * - cut, crop: beyond the cut at Balanced only, anchored to the world (world: their slots are the world's cells where
 *   grass, or crops, grow, so an empty cell costs nothing), the cut ring the grass with the thinned small clump
 *   (thinClump), the crop ring the crops with the large clump as at Full */
export type DetailRing = Ring &
  ({ kind: 'main' } | { kind: 'near'; main: Band } | { kind: 'cut' | 'crop'; world: true })
/** The meadow's rings: the near one, the cut and crop rings on the near ring's cells, main's two outer ones. The cut
 * ring's spread is scaled so its thinned clump's footprint is the large clump's (thinRadius: the thinned clump's
 * widest radius, data/meadow-grass.json's units). The outer rings keep main's clumps (thinning them too saved nothing
 * up close and cost at the default zoom: the plan) */
export function ringsFor(thinRadius: number): DetailRing[] {
  const [r0, ...rest] = RINGS
  const [a, b] = BALANCED_CUT
  const [, , c, d] = r0.band
  const beyond: Band = [a, b, c, d]
  return [
    { ...r0, band: [r0.band[0], r0.band[1], a, b], kind: 'near', main: r0.band },
    {
      ...r0,
      spread: (r0.spread * CLUMP_RADIUS.Grass_Large) / thinRadius,
      band: beyond,
      clump: 'Grass_Small',
      kind: 'cut',
      world: true,
    },
    { ...r0, band: beyond, kind: 'crop', world: true },
    ...rest.map((r): DetailRing => ({ ...r, kind: 'main' })),
  ]
}

/** What a ring draws this frame (meadow.vert's uniforms): its weight across band, the edge out moving from band's to
 * mix's [0..1] by mix[2], the whole times mix[3] (a ring fading away); grass and crop: which it draws (1 or 0); flip:
 * its clumps kept by 1 - the hash where the near ring keeps them by the hash (the cut and crop rings, on the near
 * ring's cells: across the cut the two keep complementary roots, never one root twice nor none); cull: the band its
 * chunks are culled to (w 0: not drawn) */
export interface RingBands {
  band: Band
  mix: Band
  grass: number
  crop: number
  flip: number
  cull: Band
}
/** A fresh RingBands to write into (one a ring, made once) */
export const ringBandsOf = (): RingBands => ({
  band: [0, 0, 0, 0],
  mix: [0, 0, 0, 1],
  grass: 1,
  crop: 1,
  flip: 0,
  cull: [0, 0, 0, 0],
})
const put = (o: Band, a: number, b: number, c: number, d: number) => {
  o[0] = a
  o[1] = b
  o[2] = c
  o[3] = d
}
/** A ring's bands at a level and the camera's radius, written into out (nothing allocated a frame). Full: main's
 * bands, the cut and crop rings faded out. Balanced: the near ring to the cut, the cut ring's grass and the crop
 * ring's crops beyond it; across CLOSE_ZOOM the near ring's edge moves out to main's while the cut and crop rings fade
 * by as much, so the rings always add to one (no pop, no overdraw) */
export function ringBands(r: DetailRing, level: GrassDetail, radius: number, out: RingBands): void {
  const t = level === 'full' ? 1 : sstep(CLOSE_ZOOM[0], CLOSE_ZOOM[1], radius)
  const b = r.kind === 'near' && level === 'full' ? r.main : r.band
  put(out.band, b[0], b[1], b[2], b[3])
  out.grass = r.kind === 'crop' ? 0 : 1
  out.crop = r.kind === 'cut' ? 0 : 1
  out.flip = r.kind === 'cut' || r.kind === 'crop' ? 1 : 0
  if (r.kind === 'near' && level === 'balanced') {
    put(out.mix, r.main[2], r.main[3], t, 1)
    const o = t > 0 ? r.main : b
    put(out.cull, b[0], b[1], o[2], o[3])
  } else if (r.kind === 'cut' || r.kind === 'crop') {
    put(out.mix, b[2], b[3], 0, 1 - t)
    if (t < 1) put(out.cull, b[0], b[1], b[2], b[3])
    else put(out.cull, 0, 0, 0, 0)
  } else {
    put(out.mix, b[2], b[3], 0, 1)
    put(out.cull, b[0], b[1], b[2], b[3])
  }
}

/** The widest band a ring-anchored ring draws at any level and zoom (its slots are cut to it: the near ring reaches
 * main's edge at Full) */
export function slotBand(r: DetailRing): Band {
  return r.kind === 'near' ? r.main : r.band
}
