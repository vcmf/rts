// The rest of the morale machine (docs/plans/active/s1c2-morale-machine.md; the bar, docs/proposals/
// morale-bar-model.md): rally, shattered, contagion, flank support, the back exposed. The cases are scripted: bars
// and states are set between ticks, on
// levelled ground, in the open band west of the stream (x ≈ −60, z −105..30) or at the map's west edge.
import { describe, it, expect } from 'vitest'
import { data, cr, shipped, Sim, openBattlefield, OPEN_DATA } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import {
  makeWorld,
  issue,
  advanceTick,
  buildTerrain,
  makeHandle,
  KIND_FORMATION,
  M_FREE,
  M_TICK,
  MS_STEADY,
  MS_SHAKEN,
  MS_WAVERING,
  MS_ROUTING,
  MS_RALLYING,
  MS_SHATTERED,
  RP_RUNNING,
  RP_FLED,
  O_MOVE,
  allocOrder,
  menOf,
  hashWorld,
  hex,
  serialize,
  deserialize,
  record,
  play,
  outOfFight,
  effectiveBar,
  mayFire,
  formationSlot,
  MORALE_STATES,
  blockGeometry,
  screenShare,
  type World,
  type Command,
  type Dropped,
} from '../src/sim/index.ts'
import { levelled, brigade } from '../src/scenarios/s1c-firefight.ts'

