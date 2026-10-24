// The sim compiler (docs/plans/done/m2-sim.md, M2): water levels and depths in the layers, the ruleset's ground
// reading, the valley's compiled data, and the S1e battle played on it.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { layersOf, engineMap, groundCell } from '../maps/engine.ts'
import { heightOf } from '../src/map/apply.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import type { GroundCell } from '../src/rulesets/ground.ts'
import {
  loadSimData,
  compileRuleset,
  record,
  play,
  hex,
  makeWorld,
  attachScenario,
  advanceTick,
  menOf,
  M_TICK,
} from '../src/sim/index.ts'
import { s1eBattle } from '../src/scenarios/s1e-battle.ts'
import { battleData } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { m2Valley } from '../src/scenarios/m2-valley.ts'
import { root, longIt } from './fx.ts'

const { map, layers: L } = layersOf('maps/valley.map.json')
const def = engineMap('valley', 'maps/valley.map.json')
const cellAt = (x: number, z: number) => Math.floor((z - L.z0) / L.cell) * L.nx + Math.floor((x - L.x0) / L.cell)
const depthAt = (x: number, z: number) => L.depth[cellAt(x, z)] / 1000
const classAt = (x: number, z: number) =>
  def.classes[def.fine.classAt(Math.floor((x + def.half) / 2), Math.floor((z + def.half) / 2))]
// the brook's centre line (maps/battlefield.ts)
const sz = (x: number) => 30 * Math.sin(x / 95) + 14 * Math.sin(x / 37 + 1)

describe('M2: water in the layers', () => {
  it("the brook's level never rises downstream; its cells hold water but at the edges of its fords", () => {
    const s = L.streams.find(t => t.id === 'brook')!
    for (let k = 1; k < s.levels.length; k++) expect(s.levels[k]).toBeLessThanOrEqual(s.levels[k - 1])
    const brook = L.table.findIndex(t => t.id === 'brook') + 1
    const dry: number[] = []
    let cells = 0
    for (let c = 0; c < L.depth.length; c++) {
      if (L.water[c] === brook) {
        cells++
        if (!L.depth[c]) dry.push(L.x0 + ((c % L.nx) + 0.5) * 2)
      }
    }
    expect(cells).toBeGreaterThan(1000)
    expect(dry.length).toBeLessThan(cells / 100)
    // a ford's shallow margin, or the extent's first cell
    for (const x of dry) expect(Math.min(Math.abs(x + 260), Math.abs(x - 330)) < 15 || Math.abs(x) > 995).toBe(true)
    for (let x = -980; x <= 980; x += 10) expect(depthAt(x, sz(x))).toBeGreaterThan(0.3) // the centre line, everywhere
  })
  it("a sunken road along a bank does not pull the stream's level down (review round 1)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'map-'))
    const base = {
      format: 1,
      id: 'bank',
      name: 'Bank',
      seed: 1,
      season: 'summer',
      extent: { w: 400, h: 400 },
      play: { w: 160, h: 160 },
    }
    const brook = {
      id: 'brook',
      kind: 'water.stream',
      line: [
        [-200, 0],
        [200, 0],
      ],
      width: 6,
    }
    const hill = { id: 'hill', kind: 'relief.hill', point: [0, 60], height: 6, width: 200 }
    fs.writeFileSync(path.join(tmp, 'a.map.json'), JSON.stringify({ ...base, features: [hill, brook] }))
    fs.writeFileSync(
      path.join(tmp, 'b.map.json'),
      JSON.stringify({
        ...base,
        features: [
          hill,
          brook,
          {
            id: 'lane',
            kind: 'way.road.sunken',
            line: [
              [-200, 5],
              [200, 5],
            ],
            cut: 2.5,
          },
        ],
      }),
    )
    const la = layersOf(path.join(tmp, 'a.map.json')).layers.streams[0].levels
    const lb = layersOf(path.join(tmp, 'b.map.json')).layers.streams[0].levels
    expect([...lb]).toEqual([...la])
  })
  it('the bridge is a deck level with its banks, not the channel bed (review round 1)', () => {
    const bridge = L.table.findIndex(t => t.id === 'bridge') + 1
    const deckCells = [...L.built.keys()].filter(c => L.built[c] === bridge)
    expect(deckCells.length).toBeGreaterThan(5)
    const x = L.x0 + ((deckCells[0] % L.nx) + 0.5) * 2
    const z = L.z0 + (Math.floor(deckCells[0] / L.nx) + 0.5) * 2
    const s = L.streams.find(t => t.id === 'brook')!
    expect(heightOf(L, x, z)).toBeGreaterThan(Math.max(...s.levels) - 1) // above the water, not 0.8 m under it
  })
  it('the depths are as designed: about 0.8 m in the channel, 0.5 at the fords, 1.4 in the pools, shallower at the banks', () => {
    // mid-channel, between the fords
    expect(depthAt(100, sz(100))).toBeGreaterThan(0.6)
    expect(depthAt(100, sz(100))).toBeLessThan(0.85)
    for (const x of [-260, 330]) {
      expect(depthAt(x, sz(x))).toBeGreaterThan(0.35)
      expect(depthAt(x, sz(x))).toBeLessThanOrEqual(0.55)
    }
    // a pool out on the eastern flank (|x| > 420 and sin(x / 30) > 0, sampled every 20 m: the first runs 440–460),
    // and one on the western flank (−560 to −480; sin is odd, so the pools are not mirrored)
    for (const pool of [450, -520]) {
      expect(depthAt(pool, sz(pool))).toBeGreaterThan(1.2)
      expect(depthAt(pool, sz(pool))).toBeLessThanOrEqual(1.4)
    }
    // the bank is shallower than the middle
    expect(depthAt(100, sz(100) + 2.5)).toBeLessThan(depthAt(100, sz(100)))
  })
})

