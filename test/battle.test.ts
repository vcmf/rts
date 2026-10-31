// The demo map's battle at the division scale (src/look/world/battle.ts, docs/plans/active/division-armies.md): the
// ruleset's blocks and corps (src/rulesets/napoleonic-division.ts), each battle's order of battle and figures, the
// layout on the demo map's blocked ground (test/fixtures/demo-map-blocked.bin.gz, sampled from the page over ±370 m by
// tools/sample-blocked.mjs: rerun it when the map, its trees, river or buildings change), and the page's switches
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { compileRuleset } from '../src/sim/index.ts'
import { CORPS, napoleonicDivision as rs } from '../src/rulesets/napoleonic-division.ts'
import { rulesetOf } from '../src/rulesets/index.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'
import { DYES } from '../src/rulesets/napoleonic-dyes.ts'
import { ARMIES_DEMO, ARMS_DEMO } from '../src/scenarios/armies-demo.ts'
import { facingAt, type Battalion } from '../src/look/world/armies.ts'
import { armFires, armScript, boxOf, type Box } from '../src/look/world/arms.ts'
import {
  FIELD,
  RESERVE_BACK,
  battleLayout,
  figuresOf,
  orderOfBattle,
  reserveSpots,
  type FieldKind,
  type Fielded,
} from '../src/look/world/battle.ts'
import { armOn, battleChoice, battleHref, battleOptions } from '../src/look/world/battle-url.ts'
import { BATTLE_BUDGETS, BATTLE_FIGURES, DEFAULT_BATTLE, LEGACY_BATTALION } from '../src/scenarios/battles.ts'
import { dressed, FIGURE_PARTS } from '../src/look/world/dyes.ts'
import { decodeUnits, type UnitData } from '../src/look/units-data.ts'

const figure = (name: string): UnitData =>
  decodeUnits(new Uint8Array(readFileSync(new URL(`../data/figures/${name}.unitdata`, import.meta.url))).buffer)
const sizes = Object.fromEntries(
  Object.entries(rs.types).map(([k, t]) => [k, t.geometry.companies * t.geometry.files * t.geometry.ranks]),
)
// each arm's ground as the page builds it (src/look/main.ts)
const built = ARMS_DEMO.map(a => {
  const d = figure(a.figure)
  const t = rs.types[a.unitType]
  const speeds = Object.fromEntries(Object.entries(d.ranges).map(([k, r]) => [k, r.speed]))
  return { spec: a, ...armScript(a, t.geometry, t.formations[a.formation].place, speeds) }
})
const KINDS: Record<string, FieldKind> = Object.fromEntries(
  built.map(b => [b.spec.unitType, { work: b.work, rest: b.rest, cycle: b.script.cycle, fires: armFires(b.spec) }]),
)
const SIDES = Object.fromEntries(ARMS_DEMO.map(a => [a.unitType, a.sides]))
const EXTENT = 370

// the demo map's blocked ground: a bit a sample every 0.5 m over ±370 m, row by row from (−370, −370), read
// conservatively (blocked when any of the four samples round a point is)
const bits = gunzipSync(readFileSync(new URL('./fixtures/demo-map-blocked.bin.gz', import.meta.url)))
const R = 370
const N = 2 * R * 2 + 1
const bit = (i: number, j: number) =>
  i < 0 || j < 0 || i >= N || j >= N || ((bits[(j * N + i) >> 3] >> ((j * N + i) & 7)) & 1) === 1
const demo = (x: number, z: number) => {
  const i = Math.floor((x + R) / 0.5)
  const j = Math.floor((z + R) / 0.5)
  return bit(i, j) || bit(i + 1, j) || bit(i, j + 1) || bit(i + 1, j + 1)
}

