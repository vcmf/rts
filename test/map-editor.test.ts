// The map page's editor (docs/plans/done/m7-editor.md M7a) driven without a page: a fake host projects straight
// down at 1 px a metre, and a fake server stands in for the dev server's save.
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import type { Issue } from '../src/map/validate.ts'
import { formatMap } from '../src/map/format.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'
import { root } from './fx.ts'
import { newestOnly } from '../src/app/map/latest.ts'
import { again, clickClock, dbl } from './map-clock.ts'

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
  const found: Issue[][] = []
  const host: Host = {
    ctx: {} as CanvasRenderingContext2D,
    project: (x, z) => [x, -z],
    toWorld: (sx, sy) => [sx, -sy],
    ppm: () => 1,
    shown: () => (JSON.parse(fileText) as MapFile).features,
    groundPath: () => {},
    recompile: () => compiles.push('edit'),
    problems: f => found.push(f),
    redraw: () => {},
    changed: () => {},
  }
  const ed = new Editor(host)
  ed.load('/maps/t.map.json', fileText)
  return { ed, compiles, found }
}
/** Drags from one screen point to another. */
function drag(ed: Editor, from: [number, number], to: [number, number]) {
  expect(ed.down(...from)).toBe(true)
  ed.move(...to)
  ed.up()
}
afterEach(() => vi.unstubAllGlobals())
clickClock()

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
    expect(ed.onDisk('/maps/t.map.json', byHand)).toBe(true)
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
    ed.onDisk('/maps/t.map.json', text.replace('"height":4', '"height":5'))
    expect(ed.conflict).not.toBe(null)
    ed.onDisk('/maps/t.map.json', text)
    expect(ed.conflict).toBe(null)
  })
  it('adds no point on a double click over an existing one', () => {
    const { ed } = make()
    ed.select('road')
    dbl(ed, 100, -50)
    expect(ed.feature('road')!.line!.length).toBe(2)
    dbl(ed, 0, -50)
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
    dbl(ed, 0, -50) // a middle point
    ed.move(0, -50)
    ed.click(0, -50)
    ed.remove()
    expect(ed.feature('road')!.line!.length).toBe(2)
  })
  it("applies an edit the validator finds wrong, and shows it at once: a wall's corner removed", () => {
    const { ed, found } = make(walled)
    ed.setCatalogue(cat)
    ed.select('wall')
    ed.move(40, 100) // over the corner
    ed.remove()
    expect(ed.feature('wall')!.line!.length).toBe(2)
    expect(ed.message).toMatch(/^now wrong: \[wall\] .*8 directions/)
    expect(found.at(-1)!.some(i => i.id === 'wall')).toBe(true)
    ed.undo()
    expect(ed.feature('wall')!.line!.length).toBe(3)
    expect(ed.message).toBe('')
    expect(found.at(-1)!.length).toBe(0)
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
    dbl(ed, 0, -50)
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
    expect(ed.onDisk('/maps/t.map.json', text.replace('"height":4', '"height":5'))).toBe(false)
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
  it('edits a broken feature like any other: a point added to a line that crosses itself', () => {
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
    dbl(ed, -50, -50)
    expect(ed.feature('road')!.line!.length).toBe(5)
    expect(ed.message).toMatch(/^now wrong: \[road\] .*crosses itself/)
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
    again(ed, -100, 152)
    expect(ed.feature('wood')!.area![0].length).toBe(5)
  })
  it('settles a conflict that came during a press that edited nothing: the file is read in', () => {
    const { ed, compiles } = make()
    ed.select('road')
    expect(ed.down(-100, -50)).toBe(true)
    const byHand = text.replace('"height":4', '"height":5')
    ed.onDisk('/maps/t.map.json', byHand)
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

describe('M7a redesign, round 2', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
  const withFeatures = (features: MapFile['features']) =>
    formatMap({ ...(JSON.parse(text) as MapFile), features } as MapFile)
  it('says what is wrong with a barrier after an edit, though it was wrong before', () => {
    // broken at its second point (off the lattice); removing its fourth also leaves a joint out of the 8 directions
    const wall = {
      id: 'wall',
      kind: 'barrier.wall',
      line: [
        [0, -100],
        [21, -100],
        [40, -100],
        [40, -80],
        [60, -60],
      ],
    }
    const { ed } = make(withFeatures([wall] as MapFile['features']))
    ed.setCatalogue(cat)
    ed.select('wall')
    ed.move(40, 80)
    ed.remove()
    expect(ed.feature('wall')!.line!.length).toBe(4)
    expect(ed.message).toMatch(/^now wrong: \[wall\]/)
  })
  it('edits neither of two features sharing an id, and says so', () => {
    const a = { id: 'wood', kind: 'veg.wood.broad', circle: [[0, 0], 10] }
    const b = { id: 'wood', kind: 'veg.wood.broad', circle: [[100, 0], 10] }
    const { ed } = make(withFeatures([a, b] as MapFile['features']))
    ed.select('wood')
    expect(ed.down(0, 0)).toBe(false)
    ed.leave()
    ed.remove()
    expect(ed.doc!.features.length).toBe(2)
    expect(ed.message).toMatch(/two features share the id wood/)
  })
  it('redraws the selection on undo, and keeps the handle under the pointer after a drag for Delete', () => {
    let redraws = 0
    const { ed } = make(
      withFeatures([
        {
          id: 'road',
          kind: 'way.road.lane',
          line: [
            [-100, 50],
            [0, 50],
            [100, 50],
          ],
        },
      ] as MapFile['features']),
    )
    ;(ed as unknown as { host: Host }).host.redraw = () => redraws++
    ed.select('road')
    drag(ed, [0, -50], [0, -70]) // the middle point up 20 m
    ed.remove() // the pointer is still on it
    expect(ed.feature('road')!.line!.length).toBe(2)
    const before = redraws
    ed.undo()
    expect(redraws).toBeGreaterThan(before)
  })
  it('clears the conflict on screen when an overwrite finds nothing to write', async () => {
    let changed = 0
    const { ed } = make()
    ;(ed as unknown as { host: Host }).host.changed = () => changed++
    ed.conflict = text // a save whose reply was lost: the disk holds what the page holds
    const n = changed
    expect(await ed.save(true)).toBe(true)
    expect(ed.conflict).toBe(null)
    expect(changed).toBeGreaterThan(n)
  })
  it('delivers only the newest of several reads, whatever order they resolve in', async () => {
    const newest = newestOnly()
    let first: (v: string) => void = () => {}
    const a = newest(new Promise<string>(res => (first = res)))
    const b = newest(Promise.resolve('B'))
    expect(await b).toBe('B')
    first('A')
    expect(await a).toBe(null)
  })
})

describe('M7a redesign 2: edits apply, the structure checked, the inside pans', () => {
  const withFeatures = (features: unknown[]) => formatMap({ ...(JSON.parse(text) as MapFile), features } as MapFile)
  it('opens a file whose structure it cannot read read-only, and a click does not throw', () => {
    const { ed } = make('{"format":1,"features":[null,{"id":"a"}]}')
    expect(ed.doc).toBe(null)
    expect(ed.readOnly).toMatch(/features\[0\] is not an object/)
    expect(() => ed.click(0, 0)).not.toThrow()
    expect(ed.down(0, 0)).toBe(false)
  })
  it("pans from inside a selected area (the press is not the editor's), drags from its edge", () => {
    const wood = {
      id: 'wood',
      kind: 'veg.wood.broad',
      area: [
        [
          [-50, -50],
          [50, -50],
          [50, 50],
          [-50, 50],
        ],
      ],
    }
    const { ed } = make(withFeatures([wood]))
    ed.select('wood')
    expect(ed.down(0, 0)).toBe(false) // inside
    expect(ed.down(0, 50)).toBe(true) // on its south edge (z −50)
    ed.move(0, 60)
    ed.up()
    expect(ed.feature('wood')!.area![0][0]).toEqual([-50, -60])
  })
  it('leaves the shape where it was while the pointer is over no ground', () => {
    const { ed } = make()
    let ground = true
    ;(ed as unknown as { host: Host }).host.toWorld = (sx, sy) => (ground ? [sx, -sy] : null)
    ed.select('road')
    expect(ed.down(-100, -50)).toBe(true)
    ed.move(-90, -50)
    ground = false
    ed.move(500, -900)
    ed.up()
    expect(ed.feature('road')!.line![0]).toEqual([-90, 50])
  })
  it("keeps a conflict from another write seen while a save was out; drops the save's own", async () => {
    const { ed } = make()
    let reply = () => {}
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>(res => {
          reply = () => res(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        }),
    )
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    const ours = ed.text
    const saved = ed.save()
    await new Promise(r => setTimeout(r, 0))
    ed.onDisk('/maps/t.map.json', ours) // the watcher sees the save itself
    ed.onDisk('/maps/t.map.json', '{"format":1,"features":[]}') // and then another tool's write
    reply()
    expect(await saved).toBe(true)
    expect(ed.conflict).toBe('{"format":1,"features":[]}')
  })
  it('says nothing about a shared id when the press is not on the selection', () => {
    const a = { id: 'wood', kind: 'veg.wood.broad', circle: [[0, 0], 10] }
    const b = { id: 'wood', kind: 'veg.wood.broad', circle: [[100, 0], 10] }
    const { ed } = make(withFeatures([a, b]))
    ed.select('wood')
    expect(ed.down(300, -300)).toBe(false)
    expect(ed.message).toBe('')
  })
  it("drops an overtaken read's failure too", async () => {
    const newest = newestOnly()
    let fail: (e: Error) => void = () => {}
    const a = newest(new Promise<string>((_, rej) => (fail = rej)))
    const b = newest(Promise.resolve('B'))
    expect(await b).toBe('B')
    fail(new Error('gone mid-rename'))
    expect(await a).toBe(null)
  })
})

describe('M7a redesign 2, round 1', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
  it('picks from its own copy when the map does not compile (nothing on screen)', () => {
    const { ed } = make()
    ;(ed as unknown as { host: Host }).host.shown = () => []
    ed.click(0, -50)
    expect(ed.selected).toBe('road')
  })
  it('only selects on a double click whose first click selected', () => {
    const { ed } = make()
    ed.click(0, -50) // selects the road
    again(ed, 0, -50)
    expect(ed.feature('road')!.line!.length).toBe(2)
  })
  it("keeps the save's message through the watcher's echo of it, and a deletion seen during the save", async () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    let reply = () => {}
    vi.stubGlobal('fetch', () => new Promise<Response>(r => (reply = () => r(new Response('{"ok":true}')))))
    const saving = ed.save()
    await Promise.resolve()
    const ours = ed.text
    // the save's rename seen as the file gone, then back, before the reply
    ed.onDisk('/maps/t.map.json', null)
    expect(ed.noFile).toBe(false)
    reply()
    expect(await saving).toBe(true)
    expect(ed.message).toBe('saved')
    ed.onDisk('/maps/t.map.json', ours) // the watcher's echo, after the reply
    expect(ed.message).toBe('saved')
    expect(ed.conflict).toBeNull()
    expect(ed.dirty).toBe(false)
  })
  it("ignores the watcher's report of a save still on its way, so an undo made meanwhile stands", async () => {
    const { ed } = make()
    let reply = () => {}
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>(res => {
          reply = () => res(new Response(JSON.stringify({ ok: true }), { status: 200 }))
        }),
    )
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    const sent = ed.text
    const saved = ed.save()
    await new Promise(r => setTimeout(r, 0))
    ed.undo() // back to the file as read, before the reply
    expect(ed.onDisk('/maps/t.map.json', sent)).toBe(false)
    reply()
    await saved
    expect(ed.feature('road')!.line![0]).toEqual([-100, 50])
    expect(ed.canRedo).toBe(true)
  })
  it('reads what is wrong in a file as read, and clears the last message', () => {
    const { ed } = make()
    ed.setCatalogue(cat)
    ed.message = 'saved'
    ed.load('/maps/t.map.json', text.replace('"height":4', '"height":"tall"'))
    expect(ed.message).toBe('')
    const found = (ed as unknown as { found: { id: string }[] }).found
    expect(found.some(i => i.id === 'hill')).toBe(true)
  })
})

