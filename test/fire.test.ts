// Fire and morale (docs/plans/active/s1c-fire-morale.md): the rules, determinism, the calibration golden.
// Most cases stand on the strip at z = −165 (open ground), on levelled data unless the ground is the point.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { data, cr, root } from './fx.ts'
import { makeWorld, issue, advanceTick, compileRuleset, buildTerrain, makeHandle, KIND_FORMATION, M_FREE, M_TICK, MS_ROUTING, MS_STEADY, MS_SHAKEN, MS_WAVERING,
  menOf, aimOf, companySees, hashWorld, wetBins, STATUS, cellK, placeWorld, O_MOVE, RP_FLED, allocOrder, appendOrder, clearOrders, hex, serialize, deserialize, record, play, type World, type Command, type Ruleset, type Dropped, type Terrain } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { levelled, runFirefight, s1cFirefight, FIGHT_X, FIGHT_Z } from '../src/scenarios/s1c-firefight.ts'

const E = Math.PI / 2, Z = FIGHT_Z, lev = levelled(data), levTerrain = buildTerrain(lev, cr)
// a world on levelled (or real) ground, with a log of dropped commands
class W {
  w: World; dropped: Dropped[] = []
  constructor(opts: { real?: boolean; rs?: Ruleset; seed?: number; terrain?: Terrain } = {}) {
    const c = opts.rs ? compileRuleset(opts.rs) : cr
    this.w = makeWorld(opts.real ? data : lev, c, opts.seed ?? 1, true, opts.terrain ?? (opts.rs ? undefined : opts.real ? undefined : levTerrain))
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
// the z of company c's centre (its front-rank origin is close enough here)
const companyZ = (s: W, h: number, c: number): number => placeWorld(s.w, s.i(h), c, s.w.f.x[s.i(h)], s.w.f.z[s.i(h)], s.w.f.heading[s.i(h)], 0, 0, { x: 0, z: 0, a: 0, face: 0 }).z

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

describe('a target partly hidden', () => {
  it('a company in a wood does not hide the rest of its battalion, and takes no hits it cannot be seen for', () => {
    // B faces west; a dense wood (15 m sight limit) is painted around its southern company, deep enough that
    // every line to that company crosses more of it than the limit (hit chance raised so the test sees hits)
    const t = buildTerrain(lev, cr), dense = Object.keys(napoleonic.terrain).indexOf('denseWood')
    // B steady and in place for the whole test (a rout would Face about, and that remaps its companies)
    const w2 = new W({ terrain: t, rs: fireRs({ pRange: [[0, 0.2], [250, 0.2], [251, 0]] }) })
    const a2 = w2.spawn(0, FIGHT_X - 50, Z, E, { fire: 'hold' }), b2 = w2.spawn(1, FIGHT_X + 50, Z, -E, { quality: 1, fire: 'hold' })
    const C = 4, south = [0, 1, 2, 3].reduce((m, c) => (companyZ(w2, b2, c) < companyZ(w2, b2, m) ? c : m), 0), zs = companyZ(w2, b2, south)   // B's southern company
    for (let z = Math.floor(zs - 8); z <= Math.ceil(zs + 8); z++) for (let x = FIGHT_X + 10; x <= FIGHT_X + 56; x++) t.cls[cellK(t, x, z)] = dense
    w2.do({ type: 'fire', id: a2, mode: 'at will' })
    // the companies of B that no company of A can see (they stand still: both battalions are halted)
    const hidden = [0, 1, 2, 3].filter(q => [0, 1, 2, 3].every(c => !companySees(w2.w, w2.i(a2), c, w2.i(b2), q)))
    const before = [0, 1, 2, 3].map(c => w2.w.f.men[w2.i(b2) * C + c]); w2.run(40)
    expect(w2.state(b2)).not.toBe(MS_ROUTING)
    const lost = [0, 1, 2, 3].map(c => before[c] - w2.w.f.men[w2.i(b2) * C + c])
    console.log('hidden companies', hidden, 'losses by company', lost)
    expect(hidden).toContain(south); expect(hidden.length).toBeLessThan(4)
    for (const c of hidden) expect(lost[c]).toBe(0)
    expect(lost.reduce((x, y) => x + y, 0)).toBeGreaterThan(10)
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
  it('a router whose Face about fails (water behind it) keeps its run: the failed turn does not drop it', () => {
    // the S1a case (test/formations.test.ts): a 93-man line facing west by the stream cannot face about. This
    // spot is a pinch even for a battalion that is not routing (a plain march west halts within a metre), so
    // the test checks the order, not the movement; the fan test below checks a router that can move
    let found = false
    for (let x = 40; x < 75 && !found; x += 0.25) {
      const s = new W({ real: true }), h = s.spawn(0, x, -30, -Math.PI / 2, { men: 93 })
      if (wetBins(s.w, s.i(h))) continue
      s.do({ type: 'face', id: h })
      if (STATUS[s.w.f.status[s.i(h)]] !== 'cannot face about: impassable ground') continue
      found = true
      s.do({ type: 'side', side: 0, x: 1, z: 1 }); s.do({ type: 'debug-morale', id: h, quality: 0.1 })
      for (let n = 0; n < 1200 && s.state(h) !== MS_ROUTING; n++) s.tick()   // morale relaxes to the rout (about 15 s)
      s.run(2)   // the Face about is tried and fails
      expect(s.state(h)).toBe(MS_ROUTING)
      expect(STATUS[s.w.f.status[s.i(h)]]).toBe('cannot face about: impassable ground')
      const n = s.w.f.ordHead[s.i(h)]; expect(n >= 0 && s.w.ord.type[n] === O_MOVE).toBe(true)   // the run is still its order
    }
    expect(found).toBe(true)
  })
  it('a router halted at the stream runs another way: the fan of directions about its rear', () => {
    // B faces west at x = 40; its rear is east, across the stream (x ≈ 60–80): its first run halts at the bank
    const s = new W(), h = s.spawn(1, 40, -100, -E)
    s.do({ type: 'side', side: 1, x: 1, z: 0 }); s.do({ type: 'debug-morale', id: h, quality: 0.1 })
    let halt: [number, number] | null = null
    for (let n = 0; n < 20 * 240; n++) {
      s.tick()
      if (!halt && s.state(h) === MS_ROUTING && s.w.f.ordHead[s.i(h)] < 0) halt = [s.w.f.x[s.i(h)], s.w.f.z[s.i(h)]]
    }
    expect(halt).not.toBeNull()
    console.log('router halted at', halt, 'runs', s.w.f.runs[s.i(h)], 'now at', s.w.f.x[s.i(h)].toFixed(1), s.w.f.z[s.i(h)].toFixed(1))
    expect(s.w.f.runs[s.i(h)]).toBeGreaterThan(1)
    expect(Math.hypot(s.w.f.x[s.i(h)] - halt![0], s.w.f.z[s.i(h)] - halt![1])).toBeGreaterThan(20)
  })
  it('a router that gets where it was running stays there: fled, no more runs', () => {
    const s = new W(), h = s.spawn(0, -100, -65, E)
    s.do({ type: 'side', side: 0, x: -1, z: 0 }); s.do({ type: 'debug-morale', id: h, quality: 0.1 })
    for (let n = 0; n < 20 * 120 && s.w.f.routPhase[s.i(h)] !== RP_FLED; n++) s.tick()
    expect(s.w.f.routPhase[s.i(h)]).toBe(RP_FLED)
    const at = [s.w.f.x[s.i(h)], s.w.f.z[s.i(h)]]; s.run(240)
    expect(s.w.f.runs[s.i(h)]).toBe(1); expect(s.w.f.ordHead[s.i(h)]).toBe(-1)
    expect(Math.hypot(s.w.f.x[s.i(h)] - at[0], s.w.f.z[s.i(h)] - at[1])).toBeLessThan(0.5)
    expect(at[0]).toBeLessThan(-170)   // it ran west to the map edge
  })
  it('with no rear set, every run points away from the front it broke on', () => {
    // facing east at x = −20 (z = −65 is open); no `side` command: its run is straight back, west
    const s = new W(), h = s.spawn(0, -20, -65, E); s.do({ type: 'debug-morale', id: h, quality: 0.1 })
    let broke = Infinity, maxX = -Infinity
    for (let n = 0; n < 20 * 400; n++) { s.tick(); if (s.state(h) === MS_ROUTING) { if (broke === Infinity) broke = s.w.f.x[s.i(h)]; maxX = Math.max(maxX, s.w.f.x[s.i(h)]) } }
    expect(s.w.f.routX[s.i(h)]).toBeLessThan(-0.99)   // stored at the break: west
    expect(maxX).toBeLessThan(broke + 3)               // never back toward the front (a Face about shifts it a little)
  })
  it('with no rear set, a router halted at the stream fans out about its stored direction, not its new heading', () => {
    // faces west at x = 40 with no rear set: straight back is east, to the stream, where it halts and turns
    // its fan. After its Face about its heading is east; the first three runs (the stored direction, ±60°)
    // must still point east, away from the front it broke on
    const s = new W(), h = s.spawn(1, 40, -100, -E); s.do({ type: 'debug-morale', id: h, quality: 0.1 })
    const dirs: number[] = []; let runs = 0
    for (let n = 0; n < 20 * 300; n++) {
      s.tick(); const i = s.i(h)
      if (s.w.f.runs[i] !== runs) { runs = s.w.f.runs[i]; let o = s.w.f.ordHead[i]; while (o >= 0 && s.w.ord.type[o] !== O_MOVE) o = s.w.ord.next[o]; dirs.push(s.w.ord.x[o] - s.w.f.x[i]) }
    }
    console.log('runs east of the router by', dirs.map(d => d.toFixed(0)))
    expect(dirs.length).toBeGreaterThanOrEqual(3)
    for (const d of dirs.slice(0, 3)) expect(d).toBeGreaterThan(0)
  })
  it('a full order pool delays a run but uses up no direction of the fan', () => {
    const s = new W(), h = s.spawn(1, 40, -100, -E), filler = s.spawn(1, -150, 100, 0, { fire: 'hold' })
    s.do({ type: 'side', side: 1, x: 1, z: 0 })
    // every free order to the filler, all a 70 m march north (open ground): it holds them for a minute
    let k: number; while ((k = allocOrder(s.w, O_MOVE)) >= 0) { s.w.ord.x[k] = -150; s.w.ord.z[k] = 170; s.w.ord.resolved[k] = 1; appendOrder(s.w, s.i(filler), k) }
    // the router breaks on the next tick, with the pool full
    s.w.f.quality[s.i(h)] = 0.1; s.w.f.morale[s.i(h)] = 0.1; s.tick()
    expect(s.state(h)).toBe(MS_ROUTING)
    s.run(10)
    expect([s.state(h), s.w.f.runs[s.i(h)], s.w.f.ordHead[s.i(h)]]).toEqual([MS_ROUTING, 0, -1])
    clearOrders(s.w, s.i(filler)); s.run(6)   // the next retry (every 5 s) finds room
    expect(s.w.f.runs[s.i(h)]).toBe(1)
    let n = s.w.f.ordHead[s.i(h)]; while (n >= 0 && s.w.ord.type[n] !== O_MOVE) n = s.w.ord.next[n]
    expect(n >= 0 && s.w.ord.x[n] > s.w.f.x[s.i(h)] + 100).toBe(true)   // the first run is still the rear (east), not the fan's next
  })
  it('the opening volleys at 50 m do not break a fresh line in its first minute', () => {
    for (let seed = 1; seed <= 5; seed++) { const [s, a, b] = pair(50, { seed }); s.run(60); expect([s.state(a) !== MS_ROUTING, s.state(b) !== MS_ROUTING]).toEqual([true, true]) }
  })
})

describe('determinism', () => {
  it('the order the fire step visits battalions in does not change the result (keyed draws)', () => {
    const go = (rev: boolean) => { const [s] = pair(80, { seed: 3 }); s.w.scratch.reverseFire = rev; s.spawn(0, FIGHT_X - 60, Z + 40, E); s.spawn(1, FIGHT_X + 40, Z + 40, -E); s.run(300); return hex(hashWorld(s.w)) }
    expect(go(true)).toBe(go(false))
  })
  const goldenFile = path.join(root, 'test', 'golden', 's1c-firefight.json'), TICKS = 12000
  it('the firefight gives the committed golden hashes; its replay and a save round trip reproduce them', () => {
    const run = record(data, cr, s1cFirefight, 5, TICKS, () => {})
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