describe('the ruleset at the division scale', () => {
  it("fields the division scale's blocks (decision 0099, #280's): line 240, light 160, light cavalry 80, 4 guns, 48", () => {
    expect(sizes).toEqual({ infantry: 240, light: 160, cavalry: 80, cuirassiers: 120, battery: 48 })
    expect(rs.types.battery.geometry.companies).toBe(4)
    expect([rs.types.cavalry.geometry.companies, rs.types.cavalry.geometry.files]).toEqual([2, 20])
  })
  it('compiles in the sim, each type its figures as slots, and resolves by name', () => {
    const cr = compileRuleset(rulesetOf(ARMIES_DEMO.ruleset))
    for (const [k, n] of Object.entries(sizes)) expect(cr.types[cr.typeIndex(k)].slots, k).toBe(n)
  })
  it('makes an infantry corps of 8 to 10 units and 1,300 to 1,700 figures (decision 0099)', () => {
    const units = CORPS.infantry.reduce((a, u) => a + u.count, 0)
    const figures = CORPS.infantry.reduce((a, u) => a + u.count * sizes[u.type], 0)
    expect(units).toBeGreaterThanOrEqual(8)
    expect(units).toBeLessThanOrEqual(10)
    expect(figures).toBeGreaterThanOrEqual(1300)
    expect(figures).toBeLessThanOrEqual(1700)
  })
})

describe('the order of battle (orderOfBattle)', () => {
  const count = (o: readonly Fielded[], type: string) => o.filter(u => u.type === type).length
  it('fields two infantry corps a side in the typical battle, about 6,000 figures in all', () => {
    const o = orderOfBattle(ARMIES_DEMO.battles.typical, sizes)
    expect(2 * figuresOf(o, sizes)).toBe(6272)
    expect(new Set(o.map(u => u.corps))).toEqual(new Set([0, 1]))
    expect(count(o, 'cuirassiers')).toBe(0)
  })
  it('fills the stress tests to their budgets, the reserve cavalry corps first, the last corps cut', () => {
    for (const [name, figures] of [
      ['16k', 16000],
      ['32k', 32000],
    ] as const) {
      const o = orderOfBattle(ARMIES_DEMO.battles[name], sizes)
      expect(2 * figuresOf(o, sizes), name).toBe(figures)
      expect(o.slice(0, 5).map(u => [u.type, u.corps, u.repeat])).toEqual([
        ['cuirassiers', 0, false],
        ['cuirassiers', 0, false],
        ['cuirassiers', 0, false],
        ['cuirassiers', 0, false],
        ['battery', 0, false],
      ])
      expect(count(o, 'cuirassiers')).toBe(4)
    }
  })
  it('cuts a corps at its first unit that does not fit, and ends the side there', () => {
    const spec = { figures: 2 * (240 + 240 + 100), once: [], repeat: CORPS.infantry }
    const o = orderOfBattle(spec, sizes)
    // (a third line unit does not fit: the battery's 48 would, but the corps ends at the line)
    expect(o.map(u => u.type)).toEqual(['infantry', 'infantry'])
  })
  // (review round 1: a repeated corps of no figures was fielded forever, the page hung)
  it('refuses a corps of no figures, the repeated one included, rather than fielding it forever', () => {
    for (const c of [[], [{ type: 'infantry', count: 0 }]]) {
      expect(() => orderOfBattle({ figures: 99999, once: [], repeat: c }, sizes)).toThrow(/no figures/)
      expect(() => orderOfBattle({ figures: 99999, once: [c], repeat: CORPS.infantry }, sizes)).toThrow(/no figures/)
    }
  })
  it('fields the once corps alone when its repeated one does not fit, and fails loudly on a type with no size', () => {
    const big = [{ type: 'infantry', count: 100 }]
    expect(orderOfBattle({ figures: 2 * 600, once: [CORPS.cavalryReserve], repeat: big }, sizes).length).toBe(5)
    expect(() => orderOfBattle({ figures: 1000, once: [[{ type: 'hussars', count: 1 }]], repeat: [] }, sizes)).toThrow(
      /hussars/,
    )
  })
})

