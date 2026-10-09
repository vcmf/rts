// The formation layer on the spine: the formation-level checks of tools/formation-measure.js (the
// prototype's spec, docs/plans/done/terrain-movement.md), re-expressed against the sim's places.
import { describe, it, expect } from 'vitest'
import { Sim, cr, STREAM_X, DEG, closest, paint, baseTerrain } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { groundG, type Ruleset } from '../src/sim/index.ts'

describe('timed changes', () => {
  it('line → square takes the ruleset time (100 s), and the companies are evened out', () => {
    const s = new Sim(), h = s.spawn(-20, -40, 0, 'line', 97)
    s.order({ type: 'form', id: h, shape: 'square' })
    const t = s.until(() => s.busy(h), 200)
    expect(t).toBeCloseTo(100 - 0.05, 1)
    const C = cr.geo.companies, i = s.slot(h), men = [...s.w.f.men.slice(i * C, i * C + C)]
    expect(Math.max(...men) - Math.min(...men)).toBeLessThanOrEqual(1)
  })
})

describe('partial bad ground: the thicket', () => {
  // a line marches 60 m north; a strip of woods exactly 10 m deep covers the files of n of its 12 bins
  const R = cr.rs, tol = { mean: -Infinity, max: -Infinity }
  const march = (n: number, style: string): [number, number] => {
    const x = -40, z = -90
    let terrain = baseTerrain
    if (n > 0) {
      const probe = new Sim(); const h0 = probe.spawn(x, z, 0)
      // the front-rank places of the first n bins (left to right), and the strip over exactly their files
      const L = probe.layout(h0), RF = cr.geo.ranks * cr.geo.files
      const front = probe.places(h0).filter(p => Math.floor((p[3] % RF) / cr.geo.files) === 0 && Math.floor(p[3] / RF) * 3 + L.of[p[3]] < n).map(p => p[0])
      terrain = paint(baseTerrain, [{ x0: Math.min(...front) - 0.3, z0: z + 15, x1: Math.max(...front) + 0.3, z1: z + 24, cls: 'woods' }])
    }
    const s = new Sim(1, undefined, terrain), h = s.spawn(x, z, 0)
    s.order({ type: 'style', id: h, preset: style })
    s.order({ type: 'move', id: h, points: [[x, z + 60]], append: false })
    const P = R.orders[style]
    let t = 0.1, arrived = -1
    while ((s.busy(h) || Math.max(...s.lags(h)) > 0.05) && t < 300) {
      s.tick(); t += 0.05
      if (arrived < 0 && !s.busy(h)) arrived = t
      const L = s.lags(h), mean = L.reduce((a, l) => a + l, 0) / L.length
      tol.mean = Math.max(tol.mean, mean - P.Lmean); tol.max = Math.max(tol.max, Math.max(...L) - P.Lmax)
    }
    return [arrived, t]
  }
  const research: OrdersPresetTmp = { Lmax: 10, Lmean: 2, tau: 3 }
  type OrdersPresetTmp = { Lmax: number; Lmean: number; tau: number }
  it('scales with the share held up; the full front costs the strip; tolerances hold every tick', () => {
    // the research's tolerances as a fourth preset, compiled into the test's ruleset
    ;(cr.rs.orders as Record<string, OrdersPresetTmp>).research = research
    cr.presets.push('research')
    const T: Record<string, Record<string, number>> = {}
    for (const style of ['research', 'keep', 'normal']) {
      const base = march(0, style), row: Record<string, number> = {}
      for (const n of [1, 3, 6, 12]) row[n + '/12'] = +(march(n, style)[0] - base[0]).toFixed(1)
      T[style] = row
    }
    cr.presets.pop(); delete (cr.rs.orders as Record<string, OrdersPresetTmp>).research
    console.log('thicket', JSON.stringify(T), 'tolerance overshoot', tol)
    const full = 10 / (R.pace.ordinary * R.terrain.woods.g.line) - 10 / R.pace.ordinary
    for (const style of ['research', 'keep', 'normal']) {
      const r = T[style]
      expect(r['1/12'] <= r['3/12'] && r['3/12'] <= r['6/12'] && r['6/12'] <= r['12/12']).toBe(true)
      expect(Math.abs(r['12/12'] - full)).toBeLessThan(0.2 * full)
    }
    for (const k of ['1/12', '3/12', '6/12']) expect(T.research[k] <= T.normal[k] + 0.1 && T.normal[k] <= T.keep[k] + 0.1).toBe(true)
    expect(T.research['1/12']).toBeLessThanOrEqual(1.5)
    expect(T.keep['1/12']).toBeGreaterThanOrEqual(0.6 * full)
    expect(tol.mean).toBeLessThan(0.01); expect(tol.max).toBeLessThan(0.01)
  })
})

