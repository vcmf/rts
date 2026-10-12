// The sim compiler (docs/plans/active/m2-sim.md, M2): water levels and depths in the layers, the ruleset's ground
// reading, the valley's compiled data, and the S1e battle played on it.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { layersOf, engineMap, groundCell } from '../maps/engine.ts'
import { classifyNapoleonic } from '../src/rulesets/napoleonic-ground.ts'
import type { GroundCell } from '../src/rulesets/ground.ts'
import { loadSimData, compileRuleset, record, play, hex } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { m2Valley } from '../src/scenarios/m2-valley.ts'
import { root, longIt } from './fx.ts'

const { map, layers: L } = layersOf('maps/valley.map.json')
const def = engineMap('valley', 'maps/valley.map.json')
const cellAt = (x: number, z: number) => Math.floor((z - L.z0) / L.cell) * L.nx + Math.floor((x - L.x0) / L.cell)
const depthAt = (x: number, z: number) => L.depth[cellAt(x, z)] / 1000
const classAt = (x: number, z: number) => def.classes[def.fine.classAt(Math.floor((x + def.half) / 2), Math.floor((z + def.half) / 2))]
const sz = (x: number) => 30 * Math.sin(x / 95) + 14 * Math.sin(x / 37 + 1)   // the brook's centre line (maps/battlefield.ts)

describe('M2: water in the layers', () => {
  it("the brook's level never rises downstream, and no water cell is below 0 deep", () => {
    const s = L.streams.find(t => t.id === 'brook')!
    for (let k = 1; k < s.levels.length; k++) expect(s.levels[k]).toBeLessThanOrEqual(s.levels[k - 1])
    for (let c = 0; c < L.depth.length; c++) if (L.water[c]) expect(L.depth[c]).toBeGreaterThanOrEqual(0)
  })
  it('the depths are as designed: about 0.8 m in the channel, 0.5 at the fords, 1.4 in the pools, shallower at the banks', () => {
    // mid-channel, between the fords
    expect(depthAt(100, sz(100))).toBeGreaterThan(0.6); expect(depthAt(100, sz(100))).toBeLessThan(0.85)
    for (const x of [-260, 330]) { expect(depthAt(x, sz(x))).toBeGreaterThan(0.35); expect(depthAt(x, sz(x))).toBeLessThanOrEqual(0.55) }
    // a pool out on the eastern flank (|x| > 420 and sin(x / 30) > 0, sampled every 20 m: the first runs 440–460),
    // and one on the western flank (−560 to −480; sin is odd, so the pools are not mirrored)
    for (const pool of [450, -520]) { expect(depthAt(pool, sz(pool))).toBeGreaterThan(1.2); expect(depthAt(pool, sz(pool))).toBeLessThanOrEqual(1.4) }
    // the bank is shallower than the middle
    expect(depthAt(100, sz(100) + 2.5)).toBeLessThan(depthAt(100, sz(100)))
  })
})

describe("M2: the ruleset's reading of the ground", () => {
  const dry: GroundCell = { water: 0, nogo: false }
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
    expect(classifyNapoleonic({ ...dry, veg: { growth: 'low', density: 1, stage: 'standing', height: 1.3 } })).toBe('crops')
    expect(classifyNapoleonic({ ...dry, ground: { stones: 0.5 } })).toBe('rough')
    expect(classifyNapoleonic(dry)).toBe('open')
    expect(classifyNapoleonic({ ...dry, nogo: true })).toBe('water')
  })
  it("the valley's cells read as the map says", () => {
    expect(classAt(-380, -190)).toBe('denseWood')    // the western wood's core
    expect(classAt(-380, -250)).toBe('woods')        // its edge
    expect(classAt(-90, -180)).toBe('crops')
    expect(classAt(220, -200)).toBe('ploughed')
    expect(classAt(-90, -137)).toBe('hedge')
    expect(classAt(-110, sz(-110) + 15)).toBe('marsh')
    expect(classAt(60 + 12 * Math.sin(500 / 130), 500)).toBe('road')
    expect(classAt(0, sz(0))).toBe('water')
    expect(classAt(600, 160 + 20 - 380)).toBe('rough')
    expect(classAt(-600, -600)).toBe('open')
    // the bridge: where the road crosses the brook
    const hit = [...Array(200).keys()].map(k => -100 + k).find(z => classAt(60 + 12 * Math.sin(z / 130), z) === 'bridge')
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
    expect([d.height.nx, d.cost.nx, d.fine.nx]).toEqual([601, 150, 601])
    expect(d.classes).toEqual(Object.keys(napoleonic.terrain))
  })
  const goldenFile = path.join(root, 'test', 'golden', 'm2-valley.json'), TICKS = 12000
  longIt('ten minutes of the S1e battle on the valley give the committed golden hashes, and the replay reproduces them', () => {
    const d = loadSimData(bytes, MAP_VERSIONS.valley), cr = compileRuleset(napoleonic), run = record(d, cr, m2Valley, 3, TICKS, () => {})
    const hashes = run.hashes.map(p => [p.tick, hex(p.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(d.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect([golden.dataVersion, golden.ruleset]).toEqual([hex(d.version), hex(cr.hash)])
    expect(hashes).toEqual(golden.hashes)
    expect(play(run.replay, d, cr, m2Valley, run.hashes)).toBeNull()
  })
})