// each unit's box: at work (engaged) or at rest (reserve)
const boxOfUnit = (type: string, b: Battalion): Box => {
  const f = b.reserve ? KINDS[type].rest : KINDS[type].work
  return boxOf(b.x, b.z, b.heading, f.a0, f.a1, f.z0, f.z1)
}
const layouts = new Map<string, { o: Fielded[]; placed: Record<string, Battalion[]>; fellBack: number[] }>()
const layoutOf = (name: string) => {
  let l = layouts.get(name)
  if (!l) {
    const o = orderOfBattle(ARMIES_DEMO.battles[name], sizes)
    const { units, fellBack } = battleLayout([o, o], KINDS, ARMIES_DEMO.deploy, demo, SIDES, EXTENT)
    l = { o, placed: units, fellBack }
    layouts.set(name, l)
  }
  return l
}

// the unit types that fire (a drill's volleys, a service's guns): nothing of their side may stand before them
const FIRING = new Set(ARMS_DEMO.filter(a => a.script.kind !== 'ride').map(a => a.unitType))
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
afterAll(() => warn.mockRestore())

describe('the friendly-line rules on the demo map (battleLayout)', () => {
  // (review round 2: reserves stood 20–45 m before a firing line pushed back; firing lines stood behind firing lines)
  for (const name of Object.keys(ARMIES_DEMO.battles)) {
    it(`keeps, in the ${name} battle, nothing before a firing unit it overlaps across, no engaged unit behind another`, () => {
      const { placed } = layoutOf(name)
      const all = Object.entries(placed).flatMap(([type, bs]) => bs.map(b => ({ type, b, box: boxOfUnit(type, b) })))
      // (how far ahead a box's rear and front edges stand, by its side's own way: side 0 faces +z, side 1 −z)
      const rear = (u: (typeof all)[0]) => (u.b.side === 0 ? u.box.z0 : -u.box.z1)
      const fore = (u: (typeof all)[0]) => (u.b.side === 0 ? u.box.z1 : -u.box.z0)
      for (const a of all) {
        for (const b of all) {
          if (a === b || a.b.side !== b.b.side) continue
          if (!(a.box.x0 < b.box.x1 && b.box.x0 < a.box.x1)) continue
          const at = `${a.type} ${a.b.x},${a.b.z} / ${b.type} ${b.b.x},${b.b.z}`
          if (!a.b.reserve && !b.b.reserve) expect(false, `engaged one behind the other: ${at}`).toBe(true)
          if (!b.b.reserve && FIRING.has(b.type)) expect(fore(a) <= rear(b), `before a firing unit: ${at}`).toBe(true)
        }
      }
    })
  }
})

