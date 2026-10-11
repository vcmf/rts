// The soldier layer (src/render/soldiers.ts) against the real sim: the prototype's soldier-level checks
// (tools/formation-measure.js), the slot assignment, Face about, cost.
import { describe, it, expect } from 'vitest'
import { Sim, STREAM_X, longIt, ceiling, small, openBattlefield, OPEN_DATA } from './fx.ts'
import { buildScene } from '../src/render/scene.ts'
import { SoldierLayer } from '../src/render/soldiers.ts'
import { occupied, advanceTick, MS_SHATTERED, type Meter } from '../src/sim/index.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'

// the sim at 20 Hz, frames at 30 Hz, as the page runs them
// (`dt`: the soldier layer's step; the page's 8× takes 0.2 s steps, MEN_STEPS in src/app/main.ts)
class Play {
  sim: Sim; layer: SoldierLayer; acc = 0; dt: number
  constructor(sim = new Sim(), dt = 1 / 30) { this.sim = sim; this.dt = dt; this.layer = new SoldierLayer(sim.w, buildScene(sim.w)) }
  // `sec` exactly, in frames of `dt` (the last one shorter); the layer syncs after every tick, as the page does
  frames(sec: number): void { for (let left = sec; left > 1e-9; left -= this.dt) { const d = Math.min(this.dt, left); this.acc += d; while (this.acc >= 0.05 - 1e-9) { this.sim.tick(); this.layer.sync(0, this.sim.takeDeparted()); this.acc -= 0.05 } this.layer.step(d, this.acc / 0.05) } }
  // worst slot error sampled every 0.5 s while `sec` pass
  worst(sec: number): { max: number; mean: number } { let max = 0, mean = 0; for (let n = 0; n < sec * 2; n++) { this.frames(0.5); const e = this.layer.slotError(); max = Math.max(max, e.max); mean = Math.max(mean, e.mean) } return { max, mean } }
  men(h: number) { return this.layer.units.get(this.sim.slot(h))!.men }
}