describe('impassable ground: deep water', () => {
  for (const [x, z] of [[40, -30], [STREAM_X(52) - 25, 52]]) it(`a line from (${x.toFixed(1)}, ${z}) halts at the bank, nobody in the water on the way`, () => {
    const s = new Sim(), h = s.spawn(x, z, Math.PI / 2)
    s.order({ type: 'move', id: h, points: [[x + 70, z]], append: false })
    let worst = 0; for (let n = 0; n < 180; n++) { s.advance(0.5); worst = Math.max(worst, s.placesInDeep(h)) }
    expect(s.status(h)).toBe('halted: impassable ground'); expect(s.orders(h)).toBe(0); expect(worst).toBe(0)
  })
  it('a march column halted there stays a column: companies a gap apart, all facing on', () => {
    const s = new Sim(), h = s.spawn(30, -30, Math.PI / 2)
    s.order({ type: 'form', id: h, shape: 'march' }); s.advance(25)
    s.order({ type: 'move', id: h, points: [[100, -30]], append: false })
    let worst = 0; for (let n = 0; n < 180; n++) { s.advance(0.5); worst = Math.max(worst, s.placesInDeep(h)) }
    const fr = s.companyFrames(h), gap = cr.geo.files * cr.geo.fileSpacing + 1
    expect(s.status(h)).toBe('halted: impassable ground'); expect(worst).toBe(0)
    for (let c = 1; c < 4; c++) expect(Math.abs(Math.hypot(fr[c].x - fr[c - 1].x, fr[c].z - fr[c - 1].z) - gap)).toBeLessThan(0.3)
    for (const f of fr) expect(Math.abs(f.face - Math.PI / 2)).toBeLessThan(0.05)
  })
  it('a wheel toward the stream stops short of it', () => {
    const s = new Sim(), h = s.spawn(STREAM_X(-30) - 12, -30, Math.PI / 2)
    s.order({ type: 'wheel', id: h, angle: -Math.PI / 4 })
    let worst = 0; for (let n = 0; n < 120; n++) { s.advance(0.5); worst = Math.max(worst, s.placesInDeep(h)) }
    expect(s.status(h)).toBe('halted: impassable ground'); expect(worst).toBe(0)
    expect(Math.abs(Math.PI / 2 - s.heading(h))).toBeGreaterThan(0.1)
  })
  // the line as close to deep water as it can stand, facing it (east, at z = −30)
  const atBank = (s: Sim, z = -30, heading = Math.PI / 2): [number, number] => {
    let x = 40
    for (; x < 150; x += 0.25) { const t = new Sim(), h = t.spawn(x, z, heading); if (t.wet(h)) break }
    x -= 0.25; return [s.spawn(x, z, heading), x]
  }
  it('a square that would stand in the water is refused; 12 m back it is accepted', () => {
    const s = new Sim(), [h, x] = atBank(s)
    s.order({ type: 'form', id: h, shape: 'square' }); s.advance(5)
    expect(s.status(h)).toBe('cannot form: impassable ground'); expect(s.shape(h)).toBe('line')
    const s2 = new Sim(), h2 = s2.spawn(x - 12, -30, Math.PI / 2)
    s2.order({ type: 'form', id: h2, shape: 'square' }); s2.advance(5)
    expect(s2.status(h2)).toBe(''); expect(s2.shape(h2)).toBe('line → square')
  })
  it('a shape ordered during a change is checked too', () => {
    const s = new Sim(), [h] = atBank(s)
    s.order({ type: 'form', id: h, shape: 'column' }); s.advance(5)
    s.order({ type: 'form', id: h, shape: 'square' })
    let worst = 0; for (let n = 0; n < 480; n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)) }
    expect(worst).toBe(0)
  })
  it('thinned lines at the bank: spreading the men into new slots never puts one in the water', () => {
    let accepted = 0, refused = 0, worst = 0
    for (const k of [41, 50, 59]) for (const hd of [5.25, 5.3, 5.35, 5.4, 5.45]) for (const x of [50, 52, 54]) {
      const s = new Sim(), h = s.spawn(x, -28, hd)
      s.order({ type: 'debug-kill', id: h, men: k }); s.advance(1)
      if (s.wet(h)) continue
      s.order({ type: 'form', id: h, shape: 'column' })
      if (s.shape(h).includes('→')) accepted++; else { refused++; continue }
      for (let n = 0; n < 160; n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)) }
    }
    console.log('thinned at the bank', { accepted, refused })
    expect(worst).toBe(0); expect(accepted).toBeGreaterThanOrEqual(5)
  })
  it('a line whose two outer files are empty over the stream may not form column there', () => {
    // 94 men: companies 24, 24, 23, 23; the right half packs toward the colours, so company 3's two
    // outer files stay empty
    let found = -1
    for (let x = 35; x < 70; x += 0.25) {
      const t = new Sim(), h = t.spawn(x, -30, 0, 'line', 94)
      if (t.wet(h)) break
      // company 3's files 7 and 8 (heading 0: files along +x, ranks behind along −z)
      const g = cr.geo, base = t.companyFrames(h)[3], empty: [number, number][] = []
      for (let r = 0; r < g.ranks; r++) for (const f of [7, 8]) empty.push([base.x + (f - (g.files - 1) / 2) * g.fileSpacing, base.z - r * g.rankSpacing])
      if (empty.every(([ex, ez]) => t.deep(ex, ez))) { found = x; break }
    }
    expect(found).toBeGreaterThan(0)
    const s = new Sim(), h = s.spawn(found, -30, 0, 'line', 94)
    s.order({ type: 'form', id: h, shape: 'column' })
    let worst = 0; for (let n = 0; n < 240; n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)) }
    expect(worst).toBe(0)
  })
  it('a unit halted at the bank, ordered on at any angle: ends without oscillating, nobody in the water', () => {
    for (const shape of ['line', 'march']) for (const deg of [30, 60, 90, 120, 180, -90]) {
      const s = new Sim(), h = s.spawn(30, -30, Math.PI / 2)
      if (shape !== 'line') { s.order({ type: 'form', id: h, shape }); s.advance(25) }
      s.order({ type: 'move', id: h, points: [[100, -30]], append: false }); s.advance(90)
      expect(s.status(h)).toBe('halted: impassable ground')
      const hd = s.heading(h) + deg * DEG
      s.order({ type: 'move', id: h, points: [[s.x(h) + Math.sin(hd) * 40, s.z(h) + Math.cos(hd) * 40]], append: false })
      let worst = 0, flips = 0, prev = s.heading(h)
      for (let n = 0; n < 240; n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)); if (Math.abs(Math.atan2(Math.sin(s.heading(h) - prev), Math.cos(s.heading(h) - prev))) > 2) flips++; prev = s.heading(h) }
      expect({ shape, deg, worst, flips, orders: s.orders(h) }).toEqual({ shape, deg, worst: 0, flips: 0, orders: 0 })
    }
  })
  it('Face about lets a halted line or column leave; Retire 30 m steps back in order and faces the front', () => {
    for (const shape of ['line', 'march']) {
      const s = new Sim(), h = s.spawn(30, -30, Math.PI / 2)
      if (shape !== 'line') { s.order({ type: 'form', id: h, shape }); s.advance(25) }
      s.order({ type: 'move', id: h, points: [[100, -30]], append: false }); s.advance(90)
      s.order({ type: 'face', id: h }); s.advance(4)
      s.order({ type: 'move', id: h, points: [[0, -30]], append: false })
      let worst = 0; for (let n = 0; n < 600 && s.busy(h); n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)) }
      expect(Math.hypot(s.x(h), s.z(h) + 30)).toBeLessThan(1); expect(worst).toBe(0)
    }
    const s = new Sim(), [h, x] = atBank(s), h0 = s.heading(h)
    s.order({ type: 'retire', id: h, metres: 30 })
    s.until(() => s.busy(h), 120)
    const back = (x - s.x(h)) * Math.sin(h0) + (-30 - s.z(h)) * Math.cos(h0)
    expect(Math.abs(back - 30)).toBeLessThan(0.5)
    expect(Math.abs(Math.atan2(Math.sin(s.heading(h) - h0), Math.cos(s.heading(h) - h0)))).toBeLessThan(1e-9)
    expect(s.status(h)).toBe('')
  })
  it('a Retire cut short by the water still ends facing the front', () => {
    let x = 40
    for (; x < 150; x += 0.25) { const t = new Sim(), h = t.spawn(x, -30, -Math.PI / 2); if (t.wet(h)) break }
    const s = new Sim(), h = s.spawn(x - 8.25, -30, -Math.PI / 2), h0 = s.heading(h)
    s.order({ type: 'retire', id: h, metres: 30 }); s.until(() => s.busy(h), 60)
    expect(s.status(h)).toBe('halted: impassable ground')
    expect(Math.abs(Math.atan2(Math.sin(s.heading(h) - h0), Math.cos(s.heading(h) - h0)))).toBeLessThan(1e-9)
  })
  it('a turn in place at the bank, and a column turning toward the stream, keep everyone dry', () => {
    const s = new Sim(), [h, x] = atBank(s)
    s.order({ type: 'move', id: h, points: [[x, 10]], append: false })
    let worst = 0; for (let n = 0; n < 360; n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)) }
    expect(worst).toBe(0)
    for (const d of [8, 9, 10]) {
      let e = 30; const t0 = new Sim(); while (!t0.deep(e, -110) && e < 150) e += 0.25
      const s2 = new Sim(), h2 = s2.spawn(e - d - 15, -140, 0)
      s2.order({ type: 'form', id: h2, shape: 'march' }); s2.advance(25)
      s2.order({ type: 'move', id: h2, points: [[e - d, -110]], append: false }); s2.advance(25)
      s2.order({ type: 'move', id: h2, points: [[e + 30, s2.z(h2)]], append: false })
      let wst = 0; for (let n = 0; n < 240; n++) { s2.advance(0.25); wst = Math.max(wst, s2.placesInDeep(h2)) }
      expect(s2.shape(h2)).toBe('march'); expect(wst).toBe(0)
    }
  })
  it('impassable ground narrower than Lmax across part of the front: nobody crosses it', () => {
    const terrain = paint(baseTerrain, [{ x0: -55, z0: -78, x1: -40, z1: -75, depth: 1.5 }])
    const s = new Sim(1, undefined, terrain), h = s.spawn(-40, -90, 0)
    s.order({ type: 'style', id: h, preset: 'push' })
    s.order({ type: 'move', id: h, points: [[-40, -20]], append: false })
    let worst = 0; for (let n = 0; n < 360; n++) { s.advance(0.25); worst = Math.max(worst, s.placesInDeep(h)) }
    const crossed = s.places(h).filter(p => p[0] > -55 && p[0] < -40 && p[1] > -75).length
    expect(s.status(h)).toBe('halted: impassable ground'); expect(worst).toBe(0); expect(crossed).toBe(0)
  })
  it('ground impassable for one kind only: a line stops at a hedge it cannot enter; a column on it may not form line', () => {
    const rs: Ruleset = { ...napoleonic, terrain: { ...napoleonic.terrain, hedge: { ...napoleonic.terrain.hedge, g: { ...napoleonic.terrain.hedge.g, line: 0 } } } }
    const s = new Sim(1, rs), h = s.spawn(-47, -40, 0)
    const onHedge = (sim: Sim, hh: number) => sim.places(hh).filter(p => groundG(sim.w.terrain, p[0], p[1], sim.w.cr.kinds.indexOf('line'), 0, 0) <= 0).length
    s.order({ type: 'move', id: h, points: [[-47, 0]], append: false })
    let worst = 0; for (let n = 0; n < 120; n++) { s.advance(0.5); worst = Math.max(worst, onHedge(s, h)) }
    expect(s.status(h)).toBe('halted: impassable ground'); expect(worst).toBe(0)
    const s2 = new Sim(1, rs), h2 = s2.spawn(-47, -40, 0)
    s2.order({ type: 'form', id: h2, shape: 'column' }); s2.advance(40)
    s2.order({ type: 'move', id: h2, points: [[-47, -22.5]], append: false }); s2.advance(60)
    s2.order({ type: 'form', id: h2, shape: 'line' }); s2.advance(3)
    expect(s2.status(h2)).toBe('cannot form: impassable ground')
  })
})