describe("M2: the ruleset's reading of the ground", () => {
  const dry: GroundCell = { water: 0, nogo: false, go: false }
  it('each kind of cell classifies as designed, in order', () => {
    expect(classifyNapoleonic({ ...dry, built: { bridge: true, building: false }, water: 0.8 })).toBe('bridge')
    expect(classifyNapoleonic({ ...dry, water: 0.5, way: {} })).toBe('water')
    expect(classifyNapoleonic({ ...dry, way: {} })).toBe('road')
    expect(classifyNapoleonic({ ...dry, barrier: { crossing: 'climb' } })).toBe('hedge')
    expect(classifyNapoleonic({ ...dry, built: { bridge: false, building: true } })).toBe('denseWood')
    expect(classifyNapoleonic({ ...dry, ground: { material: 'peat' } })).toBe('marsh')
    expect(classifyNapoleonic({ ...dry, veg: { growth: 'stand', density: 0.9 } })).toBe('denseWood')
    expect(classifyNapoleonic({ ...dry, veg: { growth: 'stand', density: 0.6 } })).toBe('woods')
    expect(classifyNapoleonic({ ...dry, veg: { growth: 'low', density: 1, stage: 'ploughed' } })).toBe('ploughed')
    expect(classifyNapoleonic({ ...dry, veg: { growth: 'low', density: 1, stage: 'standing', height: 1.3 } })).toBe(
      'crops',
    )
    expect(classifyNapoleonic({ ...dry, ground: { stones: 0.5 } })).toBe('rough')
    expect(classifyNapoleonic(dry)).toBe('open')
    expect(classifyNapoleonic({ ...dry, nogo: true })).toBe('water')
    // the overrides come first
    expect(classifyNapoleonic({ ...dry, nogo: true, built: { bridge: true, building: false } })).toBe('water')
    expect(classifyNapoleonic({ ...dry, go: true, water: 1.5 })).toBe('open')
  })
  it("the valley's cells read as the map says", () => {
    expect(classAt(-380, -190)).toBe('denseWood') // the western wood's core
    expect(classAt(-380, -250)).toBe('woods') // its edge
    expect(classAt(-90, -180)).toBe('crops')
    expect(classAt(220, -200)).toBe('ploughed')
    expect(classAt(-90, -137)).toBe('hedge')
    expect(classAt(-110, sz(-110) + 15)).toBe('marsh')
    expect(classAt(60 + 12 * Math.sin(500 / 130), 500)).toBe('road')
    expect(classAt(0, sz(0))).toBe('water')
    expect(classAt(580, -180)).toBe('rough')
    expect(classAt(-600, -600)).toBe('open')
    // the bridge: where the road crosses the brook
    const hit = [...Array(200).keys()]
      .map(k => -100 + k)
      .find(z => classAt(60 + 12 * Math.sin(z / 130), z) === 'bridge')
    expect(hit).toBeDefined()
    expect(groundCell(L, cellAt(0, sz(0))).water).toBeGreaterThan(0)
    expect(map.id).toBe('valley')
  })
})

