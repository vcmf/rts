// The far trees' swap from their leaf cards to their crown meshes (src/look/nature.ts, farCuller), faded over time,
// not over distance (decision 0098, docs/plans/active/crown-speckle.md). A tree's side, cards nearer than CARDS_M and
// its crown mesh farther, changes only past HYST_M either side; its fade then runs to the new side over FADE_S
// seconds, the two drawn by a screen-door dither (painter.glsl, dither) only while it runs. The fade by distance it
// replaces (a band) left every tree in the band half of each at rest: the two looks differ, so the dither showed as a
// dotted speckle over the crowns. Pure: the culler keeps each group's TreeFades and calls these each frame.

/** metres from the camera at which a far tree swaps its cards for its crown mesh */
export const CARDS_M = 220
/** metres either side of CARDS_M a tree must pass before its side changes (no flicker on the line) */
export const HYST_M = 5
/** seconds a tree takes to dissolve from one side into the other */
export const FADE_S = 0.3

/** A far tree's side: 1 its crown mesh, 0 its cards, from its squared distance to the camera (m²) and its side the
 *  frame before (it changes only past HYST_M either side of CARDS_M) */
export function treeSide(d2: number, prev: number): 0 | 1 {
  if (d2 >= (CARDS_M + HYST_M) ** 2) return 1
  if (d2 <= (CARDS_M - HYST_M) ** 2) return 0
  return prev >= 0.5 ? 1 : 0
}

/** A tree's side with no frame before (its first, or under a frozen clock): by CARDS_M alone */
export function firstSide(d2: number): 0 | 1 {
  return d2 > CARDS_M ** 2 ? 1 : 0
}

/** A tree's fade (0 its cards, 1 its crown mesh) moved toward its side by dt seconds (Infinity snaps it there) */
export function stepFade(fade: number, side: 0 | 1, dt: number): number {
  if (dt === Infinity) return side
  const step = dt / FADE_S
  return side > fade ? Math.min(side, fade + step) : Math.max(side, fade - step)
}

/** Whether a fade draws both sides (the dither showing) */
export function fading(fade: number): boolean {
  return fade > 0 && fade < 1
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

/** Tree i's frame (not under the shadow pass's every-tree draw, which changes nothing): out of view only marked to
 *  snap when it comes back (no work); otherwise its side, its cards when cardsOnly (drawn with them at every distance:
 *  past the leaf fall), else by its squared distance to the camera (m²) with the hysteresis (by CARDS_M alone on its
 *  first frame and under a frozen clock, dt Infinity: the tools' views do not depend on the camera's path), and its
 *  fade stepped by dt seconds, or snapped when it comes back into view. Returns the fade it is drawn at, or null out
 *  of view */
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
  const prev = st.side[i]
  const side = cardsOnly ? 0 : prev === UNKNOWN || dt === Infinity ? firstSide(d2) : treeSide(d2, prev)
  st.side[i] = side
  st.fade[i] = stepFade(st.fade[i], side, st.snap[i] ? Infinity : dt)
  st.snap[i] = 0
  return st.fade[i]
}

/** Whether tree i's fade has yet to reach its side (its group keeps stepping it while the view holds): by its side,
 *  not by the fade drawn, so a tree whose side has just changed counts before its fade has moved */
export function fadeRuns(st: TreeFades, i: number): boolean {
  return st.side[i] !== UNKNOWN && st.fade[i] !== st.side[i]
}

/** What a group does this frame: 'view' re-packs it (the view or the season changed: each tree's place, side and
 *  fade), 'fades' steps only its running fades (the view held, a fade of its own still runs), null nothing */
export function groupWork(viewChanged: boolean, running: boolean): 'view' | 'fades' | null {
  return viewChanged ? 'view' : running ? 'fades' : null
}

/** Steps tree i's running fade by dt seconds while the view holds (its side unchanged). Returns whether the sides it
 *  is drawn on changed (its cards below 1, its crown mesh above 0): its group re-packs, else only the fades upload */
export function stepRunning(st: TreeFades, i: number, dt: number): boolean {
  const before = st.fade[i]
  const after = stepFade(before, st.side[i] === 1 ? 1 : 0, dt)
  st.fade[i] = after
  return before < 1 !== after < 1 || before > 0 !== after > 0
}

/** Steps the running fades of a group's drawn trees (drawn(i)) by dt seconds while the view holds, each new fade given
 *  to set(i, fade). Returns whether one still runs (the group steps again next frame) and whether a tree's sides
 *  changed (the group re-packs) */
export function stepFades(
  st: TreeFades,
  drawn: (i: number) => boolean,
  dt: number,
  set: (i: number, fade: number) => void,
): { running: boolean; places: boolean } {
  let running = false
  let places = false
  for (let i = 0; i < st.fade.length; i++) {
    if (!drawn(i) || !fadeRuns(st, i)) continue
    if (stepRunning(st, i, dt)) places = true
    set(i, st.fade[i])
    if (fadeRuns(st, i)) running = true
  }
  return { running, places }
}
