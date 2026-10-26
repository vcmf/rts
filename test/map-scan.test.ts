// A scan to trace from (docs/plans/active/m7-editor.md M7e, decision 0069): its fit from control points, the pieces it
// shows in, the frame point under a map point, the validator's checks of a scan source, and the transverse Mercator
// the scan tool places a georeferenced image with.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Catalogue, MapFile, Pt, Source } from '../src/map/schema.ts'
import { validate } from '../src/map/validate.ts'
import { apply, fitScan, frameAt, scanPieces, type Affine } from '../src/app/map/scan.ts'
import { geoBox, geoPoints, transverseMercator } from '../tools/geo.ts'
import { root } from './fx.ts'
import { Editor, type Host } from '../src/app/map/editor.ts'
import { formatMap } from '../src/map/format.ts'
import { clickClock } from './map-clock.ts'

const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'kinds.json'), 'utf8')) as Catalogue
const EXTENT = { w: 2000, h: 1000 }
// an image placed with a turn, a stretch and a skew: what a scan's own error looks like at its largest
const TRUE: Affine = [1.9, 0.3, -800, 0.2, -2.1, 500]
const pair = (u: number, v: number): [number, number, number, number] => [u, v, ...apply(TRUE, u, v)]
const near = (a: number[], b: number[], eps = 1e-6) => a.every((x, k) => Math.abs(x - b[k]) < eps)

