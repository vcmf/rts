// The map language (docs/plans/active/m1-language.md, M1a): the catalogue checks itself, a valid map passes, every
// validator rule has a negative test that names the feature and the path, resolution follows §3.5's order, and
// expansion and the layout are stable.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { checkCatalogue, kindChain } from '../src/map/catalogue.ts'
import { validate } from '../src/map/validate.ts'
import { resolve } from '../src/map/resolve.ts'
import { expand } from '../src/map/expand.ts'
import { formatMap } from '../src/map/format.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const BASE: MapFile = {
  format: 1, id: 'small', name: 'Small', seed: 7, season: 'summer',
  extent: { w: 1000, h: 1000 }, play: { w: 600, h: 600 },
  sources: [{ id: 'sketch', kind: 'invented' }],
  presets: { 'old-hedge': { kind: 'barrier.hedge', height: 2.4 } },
  features: [
    { id: 'meadow', kind: 'ground.meadow', area: [[[-500, -500], [500, -500], [500, 500], [-500, 500]]], priority: 0 },
    { id: 'ridge', kind: 'relief.ridge', line: [[-300, 100], [300, 120]], height: 12 },
    { id: 'brook', kind: 'water.stream', line: [[-500, 0], [0, 10], [500, -5]], source: 'sketch' },
    { id: 'ford', kind: 'water.ford', on: 'brook', near: [-200, 4] },
    { id: 'road', kind: 'way.road.lane', line: [[50, -500], [50, 500]] },
    { id: 'bridge', kind: 'built.bridge', carries: 'road', crosses: 'brook' },
    { id: 'wood', kind: 'veg.wood.broad', circle: [[-250, -200], 60], density: { edge: [[0, 0.3], [20, 0.8]] } },
    { id: 'hedge', preset: 'old-hedge', line: [[100, -100], [200, -100], [240, -60]] },
    { id: 'house', kind: 'built.house', area: [[[120, 40], [132, 40], [132, 50], [120, 50]]], state: 'burnt' },
    { id: 'field', kind: 'ground.field.rye', area: [[[150, -200], [300, -200], [300, -120], [150, -120]]], seasons: { autumn: { stage: 'stubble' } } },
    { id: 'name', kind: 'zone.label', point: [0, 200], text: 'Brook' },
  ],
}
const f = (m: MapFile, id: string) => m.features.find(x => x.id === id)!

describe('M1a: the catalogue and a valid map', () => {
  it('maps/kinds.json checks clean', () => { expect(checkCatalogue(cat)).toEqual([]) })
  it('a broken catalogue is reported', () => {
    const c = clone(cat); c.kinds['veg.wood'].set.colour = 3; c.kinds['veg.jungle.palm'] = { set: {} }
    const paths = checkCatalogue(c).map(i => i.path)
    expect(paths).toContain('kinds.veg.wood.set.colour')
    expect(paths).toContain('kinds.veg.jungle.palm')
  })
  it('the base map and the example map validate', () => {
    expect(validate(BASE, cat)).toEqual([])
    const ex = JSON.parse(fs.readFileSync(path.join(root, 'maps/two-ridges.map.json'), 'utf8'))
    expect(validate(ex, cat)).toEqual([])
  })
  it('kind chains follow the dotted path', () => {
    expect(kindChain(cat, 'veg.wood.broad')).toEqual(['veg.wood', 'veg.wood.broad'])
    expect(kindChain(cat, 'veg.wood.broad.beech')).toBeNull()
    expect(kindChain(cat, 'wood')).toBeNull()
  })
})

