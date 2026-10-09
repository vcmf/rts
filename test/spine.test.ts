import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { makeWorld, issue, advanceTick, makeHandle, KIND_FORMATION, formationSlot, makePool, allocNode, freeNode, freeList,
  serialize, deserialize, hashWorld, play, loadSimData, DataVersionMismatch, NonFiniteState, M_TICK, hex, type HashPoint } from '../src/sim/index.ts'
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
    const w = makeWorld(data, run.replay.seed); s0Fight(w)
    let k = 0, dropped = 0
    while (w.meta[M_TICK] < S0_TICKS) {
      while (k < run.replay.log.length && run.replay.log[k].tick === w.meta[M_TICK] + 1) issue(w, run.replay.log[k++].cmd)
      dropped += advanceTick(w).dropped.length
    }
    const men = [...w.f.men].slice(0, 9), alive = [...w.f.alive].slice(0, 9)
    expect(men.reduce((a, b) => a + b, 0)).toBeLessThan(860)
    expect(alive.filter(a => !a).length).toBeGreaterThan(0)
    expect(dropped).toBe(0)   // every logged order is valid when it lands
  })
  it('2. a replay from the log reproduces every hash; a changed command is caught at its tick', () => {
    expect(play(run.replay, data, s0Fight, run.hashes)).toBeNull()
    const log = run.replay.log.map(s => ({ ...s, cmd: s.cmd.type === 'debug-kill' ? { ...s.cmd, men: s.cmd.men + 1 } : s.cmd }))
    const bad = play({ ...run.replay, log }, data, s0Fight, run.hashes)
    expect(bad).not.toBeNull()
    const killTick = run.replay.log.find(s => s.cmd.type === 'debug-kill')!.tick
    expect(bad!.tick).toBe(Math.ceil(killTick / 20) * 20)
    expect(bad!.section).toBe('formations')
  })
  it('3. save at tick 1800, load into a fresh world, continue: the same hashes', () => {
    const w = makeWorld(data, run.replay.seed); s0Fight(w)
    let k = 0
    const step = (world: typeof w, out: HashPoint[] | null) => {
      while (k < run.replay.log.length && run.replay.log[k].tick === world.meta[M_TICK] + 1) issue(world, run.replay.log[k++].cmd)
      const r = advanceTick(world); if (out && r.hash !== null) out.push({ tick: r.tick, hash: r.hash, sections: [] })
    }
    while (w.meta[M_TICK] < 1800) step(w, null)
    const loaded = deserialize(serialize(w), data)
    expect(hashWorld(loaded)).toBe(hashWorld(w))
    const after: HashPoint[] = []
    while (loaded.meta[M_TICK] < S0_TICKS) step(loaded, after)
    expect(after.map(h => h.hash)).toEqual(run.hashes.filter(h => h.tick > 1800).map(h => h.hash))
  })
  it('6. the data version: another map gives another version, and old saves and replays refuse it', async () => {
    const map = await formationField(), moved = { ...map, heightAt: (x: number, z: number) => map.heightAt(x, z) + 0.01 }
    const other = loadSimData(buildSimData(moved))
    expect(other.version).not.toBe(data.version)
    expect(() => loadSimData(buildSimData(moved), data.version)).toThrow(DataVersionMismatch)
    const w = makeWorld(data, 1); s0Fight(w); advanceTick(w)
    expect(() => deserialize(serialize(w), other)).toThrow(DataVersionMismatch)
    expect(() => play(run.replay, other, s0Fight, run.hashes)).toThrow(DataVersionMismatch)
    expect(loadSimData(dataBytes(), data.version).version).toBe(data.version)
  })
})

describe('S0 units', () => {
  it('the hash covers everything a save holds: RNG, pools, free lists, pending commands', () => {
    const w = makeWorld(data, 9); s0Fight(w); for (let k = 0; k < 30; k++) advanceTick(w)
    issue(w, { type: 'halt', id: makeHandle(KIND_FORMATION, 0, 0) })
    const base = hashWorld(w), changed: string[] = []
    const tryMut = (name: string, mut: (c: typeof w) => void) => { const c = deserialize(serialize(w), data); mut(c); if (hashWorld(c) !== base) changed.push(name) }
    tryMut('rng', c => { c.rng[3] ^= 1 })
    tryMut('waypoint free list', c => { c.wp.next[c.wp.meta[0]] ^= 1 })
    tryMut('waypoint pool meta', c => { c.wp.meta[1]++ })
    tryMut('formation free list', c => { c.free[0] ^= 1 })
    tryMut('pending command', c => { c.pending[0] = { ...c.pending[0], seq: c.pending[0].seq + 1 } })
    tryMut('formation field', c => { c.f.speed[0] += 1e-9 })
    tryMut('tick', c => { c.meta[M_TICK]++ })
    expect(changed).toEqual(['rng', 'waypoint free list', 'waypoint pool meta', 'formation free list', 'pending command', 'formation field', 'tick'])
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
  it('the finite-state assert fires on a poisoned state', () => {
    const w = makeWorld(data, 5); issue(w, { type: 'debug-spawn', side: 0, men: 10, x: 0, z: 0, facing: 0 }); advanceTick(w)
    w.f.x[0] = NaN
    expect(() => advanceTick(w)).toThrow(NonFiniteState)
  })
  it('7. budget: time per tick of the fight (measured, not asserted)', () => {
    const w = makeWorld(data, 6); s0Fight(w)
    const t0 = process.hrtime.bigint(); for (let k = 0; k < S0_TICKS; k++) advanceTick(w)
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / S0_TICKS
    console.log(`S0 fight: ${ms.toFixed(4)} ms per tick (target ≤ 2 ms, sim-design §16)`)
    expect(ms).toBeGreaterThan(0)
  })
})