describe('a scan placed by its control points', () => {
  it('lies over the map with no point: centred, north up, its aspect kept', () => {
    const f = fitScan([], 400, 100, EXTENT)
    // 400 × 100 px over 2000 × 1000 m: 5 m a pixel (the width fits), centred
    expect(f.toFrame(0, 0)).toEqual([-1000, 250])
    expect(f.toFrame(400, 100)).toEqual([1000, -250])
    expect(f.how).toBe('extent')
    expect(f.residuals).toEqual([])
    expect(f.rms).toBeNull()
  })
  it('is moved onto one point, at the same scale', () => {
    const f = fitScan([[200, 50, 300, -100]], 400, 100, EXTENT)
    expect(f.toFrame(200, 50)).toEqual([300, -100])
    expect(f.toFrame(201, 50)[0] - 300).toBeCloseTo(5)
  })
  it('is moved, turned and scaled by two, never mirrored', () => {
    // north up: a pixel further down the image is further south
    const f = fitScan(
      [
        [0, 0, 0, 0],
        [10, 0, 0, 20],
      ],
      100,
      100,
      EXTENT,
    )
    expect(near(f.toFrame(10, 0), [0, 20])).toBe(true)
    // the image turned a quarter to the left: its v axis (down) runs east, as a turned map's would
    expect(near(f.toFrame(0, 10), [20, 0])).toBe(true)
    expect(f.residuals.every(r => r < 1e-9)).toBe(true)
  })
  it('takes the affine map through three, and back', () => {
    const f = fitScan([pair(0, 0), pair(500, 20), pair(30, 400)], 500, 400, EXTENT)
    expect(f.how).toBe('affine')
    expect(near(f.toFrame(123, 45), apply(TRUE, 123, 45))).toBe(true)
    const [x, z] = f.toFrame(123, 45)
    expect(near(f.toImage(x, z)!, [123, 45])).toBe(true)
    expect(f.rms).toBeNull()
  })
  it('bends through four or more: an affine image stays affine, between its points too, and back', () => {
    const pts = [pair(0, 0), pair(500, 20), pair(30, 400), pair(480, 390), pair(250, 200)]
    const f = fitScan(pts, 500, 400, EXTENT)
    expect(f.how).toBe('spline')
    for (const [u, v] of [
      [123, 45],
      [400, 300],
      [-50, 600],
    ]) {
      expect(near(f.toFrame(u, v), apply(TRUE, u, v), 1e-6)).toBe(true)
      const [x, z] = f.toFrame(u, v)
      expect(near(f.toImage(x, z)!, [u, v], 1e-6)).toBe(true)
    }
    // where the others put each point: on it, for an image with no distortion of its own
    expect(f.rms!).toBeLessThan(1e-6)
  })
  it('puts every point where it belongs, and says how far the others would put the one that is off', () => {
    const pts = [pair(0, 0), pair(500, 20), pair(30, 400), pair(480, 390), pair(250, 200)]
    // one point 10 m off: the spline goes through it (a survey's own local error, bent out), and its residual tells
    pts[4] = [pts[4][0], pts[4][1], pts[4][2] + 10, pts[4][3]]
    const f = fitScan(pts, 500, 400, EXTENT)
    for (const [u, v, x, z] of pts) expect(near(f.toFrame(u, v), [x, z], 1e-6)).toBe(true)
    // the others (an affine image) put it 10 m from where it was placed; leaving out another, the spline bends through
    // the one that is off, so their residuals tell of it too
    expect(f.residuals[4]).toBeCloseTo(10, 6)
    expect(f.residuals.every(r => r > 5)).toBe(true)
    const mean = Math.sqrt(f.residuals.reduce((a, r) => a + r * r, 0) / 5)
    expect(f.rms!).toBeCloseTo(mean)
  })
  it('follows a bent image between its points better than one affine map can', () => {
    // a hand-drawn survey's distortion: a smooth bulge of up to 60 m
    const bent = (u: number, v: number): Pt => {
      const [x, z] = apply(TRUE, u, v)
      return [x + 60 * Math.sin((Math.PI * u) / 500) * Math.sin((Math.PI * v) / 400), z]
    }
    const pts: [number, number, number, number][] = []
    for (const u of [0, 125, 250, 375, 500]) for (const v of [0, 100, 200, 300, 400]) pts.push([u, v, ...bent(u, v)])
    const f = fitScan(pts, 500, 400, EXTENT)
    const off = (u: number, v: number) => Math.hypot(...(f.toFrame(u, v).map((x, k) => x - bent(u, v)[k]) as Pt))
    // between the points, a few metres off; the bulge itself is 60 m
    expect(off(190, 150)).toBeLessThan(5)
    expect(off(310, 250)).toBeLessThan(5)
  })
  it('places points in a line by the first two', () => {
    const f = fitScan([pair(0, 0), pair(100, 100), pair(200, 200), pair(300, 300)], 500, 400, EXTENT)
    expect(f.degenerate).toBe(true)
    expect(f.residuals.slice(0, 2).every(r => r < 1e-6)).toBe(true)
  })
})

const base = (sources: Source[], features: MapFile['features']): MapFile => ({
  format: 1,
  id: 't',
  name: 'T',
  seed: 1,
  season: 'summer',
  datum: 200,
  extent: { w: 1000, h: 1000 },
  play: { w: 800, h: 800 },
  sources,
  features,
})
const DEM: Source = {
  id: 'dem',
  kind: 'dem',
  file: 'x.rdem',
  hash: 'sha256:' + '0'.repeat(64),
  credit: 'c',
  licence: 'l',
}
const square = (x0: number, z0: number, s: number) => [
  [
    [x0, z0],
    [x0 + s, z0],
    [x0 + s, z0 + s],
    [x0, z0 + s],
  ] as [number, number][],
]

