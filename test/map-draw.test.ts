// The map editor's drawing of new features (docs/plans/active/m7-editor.md M7b): every kind of the catalogue drawn as
// every shape it takes, its references set by clicking their targets, on a map with targets for them; the editor's
// drawing mode; a new map made and saved.
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Catalogue, Feature, MapFile, Pt, ShapeName } from '../src/map/schema.ts'
import { kindChain, kindMeta } from '../src/map/catalogue.ts'
import { validate, type Issue } from '../src/map/validate.ts'
import { barrierProblem, pointAt } from '../src/map/geometry.ts'
import { formatMap } from '../src/map/format.ts'
import { writeMap, writerFrom } from '../src/map/write.ts'
import {
  addPoint,
  alongAt,
  back,
  done,
  drawSteps,
  endStep,
  proposeId,
  refAccepts,
  setRef,
  startDraft,
  stepOf,
  type Draft,
} from '../src/app/map/draw.ts'
import { isBarrier, type Place } from '../src/app/map/edit.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'
import { root } from './fx.ts'

const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
// a map with a target for every reference the catalogue names: a stream, a road
const base: MapFile = {
  format: 1,
  id: 't',
  name: 'T',
  seed: 1,
  season: 'summer',
  extent: { w: 1000, h: 1000 },
  play: { w: 800, h: 800 },
  features: [
    {
      id: 'brook',
      kind: 'water.stream',
      line: [
        [-400, 0],
        [400, 10],
      ],
    },
    {
      id: 'road',
      kind: 'way.road.lane',
      line: [
        [0, -400],
        [10, 400],
      ],
    },
  ],
}
const place = (barrier: boolean): Place => ({ step: 0.1, reach: 5, barrier })

/** Draws a kind as a shape through its clicks, its references clicked on their first target; the feature it makes. */
function drawKind(map: MapFile, kind: string, shape: ShapeName | 'none', id: string): Feature {
  const meta = kindMeta(cat, kindChain(cat, kind)!)
  const f: Feature = { id, kind }
  let d: Draft = startDraft(f, drawSteps(meta, shape), isBarrier(f))
  const p = place(d.barrier)
  const clicks: Record<ShapeName, Pt[]> = {
    point: [[101.23, 52.07]],
    line: [
      [100, 50],
      [161, 52],
      [163, 111],
    ],
    area: [
      [100, 50],
      [180, 50],
      [180, 120],
    ],
    circle: [
      [150, 80],
      [180, 80],
    ],
    ellipse: [
      [150, 80],
      [190, 110],
      [140, 95],
    ],
  }
  for (let guard = 0; !done(d) && guard < 20; guard++) {
    const s = stepOf(d)!
    if (s.kind === 'shape') {
      for (const c of clicks[s.shape]) d = addPoint(d, c, p)
      if (!done(d) && stepOf(d) === s) d = endStep(d) as Draft
      continue
    }
    if (s.want === 'point') {
      d = setRef(d, null, [-200, 3], p) as Draft
      continue
    }
    const t = map.features.find(x => refAccepts(s.want, id, x, map.presets))!
    expect(t, `${kind}: a target for ${s.ref}`).toBeDefined()
    const at = (k: number) => pointAt(t.line!, k).slice(0, 2) as Pt
    d = setRef(d, t, at(120), p) as Draft
    if (s.ref === 'along') d = setRef(d, t, at(40), p) as Draft
  }
  expect(done(d), `${kind} as ${shape}`).toBe(true)
  return d.feature
}

