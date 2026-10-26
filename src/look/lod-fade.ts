// The figures' LOD cross-fade (#188, docs/plans/done/lod-fade.md, decision 0066): a battalion at a LOD switch draws
// both LODs, each man at his own LOD by his own height on screen, switching at his own point in a band of heights over
// a short screen-door dither, so no battalion pops from one LOD to the next at once. Pure: src/look/units.ts draws it,
// src/look/shaders/units.vert and units.frag mirror fadeShare, manHash, lodCover, drawsPixel and dropsMan.
import { drawsNear, drawsTiny } from './units-data.ts'

/** the band round the near LOD's switch (lodPx), as shares of it: from 0.8 × to 1.25 × the switch a man is drawn at
 *  the far LOD, then the near, at his own height in it (the hard switch's ±10 % and a little more) */
export const NEAR_FADE: readonly [number, number] = [0.8, 1.25]
/** and round the tiny LOD's (tinyPx) */
export const TINY_FADE: readonly [number, number] = [0.8, 1.25]
/** a man's own cross-fade, a share of the band (the rest spreads the men's switches over it) */
export const FADE_WIDTH = 0.35

/** the far LOD's palette, lift and growth start below this share of the near switch (units.vert, unitdecal.vert:
 *  FAR_FROM), so they are 0 over the whole near band; 0.9 with the hard switch (?lodfade=0), as before */
export const FAR_FROM = NEAR_FADE[0]

/** A man's hash in [0, 1) from his index in his battalion (lowbias32; units.vert hashes his aMan alike, which holds
 *  his index whatever list he is drawn from), so he switches at the same point in a band every time */
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

/** A cover snapped to the dither's 16 levels (units.vert): each pixel's LOD as unsnapped (the thresholds are at
 *  (j + 0.5) / 16), and every threshold 1/32 from it, so the cover interpolated across a man cannot flip a pixel */
export function snapCover(c: { near: number; far: number }): { near: number; far: number } {
  return { near: Math.floor(c.near * 16 + 0.5) / 16, far: Math.floor(c.far * 16 + 0.5) / 16 }
}

/** the LODs' slots in the shaders (LOD_SLOT) */
export const SLOTS = ['near', 'far', 'tiny'] as const

/** Whether a LOD's material (slot: 0 near, 1 far, 2 tiny) draws a pixel of a man (units.frag's discards): its
 *  threshold q against his cover */
export function drawsPixel(slot: 0 | 1 | 2, q: number, cover: { near: number; far: number }): boolean {
  return slot === 0 ? q < cover.near : slot === 1 ? q >= cover.near && q < cover.far : q >= cover.far
}

/** Whether a LOD's material drops a man in the vertex shader (units.vert's none: no pixel of him is its) */
export function dropsMan(slot: 0 | 1 | 2, cover: { near: number; far: number }): boolean {
  return slot === 0 ? cover.near <= 0 : slot === 1 ? cover.near >= 1 || cover.far <= 0 : cover.far >= 1
}

/** The LODs a battalion draws, from the heights on screen (px) of its nearest and farthest men (its bounds' nearest
 *  and farthest points: pLo ≤ every man's ≤ pHi): each LOD any of its men has a share of in the bands (near, tiny:
 *  lodCover's; tiny null: no tiny LOD); a battalion wholly outside the bands draws one LOD, as the hard switch did */
export function lodsDrawn(
  pLo: number,
  pHi: number,
  near: readonly [number, number],
  tiny: readonly [number, number] | null,
  out: Lods = { near: false, far: false, tiny: false },
): Lods {
  out.near = pHi > near[0]
  out.far = pLo < near[1] && (!tiny || pHi > tiny[0])
  out.tiny = !!tiny && pLo < tiny[1]
  return out
}

/** the LODs a battalion draws */
export interface Lods {
  near: boolean
  far: boolean
  tiny: boolean
}

/** A battalion's place against the switches this frame: its bounds' heights on screen (pLo, pHi, px: boxPxRange),
 *  its centre's (px), whether it is split (its nearest men at the nearest LOD) and what it drew last frame (the hard
 *  switch's hysteresis) */
export interface BattalionAt {
  pLo: number
  pHi: number
  px: number
  split: boolean
  wasNear: boolean
  wasTiny: boolean
}

/** The LODs a battalion draws (src/look/units.ts): with the fade (fade) every LOD any of its men has a share of
 *  (lodsDrawn), the near LOD always while split (its men not at the nearest drawn at their own LODs, as unsplit);
 *  without it (?lodfade=0) the hard switch: one LOD by its centre's height, ±10 % (drawsNear, drawsTiny; tinyPx 0:
 *  no tiny LOD), the near alone while split */
export function battalionLods(
  b: BattalionAt,
  fade: boolean,
  lodPx: number,
  tinyPx: number,
  near: readonly [number, number],
  tiny: readonly [number, number] | null,
  out: Lods = { near: false, far: false, tiny: false },
): Lods {
  if (fade) {
    lodsDrawn(b.pLo, b.pHi, near, tiny, out)
    out.near ||= b.split
    return out
  }
  out.near = b.split || drawsNear(b.px, b.wasNear, lodPx)
  out.tiny = !out.near && tinyPx > 0 && drawsTiny(b.px, b.wasTiny, tinyPx)
  out.far = !out.near && !out.tiny
  return out
}

/** How many LODs a battalion draws: with one its meshes draw every man (uLodFade 0: no per-man work) */
export function lodCount(l: Lods): number {
  return +l.near + +l.far + +l.tiny
}

/** The heights on screen (px) of a figure at a box's farthest and nearest points from the camera (cam; lo and hi the
 *  box's corners, m; k: a figure's height in pixels at 1 m), the nearest at least 1 m off as the page's own test */
export function boxPxRange(
  lo: { x: number; y: number; z: number },
  hi: { x: number; y: number; z: number },
  cam: { x: number; y: number; z: number },
  k: number,
  out: [number, number] = [0, 0],
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
  out[0] = k / Math.max(1, far)
  out[1] = k / Math.max(1, near)
  return out
}

/** A list of men as the figures' instance buffers hold them: poses (4 a man: x, y, z, his turn), clip settings (3),
 *  moves to the next step (3) and each man's index in his battalion (1: aMan, the cross-fade's hash) */
export interface ManLists {
  p: Float32Array
  s: Float32Array
  n: Float32Array
  i: Float32Array
}

/** A split battalion's men shared into two lists (src/look/units.ts share): those selected (sel 1) into near, the
 *  rest into rest, in the battalion's order, each with his index; returns how many went to each */
export function splitLists(
  sel: Uint8Array,
  all: Omit<ManLists, 'i'>,
  near: ManLists,
  rest: ManLists,
): [number, number] {
  let a = 0
  let b = 0
  for (let i = 0; i < sel.length; i++) {
    const to = sel[i] ? near : rest
    const k = sel[i] ? a++ : b++
    to.p.set(all.p.subarray(i * 4, i * 4 + 4), k * 4)
    to.s.set(all.s.subarray(i * 3, i * 3 + 3), k * 3)
    to.n.set(all.n.subarray(i * 3, i * 3 + 3), k * 3)
    to.i[k] = i
  }
  return [a, b]
}

/** The buffers the near LOD draws a battalion from (setSplit): its rest list while split, else its own; each buffer
 *  with its own index list, so a man's hash goes with his pose */
export function nextLodBuffers<L>(split: boolean, own: L, rest: L): L {
  return split ? rest : own
}
