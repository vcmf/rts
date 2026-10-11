// Charges, melee and the square against cavalry (S1d-2, docs/plans/active/s1d2-charges.md, docs/systems/melee.md):
// the command's refusals, the charge's paces and momentum, the gap and the side struck, how far a battalion is
// braced, the test before contact, the impact, melee and its end, the recoil, the standing behaviour, and
// determinism. Most cases stand on an open, level field; the golden plays the page's scenario on the real one.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { Sim, data, root, longIt } from './fx.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import { s1dCharge, chargeFight } from '../src/scenarios/s1d-charge.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { buildTerrain, rebuildImpassable, compileRuleset, makeWorld, advanceTick, record, play, serialize, deserialize, hashWorld, hex, issue,
  bracedOf, gapBetween, sideStruck, Q_FRONT, Q_FLANK, Q_REAR, CH_CLOSING, CH_TESTED, CH_PURSUIT, MS_ROUTING, M_TICK, MORALE_STATES, outOfFight, makeHandle, KIND_FORMATION,
  type Terrain, type Ruleset } from '../src/sim/index.ts'

const PI = Math.PI
const crN = compileRuleset(napoleonic)
const open = (): Terrain => {
  const t = buildTerrain(levelled(data), crN); t.cls.fill(Object.keys(napoleonic.terrain).indexOf('open')); t.depth.fill(0); rebuildImpassable(t)
  return t
}
const FIELD = open()
// the shipped ruleset with the melee numbers changed (noSquare: no battalion forms square by itself)
const withMelee = (m: Partial<Ruleset['melee']>): Ruleset => ({ ...napoleonic, melee: { ...napoleonic.melee, ...m } })
const noSquare = withMelee({ refuge: { ...napoleonic.melee.refuge, alert: 0 } })

