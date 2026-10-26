// The map editor's fields (docs/plans/active/m7-editor.md M7c): every attribute of the catalogue set through the form's
// reading of text and judged by the validator at its field; renames that follow every reference; the editor's field
// edits.
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { AttrSpec, Catalogue, Feature, FieldSpec, MapFile, ShapeName } from '../src/map/schema.ts'
import { allowedIn, categoryOf, kindChain, kindMeta } from '../src/map/catalogue.ts'
import { validate } from '../src/map/validate.ts'
import { formatMap } from '../src/map/format.ts'
import {
  hasChildren,
  attrInput,
  attrRows,
  parseInput,
  problemsAt,
  renameFeature,
  setField,
  showValue,
} from '../src/app/map/fields.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'
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
    expect('error' in parseInput('json', '{"w": ')).toBe(true)
  })
  it('reads a field of no known kind as JSON when it is, else as text, and shows its text quoted', () => {
    expect(attrInput(undefined)).toBe('any')
    expect(parseInput('any', 'gravel')).toEqual({ value: 'gravel' })
    expect(parseInput('any', '{"a": 1}')).toEqual({ value: { a: 1 } })
    expect(parseInput('any', showValue('12', 'any'))).toEqual({ value: '12' }) // text that looks like a number stays text
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
  })
  it('sets and removes a field in place, a new one last', () => {
    const f: Feature = { id: 'a', kind: 'relief.hill', point: [0, 0], height: 3 }
    expect(Object.keys(setField(f, 'height', 4))).toEqual(['id', 'kind', 'point', 'height'])
    expect(setField(f, 'height', undefined)).toEqual({ id: 'a', kind: 'relief.hill', point: [0, 0] })
    expect(Object.keys(setField(f, 'width', 40))).toEqual(['id', 'kind', 'point', 'height', 'width'])
  })
})

