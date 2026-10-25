// The map page's editor (docs/plans/active/m7-editor.md M7a) driven without a page: a fake host projects straight
// down at 1 px a metre, and a fake server stands in for the dev server's save.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { MapFile } from '../src/map/schema.ts'
import { formatMap } from '../src/map/format.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'

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
function make() {
  const compiles: string[] = []
  const host: Host = {
    ctx: {} as CanvasRenderingContext2D,
    project: (x, z) => [x, -z],
    toWorld: (sx, sy) => [sx, -sy],
    ppm: () => 1,
    shown: () => (JSON.parse(text) as MapFile).features,
    groundPath: () => {},
    recompile: () => compiles.push('edit'),
    redraw: () => {},
    changed: () => {},
  }
  const ed = new Editor(host)
  ed.load('/maps/t.map.json', text)
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
