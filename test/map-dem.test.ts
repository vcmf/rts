// Real relief (docs/plans/done/m5-relief.md, M5): the .rdem file, its hash, its heights between nodes, relief.dem
// pieces in apply, the validator's and the file checks' errors, and the test map compiled for the sim.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Catalogue, MapFile } from '../src/map/schema.ts'
import type { Dem, MapFiles } from '../src/map/dem.ts'
import { decodeRdem, demHeight, demRange, encodeRdem, sha256 } from '../src/map/dem.ts'
import { checkFiles, validate } from '../src/map/validate.ts'
import { apply, heightOf } from '../src/map/apply.ts'
import { engineMap, layersOf } from '../maps/engine.ts'
import { root } from './fx.ts'

const cat = JSON.parse(fs.readFileSync(path.join(root, 'maps/kinds.json'), 'utf8')) as Catalogue
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// a synthetic heightfield: nx × nz nodes at `cell` m, heights from f(i, j) in cm above 200 m
function rdem(nx: number, nz: number, cell: number, f: (i: number, j: number) => number): Uint8Array {
  const cm = new Uint16Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) cm[j * nx + i] = f(i, j)
  return encodeRdem({ nx, nz, cellMm: cell * 1000, baseCm: 20000, cm })
}
const quad = (i: number, j: number) => 100 + 3 * i * i + 2 * j * j + 5 * i * j // cm: a quadratic surface
const FILE = rdem(81, 81, 5, quad) // 400 × 400 m, centred
const files = (b = FILE): MapFiles => new Map([['t.rdem', b]])
const base = (): MapFile =>
  ({
    format: 1,
    id: 't',
    name: 'T',
    seed: 1,
    season: 'summer',
    datum: 200,
    extent: { w: 200, h: 200 },
    play: { w: 200, h: 200 },
    sources: [{ id: 'd', kind: 'dem', file: 't.rdem', hash: sha256(FILE), credit: '© someone', licence: 'CC BY 4.0' }],
    features: [{ id: 'all', kind: 'relief.dem', source: 'd' }],
  }) as unknown as MapFile
const compile = (map: MapFile, f = files()) => {
  expect(validate(map, cat)).toEqual([])
  const c = checkFiles(map, cat, f)
  expect(c.issues).toEqual([])
  return apply(map, cat, c.dems)
}
const fileHeight = (d: Dem, x: number, z: number) => demHeight(d, x, z)

describe('M5: the .rdem file', () => {
  it('round-trips its header and heights, and refuses what is not one', () => {
    const d = decodeRdem(FILE)
    expect([d.nx, d.nz, d.cell, d.base]).toEqual([81, 81, 5, 200])
    expect(d.cm[2 * 81 + 3]).toBe(quad(3, 2))
    expect(() => decodeRdem(FILE.slice(0, 30))).toThrow(/needs/)
    const bad = FILE.slice()
    bad[0] = 88
    expect(() => decodeRdem(bad)).toThrow(/magic/)
  })
  it('hashes as SHA-256 does', () => {
    // the padding's edges: a tail that fits one block, one that needs two, and whole blocks
    const sizes = [0, 3, 55, 56, 63, 64, 65, 119, 120, 128, 1000]
    for (const b of [...sizes.map(n => new Uint8Array(n).map((_, k) => k * 7)), FILE]) {
      expect(sha256(b)).toBe('sha256:' + crypto.createHash('sha256').update(b).digest('hex'))
    }
  })
})