class S extends Sim {
  constructor(seed = 1, rs: Ruleset = napoleonic) { super(seed, rs, FIELD) }
  inf(x: number, z: number, heading: number, side = 1, shape = 'line', quality?: number): number {
    const slot = this.w.free[this.w.meta[1] - 1]
    this.cmd({ type: 'debug-spawn', side, x, z, heading, shape, men: 400, fire: 'hold', quality }); this.tick()
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  cav(x: number, z: number, heading: number, side = 0, shape = 'line', quality?: number): number {
    const slot = this.w.free[this.w.meta[1] - 1]
    this.cmd({ type: 'debug-spawn', side, unit: 'cavalry', x, z, heading, shape, men: 256, fire: 'hold', quality }); this.tick()
    return makeHandle(KIND_FORMATION, slot, this.w.f.gen[slot])
  }
  // the reasons the command was dropped, applied now
  why(c: Parameters<Sim['cmd']>[0]): string[] { const n = this.dropped.length; this.order(c); return this.dropped.slice(n).map(d => d.reason) }
  charge(a: number, b: number): string[] { return this.why({ type: 'charge', id: a, target: b }) }
  f(h: number, k: keyof Sim['w']['f']): number { return (this.w.f[k] as ArrayLike<number>)[this.slot(h)] }
  out(h: number): boolean { return outOfFight(this.f(h, 'mstate')) }
  state(h: number): string { return MORALE_STATES[this.f(h, 'mstate')] }
}

describe('the command', () => {
  it('is refused for a type that cannot charge, a friendly target, a shape it does not charge from, during a change, and when blown', () => {
    const s = new S(), foe = s.inf(0, 100, PI), inf = s.inf(-100, -100, 0, 0), cav = s.cav(60, -120, 0)
    expect(s.charge(inf, foe)).toEqual(['cannot charge'])
    expect(s.charge(cav, inf)).toEqual(['no such target'])
    s.order({ type: 'form', id: cav, shape: 'march' })
    expect(s.charge(cav, foe)).toEqual(['changing shape'])
    s.until(() => s.busy(cav), 200)
    expect(s.charge(cav, foe)).toEqual(['cannot charge from this shape'])
    s.order({ type: 'form', id: cav, shape: 'column' }); s.until(() => s.busy(cav), 200)
    expect(s.charge(cav, foe)).toEqual([])
    expect(s.f(cav, 'chPhase')).toBe(CH_CLOSING)
  })
})

describe('the charge', () => {
  it('trots, gallops inside gallopAt, and builds momentum only at the gallop', () => {
    const s = new S(1, noSquare), foe = s.inf(0, 120, PI), cav = s.cav(0, -170, 0), ch = napoleonic.types.cavalry.charge!
    s.charge(cav, foe); s.advance(3)
    const v = () => Math.hypot(s.f(cav, 'vx'), s.f(cav, 'vz'))
    expect(s.f(cav, 'chGap')).toBeGreaterThan(ch.gallopAt); expect(v()).toBeGreaterThan(2.8); expect(v()).toBeLessThan(3.4); expect(s.f(cav, 'chRun')).toBe(0)
    s.until(() => s.f(cav, 'chGap') > ch.gallopAt - 30, 60)
    expect(v()).toBeGreaterThan(5.5); expect(v()).toBeLessThan(6.6)
    expect(s.f(cav, 'chRun')).toBeGreaterThan(20); expect(s.f(cav, 'chRun')).toBeLessThan(40)
  })
  it('the gap: face to face, overlapping, and at an angle', () => {
    const s = new S(), a = s.inf(0, 0, 0, 0), b = s.inf(0, 20, PI, 1), g = napoleonic.types.infantry.geometry
    const ia = s.slot(a), ib = s.slot(b)
    expect(gapBetween(s.w, ia, ib)).toBeCloseTo(20 - g.rankSpacing, 2)   // each block reaches half a rank ahead of its front (the heading is kept to 0.1 mrad)
    expect(gapBetween(s.w, ib, ia)).toBeCloseTo(gapBetween(s.w, ia, ib), 9)
    const t = new S(), c = t.inf(0, 0, 0, 0), d = t.inf(0, 0.3, PI, 1)
    expect(gapBetween(t.w, t.slot(c), t.slot(d))).toBe(0)
    const u = new S(), e = u.inf(0, 0, 0, 0), k = u.inf(0, 40, PI - 0.5, 1)
    const ga = gapBetween(u.w, u.slot(e), u.slot(k)); expect(ga).toBeGreaterThan(0); expect(ga).toBeLessThan(40 - 20)   // its near end swings 22 m closer
  })
  it('the side struck: front, flank and rear; a battalion changing shape has no front', () => {
    const s = new S(), t = s.inf(0, 0, 0, 1), a = s.cav(0, 80, PI), b = s.cav(120, -5, -PI / 2), c = s.cav(0, -80, 0)
    expect([a, b, c].map(h => sideStruck(s.w, s.slot(h), s.slot(t)))).toEqual([Q_FRONT, Q_FLANK, Q_REAR])
    s.order({ type: 'form', id: t, shape: 'column' })
    expect(sideStruck(s.w, s.slot(a), s.slot(t))).toBe(Q_FLANK)
  })
  it('braced: a square 1, a line 0; partly while forming square, less as it leaves it', () => {
    const s = new S(), sq = s.inf(-80, 0, 0, 1, 'square'), ln = s.inf(80, 0, 0, 1)
    expect(bracedOf(s.w, s.slot(sq))).toBe(1); expect(bracedOf(s.w, s.slot(ln))).toBe(0)
    s.order({ type: 'form', id: ln, shape: 'square' }); s.order({ type: 'form', id: sq, shape: 'line' })
    const into: number[] = [], out: number[] = []
    for (let k = 0; k < 6; k++) { s.advance(5); into.push(bracedOf(s.w, s.slot(ln))); out.push(bracedOf(s.w, s.slot(sq))) }
    for (let k = 1; k < 6; k++) { expect(into[k]).toBeGreaterThan(into[k - 1]); expect(out[k]).toBeLessThan(out[k - 1]) }
    expect(into[5]).toBeLessThan(1); expect(out[5]).toBeGreaterThan(0)
    s.advance(120); expect(bracedOf(s.w, s.slot(ln))).toBe(1); expect(bracedOf(s.w, s.slot(sq))).toBe(0)
  })
})

describe('before contact', () => {
  it('a wavering line breaks at the test, before the horses reach it', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = new S(seed, noSquare), foe = s.inf(0, 100, PI, 1, 'line', 0.47), cav = s.cav(0, -150, 0)
      s.advance(60); expect(s.state(foe)).toBe('wavering')
      s.charge(cav, foe); let contact = false
      s.until(() => { if (s.f(cav, 'foe')) contact = true; return !s.out(foe) }, 90)
      expect(s.out(foe)).toBe(true); expect(contact).toBe(false); expect(s.f(cav, 'chGap')).toBeGreaterThan(napoleonic.melee.contact)
    }
  })
  it('the test is taken once per charge', () => {
    const s = new S(1, noSquare), foe = s.inf(0, 100, PI, 1, 'line', 1), cav = s.cav(0, -150, 0)
    s.charge(cav, foe); const seen: number[] = []
    s.until(() => { const p = s.f(cav, 'chPhase'); if (seen.at(-1) !== p) seen.push(p); return !s.f(cav, 'foe') && !s.out(foe) }, 90)
    expect(seen.slice(0, 2)).toEqual([CH_CLOSING, CH_TESTED])
  })
  it('a formed square turns every charge away without contact; the regiment is then blown', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = new S(seed), sq = s.inf(0, 100, PI, 1, 'square'), cav = s.cav(0, -150, 0); let contact = false
      s.charge(cav, sq); s.until(() => { if (s.f(cav, 'foe')) contact = true; return s.f(cav, 'chPhase') !== 0 }, 120)
      expect([contact, s.out(sq), s.f(cav, 'blownUntil') > s.w.meta[M_TICK]]).toEqual([false, false, true])
      if (seed === 1) expect(s.charge(cav, sq)).toEqual(['blown'])
    }
  })
  it('a recoil rides straight away from the target', () => {
    const s = new S(2), sq = s.inf(0, 100, PI, 1, 'square'), cav = s.cav(-60, -100, 0.3)
    s.charge(cav, sq); s.until(() => s.f(cav, 'chPhase') !== 0, 120)
    const d0 = Math.hypot(s.x(cav) - s.x(sq), s.z(cav) - s.z(sq)); s.until(() => s.busy(cav), 120)
    expect(Math.hypot(s.x(cav) - s.x(sq), s.z(cav) - s.z(sq)) - d0).toBeGreaterThan(napoleonic.types.cavalry.charge!.recoil - 10)
  })
})

