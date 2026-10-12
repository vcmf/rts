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
  // round 1 of the M1a review
  ['an extent off the 4 m step', m => { m.extent = { w: 1002, h: 1000 } }, null, 'extent', /multiple of 4/],
  ['an attribute named like an object builtin', m => { Object.defineProperty(f(m, 'wood'), 'constructor', { value: 1, enumerable: true }) }, 'wood', 'features[6].constructor'],
  ['a state named like an object builtin', m => { f(m, 'house').state = 'toString' }, 'house', 'features[8].state'],
  ['a preset named like an object builtin', m => { f(m, 'hedge').preset = 'constructor' }, 'hedge', 'features[7].preset', /no preset/],
  ['an ellipse with a string radius', m => { const w = f(m, 'wood'); delete w.circle; w.ellipse = [[0, 0], '50', 30, 0] as never }, 'wood', 'features[6].ellipse'],
  ['a radius finer than 1 cm', m => { f(m, 'wood').circle = [[-250, -200], 60.001] }, 'wood', 'features[6].circle'],
  ['a ring with no area', m => { f(m, 'field').area = [[[0, 0], [10, 0], [20, 0]]] }, 'field', 'features[9].area[0]', /no area/],
  ['a ring closed by hand', m => { f(m, 'field').area = [[[0, 0], [10, 0], [10, 10], [0, 0]]] }, 'field', 'features[9].area[0]', /repeated last point/],
  ['a hole crossing a concave ring', m => { f(m, 'field').area = [[[0, 0], [90, 0], [90, 90], [60, 90], [60, 30], [30, 30], [30, 90], [0, 90]], [[10, 50], [80, 50], [80, 60], [10, 60]]] }, 'field', 'features[9].area[1]'],
  ['a hole inside a hole', m => { f(m, 'field').area = [[[0, 0], [100, 0], [100, 100], [0, 100]], [[10, 10], [90, 10], [90, 90], [10, 90]], [[40, 40], [60, 40], [60, 60], [40, 60]]] }, 'field', 'features[9].area[2]', /hole 1/],
  ['a line that turns back on itself', m => { f(m, 'road').line = [[0, 0], [100, 0], [50, 0]] }, 'road', 'features[4].line[1]', /turns back/],
  ['an along past the end of its line', m => { f(m, 'house').kind = 'built.village'; f(m, 'house').along = { id: 'road', from: 900, to: 1100 }; delete f(m, 'house').state }, 'house', 'features[8].along.to', /past the end/],
  ['gaps as wide as their spacing', m => { f(m, 'hedge').gaps = { every: 4, width: 4 } }, 'hedge', 'features[7].gaps', /less than/],
  // round 2 of the M1a review
  ['all-gap barriers in a map preset', m => { m.presets!['old-hedge'].gaps = { every: 4, width: 4 } }, null, 'presets.old-hedge.gaps', /less than/],
  ['a bridge crossing a ford (no line)', m => { f(m, 'bridge').crosses = 'ford' }, 'bridge', 'features[5].crosses', /no line/],
  ['a ford on a pond', m => { m.features.push({ id: 'pond', kind: 'water.pond', circle: [[300, 300], 20] }); f(m, 'ford').on = 'pond' }, 'ford', 'features[3].on', /no line/],
  ['an along ramp on an area', m => { f(m, 'wood').density = { along: [[0, 0.3], [30, 0.8]] } }, 'wood', 'features[6].density', /needs a line/],
  ['a ramp with a negative distance', m => { f(m, 'wood').density = { edge: [[-50, 0.3], [-10, 0.8]] } }, 'wood', 'features[6].density', /at least 0/],
  ['a repeated point in a line', m => { f(m, 'road').line = [[50, -500], [50, 0], [50, 0], [50, 500]] }, 'road', 'features[4].line[2]', /repeats a point/],
  ['along metres finer than 1 cm', m => { f(m, 'house').kind = 'built.village'; f(m, 'house').along = { id: 'road', from: 10.123, to: 50 }; delete f(m, 'house').state }, 'house', 'features[8].along', /2 decimals/],
  ['a barrier on the edge of the extent', m => { f(m, 'hedge').line = [[100, -500], [200, -500]] }, 'hedge', 'features[7].line[0]', /inside the extent/],
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
  it('a closed barrier (a walled yard) is valid; one that crosses itself is not', () => {
    const m = clone(BASE); f(m, 'hedge').line = [[100, -100], [200, -100], [200, -40], [100, -40], [100, -100]]
    expect(validate(m, cat)).toEqual([])
    f(m, 'hedge').line = [[100, -100], [200, -100], [100, -40], [200, -40], [100, -100]]
    expect(validate(m, cat).map(i => i.message)).toContainEqual(expect.stringMatching(/8 directions|crosses itself/))
  })
  it('a catalogue with an unknown type or a bad reference target is reported', () => {
    const c = clone(cat); c.attributes.stones.type = 'boolean' as never; c.kinds['water.ford'].refs = { on: 'watr', near: 'point' }
    const paths = checkCatalogue(c).map(i => i.path)
    expect(paths).toContain('attributes.stones'); expect(paths).toContain('kinds.water.ford.refs.on')
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
  it("a season beats the feature's own fixed value (review round 1): a tall field is still ploughed bare in winter", () => {
    const m = clone(BASE); f(m, 'field').height = 1.9
    expect(resolve(f(m, 'field'), m, cat, 'winter').attrs).toMatchObject({ stage: 'ploughed', height: 0 })
    expect(resolve(f(m, 'field'), m, cat, 'summer').attrs.height).toBe(1.9)
    f(m, 'field').seasons = { winter: { height: 0.2 } }
    expect(resolve(f(m, 'field'), m, cat, 'winter').attrs.height).toBe(0.2)
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
  it("imports that climb out, aliasing Math, wall-clock time, dynamic imports and float16 are reported (review rounds 1, 2)", async () => {
    const text = [
      "import { SPEC } from './../look/spec.ts'",          // 1: climbs out
      "import { W } from './a/../../sim/world.ts'",        // 2: climbs out further down the path
      "import { sin } from '../sim/num.ts'",               // 3: allowed
      "import { isPt } from './geometry.ts'",              // 4: allowed
      "const M = Math",                                    // 5: aliasing Math
      "export const t = Date.now()",                       // 6: wall-clock time
      "export const d = import('./format.ts')",            // 7: a dynamic import
      "export const h = new Float16Array(2)",              // 8: float16
      "export const r = Reflect.get(M, 'abs')",            // 9: Reflect
      "export const all = [SPEC, W, sin, isPt]",
    ].join('\n')
    const [res] = await new ESLint({ cwd: root }).lintText(text, { filePath: path.join(root, 'src', 'map', 'fixture.ts') })
    const lines = [...new Set(res.messages.filter(m => m.severity === 2 && m.ruleId?.startsWith('no-restricted')).map(m => m.line))].sort()
    expect(lines).toEqual([1, 2, 5, 6, 7, 8, 9])
  })
})
