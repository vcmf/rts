// The dye palette (docs/plans/active/dye-palette.md, decision 0068): every uniform of the era resolves onto the
// figure's roles by dye names only, its flag by flag dyes; the greatcoat covers the coat when worn; the boots are the
// set's; the ?dye= and ?uniforms= switches' pure parts; the checks' blocks take the uniforms' coats
import { describe, expect, it } from 'vitest'
import { DYES } from '../src/rulesets/napoleonic-dyes.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'
import { RULESETS } from '../src/rulesets/index.ts'
import { ARMIES_DEMO } from '../src/scenarios/armies-demo.ts'
import { FIGURE_PARTS, deltaE, dressAll, dressed, dyeOverride, labOf, wearInTurn } from '../src/look/world/dyes.ts'
import { farRule, type Battalion } from '../src/look/world/armies.ts'
import type { Dress } from '../src/sim/ruleset.ts'
// @ts-expect-error: a JavaScript tool, untyped
import { BLOCK_UNIFORMS, ERA_COATS, coatsFrom } from '../tools/army-blocks.mjs'
import { readFileSync } from 'node:fs'
import { decodeUnits } from '../src/look/units-data.ts'

const HEX = /^#[0-9A-F]{6}$/
// the baked figure's colour roles, as the page reads them (tools/bake-figure.py's palette)
const PALETTE_ROLES = decodeUnits(
  new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer,
).palette

describe('the dye set', () => {
  it('is a short list of named colours, each one sRGB value, every one worn', () => {
    const names = Object.keys(DYES.dyes)
    expect(names.length).toBeGreaterThanOrEqual(12)
    expect(names.length).toBeLessThanOrEqual(16)
    for (const t of [DYES.dyes, DYES.flags, DYES.materials]) for (const h of Object.values(t)) expect(h).toMatch(HEX)
    expect(new Set(Object.values(DYES.dyes)).size).toBe(names.length)
    const worn = new Set(Object.values(UNIFORMS).flatMap(d => Object.values(d.parts)))
    expect(names.filter(n => !worn.has(n) && n !== DYES.boots)).toEqual([])
    const flown = new Set(Object.values(UNIFORMS).flatMap(d => d.flag))
    expect(Object.keys(DYES.flags).filter(n => !flown.has(n))).toEqual([])
  })
  it('names the boots by a dye', () => expect(DYES.dyes[DYES.boots]).toBeDefined())
  it('has a dye for every part every uniform names, and a flag dye for every band', () => {
    for (const d of Object.values(UNIFORMS)) {
      for (const [part, n] of Object.entries(d.parts)) expect(Object.hasOwn(DYES.dyes, n), `${d.id}.${part}`).toBe(true)
      for (const n of d.flag) expect(Object.hasOwn(DYES.flags, n), `${d.id} flag`).toBe(true)
    }
  })
  it('keeps the Austrian breeches and belts apart from its white coat', () => {
    const u = dressed(UNIFORMS['at-line'], DYES).colours
    expect(deltaE(u.coat, u.white)).toBeGreaterThan(4)
  })
})

describe('dressed', () => {
  it('resolves every uniform of the era by the figure roles, the boots black, the materials the era’s', () => {
    expect(Object.keys(FIGURE_PARTS)).toEqual(PALETTE_ROLES)
    for (const greatcoat of [false, true]) {
      for (const u of Object.values(dressAll(UNIFORMS, DYES, { greatcoat }))) {
        expect(Object.keys(u.colours)).toEqual(PALETTE_ROLES)
        expect(u.colours.dark).toBe(DYES.dyes.black)
        expect(u.colours.skin).toBe(DYES.materials.skin)
        for (const h of [...Object.values(u.colours), ...u.flag]) expect(h).toMatch(HEX)
      }
    }
  })
  it('maps the parts onto the roles (trousers on the white role), the flag from the flag dyes', () => {
    const u = dressed(UNIFORMS['br-line'], DYES)
    expect(u.colours.coat).toBe(DYES.dyes['madder-red'])
    expect(u.colours.facings).toBe(DYES.dyes.buff)
    expect(u.colours.white).toBe(DYES.dyes['pike-grey'])
    expect(u.flag).toEqual(UNIFORMS['br-line'].flag.map(n => DYES.flags[n]))
  })
  it("paints the demo's sides as the owner picked: the French coat the dark blue", () => {
    expect(dressed(UNIFORMS[ARMIES_DEMO.sides[0]], DYES).colours.coat).toBe('#26386E')
    expect(dressed(UNIFORMS[ARMIES_DEMO.sides[1]], DYES).colours.coat).toBe(DYES.dyes.white)
  })
  it('covers the coat and the facings with the greatcoat when worn; without one, the coat stays', () => {
    const d = UNIFORMS['at-line']
    expect(dressed(d, DYES).colours.coat).toBe(DYES.dyes.white)
    const w = dressed(d, DYES, { greatcoat: true })
    expect(w.colours.coat).toBe(DYES.dyes['greatcoat-grey'])
    expect(w.colours.facings).toBe(DYES.dyes['greatcoat-grey'])
    expect(w.colours.white).toBe(DYES.dyes['off-white']) // the belts and the trousers below it
    const none: Dress = { ...d, parts: { coat: 'white', facings: 'crimson', trousers: 'white' } }
    expect(dressed(none, DYES, { greatcoat: true }).colours.coat).toBe(DYES.dyes.white)
  })
  it('lets the far rule follow the worn coat: the white coat keeps its own, its grey greatcoat takes the coat’s', () => {
    expect(farRule(dressed(UNIFORMS['at-line'], DYES))).toBe('own')
    expect(farRule(dressed(UNIFORMS['at-line'], DYES, { greatcoat: true }))).toBe('coat')
    expect(farRule(dressed(UNIFORMS['fr-line'], DYES))).toBe('coat')
  })
  it('fails loudly on a dye the set lacks, even on a part the figure does not show, or a cloth dye on a flag', () => {
    const hat: Dress = { ...UNIFORMS['fr-line'], parts: { ...UNIFORMS['fr-line'].parts, headgear: 'blak' } }
    expect(() => dressed(hat, DYES)).toThrow(/headgear names no dye blak/)
    const proto: Dress = { ...UNIFORMS['fr-line'], parts: { ...UNIFORMS['fr-line'].parts, coat: 'constructor' } }
    expect(() => dressed(proto, DYES)).toThrow(/names no dye constructor/)
    const bad: Dress = { ...UNIFORMS['fr-line'], parts: { ...UNIFORMS['fr-line'].parts, coat: 'woad' } }
    expect(() => dressed(bad, DYES)).toThrow(/names no dye woad/)
    expect(() => dressed({ ...UNIFORMS['fr-line'], flag: ['white'] }, DYES)).toThrow(/flag names no dye white/)
  })
})