const E = Math.PI / 2
const lev = levelled(data)
const levTerrain = buildTerrain(lev, cr)
const M = cr.rs.morale
class W {
  w: World
  dropped: Dropped[] = []
  constructor(seed = 1) {
    this.w = makeWorld(lev, cr, seed, true, levTerrain)
  }
  // a line; side 0 faces east, side 1 west; holding fire unless asked
  spawn(side: number, x: number, z: number, extra: Partial<Extract<Command, { type: 'debug-spawn' }>> = {}): number {
    const slot = this.w.free[this.w.meta[M_FREE] - 1]
    this.do({
      type: 'debug-spawn',
      side,
      x,
      z,
      heading: side ? -E : E,
      shape: 'line',
      men: 100,
      fire: 'hold',
      ...extra,
    })
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  do(c: Command): void {
    issue(this.w, c)
    this.tick()
  }
  tick(): void {
    this.dropped.push(...advanceTick(this.w).dropped)
  }
  run(sec: number, each?: () => void): void {
    for (let n = Math.round(sec * 20); n > 0; n--) {
      this.tick()
      each?.()
    }
  }
  i(h: number): number {
    return (h >>> 19) & 511
  }
  state(h: number): number {
    return this.w.f.mstate[this.i(h)]
  }
  // sets the bar to a share of its maximum (and the state it would have, coming down) before the next tick
  set(
    h: number,
    share: number,
    state = share < M.wavering[0] ? MS_WAVERING : share < M.shaken[0] ? MS_SHAKEN : MS_STEADY,
  ): void {
    const i = this.i(h)
    this.w.f.bar[i] = share * this.w.f.barMax[i]
    this.w.f.mstate[i] = state
  }
  // breaks it at the next tick
  breakNow(h: number): void {
    this.w.f.bar[this.i(h)] = -100
    this.tick()
  }
  // whether it routs on the next tick with its bar at `bar` points (support decides it near 0)
  routsAt(h: number, bar: number): boolean {
    this.w.f.bar[this.i(h)] = bar
    this.tick()
    return outOfFight(this.state(h))
  }
  reasons(): string[] {
    return this.dropped.map(d => d.reason)
  }
}
const SIDES_SET = (s: W) => {
  s.do({ type: 'side', side: 0, x: -1, z: 0 })
  s.do({ type: 'side', side: 1, x: 1, z: 0 })
}

describe('rally', () => {
  // side 0 breaks at x = −60 and runs west to the map edge (x ≈ −178); the enemy stands east of the stream
  const routed = (enemyX: number, kill = 25) => {
    const s = new W()
    SIDES_SET(s)
    const h = s.spawn(0, -60, -35)
    s.spawn(1, enemyX, -35)
    s.do({ type: 'debug-kill', id: h, men: kill })
    s.breakNow(h)
    expect(s.state(h)).toBe(MS_ROUTING)
    return [s, h] as const
  }
  it('a router whose run has ended, beyond 250 m from any enemy and calm for 20 s, rallies: written off, brittle, refusing orders for 30 s', () => {
    const [s, h] = routed(170)
    const i = s.i(h)
    let rallied = -1
    const seen: number[] = []
    s.run(240, () => {
      const st = s.state(h)
      if (st === MS_RALLYING && rallied < 0) rallied = s.w.meta[M_TICK]
      if (s.w.f.routPhase[i] === RP_RUNNING) seen.push(st)
    })
    expect(rallied).toBeGreaterThan(0)
    expect(seen.every(st => st === MS_ROUTING)).toBe(true) // never while running
    expect(s.w.f.barMax[i]).toBeCloseTo(100 * (1 - M.rally.cut), 9) // brittle: its maximum cut
    expect(s.w.f.cost[i]).toBe(0) // what the losses before the rout cost is written off
    expect(s.w.f.startMen[i]).toBe(100) // its strength still counts from the spawn
    expect(outOfFight(s.state(h))).toBe(false)
    expect(s.w.f.routs[i]).toBe(1)
  })
  it('while rallying it refuses orders and may not fire; afterwards it takes orders and holds (it does not re-rout at once)', () => {
    const [s, h] = routed(170)
    const i = s.i(h)
    while (s.state(h) !== MS_RALLYING) s.tick()
    s.dropped = []
    s.do({ type: 'move', id: h, points: [[-150, -35]], append: false })
    s.do({ type: 'fire', id: h, mode: 'at will' })
    expect(s.reasons()).toEqual(['rallying', 'rallying'])
    expect(mayFire(s.w, i)).toBe(false)
    s.run(M.rally.time)
    expect(outOfFight(s.state(h))).toBe(false)
    s.dropped = []
    s.do({ type: 'halt', id: h })
    expect(s.reasons()).toEqual([])
    const states: number[] = []
    s.run(60, () => states.push(s.state(h)))
    expect(states.some(outOfFight)).toBe(false)
  })
  it('no rally while an enemy in the fight is within 250 m, or while it keeps losing men', () => {
    const [near, a] = routed(40) // the edge is about 220 m from an enemy at x = 40
    near.run(240)
    expect(near.state(a)).toBe(MS_ROUTING)
    // its run has ended
    expect(near.w.f.routPhase[near.i(a)]).not.toBe(RP_RUNNING)
    const [hit, b] = routed(170, 10)
    for (let k = 0; k < 24; k++) {
      hit.run(10)
      hit.do({ type: 'debug-kill', id: b, men: 1 })
    }
    expect(hit.state(b)).toBe(MS_ROUTING)
  })
  it('a router whose first run could not be made (the order pool full) does not rally where it broke', () => {
    const s = new W()
    SIDES_SET(s)
    // 270 m: safe where it stands
    const h = s.spawn(0, -100, -35)
    s.spawn(1, 170, -35)
    const held: number[] = []
    for (let n = allocOrder(s.w, O_MOVE); n >= 0; n = allocOrder(s.w, O_MOVE)) held.push(n)
    s.breakNow(h)
    s.run(60)
    expect(s.state(h)).toBe(MS_ROUTING)
    expect(s.w.f.runs[s.i(h)]).toBe(0)
    expect(s.w.f.x[s.i(h)]).toBe(-100)
    void held
  })
  it('P-37: a rally refills rally.share of its cut maximum; after rally.time it is shaken, never wavering', () => {
    const [s, h] = routed(170)
    const i = s.i(h)
    while (s.state(h) !== MS_RALLYING) s.tick()
    expect(s.w.f.bar[i]).toBeCloseTo(M.rally.share * s.w.f.barMax[i], 9)
    while (s.state(h) === MS_RALLYING) s.tick()
    expect(s.state(h)).toBe(MS_SHAKEN)
  })
})

describe('shattered', () => {
  it('a router below half its spawn strength shatters, never rallies, refuses orders, and leaves the field at the edge', () => {
    const s = new W()
    SIDES_SET(s)
    const h = s.spawn(0, -60, -35)
    s.spawn(1, 170, -35)
    s.breakNow(h)
    s.do({ type: 'debug-kill', id: h, men: 51 })
    expect(s.state(h)).toBe(MS_SHATTERED)
    s.dropped = []
    s.do({ type: 'halt', id: h })
    expect(s.reasons()).toEqual(['shattered'])
    const states = new Set<number>()
    const on = () => formationSlot(s.w, h) >= 0
    for (let n = 0; n < 20 * 240 && on(); n++) {
      states.add(s.state(h))
      s.tick()
    }
    expect([...states]).toEqual([MS_SHATTERED]) // never rallies
    // it ran west to the edge and left the field (S1e-1)
    expect(on()).toBe(false)
    expect(s.w.sides.left[0]).toBe(49)
  })
  it('a break beyond the rally allowance shatters at once', () => {
    const s = new W()
    SIDES_SET(s)
    const h = s.spawn(0, -60, -35)
    s.spawn(1, 170, -35)
    s.w.f.routs[s.i(h)] = M.rally.max
    s.breakNow(h)
    expect(s.state(h)).toBe(MS_SHATTERED)
    expect(s.w.f.routs[s.i(h)]).toBe(M.rally.max + 1)
  })
})

describe('contagion', () => {
  // three lines of side 0, 40 m apart along z, facing east; the middle one breaks
  const three = () => {
    const s = new W()
    SIDES_SET(s)
    const hs = [-75, -35, 5].map(z => s.spawn(0, -60, z))
    return [s, hs] as const
  }
  it('a break shocks the neighbours by shock × (1 − d/R) in the next tick, not the same one', () => {
    const [s, [a, b, c]] = three()
    s.run(5)
    const before = [a, c].map(h => s.w.f.bar[s.i(h)])
    s.breakNow(b) // tick T: b breaks
    const atT = [a, c].map(h => s.w.f.bar[s.i(h)])
    for (let k = 0; k < 2; k++) expect(atT[k]).toBeGreaterThanOrEqual(before[k] - 1e-3) // no shock yet
    s.tick() // T + 1: the shock, across the front (the back radius, 100 m), at about 40 m
    const j = s.i(b)
    for (const [k, h] of [a, c].entries()) {
      // the distance after this tick's movement (b's Face about moves its anchor); the bar is full, so nothing
      // recovers: the shock alone
      const i = s.i(h)
      const d = Math.hypot(s.w.f.x[j] - s.w.f.x[i], s.w.f.z[j] - s.w.f.z[i])
      expect(s.w.f.bar[i]).toBeCloseTo(atT[k] - M.contagion.shock * (1 - d / M.contagion.back), 9)
    }
  })
  it('a wavering neighbour breaks with it; a steady one does not', () => {
    const [s, [a, b, c]] = three()
    // wavering, its bar below the shock
    s.set(a, 0.14)
    s.breakNow(b)
    s.tick()
    expect(s.state(a)).toBe(MS_ROUTING)
    expect(s.state(c)).toBe(MS_STEADY)
    expect(s.w.f.brokeTick[s.i(a)]).toBe(s.w.f.brokeTick[s.i(b)] + 1) // one link per tick
  })
  it('a break 150 m ahead shocks; one 150 m behind does not (front 200 m, back 100 m)', () => {
    // the shock taken, and what the rule gives at the distance after the tick (the Face about moves b's anchor)
    const shockAt = (dx: number) => {
      const s = new W()
      SIDES_SET(s)
      const a = s.spawn(0, -20, -35)
      const b = s.spawn(0, -20 + dx, -35)
      s.run(2)
      s.breakNow(b)
      const m = s.w.f.bar[s.i(a)]
      s.tick()
      const d = Math.abs(s.w.f.x[s.i(b)] - s.w.f.x[s.i(a)])
      return [m - s.w.f.bar[s.i(a)], d]
    }
    const [ahead, d] = shockAt(150)
    const [behind] = shockAt(-150)
    expect(ahead).toBeCloseTo(M.contagion.shock * (1 - d / M.contagion.front), 9)
    expect(ahead).toBeGreaterThan(9)
    expect(behind).toBeCloseTo(0, 9)
  })
  it('a chain of breaks travels one link per tick, and visiting order does not change it', () => {
    const go = (rev: boolean) => {
      const s = new W(3)
      SIDES_SET(s)
      s.w.scratch.reverse = rev
      const hs = [-115, -75, -35, 5, 45].map(z => s.spawn(0, -100, z))
      for (const h of hs) s.set(h, 0.14)
      s.breakNow(hs[0])
      s.run(2)
      return { ticks: hs.map(h => s.w.f.brokeTick[s.i(h)] - s.w.f.brokeTick[s.i(hs[0])]), hash: hex(hashWorld(s.w)) }
    }
    const fwd = go(false)
    const rev = go(true)
    expect(fwd.ticks).toEqual([0, 1, 2, 3, 4])
    expect(rev).toEqual(fwd)
  })
})

describe('flank support', () => {
  // P-34: each secured flank adds support.bonus to the effective bar, so the bar it routs at moves down by it
  const lone = () => {
    const s = new W()
    return [s, s.spawn(0, -60, -35)] as const
  }
  const between = () => {
    const s = new W()
    return [s, [-75, -35, 5].map(z => s.spawn(0, -60, z))[1]] as const
  }
  it('P-34: a line between two friends routs 2 × bonus lower than one alone', () => {
    const B = 2 * M.support.bonus
    for (const [make, at] of [
      [lone, 0],
      [between, -B],
    ] as const) {
      const [s1, h1] = make()
      expect(s1.routsAt(h1, at + 0.5)).toBe(false)
      const [s2, h2] = make()
      expect(s2.routsAt(h2, at - 0.5)).toBe(true)
    }
  })
  it('P-34: a friend ahead or behind gives none, nor does a routing friend', () => {
    for (const dx of [40, -40]) {
      const s = new W()
      const h = s.spawn(0, -60, -35)
      s.spawn(0, -60 + dx, -35)
      expect(s.routsAt(h, -0.5)).toBe(true)
    }
    const s = new W()
    const h = s.spawn(0, -60, -35)
    const f = s.spawn(0, -60, 5)
    expect(s.routsAt(h, 0.5 - M.support.bonus)).toBe(false)
    // routing, standing where it is
    const j = s.i(f)
    s.w.f.mstate[j] = MS_ROUTING
    s.w.f.routPhase[j] = RP_FLED
    expect(s.routsAt(h, -0.5)).toBe(true)
  })
})

describe('a wavering battalion keeps fighting (decision 0087)', () => {
  it('P-24: with no orders, losing men to an enemy in front of it, it stands and fires; it never Retires by itself', () => {
    // side 1 at x = −10 facing west, an enemy firing at it 100 m west; its bar set into wavering (the old fall-back's
    // case)
    const s = new W()
    SIDES_SET(s)
    s.spawn(0, -110, -35, { fire: 'at will' })
    const h = s.spawn(1, -10, -35, { fire: 'at will' })
    const i = s.i(h)
    const men = menOf(s.w, i)
    s.set(h, 0.29)
    let wavering = -1
    let moved = false
    s.run(120, () => {
      if (s.state(h) !== MS_WAVERING) return
      if (wavering < 0) wavering = s.w.meta[M_TICK]
      // the heading is kept to 0.1 mrad
      moved ||= s.w.f.x[i] !== -10 || Math.abs(s.w.f.heading[i] + E) > 1e-4 || s.w.f.ordHead[i] >= 0
    })
    expect(wavering).toBeGreaterThan(0)
    expect(menOf(s.w, i)).toBeLessThan(men)
    expect(moved).toBe(false)
    const last = Math.max(...s.w.f.volleyTick.slice(i * s.w.cr.maxC, i * s.w.cr.maxC + 4))
    expect(last).toBeGreaterThan(wavering) // it fired while wavering
  })
})

describe('the back exposed (decision 0086, sectors-model §§ 5–6)', () => {
  const PI = Math.PI
  const D = napoleonic.morale.drain
  // a battalion spawned on the open field with the shipped ruleset (a line of 400 holding its fire unless told)
  const put = (s: Sim, side: number, x: number, z: number, heading: number, extra: Partial<Command> = {}): number => {
    const slot = s.w.free[s.w.meta[M_FREE] - 1]
    s.cmd({ type: 'debug-spawn', side, x, z, heading, shape: 'line', men: 400, fire: 'hold', ...extra } as Command)
    s.tick()
    expect(s.w.f.alive[slot]).toBe(1)
    return slot
  }
  const field = () => new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)
  // the drain on battalion j a tick after `place` sets the field (j: what it returns)
  const drainOf = (place: (s: Sim) => number): number => {
    const s = field()
    const j = place(s)
    s.tick()
    return s.w.f.drain[j]
  }
  // a line at the origin facing north (+z), side 0
  const line = (s: Sim, extra: Partial<Command> = {}) => put(s, 0, 0, 0, 0, extra)
  const cav = { unit: 'cavalry', men: 256 } as Partial<Command>
  const guns = (shape: string) => ({ unit: 'battery', men: 96, shape }) as Partial<Command>

  it('P-22: a steady line with an enemy on its flank stands at 71 points, still steady; one behind it, 43: shaken', () => {
    const settle = (x: number, z: number, heading: number) => {
      const s = field()
      const j = line(s)
      put(s, 1, x, z, heading)
      s.advance(120)
      return [effectiveBar(s.w, j, 0), MORALE_STATES[s.w.f.mstate[j]]]
    }
    const [mf, sf] = settle(150, 0, -PI / 2)
    expect(mf).toBeCloseTo(100 - D.flank, 9)
    expect(sf).toBe('steady')
    const [mr, sr] = settle(0, -120, 0)
    expect(mr).toBeCloseTo(100 - D.rear, 9)
    expect(sr).toBe('shaken')
  })
  it('P-35: the drain lowers the effective bar at most to wavering, never below, and leaves one already under it', () => {
    const W0 = napoleonic.morale.wavering[0] * 100
    for (const b of [34, 14]) {
      const s = field()
      const j = line(s)
      put(s, 1, 0, -120, 0)
      s.w.f.bar[j] = b
      s.advance(1)
      expect(s.w.f.drain[j]).toBe(D.rear)
      const now = s.w.f.bar[j] // a second's recovery on
      expect(effectiveBar(s.w, j, 0)).toBeCloseTo(Math.min(now, Math.max(W0, now - D.rear)), 9)
      expect(outOfFight(s.w.f.mstate[j])).toBe(false)
    }
  })
  it('P-21: two threats on one flank drain no more than the worse of them', () => {
    const one = drainOf(s => {
      const j = line(s)
      put(s, 1, 150, 0, -PI / 2)
      return j
    })
    const two = drainOf(s => {
      const j = line(s)
      put(s, 1, 150, 0, -PI / 2)
      put(s, 1, 250, 0, -PI / 2)
      return j
    })
    expect(one).toBe(D.flank)
    expect(two).toBe(one)
  })
  it('P-23: an enemy in front drains nothing; a square is never drained', () => {
    expect(
      drainOf(s => {
        const j = line(s)
        put(s, 1, 0, 120, PI)
        return j
      }),
    ).toBe(0)
    expect(
      drainOf(s => {
        const j = line(s, { shape: 'square' })
        put(s, 1, 0, -120, 0)
        put(s, 1, 150, 0, -PI / 2)
        return j
      }),
    ).toBe(0)
  })
  it("P-25: a march across an enemy line's front within its range drains; screened by friends, out of range, or with the enemy facing away, nothing", () => {
    // side 0's column of route marches east 150 m north of side 1's line, which faces it
    const march = (extra: (s: Sim) => void = () => {}, z = 150, heading = PI) =>
      drainOf(s => {
        const j = put(s, 0, 0, z, PI / 2, { shape: 'march' })
        put(s, 1, 0, 0, heading === PI ? 0 : heading)
        extra(s)
        return j
      })
    expect(march()).toBeGreaterThan(0.9 * D.flank)
    // a friendly line between them blocks every ray
    expect(march(s => put(s, 0, 0, 75, PI))).toBe(0)
    // beyond the enemy's range (and 300 m)
    expect(march(() => {}, 360)).toBe(0)
    // the enemy faces away
    expect(march(() => {}, 150, 0.0001 + PI)).toBe(0)
  })
  it('P-25: behind a crest, nothing; on level ground, the same enemy on its flank drains', () => {
    // the rise at x ≈ −13 hides lines 150 m apart (fire's test of sight): a 100-man line at x = 25 facing north, its
    // west flank toward an enemy at x = −125 facing east
    const at = (ground: typeof data) => {
      const w = makeWorld(ground, cr, 1, true)
      const spawn = (c: Partial<Command>) => {
        issue(w, { type: 'debug-spawn', shape: 'line', men: 100, fire: 'hold', ...c } as Command)
        advanceTick(w)
      }
      const j = w.free[w.meta[M_FREE] - 1]
      spawn({ side: 0, x: 25, z: -165, heading: 0 })
      spawn({ side: 1, x: -125, z: -165, heading: Math.PI / 2 })
      advanceTick(w)
      return w.f.drain[j]
    }
    expect(at(data)).toBe(0)
    expect(at(levelled(data))).toBeGreaterThan(0)
  })
  it("P-25: musketry with one ray of three clear of the target's friends still drains", () => {
    const s = field()
    const j = line(s)
    const e = put(s, 1, 150, 0, -PI / 2)
    // a small friend between them, across two of the three rays from the enemy's company nearest the target
    put(s, 0, 120, -8, PI, { men: 60 })
    s.tick()
    const G = blockGeometry(s.w)
    const CS = s.w.cr.maxC
    let near = [Infinity, -1, -1]
    for (let p = 0; p < 4; p++) {
      for (let q = 0; q < 4; q++) {
        const [k, m] = [e * CS + p, j * CS + q]
        const d = (G.cx[m] - G.cx[k]) ** 2 + (G.cz[m] - G.cz[k]) ** 2
        if (d < near[0]) near = [d, k, m]
      }
    }
    expect(screenShare(s.w, G, near[1], near[2], 0)).toBeCloseTo(1 / 3, 9)
    expect(s.w.f.drain[j]).toBe(D.flank)
  })
  it('P-26: a limbered battery is no threat, an unlimbered one is; cavalry within 200 m is, blown, beyond 200 m, in march column or screened it is not', () => {
    const flank = (extra: Partial<Command>, x = 150, then: (s: Sim, e: number) => void = () => {}) =>
      drainOf(s => {
        const j = line(s)
        const e = put(s, 1, x, 0, -PI / 2, extra)
        then(s, e)
        return j
      })
    expect(flank(guns('limbered'))).toBe(0)
    expect(flank(guns('unlimbered'))).toBe(D.flank)
    expect(flank(cav)).toBe(D.flank)
    expect(flank(cav, 280)).toBe(0)
    expect(flank({ ...cav, shape: 'march' })).toBe(0)
    expect(flank(cav, 150, (s, e) => (s.w.f.blownUntil[e] = s.w.meta[M_TICK] + 100))).toBe(0)
    expect(
      drainOf(s => {
        const j = line(s)
        put(s, 0, 100, 0, -PI / 2)
        put(s, 1, 170, 0, -PI / 2, cav)
        return j
      }),
    ).toBe(0)
  })
  it('P-27: the reversed visiting order gives the same state', () => {
    const go = (rev: boolean) => {
      const s = field()
      s.w.scratch.reverse = rev
      line(s, { fire: 'at will' })
      put(s, 0, 160, 60, 0, { fire: 'at will' })
      put(s, 1, 0, 110, PI, { fire: 'at will' })
      put(s, 1, 180, 0, -PI / 2, cav)
      const g = put(s, 1, -170, 30, PI / 2, guns('limbered'))
      s.cmd({ type: 'form', id: makeHandle(KIND_FORMATION, g, s.w.f.gen[g]), shape: 'unlimbered' } as Command)
      s.advance(90)
      const f = s.w.f
      return JSON.stringify([f.x, f.z, f.heading, f.men, f.bar, f.mstate, f.shape, f.trans].map(a => [...a]))
    }
    expect(go(true)).toBe(go(false))
  })
})

