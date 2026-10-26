// The map page's editor (docs/plans/active/m7-editor.md M7a) driven without a page: a fake host projects straight
// down at 1 px a metre, and a fake server stands in for the dev server's save.
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import { formatMap } from '../src/map/format.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'
import { root } from './fx.ts'

const text = formatMap({
  format: 1,
  id: 't',
  name: 'T',
  seed: 1,
  season: 'summer',
  extent: { w: 400, h: 400 },
  play: { w: 400, h: 400 },
  features: [
    { id: 'hill', kind: 'relief.hill', point: [0, 0], height: 4, width: 40 },
    {
      id: 'road',
      kind: 'way.road.lane',
      line: [
        [-100, 50],
        [100, 50],
      ],
    },
  ],
} as MapFile)
function make(fileText = text) {
  const compiles: string[] = []
  const host: Host = {
    ctx: {} as CanvasRenderingContext2D,
    project: (x, z) => [x, -z],
    toWorld: (sx, sy) => [sx, -sy],
    ppm: () => 1,
    shown: () => (JSON.parse(fileText) as MapFile).features,
    groundPath: () => {},
    recompile: () => compiles.push('edit'),
    redraw: () => {},
    changed: () => {},
  }
  const ed = new Editor(host)
  ed.load('/maps/t.map.json', fileText)
  return { ed, compiles }
}
/** Drags from one screen point to another. */
function drag(ed: Editor, from: [number, number], to: [number, number]) {
  expect(ed.down(...from)).toBe(true)
  ed.move(...to)
  ed.up()
}
afterEach(() => vi.unstubAllGlobals())

describe('M7a: the editor', () => {
  it('drags a point into the copy, compiles it, and undoes it', () => {
    const { ed, compiles } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    expect(ed.feature('road')!.line![0]).toEqual([-90, 50])
    expect(ed.dirty).toBe(true)
    expect(compiles.length).toBe(1)
    ed.undo()
    expect(ed.dirty).toBe(false)
    expect(ed.text).toBe(text)
  })
  it('leaves no step in the history for a press that changes nothing', () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-100.2, -50]) // under the rounding
    expect(ed.canUndo).toBe(false)
  })
  it('drops the history when a change on disk is read in, so an undo cannot overwrite it', () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    ed.load('/maps/t.map.json', ed.text) // as saved
    const byHand = text.replace('"height":4', '"height":5')
    expect(ed.onDisk(byHand)).toBe(true)
    expect(ed.canUndo).toBe(false)
    expect(ed.base).toBe(byHand)
  })
  it('deletes the feature when the handle under the pointer is not a line or ring point', () => {
    const { ed } = make()
    ed.select('hill')
    ed.move(0, 0) // over the point's handle
    ed.remove()
    expect(ed.feature('hill')).toBe(undefined)
    expect(ed.selected).toBe(null)
  })
  it('forgets the handle under the pointer when the selection changes', () => {
    const { ed } = make()
    ed.select('road')
    ed.move(100, -50) // over the road's last point
    ed.select('hill')
    ed.remove() // the hill goes, not a point of it or of the road
    expect(ed.feature('hill')).toBe(undefined)
    expect(ed.feature('road')!.line!.length).toBe(2)
  })
  it('sends one save at a time, so a second does not carry the old base', async () => {
    const { ed } = make()
    let disk = text
    const sent: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const r = JSON.parse(init.body) as { base: string; text: string }
      sent.push(r.base)
      await new Promise(res => setTimeout(res, 5))
      if (r.base !== disk) return new Response(JSON.stringify({ ok: false, current: disk }), { status: 409 })
      disk = r.text
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    const [a, b] = await Promise.all([ed.save(), ed.save()])
    expect([a, b]).toEqual([true, true])
    expect(sent.length).toBe(1) // the second found nothing left to save
    expect(ed.conflict).toBe(null)
    expect(disk).toBe(ed.text)
  })
  it('reports a save the server never answered', async () => {
    const { ed } = make()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('connection refused')))
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    expect(await ed.save()).toBe(false)
    expect(ed.message).toMatch(/not saved: connection refused/)
    expect(ed.dirty).toBe(true)
  })
  it('takes a file from disk that is no map as nothing to edit', async () => {
    const { ed } = make()
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ ok: false, current: '{"id":"x"}' }), { status: 409 }),
    )
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    await ed.save()
    expect(ed.conflict).toBe('{"id":"x"}')
    ed.takeDisk()
    expect(ed.doc).toBe(null)
    expect(ed.feature('road')).toBe(undefined)
  })
})

