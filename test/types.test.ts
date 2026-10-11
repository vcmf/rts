// Unit types (S1d-1, docs/plans/active/s1d1-unit-types.md): the cavalry regiment and the foot battery move,
// change shape, wheel, Face about, keep to their ground and take fire on the same engine as the battalion;
// and formations of different types (6, 4 and 8 companies) share the world's rows without touching each
// other's. Most cases stand on an open, level field painted for the test.
import { describe, it, expect } from 'vitest'
import { Sim, data, small } from './fx.ts'
import { levelled } from '../src/scenarios/s1c-firefight.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { buildTerrain, rebuildImpassable, compileRuleset, cellK, typeOf, menOf, filledSlots, occupied, slotIndex, MS_ROUTING, type Terrain, type Ruleset } from '../src/sim/index.ts'

const N = Math.PI / 2
// the shipped ruleset on a field of open, level, dry ground; `paint` sets a class or a depth on a box
const crN = compileRuleset(napoleonic)
function field(paint: (t: Terrain, cls: (name: string) => number) => void = () => {}): Terrain {
  const t = buildTerrain(levelled(data), crN), names = Object.keys(napoleonic.terrain), open = names.indexOf('open')
  t.cls.fill(open); t.depth.fill(0)
  paint(t, name => names.indexOf(name)); rebuildImpassable(t)
  return t
}
function box(t: Terrain, x0: number, x1: number, z0: number, z1: number, set: (k: number) => void): void {
  for (let z = Math.ceil(z0); z <= z1; z++) for (let x = Math.ceil(x0); x <= x1; x++) set(cellK(t, x, z))
}
const sim = (t = field(), rs: Ruleset = napoleonic) => new Sim(1, rs, t)
const UNITS = [['infantry', 400], ['cavalry', 250], ['battery', 96]] as const

describe('the types compile', () => {
  it('the strides are the largest type\'s; each type keeps its own counts and shapes', () => {
    expect(crN.types.map(U => [U.name, U.C, U.NB, U.slots])).toEqual([['infantry', 6, 48, 414], ['cavalry', 4, 32, 256], ['battery', 8, 8, 96]])
    expect([crN.maxC, crN.maxNB, crN.maxSlots]).toEqual([8, 48, 414])
    expect(crN.types.map(U => U.shapes.map(L => L.name))).toEqual([['line', 'square', 'column', 'march'], ['line', 'column', 'march'], ['unlimbered', 'limbered']])
  })
  it('a step needs a trail shape', () => {
    const cav = napoleonic.types.cavalry
    const rs: Ruleset = { ...napoleonic, types: { ...napoleonic.types, cavalry: { ...cav, formations: { ...cav.formations, line: { ...cav.formations.line, step: { file: 2, rank: 1 } } } } } }
    expect(() => compileRuleset(rs)).toThrow(/step needs a trail shape/)
  })
})

describe('spawning', () => {
  it('takes the type\'s start shape when none is given, its slots as the most men; refuses an unknown type', () => {
    const s = sim()
    const c = s.spawn(-100, -100, 0, '', 250, 0, 'cavalry'), b = s.spawn(-100, 0, 0, '', 96, 0, 'battery')   // '': no shape named
    expect([s.shape(c), s.men(c), s.shape(b), s.men(b)]).toEqual(['line', 250, 'limbered', 96])
    s.cmd({ type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, men: 97, unit: 'battery' })
    s.cmd({ type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, men: 10, unit: 'dragoons' })
    s.cmd({ type: 'debug-spawn', side: 0, x: 0, z: 0, heading: 0, shape: 'square', men: 100, unit: 'cavalry' })
    s.tick()
    expect(s.dropped.map(d => d.reason)).toEqual(['no room for those men', 'no such unit type', 'no such shape'])
  })
  it('a regiment cannot form square: the order is refused and it keeps its shape', () => {
    const s = sim(), h = s.spawn(-100, -100, 0, 'line', 250, 0, 'cavalry')
    s.order({ type: 'form', id: h, shape: 'square' })
    expect(s.dropped.at(-1)!.reason).toBe('no such shape'); expect(s.shape(h)).toBe('line')
  })
})