describe('M5: heights between the nodes (bicubic)', () => {
  const d = decodeRdem(FILE)
  const exact = (x: number, z: number) => {
    const i = (x + 200) / 5
    const j = (z + 200) / 5
    return 200 + quad(i, j) / 100
  }
  it('reads the nodes exactly, and a quadratic surface exactly between them (no 5 m lattice)', () => {
    for (const [x, z] of [
      [0, 0],
      [-150, 95],
      [3, -7],
      [101.3, 33.9],
      [-12.5, 140.25],
    ]) {
      expect(fileHeight(d, x, z)).toBeCloseTo(exact(x, z), 9)
    }
  })
  it('never overshoots the nodes it reads, even past a sharp break (a quarry lip)', () => {
    const step = decodeRdem(rdem(20, 20, 5, i => (i < 10 ? 0 : 5000)))
    const [lo, hi] = demRange(step, [-50, -50, 50, 50])
    for (let x = -20; x <= 20; x += 0.5) {
      const h = demHeight(step, x, 0)
      expect(h).toBeGreaterThanOrEqual(lo)
      expect(h).toBeLessThanOrEqual(hi)
    }
  })
  it('the range of a box bounds every height read in it, a box edge on a node line included', () => {
    const d = decodeRdem(rdem(40, 40, 5, (i, j) => ((i * 37 + j * 91) % 13) * 300))
    const box: [number, number, number, number] = [-40, -40, 25, 25] // 25 m: on a node line of the 5 m grid
    const [lo, hi] = demRange(d, box)
    for (let x = -40; x <= 25; x += 1) {
      for (let z = -40; z <= 25; z += 1) {
        const h = demHeight(d, x, z)
        expect(h).toBeGreaterThanOrEqual(lo)
        expect(h).toBeLessThanOrEqual(hi)
      }
    }
  })
  it('a 2 m profile across node lines has a smooth slope: its second differences are constant', () => {
    const h = Array.from({ length: 60 }, (_, k) => fileHeight(d, -60 + 2 * k, 17))
    const d2 = h.slice(2).map((v, k) => v - 2 * h[k + 1] + h[k])
    for (const v of d2) expect(v).toBeCloseTo(d2[0], 9)
  })
})

describe('M5: relief.dem in apply', () => {
  it('a whole-extent piece sets every node to the file less the datum, moved by its shift', () => {
    const d = decodeRdem(FILE)
    const map = base()
    map.features[0].shift = { x: 30, z: -40 }
    const L = compile(map)
    for (const [x, z] of [
      [0, 0],
      [-98, 52],
      [76, -24],
    ]) {
      // on the map's 2 m nodes (between them the layers read linearly)
      expect(heightOf(L, x, z)).toBeCloseTo(fileHeight(d, x + 30, z - 40) - 200, 6)
    }
  })
  it('a scale model (decision 0070): the file read at k times the map, its heights above the datum divided by k', () => {
    const d = decodeRdem(FILE)
    const map = base()
    map.features[0].scale = 1.5
    map.features[0].shift = { x: 20, z: -30 }
    const L = compile(map)
    for (const [x, z] of [
      [0, 0],
      [-98, 52],
      [76, -24],
    ]) {
      expect(heightOf(L, x, z)).toBeCloseTo((fileHeight(d, 1.5 * x + 20, 1.5 * z - 30) - 200) / 1.5, 6)
    }
    // slopes are the file's: a rise over a run on the map is the file's over its own run
    const mapSlope = (heightOf(L, 40, 10) - heightOf(L, 20, 10)) / 20
    const fileSlope = (fileHeight(d, 80, -15) - fileHeight(d, 50, -15)) / 30
    expect(mapSlope).toBeCloseTo(fileSlope, 6)
  })
  it('an area piece sets its inside, blends over its edge, and leaves the ground beyond it', () => {
    const d = decodeRdem(FILE)
    const map = base()
    map.features = [
      { id: 'hill', kind: 'relief.hill', point: [0, 0], height: 3, width: 400 },
      {
        id: 'piece',
        kind: 'relief.dem',
        source: 'd',
        area: [
          [
            [-40, -40],
            [40, -40],
            [40, 40],
            [-40, 40],
          ],
        ],
        edge: 30,
      },
    ] as MapFile['features']
    const L = compile(map)
    const under = compile({ ...clone(map), features: [map.features[0]] })
    const at = (x: number) => heightOf(L, x, 0)
    expect(at(0)).toBeCloseTo(fileHeight(d, 0, 0) - 200, 6)
    expect(at(80)).toBeCloseTo(heightOf(under, 80, 0), 9)
    const mid = at(56)
    const lo = Math.min(heightOf(under, 56, 0), fileHeight(d, 56, 0) - 200)
    const hi = Math.max(heightOf(under, 56, 0), fileHeight(d, 56, 0) - 200)
    expect(mid).toBeGreaterThan(lo)
    expect(mid).toBeLessThan(hi)
  })
  it('reads its shift and edge from a preset, as from the feature', () => {
    const own = base()
    own.features[0].shift = { x: 30, z: -40 }
    const preset = base()
    preset.presets = { moved: { kind: 'relief.dem', shift: { x: 30, z: -40 } } }
    preset.features = [{ id: 'all', preset: 'moved', source: 'd' }]
    expect(Buffer.from(compile(preset).height.buffer).equals(Buffer.from(compile(own).height.buffer))).toBe(true)
    const far = base()
    far.presets = { moved: { kind: 'relief.dem', shift: { x: 150, z: 0 } } }
    far.features = [{ id: 'all', preset: 'moved', source: 'd' }]
    expect(
      checkFiles(far, cat, files())
        .issues.map(i => i.message)
        .join(),
    ).toMatch(/past its file/)
  })
  it("a whole-extent piece's edge does not widen the file check (it reads only the extent)", () => {
    const map = base()
    map.features[0].shift = { x: 100, z: 100 } // the extent in the file's north-east corner, to its very edge
    map.features[0].edge = 80
    map.datum = 450 // the corner's heights, 361–841 m
    expect(checkFiles(map, cat, files()).issues).toEqual([])
  })
  it('sets the real ground over the base noise whatever their ids', () => {
    const d = decodeRdem(FILE)
    for (const noise of ['a-noise', 'z-noise']) {
      const map = base()
      map.features.push({ id: noise, kind: 'relief.base', height: 4, width: 50 })
      expect(heightOf(compile(map), 20, 20)).toBeCloseTo(fileHeight(d, 20, 20) - 200, 6)
    }
  })
  it('gives the same bytes twice', () => {
    const a = compile(base())
    const b = compile(base())
    expect(Buffer.from(a.height.buffer).equals(Buffer.from(b.height.buffer))).toBe(true)
  })
})

