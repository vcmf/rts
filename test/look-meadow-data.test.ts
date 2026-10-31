// The meadow map's arithmetic (src/look/meadow-data.ts): the page's and the tile worker's (G3c). The growth on 2 m
// cells blended to 1 m texels, kept off its rules, shrunk by a texel; the heights as half floats.
import { describe, expect, it } from 'vitest'
import { FromHalfFloat } from '@babylonjs/core/Misc/halfFloat.js'
import { meadowMapData } from '../src/look/meadow-data.ts'

describe("the meadow map's data (meadowMapData)", () => {
  const tile = 40 // 40 texels a side
  const all = () => true
  it("grows everywhere grass is (the shrink is against a texel that grows none, not the map's edge), and holds the heights", () => {
    const md = meadowMapData(
      -20,
      -20,
      tile,
      () => [1, 0.65],
      all,
      () => 0,
      all,
      (x, z) => 3 + 0.1 * x,
    )
    expect(md.growingCells).toBe(tile * tile)
    expect(md.croppingCells).toBe(0)
    // a texel inside: its height, its growth, its height factor, no crop
    const k = (10 * tile + 30) * 4
    expect(FromHalfFloat(md.data[k])).toBeCloseTo(3 + 0.1 * (-20 + 30.5), 2)
    expect(FromHalfFloat(md.data[k + 1])).toBe(1)
    expect(FromHalfFloat(md.data[k + 2])).toBeCloseTo(0.65, 3)
    expect(FromHalfFloat(md.data[k + 3])).toBe(0)
  })
  it('keeps the grass off its rule, a texel short of where the rule starts', () => {
    // the rule: no grass east of x = 0 (the half of the tile from 20 texels on)
    const md = meadowMapData(
      -20,
      -20,
      tile,
      () => [1, 1],
      (x: number) => x < 0,
      () => 0,
      all,
      () => 0,
    )
    const at = (i: number, j: number) => md.g[j * tile + i]
    expect(at(10, 20)).toBe(1)
    expect(at(25, 20)).toBe(0)
    // (the rule's edge at texel 20: the texel west of it shrunk away, 19 columns grow)
    expect(at(18, 20)).toBe(1)
    expect(at(19, 20)).toBe(0)
    expect(md.growingCells).toBe(19 * tile)
  })
})