describe('drill', () => {
  // each type from its start into each of its shapes and back: the change takes its time; every shape that has
  // a half-turn Faces about; a straight shape wheels
  for (const [unit, men] of UNITS) it(`${unit}: every change in its time, Face about, wheels`, () => {
    const U = crN.types[crN.typeIndex(unit)], names = U.shapes.map(L => L.name), S = names.length
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      if (a === b) continue
      const s = sim(), h = s.spawn(-60, -60, 0, names[a], men, 0, unit)
      s.order({ type: 'form', id: h, shape: names[b] })
      const t = s.until(() => s.busy(h), 200) + 0.05
      expect({ change: `${names[a]}>${names[b]}`, t: Math.abs(t - U.changeTime[a * S + b]) <= 0.1 }).toEqual({ change: `${names[a]}>${names[b]}`, t: true })
      expect(s.shape(h)).toBe(names[b])
      const x = s.x(h), z = s.z(h)
      s.order({ type: 'face', id: h }); s.advance(4)
      expect(s.status(h)).toBe(''); expect(Math.abs(Math.abs(s.heading(h)) - Math.PI)).toBeLessThan(1e-6)
      if (!U.shapes[b].def.trail) { s.order({ type: 'wheel', id: h, angle: N / 2 }); s.until(() => s.busy(h), 200); expect(s.status(h)).toBe('') }
      expect(s.men(h)).toBe(men); expect(s.places(h).length).toBe(men); expect(Math.hypot(s.x(h) - x, s.z(h) - z)).toBeLessThan(200)
    }
  })
})

