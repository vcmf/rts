// Rulesets at their edges (decision 0015; src/sim/ruleset.ts): every check compileRuleset makes refuses a ruleset
// that breaks it, with a message naming what is wrong; the ruleset hash moves with the rules; and the shipped
// ruleset's own data holds together (names that point at nothing).
import { describe, it, expect } from 'vitest'
import {
  compileRuleset,
  buildTerrain,
  MAX_COMPANIES,
  T_LEN,
  T_HITS,
  T_FLANK,
  T_MELEE,
  type Ruleset,
  type UnitType,
} from '../src/sim/index.ts'
import { napoleonic, ceiling } from '../src/rulesets/napoleonic.ts'
import { RULESETS } from '../src/rulesets/index.ts'
import { data } from './fx.ts'

const N = napoleonic
const T = N.types
// the shipped ruleset with one type replaced
const withType = (name: string, u: UnitType): Ruleset => ({ ...N, types: { ...T, [name]: u } })
const inf = T.infantry
const cav = T.cavalry
const bat = T.battery
const withoutHorse = (g: Record<string, number>) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'horse'))

describe('compileRuleset refuses', () => {
  const cases: [string, Ruleset, RegExp][] = [
    ['no unit types', { ...N, types: {} }, /no unit types/],
    [
      'more companies than the most',
      withType('infantry', { ...inf, geometry: { ...inf.geometry, companies: MAX_COMPANIES + 1 } }),
      /companies, outside 1\.\./,
    ],
    [
      'no companies',
      withType('infantry', { ...inf, geometry: { ...inf.geometry, companies: 0 } }),
      /companies, outside/,
    ],
    ['bins that are not whole', withType('infantry', { ...inf, geometry: { ...inf.geometry, bins: 2.5 } }), /bins/],
    ['more bins than files', withType('infantry', { ...inf, geometry: { ...inf.geometry, bins: 24 } }), /bins/],
    ['a start shape it does not have', withType('infantry', { ...inf, start: 'wedge' }), /start shape wedge/],
    [
      'a shape whose kind is not a column of the terrain table',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, line: { ...inf.formations.line, kind: 'elephant' } },
      }),
      /kind elephant not in the terrain table/,
    ],
    [
      'a shape placing another number of companies',
      withType('infantry', {
        ...inf,
        formations: {
          ...inf.formations,
          line: { ...inf.formations.line, place: g => inf.formations.line.place(g).slice(1) },
        },
      }),
      /3 placements for 4 companies/,
    ],
    [
      'a charge from a shape it does not have',
      withType('cavalry', { ...cav, charge: { ...cav.charge!, shapes: ['wedge'] } }),
      /charges from wedge, not one of its shapes/,
    ],
    [
      'a charge from its trail shape',
      withType('cavalry', { ...cav, charge: { ...cav.charge!, shapes: ['march'] } }),
      /charges from march, a trail shape/,
    ],
    [
      'a charge at a pace that is not one',
      withType('cavalry', { ...cav, charge: { ...cav.charge!, pace: 'canter' } }),
      /charge pace is not one of the paces/,
    ],
    [
      'a charge that gallops before its test',
      withType('cavalry', { ...cav, charge: { ...cav.charge!, gallopAt: 20 } }),
      /gallopAt ≥ test > melee.contact/,
    ],
    ['a charge with no build-up', withType('cavalry', { ...cav, charge: { ...cav.charge!, build: 0 } }), /build > 0/],
    ['a refuge it does not have', withType('infantry', { ...inf, refuge: 'wedge' }), /refuge wedge/],
    ['a refuge that is not braced', withType('infantry', { ...inf, refuge: 'column' }), /refuge column/],
    [
      'guns that fire from a shape they do not have',
      withType('battery', { ...bat, artillery: { ...bat.artillery!, shapes: ['deployed'] } }),
      /fires from deployed/,
    ],
    [
      'canister that reaches as far as the ball',
      withType('battery', { ...bat, artillery: { ...bat.artillery!, cone: { ...bat.artillery!.cone, range: 1000 } } }),
      /cone.range < ray.range/,
    ],
    [
      'canister ranges that do not increase',
      withType('battery', {
        ...bat,
        artillery: {
          ...bat.artillery!,
          cone: {
            ...bat.artillery!.cone,
            hits: [
              [0, 8],
              [0, 5],
            ],
          },
        },
      }),
      /its ranges increasing/,
    ],
    [
      'an arc wider than a half-turn',
      withType('battery', { ...bat, artillery: { ...bat.artillery!, arc: 4 } }),
      /arc in \(0, π\]/,
    ],
    [
      'a firing state left out',
      { ...N, fire: { ...N.fire, state: { steady: 1, shaken: 0.85 } as Ruleset['fire']['state'] } },
      /fire.state has no wavering/,
    ],
    [
      'hit chances whose ranges do not increase',
      {
        ...N,
        fire: {
          ...N.fire,
          pRange: [
            [0, 0.06],
            [100, 0.02],
            [100, 0.01],
          ],
        },
      },
      /pRange ranges must increase/,
    ],
    [
      'a wading limit for a kind the terrain table has not',
      { ...N, water: { ...N.water, limitByKind: { camel: 1.5 } } },
      /wading limit names camel/,
    ],
    [
      "a friend's break strong enough to rout a steady battalion on its own",
      { ...N, morale: { ...N.morale, contagion: { ...N.morale.contagion, shock: 61 } } },
      /contagion.shock over 0.6/,
    ],
    [
      'more rallies than a byte counts',
      { ...N, morale: { ...N.morale, rally: { ...N.morale.rally, max: 255 } } },
      /rally.max/,
    ],
    [
      'a support arc wide enough to count a friend ahead',
      { ...N, morale: { ...N.morale, support: { ...N.morale.support, arc: 2 } } },
      /support.arc must be in/,
    ],
    [
      'a melee strength not above 0',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, line: { ...inf.formations.line, traits: { melee: 0 } } },
      }),
      /shape line's melee must be finite and above 0/,
    ],
    [
      'a fully braced shape with a flank',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, square: { ...inf.formations.square, allRound: false } },
      }),
      /shape square is fully braced but not allRound/,
    ],
    [
      "an allRound shape with a flank's hits, which would never apply",
      withType('infantry', {
        ...inf,
        formations: {
          ...inf.formations,
          square: {
            ...inf.formations.square,
            traits: { ...inf.formations.square.traits, hits: { front: 1.6, flank: 1.3 } },
          },
        },
      }),
      /shape square is allRound: it has no flank's or rear's hits/,
    ],
    [
      'a brace outside 0..1',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, square: { ...inf.formations.square, traits: { brace: 1.5 } } },
      }),
      /shape square's brace must be in 0..1/,
    ],
    [
      'a shape whose pace is not a pace (#156)',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, line: { ...inf.formations.line, pace: 'canter' } },
      }),
      /shape line's pace canter is not one of the paces/,
    ],
    [
      'a shape whose road pace is not a pace (#156)',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, line: { ...inf.formations.line, roadPace: 'canter' } },
      }),
      /shape line's roadPace canter is not one of the paces/,
    ],
    [
      'a change time naming a shape the type has not (#156)',
      withType('infantry', { ...inf, changeTime: { ...inf.changeTime, 'line>wedge': 30 } }),
      /change time line>wedge does not name two of its shapes/,
    ],
    [
      'a terrain class giving a kind no speed (#156)',
      { ...N, terrain: { ...N.terrain, woods: { ...N.terrain.woods, g: withoutHorse(N.terrain.woods.g) } } },
      /terrain class woods gives kind horse \(named by class \w+\) no speed/,
    ],
    [
      'a terrain class giving a kind the other classes give no speed (#156)',
      { ...N, terrain: { ...N.terrain, woods: { ...N.terrain.woods, g: { ...N.terrain.woods.g, camel: 0.5 } } } },
      /terrain class \w+ gives kind camel \(named by class woods\) no speed/,
    ],
    ['a pace that is not a speed', { ...N, pace: { ...N.pace, ordinary: 0 } }, /pace ordinary is 0, not > 0/],
    [
      'a change time that is not a time',
      withType('infantry', { ...inf, changeTime: { ...inf.changeTime, 'line>column': NaN } }),
      /change time line>column is NaN/,
    ],
    [
      'a default change time below 0',
      withType('infantry', { ...inf, defaultChangeTime: -1 }),
      /defaultChangeTime is -1/,
    ],
    ['a q table for a pace there is not', { ...N, q: { ...N.q, canter: { hard: 1 } } }, /q names canter, not a pace/],
    [
      'a terrain class on a ground the q tables do not name',
      { ...N, terrain: { ...N.terrain, woods: { ...N.terrain.woods, q: 'ice' } } },
      /q.ordinary gives ground ice \(terrain class woods\) no factor/,
    ],
    [
      "a terrain class on a ground named like an object's own property",
      { ...N, terrain: { ...N.terrain, woods: { ...N.terrain.woods, q: 'constructor' } } },
      /q.ordinary gives ground constructor \(terrain class woods\) no factor/,
    ],
    [
      "one pace's q table leaving out a ground a class stands on",
      { ...N, q: { ...N.q, trot: { open: 1.15, light: 1.0 } } },
      /q.trot gives ground hard \(terrain class \w+\) no factor/,
    ],
    ['a q factor of 0', { ...N, q: { ...N.q, walk: { ...N.q.walk, open: 0 } } }, /q.walk.open is 0, not > 0/],
    [
      'a sight limit below 0',
      { ...N, fire: { ...N.fire, sight: { ...N.fire.sight, woods: -1 } } },
      /fire.sight.woods is -1/,
    ],
    [
      'hits from the front that are not a number',
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, line: { ...inf.formations.line, traits: { hits: { front: NaN } } } },
      }),
      /shape line's hits must be finite/,
    ],
    [
      'a disorder scale below 0',
      { ...N, disorder: { ...N.disorder, scale: { ...N.disorder.scale, line: -0.5 } } },
      /disorder.scale.line is -0.5/,
    ],
    [
      'a sight limit for a terrain class there is not',
      { ...N, fire: { ...N.fire, sight: { ...N.fire.sight, jungle: 5 } } },
      /fire.sight names jungle/,
    ],
    [
      "hits from a flank under the front's",
      withType('infantry', {
        ...inf,
        formations: { ...inf.formations, line: { ...inf.formations.line, traits: { hits: { front: 1, flank: 0.9 } } } },
      }),
      /shape line's hits must be finite, the front above 0, the flank and rear ≥ 1/,
    ],
    [
      'a disorder scale for a kind the terrain table has not',
      { ...N, disorder: { ...N.disorder, scale: { ...N.disorder.scale, camel: 1 } } },
      /disorder.scale names camel/,
    ],
    [
      'a column of route too deep for the trail ring',
      withType('infantry', { ...inf, geometry: { ...inf.geometry, companies: MAX_COMPANIES, files: 60, bins: 8 } }),
      /trail of \d+ points does not fit/,
    ],
  ]
  for (const [what, rs, message] of cases) {
    it(what, () => {
      expect(() => compileRuleset(rs)).toThrow(message)
    })
  }
})

