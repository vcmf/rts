// The player's grass detail (docs/plans/active/grass-detail.md, issue #257, decision 0092): Full, the meadow as
// decision 0085 draws it, and Balanced, fewer blades past the closest metres up close, for the frame's sake on
// farmland. Read from the page's query (?grassdetail=full|balanced); the rings the meadow builds for both levels and
// what each draws at a level and zoom (src/look/meadow.ts, shaders/meadow.vert). Pure: no Babylon, so the tests read
// it.
import { CLUMP_RADIUS, RINGS, type Ring } from './meadow-spec.ts'

/** The levels, in the settings panel's order */
export const GRASS_DETAILS = ['full', 'balanced'] as const
export type GrassDetail = (typeof GRASS_DETAILS)[number]
/** Full everywhere, map windows included */
export const GRASS_DETAIL_DEFAULT: GrassDetail = 'full'

/** The page's grass detail from its query: ?grassdetail=full|balanced, Full when absent; throws on any other value,
 * and on Balanced without the meadow (WebGL1, ?meadow=off: no rings to thin), as ?grassup does */
export function grassDetailOf(params: URLSearchParams, meadowOn: boolean): GrassDetail {
  const v = params.get('grassdetail')
  if (v === null) return GRASS_DETAIL_DEFAULT
  if (!(GRASS_DETAILS as readonly string[]).includes(v)) {
    throw new Error(`?grassdetail must be ${GRASS_DETAILS.join(' or ')}, not ${v}`)
  }
  if (v === 'balanced' && !meadowOn) throw new Error('?grassdetail=balanced needs the meadow (WebGL2, no ?meadow=off)')
  return v as GrassDetail
}

/** A ring's band of distance from the focus, m: in from [0] to [1], out from [2] to [3] (Ring.band) */
export type Band = [number, number, number, number]
/** Balanced's cut of the near (0.5 m) ring, m from the focus: its large clump hands over to the thinned small one
 * across BALANCED_CUT, up close only (the default zoom, 125 m, draws Full) */
export const BALANCED_CUT: [number, number] = [8, 12]
/** The camera's radius, m, across which Balanced's cut hands back to Full's ring (the combed clumps' CLOSE_ZOOM,
 * src/look/main.ts, over which they widen up close) */
export const BALANCED_ZOOM: [number, number] = [70, 110]

/** A meadow ring: main's ring and its part in the grass detail. near: the near ring, its large clump out to the cut
 * at Balanced (band) and to main's edge at Full (main); cut: the thinned small clump (thinClump) beyond the cut,
 * drawn at Balanced only, grass only (the crops stay the near ring's at every level); main: as main draws it. zoom:
 * the camera's radius across which Balanced hands back to Full (the near ring's edge moving out to main's, the cut
 * ring fading away) */
export type DetailRing = Ring &
  ({ kind: 'main' } | { kind: 'near'; main: Band; zoom: [number, number] } | { kind: 'cut'; zoom: [number, number] })
/** The meadow's rings: main's three, the near one cut in two at BALANCED_CUT (the cut ring on the same cells, its
 * spread scaled so its thinned clump's footprint is the large clump's: thinRadius, the thinned clump's widest
 * radius in data/meadow-grass.json's units). The outer rings keep main's clumps (thinning them too saved nothing up
 * close and cost at the default zoom: the plan) */
export function ringsFor(thinRadius: number): DetailRing[] {
  const [r0, ...rest] = RINGS
  const [a, b] = BALANCED_CUT
  const [, , c, d] = r0.band
  return [
    { ...r0, band: [r0.band[0], r0.band[1], a, b], kind: 'near', main: r0.band, zoom: BALANCED_ZOOM },
    {
      ...r0,
      spread: (r0.spread * CLUMP_RADIUS.Grass_Large) / thinRadius,
      band: [a, b, c, d],
      clump: 'Grass_Small',
      kind: 'cut',
      zoom: BALANCED_ZOOM,
    },
    ...rest.map((r): DetailRing => ({ ...r, kind: 'main' })),
  ]
}

/** What a ring draws this frame (meadow.vert's uniforms): grass across band, its edge out moving from band's to
 * mix's [0..1] by mix[2] and the whole times mix[3] (a ring fading away); crops across crop (crop[3] 0: none) */
