// The far trees' swap from cards to crown mesh, faded over time (src/look/tree-fade.ts,
// docs/plans/active/crown-speckle.md): no tree is left half dithered at rest, a tree on the line does not flicker,
// and the two sides' dithers split every pixel between them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CARDS_M,
  FADE_S,
  HYST_M,
  STEP_MAX_S,
  UNKNOWN,
  fadeStep,
  fading,
  firstSide,
  snapAll,
  stepFade,
  treeFades,
  treeFrame,
  treeSide,
} from '../src/look/tree-fade.ts'

const shader = (f: string) => readFileSync(new URL(`../src/look/shaders/${f}`, import.meta.url), 'utf8')

/** a tree's side and fade after `frames` frames of dt seconds with the camera still at distance d (m), from the side
 *  and fade it had */
const settle = (d: number, side: 0 | 1, fade: number, frames: number, dt = 1 / 60) => {
  for (let k = 0; k < frames; k++) {
    side = treeSide(d * d, side)
    fade = stepFade(fade, side, dt)
  }
  return { side, fade }
}

describe('the far trees fade over time', () => {
  it('leaves no tree half dithered once the camera rests, wherever the tree stands (the old 190 to 250 m band too)', () => {
    const frames = Math.ceil((FADE_S / (1 / 60)) * 1.05)
    for (let d = 150; d <= 300; d += 2.5) {
      for (const [side, fade] of [
        [0, 0],
        [1, 1],
        [0, 0.5],
        [1, 0.5],
      ] as const) {
        const end = settle(d, side, fade, frames)
        expect(fading(end.fade), `${d} m from ${side}, ${fade}`).toBe(false)
      }
    }
  })

  it('swaps a tree only past the hysteresis either side of CARDS_M', () => {
    const inside = CARDS_M + HYST_M * 0.5
    expect(treeSide(inside ** 2, 0)).toBe(0)
    expect(treeSide(inside ** 2, 1)).toBe(1)
    expect(treeSide((CARDS_M + HYST_M + 0.01) ** 2, 0)).toBe(1)
    expect(treeSide((CARDS_M - HYST_M - 0.01) ** 2, 1)).toBe(0)
  })

  it('fades over FADE_S, a stalled frame stepping no more than STEP_MAX_S', () => {
    expect(stepFade(0, 1, FADE_S / 4)).toBeCloseTo(0.25)
    expect(stepFade(1, 0, FADE_S / 4)).toBeCloseTo(0.75)
    expect(stepFade(0, 1, 5)).toBeCloseTo(STEP_MAX_S / FADE_S)
    expect(stepFade(0.9, 1, FADE_S)).toBe(1)
  })

  it('snaps on the first frame and out of view (Infinity), by CARDS_M alone', () => {
    expect(stepFade(0, 1, Infinity)).toBe(1)
    expect(stepFade(1, 0, Infinity)).toBe(0)
    expect(firstSide((CARDS_M - 1) ** 2)).toBe(0)
    expect(firstSide((CARDS_M + 1) ** 2)).toBe(1)
  })

  it('cuts the cards and the crown mesh by the same dither, one the other one’s complement', () => {
    const cut = 'dither(gl_FragCoord.xy+vTint*61.0)'
    expect(shader('canopy.frag')).toContain(`if(${cut}<vFade)discard;`)
    expect(shader('nature.frag')).toContain(`${cut}>=vFade`)
  })

  it('snaps under a frozen clock, so no tool shot catches a tree mid-dither', () => {
    expect(fadeStep(true, 16)).toBe(Infinity)
    expect(fadeStep(false, 16)).toBeCloseTo(0.016)
    const st = treeFades(1)
    treeFrame(st, 0, 150 ** 2, true, false, fadeStep(true, 16))
    expect(treeFrame(st, 0, 300 ** 2, true, false, fadeStep(true, 16))).toBe(1)
  })

  it('keeps a tree drawn with its cards at every distance (past the leaf fall) at its cards, so it fades from them', () => {
    const st = treeFades(1)
    expect(treeFrame(st, 0, 300 ** 2, true, false, Infinity)).toBe(1)
    expect(treeFrame(st, 0, 300 ** 2, true, true, 1 / 60)).toBe(0)
    expect([st.side[0], st.fade[0]]).toEqual([0, 0])
    // the season comes back: it dissolves from the cards it was drawn with, not from a stale crown mesh
    const f = treeFrame(st, 0, 300 ** 2, true, false, 1 / 60)!
    expect(f).toBeCloseTo(1 / 60 / FADE_S)
    expect(fading(f)).toBe(true)
  })

  it('does no work for a tree out of view, and snaps it when it comes back', () => {
    const st = treeFades(1)
    treeFrame(st, 0, 150 ** 2, true, false, Infinity)
    expect(treeFrame(st, 0, 300 ** 2, false, false, 1 / 60)).toBeNull()
    expect([st.side[0], st.fade[0], st.snap[0]]).toEqual([0, 0, 1])
    expect(treeFrame(st, 0, 300 ** 2, true, false, 1 / 60)).toBe(1)
  })

  it('keeps the hysteresis when a tree snaps back into view, by CARDS_M alone only for its first frame', () => {
    const st = treeFades(1)
    expect(st.side[0]).toBe(UNKNOWN)
    const inside = (CARDS_M - HYST_M * 0.5) ** 2
    treeFrame(st, 0, 300 ** 2, true, false, Infinity)
    treeFrame(st, 0, 0, false, false, 1 / 60)
    expect(treeFrame(st, 0, inside, true, false, 1 / 60)).toBe(1)
    snapAll(st)
    expect(treeFrame(st, 0, inside, true, false, 1 / 60)).toBe(1)
    const fresh = treeFades(1)
    expect(treeFrame(fresh, 0, inside, true, false, 1 / 60)).toBe(0)
  })
})
