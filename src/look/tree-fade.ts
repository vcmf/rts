// The far trees' swap from their leaf cards to their crown meshes (src/look/nature.ts, farCuller), faded over time,
// not over distance (docs/plans/active/crown-speckle.md). A tree's side, cards nearer than CARDS_M and its crown mesh
// farther, changes only past HYST_M either side; its fade then runs to the new side over FADE_S seconds, the two drawn
// by a screen-door dither (painter.glsl, dither) only while it runs. The fade by distance it replaces (a 60 m band)
// left every tree in the band half of each at rest: the two looks differ, so the dither showed as a dotted speckle
// over the crowns. Pure: the culler keeps each tree's side and fade and calls these each frame.

/** metres from the camera at which a far tree swaps its cards for its crown mesh */
export const CARDS_M = 220
/** metres either side of CARDS_M a tree must pass before its side changes (no flicker on the line) */
export const HYST_M = 5
/** seconds a tree takes to dissolve from one side into the other */
export const FADE_S = 0.3
/** seconds: the longest frame a fade steps by (a stalled frame does not end a fade at once) */
export const STEP_MAX_S = 0.1

/** A far tree's side: 1 its crown mesh, 0 its cards, from its squared distance to the camera (m²) and its side the
 *  frame before (it changes only past HYST_M either side of CARDS_M) */
export function treeSide(d2: number, prev: number): 0 | 1 {
  if (d2 >= (CARDS_M + HYST_M) ** 2) return 1
  if (d2 <= (CARDS_M - HYST_M) ** 2) return 0
  return prev >= 0.5 ? 1 : 0
}

/** A tree's first side, with no frame before: by CARDS_M alone */
export function firstSide(d2: number): 0 | 1 {
  return d2 > CARDS_M ** 2 ? 1 : 0
}

/** A tree's fade (0 its cards, 1 its crown mesh) moved toward its side by a frame of dt seconds (capped at STEP_MAX_S;
 *  Infinity snaps it there: the first frame, a tree out of view) */
export function stepFade(fade: number, side: 0 | 1, dt: number): number {
  if (dt === Infinity) return side
  const step = Math.min(dt, STEP_MAX_S) / FADE_S
  return side > fade ? Math.min(side, fade + step) : Math.max(side, fade - step)
}

/** Whether a fade is still running (both sides drawn, the dither showing) */
export function fading(fade: number): boolean {
  return fade > 0 && fade < 1
}
