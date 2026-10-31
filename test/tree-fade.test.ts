// The far trees' swap from cards to crown mesh, faded over time (src/look/tree-fade.ts, decision 0098,
// docs/plans/active/crown-speckle.md): no tree is left half dithered at rest, a tree on the line does not flicker, a
// group keeps stepping until its fades have run, a frozen clock snaps without the hysteresis, and the two sides'
// dithers split every pixel between them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FRAME_MAX_S, frameStep } from '../src/look/spec.ts'
import {
  CARDS_M,
  FADE_S,
  HYST_M,
  UNKNOWN,
  fadeRuns,
  fading,
  firstSide,
  groupWork,
  snapAll,
  stepFade,
  stepFades,
  treeFades,
  treeFrame,
  treeSide,
  type TreeFades,
} from '../src/look/tree-fade.ts'

const shader = (f: string) => readFileSync(new URL(`../src/look/shaders/${f}`, import.meta.url), 'utf8')
const FRAME = 1 / 60
const all = () => true

/** The culler's frames for a group of one tree in view at distance d (m), as src/look/nature.ts runs them: a first
 *  frame of the view (viewChanged, at dt0), then frames with the view held at FRAME each; returns the fade drawn
 *  after `frames` and how many held frames stepped it */
function rest(st: TreeFades, d: number, dt0: number, frames: number, cardsOnly = false) {
  let f = treeFrame(st, 0, d * d, true, cardsOnly, dt0)!
  let running = fadeRuns(st, 0)
  let stepped = 0
  for (let k = 0; k < frames; k++) {
    const job = groupWork(false, running)
    if (job === null) break
    const r = stepFades(st, all, FRAME, (_, x) => (f = x))
    running = r.running
    stepped++
  }
  return { f, stepped }
}

describe('the far trees fade over time', () => {
  it('leaves no tree half dithered once the camera rests, wherever it stands (the old 190 to 250 m band too)', () => {
    for (let d = 150; d <= 300; d += 2.5) {
      for (const [side, fade] of [
        [0, 0],
        [1, 1],
        [0, 0.5],
        [1, 0.5],
      ] as const) {
        const st = treeFades(1)
        st.side[0] = side
        st.fade[0] = fade
        st.snap[0] = 0
        const { f } = rest(st, d, FRAME, 60)
        expect(fading(f), `${d} m from ${side}, ${fade}`).toBe(false)
      }
    }
  })

  it('keeps stepping a tree whose side has just changed, though its fade has not moved yet (a frame of 0 s)', () => {
    const st = treeFades(1)
    treeFrame(st, 0, 200 ** 2, true, false, FRAME)
    const { f, stepped } = rest(st, 240, 0, 60)
    expect(f).toBe(1)
    expect(stepped).toBeGreaterThan(0)
  })

  it('re-packs a group only when the view changes, steps it only while a fade of its own runs', () => {
    expect(groupWork(true, false)).toBe('view')
    expect(groupWork(true, true)).toBe('view')
    expect(groupWork(false, true)).toBe('fades')
    expect(groupWork(false, false)).toBeNull()
  })

  it('re-packs (places) only on the frames a fade leaves or reaches either end, else only the fades change', () => {
    const st = treeFades(1)
    treeFrame(st, 0, 200 ** 2, true, false, Infinity)
    treeFrame(st, 0, 240 ** 2, true, false, 0)
    const places: boolean[] = []
    for (let k = 0; k < 40 && fadeRuns(st, 0); k++) places.push(stepFades(st, all, FRAME, () => {}).places)
    expect(places[0]).toBe(true)
    expect(places[places.length - 1]).toBe(true)
    expect(places.slice(1, -1).every(p => !p)).toBe(true)
  })

  it('swaps a tree only past the hysteresis either side of CARDS_M', () => {
    const inside = CARDS_M + HYST_M * 0.5
    expect(treeSide(inside ** 2, 0)).toBe(0)
    expect(treeSide(inside ** 2, 1)).toBe(1)
    expect(treeSide((CARDS_M + HYST_M + 0.01) ** 2, 0)).toBe(1)
    expect(treeSide((CARDS_M - HYST_M - 0.01) ** 2, 1)).toBe(0)
  })

  it('fades over FADE_S; a frame steps at most FRAME_MAX_S', () => {
    expect(stepFade(0, 1, FADE_S / 4)).toBeCloseTo(0.25)
    expect(stepFade(1, 0, FADE_S / 4)).toBeCloseTo(0.75)
    expect(stepFade(0.9, 1, FADE_S)).toBe(1)
    expect(stepFade(0, 1, Infinity)).toBe(1)
    expect(frameStep(false, 5000)).toBe(FRAME_MAX_S)
    expect(frameStep(false, 16)).toBeCloseTo(0.016)
  })

  it('snaps under a frozen clock, by CARDS_M alone: a tool view does not depend on the camera path', () => {
    expect(frameStep(true, 16)).toBe(Infinity)
    const inside = (CARDS_M - HYST_M * 0.5) ** 2
    const st = treeFades(1)
    treeFrame(st, 0, 300 ** 2, true, false, frameStep(true, 16))
    // from far out, then a view with the tree inside the hysteresis: as a fresh page at that view, its cards
    expect(treeFrame(st, 0, inside, true, false, frameStep(true, 16))).toBe(0)
    expect(treeFrame(treeFades(1), 0, inside, true, false, frameStep(true, 16))).toBe(0)
  })

  it('fades a tree into its cards when it is drawn with them at every distance (past the leaf fall), and back', () => {
    const st = treeFades(1)
    expect(treeFrame(st, 0, 300 ** 2, true, false, Infinity)).toBe(1)
    const into = treeFrame(st, 0, 300 ** 2, true, true, FRAME)!
    expect(into).toBeCloseTo(1 - FRAME / FADE_S)
    expect(rest(st, 300, FRAME, 60, true).f).toBe(0)
    const back = treeFrame(st, 0, 300 ** 2, true, false, FRAME)!
    expect(back).toBeCloseTo(FRAME / FADE_S)
  })

  it('does no work for a tree out of view, and snaps it when it comes back', () => {
    const st = treeFades(1)
    treeFrame(st, 0, 150 ** 2, true, false, Infinity)
    expect(treeFrame(st, 0, 300 ** 2, false, false, FRAME)).toBeNull()
    expect([st.side[0], st.fade[0], st.snap[0]]).toEqual([0, 0, 1])
    expect(treeFrame(st, 0, 300 ** 2, true, false, FRAME)).toBe(1)
  })

  it('keeps the hysteresis when a tree snaps back into view, by CARDS_M alone only for its first frame', () => {
    const st = treeFades(1)
    expect(st.side[0]).toBe(UNKNOWN)
    const inside = (CARDS_M - HYST_M * 0.5) ** 2
    treeFrame(st, 0, 300 ** 2, true, false, Infinity)
    treeFrame(st, 0, 0, false, false, FRAME)
    expect(treeFrame(st, 0, inside, true, false, FRAME)).toBe(1)
    snapAll(st)
    expect(treeFrame(st, 0, inside, true, false, FRAME)).toBe(1)
    expect(treeFrame(treeFades(1), 0, inside, true, false, FRAME)).toBe(0)
    expect(firstSide((CARDS_M + 1) ** 2)).toBe(1)
  })

  it('cuts the cards and the crown mesh by the same dither, one the other one’s complement', () => {
    const cut = 'dither(gl_FragCoord.xy+vTint*61.0)'
    expect(shader('canopy.frag')).toContain(`if(${cut}<vFade)discard;`)
    expect(shader('nature.frag')).toContain(`${cut}>=vFade`)
  })
})
