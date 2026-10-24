// The spine with formations: golden hashes, replays, saves, hash coverage, commands, data and ruleset
// versions, era genericity (docs/plans/done/s1a-formations-on-spine.md, acceptance 2–4).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeWorld, issue, advanceTick, makeHandle, KIND_FORMATION, formationSlot,
  serialize, deserialize, hashWorld, play, record, loadSimData, compileRuleset, DataVersionMismatch, NonFiniteState, M_TICK, hex, MAX_POINTS, menOf,
  type Ruleset, type Command } from '../src/sim/index.ts'
import { s1aDrill, s1aOrders } from '../src/scenarios/s1a-drill.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { data, shipped as cr, dataBytes, Sim } from './fx.ts'
import { buildSimData } from '../tools/build-sim-data.ts'
import { formationField } from '../maps/formation-field.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const goldenFile = path.join(root, 'test', 'golden', 's1a-drill.json')
const TICKS = 6000   // 5 minutes
const run = record(data, cr, s1aDrill, 20261009, TICKS, s1aOrders)

describe('S1a acceptance: golden hashes, replays, saves', () => {
  it('the drill gives the committed golden hashes', () => {
    const hashes = run.hashes.map(h => [h.tick, hex(h.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(data.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect([golden.dataVersion, golden.ruleset]).toEqual([hex(data.version), hex(cr.hash)])
    expect(hashes).toEqual(golden.hashes)
  })
  it('the drill does what it says: changes, a halt at the stream, Face about, Retire, casualties, a dropped order', () => {
    const w = makeWorld(data, cr, run.replay.seed); s1aDrill.setup(w)
    let k = 0; const dropped: string[] = [], statuses = new Set<number>(), shapes = new Set<number>()
    while (w.meta[M_TICK] < TICKS) {
      while (k < run.replay.log.length && run.replay.log[k].tick === w.meta[M_TICK] + 1) issue(w, run.replay.log[k++].cmd)
      for (const d of advanceTick(w).dropped) dropped.push(d.reason)
      statuses.add(w.f.status[1]); shapes.add(w.f.shape[0]); if (w.f.trans[0]) shapes.add(w.f.tShape[0])
    }
    expect(dropped).toEqual(['no such formation'])
    expect(statuses.has(1)).toBe(true)              // B halted at the stream
    expect(shapes.size).toBeGreaterThanOrEqual(4)   // A: line, column, square, march
    expect(menOf(w, 0)).toBe(387)
  })
  it('a replay from the log reproduces every hash; a changed command is caught at the next hash point', () => {
    expect(play(run.replay, data, cr, s1aDrill, run.hashes)).toBeNull()
    const log = run.replay.log.map(s => s.cmd.type === 'debug-kill' ? { ...s, cmd: { ...s.cmd, men: 14 } } : s)
    const bad = play({ ...run.replay, log }, data, cr, s1aDrill, run.hashes)
    const t = run.replay.log.find(s => s.cmd.type === 'debug-kill')!.tick
    expect(bad?.tick).toBe(Math.ceil(t / 20) * 20); expect(bad?.section).toBe('rng')   // one more draw: the RNG section differs first
  })
  it('save in the middle of a change with an order pending, load, continue: the same hashes', () => {
    const w = makeWorld(data, cr, run.replay.seed); s1aDrill.setup(w)
    let k = 0
    const due = (x: typeof w) => { while (k < run.replay.log.length && run.replay.log[k].tick === x.meta[M_TICK] + 1) issue(x, run.replay.log[k++].cmd) }
    while (w.meta[M_TICK] < 2210) { due(w); advanceTick(w) }
    due(w); expect(w.pending.length).toBe(1); expect(w.f.trans[0]).toBe(1)   // column forming, square pending
    const loaded = deserialize(serialize(w), data, cr)
    expect(hashWorld(loaded)).toBe(hashWorld(w))
    const after: number[] = []
    for (let first = true; loaded.meta[M_TICK] < TICKS; first = false) { if (!first) due(loaded); const r = advanceTick(loaded); if (r.hash !== null) after.push(r.hash) }
    expect(after).toEqual(run.hashes.filter(h => h.tick > 2210).map(h => h.hash))
  })
  it('the hash covers every typed array in the world, and the pending commands', () => {
    const w = makeWorld(data, cr, 9); s1aDrill.setup(w); for (let k = 0; k < 600; k++) advanceTick(w)
    issue(w, { type: 'halt', id: makeHandle(KIND_FORMATION, 0, 0) })
    const base = hashWorld(w), missed: string[] = []
    const arrays = (o: object, p: string): string[] => Object.entries(o).flatMap(([k, v]) =>
      ArrayBuffer.isView(v) ? [p + k] : v && typeof v === 'object' && !Array.isArray(v) && !['data', 'cr', 'terrain', 'scratch'].includes(k) ? arrays(v, p + k + '.') : [])
    const names = arrays(w, '')
    for (const name of names) {
      const c = deserialize(serialize(w), data, cr), arr = name.split('.').reduce((o: Record<string, unknown>, k) => o[k] as Record<string, unknown>, c as unknown as Record<string, unknown>) as unknown as Int32Array
      arr[0] = arr[0] + 1; if (hashWorld(c) === base) missed.push(name)
    }
    expect(names.length).toBeGreaterThanOrEqual(50); expect(missed).toEqual([])
    const c = deserialize(serialize(w), data, cr); c.pending[0] = { ...c.pending[0], seq: c.pending[0].seq + 1 }
    expect(hashWorld(c)).not.toBe(base)
  })
  it('a replay refuses a log out of order or past its end, another scenario, and another ruleset', () => {
    const log = [...run.replay.log]; [log[0], log[1]] = [log[1], log[0]]
    expect(play({ ...run.replay, log }, data, cr, s1aDrill, run.hashes)?.section).toBe('command log')
    expect(play({ ...run.replay, log: [...run.replay.log, { ...run.replay.log[0], tick: TICKS + 5 }] }, data, cr, s1aDrill, run.hashes)?.section).toBe('command log')
    expect(() => play(run.replay, data, cr, { ...s1aDrill, name: 'other' }, run.hashes)).toThrow()
    const other = compileRuleset({ ...napoleonic, faceTime: 4 })
    expect(() => play(run.replay, data, other, s1aDrill, run.hashes)).toThrow(DataVersionMismatch)
    const w = makeWorld(data, cr, 1); s1aDrill.setup(w); advanceTick(w)
    expect(() => deserialize(serialize(w), data, other)).toThrow(DataVersionMismatch)
  })
})

describe('commands and handles', () => {
  it('a stale handle is rejected after its slot is reused', () => {
    const s = new Sim(3), h0 = s.spawn(0, 0, 0, 'line', 10)
    s.order({ type: 'debug-kill', id: h0, men: 10 })   // reaped: generation 1
    const h1 = s.spawn(1, 1, 0, 'column', 5)
    expect(h1).not.toBe(h0); expect(formationSlot(s.w, h0)).toBe(-1); expect(s.slot(h1)).toBe(0)
    s.dropped.length = 0; s.order({ type: 'halt', id: h0 }); expect(s.dropped.map(d => d.reason)).toEqual(['no such formation'])
  })
  it('stamping, quantisation and validation; bad commands change nothing', () => {
    const w = makeWorld(data, cr, 4)
    const s = issue(w, { type: 'debug-spawn', side: 0, x: 1.23456, z: -2.0049, heading: 0.123456, shape: 'line', men: 10 })
    expect([s.tick, s.seq]).toEqual([1, 0])
    expect(s.cmd).toEqual({ type: 'debug-spawn', side: 0, x: 1.23, z: -2, heading: 0.1235, shape: 'line', men: 10, quality: -1, fire: 'at will', unit: '' })   // -1: the ruleset's quality; '': the first unit type
    const h = makeHandle(KIND_FORMATION, 0, 0)
    const bad: Command[] = [
      { type: 'debug-spawn', side: 2, x: 0, z: 0, heading: 0, shape: 'line', men: 10 },
      { type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'phalanx', men: 10 },
      { type: 'debug-spawn', side: 0, x: 9999, z: 0, heading: 0, shape: 'line', men: 10 },
      { type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'line', men: 500 },
      { type: 'move', id: h, points: [[0, 9999]], append: false },
      { type: 'move', id: h, points: Array.from({ length: MAX_POINTS + 1 }, (_, k) => [k, 0] as [number, number]), append: false },
      { type: 'form', id: h, shape: 'wedge' },
      { type: 'style', id: h, preset: 'reckless' },
      { type: 'wheel', id: h, angle: 0 },
      { type: 'retire', id: h, metres: -5 },
    ]
    for (const c of bad) issue(w, c)
    const stale = issue(w, { type: 'halt', id: h }); stale.tick = 0
    const r = advanceTick(w)
    expect(r.dropped.map(d => d.reason)).toEqual(['no such side', 'no such shape', 'outside the map', 'no room for those men', 'waypoint outside the map',
      'too many waypoints', 'no such shape', 'no such order preset', 'no such wheel', 'no such retreat', 'stale tick'])
    expect(w.f.ordHead[0]).toBe(-1); expect(w.pending.length).toBe(0)
  })
  it('a pending command crosses a save unchanged', () => {
    const w = makeWorld(data, cr, 12); issue(w, { type: 'debug-spawn', side: 256, x: 0, z: 0, heading: 0, shape: 'line', men: 10 })
    const c = deserialize(serialize(w), data, cr)
    expect(advanceTick(w).dropped.map(d => d.reason)).toEqual(['no such side'])
    expect(advanceTick(c).dropped.map(d => d.reason)).toEqual(['no such side'])
  })
  it('the finite-state assert fires on a poisoned state', () => {
    const s = new Sim(5), h = s.spawn(0, 0, 0)
    s.w.f.x[s.slot(h)] = NaN
    expect(() => s.tick()).toThrow(NonFiniteState)
  })
  it('a malformed move is dropped, not thrown, and the sequence stays in step', () => {
    const w = makeWorld(data, cr, 13); issue(w, { type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'line', men: 10 }); advanceTick(w)
    const h = makeHandle(KIND_FORMATION, 0, 0)
    const a = issue(w, { type: 'move', id: h, points: null, append: false } as unknown as Command)
    const b = issue(w, { type: 'move', id: h, points: [[1, 'x']], append: false } as unknown as Command)
    expect(b.seq).toBe(a.seq + 1)
    expect(advanceTick(w).dropped.map(d => d.reason)).toEqual(['malformed waypoints', 'malformed waypoints'])
  })
})

describe('data and ruleset versions', () => {
  it('another map gives another version, refused by saves, replays and the loader; truncated data is refused', async () => {
    const map = await formationField(), moved = { ...map, heightAt: (x: number, z: number) => map.heightAt(x, z) + 0.01 }
    const other = loadSimData(buildSimData(moved))
    expect(other.version).not.toBe(data.version)
    expect(() => loadSimData(buildSimData(moved), data.version)).toThrow(DataVersionMismatch)
    const w = makeWorld(data, cr, 1); s1aDrill.setup(w); advanceTick(w)
    expect(() => deserialize(serialize(w), other, cr)).toThrow(DataVersionMismatch)
    expect(() => play(run.replay, other, cr, s1aDrill, run.hashes)).toThrow(DataVersionMismatch)
    const b = dataBytes(); expect(() => loadSimData(b.slice(0, b.length - 10))).toThrow()
  })
})

describe('era genericity (decision 0015)', () => {
  it('src/sim/ names no unit type, shape, pace, preset or terrain class of the Napoleonic ruleset', () => {
    const dir = path.join(root, 'src', 'sim'), words = new Set([...Object.keys(napoleonic.types), ...Object.values(napoleonic.types).flatMap(u => Object.keys(u.formations)), ...Object.keys(napoleonic.pace), ...Object.keys(napoleonic.orders), ...Object.keys(napoleonic.terrain), ...Object.keys(napoleonic.q.ordinary)])
    const hits: string[] = []
    for (const f of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      // every word inside every string literal ('…', "…", `…`), so an era name inside a message counts too
      for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) for (const word of m[2].split(/[^A-Za-z]+/)) if (words.has(word)) hits.push(`${f}: '${word}' in ${m[0].slice(0, 60)}`)
    }
    expect(hits).toEqual([])
  })
  it('another era: a two-company phalanx ruleset with its own shapes, paces and presets drills on the same engine', () => {
    const rs: Ruleset = {
      ...napoleonic, name: 'test: antiquity',
      types: { hoplites: {
        geometry: { companies: 2, files: 8, ranks: 4, fileSpacing: 0.9, rankSpacing: 1.0, minSpacing: 0.6, accordionGap: 0.7, bins: 3 },
        formations: {
          phalanx: { kind: 'line', pace: 'slow', closeAcross: true, place: g => [0, 1].map(c => ({ x: (c - 0.5) * g.files * g.fileSpacing, z: 0, rot: 0, face: 0 })) },
          files: { kind: 'column', pace: 'slow', trail: true, place: g => [0, 1].map(c => ({ x: (g.ranks - 1) * g.rankSpacing / 2, z: -c * (g.files * g.fileSpacing + 1), rot: -Math.PI / 2, face: 0 })) },
        },
        changeTime: { 'phalanx>files': 25, 'files>phalanx': 45 }, defaultChangeTime: 40, start: 'phalanx', fires: false, figure: 'foot',
      } },
      pace: { slow: 0.8 }, q: { slow: { open: 1.2, light: 1.1, hard: 1.0 } },
      start: { orders: 'steady' },
      orders: { steady: { Lmax: 2, Lmean: 0.7, tau: 4 } },
    }
    const s = new Sim(7, rs), h = s.spawn(-100, -60, 0, 'phalanx', 60)
    s.order({ type: 'move', id: h, points: [[-100, -30]], append: false }); s.until(() => s.busy(h), 120)
    expect(Math.hypot(s.x(h) + 100, s.z(h) + 30)).toBeLessThan(0.5)
    s.order({ type: 'form', id: h, shape: 'files' }); expect(Math.abs(s.until(() => s.busy(h), 60) - 25)).toBeLessThanOrEqual(0.1)
    s.order({ type: 'move', id: h, points: [[-60, -30]], append: false }); s.until(() => s.busy(h), 120)
    s.order({ type: 'face', id: h }); s.advance(5)
    expect(s.status(h)).toBe(''); expect(s.men(h)).toBe(60); expect(s.places(h).length).toBe(60)
    expect(compileRuleset(rs).hash).not.toBe(cr.hash)
  })
})