describe('the layout on the demo map (battleLayout)', () => {
  for (const name of Object.keys(ARMIES_DEMO.battles)) {
    it(`places every unit of the ${name} battle, clear of the blocked ground and of one another, within ±${EXTENT} m`, () => {
      const { o, placed } = layoutOf(name)
      const all = Object.entries(placed).flatMap(([type, bs]) => bs.map(b => ({ type, b, box: boxOfUnit(type, b) })))
      for (const side of [0, 1]) {
        for (const type of Object.keys(sizes)) {
          const n = all.filter(u => u.type === type && u.b.side === side).length
          expect(n, `${name} ${type} side ${side}`).toBe(o.filter(u => u.type === type).length)
        }
      }
      for (const [i, u] of all.entries()) {
        const { box } = u
        expect(Math.max(-box.x0, box.x1, -box.z0, box.z1)).toBeLessThanOrEqual(EXTENT)
        // (each side on its own half, facing the other)
        expect(u.b.side === 0 ? box.z1 <= 0 : box.z0 >= 0).toBe(true)
        expect(u.b.uniform).toBe(SIDES[u.type][u.b.side])
        for (const v of all.slice(i + 1)) {
          const q = v.box
          expect(box.x0 >= q.x1 || q.x0 >= box.x1 || box.z0 >= q.z1 || q.z0 >= box.z1, `${u.type} / ${v.type}`).toBe(
            true,
          )
        }
        for (let x = box.x0; x <= box.x1; x += 2.5) {
          for (let z = box.z0; z <= box.z1; z += 2.5) expect(demo(x, z)).toBe(false)
        }
      }
    })
  }
  for (const name of Object.keys(ARMIES_DEMO.battles)) {
    it(`stands the ${name} battle's first corps along the front, the rest in column behind, the focus near the middle`, () => {
      const { placed, fellBack } = layoutOf(name)
      const front = FIELD.gap / 2
      const engaged = Object.values(placed).flatMap(bs => bs.filter(b => !b.reserve))
      // (two corps a side, each its template's row: a ride, two line units, a battery, a light unit; a unit with no
      // legal spot in reserve, counted)
      const row = ARMIES_DEMO.deploy.posts.reduce((a, p) => a + p.units.length, 0)
      for (const side of [0, 1]) {
        expect(engaged.filter(b => b.side === side).length + fellBack[side], `side ${side}`).toBe(2 * row)
        expect(fellBack[side]).toBeLessThanOrEqual(row)
      }
      for (const [type, bs] of Object.entries(placed)) {
        for (const b of bs.filter(u => u.reserve)) {
          expect(Math.abs(b.z) - front, type).toBeGreaterThanOrEqual(RESERVE_BACK - 1e-9)
          expect(b.heading).toBe(b.side === 0 ? 0 : Math.PI)
        }
      }
      // (the lines' fronts at the front or behind it where the ground is blocked, never ahead: the gap kept)
      const lines = placed.infantry.filter(b => !b.reserve)
      for (const b of lines) expect(Math.abs(b.z)).toBeGreaterThanOrEqual(front - 1e-9)
      // (review round 2: the focus fell on a flank by the play area's edge, x ≈ 223, not comparable with main's)
      const [fx] = facingAt(placed.infantry, FIELD.centre)
      expect(Math.abs(fx - FIELD.centre[0])).toBeLessThanOrEqual(60)
      // (the engaged cycles staggered: no two of a type in step)
      const own = lines.filter(b => b.side === 0)
      expect(new Set(own.map(b => b.offset)).size).toBe(own.length)
    })
  }
  // (review round 2: an engaged unit with no room joined the reserve silently, the sides uneven with no notice)
  it('warns of the engaged units with no legal spot, and counts them', () => {
    warn.mockClear()
    const o = orderOfBattle(ARMIES_DEMO.battles.typical, sizes)
    // (a field blocked but for a band far back: the template's rows find no spot, all go to reserve)
    const band = (x: number, z: number) => Math.abs(z) < 200 || Math.abs(z) > 360 || Math.abs(x) > 360
    const { fellBack } = battleLayout([o, o], KINDS, ARMIES_DEMO.deploy, band, SIDES, EXTENT)
    expect(fellBack[0]).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/engaged units of side 0 found no legal spot/))
  })
  // (review round 1: rows past the field, every spot of them refused, were scanned for each reserve)
  it("keeps the reserves' spots on the field, 40 m back at least, the nearest the front and the middle first", () => {
    const front = FIELD.gap / 2
    const s = reserveSpots(EXTENT, FIELD)
    expect(Math.max(...s.map(p => p[1]))).toBeLessThanOrEqual(EXTENT - front)
    expect(Math.min(...s.map(p => p[1]))).toBeGreaterThanOrEqual(RESERVE_BACK)
    expect(Math.max(...s.map(p => Math.abs(p[0])))).toBeLessThanOrEqual(EXTENT)
    expect(s[0]).toEqual([0, RESERVE_BACK])
    expect(reserveSpots(EXTENT, FIELD)).toBe(s)
  })
  it('fails loudly when a side has no room', () => {
    const o = orderOfBattle(ARMIES_DEMO.battles.typical, sizes)
    expect(() => battleLayout([o, o], KINDS, ARMIES_DEMO.deploy, (_x, z) => z < 0, SIDES, EXTENT)).toThrow(
      /room for only 0 of \d+ reserves for side 0/,
    )
  })
})