describe('the soldier layer follows the sim', () => {
  it('at rest the men hold their places', () => {
    const p = new Play(), h = p.sim.spawn(-20, -40, 0); void h
    p.frames(5); const e = p.worst(5)
    expect(e.max).toBeLessThan(0.3)
  })
  it('slot error stays small through line → square, a march column turning, and the wood', () => {
    const a = new Play(), ha = a.sim.spawn(-20, -40, 0)
    a.sim.order({ type: 'form', id: ha, shape: 'square' }); const sq = a.worst(110)
    const b = new Play(), hb = b.sim.spawn(-20, -40, 0)
    b.sim.order({ type: 'form', id: hb, shape: 'march' }); b.frames(22)
    b.sim.order({ type: 'move', id: hb, points: [[b.sim.x(hb) + 60, b.sim.z(hb) + 30]], append: false }); const mt = b.worst(60)
    const c = new Play(), hc = c.sim.spawn(-45, 55 - 30 - 12, 0)
    c.sim.order({ type: 'move', id: hc, points: [[-45, 55 - 30 - 12], [-45, 55 + 30 + 14]], append: false }); const wd = c.worst(200)
    console.log('slot error', { lineToSquare: sq, marchTurn: mt, wood: wd })
    expect(sq.max).toBeLessThan(2); expect(mt.max).toBeLessThan(1.5); expect(wd.max).toBeLessThan(5); expect(wd.mean).toBeLessThan(1)
  })
  // (a column on a curved trail straightens into blocks as a change begins, and its men take a few seconds to
  // follow, as a battalion's do: these march straight, so the change's own error shows)
  it('troopers keep up at the walk and the trot and through their changes; gunners fall in once the battery has deployed', () => {
    const run = (unit: string, shape: string, men: number, to: string, sec: number) => {
      // on the battlefield, levelled and open: a regiment's line is 157 m and its column of route 190 m
      const p = new Play(new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)), h = p.sim.spawn(-120, -150, 0, shape, men, 0, unit); p.frames(2)
      p.sim.order({ type: 'move', id: h, points: [[-120, -40]], append: false }); const move = p.worst(40)
      p.sim.order({ type: 'form', id: h, shape: to }); const change = p.worst(sec); p.frames(20); const after = p.layer.slotError()
      expect(p.sim.busy(h)).toBe(false); expect(p.men(h).filter(m => m.alive).length).toBe(men); expect(p.layer.units.get(p.sim.slot(h))!.type).toBe(unit); expect(p.layer.units.get(p.sim.slot(h))!.figure).toBe(unit === 'cavalry' ? 'mounted' : 'crewed')
      return { move, change, after }
    }
    const walk = run('cavalry', 'line', 250, 'column', 46), trot = run('cavalry', 'march', 250, 'line', 101), guns = run('battery', 'limbered', 96, 'unlimbered', 91)
    console.log('slot error', { walk, trot, guns })
    for (const e of [walk.move, trot.move, guns.move]) expect(e.mean).toBeLessThan(1)
    expect(walk.move.max).toBeLessThan(1); expect(trot.move.max).toBeLessThan(3); expect(guns.move.max).toBeLessThan(1)
    // the rear squadrons' frames peak near 5 m/s in the middle of march → line, over ground slower than the open
    expect(walk.change.max).toBeLessThan(4); expect(trot.change.max).toBeLessThan(12); expect(walk.change.mean + trot.change.mean).toBeLessThan(3)
    for (const e of [walk.after, trot.after, guns.after]) expect(e.max).toBeLessThan(1)   // the battery's gunners, behind their pieces in the change (known-issues), have fallen in
  })
  longIt('halted in the wood, no man moves more than 0.05 m in 10 s (six halt points)', () => {
    for (const [ox, oz] of [[0, 0], [-10, 14], [-6, 6], [-14, -10], [8, 6], [12, -8]]) {
      const p = new Play(), h = p.sim.spawn(-45, 55 - 30 - 12, 0)
      p.sim.order({ type: 'move', id: h, points: [[-45 + ox, 55 + oz]], append: false }); p.frames(240)
      expect(p.sim.busy(h)).toBe(false)
      const before = p.men(h).map(m => [m.x, m.z]); p.frames(10)
      const moved = Math.max(...p.men(h).map((m, k) => Math.hypot(m.x - before[k][0], m.z - before[k][1])))
      expect({ at: [ox, oz], moved: moved <= 0.05 }).toEqual({ at: [ox, oz], moved: true })
    }
  })
})