describe('paces and ground', () => {
  // metres covered in 20 s heading north on open ground, after a 5 s start
  const speed = (unit: string, shape: string, men: number, t = field()): number => {
    const s = sim(t), h = s.spawn(-100, -150, 0, shape, men, 0, unit)
    s.order({ type: 'move', id: h, points: [[-100, 170]], append: false }); s.advance(5)
    const z = s.z(h); s.advance(20); return (s.z(h) - z) / 20
  }
  it('each type moves at its shape\'s pace times its ground on open ground', () => {
    const got = { cavLine: speed('cavalry', 'line', 250), cavMarch: speed('cavalry', 'march', 250), limbered: speed('battery', 'limbered', 96), unlimbered: speed('battery', 'unlimbered', 96), infLine: speed('infantry', 'line', 400) }
    console.log('m/s on open ground', got)
    expect(got.cavLine).toBeCloseTo(1.7, 1); expect(got.cavMarch).toBeCloseTo(3.3, 1)
    expect(got.limbered).toBeCloseTo(0.85 * 0.85, 2); expect(got.unlimbered).toBeCloseTo(0.3 * 0.85, 2); expect(got.infLine).toBeCloseTo(0.9, 2)
  })
  it('in woods a regiment goes at 0.45 of its open pace, a battalion in column at 0.7', () => {
    const woods = field((t, cls) => t.cls.fill(cls('woods')))
    const cav = speed('cavalry', 'column', 250, woods), inf = speed('infantry', 'column', 400, woods)
    expect(cav / 1.7).toBeCloseTo(0.45, 2); expect(inf / 0.9).toBeCloseTo(0.7, 2)
  })
  // a band across the field at z 0..band; each type marches north into it from z −60
  const into = (unit: string, shape: string, men: number, t: Terrain): { status: string; z: number; wet: number } => {
    const s = sim(t), h = s.spawn(-100, -60, 0, shape, men, 0, unit)
    s.order({ type: 'move', id: h, points: [[-100, 40]], append: false }); s.until(() => s.busy(h), 400)
    return { status: s.status(h), z: Math.round(s.z(h)), wet: s.wet(h) ? 1 : 0 }
  }
  it('a battery is held at a wood\'s edge and at a hedge; cavalry and infantry cross the hedge', () => {
    const wood = field((t, cls) => box(t, -180, 180, 0, 180, k => { t.cls[k] = cls('woods') }))
    const hedge = field((t, cls) => box(t, -180, 180, 0, 1, k => { t.cls[k] = cls('hedge') }))
    expect(into('battery', 'limbered', 96, wood)).toMatchObject({ status: 'halted: impassable ground', wet: 0 })
    expect(into('battery', 'limbered', 96, hedge)).toMatchObject({ status: 'halted: impassable ground', wet: 0 })
    expect(into('cavalry', 'column', 250, hedge)).toEqual({ status: '', z: 40, wet: 0 })
    expect(into('infantry', 'column', 400, hedge)).toEqual({ status: '', z: 40, wet: 0 })
  })
  it('water: horses wade 1 m where infantry and guns cannot; infantry wades 0.8 m where guns cannot', () => {
    const deep = (d: number) => field(t => box(t, -180, 180, 0, 4, k => { t.depth[k] = d }))
    const d1 = deep(1.0), d08 = deep(0.8)
    expect(into('cavalry', 'column', 250, d1)).toEqual({ status: '', z: 40, wet: 0 })
    expect(into('infantry', 'column', 400, d1)).toMatchObject({ status: 'halted: impassable ground', wet: 0 })
    expect(into('battery', 'limbered', 96, d1)).toMatchObject({ status: 'halted: impassable ground', wet: 0 })
    expect(into('infantry', 'column', 400, d08)).toEqual({ status: '', z: 40, wet: 0 })
    expect(into('battery', 'limbered', 96, d08)).toMatchObject({ status: 'halted: impassable ground', wet: 0 })
  })
  it('a column of route by fours with only its last horses in water, 180–192 m back, is wet (its places reach three times a block)', () => {
    const t = field(t => box(t, -180, 180, -35, -30, k => { t.depth[k] = 2 }))
    const s = sim(t), h = s.spawn(-100, 150, 0, 'march', 250, 0, 'cavalry')
    expect(s.placesInDeep(h)).toBeGreaterThan(0); expect(s.wet(h)).toBe(true)
  })
  it('a change into the column of route interrupted halfway goes on from the spacing it had: no place jumps', () => {
    for (const [from, via, to] of [['line', 'march', 'column'], ['march', 'line', 'march']] as const) {
      const s = sim(), h = s.spawn(-100, 150, 0, from, 250, 0, 'cavalry')
      s.order({ type: 'form', id: h, shape: via }); s.advance(60)
      const before = s.places(h); s.order({ type: 'form', id: h, shape: to }); const after = s.places(h)
      const jump = Math.max(...before.map((p, k) => Math.hypot(p[0] - after[k][0], p[1] - after[k][1])))
      expect({ change: `${from}>${via}>${to}`, small: jump < 0.5 }).toEqual({ change: `${from}>${via}>${to}`, small: true })
      s.until(() => s.busy(h), 200); expect(s.shape(h)).toBe(to)
    }
  })
  it('a change into the column of route by fours is refused when its places, longer than the change, would reach water', () => {
    // the column's last horses stand 192 m behind the anchor; the change, in the block's 1 m spacing, reaches
    // about 161 m: water 180–185 m back stops only the column's places
    const t = field(t => box(t, -180, 180, -35, -30, k => { t.depth[k] = 2 }))
    const s = sim(t), h = s.spawn(-100, 150, 0, 'column', 250, 0, 'cavalry')
    s.order({ type: 'form', id: h, shape: 'march' })
    expect(s.status(h)).toBe('cannot form: impassable ground'); expect(s.shape(h)).toBe('column')
    const s2 = sim(), h2 = s2.spawn(-100, 150, 0, 'column', 250, 0, 'cavalry')
    s2.order({ type: 'form', id: h2, shape: 'march' }); s2.until(() => s2.busy(h2), 100)
    expect(s2.shape(h2)).toBe('march'); expect(150 - Math.min(...s2.places(h2).map(p => p[1]))).toBeGreaterThan(185)   // 189: 250 men leave a squadron's last file empty
  })
})

