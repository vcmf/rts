// M3d (docs/plans/active/m3d-follow.md): shared edges, an area's ring that follows part of a line
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { expand } from '../src/map/expand.ts'
import { followEdge } from '../src/map/follow.ts'
import { lineDistance } from '../src/map/reach.ts'
import { validate, validateExpanded } from '../src/map/validate.ts'
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
  it('an inner bend never folds the edge: any seed, any offset, either side', () => {
    const bent = { ...BROOK, line: [[-250, 0], [0, 0], [250, 50]] as Pt[] }
    expect(expand(mini([MEADOW, bent, wood({ id: 'brook', side: 'left', from: [-80, 0], to: [0.01, 0] })]), cat).issues).toEqual([])
    const brook = { ...BROOK, gen: { meander: { amplitude: 30, wavelength: 160 } } }
    for (let seed = 1; seed <= 10; seed++) for (const offset of [0, 5, 10]) for (const side of ['left', 'right']) {
      const far = side === 'left' ? 140 : -140
      const out = expand(mini([MEADOW, brook, wood({ id: 'brook', side, offset, from: [-150, 0], to: [150, 0] }, [[[150, far], [-150, far]]])], seed), cat)
      expect(out.issues).toEqual([])
    }
  })
  it('a sharp corner, either side: the edge keeps its distance from both legs and shares no cell with the road', () => {
    for (const deg of [100, 120, 135, 150, 170]) for (const side of ['left', 'right'] as const) {
      const t = deg * Math.PI / 180, leg: Pt = [Math.round(Math.cos(t) * 200 * 100) / 100, Math.round(Math.sin(t) * 200 * 100) / 100]
      const road = { id: 'road', kind: 'way.road', line: [[-200, 0], [0, 0], leg] as Pt[], width: 10 }
      const to: Pt = [leg[0] * 0.75, leg[1] * 0.75]
      const edge = followEdge(road.line, 5.01, { id: 'road', side, from: [-150, 0], to })
      for (let k = 0; k + 1 < edge.length; k++) expect(lineDistance([edge[k], edge[k + 1]], road.line)).toBeGreaterThanOrEqual(5.01 - 0.02)
      // the rest of the ring: inside the bend (left), far into the wedge; outside (right), far behind the corner
      const bis: Pt = [(-1 + Math.cos(t)) / 2, Math.sin(t) / 2], bl = Math.hypot(bis[0], bis[1])
      const r = (p: Pt): Pt => [Math.round(p[0]), Math.round(p[1])]
      const rest: Pt[] = side === 'left' ? [r([bis[0] / bl * 120, bis[1] / bl * 120])]
        : [r([to[0] + Math.sin(t) * 60, to[1] - Math.cos(t) * 60]), r([-bis[0] / bl * 80, -bis[1] / bl * 80]), [-150, -60]]   // around the outside
      const { map, issues } = expand(mini([MEADOW, road, wood({ id: 'road', side, from: [-150, 0], to, at: 0 }, [rest])]), cat)
      expect(issues).toEqual([])
      const L = apply(map, cat), woodK = L.table.findIndex(r => r.kind === 'veg.wood.broad') + 1
      let shared = 0
      for (let c = 0; c < L.veg.length; c++) if (L.veg[c] === woodK && L.way[c]) shared++
      expect(shared).toBe(0)
    }
  })
  it('a hairpin narrower than twice the distance is an error naming where', () => {
    const pin = { id: 'road', kind: 'way.road', line: [[-200, 0], [0, 0], [-200, 6]] as Pt[], width: 4 }
    expect(() => followEdge(pin.line, 3, { id: 'road', side: 'left', offset: 2, from: [-150, 0], to: [-150, 6] })).toThrow(/bends too tightly/)
  })
  it('the edge starts where the line stops painting: a hedge, a path and a stream share no cell with the wood', () => {
    for (const line of [
      { id: 'brook', kind: 'water.stream', line: [[-250, 1], [250, 1]] as Pt[], width: 6 },
      { id: 'brook', kind: 'way.path', line: [[-250, 1], [250, 1]] as Pt[] },
      { id: 'brook', kind: 'barrier.hedge', line: [[-250, 0], [250, 0]] as Pt[] },
      { id: 'brook', kind: 'barrier.wall', line: [[-250, 0], [250, 0]] as Pt[], thickness: 4 },
    ]) {
      const { map, issues } = expand(mini([MEADOW, line, wood({ id: 'brook', side: 'left', from: [-80, 5], to: [80, 5] })]), cat)
      expect(issues).toEqual([])
      const L = apply(map, cat), woodK = L.table.findIndex(r => r.kind === 'veg.wood.broad') + 1
      let shared = 0, wooded = 0
      for (let c = 0; c < L.veg.length; c++) if (L.veg[c] === woodK) { wooded++; if (L.water[c] || L.way[c] || L.barrier[c]) shared++ }
      expect(wooded).toBeGreaterThan(0)
      expect(shared).toBe(0)
      // and it touches: the row of cells just past the line's own is the wood's
      const row = (z: number) => Math.floor((z + 300) / 2) * L.nx + 150
      const first = [0, 1, 2, 3, 4, 5].map(k => row(k * 2 + 1)).find(c => !L.water[c] && !L.way[c] && !L.barrier[c])!
      expect(L.veg[first]).toBe(woodK)
    }
  })
  it('an expanded map keeps no shared edge', () => {
    const m = mini([MEADOW, BROOK, wood({ id: 'brook', side: 'left', from: [-80, 5], to: [80, 5] })])
    expect(validateExpanded(m, cat).map(i => i.message)).toContainEqual('an expanded map has no shared edges left')
    expect(validateExpanded(expand(m, cat).map, cat)).toEqual([])
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
    expect(validate(mini([MEADOW, { id: 'road', kind: 'way.road', line: [[0, -250], [0, 250]] as Pt[] }, { id: 'v', kind: 'built.village', area: [[[10, 10]]] as Pt[][], along: { id: 'road', from: 10, to: 100 }, follow: { id: 'road', side: 'left', from: [0, -100], to: [0, 0] }, gen: { 'street-village': {} } }]), cat).map(i => i.message)).toContainEqual(expect.stringMatching(/a street-village feature's own area cannot follow/))
  })
})
