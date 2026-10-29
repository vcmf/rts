// The map editor's fields (docs/plans/done/m7-editor.md M7c, M7d): every attribute of the catalogue and every
// parameter of every generator set through the form's reading of text and judged by the validator at its field; the
// editor's field edits and pinning.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { AttrSpec, Catalogue, Feature, FieldSpec, MapFile, ShapeName } from '../src/map/schema.ts'
import { allowedIn, categoryOf, kindChain, kindMeta } from '../src/map/catalogue.ts'
import { featureKind, presetsOf, validate } from '../src/map/validate.ts'
import { formatMap } from '../src/map/format.ts'
import {
  attrInput,
  attrRows,
  genOf,
  paramRows,
  parseInput,
  problemsAt,
  setField,
  showValue,
  withGenerator,
  withParam,
} from '../src/app/map/fields.ts'
import { GENERATOR_SPECS, type ParamSpec } from '../src/map/generators.ts'
import { EXPAND_VERSION } from '../src/map/expand.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'
import type { Issue } from '../src/map/catalogue.ts'
import { root } from './fx.ts'

const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
const base: MapFile = {
  format: 1,
  id: 't',
  name: 'T',
  seed: 1,
  season: 'summer',
  extent: { w: 1000, h: 1000 },
  play: { w: 800, h: 800 },
  features: [],
}
const SHAPE: Record<ShapeName, unknown> = {
  point: [0, 0],
  line: [
    [0, 0],
    [10, 0],
  ],
  area: [
    [
      [0, 0],
      [20, 0],
      [20, 20],
    ],
  ],
  circle: [[0, 0], 20],
  ellipse: [[0, 0], 30, 20, 0],
}

/** A value a field spec takes: within its range, even when it must be, an object's fields each so. */
function good(spec: FieldSpec | AttrSpec): unknown {
  switch (spec.type) {
    case 'number':
    case 'int': {
      const lo = spec.min ?? 0
      const hi = spec.max ?? lo + 10
      const v = spec.type === 'int' ? Math.round((lo + hi) / 2) : (lo + hi) / 2
      return spec.even && v % 2 ? v + 1 : v
    }
    case 'enum':
      return spec.values![0]
    case 'string':
      return 'x'
    default: {
      const fields = (spec as AttrSpec).fields ?? {}
      const o = Object.fromEntries(Object.entries(fields).map(([k, s]) => [k, good(s)]))
      const less = (spec as AttrSpec).less
      // the first field less than the second: their middles, swapped when they are not
      if (less && !((o[less[0]] as number) < (o[less[1]] as number))) {
        ;[o[less[0]], o[less[1]]] = [o[less[1]], o[less[0]]]
      }
      return o
    }
  }
}
/** Text a field spec does not take, as typed in the form (none for a string: any text is one). */
function bad(spec: AttrSpec): string | null {
  if (spec.type === 'number' || spec.type === 'int') return spec.max !== undefined ? String(spec.max + 1) : 'tall'
  if (spec.type === 'enum') return 'nothing-of-the-kind'
  if (spec.type === 'object') return '{}'
  return null
}

