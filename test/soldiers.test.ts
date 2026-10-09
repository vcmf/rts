// The soldier layer (src/render/soldiers.ts) against the real sim: the prototype's soldier-level checks
// (tools/formation-measure.js), the slot assignment, Face about, cost.
import { describe, it, expect } from 'vitest'
import { Sim, STREAM_X } from './fx.ts'
import { buildScene } from '../src/render/scene.ts'
import { SoldierLayer } from '../src/render/soldiers.ts'
import { occupied } from '../src/sim/index.ts'

// the sim at 20 Hz, frames at 30 Hz, as the page runs them
class Play {
  sim: Sim; layer: SoldierLayer; acc = 0
  constructor(sim = new Sim()) { this.sim = sim; this.layer = new SoldierLayer(sim.w, buildScene(sim.w)) }
  frames(sec: number): void { for (let n = Math.round(sec * 30); n > 0; n--) { this.acc += 1 / 30; while (this.acc >= 0.05) { this.sim.tick(); this.acc -= 0.05 } this.layer.step(1 / 30, this.acc / 0.05) } }
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
  it('halted in the wood, no man moves more than 0.05 m in 10 s (six halt points)', () => {
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
  it('after casualties the living equal the sim\'s men, one per filled slot', () => {
    const p = new Play(), h = p.sim.spawn(-20, -40, 0); p.frames(1)
    for (let n = 0; n < 5; n++) { p.sim.order({ type: 'debug-kill', id: h, men: 10 }); p.frames(3) }
    p.sim.order({ type: 'debug-kill', id: h, men: 30 }); p.frames(5)
    p.sim.order({ type: 'form', id: h, shape: 'square' }); p.frames(110)
    const i = p.sim.slot(h), g = p.sim.w.cr.geo, live = p.men(h).filter(m => m.alive)
    expect(live.length).toBe(p.sim.men(h))
    const slots = new Set(live.map(m => m.s)); expect(slots.size).toBe(live.length)
    for (const m of live) { const c = Math.floor(m.s / (g.ranks * g.files)), r = Math.floor((m.s % (g.ranks * g.files)) / g.files), f = m.s % g.files; expect(occupied(p.sim.w, i, c, r, f)).toBe(true) }
    expect(p.men(h).filter(m => !m.alive).length).toBe(80)
  })
  // a line flips its files (the lean bit changes too); a square keeps them, so only the faces count shows the turn
  it('Face about relabels the men: those in complete files keep their places', () => {
    for (const [shape, men] of [['line', 100], ['line', 97], ['square', 100], ['square', 97]] as const) {
      const p = new Play(), h = p.sim.spawn(-20, -40, 0, shape, men); p.frames(5)
      const g = p.sim.w.cr.geo, i = p.sim.slot(h), RF = g.ranks * g.files, pt = [0, 0, 0]
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

describe('cost', () => {
  it('40 battalions: sim and soldier layer per 1/60 s frame (budget 4 ms)', () => {
    const p = new Play(), shapes = Object.keys(p.sim.w.cr.rs.formations)
    for (let k = 0; k < 40; k++) { const h = p.sim.spawn(-150 + (k % 8) * 38, -150 + Math.floor(k / 8) * 55, 0)
      p.sim.cmd({ type: 'form', id: h, shape: shapes[k % shapes.length] }); p.sim.cmd({ type: 'move', id: h, points: [[p.sim.x(h) + ((k * 7) % 30) - 15, p.sim.z(h) + 40]], append: true }) }
    p.frames(30)
    // three windows of 120 frames, judged on the best: a busy machine slows a window, never speeds one up
    const windows: number[] = []
    for (let k = 0; k < 3; k++) {
      const t0 = process.hrtime.bigint(); for (let n = 0; n < 120; n++) { p.acc += 1 / 60; while (p.acc >= 0.05) { p.sim.tick(); p.acc -= 0.05 } p.layer.step(1 / 60, p.acc / 0.05) }
      windows.push(Number(process.hrtime.bigint() - t0) / 1e6 / 120)
    }
    const ms = Math.min(...windows)
    console.log(`40 battalions, 4000 men: ${windows.map(x => x.toFixed(2)).join(' / ')} ms per frame (sim + soldiers)`)
    expect(ms).toBeLessThan(4)
  })
})
