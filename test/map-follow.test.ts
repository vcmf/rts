// M3d (docs/plans/active/m3d-follow.md, decision 0025): shared edges. An area's ring takes part of a line's
// centreline, and the area keeps off the cells the line takes: no cell is both, none between is left out.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue, MapFile, Pt } from '../src/map/schema.ts'
import { expand } from '../src/map/expand.ts'
import { validate, validateExpanded } from '../src/map/validate.ts'
import { apply, nearLine } from '../src/map/apply.ts'
import { inRing } from '../src/map/geometry.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const mini = (features: MapFile['features'], seed = 7): MapFile => ({ format: 1, id: 'mini', name: 'Mini', seed, season: 'summer', extent: { w: 600, h: 600 }, play: { w: 400, h: 400 }, features })
const MEADOW = { id: 'meadow', kind: 'ground.meadow', area: [[[-300, -300], [300, -300], [300, 300], [-300, 300]]] as Pt[][], priority: 0 }
const BROOK = { id: 'brook', kind: 'water.stream', line: [[-250, 0], [250, 0]] as Pt[], width: 6 }
const wood = (follow: unknown, area: Pt[][] = [[[80, 60], [-80, 60]]]) => ({ id: 'wood', kind: 'veg.wood.broad', area, follow })
const outer = (m: MapFile) => m.features.find(f => f.id === 'wood')!.area![0]

// the invariant, over the cells whose centre lies inside the wood's ring: each is the line's or the wood's, never
// both, and (offset 0) never neither; with an offset, the wood's cells lie at least that far past the line's reach
function check(m: MapFile, lineId: string, offset = 0) {
  const { map, issues } = expand(m, cat)
  expect(issues).toEqual([])
  const L = apply(map, cat)
  const woodK = 1 + L.table.findIndex(r => r.kind.startsWith('veg.wood')), line = map.features.find(f => f.id === lineId)! as { kind: string; line: Pt[] }
  const lineK = 1 + L.table.findIndex(r => r.kind === line.kind)
  const layers = [L.water, L.way, L.barrier, L.edit]   // a line's cells: any layer holding it (a sunken way's cut too)
  const ring = outer(map)
  let both = 0, neither = 0, inside = 0
  for (let j = 0; j < L.nz; j++) for (let i = 0; i < L.nx; i++) {
    const x = L.x0 + (i + 0.5) * L.cell, z = L.z0 + (j + 0.5) * L.cell, c = j * L.nx + i
    if (!inRing(ring, [x, z])) continue
    inside++
    const isWood = L.veg[c] === woodK, isLine = layers.some(l => l[c] === lineK)
    if (isWood && isLine) both++
    if (!isWood && !isLine && (offset === 0 || nearLine(line.line!, x, z).d >= 1 + offset + 20)) neither++   // with an offset, only far cells must be wood
    if (isWood && offset > 0) expect(isLine).toBe(false)
  }
  expect(inside).toBeGreaterThan(100)
  expect({ both, neither }).toEqual({ both: 0, neither: 0 })
  return { map, L }
}

