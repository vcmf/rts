// The S1e battlefield (docs/plans/active/s1e1-battlefield.md): the map, the map's edge (issue #37), leaving the
// field, and the S1e scenario deployed on it.
import { describe, it, expect } from 'vitest'
import { Sim, battleData, BATTLE_DATA_VERSION } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { s1eBattle } from '../src/scenarios/s1e-battle.ts'
import { streamZ, roadX, FORDS } from '../maps/battlefield.ts'
import { MAP_VERSIONS } from '../src/scenarios/maps.ts'
import { buildTerrain, compileRuleset, makeWorld, advanceTick, cellK, heightAt, impAt, formationSlot, typeOf, MS_ROUTING } from '../src/sim/index.ts'

const cr = compileRuleset(napoleonic), T = buildTerrain(battleData, cr), names = Object.keys(napoleonic.terrain)
const cls = (x: number, z: number) => names[T.cls[cellK(T, x, z)]]
const kind = (k: string) => cr.kinds.indexOf(k)
const sim = () => new Sim(1, napoleonic, T, battleData)

describe('the map', () => {
  it('is 1.2 km square on a 2 m grid, at the version the scenarios were placed for, with the ruleset\'s classes', () => {
    expect([T.n, T.cell, T.x0, T.z0]).toEqual([601, 2, -600, -600])
    expect(MAP_VERSIONS.battlefield).toBe(BATTLE_DATA_VERSION)
    expect(battleData.classes).toEqual(names)
  })
  it('the stream is impassable to every kind but at the fords and the bridge; horses wade the fords, so do men', () => {
    for (const x of [-450, -100, 200, 500]) for (const k of ['line', 'column', 'horse', 'guns']) expect(impAt(T, T.imp[kind(k)], x, streamZ(x))).toBe(1)
    for (const x of FORDS) for (const k of ['line', 'column', 'horse']) expect(impAt(T, T.imp[kind(k)], x, streamZ(x))).toBe(0)
    const bx = roadX(streamZ(60)); expect(cls(bx, streamZ(bx))).toBe('bridge')
  })
  it('two ridges face each other across the valley', () => {
    const h = (z: number) => heightAt(battleData, 0, z)
    expect(h(-290) - h(0)).toBeGreaterThan(10); expect(h(290) - h(0)).toBeGreaterThan(10)
  })
})

describe('the edge (#37)', () => {
  it('a line, a regiment\'s line and a battery marching at the edge halt with every place on the map', () => {
    for (const [unit, shape, men] of [['infantry', 'line', 400], ['cavalry', 'line', 256], ['battery', 'unlimbered', 96]] as const) {
      // facing north-east into the corner: its anchor's goal is on the map, its south-eastern flank would cross the edge
      const s = sim(), h = s.spawn(420, 420, Math.PI / 4, shape, men, 0, unit)
      s.order({ type: 'move', id: h, points: [[598, 598]], append: false }); s.until(() => s.busy(h), 900)   // a battery's pieces go by hand, 0.3 m/s
      expect(s.status(h)).toBe('halted: impassable ground')
      expect(s.places(h).every(([x, z]) => Math.abs(x) <= 600 && Math.abs(z) <= 600)).toBe(true)
    }
  })
  it('a change of shape that would put places off the map is refused', () => {
    const s = sim(), h = s.spawn(0, -590, 0, 'line', 400)   // a column of route reaches about 96 m back: off the map
    s.order({ type: 'form', id: h, shape: 'march' })
    expect(s.status(h)).toBe('cannot form: impassable ground'); expect(s.shape(h)).toBe('line')
  })
})

describe('leaving the field', () => {
  it('a shattered battalion that reaches the edge is removed and its men counted to its side; a router there stays', () => {
    const s = sim(), gone = s.spawn(-200, -500, 0, 'line', 400), stays = s.spawn(200, -500, 0, 'line', 400)
    s.order({ type: 'side', side: 0, x: 0, z: -1 })
    s.order({ type: 'debug-kill', id: gone, men: 220 })   // under half its strength: it shatters when it breaks
    for (const h of [gone, stays]) s.order({ type: 'debug-morale', id: h, quality: 0.1 })
    s.until(() => s.slot(gone) >= 0, 180)
    expect(formationSlot(s.w, gone)).toBe(-1); expect(s.w.sides.left[0]).toBe(180)
    expect(s.slot(stays)).toBeGreaterThanOrEqual(0); expect(s.w.f.mstate[s.slot(stays)]).toBe(MS_ROUTING)
  })
})

describe('the S1e scenario', () => {
  it('every formation deploys, and every shape it is drilled into stays on the map', () => {
    const w = makeWorld(battleData, cr, 1, true, T); s1eBattle.setup(w); const r = advanceTick(w)
    expect(r.dropped).toEqual([])
    const live = [...w.f.alive].map((a, i) => a ? i : -1).filter(i => i >= 0)
    expect(live.length).toBe(16)
    expect(live.map(i => typeOf(w, i).name).filter(n => n === 'infantry').length).toBe(12)
  })
})
