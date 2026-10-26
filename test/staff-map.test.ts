// The staff map's view (src/render/map.ts): the world to the screen and back, north up.
import { describe, expect, it } from 'vitest'
import { toS, toW, type View } from '../src/render/map.ts'

describe("the staff map's view (toS, toW)", () => {
  const v: View = { cx: 120, cz: -40, k: 2.5, W: 800, H: 600 }
  it('puts the view centre at the middle of the screen', () => {
    expect(toS(v, v.cx, v.cz)).toEqual([400, 300])
    expect(toW(v, 400, 300)).toEqual([120, -40])
  })
  it('draws k pixels a metre, east right and north up', () => {
    expect(toS(v, v.cx + 10, v.cz)).toEqual([425, 300])
    expect(toS(v, v.cx, v.cz + 10)).toEqual([400, 275])
  })
  it('brings a screen point back to the world point it shows', () => {
    for (const [x, z] of [
      [0, 0],
      [-235, 235],
      [77.7, -12.25],
    ]) {
      const [sx, sy] = toS(v, x, z)
      const [wx, wz] = toW(v, sx, sy)
      expect(wx).toBeCloseTo(x, 9)
      expect(wz).toBeCloseTo(z, 9)
    }
  })
})
