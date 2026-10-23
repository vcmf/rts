// Rulesets at their edges (decision 0015; src/sim/ruleset.ts): every check compileRuleset makes refuses a ruleset
// that breaks it, with a message naming what is wrong; the ruleset hash moves with the rules; and the shipped
// ruleset's own data holds together where the compiler does not check it (names that point at nothing).
import { describe, it, expect } from 'vitest'
import { compileRuleset, buildTerrain, MAX_COMPANIES, type Ruleset, type UnitType } from '../src/sim/index.ts'
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
      /5 placements for 6 companies/,
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
      withType('cavalry', { ...cav, charge: { ...cav.charge!, gallopAt: 40 } }),
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
      withType('battery', { ...bat, artillery: { ...bat.artillery!, cone: { ...bat.artillery!.cone, range: 800 } } }),
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
      { ...N, morale: { ...N.morale, contagion: { ...N.morale.contagion, shock: 0.25 } } },
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
      'a melee strength for a kind the terrain table has not',
      { ...N, melee: { ...N.melee, strength: { ...N.melee.strength, camel: 2 } } },
      /melee.strength names camel/,
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
    void _
    expect(() => buildTerrain(data, compileRuleset({ ...N, terrain }))).toThrow(/terrain class woods not in ruleset/)
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

// what the compiler does not check, checked on the data each era ships: a name that points at nothing would be
// read as "none" (an index of −1) or "not given" (undefined) and turn into a NaN or a default far from the check
describe('the shipped rulesets hold together', () => {
  for (const [era, rs] of Object.entries({
    ...Object.fromEntries(Object.entries(RULESETS).map(([k, v]) => [k, v.ruleset])),
    ceiling,
  })) {
    it(`${era}: every shape's pace is a pace, every change time names two of the type's shapes`, () => {
      const paces = Object.keys(rs.pace)
      const bad: string[] = []
      for (const [t, u] of Object.entries(rs.types)) {
        const shapes = Object.keys(u.formations)
        for (const [n, d] of Object.entries(u.formations)) {
          if (!paces.includes(d.pace)) bad.push(`${t}.${n}: pace ${d.pace}`)
          if (d.roadPace !== undefined && !paces.includes(d.roadPace)) bad.push(`${t}.${n}: road pace ${d.roadPace}`)
        }
        for (const k of Object.keys(u.changeTime)) {
          const [a, b] = k.split('>')
          if (!shapes.includes(a) || !shapes.includes(b)) bad.push(`${t}: change time ${k}`)
        }
      }
      expect(bad).toEqual([])
    })
    it(`${era}: every terrain class gives every kind a speed, and names a ground class the paces know`, () => {
      const kinds = Object.keys(Object.values(rs.terrain)[0].g)
      const grounds = new Set(Object.values(rs.q).flatMap(q => Object.keys(q)))
      const bad: string[] = []
      for (const [c, d] of Object.entries(rs.terrain)) {
        for (const k of kinds) if (!(typeof d.g[k] === 'number' && d.g[k] >= 0 && d.g[k] <= 1)) bad.push(`${c}.g.${k}`)
        if (Object.keys(d.g).length !== kinds.length) bad.push(`${c}: kinds ${Object.keys(d.g)}`)
        if (!grounds.has(d.q)) bad.push(`${c}: ground ${d.q}`)
      }
      for (const p of Object.keys(rs.q)) if (!(p in rs.pace)) bad.push(`q.${p}: not a pace`)
      for (const s of Object.keys(rs.fire.sight ?? {})) if (!(s in rs.terrain)) bad.push(`fire.sight.${s}`)
      for (const k of Object.keys(rs.fire.depth)) if (!kinds.includes(k)) bad.push(`fire.depth.${k}`)
      for (const k of Object.keys(rs.disorder.scale)) if (!kinds.includes(k)) bad.push(`disorder.scale.${k}`)
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