describe('M7c: every attribute through the form', () => {
  it('sets each from good text with no problem, and from bad text with one at its field', () => {
    let n = 0
    for (const [name, spec] of Object.entries(cat.attributes)) {
      // the kinds whose category takes it, each drawn as a shape it takes
      const kinds = Object.keys(cat.kinds).filter(k => {
        const meta = kindMeta(cat, kindChain(cat, k)!)
        return allowedIn(cat, spec, categoryOf(k)) && meta.shapes.some(s => s !== 'none') && !meta.refs.along
      })
      const make = (kind: string): Feature => {
        const shape = kindMeta(cat, kindChain(cat, kind)!).shapes.find(s => s !== 'none') as ShapeName
        return { id: 'f', kind, [shape]: SHAPE[shape] }
      }
      const at = (g: Feature) => problemsAt(validate({ ...base, features: [g] }, cat), `features[0].${name}`)
      const read = (f: Feature, text: string) => {
        const p = parseInput(attrInput(spec), text)
        if (!('value' in p)) throw new Error(`${name}: ${text} read as ${JSON.stringify(p)}`)
        return setField(f, name, p.value)
      }
      const text = showValue(good(spec))
      // some kinds that take its layer do not take it (a free-standing tree's form on a meadow): the validator says
      // so, and the form shows it all the same; it must be good on one
      const kind = kinds.find(k => at(read(make(k), text)).length === 0)
      expect(kind, `${name} = ${text} is good on one of ${kinds.join(', ')}`).toBeDefined()
      const f = make(kind!)
      expect(attrRows(cat, f, base).some(r => r.name === name && r.spec === spec)).toBe(true)
      const wrong = bad(spec)
      if (wrong !== null) expect(at(read(f, wrong)).length, `${name} = ${wrong} on ${kind}`).toBeGreaterThan(0)
      n++
    }
    expect(n).toBe(Object.keys(cat.attributes).length)
  })
  it('reads a field emptied as removed (it inherits), and text that is no JSON as no edit', () => {
    expect(parseInput('number', '  ')).toEqual({ remove: true })
    expect(parseInput('number', '12.5')).toEqual({ value: 12.5 })
    expect(parseInput('number', 'tall')).toEqual({ value: 'tall' })
    expect(parseInput('number', '{"edge": [[0, 1], [10, 2]]}')).toEqual({
      value: {
        edge: [
          [0, 1],
          [10, 2],
        ],
      },
    })
    expect(parseInput('text', ' summer ')).toEqual({ value: 'summer' })
    // decimal numbers only: other forms JavaScript reads as numbers stay text, for the validator to name
    expect(parseInput('number', '-1.5e2')).toEqual({ value: -150 })
    expect(parseInput('number', '.5')).toEqual({ value: 0.5 })
    for (const t of ['0x20', '0b11', 'Infinity', '1e400', '1_000', '-']) {
      expect(parseInput('number', t)).toEqual({ value: t })
    }
    expect('error' in parseInput('json', '{"w": ')).toBe(true)
    // a note's text as typed: its spaces and line breaks kept
    expect(parseInput('raw', '  ford used 1805\nsee the survey\n')).toEqual({
      value: '  ford used 1805\nsee the survey\n',
    })
    expect(parseInput('raw', '')).toEqual({ remove: true })
  })
  it('reads a field of no known kind as JSON when it is, else as text, and shows its text quoted', () => {
    expect(attrInput(undefined)).toBe('any')
    expect(parseInput('any', 'gravel')).toEqual({ value: 'gravel' })
    expect(parseInput('any', '{"a": 1}')).toEqual({ value: { a: 1 } })
    // text that looks like a number stays text
    expect(parseInput('any', showValue('12', 'any'))).toEqual({ value: '12' })
    expect(showValue('mud', 'json')).toBe('"mud"')
  })
  it("shows what an attribute inherits from its kind and its preset, and the feature's own others", () => {
    const map: MapFile = { ...base, presets: { tall: { kind: 'veg.wood.broad', height: 30 } } }
    const f: Feature = { id: 'w', preset: 'tall', circle: [[0, 0], 10], density: 0.4, odd: 1 }
    const rows = attrRows(cat, f, map)
    expect(rows.find(r => r.name === 'height')!.inherited).toBe(30)
    expect(rows.find(r => r.name === 'leaf')!.inherited).toBe('broad')
    expect(rows.find(r => r.name === 'density')!.own).toBe(0.4)
    expect(rows.find(r => r.name === 'odd')!.spec).toBeUndefined()
    // an attribute the catalogue knows for other kinds, set on this one: shown with no spec (not this kind's)
    const roof = attrRows(cat, { ...f, roof: 'tile' }, map).find(r => r.name === 'roof')!
    expect(roof.spec).toBeUndefined()
    expect(roof.own).toBe('tile')
  })
  it("hints what an attribute would be in the map's season and the feature's state", () => {
    const map: MapFile = { ...base, season: 'winter' }
    const f: Feature = { id: 'w', kind: 'ground.field.wheat', area: SHAPE.area as Feature['area'], height: 1 }
    expect(attrRows(cat, f, map).find(r => r.name === 'height')!.inherited).toBe(0)
  })
  it('takes a preset that is no object as none, so a feature naming it has no kind and nothing throws', () => {
    const map = { ...base, presets: { tall: null, wood: { kind: 'veg.wood' } } } as unknown as MapFile
    expect(Object.keys(presetsOf(map))).toEqual(['wood'])
    const f: Feature = { id: 'w', preset: 'tall', circle: [[0, 0], 10] }
    expect(featureKind(f, presetsOf(map))).toBeUndefined()
    expect(attrRows(cat, f, map)).toEqual([])
    expect(presetsOf({ presets: [1] })).toEqual({})
    expect(presetsOf({ presets: { a: 'abc', b: { kind: 3 }, c: { kind: 'veg.wood' } } })).toEqual({
      c: { kind: 'veg.wood' },
    })
  })
  it("keeps what an attribute inherits from its kind when the feature's state is one its kind lacks", () => {
    const f: Feature = { id: 'w', kind: 'veg.wood.broad', circle: [[0, 0], 10], state: 'ruined' }
    expect(attrRows(cat, f, base).find(r => r.name === 'leaf')!.inherited).toBe('broad')
  })
  it('sets and removes a field in place, a new one last', () => {
    const f: Feature = { id: 'a', kind: 'relief.hill', point: [0, 0], height: 3 }
    expect(Object.keys(setField(f, 'height', 4))).toEqual(['id', 'kind', 'point', 'height'])
    expect(setField(f, 'height', undefined)).toEqual({ id: 'a', kind: 'relief.hill', point: [0, 0] })
    expect(Object.keys(setField(f, 'width', 40))).toEqual(['id', 'kind', 'point', 'height', 'width'])
  })
})

