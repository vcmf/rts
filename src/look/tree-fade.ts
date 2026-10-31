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

/** A frame's step in seconds from the engine's last frame (ms); a frozen clock (?frozen, the tools' views) snaps:
 *  Infinity, so no shot catches a tree mid-dither */
export function fadeStep(frozen: boolean, frameMs: number): number {
  return frozen ? Infinity : frameMs / 1000
}

/** A far group's trees, frame to frame: each one's side (0 its cards, 1 its crown mesh, UNKNOWN before its first
 *  frame in view), its fade, and whether it snaps the next time it is in view (it was out of view: not stepped) */
export interface TreeFades {
  side: Uint8Array
  fade: Float32Array
  snap: Uint8Array
}
/** a side not yet known (no frame in view yet): the first one is by CARDS_M alone */
export const UNKNOWN = 255

/** n trees' fades, none seen yet */
export function treeFades(n: number): TreeFades {
  return { side: new Uint8Array(n).fill(UNKNOWN), fade: new Float32Array(n), snap: new Uint8Array(n).fill(1) }
}

/** Every tree to snap the next time it is in view (a page that has just warmed up) */
export function snapAll(st: TreeFades): void {
  st.snap.fill(1)
}

/** Tree i's frame (not under the shadow pass's every-tree draw, which changes nothing): out of view only marked to snap
 *  when it comes back (no work); drawn with its cards whatever its distance (cardsOnly: past the leaf fall), its state
 *  follows what is drawn (its cards), so a later swap starts from them; otherwise its side by its squared distance to
 *  the camera (m²) with the hysteresis, its fade stepped by dt seconds or snapped. Returns the fade it is drawn at, or
 *  null out of view */
export function treeFrame(
  st: TreeFades,
  i: number,
  d2: number,
  inView: boolean,
  cardsOnly: boolean,
  dt: number,
): number | null {
  if (!inView) {
    st.snap[i] = 1
    return null
  }
  if (cardsOnly) {
    st.side[i] = 0
    st.fade[i] = 0
    st.snap[i] = 0
    return 0
  }
  const prev = st.side[i]
  const side = prev === UNKNOWN ? firstSide(d2) : treeSide(d2, prev)
  st.side[i] = side
  st.fade[i] = stepFade(st.fade[i], side, st.snap[i] ? Infinity : dt)
  st.snap[i] = 0
  return st.fade[i]
}

/** Whether a fade is still running (both sides drawn, the dither showing) */
export function fading(fade: number): boolean {
  return fade > 0 && fade < 1
}
