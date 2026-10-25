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
  grassDefinesForClumps,
} from '../src/look/meadow-spec.ts'

describe("the meadow's numbers", () => {
  it('gives the combed clumps their defines, each a float literal (GLSL reads 1 as an int)', () => {
    const d = grassDefinesForClumps()
    expect(d).toEqual([
      '#define GRASS_WIDE 1.400',
      '#define GRASS_TALL 1.150',
      '#define LEAN_MIN 0.180',
      '#define LEAN_MAX 0.750',
      '#define LEAN_JITTER 0.120',
    ])
    const values = [GRASS_WIDE, GRASS_TALL, LEAN_MIN, LEAN_MAX, LEAN_JITTER]
    d.forEach((line, i) => expect(Number(line.split(' ')[2])).toBeCloseTo(values[i], 3))
  })
  it("keeps the combed clumps' reach past the default's, the lean in order, the grass under its most", () => {
    expect(CLUMP_REACH_FLOW).toBeGreaterThan(CLUMP_REACH)
    expect(LEAN_MIN).toBeLessThan(LEAN_MAX)
    expect(HEIGHT).toBeLessThan(HEIGHT_MAX)
  })
})