describe('the stand-ins (docs/plans/active/division-armies.md)', () => {
  const arm = (name: string) => {
    const a = ARMS_DEMO.find(x => x.name === name)
    if (!a) throw new Error(name)
    return a
  }
  it("paints the light cavalry's cuirass in its coat, the cuirassiers' in metal", () => {
    const d = figure('fr-cuirassier')
    for (const id of arm('lightcav').sides) {
      const c = dressed(UNIFORMS[id], DYES, { parts: { ...d.parts, ...arm('lightcav').parts } }).colours
      expect(c.metal).toBe(c.coat)
    }
    for (const id of arm('cuirassiers').sides) {
      expect(dressed(UNIFORMS[id], DYES, { parts: d.parts ?? undefined }).colours.metal).toBe(DYES.materials.metal)
    }
  })
  it("dresses the light infantry apart from the line: the line's figure in another coat or trousers", () => {
    for (const s of [0, 1]) {
      const light = dressed(UNIFORMS[arm('light').sides[s]], DYES, { parts: FIGURE_PARTS }).colours
      const line = dressed(UNIFORMS[arm('infantry').sides[s]], DYES, { parts: FIGURE_PARTS }).colours
      expect(light.coat !== line.coat || light.white !== line.white).toBe(true)
    }
    expect(arm('light').figure).toBe(arm('infantry').figure)
    expect(rs.types.light.geometry.fileSpacing).toBeGreaterThan(rs.types.infantry.geometry.fileSpacing)
  })
})