describe('who stands where', () => {
  it('a battalion that leaves the field takes its men with it: none is left as fallen', () => {
    // a column of route with its tail at the battlefield's southern edge, shattered: it leaves at the next tick
    const p = new Play(new Sim(1, napoleonic, openBattlefield(), OPEN_DATA)), h = p.sim.spawn(0, -505, 0, 'march', 400); p.frames(1)
    const before = p.layer.fallen.length
    p.sim.w.f.mstate[p.sim.slot(h)] = MS_SHATTERED; p.frames(0.2)
    expect(p.sim.slot(h)).toBe(-1); expect(p.layer.units.size).toBe(0); expect(p.layer.fallen.length).toBe(before)
  })
  it('after casualties the living equal the sim\'s men, one per filled slot', () => {
    // it must not break: losses do not move its morale (shattered at 20 of 100, it would run off the field, S1e-1)
    const p = new Play(new Sim(1, { ...small, morale: { ...small.morale, losses: 0, recent: 0 } })), h = p.sim.spawn(-20, -40, 0); p.frames(1)
    for (let n = 0; n < 5; n++) { p.sim.order({ type: 'debug-kill', id: h, men: 10 }); p.frames(3) }
    p.sim.order({ type: 'debug-kill', id: h, men: 30 }); p.frames(5)
    p.sim.order({ type: 'form', id: h, shape: 'square' }); p.frames(110)
    const i = p.sim.slot(h), g = p.sim.w.cr.types[0].geo, live = p.men(h).filter(m => m.alive)
    expect(live.length).toBe(p.sim.men(h))
    const slots = new Set(live.map(m => m.s)); expect(slots.size).toBe(live.length)
    for (const m of live) { const c = Math.floor(m.s / (g.ranks * g.files)), r = Math.floor((m.s % (g.ranks * g.files)) / g.files), f = m.s % g.files; expect(occupied(p.sim.w, i, c, r, f)).toBe(true) }
    expect(p.men(h).filter(m => !m.alive).length).toBe(80)
  })
  // a line flips its files (the lean bit changes too); a square keeps them, so only the faces count shows the turn
  it('Face about relabels the men: those in complete files keep their places', () => {
    for (const [shape, men] of [['line', 100], ['line', 97], ['square', 100], ['square', 97]] as const) {
      const p = new Play(), h = p.sim.spawn(-20, -40, 0, shape, men); p.frames(5)
      const g = p.sim.w.cr.types[0].geo, i = p.sim.slot(h), RF = g.ranks * g.files, pt = [0, 0, 0]
      const full = (s: number) => { const c = Math.floor(s / RF), f = s % g.files; let n = 0; for (let r = 0; r < g.ranks; r++) if (occupied(p.sim.w, i, c, r, f)) n++; return n === g.ranks }
      const before = new Map(p.men(h).filter(m => m.alive).map(m => [m, full(m.s) ? [...p.layer.place(i, m.s, false, pt)] : null]))
      p.sim.order({ type: 'face', id: h }); p.frames(0.1)
      let worst = 0
      for (const [m, b] of before) if (b) { const q = p.layer.place(i, m.s, false, pt); worst = Math.max(worst, Math.hypot(q[0] - b[0], q[1] - b[1])) }
      expect({ shape, men, worst: worst < 1e-6 }).toEqual({ shape, men, worst: true })
    }
  })
  it('a battalion that is gone leaves its men on the ground', () => {
    const p = new Play(), h = p.sim.spawn(-20, -40, 0, 'line', 20); p.frames(2)
    p.sim.order({ type: 'debug-kill', id: h, men: 20 }); p.frames(1)
    expect(p.layer.units.size).toBe(0); expect(p.layer.fallen.length).toBe(20)
  })
  it('men never step into deep water, even when their battalion halts at the bank', () => {
    const p = new Play(), h = p.sim.spawn(40, -30, Math.PI / 2)
    p.sim.order({ type: 'move', id: h, points: [[110, -30]], append: false })
    let worst = 0; for (let n = 0; n < 180; n++) { p.frames(0.5); worst = Math.max(worst, p.men(h).filter(m => m.alive && p.sim.deep(m.x, m.z)).length) }
    expect(worst).toBe(0); expect(STREAM_X(-30)).toBeGreaterThan(p.sim.x(h))
  })
})

describe('at 8× (0.2 s soldier steps)', () => {
  it('the men keep up through a march column\'s turn and the wood, and never enter deep water', () => {
    const b = new Play(new Sim(), 0.2), hb = b.sim.spawn(-20, -40, 0)
    b.sim.order({ type: 'form', id: hb, shape: 'march' }); b.frames(22)
    b.sim.order({ type: 'move', id: hb, points: [[b.sim.x(hb) + 60, b.sim.z(hb) + 30]], append: false }); const mt = b.worst(60)
    const c = new Play(new Sim(), 0.2), hc = c.sim.spawn(-45, 55 - 30 - 12, 0)
    c.sim.order({ type: 'move', id: hc, points: [[-45, 55 - 30 - 12], [-45, 55 + 30 + 14]], append: false }); const wd = c.worst(200)
    const r = new Play(new Sim(), 0.2), hr = r.sim.spawn(40, -30, Math.PI / 2)
    r.sim.order({ type: 'move', id: hr, points: [[110, -30]], append: false })
    let wet = 0; for (let n = 0; n < 180; n++) { r.frames(0.5); wet = Math.max(wet, r.men(hr).filter(m => m.alive && r.sim.deep(m.x, m.z)).length) }
    console.log('8×', { marchTurn: mt, wood: wd })
    expect(mt.max).toBeLessThan(1.5); expect(wd.max).toBeLessThan(6); expect(wd.mean).toBeLessThan(1.2); expect(wet).toBe(0)
  })
})