describe('M7b: drawing a feature', () => {
  it('draws every kind of the catalogue as every shape it takes, its references by their targets', () => {
    let n = 0
    for (const kind of Object.keys(cat.kinds)) {
      const meta = kindMeta(cat, kindChain(cat, kind)!)
      for (const shape of meta.shapes) {
        const id = proposeId(
          kind,
          base.features.map(f => f.id),
        )
        const f = drawKind(base, kind, shape, id)
        const issues = validate({ ...base, features: [...base.features, f] }, cat).filter(i => i.id === id)
        // what the drawing sets is right: its shape and its references (a kind that needs a generator or an
        // attribute says so, and its fields are M7c's)
        const own = issues.filter(i =>
          /\.(point|line|area|circle|ellipse|on|carries|crosses|near|along)\b/.test(i.path),
        )
        expect(own, `${kind} as ${shape}: ${JSON.stringify(f)}`).toEqual([])
        if (isBarrier(f)) expect(barrierProblem(f.line!)).toBeNull()
        n++
      }
    }
    expect(n).toBeGreaterThan(100)
  })
  it('sets along from two clicks on the line, in either order, in metres along it', () => {
    const f = drawKind(base, 'built.village', 'none', 'hamlet')
    expect(f.along).toEqual({ id: 'road', from: 40, to: 120 })
  })
  it('measures a point along a line from its nearest place', () => {
    const line: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ]
    expect(alongAt(line, [4, 3])).toBe(4)
    expect(alongAt(line, [13, 6])).toBe(16)
    expect(alongAt(line, [-5, 0])).toBe(0)
  })
  it('snaps every new point of a barrier into the 8 directions', () => {
    const f: Feature = { id: 'h', kind: 'barrier.hedge' }
    let d = startDraft(f, [{ kind: 'shape', shape: 'line' }], true)
    for (const c of [
      [1.3, 0.7],
      [40.2, 3.1],
      [61, 25],
      [62, 70],
    ] as Pt[]) {
      d = addPoint(d, c, place(true))
    }
    const line = (endStep(d) as Draft).feature.line!
    expect(line).toHaveLength(4)
    expect(barrierProblem(line)).toBeNull()
  })
  it('adds nothing for a click on the last point (a double click), and needs 2 points to end a line', () => {
    let d = startDraft({ id: 'r', kind: 'way.path' }, [{ kind: 'shape', shape: 'line' }], false)
    d = addPoint(d, [5, 5], place(false))
    d = addPoint(d, [5.01, 5.02], place(false))
    expect(d.pts).toHaveLength(1)
    expect(typeof endStep(d)).toBe('string')
  })
  it('refuses a target of another category or shape, and the feature itself', () => {
    const pond: Feature = { id: 'pond', kind: 'water.pond', circle: [[0, 0], 10] }
    expect(refAccepts('water:line', 'ford', base.features[0])).toBe(true)
    expect(refAccepts('water:line', 'ford', pond)).toBe(false)
    expect(refAccepts('water:line', 'ford', base.features[1])).toBe(false)
    expect(refAccepts('water', 'brook', base.features[0])).toBe(false)
  })
  it('skips an optional reference with Enter, and refuses to skip a needed one', () => {
    const meta = kindMeta(cat, kindChain(cat, 'built.bridge')!)
    let d = startDraft({ id: 'b', kind: 'built.bridge' }, drawSteps(meta, 'none'), false)
    expect(typeof endStep(d)).toBe('string') // carries is needed
    d = setRef(d, base.features[1], [0, 0], place(false)) as Draft
    d = setRef(d, base.features[0], [0, 0], place(false)) as Draft
    expect(stepOf(d)).toMatchObject({ ref: 'near', optional: true })
    d = endStep(d) as Draft
    expect(done(d)).toBe(true)
    expect(d.feature).toEqual({ id: 'b', kind: 'built.bridge', carries: 'road', crosses: 'brook' })
  })
  it('takes clicks back, into the step before', () => {
    const meta = kindMeta(cat, kindChain(cat, 'veg.reeds')!)
    let d = startDraft({ id: 'r', kind: 'veg.reeds' }, drawSteps(meta, 'circle'), false)
    d = addPoint(d, [0, 0], place(false))
    d = addPoint(d, [10, 0], place(false))
    expect(done(d)).toBe(true)
    d = back(d)
    expect(d.feature.circle).toBeUndefined()
    expect(d.pts).toEqual([[0, 0]])
    d = back(back(d))
    expect(d.pts).toEqual([])
  })
  it("proposes an id from the kind, numbered when taken, never as a generated child's", () => {
    expect(proposeId('ground.field.wheat', [])).toBe('wheat')
    expect(proposeId('ground.field.wheat', ['wheat', 'wheat2'])).toBe('wheat3')
    // a second wood beside one that generates: wood-2 would be one of its children's ids
    const wood: Feature = { id: 'wood', kind: 'veg.wood', circle: [[0, 0], 80], gen: { clump: {} } }
    const id = proposeId('veg.wood', ['wood'])
    const second: Feature = { id, kind: 'veg.wood', circle: [[300, 0], 50] }
    expect(validate({ ...base, features: [wood, second] }, cat).filter(i => i.id === id)).toEqual([])
  })
  it('closes an area, a line and a barrier on a click back on the first point', () => {
    const steps = (shape: ShapeName) => [{ kind: 'shape' as const, shape }]
    const clicks = (d: Draft, pts: Pt[], p: Place) => pts.reduce((x, c) => addPoint(x, c, p), d)
    const ring: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 80],
      [1, 2], // within reach of the first
    ]
    const area = clicks(startDraft({ id: 'a', kind: 'ground.meadow' }, steps('area'), false), ring, place(false))
    expect(done(area)).toBe(true)
    expect(area.feature.area).toEqual([ring.slice(0, 3)])
    expect(validate({ ...base, features: [...base.features, area.feature] }, cat).filter(i => i.id === 'a')).toEqual([])
    const line = clicks(startDraft({ id: 'l', kind: 'way.path' }, steps('line'), false), ring, place(false))
    expect(line.feature.line).toEqual([...ring.slice(0, 3), [0, 0]])
    // a hedge whose last segment back to its start is no 8-direction: a lattice point between makes it whole
    const hedge = clicks(
      startDraft({ id: 'h', kind: 'barrier.hedge' }, steps('line'), true),
      [
        [0, 0],
        [40, 0],
        [40, 30],
        [1, 1],
      ],
      place(true),
    )
    expect(done(hedge)).toBe(true)
    const h = hedge.feature.line!
    expect(h[0]).toEqual(h[h.length - 1])
    expect(barrierProblem(h)).toBeNull()
  })
})