describe('the page switches (battleChoice, battleHref)', () => {
  const budgets = BATTLE_BUDGETS
  const choose = (s: string) => battleChoice(new URLSearchParams(s), budgets, DEFAULT_BATTLE, LEGACY_BATTALION)
  it("names the scenario's battles by the page's budgets, and labels them by the figures each fields", () => {
    expect(Object.fromEntries(Object.entries(ARMIES_DEMO.battles).map(([k, b]) => [k, b.figures]))).toEqual(budgets)
    const fielded = Object.entries(ARMIES_DEMO.battles).map(([k, b]) => [
      k,
      2 * figuresOf(orderOfBattle(b, sizes), sizes),
    ])
    expect(Object.fromEntries(fielded)).toEqual(BATTLE_FIGURES)
  })
  it('gives no battle without ?battle or ?armies, the default bare, and a named one', () => {
    expect([choose(''), choose('battle'), choose('battle=typical'), choose('battle=32k')]).toEqual([
      null,
      '16k',
      'typical',
      '32k',
    ])
  })
  it('maps the old ?armies=<n> onto the battle nearest its figures (n × 414 a side)', () => {
    expect(['armies=2', 'armies=10', 'armies=20', 'armies=40'].map(choose)).toEqual([
      'typical',
      'typical',
      '16k',
      '32k',
    ])
  })
  it('refuses an unknown battle, a count outside 1 to 40, and both switches', () => {
    expect(() => choose('battle=huge')).toThrow(/typical, 16k, 32k/)
    for (const bad of ['armies=0', 'armies=41', 'armies=x']) expect(() => choose(bad)).toThrow(/1 to 40/)
    expect(() => choose('battle=16k&armies=20')).toThrow(/both/)
  })
  it("sets the panel's battle in the address, the old ?armies dropped, the other switches kept", () => {
    const at = 'http://x/app/look.html?armies=20&frozen&benchat=1,2'
    expect(battleHref(at, '32k')).toBe('http://x/app/look.html?frozen=&benchat=1%2C2&battle=32k')
    expect(battleHref('http://x/a?battle=16k&frozen', null)).toBe('http://x/a?frozen=')
  })
  // (review round 1: None kept ?sim and ?lookat, which the page refuses without armies: an error page)
  it('drops the switches that need armies with None, and ?lookat with any change; the page takes every address', () => {
    const at = 'http://x/a?battle=16k&sim&lookat=cuirassiers,40&thread=main'
    expect(battleHref(at, null)).toBe('http://x/a?thread=main')
    expect(battleHref(at, 'typical')).toBe('http://x/a?battle=typical&sim=&thread=main')
    for (const name of [null, ...Object.keys(budgets)]) {
      const q = new URL(battleHref(at, name)).searchParams
      const chosen = choose(q.toString())
      expect(chosen).toBe(name)
      if (chosen === null) for (const k of ['sim', 'lookat']) expect(q.has(k), k).toBe(false)
    }
  })
  // (review round 1: on a map window every choice reloaded into the page's error, ?battle being the demo world's)
  it('offers no battle on a map window, and None then each battle on the demo world', () => {
    expect(battleOptions(true, BATTLE_FIGURES)).toBeNull()
    expect(battleOptions(false, BATTLE_FIGURES)?.map(o => o.value)).toEqual(['', 'typical', '16k', '32k'])
    // (review round 2: labelled by its budget, 6,400, not the 6,272 it fields)
    expect(battleOptions(false, BATTLE_FIGURES)?.[1].label).toBe('typical (6,272)')
  })
  // (review round 1: ?infantry=x was silently ignored, every other arm's switch refusing it)
  it("reads each arm's switch, 0 or 1, the first arm always on, the others off under ?sim but asked for", () => {
    const q = (s: string) => new URLSearchParams(s)
    expect([armOn(q(''), 'cavalry', false), armOn(q('cavalry=0'), 'cavalry', false)]).toEqual([true, false])
    expect([armOn(q(''), 'cavalry', true), armOn(q('infantry=1'), 'infantry', true, true)]).toEqual([false, true])
    expect(() => armOn(q('cavalry=1'), 'cavalry', true)).toThrow(/with \?sim/)
    for (const [s, always] of [
      ['infantry=x', true],
      ['cavalry=yes', false],
    ] as const) {
      expect(() => armOn(q(s), s.split('=')[0], false, always)).toThrow(/must be 0 or 1/)
    }
    expect(() => armOn(q('infantry=0'), 'infantry', false, true)).toThrow(/always on the page/)
  })
  // (review round 2: ?cavalry=0 had come to mean the light cavalry alone; saved infantry-only addresses drew horses)
  it('leaves every cavalry arm out at ?cavalry=0, each by its own switch, its own winning', () => {
    const on = (s: string) =>
      ARMS_DEMO.filter((a, i) => armOn(new URLSearchParams(s), a.name, false, i === 0, a.group)).map(a => a.name)
    expect(on('cavalry=0&artillery=0')).toEqual(['infantry', 'light'])
    expect(on('lightcav=0')).toEqual(['infantry', 'light', 'artillery', 'cuirassiers'])
    expect(on('cuirassiers=0')).toEqual(['infantry', 'light', 'artillery', 'lightcav'])
    expect(on('cavalry=0&cuirassiers=1')).toEqual(['infantry', 'light', 'artillery', 'cuirassiers'])
    expect(() => armOn(new URLSearchParams('cavalry=1'), 'lightcav', true, false, 'cavalry')).toThrow(
      /\?cavalry=1 with/,
    )
    expect(() => armOn(new URLSearchParams('cavalry=2'), 'lightcav', false, false, 'cavalry')).toThrow(/must be 0 or 1/)
  })
  it('names ?battle, not ?armies, in the WebGL2 error (the page, src/look/main.ts)', () => {
    const main = readFileSync(new URL('../src/look/main.ts', import.meta.url), 'utf8')
    expect(main).toContain("'?battle needs WebGL2")
    expect(main).not.toContain('?armies needs WebGL2')
  })
})