describe('where a scan shows', () => {
  it("shows in each piece of its frame's file, moved as the piece is, the one on top winning", () => {
    const scan: Source = { id: 's', kind: 'scan', file: 'scans/s.png', frame: 'dem' }
    const map = base(
      [DEM, scan],
      [
        { id: 'a', kind: 'relief.dem', source: 'dem' },
        { id: 'b', kind: 'relief.dem', source: 'dem', area: square(0, 0, 100), shift: { x: 400, z: -50 }, priority: 5 },
        { id: 'hill', kind: 'relief.hill', point: [0, 0] },
      ],
    )
    const pieces = scanPieces(map, cat, scan)
    expect(pieces.map(p => p.id)).toEqual(['a', 'b'])
    // inside b, the file read 400 m east and 50 m south; elsewhere, a's, unmoved
    expect(frameAt(pieces, 50, 50)).toEqual([450, 0])
    expect(frameAt(pieces, -300, 20)).toEqual([-300, 20])
  })
  it("shows nowhere outside its pieces, and over the whole map unmoved in the map's own frame", () => {
    const scan: Source = { id: 's', kind: 'scan', file: 'scans/s.png', frame: 'dem' }
    const map = base(
      [DEM, scan],
      [{ id: 'b', kind: 'relief.dem', source: 'dem', area: square(0, 0, 100), shift: { x: 10, z: 0 } }],
    )
    expect(frameAt(scanPieces(map, cat, scan), -50, -50)).toBeNull()
    const own: Source = { id: 'o', kind: 'scan', file: 'scans/o.png' }
    expect(frameAt(scanPieces(map, cat, own), -50, -50)).toEqual([-50, -50])
  })
})

describe('a scan source', () => {
  const pieces: MapFile['features'] = [{ id: 'a', kind: 'relief.dem', source: 'dem' }]
  const problems = (s: Source) => validate(base([DEM, s], pieces), cat).map(i => `${i.path}: ${i.message}`)
  it('takes its image under scans/, its frame and its control points', () => {
    const s: Source = {
      id: 's',
      kind: 'scan',
      file: 'scans/first-survey.jpg',
      ref: 'First Military Survey, Moravia',
      credit: 'x',
      licence: 'y',
      frame: 'dem',
      points: [[10, 20, -300.5, 120]],
    }
    expect(problems(s)).toEqual([])
    // a feature traced from it names it as its source
    expect(
      validate(base([DEM, s], [...pieces, { id: 'h', kind: 'relief.hill', point: [0, 0], source: 's' }]), cat),
    ).toEqual([])
  })
  it('refuses an image elsewhere, a frame that is no dem source, points of another form, a hash', () => {
    expect(problems({ id: 's', kind: 'scan', file: 'first.jpg' })).toEqual([
      'sources[1].file: a scan needs its image: "scans/<name>.png", .jpg or .webp, lowercase',
    ])
    expect(problems({ id: 's', kind: 'scan' })[0]).toMatch(/needs its image/)
    expect(problems({ id: 's', kind: 'scan', file: 'scans/a.tif' })[0]).toMatch(/needs its image/)
    expect(problems({ id: 's', kind: 'scan', file: 'scans/a.png', frame: 's' })).toEqual([
      `sources[1].frame: "s" is not one of the map's dem sources`,
    ])
    for (const points of [[[1, 2, 3]], [[1, 2, 3, 'x']], 'none', [[1, 2, 3, Infinity]]]) {
      expect(problems({ id: 's', kind: 'scan', file: 'scans/a.png', points } as unknown as Source)[0]).toMatch(
        /\[u, v, x, z\]/,
      )
    }
    expect(problems({ id: 's', kind: 'scan', file: 'scans/a.png', hash: DEM.hash })[0]).toMatch(/"hash" belongs/)
    expect(problems({ id: 's', kind: 'survey', frame: 'dem' } as Source)[0]).toMatch(/belong to scan sources only/)
  })
})