describe('M7c: a rename', () => {
  const maps = fs.readdirSync(path.join(root, 'maps')).filter(f => f.endsWith('.map.json'))
  /** Every value in a map that names a feature by its id. */
  function names(map: MapFile): string[] {
    const out: string[] = []
    for (const f of map.features) {
      for (const r of ['on', 'carries', 'crosses'] as const) if (typeof f[r] === 'string') out.push(f[r])
      if (f.along) out.push(f.along.id)
      for (const k of ['follow', 'clear']) {
        const v = f[k]
        for (const e of Array.isArray(v) ? v : v ? [v] : []) out.push((e as { id: string }).id)
      }
      for (const p of Object.values(f.gen ?? {})) {
        for (const k of ['avoid', 'within']) {
          const v = (p as Record<string, unknown>)[k]
          if (Array.isArray(v)) out.push(...(v as string[]))
        }
      }
      if (f.origin?.parent) out.push(f.origin.parent)
    }
    return out
  }
  it("leaves every map in maps/ as valid as it was, with no reference to a feature's old id", () => {
    for (const file of maps) {
      const map = JSON.parse(fs.readFileSync(path.join(root, 'maps', file), 'utf8')) as MapFile
      const before = validate(map, cat).length
      const named = new Set(names(map))
      for (const f of map.features.filter(g => named.has(g.id))) {
        const to = `${f.id}x`
        const after = renameFeature(map, f.id, to)
        expect(validate(after, cat).length, `${file}: ${f.id} → ${to}`).toBe(before)
        expect(names(after)).not.toContain(f.id)
        expect(names(after).filter(x => x === to).length).toBe(names(map).filter(x => x === f.id).length)
      }
    }
  })
  it('knows a feature with children: one that generates them, or whose children are pinned', () => {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'generated.map.json'), 'utf8')) as MapFile
    expect(hasChildren(map, 'groves')).toBe(true) // a scatter
    expect(hasChildren(map, 'brook')).toBe(false) // a meander writes its own line, no children
    const pinned: Feature = {
      id: 'farm-1',
      kind: 'built.house',
      area: SHAPE.area as Feature['area'],
      origin: { generator: 'scatter', params: {}, version: 3, parent: 'farm' },
    }
    const farm: Feature = { id: 'farm', kind: 'built.farm', area: SHAPE.area as Feature['area'] }
    expect(hasChildren({ ...base, features: [farm, pinned] }, 'farm')).toBe(true)
    expect(hasChildren({ ...base, features: [farm] }, 'farm')).toBe(false)
  })
  it("renames a name in a generator's selectors, and in a pinned child's record of them", () => {
    const map: MapFile = {
      ...base,
      features: [
        { id: 'brook', kind: 'water.stream', line: SHAPE.line as Feature['line'] },
        {
          id: 'woods',
          kind: 'veg.wood',
          area: SHAPE.area as Feature['area'],
          gen: { scatter: { count: 2, avoid: ['brook', 'water'] } },
        },
        {
          id: 'woods-1',
          kind: 'veg.wood',
          circle: [[0, 0], 5],
          origin: { generator: 'scatter', params: { count: 2, avoid: ['brook'] }, version: 3, parent: 'woods' },
        },
      ],
    }
    const after = renameFeature(map, 'brook', 'stream')
    expect((after.features[1].gen!.scatter as { avoid: string[] }).avoid).toEqual(['stream', 'water'])
    expect(after.features[2].origin!.params).toEqual({ count: 2, avoid: ['stream'] })
  })
  it("hints what an attribute would be in the map's season and the feature's state", () => {
    const map: MapFile = { ...base, season: 'winter' }
    const f: Feature = { id: 'w', kind: 'ground.field.wheat', area: SHAPE.area as Feature['area'], height: 1 }
    expect(attrRows(cat, f, map).find(r => r.name === 'height')!.inherited).toBe(0)
  })
  it('keeps every feature that does not name it as it was (the same object, the same bytes on save)', () => {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'two-ridges.map.json'), 'utf8')) as MapFile
    const after = renameFeature(map, 'brook', 'stream')
    const touched = after.features.filter((g, k) => g !== map.features[k]).map(g => g.id)
    expect(touched.sort()).toEqual(['bridge', 'ford-west', 'stream'].sort())
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
  it('renames with every reference, and refuses an id in use, an empty one and a feature with children', () => {
    const ed = make()
    ed.select('brook')
    expect(ed.setField('id', 'ford')).toBe(false)
    expect(ed.message).toMatch(/taken/)
    expect(ed.setField('id', undefined)).toBe(false) // the id field emptied
    expect(ed.message).toMatch(/needs an id/)
    expect(ed.setField('id', 'brook')).toBe(null)
    expect(ed.setField('id', 'stream')).toBe(true)
    expect(ed.selected).toBe('stream')
    expect(ed.feature('ford')!.on).toBe('stream')
    expect(ed.issues).toEqual([])
    // undone and redone, the selection follows the feature by the id it had
    ed.undo()
    expect(ed.selected).toBe('brook')
    ed.redo()
    expect(ed.selected).toBe('stream')
    // a feature whose pinned child carries its id
    ed.load(
      '/maps/t.map.json',
      formatMap({
        ...base,
        features: [
          { id: 'hill', kind: 'relief.hill', point: [0, 0] },
          {
            id: 'hill-1',
            kind: 'relief.hill',
            point: [9, 9],
            origin: { generator: 'group', params: {}, version: 3, parent: 'hill' },
          },
        ],
      }),
    )
    ed.select('hill')
    expect(ed.setField('id', 'knoll')).toBe(false)
    expect(ed.message).toMatch(/children .* rename it in the file/)
  })
  it('keeps the selection where it is through undo, and forgets a rename once another step is taken', () => {
    const ed = make()
    ed.select('hill')
    ed.setField('height', 9)
    ed.select('brook')
    ed.undo()
    expect(ed.feature('hill')!.height).toBe(4)
    expect(ed.selected).toBe('brook')
    ed.setField('id', 'stream')
    expect(ed.renamed).toEqual({ from: 'brook', to: 'stream' })
    ed.undo()
    expect(ed.renamed).toBeNull()
    expect(ed.selected).toBe('brook')
  })
  it('says why whenever it refuses a field', () => {
    const ed = make()
    ed.note('saved')
    expect(ed.setField('height', 3)).toBe(false)
    expect(ed.message).toBe('no feature is selected')
    expect(ed.setMapField('features', [])).toBe(false)
    expect(ed.message).toMatch(/not set as a field/)
  })
  it('reselects a deleted feature on undo', () => {
    const ed = make()
    ed.select('hill')
    ed.remove()
    expect(ed.feature('hill')).toBeUndefined()
    ed.undo()
    expect(ed.selected).toBe('hill')
  })
  it("sets the map's own fields, and moves a new map's id with its file, never a saved one's", () => {
    const ed = make()
    ed.setMapField('seed', 7)
    expect(ed.doc!.seed).toBe(7)
    expect(ed.renameMap('/maps/u.map.json', 'u')).toBe(false)
    const fresh = make(true)
    expect(fresh.renameMap('/maps/u.map.json', 'u')).toBe(true)
    expect(fresh.file).toBe('/maps/u.map.json')
    expect(fresh.doc!.id).toBe('u')
    expect(fresh.noFile).toBe(true)
  })
  it("keeps a new map's history through a rename, every step under the new id", () => {
    const fresh = make(true)
    fresh.setMapField('seed', 9)
    expect(fresh.renameMap('/maps/u.map.json', 'u')).toBe(true)
    expect(fresh.canUndo).toBe(true)
    fresh.undo()
    expect(fresh.doc!.seed).toBe(1)
    expect(fresh.doc!.id).toBe('u')
  })
  it('keeps a new map on its id while its first save is on its way', async () => {
    const fresh = make(true)
    let reply = () => {}
    vi.stubGlobal('fetch', () => new Promise<Response>(r => (reply = () => r(new Response('{"ok":true}')))))
    const saving = fresh.save()
    await Promise.resolve()
    expect(fresh.renameMap('/maps/u.map.json', 'u')).toBe(false)
    expect(fresh.file).toBe('/maps/t.map.json')
    reply()
    expect(await saving).toBe(true)
    vi.unstubAllGlobals()
  })
})