describe('M7c: the editor sets fields', () => {
  const text = formatMap({
    ...base,
    features: [
      {
        id: 'brook',
        kind: 'water.stream',
        line: [
          [-400, 0],
          [400, 10],
        ],
      },
      { id: 'ford', kind: 'water.ford', on: 'brook', near: [0, 5] },
      { id: 'hill', kind: 'relief.hill', point: [100, 100], height: 4, width: 40 },
    ],
  })
  function make(noFile = false) {
    const h: Host = {
      ctx: {} as CanvasRenderingContext2D,
      project: (x, z) => [x, -z],
      toWorld: (sx, sy) => [sx, -sy],
      ppm: () => 1,
      shown: () => [],
      groundPath: () => {},
      recompile: () => {},
      problems: () => {},
      redraw: () => {},
      changed: () => {},
    }
    const ed = new Editor(h)
    ed.setCatalogue(cat)
    if (noFile) ed.create('/maps/t.map.json', JSON.parse(text) as MapFile)
    else ed.load('/maps/t.map.json', text)
    return ed
  }
  it('sets an attribute in one edit, shows its problem at once, and undoes it', () => {
    const ed = make()
    ed.select('hill')
    ed.setField('height', 'tall')
    expect(ed.feature('hill')!.height).toBe('tall')
    expect(problemsAt(ed.issues, 'features[2].height').length).toBe(1)
    ed.setField('height', undefined)
    expect(ed.feature('hill')!.height).toBeUndefined()
    ed.undo()
    ed.undo()
    expect(ed.dirty).toBe(false)
  })
  it('keeps the selection where it is through undo, none staying none', () => {
    const ed = make()
    ed.select('hill')
    ed.setField('height', 9)
    ed.select('brook')
    ed.undo()
    expect(ed.feature('hill')!.height).toBe(4)
    expect(ed.selected).toBe('brook')
    ed.redo()
    ed.select(null) // Escape
    ed.undo()
    expect(ed.selected).toBeNull()
  })
  it('sets no id: a feature is named when it is made, a map when it is made', () => {
    const ed = make()
    ed.select('brook')
    expect(ed.setField('id', 'stream')).toBe(false)
    expect(ed.message).toMatch(/rename it in the file/)
    expect(ed.feature('brook')).toBeDefined()
    expect(ed.setMapField('id', 'u')).toBe(false)
    expect(ed.doc!.id).toBe('t')
  })
  it('says why whenever it refuses a field', () => {
    const ed = make()
    ed.note('saved')
    expect(ed.setField('height', 3)).toBe(false)
    expect(ed.message).toBe('no feature is selected')
    expect(ed.setMapField('features', [])).toBe(false)
    expect(ed.message).toMatch(/edited one by one/)
  })
  it('leaves a selection made since alone when an undo brings back a feature that was selected', () => {
    const ed = make()
    ed.select('hill')
    ed.remove()
    ed.select('brook')
    ed.undo()
    expect(ed.feature('hill')).toBeDefined()
    expect(ed.selected).toBe('brook')
  })
  it('reselects a deleted feature on undo', () => {
    const ed = make()
    ed.select('hill')
    ed.remove()
    expect(ed.feature('hill')).toBeUndefined()
    ed.undo()
    expect(ed.selected).toBe('hill')
  })
  it("sets the map's own fields", () => {
    const ed = make()
    expect(ed.setMapField('seed', 7)).toBe(true)
    expect(ed.doc!.seed).toBe(7)
    expect(ed.setMapField('seed', 7)).toBe(null)
  })
})