describe('M5: what the validator and the file checks refuse', () => {
  const issue = (map: unknown, f = files()) => {
    const v = validate(map, cat)
    return v.length ? v : checkFiles(map as MapFile, cat, f).issues
  }
  const cases: [string, (m: MapFile) => void, RegExp, MapFiles?][] = [
    ['a dem source without its credit', m => delete (m.sources![0] as { credit?: string }).credit, /"credit"/],
    ['a hash that is no hash', m => ((m.sources![0] as { hash?: string }).hash = 'abc'), /sha256/],
    ['a file in a folder', m => ((m.sources![0] as { file?: string }).file = '../x.rdem'), /beside the map/],
    ['a source key it does not know', m => ((m.sources![0] as unknown as Record<string, string>).url = 'x'), /must be/],
    [
      'a file on a source that is not a dem',
      m => m.sources!.push({ id: 'old', kind: 'survey', file: '../x.bin' } as never),
      /dem and scan sources only/,
    ],
    ['a piece that names no dem source', m => (m.features[0].source = 'invented'), /dem sources/],
    ['a map with real relief and no datum', m => delete (m as { datum?: number }).datum, /datum/],
    ['a missing file', () => {}, /not found/, new Map()],
    ['a file that changed', () => {}, /has hash/, files(rdem(81, 81, 5, () => 7))],
    ['a piece past its file', m => (m.features[0].shift = { x: 150, z: 0 }), /past its file/],
    // 200 m of map at 2× reads 400 m of the file, all of it: moved 30 m east, past its edge
    [
      'a scale model past its file',
      m => Object.assign(m.features[0], { scale: 2, shift: { x: 30, z: 0 } }),
      /past its file/,
    ],
    ['a scale below 1', m => (m.features[0].scale = 0.5), /at least 1/],
    ['heights out of range above the datum', m => (m.datum = 700), /leave -100/],
  ]
  for (const [what, edit, msg, f] of cases) {
    it(what, () => {
      const map = base()
      edit(map)
      expect(
        issue(map, f)
          .map(i => i.message)
          .join('; '),
      ).toMatch(msg)
    })
  }
})

describe('M5: the test map, for the sim', () => {
  const { map, layers: L } = layersOf('maps/dem-test.map.json')
  const d = decodeRdem(new Uint8Array(fs.readFileSync(path.join(root, 'maps/austerlitz.rdem'))))
  it('reads the real heights where only the shifted piece lies', () => {
    const sh = map.features.find(f => f.id === 'slope')!.shift as { x: number; z: number }
    for (const [x, z] of [
      [600, 600],
      [-200, 0],
      [800, -900],
    ]) {
      expect(heightOf(L, x, z)).toBeCloseTo(demHeight(d, x + sh.x, z + sh.z) - (map.datum ?? 0), 6)
    }
  })
  it('compiles for the sim', () => {
    const def = engineMap('dem-test', 'maps/dem-test.map.json')
    expect(def.half).toBe(600)
  })
})
