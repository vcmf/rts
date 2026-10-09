// Fire and morale (docs/plans/active/s1c-fire-morale.md): the rules, determinism, the calibration golden.
// Most cases stand on the strip at z = −165 (open ground), on levelled data unless the ground is the point.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { data, cr, root } from './fx.ts'
import { makeWorld, issue, advanceTick, compileRuleset, buildTerrain, makeHandle, KIND_FORMATION, M_FREE, M_TICK, MS_ROUTING, MS_STEADY, MS_SHAKEN, MS_WAVERING,
  menOf, aimOf, reverseFireOrder, hashWorld, hex, serialize, deserialize, record, play, type World, type Command, type Ruleset, type Dropped } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { levelled, runFirefight, s1cFirefight, FIGHT_X, FIGHT_Z } from '../src/scenarios/s1c-firefight.ts'

const E = Math.PI / 2, Z = FIGHT_Z, lev = levelled(data), levTerrain = buildTerrain(lev, cr)
// a world on levelled (or real) ground, with a log of dropped commands
class W {
  w: World; dropped: Dropped[] = []
  constructor(opts: { real?: boolean; rs?: Ruleset; seed?: number } = {}) {
    const c = opts.rs ? compileRuleset(opts.rs) : cr
    this.w = makeWorld(opts.real ? data : lev, c, opts.seed ?? 1, true, opts.rs ? undefined : opts.real ? undefined : levTerrain)
  }
  spawn(side: number, x: number, z: number, heading: number, extra: Partial<Extract<Command, { type: 'debug-spawn' }>> = {}): number {
    const slot = this.w.free[this.w.meta[M_FREE] - 1]
    this.do({ type: 'debug-spawn', side, x, z, heading, shape: 'line', men: 100, ...extra })
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  do(c: Command): void { issue(this.w, c); this.tick() }
  tick(): void { this.dropped.push(...advanceTick(this.w).dropped) }
  run(sec: number): void { for (let n = Math.round(sec * 20); n > 0; n--) this.tick() }
  i(h: number): number { return (h >>> 19) & 511 }
  men(h: number): number { return menOf(this.w, this.i(h)) }
  volleys(h: number): number { let n = 0; for (let c = 0; c < 4; c++) if (this.w.f.volleyTick[this.i(h) * 4 + c] > 0) n++; return n }
  state(h: number): number { return this.w.f.mstate[this.i(h)] }
}
// two lines facing each other `d` apart on the strip
function pair(d: number, opts: ConstructorParameters<typeof W>[0] = {}, qb?: number): [W, number, number] {
  const s = new W(opts), a = s.spawn(0, FIGHT_X - d / 2, Z, E), b = s.spawn(1, FIGHT_X + d / 2, Z, -E, qb === undefined ? {} : { quality: qb })
  return [s, a, b]
}
const fireRs = (fire: Partial<Ruleset['fire']>): Ruleset => ({ ...napoleonic, fire: { ...napoleonic.fire, ...fire } })

describe('who may fire at whom', () => {
  it('only within the maximum range', () => {
    const [far, a] = pair(262); far.run(60); expect(far.volleys(a)).toBe(0)
    const [near, b] = pair(240); near.run(60); expect(near.volleys(b)).toBeGreaterThan(0)
  })
  it('not over a crest: the rise at x ≈ −13 hides lines 150 m apart; on level ground they fire', () => {
    const [real, a] = pair(150, { real: true }); real.run(60); expect(real.volleys(a)).toBe(0)
    const [flat, b] = pair(150); flat.run(60); expect(flat.volleys(b)).toBeGreaterThan(0)
  })
  it('not through more than the woods limit: a wood 50 m deep between two lines blocks them; with no limit they fire', () => {
    // the wood at z = 50 spans x ≈ −70..−20 (the field's map)
    const mk = (rs?: Ruleset) => { const s = new W({ rs }), a = s.spawn(0, -100, 50, E); s.spawn(1, 5, 50, -E); s.run(60); return s.volleys(a) }
    expect(mk()).toBe(0)
    expect(mk(fireRs({ sight: {} }))).toBeGreaterThan(0)
  })
  it('not through friends: companies behind a friendly line do not fire; a company half behind it fires with about half its rays', () => {
    const s = new W(), a = s.spawn(0, -100, Z, E); s.spawn(1, 0, Z, -E)
    // a friendly line 20 m ahead, shifted north so it covers A's northern half (companies 2 and 3 face north of the axis)
    s.spawn(0, -80, Z + 15, E, { men: 100 })
    s.run(40)
    const shares = [0, 1, 2, 3].map(c => aimOf(s.w, s.i(a), c).share)
    const fired = [0, 1, 2, 3].map(c => s.w.f.volleyTick[s.i(a) * 4 + c] > 0)
    console.log('shares behind a friend', shares, fired)
    expect(shares.some(x => x === 0)).toBe(true); expect(shares.some(x => x === 1)).toBe(true)
    for (let c = 0; c < 4; c++) if (shares[c] === 0) expect(fired[c]).toBe(false)
  })
  it('hold fire holds; at will again fires', () => {
    const [s, a] = pair(100); s.do({ type: 'fire', id: a, mode: 'hold' }); s.run(60); expect(s.volleys(a)).toBe(0)
    s.do({ type: 'fire', id: a, mode: 'at will' }); s.run(40); expect(s.volleys(a)).toBeGreaterThan(0)
  })
  it('a battalion moving or changing shape does not fire', () => {
    const [s, a] = pair(100)
    s.do({ type: 'move', id: a, points: [[FIGHT_X - 50, Z + 60]], append: false })
    const t0 = s.w.meta[M_TICK]; s.run(30)
    expect(Math.max(...[0, 1, 2, 3].map(c => s.w.f.volleyTick[s.i(a) * 4 + c]))).toBeLessThanOrEqual(t0)
    s.do({ type: 'halt', id: a }); s.do({ type: 'form', id: a, shape: 'column' })
    const t1 = s.w.meta[M_TICK]; s.run(25)
    expect(Math.max(...[0, 1, 2, 3].map(c => s.w.f.volleyTick[s.i(a) * 4 + c]))).toBeLessThanOrEqual(t1)
  })
})

describe('casualties', () => {
  it('fall only on the target companies in the shooter\'s arc and range', () => {
    // a 100 m range; B in line facing north, its companies strung west to east; A due west facing east, so
    // only B's western company (company 0) is within 100 m (hit chance raised so the test sees hits)
    const s = new W({ rs: fireRs({ maxRange: 100, pRange: [[0, 0.2], [100, 0.2], [101, 0]] }) })
    s.spawn(0, -150, Z, E); const b = s.spawn(1, -45.25, Z, 0)
    const before = [0, 1, 2, 3].map(c => s.w.f.men[s.i(b) * 4 + c]); s.run(120)
    const lost = [0, 1, 2, 3].map(c => before[c] - s.w.f.men[s.i(b) * 4 + c])
    console.log('losses by company', lost)
    expect(lost[0]).toBeGreaterThan(0); expect(lost.slice(1)).toEqual([0, 0, 0])
  })
})

describe('morale', () => {
  it('no hits, no break: at p = 0 two lines at 50 m, one of them just above the rout, stand for 20 minutes', () => {
    const [s, a, b] = pair(50, { rs: fireRs({ pRange: [[0, 0], [250, 0]] }) }, 0.42)
    s.run(1200); expect([s.state(a), s.state(b), s.men(a), s.men(b)]).toEqual([MS_STEADY, MS_WAVERING, 100, 100])   // 0.42: wavering by quality
  })
  it('the states follow the morale with hysteresis (steady → shaken → wavering → shaken → steady)', () => {
    const s = new W(), h = s.spawn(0, FIGHT_X, Z, E), seen: number[] = []
    const settle = (q: number) => { s.do({ type: 'debug-morale', id: h, quality: q }); s.run(120); seen.push(s.state(h)) }
    for (const q of [0.62, 0.58, 0.62, 0.52, 0.48, 0.52, 0.56, 0.64, 0.66]) settle(q)
    expect(seen).toEqual([MS_STEADY, MS_SHAKEN, MS_SHAKEN, MS_SHAKEN, MS_WAVERING, MS_WAVERING, MS_SHAKEN, MS_SHAKEN, MS_STEADY])
  })
  it('a router drops its orders, refuses commands, does not fire, and runs for its side\'s rear to the map edge', () => {
    const s = new W(), h = s.spawn(0, FIGHT_X, Z + 40, 0); s.spawn(1, FIGHT_X, Z + 120, Math.PI)
    s.do({ type: 'side', side: 0, x: 0, z: -1 })
    s.do({ type: 'debug-morale', id: h, quality: 0.2 }); s.run(30)
    expect(s.state(h)).toBe(MS_ROUTING)
    const t0 = s.w.meta[M_TICK]; s.do({ type: 'move', id: h, points: [[0, 0]], append: false })
    expect(s.dropped.at(-1)?.reason).toBe('routing')
    s.run(120)
    expect(Math.max(...[0, 1, 2, 3].map(c => s.w.f.volleyTick[s.i(h) * 4 + c]))).toBeLessThanOrEqual(t0)
    expect(s.w.f.z[s.i(h)]).toBeLessThan(-170)   // the southern edge is at −180, the order kept 2 m inside
  })
  it('the opening volleys at 50 m do not break a fresh line in its first minute', () => {
    for (let seed = 1; seed <= 5; seed++) { const [s, a, b] = pair(50, { seed }); s.run(60); expect([s.state(a) !== MS_ROUTING, s.state(b) !== MS_ROUTING]).toEqual([true, true]) }
  })
})

describe('determinism', () => {
  it('the order the fire step visits battalions in does not change the result (keyed draws)', () => {
    const go = (rev: boolean) => { reverseFireOrder(rev); try { const [s] = pair(80, { seed: 3 }); s.spawn(0, FIGHT_X - 60, Z + 40, E); s.spawn(1, FIGHT_X + 40, Z + 40, -E); s.run(300); return hex(hashWorld(s.w)) } finally { reverseFireOrder(false) } }
    expect(go(true)).toBe(go(false))
  })
  const goldenFile = path.join(root, 'test', 'golden', 's1c-firefight.json'), TICKS = 12000
  const run = record(data, cr, s1cFirefight, 5, TICKS, () => {})
  it('the firefight gives the committed golden hashes; its replay and a save round trip reproduce them', () => {
    const hashes = run.hashes.map(h => [h.tick, hex(h.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(data.version), ruleset: hex(cr.hash), ticks: TICKS, hashes }) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect([golden.dataVersion, golden.ruleset]).toEqual([hex(data.version), hex(cr.hash)])
    expect(hashes).toEqual(golden.hashes)
    expect(play(run.replay, data, cr, s1cFirefight, run.hashes)).toBeNull()
    const w = makeWorld(data, cr, 5); s1cFirefight.setup(w); while (w.meta[M_TICK] < 4000) advanceTick(w)
    const w2 = deserialize(serialize(w), data, cr); while (w.meta[M_TICK] < 6000) { advanceTick(w); advanceTick(w2) }
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(w)))
  })
  it('the calibration at 100 m, five seeds: times to break and losses match the golden table', () => {
    const file = path.join(root, 'test', 'golden', 's1c-calibration.json')
    const table = [1, 2, 3, 4, 5].map(seed => { const r = runFirefight(lev, cr, seed, 100, 24000); return [seed, r.first, r.tick, r.lossA, r.lossB] })
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(file, JSON.stringify({ ruleset: hex(cr.hash), table }) + '\n')
    const golden = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(golden.ruleset).toBe(hex(cr.hash)); expect(table).toEqual(golden.table)
    for (const [, first, tick, , lossB] of table) { expect(first).toBe(1); expect(tick / 1200).toBeGreaterThan(4); expect(tick / 1200).toBeLessThan(16); expect(lossB).toBeGreaterThanOrEqual(12) }
  })
})
