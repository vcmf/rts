// The mid tone's switch (src/look/midtone.ts): ?midtone's values to the painter's defines.
import { describe, expect, it } from 'vitest'
import { midtoneDefines, parseMidtone } from '../src/look/midtone.ts'

describe('the mid tone switch', () => {
  it('is main with no value or 0', () => {
    expect(midtoneDefines(parseMidtone(null))).toEqual([])
    expect(midtoneDefines(parseMidtone(''))).toEqual([])
    expect(midtoneDefines(parseMidtone('0'))).toEqual([])
  })
  it('sets every class from one digit', () => {
    expect(midtoneDefines(parseMidtone('2'))).toEqual([
      '#define MID2_U',
      '#define MID2_B',
      '#define MID2_N',
      '#define MID2_G',
    ])
  })
  it('sets each class from its part, the rest at 0', () => {
    expect(parseMidtone('u2,b1')).toEqual({ u: 2, b: 1, n: 0, g: 0 })
    expect(midtoneDefines(parseMidtone('u2,b1,g0'))).toEqual(['#define MID2_U', '#define MID1_B'])
  })
  it('takes 3 for the units alone', () => {
    expect(midtoneDefines(parseMidtone('u3,b2'))).toEqual(['#define MID3_U', '#define MID2_B'])
    for (const bad of ['3', 'b3', 'g3']) expect(() => parseMidtone(bad)).toThrow()
  })
  it('throws on a malformed value', () => {
    for (const bad of ['4', 'x1', 'u4', 'u', 'u12', 'u1;b2']) expect(() => parseMidtone(bad)).toThrow()
  })
})