describe('the impact', () => {
  // the target's losses in the tick of contact (removed in that tick), and the charger's
  const impact = (from: number, seed = 1) => {
    const s = new S(seed, noSquare), foe = s.inf(0, 60, PI, 1, 'line', 1), cav = s.cav(0, 60 - from - 3, 0)
    s.charge(cav, foe); let lost = 0, cl = 0
    for (let k = 0; k < 2000 && !s.f(cav, 'foe'); k++) { const m = s.men(foe), c = s.men(cav); s.tick(); if (s.f(cav, 'foe')) { lost = m - s.men(foe); cl = c - s.men(cav) } }
    return { lost, cl, run: s.f(cav, 'chRun') }
  }
  it('costs the target by momentum; a standing target costs the charger nothing', () => {
    const far = impact(150), near = impact(12)
    expect(far.lost).toBeGreaterThan(2 * near.lost); expect(far.lost).toBeGreaterThan(10)
    expect([far.cl, near.cl]).toEqual([0, 0])
  })
  it('a wavering square may be broken into; a steady one is not', () => {
    const rs = withMelee({ refuse: 0, breach: 1 })
    const go = (q: number) => { const s = new S(1, rs), sq = s.inf(0, 100, PI, 1, 'square', q), cav = s.cav(0, -150, 0); s.advance(60); s.charge(cav, sq)
      let contact = false; s.until(() => { if (s.f(cav, 'foe')) contact = true; return !contact && s.f(cav, 'chPhase') !== 0 }, 120); return contact }
    expect([go(0.47), go(1)]).toEqual([true, false])
  })
})

