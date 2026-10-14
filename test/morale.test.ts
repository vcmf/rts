// The rest of the morale machine (docs/plans/active/s1c2-morale-machine.md): rally, shattered, contagion,
// flank support, the wavering fall-back. The cases are scripted: morale and states are set between ticks, on
// levelled ground, in the open band west of the stream (x ≈ −60, z −105..30) or at the map's west edge.
import { describe, it, expect } from 'vitest'
import { data, cr, shipped } from './fx.ts'
import { makeWorld, issue, advanceTick, buildTerrain, makeHandle, KIND_FORMATION, M_FREE, M_TICK, MS_STEADY, MS_SHAKEN, MS_WAVERING, MS_ROUTING, MS_RALLYING, MS_SHATTERED,
  RP_RUNNING, RP_FLED, O_MOVE, allocOrder, menOf, hashWorld, hex, serialize, deserialize, record, play, outOfFight, mayFire, formationSlot, type World, type Command, type Dropped } from '../src/sim/index.ts'
import { levelled, brigade } from '../src/scenarios/s1c-firefight.ts'

const E = Math.PI / 2, lev = levelled(data), levTerrain = buildTerrain(lev, cr), M = cr.rs.morale
class W {
  w: World; dropped: Dropped[] = []
  constructor(seed = 1) { this.w = makeWorld(lev, cr, seed, true, levTerrain) }
  // a line; side 0 faces east, side 1 west; holding fire unless asked
  spawn(side: number, x: number, z: number, extra: Partial<Extract<Command, { type: 'debug-spawn' }>> = {}): number {
    const slot = this.w.free[this.w.meta[M_FREE] - 1]
    this.do({ type: 'debug-spawn', side, x, z, heading: side ? -E : E, shape: 'line', men: 100, fire: 'hold', ...extra })
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  do(c: Command): void { issue(this.w, c); this.tick() }
  tick(): void { this.dropped.push(...advanceTick(this.w).dropped) }
  run(sec: number, each?: () => void): void { for (let n = Math.round(sec * 20); n > 0; n--) { this.tick(); each?.() } }
  i(h: number): number { return (h >>> 19) & 511 }
  state(h: number): number { return this.w.f.mstate[this.i(h)] }
  // sets the morale (and the state it would have, coming down) before the next tick
  set(h: number, morale: number, state = morale < M.wavering[0] ? MS_WAVERING : morale < M.shaken[0] ? MS_SHAKEN : MS_STEADY): void {
    const i = this.i(h); this.w.f.morale[i] = morale; this.w.f.mstate[i] = state
  }
  // breaks it at the next tick
  breakNow(h: number): void { this.w.f.morale[this.i(h)] = 0.3; this.tick() }
  // the morale target it relaxes toward, read off one tick from a morale equal to its quality
  target(h: number): number {
    const i = this.i(h), q = this.w.f.quality[i]; this.w.f.morale[i] = q; this.tick()
    return q + (this.w.f.morale[i] - q) / cr.relax
  }
  reasons(): string[] { return this.dropped.map(d => d.reason) }
}
const SIDES_SET = (s: W) => { s.do({ type: 'side', side: 0, x: -1, z: 0 }); s.do({ type: 'side', side: 1, x: 1, z: 0 }) }

describe('rally', () => {
  // side 0 breaks at x = −60 and runs west to the map edge (x ≈ −178); the enemy stands east of the stream
  const routed = (enemyX: number, kill = 25) => {
    const s = new W(); SIDES_SET(s)
    const h = s.spawn(0, -60, -35); s.spawn(1, enemyX, -35)
    s.do({ type: 'debug-kill', id: h, men: kill })
    s.breakNow(h); expect(s.state(h)).toBe(MS_ROUTING)
    return [s, h] as const
  }
  it('a router whose run has ended, beyond 250 m from any enemy and calm for 20 s, rallies: written off, brittle, refusing orders for 30 s', () => {
    const [s, h] = routed(170), i = s.i(h)
    let rallied = -1; const seen: number[] = []
    s.run(240, () => { const st = s.state(h); if (st === MS_RALLYING && rallied < 0) rallied = s.w.meta[M_TICK]; if (s.w.f.routPhase[i] === RP_RUNNING) seen.push(st) })
    expect(rallied).toBeGreaterThan(0)
    expect(seen.every(st => st === MS_ROUTING)).toBe(true)   // never while running
    expect(s.w.f.quality[i]).toBeCloseTo(M.quality - M.rally.cost, 9)
    expect(s.w.f.baseMen[i]).toBe(menOf(s.w, i))             // the losses before the rout are written off
    expect(s.w.f.startMen[i]).toBe(100)                      // its strength still counts from the spawn
    expect(outOfFight(s.state(h))).toBe(false)
    expect(s.w.f.routs[i]).toBe(1)
  })
  it('while rallying it refuses orders and may not fire; afterwards it takes orders and holds (it does not re-rout at once)', () => {
    const [s, h] = routed(170), i = s.i(h)
    while (s.state(h) !== MS_RALLYING) s.tick()
    s.dropped = []
    s.do({ type: 'move', id: h, points: [[-150, -35]], append: false })
    s.do({ type: 'fire', id: h, mode: 'at will' })
    expect(s.reasons()).toEqual(['rallying', 'rallying'])
    expect(mayFire(s.w, i)).toBe(false)
    s.run(M.rally.time)
    expect(outOfFight(s.state(h))).toBe(false)
    s.dropped = []; s.do({ type: 'halt', id: h }); expect(s.reasons()).toEqual([])
    const states: number[] = []; s.run(60, () => states.push(s.state(h)))
    expect(states.some(outOfFight)).toBe(false)   // without the write-off its target (0.65 − 0.31) is below the rout
  })
  it('no rally while an enemy in the fight is within 250 m, or while it keeps losing men', () => {
    const [near, a] = routed(40)   // the edge is about 220 m from an enemy at x = 40
    near.run(240); expect(near.state(a)).toBe(MS_ROUTING); expect(near.w.f.routPhase[near.i(a)]).not.toBe(RP_RUNNING)   // its run has ended
    const [hit, b] = routed(170, 10)
    for (let k = 0; k < 24; k++) { hit.run(10); hit.do({ type: 'debug-kill', id: b, men: 1 }) }
    expect(hit.state(b)).toBe(MS_ROUTING)
  })
  it('a router whose first run could not be made (the order pool full) does not rally where it broke', () => {
    const s = new W(); SIDES_SET(s)
    const h = s.spawn(0, -100, -35); s.spawn(1, 170, -35)   // 270 m: safe where it stands
    const held: number[] = []; for (let n = allocOrder(s.w, O_MOVE); n >= 0; n = allocOrder(s.w, O_MOVE)) held.push(n)
    s.breakNow(h); s.run(60)
    expect(s.state(h)).toBe(MS_ROUTING); expect(s.w.f.runs[s.i(h)]).toBe(0); expect(s.w.f.x[s.i(h)]).toBe(-100)
    void held
  })
  it('a battalion whose quality, less the cost, would be below wavering does not rally', () => {
    const s = new W(); SIDES_SET(s)
    const h = s.spawn(0, -60, -35, { quality: 0.55 }); s.spawn(1, 170, -35)
    s.breakNow(h); s.run(240)
    expect(s.state(h)).toBe(MS_ROUTING)
  })
})

describe('shattered', () => {
  it('a router below half its spawn strength shatters, never rallies, refuses orders, and leaves the field at the edge', () => {
    const s = new W(); SIDES_SET(s)
    const h = s.spawn(0, -60, -35); s.spawn(1, 170, -35)
    s.breakNow(h); s.do({ type: 'debug-kill', id: h, men: 51 })
    expect(s.state(h)).toBe(MS_SHATTERED)
    s.dropped = []; s.do({ type: 'halt', id: h }); expect(s.reasons()).toEqual(['shattered'])
    const states = new Set<number>(), on = () => formationSlot(s.w, h) >= 0
    for (let n = 0; n < 20 * 240 && on(); n++) { states.add(s.state(h)); s.tick() }
    expect([...states]).toEqual([MS_SHATTERED])   // never rallies
    expect(on()).toBe(false); expect(s.w.sides.left[0]).toBe(49)   // it ran west to the edge and left the field (S1e-1)
  })
  it('a break beyond the rally allowance shatters at once', () => {
    const s = new W(); SIDES_SET(s)
    const h = s.spawn(0, -60, -35); s.spawn(1, 170, -35)
    s.w.f.routs[s.i(h)] = M.rally.max
    s.breakNow(h)
    expect(s.state(h)).toBe(MS_SHATTERED)
    expect(s.w.f.routs[s.i(h)]).toBe(M.rally.max + 1)
  })
})

describe('contagion', () => {
  // three lines of side 0, 40 m apart along z, facing east; the middle one breaks
  const three = () => { const s = new W(); SIDES_SET(s); const hs = [-75, -35, 5].map(z => s.spawn(0, -60, z)); return [s, hs] as const }
  it('a break shocks the neighbours by shock × (1 − d/R) in the next tick, not the same one', () => {
    const [s, [a, b, c]] = three()
    s.run(5)
    const before = [a, c].map(h => s.w.f.morale[s.i(h)])
    s.breakNow(b)   // tick T: b breaks
    const atT = [a, c].map(h => s.w.f.morale[s.i(h)])
    for (let k = 0; k < 2; k++) expect(atT[k]).toBeGreaterThanOrEqual(before[k] - 1e-3)   // no shock yet
    s.tick()        // T + 1: the shock, across the front (the back radius, 100 m), at about 40 m
    const j = s.i(b)
    for (const [k, h] of [a, c].entries()) {
      // the distance after this tick's movement (b's Face about moves its anchor); b, routing, no longer
      // supports it, but the other outer line does: 80 m off, square to its flank
      const i = s.i(h), d = Math.hypot(s.w.f.x[j] - s.w.f.x[i], s.w.f.z[j] - s.w.f.z[i]), m0 = atT[k], target = s.w.f.quality[i] + M.support.bonus
      expect(s.w.f.morale[i]).toBeCloseTo(m0 + (target - m0) * cr.relax - M.contagion.shock * (1 - d / M.contagion.back), 9)
    }
  })
  it('a wavering neighbour breaks with it; a steady one at default quality does not', () => {
    const [s, [a, b, c]] = three()
    s.w.f.quality[s.i(a)] = 0.45; s.set(a, 0.45)   // wavering, and staying there
    s.breakNow(b); s.tick()
    expect(s.state(a)).toBe(MS_ROUTING)
    expect(s.state(c)).toBe(MS_STEADY)
    expect(s.w.f.brokeTick[s.i(a)]).toBe(s.w.f.brokeTick[s.i(b)] + 1)   // one link per tick
  })
  it('a break 150 m ahead shocks; one 150 m behind does not (front 200 m, back 100 m)', () => {
    // the shock taken, and what the rule gives at the distance after the tick (the Face about moves b's anchor)
    const shockAt = (dx: number) => {
      const s = new W(); SIDES_SET(s); const a = s.spawn(0, -20, -35), b = s.spawn(0, -20 + dx, -35)
      s.run(2); s.breakNow(b); const m = s.w.f.morale[s.i(a)]; s.tick()
      const d = Math.abs(s.w.f.x[s.i(b)] - s.w.f.x[s.i(a)])
      return [m + (s.w.f.quality[s.i(a)] - m) * cr.relax - s.w.f.morale[s.i(a)], d]
    }
    const [ahead, d] = shockAt(150), [behind] = shockAt(-150)
    expect(ahead).toBeCloseTo(M.contagion.shock * (1 - d / M.contagion.front), 9)
    expect(ahead).toBeGreaterThan(0.03)
    expect(behind).toBeCloseTo(0, 9)
  })
  it('a chain of breaks travels one link per tick, and visiting order does not change it', () => {
    const go = (rev: boolean) => {
      const s = new W(3); SIDES_SET(s); s.w.scratch.reverse = rev
      const hs = [-115, -75, -35, 5, 45].map(z => s.spawn(0, -100, z))
      for (const h of hs) { s.w.f.quality[s.i(h)] = 0.45; s.set(h, 0.45) }
      s.breakNow(hs[0]); s.run(2)
      return { ticks: hs.map(h => s.w.f.brokeTick[s.i(h)] - s.w.f.brokeTick[s.i(hs[0])]), hash: hex(hashWorld(s.w)) }
    }
    const fwd = go(false), rev = go(true)
    expect(fwd.ticks).toEqual([0, 1, 2, 3, 4])
    expect(rev).toEqual(fwd)
  })
})

describe('flank support', () => {
  it('a line between two friends has a target 2 × bonus higher than one alone, and holds where the lone line breaks', () => {
    const alone = new W(); const a = alone.spawn(0, -60, -35); alone.run(1)
    const flanked = new W(); const [, b] = [-75, -35, 5].map(z => flanked.spawn(0, -60, z)); flanked.run(1)
    expect(flanked.target(b) - alone.target(a)).toBeCloseTo(2 * M.support.bonus, 9)
    for (const [s, h] of [[alone, a], [flanked, b]] as const) s.do({ type: 'debug-kill', id: h, men: 30 })
    let aloneBroke = false, flankedBroke = false
    alone.run(240, () => { aloneBroke ||= outOfFight(alone.state(a)) }); flanked.run(240, () => { flankedBroke ||= outOfFight(flanked.state(b)) })
    expect(aloneBroke).toBe(true)                                    // target 0.75 − 0.375 (no enemy: it rallies after)
    expect(flankedBroke).toBe(false)                                 // target 0.75 − 0.375 + 0.08
  })
  it('a friend ahead or behind gives none, nor does a routing friend', () => {
    const lone = new W(); const h0 = lone.spawn(0, -60, -35); lone.run(1); const base = lone.target(h0)
    for (const dx of [40, -40]) { const s = new W(); const h = s.spawn(0, -60, -35); s.spawn(0, -60 + dx, -35); s.run(1); expect(s.target(h)).toBeCloseTo(base, 9) }
    const s = new W(); const h = s.spawn(0, -60, -35), f = s.spawn(0, -60, 5); s.run(1)
    expect(s.target(h) - base).toBeCloseTo(M.support.bonus, 9)
    const j = s.i(f); s.w.f.mstate[j] = MS_ROUTING; s.w.f.routPhase[j] = RP_FLED   // routing, standing where it is
    expect(s.target(h)).toBeCloseTo(base, 9)
  })
})

describe('the wavering fall-back', () => {
  // side 1 at x = −10 facing west, an enemy (holding fire) 100 m west; spawned at the default quality, its
  // quality then lowered, so its morale falls into wavering (spawned at 0.45 it would start there, not falling)
  const setup = () => {
    const s = new W(); SIDES_SET(s)
    s.spawn(0, -110, -35); const h = s.spawn(1, -10, -35, { fire: 'at will' }); s.w.f.quality[s.i(h)] = 0.45
    return [s, h] as const
  }
  it('a wavering battalion without orders, morale falling, an enemy in range, Retires 15 m once, faces the front and fires again', () => {
    const [s, h] = setup(), i = s.i(h)
    let fell = -1; s.run(120, () => { if (fell < 0 && s.w.f.fellBack[i]) fell = s.w.meta[M_TICK] })
    expect(fell).toBeGreaterThan(0)
    expect(s.state(h)).toBe(MS_WAVERING)
    expect(s.w.f.x[i]).toBeCloseTo(-10 + M.fallback.metres, 0)
    expect(s.w.f.heading[i]).toBeCloseTo(-E, 4)   // the spawn's heading, to 0.1 mrad
    expect(s.w.f.ordHead[i]).toBe(-1)                                // once: no second Retire while still wavering
    const last = Math.max(...s.w.f.volleyTick.slice(i * s.w.cr.maxC, i * s.w.cr.maxC + 4))
    expect(last).toBeGreaterThan(fell + 20 * 10)                       // it fired after the Retire
  })
  it('not with orders', () => {
    const [s, h] = setup(); s.do({ type: 'move', id: h, points: [[-10, 150]], append: false })
    let fell = false; s.run(60, () => { fell ||= s.w.f.fellBack[s.i(h)] === 1 })
    expect(s.state(h)).toBe(MS_WAVERING); expect(fell).toBe(false)
  })
  it('not with no enemy within musket range', () => {
    const s = new W(); SIDES_SET(s); const h = s.spawn(1, -10, -35); s.w.f.quality[s.i(h)] = 0.45
    let fell = false; s.run(60, () => { fell ||= s.w.f.fellBack[s.i(h)] === 1 })
    expect(s.state(h)).toBe(MS_WAVERING); expect(fell).toBe(false)
  })
  it('not with the enemy behind it: a Retire, back from its facing, would march toward the enemy', () => {
    // faced east, its back to the enemy 100 m west (a rallied battalion faces the way it ran)
    const s = new W(); SIDES_SET(s); s.spawn(0, -110, -35); const h = s.spawn(1, -10, -35, { heading: E }); s.w.f.quality[s.i(h)] = 0.45
    let fell = false; s.run(60, () => { fell ||= s.w.f.fellBack[s.i(h)] === 1 })
    expect(s.state(h)).toBe(MS_WAVERING); expect(fell).toBe(false); expect(s.w.f.x[s.i(h)]).toBe(-10)
  })
  it('not on the slow crawl of a morale settling onto a fixed target', () => {
    const [s, h] = setup(), i = s.i(h)
    s.set(h, 0.45 + 1e-4)   // wavering, a hair above its target: it creeps down by about 2.5e-7 a tick
    let fell = false; s.run(30, () => { fell ||= s.w.f.fellBack[i] === 1 })
    expect(fell).toBe(false)
  })
  it('not on a dip into wavering that recovers (its morale rising)', () => {
    const [s, h] = setup(), i = s.i(h)
    s.w.f.quality[i] = M.quality; s.set(h, 0.48)
    let fell = false; s.run(30, () => { fell ||= s.w.f.fellBack[i] === 1 || s.w.f.ordHead[i] >= 0 })   // the flag clears once it recovers
    expect(fell).toBe(false)
  })
})

describe('determinism', () => {
  it('the brigade: its replay reproduces', () => {
    const cr = shipped, sc = brigade(100), run = record(lev, cr, sc, 2, 14000, () => {})
    expect(play(run.replay, lev, cr, sc, run.hashes)).toBeNull()
  })
  it('a save taken with one battalion rallying, one routing and one mid-fall-back reproduces', () => {
    // side 0: a router that runs to the west edge and rallies, a second routing, and east of the stream a
    // wavering line falling back from side 1's line 60 m in front of it (side 1 stays east: the edge is safe)
    const s = new W(); SIDES_SET(s)
    const r1 = s.spawn(0, -60, -35), r2 = s.spawn(0, -60, 25); s.spawn(1, 170, -95)
    const fb = s.spawn(0, 110, -95, { fire: 'at will' })
    const until = (ok: () => boolean) => { for (let n = 0; n < 20 * 600 && !ok(); n++) s.tick(); expect(ok()).toBe(true) }
    s.breakNow(r1)
    until(() => s.state(r1) === MS_RALLYING)
    // just above wavering, its quality lowered: it falls back within about 6 s, inside the 30 s rally
    s.w.f.quality[s.i(fb)] = 0.45; s.set(fb, 0.51); s.breakNow(r2)
    until(() => s.w.f.fellBack[s.i(fb)] === 1 && s.w.f.ordHead[s.i(fb)] >= 0)
    expect([s.state(r1), s.state(r2), s.state(fb)]).toEqual([MS_RALLYING, MS_ROUTING, MS_WAVERING])   // the rally lasts 30 s: the fall-back must come first
    const w2 = deserialize(serialize(s.w), lev, cr, true, levTerrain)
    for (let n = 0; n < 1200; n++) { advanceTick(s.w); advanceTick(w2) }
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(s.w)))
  })
})