describe('dyeOverride (?dye=)', () => {
  it('keeps the set without the switch', () => {
    expect(dyeOverride(null, DYES)).toBe(DYES)
    expect(dyeOverride('', DYES)).toBe(DYES)
  })
  it('swaps a dye for every uniform that names it, the era data and the flags untouched', () => {
    expect(dyeOverride('imperial-blue:1f2b52', DYES).dyes['imperial-blue']).toBe('#1F2B52') // '#' optional
    const s = dyeOverride('imperial-blue:#1f2b52', DYES)
    expect(s.dyes['imperial-blue']).toBe('#1F2B52')
    expect(DYES.dyes['imperial-blue']).toBe('#26386E')
    const u = dressAll(UNIFORMS, s)
    expect(u['fr-line'].colours.coat).toBe('#1F2B52')
    expect(u['fr-guard-grenadier'].colours.coat).toBe('#1F2B52')
    expect(u['fr-line'].flag).toEqual(dressed(UNIFORMS['fr-line'], DYES).flag)
  })
  it('fails loudly on a malformed entry, an unknown dye or a dye named twice', () => {
    expect(() => dyeOverride('imperial-blue', DYES)).toThrow(/must be/)
    expect(() => dyeOverride('woad:#123456', DYES)).toThrow(/no dye woad/)
    expect(() => dyeOverride('black:#000000;black:#111111', DYES)).toThrow(/twice/)
  })
})

describe('wearInTurn (?uniforms=all)', () => {
  const b = (side: number): Battalion => ({ side, uniform: 'x', x: 0, z: 0, heading: 0, offset: 0 })
  it("gives each side's battalions its list in turn, in the layout's order", () => {
    const out = wearInTurn([b(0), b(1), b(0), b(0), b(1), b(0)], [['a', 'b', 'c'], ['d']])
    expect(out.map(o => o.uniform)).toEqual(['a', 'd', 'b', 'c', 'd', 'a'])
  })
  it('names only uniforms the era has', () => {
    const era = RULESETS[ARMIES_DEMO.ruleset]
    for (const id of [...ARMIES_DEMO.sides, ...ARMIES_DEMO.reviewSides.flat()]) expect(era.uniforms[id]).toBeDefined()
  })
})

describe("the checks' blocks (tools/army-blocks.mjs)", () => {
  it("take the four uniforms' coats from the era's dyes", () => {
    expect(Object.keys(ERA_COATS)).toEqual(BLOCK_UNIFORMS)
    expect(coatsFrom(undefined)).toBe(ERA_COATS)
    for (const id of BLOCK_UNIFORMS) expect(ERA_COATS[id]).toBe(dressed(UNIFORMS[id], DYES).colours.coat)
  })
  it('take four other coats from ARMY_COATS, and refuse a malformed one', () => {
    expect(coatsFrom('a=#1f2b52,b=2A5434,c=#E8E2D2,d=#A8322B')).toEqual({
      a: '#1F2B52',
      b: '#2A5434',
      c: '#E8E2D2',
      d: '#A8322B',
    })
    expect(() => coatsFrom('a=#1f2b52')).toThrow(/not 4/)
    expect(() => coatsFrom('a.b=#1f2b52,b=#2A5434,c=#E8E2D2,d=#A8322B')).toThrow(/must be/)
    expect(() => coatsFrom('a=#1f2b52,a=#2A5434,c=#E8E2D2,d=#A8322B')).toThrow(/distinct/)
  })
})

describe('labOf, deltaE', () => {
  it('matches CIE L*a*b* at the ends and is symmetric', () => {
    expect(labOf('#FFFFFF')[0]).toBeCloseTo(100, 1)
    expect(labOf('#000000')[0]).toBeCloseTo(0, 6)
    expect(Math.hypot(labOf('#808080')[1], labOf('#808080')[2])).toBeLessThan(0.01)
    expect(deltaE('#1F2B52', '#26386E')).toBeCloseTo(deltaE('#26386E', '#1F2B52'), 9)
  })
})