describe('M2: the compiled valley in the sim', () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(root, 'data', 'valley.simdata')))
  it('loads at its pinned data version, with 2 m heights, 8 m cost cells and 2 m classes', () => {
    const d = loadSimData(bytes, MAP_VERSIONS.valley)
    expect([d.height.cell, d.cost.cell, d.fine.cell]).toEqual([2, 8, 2])
    expect([d.height.nx, d.cost.nx, d.fine.nx]).toEqual([601, 150, 600])
    expect([d.height.x0, d.fine.x0]).toEqual([-600, -599]) // one fine node per cell, at its centre
    expect(d.classes).toEqual(Object.keys(napoleonic.terrain))
  })
  it('a play area off the centre of a non-square extent compiles in the right place (review round 1)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'map-'))
    const file = path.join(tmp, 'wide.map.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        format: 1,
        id: 'wide',
        name: 'Wide',
        seed: 1,
        season: 'summer',
        extent: { w: 400, h: 240 },
        play: { w: 160, h: 160 },
        features: [{ id: 'pond', kind: 'water.pond', circle: [[0, 50], 12] }],
      }),
    )
    const m = engineMap('wide', file)
    const at = (x: number, z: number) =>
      m.classes[m.fine.classAt(Math.floor((x + m.half) / 2), Math.floor((z + m.half) / 2))]
    expect(at(0, 50)).toBe('water')
    expect(at(0, -50)).toBe('open')
  })
  const goldenFile = path.join(root, 'test', 'golden', 'm2-valley.json')
  const TICKS = 12000
  longIt(
    'ten minutes of the battle end close to the same battle on the original battlefield, with finite state',
    () => {
      const cr = compileRuleset(napoleonic)
      const run = (d: typeof battleData, sc: typeof s1eBattle) => {
        const w = makeWorld(d, cr, 3)
        attachScenario(w, sc)
        sc.setup(w)
        while (w.meta[M_TICK] < TICKS) advanceTick(w)
        for (const a of [w.f.x, w.f.z, w.f.heading]) {
          for (let i = 0; i < 16; i++) expect(Number.isFinite(a[i])).toBe(true)
        }
        return [...Array(16).keys()].map(i => ({ x: w.f.x[i], z: w.f.z[i], men: menOf(w, i) }))
      }
      const a = run(battleData, s1eBattle)
      const b = run(loadSimData(bytes, MAP_VERSIONS.valley), m2Valley)
      const total = (r: typeof a, s: number) => r.slice(s * 8, s * 8 + 8).reduce((t, u) => t + u.men, 0)
      for (const s of [0, 1]) expect(Math.abs(total(b, s) - total(a, s))).toBeLessThan(0.03 * total(a, s))
      for (let i = 0; i < 16; i++) expect(Math.hypot(b[i].x - a[i].x, b[i].z - a[i].z)).toBeLessThan(25)
    },
  )
  longIt(
    'ten minutes of the S1e battle on the valley give the committed golden hashes, and the replay reproduces them',
    () => {
      const d = loadSimData(bytes, MAP_VERSIONS.valley)
      const cr = compileRuleset(napoleonic)
      const run = record(d, cr, m2Valley, 3, TICKS, () => {})
      const hashes = run.hashes.map(p => [p.tick, hex(p.hash)])
      if (process.env.UPDATE_GOLDEN) {
        fs.writeFileSync(
          goldenFile,
          JSON.stringify({ dataVersion: hex(d.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n',
        )
      }
      const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
      expect([golden.dataVersion, golden.ruleset]).toEqual([hex(d.version), hex(cr.hash)])
      expect(hashes).toEqual(golden.hashes)
      expect(play(run.replay, d, cr, m2Valley, run.hashes)).toBeNull()
    },
  )
})