describe('Face about', () => {
  it('keeps the place of every man in a complete file, in every shape', () => {
    for (const shape of ['line', 'column', 'square', 'march']) {
      const s = new Sim(), h = s.spawn(-20, -100, 0)
      if (shape !== 'line') { s.order({ type: 'form', id: h, shape }); s.advance(110) }
      const L = s.layout(h), T = L.turn!, g = cr.geo, before = s.places(h)
      const full = (p: [number, number, number, number]) => { const c = Math.floor(p[3] / (g.ranks * g.files)), f = p[3] % g.files; return before.filter(q => q[2] === c && q[3] % g.files === f).length === g.ranks }
      s.order({ type: 'face', id: h })
      const after = new Map(s.places(h).map(p => [p[3], p]))
      let worst = 0
      for (const p of before) if (full(p)) { const q = after.get(T.m[p[3]]); worst = Math.max(worst, q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : Infinity) }
      expect({ shape, worst: worst < 1e-6 }).toEqual({ shape, worst: true })
    }
  })
  it('keeps the places of a line with a file held back at the water (its lag is kept)', () => {
    const s = new Sim(), h = s.spawn(30, -30, Math.PI / 2 - 0.5)
    s.order({ type: 'move', id: h, points: [[100, -30 + 70 * Math.tan(-0.5)]], append: false })
    let lag = 0; for (let n = 0; n < 400 && lag < 1; n++) { s.advance(0.25); lag = Math.max(...s.lags(h)) }
    expect(lag).toBeGreaterThanOrEqual(1)
    const T = s.layout(h).turn!, g = cr.geo, before = s.places(h)
    const full = (p: [number, number, number, number]) => { const c = Math.floor(p[3] / (g.ranks * g.files)), f = p[3] % g.files; return before.filter(q => q[2] === c && q[3] % g.files === f).length === g.ranks }
    s.order({ type: 'face', id: h })
    const after = new Map(s.places(h).map(p => [p[3], p]))
    let worst = 0
    for (const p of before) if (full(p)) { const q = after.get(T.m[p[3]]); worst = Math.max(worst, q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : Infinity) }
    expect(s.status(h)).toBe(''); expect(worst).toBeLessThan(1e-6)
  })
  it('refuses when closing a file would put a man over the water', () => {
    let found = false
    for (let x = 40; x < 75 && !found; x += 0.25) {
      const s = new Sim(), h = s.spawn(x, -30, -Math.PI / 2, 'line', 93)
      if (s.wet(h)) continue
      s.order({ type: 'face', id: h })
      if (s.status(h) === 'cannot face about: impassable ground') { found = true; expect(s.placesInDeep(h)).toBe(0) }
    }
    expect(found).toBe(true)
  })
})