function host(shown: () => Feature[]) {
  const issues: Issue[][] = []
  const h: Host = {
    ctx: {} as CanvasRenderingContext2D,
    project: (x, z) => [x, -z],
    toWorld: (sx, sy) => [sx, -sy],
    ppm: () => 1,
    shown,
    groundPath: () => {},
    recompile: () => {},
    problems: f => issues.push(f),
    redraw: () => {},
    changed: () => {},
  }
  return { h, issues }
}
afterEach(() => vi.unstubAllGlobals())

describe('M7b: the editor draws', () => {
  const text = formatMap(base)
  function make() {
    let ed: Editor | null = null
    const { h, issues } = host(() => ed!.doc!.features)
    ed = new Editor(h)
    ed.setCatalogue(cat)
    ed.load('/maps/t.map.json', text)
    return { ed, issues }
  }
  /** A click at a ground point (the fake view: 1 px a metre, z up). */
  const click = (ed: Editor, p: Pt) => ed.click(p[0], -p[1])

  it('makes a ford by clicks in one edit, selected, and undoes it in one step', () => {
    const { ed } = make()
    expect(ed.add('water.ford', 'none', 'ford')).toBe(true)
    expect(ed.drawing).toBe(true)
    click(ed, [100, 70]) // nothing there: the stream is the target
    expect(ed.drawing).toBe(true)
    expect(ed.message).toMatch(/nothing to pick/)
    click(ed, [100, 3])
    click(ed, [100.4, 2.6])
    expect(ed.drawing).toBe(false)
    expect(ed.selected).toBe('ford')
    expect(ed.feature('ford')).toEqual({ id: 'ford', kind: 'water.ford', on: 'brook', near: [100, 3] })
    ed.undo()
    expect(ed.feature('ford')).toBeUndefined()
    expect(ed.dirty).toBe(false)
  })
  it('takes no command while drawing, and a change on disk is a conflict until it ends', () => {
    const { ed } = make()
    ed.add('way.path', 'line', 'path')
    click(ed, [0, 100])
    ed.undo()
    expect(ed.message).toMatch(/finish the drawing/)
    const byHand = text.replace('"name": "T"', '"name": "U"')
    expect(ed.onDisk('/maps/t.map.json', byHand)).toBe(false)
    expect(ed.conflict).toBe(byHand)
    ed.drop()
    // nothing was edited: the file is read in
    expect(ed.conflict).toBeNull()
    expect(ed.base).toBe(byHand)
  })
  it('ends a line with Enter and a double click, and drops a drawing with Escape', () => {
    const { ed } = make()
    ed.add('way.path', 'line', 'path')
    click(ed, [0, 100])
    click(ed, [50, 100])
    ed.dblclick(50, -100)
    expect(ed.feature('path')!.line).toEqual([
      [0, 100],
      [50, 100],
    ])
    ed.add('way.path', 'line', 'path-2')
    click(ed, [0, 200])
    ed.drop()
    expect(ed.feature('path-2')).toBeUndefined()
    expect(ed.canUndo).toBe(true) // the first path only
  })
  it('refuses a taken or malformed id and a shape the kind does not take', () => {
    const { ed } = make()
    expect(ed.add('way.path', 'line', 'brook')).toBe(false)
    expect(ed.add('way.path', 'line', 'Brook 2')).toBe(false)
    expect(ed.add('way.path', 'area', 'p')).toBe(false)
    expect(ed.add('way.nothing', 'line', 'p')).toBe(false)
    expect(ed.drawing).toBe(false)
  })
  it('makes a kind with no shape and no reference at once', () => {
    const { ed } = make()
    ed.add('relief.base', 'none', 'terrain')
    expect(ed.drawing).toBe(false)
    expect(ed.feature('terrain')).toEqual({ id: 'terrain', kind: 'relief.base' })
  })
  it("sets the selection's reference again by clicking its target", () => {
    const { ed } = make()
    ed.add('built.bridge', 'none', 'bridge')
    click(ed, [5, 200]) // carries: the road
    click(ed, [-200, -1]) // crosses: the brook
    ed.enter() // no near
    expect(ed.feature('bridge')).toMatchObject({ carries: 'road', crosses: 'brook' })
    expect(ed.pickRef('carries')).toBe(true)
    click(ed, [-200, -1]) // the brook is no way: nothing picked
    expect(ed.drawing).toBe(true)
    ed.enter() // set again, it is needed: Enter does not skip it
    expect(ed.drawing).toBe(true)
    ed.drop()
    expect(ed.feature('bridge')!.carries).toBe('road')
  })
})