describe('M7a: the editor under interruptions', () => {
  it('drops a drag whose copy was replaced under it (the file read in), keeping the new copy', () => {
    const { ed } = make()
    ed.select('road')
    expect(ed.down(-100, -50)).toBe(true)
    ed.move(-90, -50)
    const byHand = text.replace('"height":4', '"height":5')
    ed.load('/maps/t.map.json', byHand)
    ed.move(-80, -50)
    ed.up()
    expect(ed.base).toBe(byHand)
    expect(ed.dirty).toBe(false)
    expect(ed.feature('hill')!.height).toBe(5)
  })
  it('moves nothing for a press that stays within a few pixels, and puts a cancelled drag back', () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-97, -50])
    expect(ed.dirty).toBe(false)
    expect(ed.down(-100, -50)).toBe(true)
    ed.move(-80, -50)
    expect(ed.dirty).toBe(true)
    ed.cancel()
    expect(ed.dirty).toBe(false)
    expect(ed.canUndo).toBe(false)
  })
  it('clears a conflict when the file on disk is back to what the page read', async () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    ed.onDisk(text.replace('"height":4', '"height":5'))
    expect(ed.conflict).not.toBe(null)
    ed.onDisk(text)
    expect(ed.conflict).toBe(null)
  })
  it('adds no point on a double click over an existing one', () => {
    const { ed } = make()
    ed.select('road')
    ed.dblclick(100, -50)
    expect(ed.feature('road')!.line!.length).toBe(2)
    ed.dblclick(0, -50)
    expect(ed.feature('road')!.line!.length).toBe(3)
  })
})

describe('M7a redesign: one state machine, the validator as the gate', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
  const walled = formatMap({
    ...(JSON.parse(text) as MapFile),
    features: [
      ...(JSON.parse(text) as MapFile).features,
      {
        id: 'wall',
        kind: 'barrier.wall',
        line: [
          [0, -100],
          [40, -100],
          [40, -80],
        ],
      },
    ],
  } as MapFile)
  it('keeps the hover through a click on a handle, so Delete then removes that point, not the feature', () => {
    const { ed } = make()
    ed.select('road')
    ed.dblclick(0, -50) // a middle point
    ed.move(0, -50)
    ed.click(0, -50)
    ed.remove()
    expect(ed.feature('road')!.line!.length).toBe(2)
  })
  it("refuses an edit the validator finds a new problem in, and says which: a wall's corner removed", () => {
    const { ed } = make(walled)
    ed.setCatalogue(cat)
    ed.select('wall')
    ed.move(40, 100) // over the corner
    ed.remove()
    expect(ed.feature('wall')!.line!.length).toBe(3)
    expect(ed.message).toMatch(/^not done: \[wall\] .*8 directions/)
    expect(ed.canUndo).toBe(false)
  })
  it('takes no command during a press: undo, Delete, save, a selection, a double click', async () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    expect(ed.down(-90, -50)).toBe(true)
    ed.move(-70, -50)
    const during = ed.doc
    ed.undo()
    ed.remove()
    ed.select('hill')
    ed.dblclick(0, -50)
    expect(await ed.save()).toBe(false)
    expect(ed.doc).toBe(during)
    expect(ed.selected).toBe('road')
    expect(ed.message).toBe('finish the drag first')
    ed.up()
    expect(ed.feature('road')!.line![0]).toEqual([-70, 50])
  })
  it('makes a change on disk during a press a conflict, not a new copy under the drag', () => {
    const { ed } = make()
    ed.select('road')
    expect(ed.down(-100, -50)).toBe(true)
    expect(ed.onDisk(text.replace('"height":4', '"height":5'))).toBe(false)
    expect(ed.conflict).not.toBe(null)
    ed.move(-90, -50)
    ed.up()
    expect(ed.feature('road')!.line![0]).toEqual([-90, 50])
  })
  it('ignores a save reply for a file or base the editor no longer holds', async () => {
    const { ed } = make()
    let release = () => {}
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>(res => {
          release = () => res(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        }),
    )
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    const saved = ed.save()
    await new Promise(r => setTimeout(r, 0))
    ed.load('/maps/other.map.json', text) // another map picked meanwhile
    release()
    await saved
    expect(ed.base).toBe(text)
    expect(ed.dirty).toBe(false)
  })
  it('says why a refusal that is not JSON was refused', async () => {
    const { ed } = make()
    vi.stubGlobal('fetch', async () => new Response('forbidden here', { status: 403 }))
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    expect(await ed.save()).toBe(false)
    expect(ed.message).toBe('not saved: 403 forbidden here')
  })
  it('has no unsaved edits right after reading a file the writer would lay out otherwise', () => {
    const { ed } = make('{"format":1,"features":[{"id":"a","kind":"relief.hill","point":[0,0]},{"id":"a"}]}')
    expect(ed.dirty).toBe(false)
  })
  it("treats a barrier by its preset's kind: its point stays on the lattice", () => {
    const m = JSON.parse(walled) as MapFile
    m.presets = { stone: { kind: 'barrier.wall' } }
    const w = m.features.find(f => f.id === 'wall')!
    delete w.kind
    w.preset = 'stone'
    const { ed } = make(formatMap(m))
    ed.setCatalogue(cat)
    ed.select('wall')
    drag(ed, [0, 100], [3.3, 100.7])
    const p = ed.feature('wall')!.line![0]
    expect(Number.isInteger(p[0] / 2) && Number.isInteger(p[1] / 2)).toBe(true)
  })
})