// a feature each generator runs on, with the parameters it needs (a scatter's mix on one without its count); a road
// for the village
const ROAD: Feature = {
  id: 'road',
  kind: 'way.road.lane',
  line: [
    [-400, 0],
    [400, 0],
  ],
}
const SQUARE = [
  [
    [-300, -300],
    [300, -300],
    [300, 300],
    [-300, 300],
  ],
] as Feature['area']
const HOSTS: Record<string, (param: string) => Feature> = {
  meander: () => ({ ...ROAD, id: 'brook', kind: 'water.stream', gen: { meander: { amplitude: 30 } } }),
  clump: () => ({ id: 'copse', kind: 'veg.wood.broad', point: [0, 0], gen: { clump: {} } }),
  'street-village': () => ({
    id: 'hamlet',
    kind: 'built.village',
    along: { id: 'road', from: 100, to: 300 },
    gen: { 'street-village': {} },
  }),
  scatter: param => ({
    id: 'woods',
    kind: 'veg.wood.broad',
    area: SQUARE,
    gen: { scatter: param === 'mix' ? {} : { count: 2 } },
  }),
  group: () => ({ id: 'poplars', kind: 'veg.tree.poplar', point: [0, 0], gen: { group: {} } }),
}
/** A value a parameter takes. */
function goodParam(spec: ParamSpec): unknown {
  if (spec.type === 'list') return ['water']
  if (spec.type === 'entries') return [{ kind: 'veg.wood.broad', count: 2 }]
  return good(spec)
}
/** Text a parameter does not take, as typed in the form. */
function badParam(spec: ParamSpec): string {
  if (spec.type === 'list' || spec.type === 'entries') return '5'
  return spec.max !== undefined ? String(spec.max + 1) : 'many'
}

describe('M7d: every parameter of every generator through the form', () => {
  it('sets each from good text with no problem, and from bad text with one at its field', () => {
    let n = 0
    for (const [gen, spec] of Object.entries(GENERATOR_SPECS)) {
      for (const [name, ps] of Object.entries(spec.params)) {
        const host = HOSTS[gen](name)
        const map = { ...base, features: [ROAD, host] }
        const at = (g: Feature) => problemsAt(validate({ ...map, features: [ROAD, g] }, cat), `features[1].gen`)
        const read = (text: string) => {
          const p = parseInput(attrInput(ps), text)
          if (!('value' in p)) throw new Error(`${gen}.${name}: ${text} read as ${JSON.stringify(p)}`)
          return { ...host, gen: withParam(host, name, p.value)! }
        }
        const row = paramRows(host).find(r => r.name === name)
        expect(row?.spec).toBe(ps)
        const text = showValue(goodParam(ps), attrInput(ps))
        expect(at(read(text)), `${gen}.${name} = ${text}`).toEqual([])
        const wrong = read(badParam(ps))
        const found = at(wrong)
        expect(found.length, `${gen}.${name} = ${badParam(ps)}`).toBeGreaterThan(0)
        expect(found.every(i => i.path.startsWith(`features[1].gen.${gen}.${name}`))).toBe(true)
        n++
      }
    }
    expect(n).toBe(Object.values(GENERATOR_SPECS).reduce((k, s) => k + Object.keys(s.params).length, 0))
  })
  it("puts a generated child's problem, as expansion reports it, under its parent's generator", () => {
    const child = { id: 'v', path: 'features[5].gen (child v-3: features[40].area)', message: 'outside' }
    expect(problemsAt([child], 'features[5].gen')).toEqual([child])
    expect(problemsAt([child], 'features[5].ge')).toEqual([])
  })
  it("reads a feature's generator, and lists its parameters in the spec's order, then any other it sets", () => {
    const f: Feature = { id: 'w', kind: 'veg.wood.broad', point: [0, 0], gen: { clump: { points: 32, wobble: 1 } } }
    expect(genOf(f)).toEqual({ name: 'clump', params: { points: 32, wobble: 1 } })
    expect(paramRows(f).map(r => [r.name, r.own, !!r.spec])).toEqual([
      ['radius', undefined, true],
      ['coherence', undefined, true],
      ['raggedness', undefined, true],
      ['points', 32, true],
      ['wobble', 1, false],
    ])
    // a generator the engine does not have: its parameters all the same, none known
    expect(paramRows({ ...f, gen: { swirl: { turns: 2 } } })).toEqual([{ name: 'turns', spec: undefined, own: 2 }])
    // not one generator's form: none
    for (const gen of [{}, { clump: {}, meander: {} }, { clump: 3 }, [], 'clump']) {
      expect(genOf({ ...f, gen } as unknown as Feature)).toBeNull()
      expect(paramRows({ ...f, gen } as unknown as Feature)).toEqual([])
    }
    expect(genOf({ id: 'x' })).toBeNull()
  })
  it('starts another generator with no parameters, and sets and removes one in place', () => {
    expect(withGenerator('group')).toEqual({ group: {} })
    expect(withGenerator(undefined)).toBeUndefined()
    const f: Feature = { id: 'w', point: [0, 0], gen: { clump: { radius: 40, points: 32 } } }
    expect(withParam(f, 'radius', 50)).toEqual({ clump: { radius: 50, points: 32 } })
    expect(withParam(f, 'radius', undefined)).toEqual({ clump: { points: 32 } })
    expect(withParam({ id: 'x' }, 'radius', 1)).toBeNull()
  })
})