describe('under fire', () => {
  // an infantry line fires (hit chance raised) on a regiment or a battery 80 m off, which do not fire back (and does
  // not form square against the regiment: S1d-2's standing behaviour, off)
  const rs: Ruleset = { ...small, fire: { ...small.fire, pRange: [[0, 0.3], [250, 0.3], [251, 0]] }, melee: { ...small.melee, refuge: { ...small.melee.refuge, alert: 0 } } }
  for (const [unit, shape, men] of [['cavalry', 'line', 250], ['battery', 'unlimbered', 96]] as const) it(`a ${unit} loses men, never fires, breaks and routs`, () => {
    const t = buildTerrain(levelled(data), compileRuleset(rs)), s = new Sim(1, rs, t)
    s.cmd({ type: 'side', side: 0, x: -1, z: 0 }); s.cmd({ type: 'side', side: 1, x: 1, z: 0 })
    const inf = s.spawn(-90, -165, N, 'line', 100, 0), them = s.spawn(-10, -165, -N, shape, men, 1, unit), j = s.slot(them)
    void inf
    let fired = false, t0 = -1
    for (let k = 0; k < 20 * 180 && t0 < 0; k++) {
      s.tick(); const C = typeOf(s.w, j).C
      for (let c = 0; c < C; c++) if (s.w.f.volleyTick[j * s.w.cr.maxC + c]) fired = true
      if (s.w.f.mstate[j] === MS_ROUTING) t0 = s.t
    }
    console.log(`${unit}: routs at ${t0} s with ${s.men(them)} of ${men}`)
    expect(fired).toBe(false); expect(t0).toBeGreaterThan(0); expect(s.men(them)).toBeLessThan(men)
  })
})

describe('types side by side', () => {
  // a battalion, a regiment and a battery (6, 4 and 8 companies on rows of 8): losses, changes and Face about
  // on each leave the others' rows alone; each one's cached filled slots are what `occupied` gives
  it('rows strided by the largest type: no type reads or writes another\'s', () => {
    const s = sim(), hs = [s.spawn(-120, -140, 0, 'column', 400, 0, 'infantry'), s.spawn(-40, -140, 0, 'line', 250, 0, 'cavalry'), s.spawn(-120, 40, 0, 'unlimbered', 96, 0, 'battery')]
    const brute = (i: number) => { const g = typeOf(s.w, i).geo, out: number[] = []
      for (let c = 0; c < g.companies; c++) for (let r = 0; r < g.ranks; r++) for (let q = 0; q < g.files; q++) if (occupied(s.w, i, c, r, q)) out.push(slotIndex(g, c, r, q))
      return out }
    const rows = (i: number) => [...s.w.f.men.slice(i * crN.maxC, (i + 1) * crN.maxC)]
    let checks = 0
    for (let k = 0; k < 9; k++) {
      const n = k % 3, h = hs[n], i = s.slot(h), others = hs.filter(x => x !== h).map(x => [s.slot(x), rows(s.slot(x))] as const)
      const U = typeOf(s.w, i), shape = U.shapes[(k + 1) % U.shapes.length].name
      s.order({ type: 'debug-kill', id: h, men: 7 })
      s.order({ type: k % 2 ? 'face' : 'form', id: h, shape } as never); s.advance(2)
      for (const [j, before] of others) expect(rows(j)).toEqual(before)   // no tick changed another's men
      for (const x of hs) { const j = s.slot(x), F = filledSlots(s.w, j), a = j * (crN.maxC + 1)
        expect([...F.s.subarray(F.at[a], F.at[a + typeOf(s.w, j).C])]).toEqual(brute(j)); expect(menOf(s.w, j)).toBe(brute(j).length); checks++ }
      for (let c = U.C; c < crN.maxC; c++) expect(s.w.f.men[i * crN.maxC + c]).toBe(0)   // a smaller type leaves the rest of its row empty
    }
    expect(checks).toBe(27)
    expect(hs.map(h => s.men(h))).toEqual([400 - 21, 250 - 21, 96 - 21])
  })
})