describe('melee', () => {
  const fight = (qi: number, qc: number, seed = 1) => {
    const s = new S(seed, noSquare), foe = s.inf(0, 60, PI, 1, 'line', qi), cav = s.cav(0, -100, 0, 0, 'line', qc)
    s.charge(cav, foe); s.until(() => !s.f(cav, 'foe') && !s.out(foe), 90)
    return { s, foe, cav }
  }
  it('holds both: no orders, no fire, every command refused; men fall on both sides', () => {
    const { s, foe, cav } = fight(1, 1)
    expect([s.f(cav, 'foe') !== 0, s.f(foe, 'foe') !== 0, s.orders(cav), s.orders(foe)]).toEqual([true, true, 0, 0])
    s.order({ type: 'fire', id: foe, mode: 'at will' })   // dropped: in melee
    expect(s.why({ type: 'move', id: foe, points: [[0, 0]], append: false })).toEqual(['in melee'])
    expect(s.charge(cav, foe)).toEqual(['in melee'])
    const m0 = [s.men(foe), s.men(cav)], v0 = s.w.f.volleyTick.slice(); s.advance(10)
    expect(s.men(foe)).toBeLessThan(m0[0]); expect(s.men(cav)).toBeLessThan(m0[1]); expect([...s.w.f.volleyTick]).toEqual([...v0])
  })
  it('ends at a rout: the regiment pursues the broken line, then is blown', () => {
    const { s, foe, cav } = fight(0.6, 1)
    s.until(() => !s.out(foe) && !s.out(cav), 180)
    expect(s.out(foe)).toBe(true); expect(s.out(cav)).toBe(false)
    s.tick(); expect([s.f(cav, 'foe'), s.f(cav, 'chPhase')]).toEqual([0, CH_PURSUIT])
    const m = s.men(foe); s.until(() => s.f(cav, 'chPhase') === CH_PURSUIT, 30)
    expect(s.men(foe)).toBeLessThan(m)
    expect(s.f(cav, 'blownUntil')).toBeGreaterThan(s.w.meta[M_TICK]); expect(s.orders(cav)).toBe(0)
  })
  it('a regiment turns away when its foe finishes forming square and holds it; the square is out of melee too', () => {
    const quiet = { front: 0, flank: 0, rear: 0 }
    const rs = withMelee({ threat: quiet, impact: { kill: 0, shock: quiet }, rate: 0.001 })
    for (const seed of [1, 3]) {
      const s = new S(seed, rs), foe = s.inf(0, 60, PI, 1, 'line', 1), cav = s.cav(0, -40, 0)
      s.charge(cav, foe); s.until(() => !s.f(cav, 'foe'), 60)
      expect(s.w.f.trans[s.slot(foe)]).toBe(1)   // caught mid-change
      s.until(() => s.f(cav, 'foe') !== 0, 200)
      expect([s.shape(foe), s.out(foe), s.f(foe, 'foe'), s.orders(cav) > 0, s.f(cav, 'blownUntil') > s.w.meta[M_TICK]]).toEqual(['square', false, 0, true, true])
    }
  })
  it('ends at a rout: infantry that sees the regiment break holds where it stands', () => {
    const { s, foe, cav } = fight(1, 0.45)
    s.until(() => !s.out(foe) && !s.out(cav), 180)
    expect(s.out(cav)).toBe(true); expect(s.out(foe)).toBe(false)
    const x = s.x(foe), z = s.z(foe); s.advance(2)
    expect([s.f(foe, 'foe'), s.orders(foe), s.x(foe), s.z(foe)]).toEqual([0, 0, x, z])
  })
})

describe('the square against cavalry (standing behaviour)', () => {
  it('forms square after react against a charging regiment', () => {
    const s = new S(), ln = s.inf(0, 100, PI), cav = s.cav(0, -170, 0)
    s.charge(cav, ln); s.until(() => !s.f(ln, 'alertAt'), 60)
    const t0 = s.t; s.until(() => !s.w.f.trans[s.slot(ln)], 10)
    expect(s.t - t0).toBeCloseTo(napoleonic.melee.refuge.react, 1); expect(s.shape(ln)).toBe('line → square')
  })
  it('forms square against a regiment closing at the walk; not against one riding away, a routing one, or infantry', () => {
    const near = (place: (s: S, ln: number) => void) => { const s = new S(), ln = s.inf(0, 60, PI); place(s, ln); s.advance(20); return s.shape(ln) }
    expect(near((s, ln) => { const c = s.cav(0, -110, 0); s.order({ type: 'move', id: c, points: [[0, 20]], append: false }); void ln })).toBe('line → square')
    expect(near(s => { const c = s.cav(0, -60, PI); s.order({ type: 'move', id: c, points: [[0, -170]], append: false }) })).toBe('line')
    // a router whose side's rear lies past the battalion: it breaks out of reach, then runs toward it and past
    expect(near(s => { const c = s.cav(0, -170, 0); s.order({ type: 'side', side: 0, x: 0, z: 1 }); s.order({ type: 'debug-morale', id: c, quality: 0 }); s.until(() => !s.out(c), 60); s.advance(40) })).toBe('line')
    expect(near(s => { const c = s.inf(0, -100, 0, 0); s.order({ type: 'move', id: c, points: [[0, 20]], append: false }) })).toBe('line')
  })
  it('holds the square while a regiment is near, then forms back into its shape once it has ridden out of reach', () => {
    const s = new S(), ln = s.inf(0, 60, PI), cav = s.cav(0, -110, 0), A = napoleonic.melee.refuge.alert
    s.order({ type: 'move', id: cav, points: [[0, 0]], append: false }); s.until(() => s.shape(ln) !== 'square', 150)
    s.advance(20); expect(s.shape(ln)).toBe('square')   // the regiment stands 60 m off
    s.order({ type: 'move', id: cav, points: [[0, -170]], append: false })
    s.until(() => s.f(cav, 'vz') > -napoleonic.melee.refuge.closing, 300); const away = s.t   // riding away
    const dist = () => Math.hypot(s.x(ln) - s.x(cav), s.z(ln) - s.z(cav))
    s.until(() => dist() <= A, 300); const out = s.t
    expect(s.shape(ln)).toBe('square')   // riding away, but still near
    s.until(() => s.shape(ln) === 'square', 120)
    expect(s.shape(ln)).toBe('square → line'); expect(Math.abs(s.t - Math.max(out, away + napoleonic.melee.refuge.hold))).toBeLessThan(1.5)
    s.until(() => s.busy(ln), 120); expect(s.shape(ln)).toBe('line')
  })
  it('a player\'s order stands it down for the rest of the threat', () => {
    const s = new S(), ln = s.inf(0, 60, PI), cav = s.cav(0, -110, 0)
    s.order({ type: 'move', id: cav, points: [[0, 0]], append: false }); s.until(() => !s.w.f.trans[s.slot(ln)], 20)
    s.order({ type: 'form', id: ln, shape: 'line' }); s.advance(40)
    expect(s.shape(ln)).toBe('line'); expect(s.f(ln, 'autoFrom')).toBe(0)
  })
})