describe('M7a redesign, round 1', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
  const withRoad = (line: number[][]) =>
    formatMap({
      ...(JSON.parse(text) as MapFile),
      features: [
        (JSON.parse(text) as MapFile).features[0],
        { id: 'road', kind: 'way.road.lane', line },
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
      ],
    } as MapFile)
  it('lets a broken feature be mended: a point added to a line that crosses itself shifts its problem, adds none', () => {
    const { ed } = make(
      withRoad([
        [-100, 50],
        [100, 50],
        [100, 60],
        [0, 40],
      ]),
    )
    ed.setCatalogue(cat)
    ed.select('road')
    ed.dblclick(-50, -50)
    expect(ed.message).toBe('')
    expect(ed.feature('road')!.line!.length).toBe(5)
  })
  it('removes points one Delete at a time, and never the feature while the pointer is on its shape', () => {
    const { ed } = make(
      withRoad([
        [-100, 50],
        [-50, 50],
        [0, 50],
        [50, 50],
        [100, 50],
      ]),
    )
    ed.select('road')
    ed.move(0, -50) // over the middle point
    ed.remove()
    expect(ed.feature('road')!.line!.length).toBe(4)
    ed.remove() // again, the pointer where the point was: on the line, on no point
    expect(ed.feature('road')!.line!.length).toBe(4)
    ed.move(50, -50) // the next point
    ed.remove()
    expect(ed.feature('road')!.line!.length).toBe(3)
    ed.leave() // off the map: Delete is the feature's
    ed.remove()
    expect(ed.feature('road')).toBe(undefined)
  })
  it("keeps the selection on a click on its ring's edge, just outside it, so a double click there adds a point", () => {
    const { ed } = make(
      withRoad([
        [-100, 50],
        [100, 50],
      ]),
    )
    ed.select('wood')
    ed.click(-100, 152) // 2 px outside the south edge
    expect(ed.selected).toBe('wood')
    ed.dblclick(-100, 152)
    expect(ed.feature('wood')!.area![0].length).toBe(5)
  })
  it('settles a conflict that came during a press that edited nothing: the file is read in', () => {
    const { ed, compiles } = make()
    ed.select('road')
    expect(ed.down(-100, -50)).toBe(true)
    const byHand = text.replace('"height":4', '"height":5')
    ed.onDisk(byHand)
    ed.up()
    expect(ed.conflict).toBe(null)
    expect(ed.base).toBe(byHand)
    expect(compiles.length).toBe(1)
  })
  it('refreshes the panel when a drag is cancelled', () => {
    let changed = 0
    const { ed } = make()
    ;(ed as unknown as { host: Host }).host.changed = () => changed++
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    expect(ed.down(-90, -50)).toBe(true)
    ed.move(-60, -50)
    const before = changed
    ed.cancel()
    expect(changed).toBeGreaterThan(before)
    expect(ed.feature('road')!.line![0]).toEqual([-90, 50])
  })
})