describe('M7b: a new map', () => {
  const made: MapFile = { ...base, id: 'fresh', features: [] }
  it('is unsaved until its first save creates the file, which then reads back unchanged', async () => {
    const { h } = host(() => [])
    const ed = new Editor(h)
    ed.setCatalogue(cat)
    ed.create('/maps/fresh.map.json', made)
    expect(ed.isNew).toBe(true)
    expect(ed.dirty).toBe(true)
    ed.add('relief.base', 'none', 'terrain')
    ed.add('ground.meadow', 'circle', 'meadow')
    ed.click(0, 0)
    ed.click(100, 0)
    let sent: { base: string | null; text: string } | null = null
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body) as typeof sent
      return new Response('{"ok":true}')
    })
    expect(await ed.save()).toBe(true)
    expect(sent!.base).toBeNull()
    expect(ed.isNew).toBe(false)
    expect(ed.dirty).toBe(false)
    const saved = sent!.text
    expect(validate(JSON.parse(saved) as MapFile, cat)).toEqual([])
    // read back and written unedited: the same bytes; one more feature: one more line
    expect(writeMap(saved, JSON.parse(saved) as MapFile, writerFrom(saved))).toBe(saved)
    ed.load('/maps/fresh.map.json', saved)
    ed.add('relief.hill', 'point', 'hill')
    ed.click(10, -10)
    // the line before an appended feature gains its comma, nothing more
    const lines = (t: string) => t.split('\n').map(l => l.replace(/,$/, ''))
    expect(
      lines(ed.text)
        .filter(l => !lines(saved).includes(l))
        .map(l => l.trim()),
    ).toEqual([expect.stringContaining('"id":"hill"')])
  })
  it('writes an empty new map that reads back and takes its first feature', () => {
    const t = formatMap(made)
    const doc = JSON.parse(t) as MapFile
    expect(writeMap(t, doc)).toBe(t)
    const one = writeMap(t, { ...doc, features: [{ id: 'terrain', kind: 'relief.base' }] })
    expect((JSON.parse(one) as MapFile).features).toEqual([{ id: 'terrain', kind: 'relief.base' }])
  })
})