// timing budgets: skipped on CI, whose shared runners are too noisy for millisecond budgets. The benches use
// the shipped ruleset: 40 battalions of 400 (decision 0018), in columns so they fit the 360 m field. Firing at
// the halt meets the 4 ms budget for sim and soldier layer together (S1c-5: 0.7 ms). With all 16,000 men
// marching it does not (issue #36): that test holds the measured cost with a margin,
// MARCH_BUDGET, so it cannot grow unnoticed. vitest runs this code about 40% slower than plain Node (the
// page's numbers: tools/bench-cost.ts)
const FRAME_BUDGET = 4, MARCH_BUDGET = 12   // 12: S1e-1's tighter grid (every shape on the field) measures 9.2–9.9 ms on main; the old grid's 10 kept the same margin over about 8
describe.skipIf(process.env.CI)('cost', () => {
  const shipped = () => new Sim(1, napoleonic)
  it('40 battalions of 400 firing (20 a side in column, fronts 100 m apart): sim and soldier layer per frame; the fire step per tick reported', () => {
    const p = new Play(shipped()), E = Math.PI / 2
    for (let row = 0; row < 5; row++) for (let r = 0; r < 4; r++) { const z = -150 + row * 60; p.sim.spawn(-115 - r * 20, z, E, 'column', 400, 0); p.sim.spawn(-15 + r * 20, z, -E, 'column', 400, 1) }
    p.frames(20)
    const windows: number[] = []
    for (let k = 0; k < 3; k++) {
      const t0 = process.hrtime.bigint(); for (let n = 0; n < 120; n++) { p.acc += 1 / 60; while (p.acc >= 0.05) { p.sim.tick(); p.layer.sync(0); p.acc -= 0.05 } p.layer.step(1 / 60, p.acc / 0.05) }
      windows.push(Number(process.hrtime.bigint() - t0) / 1e6 / 120)
    }
    // the tick's steps, metered over 200 ticks
    const per: Record<string, number> = {}, worst: Record<string, number> = {}, meter: Meter = { now: () => Number(process.hrtime.bigint()) / 1e6, add: (s, ms) => { per[s] = (per[s] ?? 0) + ms; worst[s] = Math.max(worst[s] ?? 0, ms) } }
    for (let n = 0; n < 200; n++) advanceTick(p.sim.w, meter)
    const fired = [...p.sim.w.f.volleyTick].filter(t => t > 0).length
    console.log(`40 × 400 firing: ${windows.map(x => x.toFixed(2)).join(' / ')} ms per frame; per tick: ${Object.entries(per).map(([s, ms]) => `${s} ${(ms / 200).toFixed(3)}`).join(', ')} ms; the fire step's worst tick ${worst['8 fire'].toFixed(2)} ms; ${fired} companies have fired`)
    expect(fired).toBeGreaterThan(20)
    expect(Math.min(...windows)).toBeLessThan(FRAME_BUDGET)
  })
  it('40 battalions of 400 changing shape and marching: sim and soldier layer per 1/60 s frame; 40 × 800 reported', () => {
    const run = (sim: Sim, men: number) => {
      const p = new Play(sim), shapes = Object.keys(p.sim.w.cr.rs.types.infantry.formations)
      for (let k = 0; k < 40; k++) { const h = p.sim.spawn(-120 + (k % 7) * 25, -80 + Math.floor(k / 7) * 40, 0, 'column', men)
        p.sim.cmd({ type: 'form', id: h, shape: shapes[k % shapes.length] }); p.sim.cmd({ type: 'move', id: h, points: [[p.sim.x(h), p.sim.z(h) + 40]], append: true }) }
      p.frames(30)
      // three windows of 120 frames, judged on the best: a busy machine slows a window, never speeds one up
      const windows: number[] = []
      for (let k = 0; k < 3; k++) {
        const t0 = process.hrtime.bigint(); for (let n = 0; n < 120; n++) { p.acc += 1 / 60; while (p.acc >= 0.05) { p.sim.tick(); p.layer.sync(0); p.acc -= 0.05 } p.layer.step(1 / 60, p.acc / 0.05) }
        windows.push(Number(process.hrtime.bigint() - t0) / 1e6 / 120)
      }
      console.log(`40 × ${men}: ${windows.map(x => x.toFixed(2)).join(' / ')} ms per frame (sim + soldiers)`)
      return Math.min(...windows)
    }
    const ms = run(shipped(), 400)
    run(new Sim(1, ceiling), 800)
    expect(ms).toBeLessThan(MARCH_BUDGET)
  })
})
