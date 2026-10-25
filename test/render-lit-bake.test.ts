// The lit map view's bakes (docs/plans/active/m6-lit-view.md, M6a): the relief's light, cast shadow and exposure for
// every direction of the light, and the cells' mask.
import { describe, it, expect } from 'vitest'
import { bakeMasks, bakeRelief, LIGHTS, type LightDir } from '../src/render/lit/bake.ts'
import type { Resolved } from '../src/map/resolve.ts'

const N = 81 // nodes a side, 2 m apart
const at = (out: Uint8Array, i: number, j: number) => [...out.slice((j * N + i) * 4, (j * N + i) * 4 + 3)]
// a flat field with a block 20 m high in its middle (nodes 35..45)
const block = (() => {
  const h = new Float64Array(N * N)
  for (let j = 35; j <= 45; j++) for (let i = 35; i <= 45; i++) h[j * N + i] = 20
  return h
})()

describe('M6a: the relief bake', () => {
  it('flat ground: the slope light in its middle, lit, evenly exposed', () => {
    const out = bakeRelief(new Float64Array(N * N), N, N, 2, 'nw')
    const [r, g, b] = at(out, 40, 40)
    expect(r).toBe(128)
    expect(g).toBe(255)
    expect(b).toBe(128)
  })
  for (const dir of Object.keys(LIGHTS) as LightDir[]) {
    it(`a block casts its shadow away from a light from the ${dir}, never toward it`, () => {
      const [di, dj] = LIGHTS[dir]
      const out = bakeRelief(block, N, N, 2, dir)
      // 10 nodes (20 m) beyond the block's edge, away from the light and toward it
      const away = at(out, 40 - di * 11, 40 - dj * 11)[1]
      const toward = at(out, 40 + di * 11, 40 + dj * 11)[1]
      expect(away).toBeLessThan(64)
      expect(toward).toBe(255)
    })
  }
  it("the block's top stands exposed and its foot in a hollow", () => {
    const out = bakeRelief(block, N, N, 2, 'nw')
    expect(at(out, 40, 40)[2]).toBeGreaterThan(160)
    expect(at(out, 33, 40)[2]).toBeLessThan(110)
  })
})

describe('M6a: the cell mask', () => {
  it('reads the depth, the woods (a stand) and the water', () => {
    const table: Resolved[] = [
      { id: 'wood', kind: 'veg.wood', priority: 0, attrs: { growth: 'stand' } },
      { id: 'meadow', kind: 'ground.meadow', priority: 0, attrs: { growth: 'low' } },
      { id: 'brook', kind: 'water.stream', priority: 0, attrs: {} },
    ]
    const L = {
      nx: 3,
      nz: 1,
      veg: new Uint16Array([1, 2, 0]),
      water: new Uint16Array([0, 0, 3]),
      depth: new Uint16Array([0, 0, 750]),
      table,
    }
    const m = bakeMasks(L)
    expect([...m.slice(0, 4)]).toEqual([0, 255, 0, 255])
    expect([...m.slice(4, 8)]).toEqual([0, 0, 0, 255])
    expect([...m.slice(8, 12)]).toEqual([128, 0, 255, 255])
  })
})
