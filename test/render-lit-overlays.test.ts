// The map page's debug overlays (docs/plans/active/m6-lit-view.md, M6c): passability read through the ruleset, and
// sight from a point over the heights and through the woods.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { expand } from '../src/map/expand.ts'
import { apply } from '../src/map/apply.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import { overlay, passFactor, sightFrom, unitKinds } from '../src/render/lit/overlays.ts'
import { root } from './fx.ts'

const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
function compile(features: MapFile['features']) {
  const map = {
    format: 1,
    id: 't',
    name: 'T',
    seed: 1,
    season: 'summer',
    extent: { w: 400, h: 400 },
    play: { w: 400, h: 400 },
    features: [
      {
        id: 'meadow',
        kind: 'ground.meadow',
        area: [
          [
            [-200, -200],
            [200, -200],
            [200, 200],
            [-200, 200],
          ],
        ],
      },
      ...features,
    ],
  } as unknown as MapFile
  expect(validate(map, cat)).toEqual([])
  const ex = expand(map, cat)
  expect(ex.issues).toEqual([])
  return apply(ex.map, cat)
}
const cellOf = (L: ReturnType<typeof compile>, x: number, z: number) =>
  Math.floor((z - L.z0) / L.cell) * L.nx + Math.floor((x - L.x0) / L.cell)

describe('M6c: passability', () => {
  const L = compile([
    {
      id: 'wood',
      kind: 'veg.wood.broad',
      area: [
        [
          [-150, -150],
          [-50, -150],
          [-50, -50],
          [-150, -50],
        ],
      ],
    },
    { id: 'pond', kind: 'water.pond', circle: [[100, 100], 30], depth: 2 },
    { id: 'hill', kind: 'relief.hill', point: [100, -100], height: 30, width: 120 },
  ] as MapFile['features'])
  it("names the ruleset's unit kinds, nothing of its own", () => {
    expect(unitKinds(napoleonic).sort()).toEqual(Object.keys(napoleonic.terrain.open.g).sort())
  })
  it("is the terrain class's factor on level open ground and in a wood, 0 past a kind's wading limit", () => {
    for (const unit of unitKinds(napoleonic)) {
      const g = passFactor(L, napoleonic, classifyNapoleonic, unit)
      expect(g[cellOf(L, 0, 150)]).toBeCloseTo(napoleonic.terrain.open.g[unit], 6)
      const wood = g[cellOf(L, -100, -100)]
      expect(wood).toBeLessThan(napoleonic.terrain.open.g[unit] + 1e-9)
      expect(g[cellOf(L, 100, 100)]).toBe(0) // 2 m deep: past every kind's limit
    }
  })
  it('falls on a slope', () => {
    const g = passFactor(L, napoleonic, classifyNapoleonic, 'line')
    expect(g[cellOf(L, 140, -100)]).toBeLessThan(g[cellOf(L, 0, 150)])
  })
  it('draws nothing where a kind goes at full speed, and something where it does not', () => {
    const o = overlay(L, napoleonic, classifyNapoleonic, { kind: 'pass', unit: 'line' })
    expect(o[cellOf(L, 0, 150) * 4 + 3]).toBe(0)
    expect(o[cellOf(L, -100, -100) * 4 + 3]).toBeGreaterThan(0)
  })
})

describe('M6c: sight', () => {
  it('sees the whole flat field within its radius, and nothing beyond', () => {
    const L = compile([])
    const seen = sightFrom(L, napoleonic, classifyNapoleonic, 0, 0, 150)
    expect(seen[cellOf(L, 100, 100)]).toBe(1)
    expect(seen[cellOf(L, -140, 20)]).toBe(1)
    expect(seen[cellOf(L, 190, 190)]).toBe(0) // 269 m away
  })
  it('does not see behind a ridge, and sees its crest', () => {
    const L = compile([
      {
        id: 'ridge',
        kind: 'relief.ridge',
        line: [
          [-200, 50],
          [200, 50],
        ],
        height: 15,
        width: 40,
      },
    ] as MapFile['features'])
    const seen = sightFrom(L, napoleonic, classifyNapoleonic, 0, -100, 400)
    expect(seen[cellOf(L, 0, 50)]).toBe(1) // the crest
    expect(seen[cellOf(L, 0, 100)]).toBe(0) // the far foot, hidden
  })
  it('sees into a wood as far as the ruleset allows, not through it', () => {
    const L = compile([
      {
        id: 'wood',
        kind: 'veg.wood.broad',
        area: [
          [
            [-200, 20],
            [200, 20],
            [200, 200],
            [-200, 200],
          ],
        ],
      },
    ] as MapFile['features'])
    const seen = sightFrom(L, napoleonic, classifyNapoleonic, 0, 0, 400)
    const reach =
      napoleonic.fire.sight[
        classifyNapoleonic({ veg: { growth: 'stand', density: 1 }, water: 0, nogo: false, go: false })
      ] ?? 40
    expect(seen[cellOf(L, 0, 20 + reach / 2)]).toBe(1)
    expect(seen[cellOf(L, 0, 20 + reach + 30)]).toBe(0)
  })
})