describe('trail shapes', () => {
  it('a column ordered a short way behind loops round and arrives; inside its turning circle it stops there; it cannot wheel', () => {
    const s = new Sim(), h = s.spawn(-20, -60, 0)
    s.order({ type: 'form', id: h, shape: 'march' }); s.advance(25)
    s.order({ type: 'move', id: h, points: [[s.x(h) + 3, s.z(h) - 10]], append: false })
    expect(s.until(() => s.busy(h), 120)).toBeLessThan(120)
    s.order({ type: 'move', id: h, points: [[s.x(h) + 3, s.z(h)]], append: false }); s.advance(5)
    expect(s.status(h)).toBe('arrived: as near as the column can turn'); expect(s.orders(h)).toBe(0)
    s.order({ type: 'wheel', id: h, angle: Math.PI / 4 }); s.advance(1)
    expect(s.status(h)).toBe('cannot wheel: a column of route turns as it marches')
  })
})

describe('the accordion', () => {
  it('a march column held at a hedge bunches but never walks through itself, also in a 90° bend', () => {
    const s = new Sim(), h = s.spawn(-60, -40, 0)
    s.order({ type: 'form', id: h, shape: 'march' }); s.advance(22)
    s.order({ type: 'style', id: h, preset: 'push' })
    const rest = closest(s.places(h), false)
    s.order({ type: 'move', id: h, points: [[-60, 0]], append: false })
    let c = Infinity; for (let n = 0; n < 300 && s.busy(h); n++) { s.advance(0.1); c = Math.min(c, closest(s.places(h), false)) }
    expect(c).toBeGreaterThanOrEqual(0.4); expect(rest - c).toBeGreaterThanOrEqual(0.5)
    const b = new Sim(), hb = b.spawn(-60, -40, 0)
    b.order({ type: 'form', id: hb, shape: 'march' }); b.advance(22); b.order({ type: 'style', id: hb, preset: 'push' })
    b.order({ type: 'move', id: hb, points: [[-60, 0]], append: false }); b.advance(15)
    b.order({ type: 'move', id: hb, points: [[-110, b.z(hb)]], append: false })
    let cb = Infinity, within = Infinity, lagMax = 0
    for (let n = 0; n < 240 && b.busy(hb); n++) { b.advance(0.25); const P = b.places(hb); cb = Math.min(cb, closest(P, false)); within = Math.min(within, closest(P, true)); lagMax = Math.max(lagMax, ...b.lags(hb)) }
    console.log('bend', { closest: cb, within, lagMax })
    expect(cb).toBeGreaterThanOrEqual(0.4); expect(within).toBeGreaterThanOrEqual(0.5); expect(lagMax).toBeGreaterThanOrEqual(1)
  })
  it('a square pushing into the wood: a held face never falls back into the others', () => {
    const s = new Sim(), h = s.spawn(-52, 30, 0)
    s.order({ type: 'form', id: h, shape: 'square' }); s.advance(110); s.order({ type: 'style', id: h, preset: 'push' })
    const rest = closest(s.places(h), false)
    s.order({ type: 'move', id: h, points: [[-52, 90]], append: false })
    let c = Infinity, lagMax = 0
    for (let n = 0; n < 120 && s.busy(h); n++) { s.advance(0.5); c = Math.min(c, closest(s.places(h), false)); lagMax = Math.max(lagMax, ...s.lags(h)) }
    expect(c).toBeGreaterThanOrEqual(Math.min(0.4, rest - 0.1)); expect(lagMax).toBeGreaterThanOrEqual(1)
  })
})