describe('M3d: shared edges (decision 0025)', () => {
  it("the ring takes the line's centreline between from and to; the expanded feature keeps off the line", () => {
    const { map } = check(mini([MEADOW, BROOK, wood({ id: 'brook', from: [-80, 5], to: [80, 5] })]), 'brook')
    const w = map.features.find(f => f.id === 'wood')!
    expect(w.area![0]).toEqual([[-80, 0], [80, 0], [80, 60], [-80, 60]])
    expect(w.follow).toBeUndefined()
    expect(w.clear).toEqual([{ id: 'brook' }])
    expect(validateExpanded(map, cat)).toEqual([])
  })
  it('from and to in either order; at places the edge in the ring; an offset keeps the area that much further off', () => {
    const rev = expand(mini([MEADOW, BROOK, wood({ id: 'brook', from: [80, 5], to: [-80, 5] }, [[[-80, 60], [80, 60]]])]), cat)
    expect(outer(rev.map)).toEqual([[80, 0], [-80, 0], [-80, 60], [80, 60]])
    const mid = expand(mini([MEADOW, BROOK, wood({ id: 'brook', from: [80, 5], to: [-80, 5], at: 1 }, [[[-80, 60], [80, 60]]])]), cat)
    expect(outer(mid.map)).toEqual([[-80, 60], [80, 0], [-80, 0], [80, 60]])
    const { L } = check(mini([MEADOW, BROOK, wood({ id: 'brook', offset: 10, from: [-80, 5], to: [80, 5] })]), 'brook', 10)
    const woodK = 1 + L.table.findIndex(r => r.kind.startsWith('veg.wood')), col = (z: number) => L.veg[Math.floor((z + 300) / 2) * L.nx + 150]
    expect(col(11)).not.toBe(woodK)   // the cell whose centre is 11 m off: inside 3 + 10
    expect(col(15)).toBe(woodK)       // 15 m: past it
  })
  it('a meandered stream or a road, any seed and width, either side: never both, never neither', () => {
    for (let seed = 1; seed <= 15; seed++) for (const kind of ['water.stream', 'way.road']) for (const width of [5, 6, 7.3]) for (const far of [140, -140]) {
      const line = { id: 'line', kind, line: [[-250, 0], [250, 0]] as Pt[], width, gen: kind === 'water.stream' ? { meander: { amplitude: 30, wavelength: 160 } } : undefined }
      if (!line.gen) delete line.gen
      if (kind === 'way.road') line.line = [[-250, 0], [-120, 25], [-40, -20], [60, 30], [150, -25], [250, 0]]
      check(mini([MEADOW, line, wood({ id: 'line', from: [-150, 0], to: [150, 0] }, [[[150, far], [-150, far]]])], seed), 'line')
    }
  })
  it('a sharp corner or a hairpin, either side: never both, never neither', () => {
    for (const deg of [100, 120, 135, 150, 170]) for (const inside of [true, false]) {
      const t = deg * Math.PI / 180, leg: Pt = [Math.round(Math.cos(t) * 200), Math.round(Math.sin(t) * 200)]
      const road = { id: 'road', kind: 'way.road', line: [[-200, 0], [0, 0], leg] as Pt[], width: 10 }
      const to: Pt = [Math.round(leg[0] * 0.75), Math.round(leg[1] * 0.75)]
      const bis = [(-1 + Math.cos(t)) / 2, Math.sin(t) / 2], bl = Math.hypot(bis[0], bis[1])
      const rest: Pt[] = inside ? [[Math.round(bis[0] / bl * 120), Math.round(bis[1] / bl * 120)]] : [[Math.round(to[0] + Math.sin(t) * 60), Math.round(to[1] - Math.cos(t) * 60)], [Math.round(-bis[0] / bl * 80), Math.round(-bis[1] / bl * 80)], [-150, -60]]
      check(mini([MEADOW, road, wood({ id: 'road', from: [-150, 0], to }, [rest])]), 'road')
    }
    const pin = { id: 'road', kind: 'way.road', line: [[-200, 0], [0, 0], [0, 8], [-200, 8]] as Pt[], width: 4 }
    check(mini([MEADOW, pin, wood({ id: 'road', from: [-150, 0], to: [-150, 8] }, [[[-150, 4]]])]), 'road')   // the narrow strip between the legs
  })
  it('hedges, walls, paths, ditches and cuts: the area keeps off exactly the cells they take', () => {
    for (const line of [
      { id: 'l', kind: 'barrier.hedge', line: [[-250, 0], [250, 0]] as Pt[] },
      { id: 'l', kind: 'barrier.wall', line: [[-250, 0], [250, 0]] as Pt[], thickness: 4 },
      { id: 'l', kind: 'way.path', line: [[-250, 1], [250, 1]] as Pt[] },
      { id: 'l', kind: 'relief.ditch', line: [[-250, 1], [250, 1]] as Pt[] },
      { id: 'l', kind: 'relief.cut', line: [[-250, 1], [250, 1]] as Pt[] },
    ]) check(mini([MEADOW, line, wood({ id: 'l', from: [-80, 5], to: [80, 5] })]), 'l')
  })
  it('the chain: an area following a meander waits for it; a scatter that reads the area waits for its ring; a region that follows passes clear to its children', () => {
    const brook = { ...BROOK, gen: { meander: { amplitude: 30, wavelength: 160 } } }
    const fields = { id: 'fields', kind: 'ground.field', area: [[[-250, -250], [250, -250], [250, 250], [-250, 250]]] as Pt[][], gen: { scatter: { count: 4, radiusMin: 20, radiusMax: 30, avoid: ['veg', 'water'], clearance: 5 } } }
    const { map, issues } = expand(mini([MEADOW, brook, wood({ id: 'brook', from: [-150, 0], to: [150, 0] }, [[[150, 120], [-150, 120]]]), fields]), cat)
    expect(issues).toEqual([])
    for (const c of map.features.filter(f => f.origin?.parent === 'fields')) for (const p of c.area![0]) expect(inRing(outer(map), p)).toBe(false)
    const region = { id: 'copses', kind: 'veg.wood', area: [[[200, -150], [-200, -150]]] as Pt[][], follow: { id: 'brook', from: [-200, 0], to: [200, 0] }, gen: { scatter: { count: 3, radiusMin: 15, radiusMax: 20, clearance: 5 } } }
    const s = expand(mini([MEADOW, brook, region]), cat)
    expect(s.issues).toEqual([])
    const kids = s.map.features.filter(f => f.origin?.parent === 'copses'), L = apply(s.map, cat)
    expect(kids).toHaveLength(3)
    for (const c of kids) expect(c.clear).toEqual([{ id: 'brook' }])
    let both = 0
    for (let c = 0; c < L.water.length; c++) if (L.water[c] && L.table[L.veg[c] - 1]?.kind === 'veg.wood') both++
    expect(both).toBe(0)
  })
  it('an edge of no length, or a ring that crosses itself, is an error naming the feature', () => {
    expect(expand(mini([MEADOW, BROOK, wood({ id: 'brook', from: [-80, 5], to: [-80, 9] })]), cat).issues[0]).toMatchObject({ id: 'wood', path: 'features[2].follow', message: expect.stringMatching(/no length/) })
    const twisted = expand(mini([MEADOW, BROOK, wood({ id: 'brook', from: [-80, 5], to: [80, 5] }, [[[-80, 60], [80, 60]]])]), cat)
    expect(twisted.issues[0]).toMatchObject({ id: 'wood', message: expect.stringMatching(/after expansion: .*crosses itself.*counting the ring as expanded/) })
    const listed = expand(mini([MEADOW, BROOK, wood([{ id: 'brook', from: [-80, 5], to: [80, 5] }, { id: 'brook', from: [90, 5], to: [90, 7], at: 2 }])]), cat)
    expect(listed.issues[0]).toMatchObject({ path: 'features[2].follow[1]' })
  })
  it('the validator checks shared edges and clear', () => {
    const paths = (more: Record<string, unknown>) => validate(mini([MEADOW, BROOK, { ...wood(undefined), ...more }]), cat).map(i => `${i.path}: ${i.message}`)
    const ok = { id: 'brook', from: [-80, 5], to: [80, 5] }
    expect(paths({ follow: ok })).toEqual([])
    expect(paths({ follow: [ok, { ...ok, at: 2 }] })).toEqual([])
    expect(paths({ follow: { ...ok, id: 'nowhere' } })).toContainEqual(expect.stringMatching(/follow\.id: no feature "nowhere"/))
    expect(paths({ follow: { ...ok, id: 'meadow' } })).toContainEqual(expect.stringMatching(/follow\.id: "meadow" is not drawn as a line/))
    expect(paths({ follow: { ...ok, id: 'wood' } })).toContainEqual(expect.stringMatching(/cannot follow itself/))
    expect(paths({ follow: { ...ok, side: 'left' } })).toContainEqual(expect.stringMatching(/follow\.side: unknown field/))
    expect(paths({ follow: { ...ok, offset: -1 } })).toContainEqual(expect.stringMatching(/follow\.offset/))
    expect(paths({ follow: { ...ok, at: 5 } })).toContainEqual(expect.stringMatching(/follow\.at: must be a whole number from 0 to 2/))
    expect(paths({ follow: [ok, ok] })).toContainEqual(expect.stringMatching(/follow\[1\]\.at: another shared edge already goes at 0/))
    expect(paths({ follow: { ...ok, from: [900, 0] } })).toContainEqual(expect.stringMatching(/follow\.from/))
    expect(paths({ follow: ok, area: undefined, circle: [[0, 60], 20] })).toContainEqual(expect.stringMatching(/needs an "area"/))
    // clear on its own: a wood that keeps off a road it does not follow
    expect(paths({ area: [[[-80, -60], [80, -60], [80, 60], [-80, 60]]], clear: [{ id: 'brook', offset: 4 }] })).toEqual([])
    expect(paths({ area: [[[-80, -60], [80, -60], [80, 60], [-80, 60]]], clear: { id: 'meadow' } })).toContainEqual(expect.stringMatching(/clear\.id: "meadow" is not drawn as a line/))
    expect(paths({ area: [[[-80, -60], [80, -60], [80, 60], [-80, 60]]], clear: [{ id: 'brook', width: 3 }] })).toContainEqual(expect.stringMatching(/clear\[0\]\.width: unknown field/))
    expect(validate(mini([MEADOW, { id: 'road', kind: 'way.road', line: [[0, -250], [0, 250]] as Pt[] }, { id: 'v', kind: 'built.village', area: [[[10, 10]]] as Pt[][], along: { id: 'road', from: 10, to: 100 }, follow: { id: 'road', from: [0, -100], to: [0, 0] }, gen: { 'street-village': {} } }]), cat).map(i => i.message)).toContainEqual(expect.stringMatching(/a street-village feature's own area cannot follow/))
  })
  it('clear as one object is honoured as a list is', () => {
    const road = { id: 'road', kind: 'way.road', line: [[0, -250], [0, 250]] as Pt[], width: 6 }
    check(mini([MEADOW, road, { id: 'wood', kind: 'veg.wood.broad', area: [[[-80, -60], [80, -60], [80, 60], [-80, 60]]] as Pt[][], clear: { id: 'road' } }]), 'road')
  })
  it("an edge ramp counts from where the area's cells begin, not from the line's centreline", () => {
    const m = mini([MEADOW, BROOK, { ...wood({ id: 'brook', from: [-80, 5], to: [80, 5] }), density: { edge: [[0, 0.2], [10, 1]] } }])
    const L = apply(expand(m, cat).map, cat), at = (z: number) => L.density[Math.floor((z + 300) / 2) * L.nx + 150] / 255
    expect(at(5)).toBeCloseTo(0.2 + 0.8 * 2 / 10, 1)   // the cell centred 5 m off is 2 m past the brook's 3 m reach
    expect(at(15)).toBeCloseTo(1, 1)
  })
  it("a mix scatter's region can follow a line: every child keeps off it", () => {
    const brook = { ...BROOK, gen: { meander: { amplitude: 30, wavelength: 160 } } }
    const region = { id: 'groves', kind: 'veg.wood', area: [[[200, -150], [-200, -150]]] as Pt[][], follow: { id: 'brook', from: [-200, 0], to: [200, 0] }, gen: { scatter: { mix: [{ kind: 'veg.wood.broad', count: 3, radiusMin: 15, radiusMax: 20 }, { kind: 'ground.field.wheat', count: 2, radiusMin: 15, radiusMax: 20 }], clearance: 5 } } }
    expect(validate(mini([MEADOW, brook, region]), cat)).toEqual([])
    const { map, issues } = expand(mini([MEADOW, brook, region]), cat)
    expect(issues).toEqual([])
    const kids = map.features.filter(f => f.origin?.parent === 'groves'), L = apply(map, cat)
    expect(kids).toHaveLength(5)
    for (const c of kids) expect(c.clear).toEqual([{ id: 'brook' }])
    let both = 0
    for (let c = 0; c < L.water.length; c++) if (L.water[c] && (L.veg[c] && L.table[L.veg[c] - 1].kind !== 'ground.meadow')) both++
    expect(both).toBe(0)
  })
  it("a sunken way's cut is kept off too", () => {
    const sunken = { id: 'lane', kind: 'way.road.sunken', line: [[-250, 0], [250, 0]] as Pt[], width: 5 }
    const { map } = check(mini([MEADOW, sunken, wood({ id: 'lane', from: [-80, 5], to: [80, 5] })]), 'lane')
    const L = apply(map, cat), woodK = 1 + L.table.findIndex(r => r.kind.startsWith('veg.wood'))
    let both = 0
    for (let c = 0; c < L.edit.length; c++) if (L.edit[c] && L.veg[c] === woodK) both++
    expect(both).toBe(0)
  })
  it('only ground, vegetation, buildings and zones keep off lines; at must be a number', () => {
    const ok = { id: 'brook', from: [-80, 5], to: [80, 5] }
    const msgs = (f: Record<string, unknown>) => validate(mini([MEADOW, BROOK, f as MapFile['features'][number]]), cat).map(i => `${i.path}: ${i.message}`)
    expect(msgs({ id: 'flat', kind: 'relief.level', area: [[[80, 60], [-80, 60]]], follow: ok })).toContainEqual(expect.stringMatching(/follow: relief\.level cannot keep off a line/))
    expect(msgs({ id: 'pond', kind: 'water.pond', area: [[[80, 60], [-80, 60]]], follow: ok })).toContainEqual(expect.stringMatching(/follow: water\.pond cannot keep off a line/))
    expect(msgs({ ...wood({ ...ok, at: null }) })).toContainEqual(expect.stringMatching(/follow\.at: must be a whole number/))
  })
  it('an area that keeps clear of a line it crosses: split by the road, painted on both sides', () => {
    const road = { id: 'road', kind: 'way.road', line: [[0, -250], [0, 250]] as Pt[], width: 6 }
    const m = mini([MEADOW, road, { id: 'wood', kind: 'veg.wood.broad', area: [[[-80, -60], [80, -60], [80, 60], [-80, 60]]] as Pt[][], clear: [{ id: 'road' }] }])
    const { map } = check(m, 'road')
    expect(map.features.find(f => f.id === 'wood')!.clear).toEqual([{ id: 'road' }])
  })
})
