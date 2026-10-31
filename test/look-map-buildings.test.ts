// A map's buildings as the look page's models (src/look/world/map-buildings.ts, G3d): each standing building in the
// tile a model fitted to its footprint, its front toward its road.
import { describe, expect, it } from 'vitest'
import { BUILDING_FLOATS, BUILDING_MODELS, mapBuildings } from '../src/look/world/map-buildings.ts'
import { FOOT, toWorld } from '../src/look/world/buildings.ts'
import type { Standing } from '../src/render/lit/houses.ts'
import { COVER } from '../src/look/world/cover.ts'

// a footprint `length` × `width` m centred on (cx, cz), its long side turned `turn` rad from +x
const box = (cx: number, cz: number, length: number, width: number, turn: number) => {
  const [c, s] = [Math.cos(turn), Math.sin(turn)]
  return [
    [-length / 2, -width / 2],
    [length / 2, -width / 2],
    [length / 2, width / 2],
    [-length / 2, width / 2],
  ].map(([a, b]) => [cx + a * c - b * s, cz + a * s + b * c] as [number, number])
}
const house = (ring: [number, number][], o: Partial<Standing> = {}): Standing => ({
  rings: [ring],
  height: 4,
  church: false,
  roof: true,
  ...o,
})
// a road along z = 30 (window metres)
const road = [{ pts: [[-500, 30] as [number, number], [500, 30] as [number, number]], w: 5, cls: COVER.road }]

describe("a map's buildings as models (mapBuildings)", () => {
  it('fits a model to each footprint, its scale the long side, its front toward the road', () => {
    // in map metres, the window's centre at (100, 200): the house 10 m south of the road, its long side along x
    const at = { x: 100, z: 200 }
    const b = mapBuildings([house(box(100, 220, 12, 8, 0))], at, 400, road)
    expect(b.length).toBe(BUILDING_FLOATS)
    const [m, x, z, yaw, scale] = b
    const model = BUILDING_MODELS[m]
    expect(['house', 'farmhouse', 'manor']).toContain(model)
    expect([x, z]).toEqual([0, 20])
    expect(scale).toBeCloseTo(12 / (2 * FOOT[model].hx!), 5)
    // the front (local −z) points north, at the road (z 30 from the house's 20)
    const [fx, fz] = toWorld(yaw, 0, -1)
    expect(fx).toBeCloseTo(0, 5)
    expect(fz).toBeCloseTo(1, 5)
  })
  it('turns a model with its footprint, the front still toward the road', () => {
    const b = mapBuildings([house(box(0, -10, 12, 8, 0.4))], { x: 0, z: 0 }, 400, road)
    const [, , , yaw] = b
    // the long side the model's x: along the footprint's turn
    const [ax, az] = toWorld(yaw, 1, 0)
    expect(Math.abs(ax * Math.cos(0.4) + az * Math.sin(0.4))).toBeCloseTo(1, 5)
    const [, fz] = toWorld(yaw, 0, -1)
    expect(fz).toBeGreaterThan(0)
  })
  it('gives a church the manor, leaves a ruin out, and keeps to the tile', () => {
    const b = mapBuildings(
      [
        house(box(0, 0, 24, 11, 0), { church: true }),
        house(box(50, 0, 10, 7, 0), { roof: false }),
        house(box(450, 0, 10, 7, 0)),
      ],
      { x: 0, z: 0 },
      400,
      road,
    )
    expect(b.length).toBe(BUILDING_FLOATS)
    expect(BUILDING_MODELS[b[0]]).toBe('manor')
    expect(b[4]).toBeCloseTo(24 / (2 * FOOT.manor.hx!), 5)
  })
})
