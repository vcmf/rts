// The player's grass detail (docs/plans/active/grass-detail.md, issue #257): Full, the meadow as decision 0085 draws
// it, and Balanced, fewer blades past the closest metres for the frame's sake on farmland. Read from the page's query
// (?grassdetail=full|balanced), and the presets the meadow builds its rings and clumps from (src/look/meadow.ts).
// Pure: no Babylon, so the tests read it.
import { CLUMP_RADIUS, RINGS, type Ring } from './meadow-spec.ts'

/** The levels, in the settings panel's order */
export const GRASS_DETAILS = ['full', 'balanced'] as const
export type GrassDetail = (typeof GRASS_DETAILS)[number]
/** Full everywhere, map windows included */
export const GRASS_DETAIL_DEFAULT: GrassDetail = 'full'

/** The page's grass detail from its query: ?grassdetail=full|balanced, Full when absent; throws on any other value */
export function grassDetailOf(params: URLSearchParams): GrassDetail {
  const v = params.get('grassdetail')
  if (v === null) return GRASS_DETAIL_DEFAULT
  if (!(GRASS_DETAILS as readonly string[]).includes(v)) {
    throw new Error(`?grassdetail must be ${GRASS_DETAILS.join(' or ')}, not ${v}`)
  }
  return v as GrassDetail
}

/** A ring's band of distance from the focus, m: in from [0] to [1], out from [2] to [3] (Ring.band) */
export type Band = [number, number, number, number]
/** What a level changes in the meadow: the 0.5 m ring cut in two (null: not), its large clump handing over to the
 * thinned small one across split.band (m from the focus), up close only: across split.zoom (m of the camera's radius)
 * the cut moves out to the ring's edge, so from zoom[1] out the ring is Full's (the default zoom, 125 m, is) */
export interface GrassDetailPreset {
  split: { band: [number, number]; zoom: [number, number] } | null
}
export const GRASS_DETAIL_PRESETS: Record<GrassDetail, GrassDetailPreset> = {
  full: { split: null },
  // (the zoom: the combed clumps' CLOSE_ZOOM, src/look/main.ts, over which they widen up close)
  balanced: { split: { band: [8, 12], zoom: [70, 110] } },
}

/** A ring of a preset: main's ring, whether its clump is thinned (thinClump, every other blade), and the band it
 * takes from the split's zoom out (far; with gone, not drawn there) */
export interface DetailRing extends Ring {
  thin: boolean
  far?: { band: Band; gone: boolean }
}
/** The meadow's rings for a preset: main's, or the 0.5 m ring cut in two at nearSplit, the large clump inside and the
 * thinned small one outside on the same cells, its spread scaled so its footprint is the large clump's. The outer
 * rings keep main's clumps (thinning them too saved nothing up close and cost at the default zoom: the plan) */
export function ringsFor(p: GrassDetailPreset): DetailRing[] {
  const main = (r: Ring): DetailRing => ({ ...r, thin: false })
  if (!p.split) return RINGS.map(main)
  const [r0, ...rest] = RINGS
  const [a, b] = p.split.band
  const [, , c, d] = r0.band
  const spread = (r0.spread * CLUMP_RADIUS.Grass_Large) / CLUMP_RADIUS.Grass_Small
  return [
    { ...r0, band: [r0.band[0], r0.band[1], a, b], thin: false, far: { band: r0.band, gone: false } },
    { ...r0, spread, band: [a, b, c, d], clump: 'Grass_Small', thin: true, far: { band: [c, d, c, d], gone: true } },
    ...rest.map(main),
  ]
}

/** The widest band a ring takes at any zoom (its slots are cut to it: a ring whose band moves out by zoom needs the
 * slots of its far band too) */
export function slotBand(r: DetailRing): Band {
  const f = r.far?.band ?? r.band
  const b = r.band
  return [Math.min(b[0], f[0]), Math.min(b[1], f[1]), Math.max(b[2], f[2]), Math.max(b[3], f[3])]
}

/** A ring's band at the camera's radius (m): its own up close, moving to its far band across the split's zoom
 * (smoothstep); null where it is not drawn (a gone ring from the zoom's end out) */
export function bandAt(r: DetailRing, p: GrassDetailPreset, radius: number): Band | null {
  if (!r.far || !p.split) return r.band
  const [z0, z1] = p.split.zoom
  const u = Math.min(1, Math.max(0, (radius - z0) / (z1 - z0)))
  if (u >= 1 && r.far.gone) return null
  const t = u * u * (3 - 2 * u)
  const far = r.far.band
  return [0, 1, 2, 3].map(i => r.band[i] + (far[i] - r.band[i]) * t) as Band
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
