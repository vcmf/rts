// The editor's stable save (docs/plans/done/m7-editor.md M7a, decision 0066): a map written back into its text
// rewrites only what changed.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { MapFile } from '../src/map/schema.ts'
import { formatMap } from '../src/map/format.ts'
import { sameJson, writeMap, writerFrom } from '../src/map/write.ts'
import { root } from './fx.ts'

const files = fs
  .readdirSync(path.join(root, 'maps'))
  .filter(f => f.endsWith('.map.json'))
  .map(f => path.join(root, 'maps', f))
const lines = (s: string) => s.split('\n')
/** The lines of b that differ from a's, where both have the same number of lines. */
const changed = (a: string, b: string) => {
  const la = lines(a)
  const lb = lines(b)
  expect(lb.length).toBe(la.length)
  return lb.flatMap((l, k) => (l === la[k] ? [] : [k]))
}

describe('M7a: the stable save', () => {
  it.each(files)('writes %s back unedited, byte for byte', file => {
    const text = fs.readFileSync(file, 'utf8')
    expect(writeMap(text, JSON.parse(text) as MapFile)).toBe(text)
  })
  it.each(files)(
    "moves one point of %s's first shaped feature (or another field): one line changes, and parses as the edit",
    file => {
      const text = fs.readFileSync(file, 'utf8')
      const map = JSON.parse(text) as MapFile
      const f = map.features.find(x => x.line || x.point || x.area || x.circle) ?? map.features[0]
      if (!f.line && !f.point && !f.area && !f.circle) {
        f.priority = 7
      } // no shape to move (a dem piece's place)
      else if (f.line) f.line[0] = [f.line[0][0] + 2, f.line[0][1]]
      else if (f.point) f.point = [f.point[0] + 2, f.point[1]]
      else if (f.area) f.area[0][0] = [f.area[0][0][0] + 2, f.area[0][0][1]]
      else if (f.circle) f.circle = [f.circle[0], f.circle[1] + 2]
      const out = writeMap(text, map)
      expect(JSON.parse(out)).toEqual(map)
      expect(changed(text, out).length).toBe(1)
    },
  )
  const base = formatMap({
    format: 1,
    id: 't',
    name: 'T',
    seed: 1,
    season: 'summer',
    extent: { w: 400, h: 400 },
    play: { w: 400, h: 400 },
    features: [
      { id: 'a', kind: 'relief.hill', point: [0, 0], height: 4, width: 40 },
      { id: 'b', kind: 'relief.hill', point: [50, 0], height: 4, width: 40 },
      { id: 'c', kind: 'relief.hill', point: [100, 0], height: 4, width: 40 },
    ],
  })
  const edit = (fn: (m: MapFile) => void) => {
    const m = JSON.parse(base) as MapFile
    fn(m)
    const out = writeMap(base, m)
    expect(JSON.parse(out)).toEqual(m)
    return out
  }
  it('appends a new feature on its own line, after the last', () => {
    const out = edit(m => m.features.push({ id: 'd', kind: 'relief.hill', point: [9, 9], height: 1, width: 9 }))
    expect(lines(out).length).toBe(lines(base).length + 1)
    expect(out).toContain('{"id":"c"')
    expect(lines(out).find(l => l.includes('"id":"d"'))).toMatch(/^ {4}\{"id":"d"/)
  })
  it('cuts a deleted feature with its separator: first, middle, last, and the last two with a new one', () => {
    for (const gone of ['a', 'b', 'c']) {
      const out = edit(m => (m.features = m.features.filter(f => f.id !== gone)))
      expect(lines(out).length).toBe(lines(base).length - 1)
    }
    const out = edit(m => {
      m.features = [m.features[0], { id: 'e', kind: 'relief.hill', point: [1, 1], height: 1, width: 9 }]
    })
    expect(lines(out).length).toBe(lines(base).length - 1)
  })
  it('changes a map field in place, adds one before the features, removes one with its separator', () => {
    expect(
      changed(
        base,
        edit(m => (m.name = 'U')),
      ).length,
    ).toBe(1)
    const added = edit(m => (m.datum = 180))
    expect(lines(added).length).toBe(lines(base).length + 1)
    expect(added).toMatch(/\n {2}"datum": 180,\n {2}"features"/)
    const back = writeMap(added, JSON.parse(base) as MapFile)
    expect(back).toBe(base)
  })
  it('keeps a hand-written feature over several lines when another changes', () => {
    const hand = base.replace(
      '{"id":"b","kind":"relief.hill",',
      '{\n      "id": "b",\n      "kind": "relief.hill",\n      ',
    )
    expect(writeMap(hand, JSON.parse(hand) as MapFile)).toBe(hand)
    const m = JSON.parse(hand) as MapFile
    m.features[2].height = 5
    const out = writeMap(hand, m)
    expect(out).toContain('{\n      "id": "b",\n      "kind": "relief.hill",\n      ')
    expect(JSON.parse(out)).toEqual(m)
  })
  it("keeps the unchanged features' text when the order changes", () => {
    const out = edit(m => m.features.reverse())
    expect(out.indexOf('"id":"c"')).toBeLessThan(out.indexOf('"id":"a"'))
    expect(lines(out).length).toBe(lines(base).length)
  })
  it('writes the one layout with no text to keep, or one that is not an object', () => {
    const m = JSON.parse(base) as MapFile
    expect(writeMap(null, m)).toBe(base)
    expect(writeMap('[1]', m)).toBe(base)
    expect(writeMap('not json', m)).toBe(base)
  })
  it('reads strings with escapes and brackets inside', () => {
    const m = JSON.parse(base) as MapFile
    m.note = 'a "quoted" [bracket] {brace} \\ end'
    const text = formatMap(m)
    expect(writeMap(text, JSON.parse(text) as MapFile)).toBe(text)
    m.features[1].height = 9
    expect(changed(text, writeMap(text, m)).length).toBe(1)
  })
  it('compares values as JSON, keys in any order', () => {
    expect(sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameJson([1, 2], [2, 1])).toBe(false)
    expect(sameJson({ a: undefined }, {})).toBe(true)
  })
})

describe('M7a: an edit undone after a save', () => {
  it("writes the feature back in the file's first bytes, so undo and save restore the file", () => {
    const text = fs.readFileSync(path.join(root, 'maps', 'two-ridges.map.json'), 'utf8')
    const map = JSON.parse(text) as MapFile
    const edited = structuredClone(map)
    const f = edited.features.find(x => x.line)!
    f.line![0] = [f.line![0][0] + 2, f.line![0][1]]
    const saved = writeMap(text, edited, writerFrom(text))
    expect(saved).not.toBe(text)
    expect(writeMap(saved, map, writerFrom(text))).toBe(text)
    // an earlier text that is not JSON is ignored
    expect(writeMap(saved, map, writerFrom('not json {"'))).not.toBe(text)
  })
})

describe('M7a: a base that is no map yet (a hand edit in progress)', () => {
  it('writes the map afresh when the base has no list of features, or one with an element that is no feature', () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'two-ridges.map.json'), 'utf8')) as MapFile
    for (const base of ['{"features": null}', '{"features": {}}', '{"features": "x"}', '{"id": "x"}']) {
      expect(writeMap(base, m)).toBe(formatMap(m))
    }
    const out = writeMap('{\n  "features": [\n    null,\n    {"id": 1}\n  ]\n}\n', m)
    expect(JSON.parse(out)).toEqual(m)
  })
})

describe('M7a: a file with CRLF line ends', () => {
  it('keeps them in what it writes, new fields and lists too', () => {
    const lf = fs.readFileSync(path.join(root, 'maps', 'two-ridges.map.json'), 'utf8')
    const crlf = lf.replace(/\n/g, '\r\n')
    const m = JSON.parse(crlf) as MapFile
    expect(writeMap(crlf, m)).toBe(crlf)
    m.presets = { p: { kind: 'veg.wood' } }
    m.features[0] = { ...m.features[0], note: 'moved' }
    const out = writeMap(crlf, m)
    expect(out.replace(/\r\n/g, '')).not.toMatch(/\n/)
    expect(JSON.parse(out)).toEqual(m)
  })
})