describe('the terrain refuses', () => {
  it('a map whose terrain class the ruleset has not', () => {
    const { woods: _, ...terrain } = N.terrain
    const { woods: __, ...sight } = N.fire.sight
    void _
    void __
    const rs = { ...N, terrain, fire: { ...N.fire, sight } }
    expect(() => buildTerrain(data, compileRuleset(rs))).toThrow(/terrain class woods not in ruleset/)
  })
})

describe("a shape's traits (docs/proposals/formations.md § 5a)", () => {
  // the compiled row of shape n of type t
  const row = (rs: Ruleset, t: string, n: string) => {
    const U = compileRuleset(rs).types[Object.keys(rs.types).indexOf(t)]
    const s = U.shapes.findIndex(sh => sh.name === n)
    return U.traits.slice(s * T_LEN, s * T_LEN + T_LEN)
  }
  it("are the type's where the shape names none, and the shape's own field by field over them", () => {
    const line = row(N, 'cavalry', 'line')
    expect([line[T_HITS], line[T_FLANK], line[T_MELEE]]).toEqual([1.3, 1.2, 1.6])
    const own = withType('cavalry', {
      ...cav,
      formations: { ...cav.formations, line: { ...cav.formations.line, traits: { hits: { front: 2 }, melee: 2 } } },
    })
    const a = row(own, 'cavalry', 'line')
    const b = row(own, 'cavalry', 'column')
    expect([a[T_HITS], a[T_FLANK], a[T_MELEE]]).toEqual([2, 1, 2])
    expect([b[T_HITS], b[T_MELEE]]).toEqual([1.3, 1.6])
  })
})

