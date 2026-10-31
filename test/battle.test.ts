// The demo map's battle at the division scale (src/look/world/battle.ts, docs/plans/active/division-armies.md): the
// ruleset's blocks and corps (src/rulesets/napoleonic-division.ts), each battle's order of battle and figures, the
// layout on the demo map's blocked ground (test/fixtures/demo-map-blocked.bin.gz, sampled from the page over ±370 m by
// tools/sample-blocked.mjs: rerun it when the map, its trees, river or buildings change), and the page's switches
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { compileRuleset } from '../src/sim/index.ts'
import { CORPS, napoleonicDivision as rs } from '../src/rulesets/napoleonic-division.ts'
import { rulesetOf } from '../src/rulesets/index.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'
import { DYES } from '../src/rulesets/napoleonic-dyes.ts'
import { ARMIES_DEMO, ARMS_DEMO } from '../src/scenarios/armies-demo.ts'
import { facingAt, type Battalion } from '../src/look/world/armies.ts'
import { armScript, boxOf, type Box } from '../src/look/world/arms.ts'
import {
  FIELD,
  RESERVE_BACK,
  battleChoice,
  battleHref,
  battleLayout,
  figuresOf,
  orderOfBattle,
  type FieldKind,
  type Fielded,
} from '../src/look/world/battle.ts'
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
  built.map(b => [b.spec.unitType, { work: b.work, rest: b.rest, cycle: b.script.cycle }]),
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
  it('fields the blocks of decision 0076 (and #280): line 240, light 160, light cavalry 80, a battery of 4 guns, 48', () => {
    expect(sizes).toEqual({ infantry: 240, light: 160, cavalry: 80, cuirassiers: 120, battery: 48 })
    expect(rs.types.battery.geometry.companies).toBe(4)
    expect([rs.types.cavalry.geometry.companies, rs.types.cavalry.geometry.files]).toEqual([2, 20])
  })
  it('compiles in the sim, each type its figures as slots, and resolves by name', () => {
    const cr = compileRuleset(rulesetOf(ARMIES_DEMO.ruleset))
    for (const [k, n] of Object.entries(sizes)) expect(cr.types[cr.typeIndex(k)].slots, k).toBe(n)
  })
  it('makes an infantry corps of 8 to 10 units and 1,300 to 1,700 figures (decision 0076)', () => {
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
  it('fields the once corps alone without a repeated one, and fails loudly on a type with no size', () => {
    expect(orderOfBattle({ figures: 99999, once: [CORPS.cavalryReserve], repeat: [] }, sizes).length).toBe(5)
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
const layoutOf = (name: string) => {
  const o = orderOfBattle(ARMIES_DEMO.battles[name], sizes)
  return { o, placed: battleLayout([o, o], KINDS, ARMIES_DEMO.deploy, demo, SIDES, EXTENT) }
}

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
  it('stands the first corps in line at the front, their lines deploying and the rest in column behind', () => {
    const { placed } = layoutOf('16k')
    const front = FIELD.gap / 2
    const lines = placed.infantry.filter(b => !b.reserve)
    // (two corps of three line units a side, each side's light infantry beside them, the reserves 40 m back at least)
    expect([lines.filter(b => b.side === 0).length, lines.filter(b => b.side === 1).length]).toEqual([6, 6])
    expect(placed.light.filter(b => !b.reserve).length).toBe(4)
    for (const [type, bs] of Object.entries(placed)) {
      for (const b of bs.filter(u => u.reserve)) {
        expect(Math.abs(b.z) - front, type).toBeGreaterThanOrEqual(RESERVE_BACK - 1e-9)
        expect(b.heading).toBe(b.side === 0 ? 0 : Math.PI)
      }
    }
    // (the lines' fronts at the front or a little behind it where the ground is blocked, never ahead: the gap between
    // the lines kept; the fight's middle, the cameras' focus, within the camera's play area)
    for (const b of lines) {
      expect(Math.abs(b.z)).toBeGreaterThanOrEqual(front - 1e-9)
      expect(Math.abs(b.z)).toBeLessThan(front + 60)
    }
    const [fx, fz] = facingAt(placed.infantry)
    expect(Math.max(Math.abs(fx), Math.abs(fz))).toBeLessThanOrEqual(235)
    // (the engaged cycles staggered: no two of a type in step)
    expect(new Set(lines.filter(b => b.side === 0).map(b => b.offset)).size).toBe(6)
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
    for (const id of arm('cavalry').sides) {
      const c = dressed(UNIFORMS[id], DYES, { parts: { ...d.parts, ...arm('cavalry').parts } }).colours
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
  const budgets = Object.fromEntries(Object.entries(ARMIES_DEMO.battles).map(([k, b]) => [k, b.figures]))
  const choose = (s: string) =>
    battleChoice(new URLSearchParams(s), budgets, ARMIES_DEMO.battle, ARMIES_DEMO.legacyBattalion)
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
})