// one bad map per rule: the change, then the feature id (null for the map's own fields) and the path the error names
const CASES: [string, (m: MapFile & Record<string, unknown>) => void, string | null, string, RegExp?][] = [
  ['an unknown map field', m => { m.colour = 'red' }, null, 'colour'],
  ['a wrong format', m => { (m as { format: number }).format = 2 }, null, 'format'],
  ['a bad map id', m => { m.id = 'Small Map' }, null, 'id'],
  ['a negative seed', m => { m.seed = -1 }, null, 'seed'],
  ['an unknown season', m => { (m as { season: string }).season = 'monsoon' }, null, 'season'],
  ['a play area bigger than the extent', m => { m.play = { w: 2000, h: 600 } }, null, 'play'],
  ['an undeclared source', m => { f(m, 'brook').source = 'survey' }, 'brook', 'features[2].source'],
  ['a duplicate id', m => { m.features[1].id = 'meadow' }, 'meadow', 'features[1].id'],
  ['a bad feature id', m => { m.features[1].id = 'Ridge_1' }, null, 'features[1].id'],
  ['an unknown kind', m => { f(m, 'wood').kind = 'veg.jungle' }, 'wood', 'features[6].kind', /not in the catalogue/],
  ['no kind', m => { delete f(m, 'ridge').kind }, 'ridge', 'features[1].kind'],
  ['an unknown preset', m => { f(m, 'hedge').preset = 'new-hedge' }, 'hedge', 'features[7].preset'],
  ['two shapes', m => { f(m, 'wood').point = [0, 0] }, 'wood', 'features[6]', /2 shapes/],
  ['no shape', m => { delete f(m, 'road').line }, 'road', 'features[4]', /needs a shape/],
  ['a shape the kind does not take', m => { const r = f(m, 'ridge'); delete r.line; r.circle = [[0, 0], 50] }, 'ridge', 'features[1].circle'],
  ['a ring of two points', m => { f(m, 'field').area = [[[0, 0], [10, 0]]] }, 'field', 'features[9].area[0]'],
  ['a ring that crosses itself', m => { f(m, 'field').area = [[[0, 0], [100, 100], [100, 0], [0, 100]]] }, 'field', 'features[9].area[0]', /crosses itself/],
  ['a hole outside its ring', m => { f(m, 'field').area = [[[0, 0], [100, 0], [100, 100], [0, 100]], [[200, 200], [210, 200], [210, 210]]] }, 'field', 'features[9].area[1]'],
  ['a line that crosses itself', m => { f(m, 'road').line = [[0, 0], [100, 100], [100, 0], [0, 100]] }, 'road', 'features[4].line', /crosses itself/],
  ['a point outside the extent', m => { f(m, 'name').point = [0, 600] }, 'name', 'features[10].point', /outside the extent/],
  ['a circle reaching past the extent', m => { f(m, 'wood').circle = [[-470, -200], 60] }, 'wood', 'features[6].circle'],
  ['a coordinate finer than 1 cm', m => { f(m, 'name').point = [0.123, 200] }, 'name', 'features[10].point', /2 decimals/],
  ['an unknown attribute', m => { f(m, 'wood').colour = 'green' }, 'wood', 'features[6].colour'],
  ["another category's attribute", m => { f(m, 'brook').roof = 'tile' }, 'brook', 'features[2].roof', /not an attribute of water/],
  ['a value out of range', m => { f(m, 'ridge').height = 900 }, 'ridge', 'features[1].height', /at most/],
  ['a value not in the enum', m => { f(m, 'wood').leaf = 'palm' }, 'wood', 'features[6].leaf'],
  ['a ramp on an attribute without ramps', m => { f(m, 'ridge').height = { along: [[0, 1], [10, 2]] } }, 'ridge', 'features[1].height'],
  ['a ramp whose stops go backwards', m => { f(m, 'wood').density = { edge: [[20, 0.3], [0, 0.8]] } }, 'wood', 'features[6].density', /increase/],
  ['an odd barrier thickness', m => { f(m, 'hedge').thickness = 3 }, 'hedge', 'features[7].thickness', /even/],
  ['a barrier point off the lattice', m => { f(m, 'hedge').line = [[101, -100], [200, -100]] }, 'hedge', 'features[7].line[0]', /lattice/],
  ['a barrier segment off the 8 directions', m => { f(m, 'hedge').line = [[100, -100], [200, -60]] }, 'hedge', 'features[7].line[1]', /8 directions/],
  ['a reference to nothing', m => { f(m, 'bridge').crosses = 'river' }, 'bridge', 'features[5].crosses', /no feature/],
  ['a reference to the wrong category', m => { f(m, 'bridge').crosses = 'road' }, 'bridge', 'features[5].crosses', /water/],
  ['a missing reference', m => { delete f(m, 'ford').on }, 'ford', 'features[3].on'],
  ['a reference the kind does not take', m => { f(m, 'wood').on = 'brook' }, 'wood', 'features[6].on'],
  ['a bad along', m => { f(m, 'house').along = { id: 'road', from: 50, to: 10 } }, 'house', 'features[8].along'],
  ['an unknown season override', m => { f(m, 'field').seasons = { monsoon: { stage: 'standing' } } as never }, 'field', 'features[9].seasons.monsoon'],
  ['a season override of a fixed attribute', m => { f(m, 'field').seasons = { autumn: { material: 'clay' } } }, 'field', 'features[9].seasons.autumn.material', /season/],
  ['an unknown state', m => { f(m, 'house').state = 'flooded' }, 'house', 'features[8].state'],
  ['an unknown generator', m => { f(m, 'wood').gen = { blob: {} } }, 'wood', 'features[6].gen'],
  ['a shared edge before M3', m => { f(m, 'wood').follow = 'brook' }, 'wood', 'features[6].follow', /M3/],
]