describe('M7a redesign 2, round 2', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
  it('ignores a change on disk of another map than the one it holds', () => {
    const { ed } = make()
    expect(ed.onDisk('/maps/other.map.json', '{"format":1,"features":[]}')).toBe(false)
    expect(ed.base).toBe(text)
  })
  it('reads the file in when an undo makes the copy clean during a conflict', () => {
    const { ed } = make()
    ed.select('road')
    drag(ed, [-100, -50], [-90, -50])
    const byHand = text.replace('"height":4', '"height":5')
    ed.onDisk('/maps/t.map.json', byHand)
    expect(ed.conflict).toBe(byHand)
    ed.undo()
    expect(ed.conflict).toBe(null)
    expect(ed.base).toBe(byHand)
  })
  it('draws the selection by the newest catalogue: wrong as soon as it is read', () => {
    const { ed } = make(text.replace('"height":4', '"height":"tall"'))
    ed.setCatalogue(cat)
    const found = (ed as unknown as { found: { id: string }[] }).found
    expect(found.some(i => i.id === 'hill')).toBe(true)
  })
  it('finds the handle under a resting pointer again when the view moves', () => {
    const { ed } = make()
    let shift = 0
    ;(ed as unknown as { host: Host }).host.project = (x, z) => [x, -z + shift]
    ed.select('road')
    ed.move(100, -50) // on the road's last point
    shift = 200 // the view moved under the pointer
    ed.viewChanged()
    ed.remove() // the pointer is off the shape now: the feature, not that point
    expect(ed.feature('road')).toBe(undefined)
  })
  it('says why a point stays, naming each shape’s fewest points', () => {
    const { ed } = make()
    ed.select('road')
    ed.move(100, -50)
    ed.remove()
    expect(ed.message).toMatch(/a line 2, a closed line or a ring 3/)
  })
})
