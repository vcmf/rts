// The casualty re-packing gate (docs/plans/active/s1c3-repack-gate.md): a man's fall never leaves another
// man standing newly on impassable ground. The cases are the probe's (tools/repack-probe.ts): every place
// on the formation field where an ungated loss did that.
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { Sim, data, cr, root } from './fx.ts'
import { buildTerrain, rebuildImpassable, cellK, wetBins, removeMan, occupied, ST_PRESSED, STATUS } from '../src/sim/index.ts'

interface Case { shape: string; heading: number; x: number; z: number; n: number }
const cases: Case[] = JSON.parse(fs.readFileSync(path.join(root, 'test', 'fixtures', 'repack-events.json'), 'utf8'))
const C = cr.geo.companies

describe('the re-packing gate', () => {
  it(`at each of the ${cases.length} places the probe found, the ungated loss wets a bin and the gated one does not`, () => {
    let ungatedWet = 0
    for (const e of cases) {
      for (const gated of [false, true]) {
        const s = new Sim(), h = s.spawn(e.x, e.z, e.heading, e.shape, 100), i = s.slot(h)
        expect(wetBins(s.w, i)).toBe(0)
        for (let n = 0; n <= e.n; n++) {
          const c = n % C
          if (gated) removeMan(s.w, i, c); else s.w.f.men[i * C + c]--
          if (!gated && wetBins(s.w, i)) { ungatedWet++; break }
          if (gated) { expect({ ...e, step: n, wet: wetBins(s.w, i) }).toEqual({ ...e, step: n, wet: 0 }); expect(s.w.f.status[i]).not.toBe(ST_PRESSED) }
        }
      }
    }
    expect(ungatedWet).toBe(cases.length)   // the fixtures are real cases: without the gate each one wets a bin
  })

  // below ranks + 2 men the last men gather into one full-depth file, so the block can deepen by a rank: real
  // companies (25) never get there, and the gate covers them anyway
  it('from 5 men up, a loss never widens a company: every slot filled after it lies in the block filled before', () => {
    const g = cr.geo, s = new Sim(), bad: string[] = []
    for (const shape of Object.keys(cr.rs.formations)) for (const lean of [0, 1]) for (let m = g.ranks + 2; m <= g.ranks * g.files; m++) for (let c = 0; c < C; c++) {
      const h = s.spawn(-100, -100, 0, shape, 100), i = s.slot(h); s.w.f.lean[i] = lean
      for (let q = 0; q < C; q++) s.w.f.men[i * C + q] = m
      const filled = () => { const out: boolean[][][] = []; for (let q = 0; q < C; q++) { out.push([]); for (let r = 0; r < g.ranks; r++) { out[q].push([]); for (let f = 0; f < g.files; f++) out[q][r].push(occupied(s.w, i, q, r, f)) } } return out }
      const before = filled(); s.w.f.men[i * C + c]--; const after = filled()
      for (let q = 0; q < C; q++) {
        let r0 = Infinity, r1 = -1, f0 = Infinity, f1 = -1
        for (let r = 0; r < g.ranks; r++) for (let f = 0; f < g.files; f++) if (before[q][r][f]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); f0 = Math.min(f0, f); f1 = Math.max(f1, f) }
        for (let r = 0; r < g.ranks; r++) for (let f = 0; f < g.files; f++) if (after[q][r][f] && !before[q][r][f] && (r < r0 || r > r1 || f < f0 || f > f1)) bad.push(`${shape} lean ${lean} men ${m} −1 in ${c}: company ${q} slot r${r} f${f}`)
      }
      s.order({ type: 'debug-kill', id: h, men: 100 })   // reaped: the slot is free again
    }
    expect(bad).toEqual([])
  })

  it('when no company can take a loss without wetting a bin, it stands and the battalion is pressed against the ground', () => {
    // one company with men (no alternative), on open ground; deep water painted under the slots its next loss
    // newly fills (25 → 24: the fill re-centres), where no man stands now
    const t = buildTerrain(data, cr), s = new Sim(1, undefined, t), h = s.spawn(-100, -100, 0, 'column', 100), i = s.slot(h)
    s.w.f.men.fill(0, i * C, i * C + C); s.w.f.men[i * C] = 25
    const standing = new Set(s.places(h).map(p => cellK(t, p[0], p[1]))), before = new Set(s.places(h).map(p => p[3]))
    s.w.f.men[i * C]--; const fresh = s.places(h).filter(p => !before.has(p[3]) && !standing.has(cellK(t, p[0], p[1]))); s.w.f.men[i * C]++
    expect(fresh.length).toBeGreaterThan(0)
    for (const p of fresh) t.depth[cellK(t, p[0], p[1])] = 5
    rebuildImpassable(t)
    expect(wetBins(s.w, i)).toBe(0)
    removeMan(s.w, i, 0)
    expect(s.w.f.men[i * C]).toBe(24)
    expect(STATUS[s.w.f.status[i]]).toBe('pressed against impassable ground')
  })
})