describe('passages and casualties', () => {
  it('the bridge deck is level; narrow, cross, deploy beyond within 240 s', () => {
    const t = baseTerrain, col = cr.kinds.indexOf('column'), BR = { z: -60, x0: STREAM_X(-60) - 8, x1: STREAM_X(-60) + 8 }
    let deck = 1; for (let x = BR.x0 + 0.5; x < BR.x1; x += 0.5) deck = Math.min(deck, groundG(t, x, BR.z, col, 1, 0))
    expect(deck).toBeGreaterThanOrEqual(0.99)
    const s = new Sim(), h = s.spawn(0, BR.z, Math.PI / 2), xe = BR.x0 - 12, xx = BR.x1 + 32
    s.order({ type: 'move', id: h, points: [[xe - 30, BR.z]], append: false }); s.until(() => s.busy(h), 120)
    s.order({ type: 'form', id: h, shape: 'march' }); s.until(() => s.busy(h), 60)
    s.order({ type: 'move', id: h, points: [[xe, BR.z], [xx, BR.z]], append: false }); s.until(() => s.busy(h), 200)
    s.order({ type: 'form', id: h, shape: 'line' }); s.until(() => s.busy(h), 100)
    expect(s.shape(h)).toBe('line'); expect(s.x(h)).toBeGreaterThan(BR.x1); expect(s.t).toBeLessThan(400)
  })
  it('the ford: narrow, cross, deploy on the far bank', () => {
    const s = new Sim(), xe = STREAM_X(0) - 22, xx = STREAM_X(0) + 24, h = s.spawn(xe - 50, 0, Math.PI / 2)
    s.order({ type: 'move', id: h, points: [[xe - 30, 0]], append: false }); s.until(() => s.busy(h), 120)
    s.order({ type: 'form', id: h, shape: 'march' }); s.until(() => s.busy(h), 60)
    s.order({ type: 'move', id: h, points: [[xe, 0], [xx, 0]], append: false }); s.until(() => s.busy(h), 200)
    s.order({ type: 'form', id: h, shape: 'line' }); s.until(() => s.busy(h), 100)
    expect(s.shape(h)).toBe('line'); expect(s.x(h)).toBeGreaterThan(STREAM_X(0) + 15); expect(s.status(h)).toBe('')
  })
  it('a bin emptied by casualties takes no part: a line wholly in woods stays in order', () => {
    // 90 men: the right half packs 44 men into 15 files toward the colours; company 3's outer third is empty
    const terrain = paint(baseTerrain, [{ x0: -80, z0: -100, x1: 0, z1: -20, cls: 'woods' }])
    const s = new Sim(1, undefined, terrain), h = s.spawn(-40, -90, 0, 'line', 90)
    s.order({ type: 'move', id: h, points: [[-40, -30]], append: false }); s.advance(30)
    const i = s.slot(h), NB = cr.NB, empty = [...s.w.f.binN.slice(i * NB, i * NB + NB)].filter(n => !n).length
    expect(empty).toBeGreaterThanOrEqual(1)
    expect(Math.max(...s.lags(h))).toBeLessThanOrEqual(0.1); expect(s.w.f.disorder[i]).toBeLessThanOrEqual(0.05)
  })
})

describe('cost', () => {
  it('40 battalions of every shape, moving: time per tick (budget 2 ms, sim-design §16)', () => {
    const s = new Sim(), shapes = Object.keys(cr.rs.formations), hs: number[] = []
    for (let k = 0; k < 40; k++) { const x = -150 + (k % 8) * 38, z = -150 + Math.floor(k / 8) * 55; hs.push(s.spawn(x, z, 0)) }
    hs.forEach((h, k) => { s.cmd({ type: 'form', id: h, shape: shapes[k % shapes.length] }); s.cmd({ type: 'move', id: h, points: [[s.x(h) + ((k * 7) % 30) - 15, s.z(h) + 40]], append: true }) })
    s.advance(30)
    const t0 = process.hrtime.bigint(); s.advance(10); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200
    console.log(`40 battalions: ${ms.toFixed(3)} ms per tick`)
    expect(ms).toBeLessThan(2)
  })
})