describe('the transverse Mercator', () => {
  it("matches Snyder's worked example (Clarke 1866, 8-9 to 8-11)", () => {
    // Snyder p. 269: φ 40.5° N, λ 73.5° W on a central meridian of 75° W, k0 0.9996: x 127,106.5 m, y 4,484,124.4 m
    const tm = transverseMercator(0, -75, 0.9996, { a: 6378206.4, e2: 0.00676866 })
    const [x, y] = tm(40.5, -73.5)
    expect(x).toBeCloseTo(127106.5, 0)
    expect(y).toBeCloseTo(4484124.4, 0)
  })
  it('puts its centre at the origin, and a degree of latitude about 111 km north', () => {
    const tm = transverseMercator(49.118, 16.737)
    expect(tm(49.118, 16.737)).toEqual([0, 0])
    const [x, z] = tm(50.118, 16.737)
    expect(x).toBeCloseTo(0, 6)
    expect(z).toBeGreaterThan(111000)
    expect(z).toBeLessThan(111400)
  })
  it("places a georeferenced image's pixels with a near-affine fit over a battle map", () => {
    const box = geoBox(49.118, 16.737, 6000, 6000)
    const [s, w, n, e] = box
    const tm = transverseMercator(49.118, 16.737)
    // the box holds the map's corners
    for (const [lat, lon] of [
      [s, w],
      [n, e],
    ]) {
      const [x, z] = tm(lat, lon)
      expect(Math.abs(x)).toBeGreaterThan(3000)
      expect(Math.abs(z)).toBeGreaterThan(3000)
    }
    const pts = geoPoints(box, 2000, 2000, 49.118, 16.737)
    expect(pts).toHaveLength(9)
    // a WGS 84 image in a local transverse Mercator: an affine fit misses by under a metre over 6 km
    // within a metre of one affine map over 6 km: a spline through the grid stays as near it
    const f = fitScan(pts, 2000, 2000, { w: 6000, h: 6000 })
    expect(f.rms!).toBeLessThan(1)
  })
})

describe("the editor's capture of points for a scan", () => {
  function make() {
    const host: Host = {
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
    const ed = new Editor(host)
    ed.setCatalogue(cat)
    ed.load('/maps/t.map.json', formatMap(base([{ id: 's', kind: 'scan', file: 'scans/s.png' }], [])))
    return ed
  }
  clickClock() // each click a second after the last: no double clicks
  const withPoint = (ed: Editor, p: [number, number, number, number]) => ({
    ...ed.doc!,
    sources: [{ ...ed.doc!.sources![0], points: [p] }],
  })
  it('takes a click a prompt, and makes one edit at the last', () => {
    const ed = make()
    expect(ed.capture(['on the scan', 'on the map'], ([a, b]) => withPoint(ed, [a[0], -a[1], b[0], b[1]]))).toBe(true)
    expect(ed.drawing).toBe(true)
    expect(ed.prompt).toBe('on the scan')
    ed.click(10, 20)
    expect(ed.prompt).toBe('on the map')
    expect(ed.captured).toEqual([[10, -20]])
    ed.click(300, 40)
    expect(ed.drawing).toBe(false)
    expect(ed.doc!.sources![0].points).toEqual([[10, 20, 300, -40]])
    // one edit
    ed.undo()
    expect(ed.doc!.sources![0].points).toBeUndefined()
    expect(ed.dirty).toBe(false)
  })
  it('takes the last click back when the edit is refused, and on Backspace; Escape drops it all', () => {
    const ed = make()
    let refuse = true
    ed.capture(['a', 'b'], () => (refuse ? 'not there' : withPoint(ed, [0, 0, 0, 0])))
    ed.click(10, 20)
    ed.click(30, 40)
    expect(ed.message).toBe('not there')
    expect(ed.captured).toEqual([[10, -20]])
    ed.takeBack()
    expect(ed.captured).toEqual([])
    expect(ed.prompt).toBe('a')
    ed.drop()
    expect(ed.drawing).toBe(false)
    expect(ed.dirty).toBe(false)
    // no command while it lasts
    ed.capture(['a', 'b'], () => withPoint(ed, [0, 0, 0, 0]))
    ed.undo()
    expect(ed.message).toMatch(/finish the drawing first/)
    refuse = false
    ed.click(10, 20)
    ed.click(30, 40)
    expect(ed.doc!.sources![0].points).toEqual([[0, 0, 0, 0]])
  })
})
