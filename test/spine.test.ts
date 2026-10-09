import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { makeWorld, issue, advanceTick, makeHandle, KIND_FORMATION, formationSlot, makePool, allocNode, freeNode, freeList,
  serialize, deserialize, hashWorld, play, loadSimData, DataVersionMismatch, NonFiniteState, M_TICK, hex } from '../src/sim/index.ts'
import { s0Fight } from '../src/scenarios/s0-fight.ts'
import { simData, dataBytes, recordS0, goldenFile, S0_TICKS } from './sim-data.ts'
import { buildSimData } from '../tools/build-sim-data.ts'
import { formationField } from '../maps/formation-field.ts'

const data = simData()
const run = recordS0(data)

describe('S0 acceptance', () => {
  it('1. the scripted fight gives the committed golden hashes', () => {
    const hashes = run.hashes.map(h => [h.tick, hex(h.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(data.version), ticks: S0_TICKS, hashes }, null, 0) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect(golden.dataVersion).toBe(hex(data.version))
    expect(hashes).toEqual(golden.hashes)
    expect(hashes.length).toBe(S0_TICKS / 20)
  })
  it('the fight is a fight: blocks lose men, one is reaped, commands were dropped as specified', () => {
    // replaying with a world we keep, to look at it
    const w = makeWorld(data, run.replay.seed); s0Fight.setup(w)
    let k = 0, dropped = 0
    while (w.meta[M_TICK] < S0_TICKS) {
      while (k < run.replay.log.length && run.replay.log[k].tick === w.meta[M_TICK] + 1) issue(w, run.replay.log[k++].cmd)
      dropped += advanceTick(w).dropped.length
    }
    const men = [...w.f.men].slice(0, 9), alive = [...w.f.alive].slice(0, 9)
    expect(men.reduce((a, b) => a + b, 0)).toBeLessThan(860)
    expect(alive.filter(a => !a).length).toBeGreaterThan(0)
    expect(dropped).toBe(1)   // the order to the destroyed reinforcement
  })
  it('2. a replay from the log reproduces every hash; a changed command is caught at its tick', () => {
    expect(play(run.replay, data, s0Fight, run.hashes)).toBeNull()
    const isKill25 = (c: (typeof run.replay.log)[number]['cmd']) => c.type === 'debug-kill' && c.men === 25
    const log = run.replay.log.map(s => ({ ...s, cmd: s.cmd.type === 'debug-kill' && isKill25(s.cmd) ? { ...s.cmd, men: 26 } : s.cmd }))
    const bad = play({ ...run.replay, log }, data, s0Fight, run.hashes)
    expect(bad).not.toBeNull()
    const killTick = run.replay.log.find(s => isKill25(s.cmd))!.tick
    expect(bad!.tick).toBe(Math.ceil(killTick / 20) * 20)
    expect(bad!.section).toBe('formations')
  })
  it('3. save at tick 1800 with a command pending, load into a fresh world, continue: the same hashes', () => {
    const w = makeWorld(data, run.replay.seed); s0Fight.setup(w)
    let k = 0
    const due = (world: typeof w) => { while (k < run.replay.log.length && run.replay.log[k].tick === world.meta[M_TICK] + 1) issue(world, run.replay.log[k++].cmd) }
    while (w.meta[M_TICK] < 1800) { due(w); advanceTick(w) }
    due(w)   // the order logged at tick 1800 is now pending: it must cross the save
    expect(w.pending.length).toBeGreaterThan(0)
    const loaded = deserialize(serialize(w), data)
    expect(hashWorld(loaded)).toBe(hashWorld(w))
    const after: number[] = []
    for (let first = true; loaded.meta[M_TICK] < S0_TICKS; first = false) { if (!first) due(loaded); const r = advanceTick(loaded); if (r.hash !== null) after.push(r.hash) }
    expect(after).toEqual(run.hashes.filter(h => h.tick > 1800).map(h => h.hash))
  })
  it('6. the data version: another map gives another version, and old saves and replays refuse it', async () => {
    const map = await formationField(), moved = { ...map, heightAt: (x: number, z: number) => map.heightAt(x, z) + 0.01 }
    const other = loadSimData(buildSimData(moved))
    expect(other.version).not.toBe(data.version)
    expect(() => loadSimData(buildSimData(moved), data.version)).toThrow(DataVersionMismatch)
    const w = makeWorld(data, 1); s0Fight.setup(w); advanceTick(w)
    expect(() => deserialize(serialize(w), other)).toThrow(DataVersionMismatch)
    expect(() => play(run.replay, other, s0Fight, run.hashes)).toThrow(DataVersionMismatch)
    expect(loadSimData(dataBytes(), data.version).version).toBe(data.version)
  })
})

describe('S0 units', () => {
  it('a replay refuses a log out of order or past its end, and another scenario', () => {
    const log = [...run.replay.log]; [log[0], log[1]] = [log[1], log[0]]
    expect(play({ ...run.replay, log }, data, s0Fight, run.hashes)?.section).toBe('command log')
    expect(play({ ...run.replay, log: [...run.replay.log, { ...run.replay.log[0], tick: S0_TICKS + 5 }] }, data, s0Fight, run.hashes)?.section).toBe('command log')
    expect(() => play(run.replay, data, { ...s0Fight, name: 'other' }, run.hashes)).toThrow()
  })
  it('truncated sim data is refused', () => {
    const b = dataBytes(); expect(() => loadSimData(b.slice(0, b.length - 10))).toThrow()
  })
  it('the hash covers every typed array in the world, and the pending commands', () => {
    const w = makeWorld(data, 9); s0Fight.setup(w); for (let k = 0; k < 30; k++) advanceTick(w)
    issue(w, { type: 'halt', id: makeHandle(KIND_FORMATION, 0, 0) })
    const base = hashWorld(w), missed: string[] = []
    const arrays = (o: object, prefix: string): string[] => Object.entries(o).flatMap(([k, v]) =>
      ArrayBuffer.isView(v) ? [prefix + k] : v && typeof v === 'object' && !Array.isArray(v) && k !== 'data' ? arrays(v, prefix + k + '.') : [])
    const names = arrays(w, '')
    for (const name of names) {
      const c = deserialize(serialize(w), data), path = name.split('.'), arr = path.reduce((o: any, k) => o[k], c) as Int32Array  // eslint-disable-line @typescript-eslint/no-explicit-any
      arr[0] = arr[0] + 1
      if (hashWorld(c) === base) missed.push(name)
    }
    expect(names.length).toBeGreaterThanOrEqual(17)
    expect(missed).toEqual([])
    const c = deserialize(serialize(w), data); c.pending[0] = { ...c.pending[0], seq: c.pending[0].seq + 1 }
    expect(hashWorld(c)).not.toBe(base)
  })
  it('a stale handle is rejected after its slot is reused', () => {
    const w = makeWorld(data, 3)
    issue(w, { type: 'debug-spawn', side: 0, men: 10, x: 0, z: 0, facing: 0 }); advanceTick(w)
    const h0 = makeHandle(KIND_FORMATION, 0, 0)
    expect(formationSlot(w, h0)).toBe(0)
    issue(w, { type: 'debug-kill', id: h0, men: 10 }); advanceTick(w)   // reaped: generation 1
    issue(w, { type: 'debug-spawn', side: 1, men: 5, x: 1, z: 1, facing: 0 }); advanceTick(w)   // slot 0 again
    expect(formationSlot(w, h0)).toBe(-1)
    expect(formationSlot(w, makeHandle(KIND_FORMATION, 0, 1))).toBe(0)
    issue(w, { type: 'halt', id: h0 })
    expect(advanceTick(w).dropped.map(d => d.reason)).toEqual(['no such formation'])
  })
  it('the pool free list round-trips', () => {
    const p = makePool(4), a = allocNode(p, 1, 2), b = allocNode(p, 3, 4), c = allocNode(p, 5, 6), d = allocNode(p, 7, 8)
    expect([a, b, c, d]).toEqual([0, 1, 2, 3]); expect(allocNode(p, 0, 0)).toBe(-1); expect(p.meta[1]).toBe(4)
    freeNode(p, b); expect(allocNode(p, 9, 9)).toBe(1)
    p.next[0] = 1; p.next[1] = 2; p.next[2] = -1; freeList(p, 0); expect(p.meta[1]).toBe(1)
    expect([allocNode(p, 0, 0), allocNode(p, 0, 0), allocNode(p, 0, 0), allocNode(p, 0, 0)]).toEqual([2, 1, 0, -1])
  })
  it('stamping, quantisation and validation', () => {
    const w = makeWorld(data, 4)
    const s = issue(w, { type: 'debug-spawn', side: 0, men: 10, x: 1.23456, z: -2.0049, facing: 0.123456 })
    expect(s.tick).toBe(1); expect(s.seq).toBe(0)
    expect(s.cmd).toEqual({ type: 'debug-spawn', side: 0, men: 10, x: 1.23, z: -2, facing: 0.12 })
    issue(w, { type: 'debug-spawn', side: 2, men: 10, x: 0, z: 0, facing: 0 })
    issue(w, { type: 'debug-spawn', side: 0, men: 0, x: 0, z: 0, facing: 0 })
    issue(w, { type: 'debug-spawn', side: 0, men: 5, x: 9999, z: 0, facing: 0 })
    issue(w, { type: 'move', id: makeHandle(KIND_FORMATION, 0, 0), points: [[0, 9999]], append: false })
    issue(w, { type: 'move', id: makeHandle(2, 0, 0), points: [[0, 1]], append: false })
    expect(advanceTick(w).dropped.map(d => [d.seq, d.reason])).toEqual([[1, 'no such side'], [2, 'no men'], [3, 'outside the map'], [4, 'waypoint outside the map'], [5, 'no such formation']])
    const later = issue(w, { type: 'halt', id: makeHandle(KIND_FORMATION, 0, 0) })
    expect(later.tick).toBe(2); expect(later.seq).toBe(6)
  })
  it('bad commands are dropped with a reason and change nothing', () => {
    const w = makeWorld(data, 11)
    issue(w, { type: 'debug-spawn', side: 0, men: 10, x: 0, z: 0, facing: 0 }); advanceTick(w)
    const h = makeHandle(KIND_FORMATION, 0, 0)
    issue(w, { type: 'move', id: h, points: [[1, 1], [2, 2]], append: false }); advanceTick(w)
    const route = () => { const r: number[] = []; for (let n = w.f.wpHead[0]; n >= 0; n = w.wp.next[n]) r.push(w.wp.x[n]); return r }
    const before = route(), used = w.wp.meta[1]
    issue(w, { type: 'mvoe', id: h } as unknown as Parameters<typeof issue>[1])
    issue(w, { type: 'move', id: h, points: Array.from({ length: 65 }, (_, i) => [i, 0] as [number, number]), append: false })
    w.wp.meta[0] = -1; w.wp.meta[1] = w.wp.x.length   // the pool is full
    issue(w, { type: 'move', id: h, points: [[3, 3], [4, 4], [5, 5]], append: false })
    const stale = issue(w, { type: 'halt', id: h }); stale.tick = 1
    expect(advanceTick(w).dropped.map(d => d.reason)).toEqual(['unknown command', 'too many waypoints', 'waypoint pool full', 'stale tick'])
    expect(route()).toEqual(before); expect(w.pending.length).toBe(0)
    w.wp.meta[1] = used
  })
  it('a pending command crosses a save unchanged (a side of 256 stays invalid)', () => {
    const w = makeWorld(data, 12); issue(w, { type: 'debug-spawn', side: 256, men: 10, x: 0, z: 0, facing: 0 })
    const c = deserialize(serialize(w), data)
    expect(advanceTick(w).dropped.map(d => d.reason)).toEqual(['no such side'])
    expect(advanceTick(c).dropped.map(d => d.reason)).toEqual(['no such side'])
  })
  it('the finite-state assert fires on a poisoned state', () => {
    const w = makeWorld(data, 5); issue(w, { type: 'debug-spawn', side: 0, men: 10, x: 0, z: 0, facing: 0 }); advanceTick(w)
    w.f.x[0] = NaN
    expect(() => advanceTick(w)).toThrow(NonFiniteState)
  })
  it('7. budget: time per tick of the fight (measured, not asserted)', () => {
    const w = makeWorld(data, 6); s0Fight.setup(w)
    const t0 = process.hrtime.bigint(); for (let k = 0; k < S0_TICKS; k++) advanceTick(w)
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / S0_TICKS
    console.log(`S0 fight: ${ms.toFixed(4)} ms per tick (target ≤ 2 ms, sim-design §16)`)
    expect(ms).toBeGreaterThan(0)
  })
})
