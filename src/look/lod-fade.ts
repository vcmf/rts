// The figures' LOD cross-fade (#188, docs/plans/active/lod-fade.md, decision 0066): a battalion at a LOD switch draws
// both LODs, each man at his own LOD by his own height on screen, switching at his own point in a band of heights over
// a short screen-door dither, so no battalion pops from one LOD to the next at once. Pure: src/look/units.ts draws it,
// src/look/shaders/units.vert and units.frag mirror fadeShare, manHash and lodCover.

/** the band round the near LOD's switch (lodPx), as shares of it: from 0.8 × to 1.25 × the switch a man is drawn at
 *  the far LOD, then the near, at his own height in it (the hard switch's ±10 % and a little more) */
export const NEAR_FADE: readonly [number, number] = [0.8, 1.25]
/** and round the tiny LOD's (tinyPx) */
export const TINY_FADE: readonly [number, number] = [0.8, 1.25]
/** a man's own cross-fade, a share of the band (the rest spreads the men's switches over it) */
export const FADE_WIDTH = 0.35

/** A man's hash in [0, 1) from his place in his battalion's instances (lowbias32; units.vert hashes gl_InstanceID
 *  alike), so he switches at the same point in a band every time */
export function manHash(i: number): number {
  let x = Math.imul(i >>> 0, 0x9e3779b9) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x21f0aaad) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x735a2d97) >>> 0
  x ^= x >>> 15
  return (x >>> 8) / 16777216
}

/** The share of a man drawn at the nearer of two LODs (0: wholly the farther, 1: wholly the nearer), from his height
 *  on screen (px) in the band (px, low to high; a band of 0 or less: none, wholly the nearer): his place in the band
 *  on a log scale (a zoom's steps alike at any height), his own fade (width, a share of the band) starting at his hash
 *  (0 to 1) along the rest */
export function fadeShare(px: number, band: readonly [number, number], hash: number, width = FADE_WIDTH): number {
  if (!(band[1] > 0)) return 1
  const t = Math.log(Math.max(px, 1e-6) / band[0]) / Math.log(band[1] / band[0])
  return Math.min(1, Math.max(0, (t - hash * (1 - width)) / width))
}

/** A man's cover by LOD: the dither's thresholds that split [0, 1) among the near LOD (below near), the far LOD
 *  (between) and the tiny (from far): near, his share at the near LOD over the far; far, at the far LOD over the tiny
 *  (1 without a tiny LOD). A pixel's threshold q (units.frag: the 4 × 4 ordered dither) picks one LOD, so every pixel
 *  of him is drawn by exactly one of them */
export function lodCover(
  px: number,
  near: readonly [number, number],
  tiny: readonly [number, number] | null,
  hash: number,
): { near: number; far: number } {
  const n = fadeShare(px, near, hash)
  return { near: n, far: Math.max(n, tiny ? fadeShare(px, tiny, hash) : 1) }
}

/** The LOD a pixel of a man is drawn at, by its dither threshold q in [0, 1) and his cover (lodCover) */
export function lodAt(q: number, cover: { near: number; far: number }): 'near' | 'far' | 'tiny' {
  return q < cover.near ? 'near' : q < cover.far ? 'far' : 'tiny'
}

/** The LODs a battalion draws, from the heights on screen (px) of its nearest and farthest men (its bounds' nearest
 *  and farthest points: pLo ≤ every man's ≤ pHi): each LOD any of its men has a share of in the bands (near, tiny:
 *  lodCover's; tiny null: no tiny LOD); a battalion wholly outside the bands draws one LOD, as the hard switch did */
export function lodsDrawn(
  pLo: number,
  pHi: number,
  near: readonly [number, number],
  tiny: readonly [number, number] | null,
): { near: boolean; far: boolean; tiny: boolean } {
  return {
    near: pHi > near[0],
    far: pLo < near[1] && (!tiny || pHi > tiny[0]),
    tiny: !!tiny && pLo < tiny[1],
  }
}

/** The heights on screen (px) of a figure at a box's farthest and nearest points from the camera (cam; lo and hi the
 *  box's corners, m; k: a figure's height in pixels at 1 m), the nearest at least 1 m off as the page's own test */
export function boxPxRange(
  lo: { x: number; y: number; z: number },
  hi: { x: number; y: number; z: number },
  cam: { x: number; y: number; z: number },
  k: number,
): [number, number] {
  const near = Math.hypot(
    Math.max(lo.x - cam.x, 0, cam.x - hi.x),
    Math.max(lo.y - cam.y, 0, cam.y - hi.y),
    Math.max(lo.z - cam.z, 0, cam.z - hi.z),
  )
  const far = Math.hypot(
    Math.max(cam.x - lo.x, hi.x - cam.x),
    Math.max(cam.y - lo.y, hi.y - cam.y),
    Math.max(cam.z - lo.z, hi.z - cam.z),
  )
  return [k / Math.max(1, far), k / Math.max(1, near)]
}
