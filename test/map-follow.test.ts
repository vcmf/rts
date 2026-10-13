// M3d (docs/plans/active/m3d-follow.md): shared edges, an area's ring that follows part of a line
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { expand } from '../src/map/expand.ts'
import { validate } from '../src/map/validate.ts'
import { apply, nearLine } from '../src/map/apply.ts'
import { inRing, pointAt } from '../src/map/geometry.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const mini = (features: MapFile['features'], seed = 7): MapFile => ({ format: 1, id: 'mini', name: 'Mini', seed, season: 'summer', extent: { w: 600, h: 600 }, play: { w: 400, h: 400 }, features })
const MEADOW = { id: 'meadow', kind: 'ground.meadow', area: [[[-300, -300], [300, -300], [300, 300], [-300, 300]]] as Pt[][], priority: 0 }
const BROOK = { id: 'brook', kind: 'water.stream', line: [[-250, 0], [250, 0]] as Pt[], width: 6 }
const wood = (follow: unknown, area: Pt[][] = [[[80, 60], [-80, 60]]]) => ({ id: 'wood', kind: 'veg.wood.broad', area, follow })
const outer = (m: MapFile) => m.features.find(f => f.id === 'wood')!.area![0]

describe('M3d: shared edges', () => {
  it('a wood shares a straight bank: its edge is the bank, on the side asked, offset as asked', () => {
    const { map, issues } = expand(mini([MEADOW, BROOK, wood({ id: 'brook', side: 'left', from: [-80, 5], to: [80, 5] })]), cat)
    expect(issues).toEqual([])
    expect(map.features.find(f => f.id === 'wood')!.follow).toBeUndefined()
    expect(outer(map)).toEqual([[-80, 3], [80, 3], [80, 60], [-80, 60]])
    const right = expand(mini([MEADOW, BROOK, wood({ id: 'brook', side: 'right', offset: 10, from: [-80, 0], to: [80, 0] }, [[[80, -60], [-80, -60]]])]), cat)
    expect(right.issues).toEqual([])
    expect(outer(right.map).slice(0, 2)).toEqual([[-80, -13], [80, -13]])
  })
  it('from and to in either order give the edge reversed; at places it in the ring', () => {
    const rev = expand(mini([MEADOW, BROOK, wood({ id: 'brook', side: 'left', from: [80, 5], to: [-80, 5] }, [[[-80, 60], [80, 60]]])]), cat)
    expect(rev.issues).toEqual([])
    expect(outer(rev.map)).toEqual([[80, 3], [-80, 3], [-80, 60], [80, 60]])
    const mid = expand(mini([MEADOW, BROOK, wood({ id: 'brook', side: 'left', from: [80, 5], to: [-80, 5], at: 1 }, [[[-80, 60], [80, 60]]])]), cat)
    expect(outer(mid.map)).toEqual([[-80, 60], [80, 3], [-80, 3], [80, 60]])   // the edge before the ring's point 1
  })
  it('a wood follows a meandered brook, whatever the seed: its edge stays on the bank, no cell is both', () => {
    const brook = { ...BROOK, gen: { meander: { amplitude: 30, wavelength: 160 } } }
    for (let seed = 1; seed <= 5; seed++) {
      const m = mini([MEADOW, brook, wood({ id: 'brook', side: 'left', from: [-150, 0], to: [150, 0] }, [[[150, 120], [-150, 120]]])], seed)
      expect(validate(m, cat)).toEqual([])
      const { map, issues } = expand(m, cat)
      expect(issues).toEqual([])
      const line = map.features.find(f => f.id === 'brook')!.line!, ring = outer(map)
      const edge = ring.slice(0, ring.length - 2)
      expect(edge.length).toBeGreaterThan(20)                                   // the meander's vertices, not a chord
      for (const [x, z] of edge) { const n = nearLine(line, x, z); expect(n.d).toBeGreaterThan(3 - 0.05); expect(n.side).toBe(1) }
      const L = apply(map, cat), woodK = L.table.findIndex(r => r.kind === 'veg.wood.broad') + 1
      let both = 0
      for (let c = 0; c < L.water.length; c++) if (L.water[c] && L.veg[c] === woodK) both++
      expect(both).toBe(0)
      // and no meadow between them: 1.5 m past the bank, away from the water, the cell is the wood's (between the
      // ring's own corners, x ±140: past them the ring's closing sides cut across, as drawn)
      const cellAt = (x: number, z: number) => Math.floor((z + 300) / 2) * L.nx + Math.floor((x + 300) / 2)
      for (const [x, z] of edge) {
        if (Math.abs(x) > 140) continue
        const [cx, cz] = pointAt(line, nearLine(line, x, z).along), d = Math.hypot(x - cx, z - cz)
        expect(L.veg[cellAt(x + (x - cx) / d * 1.5, z + (z - cz) / d * 1.5)]).toBe(woodK)
      }
    }
  })
  it('a feature that follows a generated line waits for it; one that reads the area waits for the edge', () => {
    const brook = { ...BROOK, gen: { meander: { amplitude: 30, wavelength: 160 } } }
    const fields = { id: 'fields', kind: 'ground.field', area: [[[-250, -250], [250, -250], [250, 250], [-250, 250]]] as Pt[][], gen: { scatter: { count: 4, radiusMin: 20, radiusMax: 30, avoid: ['veg', 'water'], clearance: 5 } } }
    const { map, issues } = expand(mini([MEADOW, brook, wood({ id: 'brook', side: 'left', from: [-150, 0], to: [150, 0] }, [[[150, 120], [-150, 120]]]), fields]), cat)
    expect(issues).toEqual([])
    const w = outer(map)
    for (const c of map.features.filter(f => f.origin?.parent === 'fields')) for (const p of c.area![0]) expect(inRing(w, p)).toBe(false)
    // a scatter's region can follow a line too: its children lie on the bank's side
    const region = { id: 'copses', kind: 'veg.wood', area: [[[200, -150], [-200, -150]]] as Pt[][], follow: { id: 'brook', side: 'right', offset: 10, from: [-200, 0], to: [200, 0] }, gen: { scatter: { count: 3, radiusMin: 15, radiusMax: 20, clearance: 5 } } }
    const s = expand(mini([MEADOW, brook, region]), cat)
    expect(s.issues).toEqual([])
    for (const c of s.map.features.filter(f => f.origin?.parent === 'copses')) for (const [, z] of c.area![0]) expect(z).toBeLessThan(0)
  })
  it('an edge of no length, or a ring that crosses itself, is an error naming the feature', () => {
    expect(expand(mini([MEADOW, BROOK, wood({ id: 'brook', side: 'left', from: [-80, 5], to: [-80, 9] })]), cat).issues[0]).toMatchObject({ id: 'wood', path: 'features[2].follow', message: expect.stringMatching(/no length/) })
    const twisted = expand(mini([MEADOW, BROOK, wood({ id: 'brook', side: 'left', from: [-80, 5], to: [80, 5] }, [[[-80, 60], [80, 60]]])]), cat)
    expect(twisted.issues.map(i => i.id)).toContain('wood')
    expect(twisted.issues[0].message).toMatch(/after expansion: .*crosses itself/)
  })
  it('the validator checks the shared edges', () => {
    const paths = (follow: unknown, more: Record<string, unknown> = {}) => validate(mini([MEADOW, BROOK, { ...wood(follow), ...more }]), cat).map(i => `${i.path}: ${i.message}`)
    const ok = { id: 'brook', side: 'left', from: [-80, 5], to: [80, 5] }
    expect(paths(ok)).toEqual([])
    expect(paths([ok, { ...ok, at: 2 }])).toEqual([])
    expect(paths({ ...ok, id: 'nowhere' })).toContainEqual(expect.stringMatching(/follow\.id: no feature "nowhere"/))
    expect(paths({ ...ok, id: 'meadow' })).toContainEqual(expect.stringMatching(/follow\.id: "meadow" is not drawn as a line/))
    expect(paths({ ...ok, id: 'wood' })).toContainEqual(expect.stringMatching(/cannot follow itself/))
    expect(paths({ ...ok, side: 'north' })).toContainEqual(expect.stringMatching(/follow\.side: must be "left" or "right"/))
    expect(paths({ ...ok, offset: -1 })).toContainEqual(expect.stringMatching(/follow\.offset/))
    expect(paths({ ...ok, at: 5 })).toContainEqual(expect.stringMatching(/follow\.at: must be a whole number from 0 to 2/))
    expect(paths([ok, ok])).toContainEqual(expect.stringMatching(/follow\[1\]\.at: another shared edge already goes at 0/))
    expect(paths({ ...ok, colour: 'red' })).toContainEqual(expect.stringMatching(/follow\.colour: unknown field/))
    expect(paths({ ...ok, from: [900, 0] })).toContainEqual(expect.stringMatching(/follow\.from/))
    expect(paths(ok, { area: undefined, circle: [[0, 60], 20] })).toContainEqual(expect.stringMatching(/needs an "area"/))
    expect(validate(mini([MEADOW, { id: 'road', kind: 'way.road', line: [[0, -250], [0, 250]] as Pt[] }, { id: 'v', kind: 'built.village', area: [[[10, 10]]] as Pt[][], along: { id: 'road', from: 10, to: 100 }, follow: { id: 'road', side: 'left', from: [0, -100], to: [0, 0] }, gen: { 'street-village': {} } }]), cat).map(i => i.message)).toContainEqual(expect.stringMatching(/street village's own area cannot follow/))
  })
})