export interface RingBands {
  band: Band
  mix: Band
  crop: Band
}
/** A fresh RingBands to write into (one a ring, made once) */
export const ringBandsOf = (): RingBands => ({ band: [0, 0, 0, 0], mix: [0, 0, 0, 1], crop: [0, 0, 0, 0] })
const put = (o: Band, a: number, b: number, c: number, d: number) => {
  o[0] = a
  o[1] = b
  o[2] = c
  o[3] = d
}
/** How far Balanced has handed back to Full at the camera's radius: 0 up close, 1 from zoom[1] out (smoothstep) */
export function handBack(zoom: [number, number], radius: number): number {
  const u = Math.min(1, Math.max(0, (radius - zoom[0]) / (zoom[1] - zoom[0])))
  return u * u * (3 - 2 * u)
}
/** A ring's bands at a level and the camera's radius, written into out (nothing allocated a frame). Full: main's
 * bands, the cut ring faded out. Balanced: the near ring's grass to the cut and its crops to main's edge; the cut
 * ring's grass beyond it, no crops; across the zoom the near ring's edge moves out to main's while the cut ring
 * fades by as much, so the two always add to one (no pop, no overdraw) */
export function ringBands(r: DetailRing, level: GrassDetail, radius: number, out: RingBands): void {
  const b = r.kind === 'near' && level === 'full' ? r.main : r.band
  put(out.band, b[0], b[1], b[2], b[3])
  if (r.kind === 'near') {
    const t = level === 'full' ? 0 : handBack(r.zoom, radius)
    put(out.mix, r.main[2], r.main[3], t, 1)
    put(out.crop, r.main[0], r.main[1], r.main[2], r.main[3])
  } else if (r.kind === 'cut') {
    const fade = level === 'full' ? 0 : 1 - handBack(r.zoom, radius)
    put(out.mix, b[2], b[3], 0, fade)
    put(out.crop, 0, 0, 0, 0)
  } else {
    put(out.mix, b[2], b[3], 0, 1)
    put(out.crop, b[0], b[1], b[2], b[3])
  }
}

/** The widest band a ring draws at any level and zoom (its slots are cut to it: the near ring's crops and Full's
 * grass reach main's edge) */
export function slotBand(r: DetailRing): Band {
  return r.kind === 'near' ? r.main : r.band
}

/** A clump's widest radius in data/meadow-grass.json's units (its positions are normalised to a height of 1) */
export function clumpRadius(c: Clump): number {
  let w = 0
  for (let i = 0; i < c.pos.length; i += 3) w = Math.max(w, Math.hypot(c.pos[i], c.pos[i + 2]))
  return w * c.top
}

/** An indexed clump (data/meadow-grass.json as src/look/meadow.ts indexes it) */
export interface Clump {
  pos: number[]
  nrm: number[]
  vv: number[]
  idx: number[]
  top: number
}
/** Every other blade of a clump: its triangles joined into blades by shared positions, the blades in the order their
 * first triangle comes, the even ones kept, and only their vertices */
export function thinClump(c: Clump): Clump {
  const key = (v: number) => `${c.pos[v * 3]},${c.pos[v * 3 + 1]},${c.pos[v * 3 + 2]}`
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    let r = a
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  for (const v of c.idx) if (!parent.has(key(v))) parent.set(key(v), key(v))
  for (let t = 0; t < c.idx.length; t += 3) {
    const a = find(key(c.idx[t]))
    for (let q = 1; q < 3; q++) {
      const b = find(key(c.idx[t + q]))
      if (a !== b) parent.set(b, a)
    }
  }
  const blade = new Map<string, number>()
  const remap = new Map<number, number>()
  const out: Clump = { pos: [], nrm: [], vv: [], idx: [], top: c.top }
  for (let t = 0; t < c.idx.length; t += 3) {
    const r = find(key(c.idx[t]))
    if (!blade.has(r)) blade.set(r, blade.size)
    if (blade.get(r)! % 2) continue
    for (let q = 0; q < 3; q++) {
      const v = c.idx[t + q]
      let w = remap.get(v)
      if (w === undefined) {
        w = out.vv.length
        remap.set(v, w)
        out.pos.push(c.pos[v * 3], c.pos[v * 3 + 1], c.pos[v * 3 + 2])
        out.nrm.push(c.nrm[v * 3], c.nrm[v * 3 + 1], c.nrm[v * 3 + 2])
        out.vv.push(c.vv[v])
      }
      out.idx.push(w)
    }
  }
  return out
}