describe('determinism', () => {
  // the order pool is served in visiting order (tick.ts), so two pursuits begun in one tick take different entries:
  // the formations' state is compared, not the hash
  it('the melee step\'s visiting order does not change the result: two regiments on one line', () => {
    const go = (rev: boolean) => {
      const s = new S(3, noSquare); s.w.scratch.reverse = rev
      const foe = s.inf(0, 60, PI, 1, 'line', 1), a = s.cav(-40, -60, 0.2), b = s.cav(90, 40, -PI / 2)
      s.charge(a, foe); s.charge(b, foe); s.advance(90)
      const f = s.w.f
      return JSON.stringify([f.x, f.z, f.heading, f.men, f.morale, f.mstate, f.foe, f.chPhase, f.chRun, f.shockIn].map(a => [...a]))
    }
    expect(go(true)).toBe(go(false))
  })
  it('a save taken mid-melee plays on to the same hashes', () => {
    const w = makeWorld(levelled(data), crN, 4, true, FIELD); chargeFight('cavalry').setup(w)
    while (!w.f.foe[0] && w.meta[M_TICK] < 3000) advanceTick(w)
    expect(w.f.foe[0]).not.toBe(0)
    for (let k = 0; k < 20; k++) advanceTick(w)
    const w2 = deserialize(serialize(w), levelled(data), crN, true, FIELD)
    for (let k = 0; k < 400; k++) { advanceTick(w); advanceTick(w2) }
    expect(hex(hashWorld(w2))).toBe(hex(hashWorld(w)))
  })
  const goldenFile = path.join(root, 'test', 'golden', 's1d-charge.json'), TICKS = 5200
  longIt('the page\'s charges give the committed golden hashes; the replay reproduces them', () => {
    const h = (slot: number) => makeHandle(KIND_FORMATION, slot, 0)
    const run = record(data, crN, s1dCharge, 7, TICKS, (w, ext) => {
      if (w.meta[M_TICK] === 1) ext({ type: 'charge', id: h(0), target: h(1) })
      if (w.meta[M_TICK] === 3600) ext({ type: 'charge', id: h(0), target: h(2) })
    })
    const hashes = run.hashes.map(p => [p.tick, hex(p.hash)])
    if (process.env.UPDATE_GOLDEN) fs.writeFileSync(goldenFile, JSON.stringify({ dataVersion: hex(data.version), ruleset: hex(crN.hash), ticks: TICKS, hashes }) + '\n')
    const golden = JSON.parse(fs.readFileSync(goldenFile, 'utf8'))
    expect([golden.dataVersion, golden.ruleset]).toEqual([hex(data.version), hex(crN.hash)])
    expect(hashes).toEqual(golden.hashes)
    expect(play(run.replay, data, crN, s1dCharge, run.hashes)).toBeNull()
    // the line broke and the square held
    const w = makeWorld(data, crN, 7); s1dCharge.setup(w)
    while (w.meta[M_TICK] < TICKS) { if (w.meta[M_TICK] === 1) issue(w, { type: 'charge', id: h(0), target: h(1) }); if (w.meta[M_TICK] === 3600) issue(w, { type: 'charge', id: h(0), target: h(2) }); advanceTick(w) }
    expect([w.f.mstate[1] >= MS_ROUTING, outOfFight(w.f.mstate[2])]).toEqual([true, false])
  })
})
