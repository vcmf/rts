// The combed meadow's flow over a tile (src/look/flow-field.ts, flowBytes): the page's texture and the tile worker's
// bytes (G3c) are the field at each texel's centre, about the tile's centre.
import { describe, expect, it } from 'vitest'
import { FLOW_TEXEL, flowAt, flowBytes } from '../src/look/flow-field.ts'

describe("the flow's texels over a tile (flowBytes)", () => {
  it("holds the field at each texel's centre, about the tile's centre", () => {
    const tile = 80
    const [cx, cz] = [400, -200]
    const f = flowBytes(cx, cz, tile)
    const n = tile / FLOW_TEXEL
    expect(f.length).toBe(n * n * 4)
    for (const [i, j] of [
      [0, 0],
      [7, 31],
      [n - 1, n - 1],
    ]) {
      const [dx, dz, lie] = flowAt(cx - tile / 2 + (i + 0.5) * FLOW_TEXEL, cz - tile / 2 + (j + 0.5) * FLOW_TEXEL)
      const k = (j * n + i) * 4
      expect([f[k], f[k + 1], f[k + 2], f[k + 3]]).toEqual([
        Math.round((dx * 0.5 + 0.5) * 255),
        Math.round((dz * 0.5 + 0.5) * 255),
        Math.round(lie * 255),
        255,
      ])
    }
  })
})