describe('M1a: the validator names the feature and the path', () => {
  for (const [name, change, id, p, msg] of CASES) it(name, () => {
    const m = clone(BASE) as MapFile & Record<string, unknown>
    change(m)
    const issues = validate(m, cat)
    const hit = issues.find(i => i.path === p && i.id === id)
    expect(hit, `expected an issue at ${p} for ${id}; got ${JSON.stringify(issues)}`).toBeTruthy()
    if (msg) expect(hit!.message).toMatch(msg)
  })
  it('a reference loop is reported (with a catalogue whose streams may join a stream)', () => {
    const c = clone(cat); c.kinds['water.stream'].refs = { on: 'water' }; c.kinds['water.stream'].optional = ['on']
    const m = clone(BASE); m.features.push({ id: 'brook-2', kind: 'water.stream', line: [[0, 300], [100, 300]], on: 'brook' }); f(m, 'brook').on = 'brook-2'
    expect(validate(m, c).some(i => /loop/.test(i.message))).toBe(true)
  })
})

describe('M1a: resolution follows the catalogue, the preset, the feature, the season and the state, in that order', () => {
  it('the catalogue along the path: rye inherits the field and overrides its height', () => {
    const r = resolve(f(BASE, 'field'), BASE, cat)
    expect(r.attrs).toMatchObject({ material: 'loam', stage: 'standing', height: 1.6, growth: 'low' })
    expect(r.priority).toBe(20)
  })
  it("the catalogue's season, then the feature's", () => {
    expect(resolve(f(BASE, 'field'), BASE, cat, 'winter').attrs).toMatchObject({ stage: 'ploughed', height: 0 })
    expect(resolve(f(BASE, 'field'), BASE, cat, 'autumn').attrs.stage).toBe('stubble')
  })
  it('the map preset over the catalogue, the kind from the preset', () => {
    const r = resolve(f(BASE, 'hedge'), BASE, cat)
    expect(r.kind).toBe('barrier.hedge'); expect(r.attrs.height).toBe(2.4); expect(r.attrs.thickness).toBe(2)
  })
  it("the state's overlay wins over the feature's own field", () => {
    const m = clone(BASE); f(m, 'house').roof = 'thatch'
    expect(resolve(f(m, 'house'), m, cat).attrs).toMatchObject({ roof: 'none', wall: 1.5 })
    expect(resolve(f(m, 'house'), m, cat, 'summer', '').attrs.roof).toBe('thatch')
  })
  it('a state the kind does not have throws', () => {
    expect(() => resolve(f(BASE, 'ridge'), BASE, cat, 'summer', 'burnt')).toThrow(/no state/)
  })
})

describe('M1a: expansion and the layout', () => {
  it('a map without generators expands to itself, sorted by id', () => {
    const { map, issues } = expand(BASE)
    expect(issues).toEqual([])
    expect(map.features.map(x => x.id)).toEqual(BASE.features.map(x => x.id).sort())
    expect(validate(map, cat)).toEqual([])
  })
  it('a generator is reported, not run, until M3', () => {
    const m = clone(BASE); f(m, 'wood').gen = { clump: { coherence: 0.6 } }
    expect(expand(m).issues[0]).toMatchObject({ id: 'wood', path: 'features[6].gen' })
  })
  it('the layout round-trips and puts one feature per line', () => {
    const text = formatMap(BASE)
    expect(JSON.parse(text)).toEqual(BASE)
    expect(text.split('\n').filter(l => l.startsWith('    {"id"')).length).toBe(BASE.features.length + BASE.sources!.length)
  })
  it("the example's committed expansion matches a fresh one", () => {
    const ex = JSON.parse(fs.readFileSync(path.join(root, 'maps/two-ridges.map.json'), 'utf8')) as MapFile
    expect(fs.readFileSync(path.join(root, 'maps/two-ridges.expanded.json'), 'utf8')).toBe(formatMap(expand(ex).map))
  })
})

describe('M1a: the determinism rules hold in src/map/', () => {
  it('src/map/ is clean', async () => {
    const res = await new ESLint({ cwd: root }).lintFiles(['src/map/**/*.ts'])
    expect(res.flatMap(r => r.messages.map(m => `${path.relative(root, r.filePath)}:${m.line} ${m.message}`))).toEqual([])
  })
  it('Math.sin, ** and an outside import are reported', async () => {
    const text = "import { SPEC } from '../look/spec.ts'\nexport const a = Math.sin(1)\nexport const b = 2 ** 3\nexport const c = SPEC\n"
    const [res] = await new ESLint({ cwd: root }).lintText(text, { filePath: path.join(root, 'src', 'map', 'fixture.ts') })
    const lines = [...new Set(res.messages.filter(m => m.severity === 2 && m.ruleId?.startsWith('no-restricted')).map(m => m.line))].sort()
    expect(lines).toEqual([1, 2, 3])
  })
})