describe('M7d: the editor pins', () => {
  const text = formatMap({
    ...base,
    features: [
      ROAD,
      { id: 'copse', kind: 'veg.wood.broad', point: [0, 100], gen: { clump: { radius: 40 } } },
      { id: 'poplars', kind: 'veg.tree.poplar', point: [0, -200], gen: { group: { count: 2 } } },
      { id: 'hill', kind: 'relief.hill', point: [100, 100], height: 4, width: 40 },
    ],
  })
  function make() {
    const h: Host = {
      ctx: {} as CanvasRenderingContext2D,
      project: (x, z) => [x, -z],
      toWorld: (sx, sy) => [sx, -sy],
      ppm: () => 1,
      shown: () => [],
      groundPath: () => {},
      recompile: () => {},
      problems: () => {},
      redraw: () => {},
      changed: () => {},
    }
    const ed = new Editor(h)
    ed.setCatalogue(cat)
    ed.load('/maps/t.map.json', text)
    return ed
  }
  it("lists another file's problems at once when it is read, never the last file's", () => {
    const lists: Issue[][] = []
    const h: Host = {
      ctx: {} as CanvasRenderingContext2D,
      project: (x, z) => [x, -z],
      toWorld: (sx, sy) => [sx, -sy],
      ppm: () => 1,
      shown: () => [],
      groundPath: () => {},
      recompile: () => {},
      problems: found => lists.push(found),
      redraw: () => {},
      changed: () => {},
    }
    const ed = new Editor(h)
    ed.setCatalogue(cat)
    const wrong = text.replace('"height":4', '"height":"tall"')
    expect(wrong).not.toBe(text)
    ed.load('/maps/a.map.json', wrong)
    expect(lists.at(-1)!.map(i => i.path)).toEqual(['features[3].height'])
    ed.load('/maps/b.map.json', text)
    expect(lists.at(-1)).toEqual([])
  })
  it('pins a feature in one edit, keeping it selected, and undoes it', () => {
    const ed = make()
    ed.select('copse')
    expect(ed.pin()).toBe(true)
    const copse = ed.feature('copse')!
    expect(copse.gen).toBeUndefined()
    expect(copse.area).toBeDefined()
    expect(copse.origin).toMatchObject({ generator: 'clump', params: { radius: 40 } })
    expect(ed.selected).toBe('copse')
    ed.undo()
    expect(ed.dirty).toBe(false)
    expect(ed.selected).toBe('copse')
  })
  it('selects the first child of a feature its generator takes off the map', () => {
    const ed = make()
    ed.select('poplars')
    expect(ed.pin()).toBe(true)
    expect(ed.feature('poplars')).toBeUndefined()
    expect(ed.doc!.features.slice(-2).map(f => f.id)).toEqual(['poplars-1', 'poplars-2'])
    expect(ed.selected).toBe('poplars-1')
    // its children are features now: one moves on its own
    expect(ed.feature('poplars-2')!.origin?.parent).toBe('poplars')
  })
  it('selects a child the pin added, not one the file had (pinned before)', () => {
    const ed = make()
    // a tree pinned from the group before, under its own name; the group generating again
    const tall: Feature = {
      id: 'tall',
      kind: 'veg.tree.poplar',
      point: [150, -200],
      origin: { generator: 'group', params: { count: 2 }, version: EXPAND_VERSION, parent: 'poplars' },
    }
    ed.load('/maps/t.map.json', formatMap({ ...ed.doc!, features: [...ed.doc!.features, tall] }))
    ed.select('poplars')
    expect(ed.pin()).toBe(true)
    expect(ed.selected).toBe('poplars-1')
  })
  it('says why it does not pin', () => {
    const ed = make()
    ed.select('hill')
    expect(ed.pin()).toBe(false)
    expect(ed.message).toMatch(/hill has no generator/)
    ed.select('copse')
    ed.setField('width', -1)
    ed.select('poplars')
    expect(ed.pin()).toBe(false)
    expect(ed.message).toMatch(/^the map has a problem to fix first/)
    ed.select(null)
    expect(ed.pin()).toBe(false)
    expect(ed.message).toBe('no feature is selected')
  })
})