describe('the ruleset hash', () => {
  const base = compileRuleset(N).hash
  it('is the same for a copy, and differs for a ruleset that differs anywhere', () => {
    expect(compileRuleset({ ...N, types: { ...T } }).hash).toBe(base)
    const variants: Ruleset[] = [
      { ...N, name: 'other' },
      { ...N, pace: { ...N.pace, ordinary: 0.91 } },
      { ...N, faceTime: N.faceTime + 1 },
      { ...N, end: { ...N.end, margin: 0.06 } },
      { ...N, melee: { ...N.melee, rate: 0.011 } },
      withType('infantry', { ...inf, geometry: { ...inf.geometry, fileSpacing: 0.66 } }),
      withType('infantry', { ...inf, changeTime: { ...inf.changeTime, 'line>square': 1 } }),
      withType('cavalry', { ...cav, charge: { ...cav.charge!, rest: 121 } }),
      // a shape's placement is a function: the hash takes its output
      withType('infantry', {
        ...inf,
        formations: {
          ...inf.formations,
          column: {
            ...inf.formations.column,
            place: g => inf.formations.column.place(g).map(p => ({ ...p, z: p.z - 0.5 })),
          },
        },
      }),
    ]
    const hashes = variants.map(rs => compileRuleset(rs).hash)
    for (const [k, h] of hashes.entries()) expect(h, `variant ${k}`).not.toBe(base)
    expect(new Set(hashes).size).toBe(hashes.length)
  })
})

// the shipped data: every era compiles (the compiler refuses a name that points at nothing, #156), and holds to what
// the compiler leaves to the data: terrain only slows (a factor ≤ 1, a convention, not a rule of the engine)
describe('the shipped rulesets hold together', () => {
  for (const [era, rs] of Object.entries({
    ...Object.fromEntries(Object.entries(RULESETS).map(([k, v]) => [k, v.ruleset])),
    ceiling,
  })) {
    it(`${era}: every terrain factor is at most 1`, () => {
      const bad: string[] = []
      for (const [c, d] of Object.entries(rs.terrain)) {
        for (const [k, v] of Object.entries(d.g)) if (v > 1) bad.push(`${c}.g.${k}`)
      }
      expect(bad).toEqual([])
    })
    it(`${era}: its start orders are a preset; it compiles, and its terrain builds on the formation field`, () => {
      expect(Object.keys(rs.orders)).toContain(rs.start.orders)
      const cr = compileRuleset(rs)
      const t = buildTerrain(data, cr)
      const finite = (a: Float64Array) => a.every(v => v === v)
      expect(finite(t.classG) && finite(t.classQ) && finite(t.waterLimit)).toBe(true)
    })
  }
})
