// The meadow's numbers (src/look/meadow-spec.ts): the combed clumps' defines as meadow.vert reads them, and the
// reaches the growth keeps clear of the formations, from those numbers.
import { describe, expect, it } from 'vitest'
import {
  CLUMP_REACH,
  CLUMP_REACH_FLOW,
  GRASS_TALL,
  GRASS_WIDE,
  HEIGHT,
  HEIGHT_MAX,
  LEAN_JITTER,
  LEAN_MAX,
  LEAN_MIN,
  CROP_WIDE,
  GRASS_UP,
  GRASS_UP_DEFAULT,
  WHEAT_FILL_DEFAULT,
  clumpReach,
  grassDefinesForClumps,
} from '../src/look/meadow-spec.ts'

describe("the meadow's numbers", () => {
  it('gives the combed clumps their defines, each a float literal (GLSL reads 1 as an int)', () => {
    const d = grassDefinesForClumps(GRASS_UP[0])
    expect(d).toEqual([
      '#define GRASS_WIDE 1.400',
      '#define GRASS_TALL 1.150',
      '#define GRASS_SHORT 1.000',
      '#define LEAN_MIN 0.180',
      '#define LEAN_MAX 0.750',
      '#define LEAN_JITTER 0.120',
      '#define GRASS_FAN_UNDO 0.000',
      '#define GRASS_DENSE 0.800',
    ])
    const values = [GRASS_WIDE, GRASS_TALL, 1, LEAN_MIN, LEAN_MAX, LEAN_JITTER, 0, 0.8]
    d.forEach((line, i) => expect(Number(line.split(' ')[2])).toBeCloseTo(values[i], 3))
    expect(grassDefinesForClumps()).toEqual(grassDefinesForClumps(GRASS_UP[GRASS_UP_DEFAULT]))
  })
  it("keeps the combed clumps' reach past the default's, the lean in order, the grass under its most", () => {
    expect(CLUMP_REACH_FLOW).toBeGreaterThan(CLUMP_REACH)
    expect(LEAN_MIN).toBeLessThan(LEAN_MAX)
    expect(HEIGHT).toBeLessThan(HEIGHT_MAX)
  })
  it("keeps every look's clumps within main's reach, upright and no taller than main's", () => {
    // (the growth's rules are made once, with main's reach: an upright look must reach no farther)
    for (const g of GRASS_UP) {
      expect(clumpReach(g)).toBeLessThanOrEqual(CLUMP_REACH_FLOW)
      expect(g.tall * g.short).toBeLessThanOrEqual(GRASS_TALL)
      expect(g.leanMin).toBeLessThanOrEqual(g.leanMax)
      expect(g.fanUndo).toBeGreaterThanOrEqual(0)
      expect(g.fanUndo).toBeLessThanOrEqual(1)
    }
    expect(GRASS_UP_DEFAULT).toBeLessThan(GRASS_UP.length)
    expect(WHEAT_FILL_DEFAULT).toBeLessThan(CROP_WIDE.length)
  })
})
