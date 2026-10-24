// The casualty re-packing gate (docs/plans/active/s1c3-repack-gate.md): a man's fall never leaves another
// man standing newly on impassable ground. The cases are the probe's (tools/repack-probe.ts): every place
// on the formation field where an ungated loss did that.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { Sim, data, cr, root } from './fx.ts'
import {
  buildTerrain,
  rebuildImpassable,
  cellK,
  anyWet,
  removeMan,
  occupied,
  makeWorld,
  ST_HALTED,
  issue,
  advanceTick,
  M_FREE,
} from '../src/sim/index.ts'

interface Case {
  shape: string
  heading: number
  x: number
  z: number
  n: number
}
const cases: Case[] = JSON.parse(fs.readFileSync(path.join(root, 'test', 'fixtures', 'repack-events.json'), 'utf8'))
const C = cr.types[0].C
const CS = cr.maxC // the S1a block's companies; the stride of the per-company rows

describe('the re-packing gate', () => {
  it(`at each of the ${cases.length} places the probe found, the ungated loss wets a bin and the gated one does not`, () => {
    let ungatedWet = 0
    for (const e of cases) {
      for (const gated of [false, true]) {
        const s = new Sim()
        const h = s.spawn(e.x, e.z, e.heading, e.shape, 100)
        const i = s.slot(h)
        expect(anyWet(s.w, i)).toBe(false)
        for (let n = 0; n <= e.n; n++) {
          const c = n % C
          const men = s.men(h)
          if (gated) removeMan(s.w, i, c)
          else s.w.f.men[i * CS + c]--
          expect(s.men(h)).toBe(men - 1) // a man fell, whichever company he was in
          if (!gated && anyWet(s.w, i)) {
            ungatedWet++
            break
          }
          if (gated) {
            expect({ ...e, step: n, wet: anyWet(s.w, i) }).toEqual({ ...e, step: n, wet: false })
            expect(s.w.f.pressed[i]).toBe(0)
          }
        }
      }
    }
    expect(ungatedWet).toBe(cases.length) // the fixtures are real cases: without the gate each one wets a bin
  })

  it('a reduced sweep along the bank at diagonal headings: no loss leaves a man newly on impassable ground', () => {
    const t = buildTerrain(data, cr)
    let positions = 0
    let ungatedWet = 0
    for (const shape of ['column', 'march']) {
      for (const heading of [(-3 * Math.PI) / 4, -Math.PI / 4, (3 * Math.PI) / 4]) {
        for (const z of [-160, -80, 0, 80]) {
          for (let x = 45; x <= 66; x += 0.5) {
            for (const gated of [false, true]) {
              const w = makeWorld(data, cr, 1, false, t)
              const i = w.free[w.meta[M_FREE] - 1]
              issue(w, { type: 'debug-spawn', side: 0, x, z, heading, shape, men: 100, fire: 'hold' })
              advanceTick(w)
              if (!w.f.alive[i] || anyWet(w, i)) continue
              if (gated) positions++
              for (let n = 0; n < 12; n++) {
                if (gated) {
                  removeMan(w, i, n % C)
                  expect({ shape, heading, x, z, n, wet: anyWet(w, i) }).toEqual({
                    shape,
                    heading,
                    x,
                    z,
                    n,
                    wet: false,
                  })
                } else {
                  w.f.men[i * CS + (n % C)]--
                  if (anyWet(w, i)) {
                    ungatedWet++
                    break
                  }
                }
              }
              if (gated) expect(w.f.pressed[i]).toBe(0)
            }
          }
        }
      }
    }
    expect(positions).toBeGreaterThan(200)
    expect(ungatedWet).toBeGreaterThan(0) // the sweep holds cases that need the gate (4 of 610 when written)
  })
  // below ranks + 2 men the last men gather into one full-depth file, so the block can deepen by a rank: real
  // companies (25) never get there, and the gate covers them anyway
  it('from 5 men up, a loss never widens a company: every slot filled after it lies in the block filled before', () => {
    const g = cr.types[0].geo
    const s = new Sim()
    const bad: string[] = []
    for (const shape of Object.keys(cr.rs.types.infantry.formations)) {
      for (const lean of [0, 1]) {
        for (let m = g.ranks + 2; m <= g.ranks * g.files; m++) {
          for (let c = 0; c < C; c++) {
            const h = s.spawn(-100, -100, 0, shape, 100)
            const i = s.slot(h)
            s.w.f.lean[i] = lean
            for (let q = 0; q < C; q++) s.w.f.men[i * CS + q] = m
            const filled = () => {
              const out: boolean[][][] = []
              for (let q = 0; q < C; q++) {
                out.push([])
                for (let r = 0; r < g.ranks; r++) {
                  out[q].push([])
                  for (let f = 0; f < g.files; f++) out[q][r].push(occupied(s.w, i, q, r, f))
                }
              }
              return out
            }
            const before = filled()
            s.w.f.men[i * CS + c]--
            const after = filled()
            for (let q = 0; q < C; q++) {
              let r0 = Infinity
              let r1 = -1
              let f0 = Infinity
              let f1 = -1
              for (let r = 0; r < g.ranks; r++) {
                for (let f = 0; f < g.files; f++) {
                  if (before[q][r][f]) {
                    r0 = Math.min(r0, r)
                    r1 = Math.max(r1, r)
                    f0 = Math.min(f0, f)
                    f1 = Math.max(f1, f)
                  }
                }
              }
              for (let r = 0; r < g.ranks; r++) {
                for (let f = 0; f < g.files; f++) {
                  if (after[q][r][f] && !before[q][r][f] && (r < r0 || r > r1 || f < f0 || f > f1)) {
                    bad.push(`${shape} lean ${lean} men ${m} −1 in ${c}: company ${q} slot r${r} f${f}`)
                  }
                }
              }
            }
            s.order({ type: 'debug-kill', id: h, men: 100 }) // reaped: the slot is free again
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('when no company can take a loss without wetting a slot, it stands and is counted as pressed', () => {
    // one company with men (no alternative), on open ground; deep water painted under the slots its next loss
    // newly fills (25 → 24: the fill re-centres), where no man stands now
    const t = buildTerrain(data, cr)
    const s = new Sim(1, undefined, t)
    const h = s.spawn(-100, -100, 0, 'column', 100)
    const i = s.slot(h)
    s.w.f.men.fill(0, i * CS, i * CS + C)
    s.w.f.men[i * CS] = 25
    const standing = new Set(s.places(h).map(p => cellK(t, p[0], p[1])))
    const before = new Set(s.places(h).map(p => p[3]))
    s.w.f.men[i * CS]--
    const fresh = s.places(h).filter(p => !before.has(p[3]) && !standing.has(cellK(t, p[0], p[1])))
    s.w.f.men[i * CS]++
    expect(fresh.length).toBeGreaterThan(0)
    for (const p of fresh) t.depth[cellK(t, p[0], p[1])] = 5
    rebuildImpassable(t)
    expect(anyWet(s.w, i)).toBe(false)
    s.w.f.status[i] = ST_HALTED // a router halted at the bank this tick: the fallback must not overwrite it
    removeMan(s.w, i, 0)
    expect(s.w.f.men[i * CS]).toBe(24)
    expect(s.w.f.pressed[i]).toBe(1)
    expect(s.w.f.status[i]).toBe(ST_HALTED) // a count, not a status: 'halted' still tells the rout it halted
  })
  it('the gate judges men, not bins: a man moving onto water in a bin already wet is still caught', () => {
    // the same company, now standing in water everywhere it stands (every bin already wet), plus the slots its
    // next loss newly fills: a check by bin would see nothing new; by slot it sees the newly wet men
    const t = buildTerrain(data, cr)
    const s = new Sim(1, undefined, t)
    const h = s.spawn(-100, -100, 0, 'column', 100)
    const i = s.slot(h)
    s.w.f.men.fill(0, i * CS, i * CS + C)
    s.w.f.men[i * CS] = 25
    const before = new Set(s.places(h).map(p => p[3]))
    const standing = s.places(h).map(p => cellK(t, p[0], p[1]))
    s.w.f.men[i * CS]--
    const fresh = s.places(h).filter(p => !before.has(p[3]) && !standing.includes(cellK(t, p[0], p[1])))
    s.w.f.men[i * CS]++
    expect(fresh.length).toBeGreaterThan(0)
    for (const k of standing) t.depth[k] = 5
    for (const p of fresh) t.depth[cellK(t, p[0], p[1])] = 5
    rebuildImpassable(t)
    expect(anyWet(s.w, i)).toBe(true)
    removeMan(s.w, i, 0)
    expect(s.w.f.pressed[i]).toBe(1)
  })
})