describe('determinism', () => {
  // long (11.5 s) but not longIt: the brigade scenario's only test, the only one to reach its first rout (tick 13701)
  it('the brigade: its replay reproduces', () => {
    const cr = shipped
    const sc = brigade(100)
    const run = record(lev, cr, sc, 2, 14000, () => {})
    expect(play(run.replay, lev, cr, sc, run.hashes)).toBeNull()
  })
  it('a save taken with one battalion rallying, one routing and one wavering reproduces', () => {
    // side 0: a router that runs to the west edge and rallies, a second routing, and east of the stream a
    // wavering line in a firefight with side 1's line 60 m in front of it (side 1 stays east: the edge is safe)
    const s = new W()
    SIDES_SET(s)
    const r1 = s.spawn(0, -60, -35)
    const r2 = s.spawn(0, -60, 25)
    s.spawn(1, 170, -95)
    const wv = s.spawn(0, 110, -95, { fire: 'at will' })
    const until = (ok: () => boolean) => {
      for (let n = 0; n < 20 * 600 && !ok(); n++) s.tick()
      expect(ok()).toBe(true)
    }
    s.breakNow(r1)
    until(() => s.state(r1) === MS_RALLYING)
    s.set(wv, 0.25)
    s.breakNow(r2)
    s.tick()
    expect([s.state(r1), s.state(r2), s.state(wv)]).toEqual([MS_RALLYING, MS_ROUTING, MS_WAVERING])
    const w2 = deserialize(serialize(s.w), lev, cr, true, levTerrain)
    for (let n = 0; n < 1200; n++) {
      advanceTick(s.w)
      advanceTick(w2)
    }
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(s.w)))
  })
})
