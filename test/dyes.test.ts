// The dye palette's test set (docs/plans/active/dye-palette.md, decision 0068, proposed): every dress resolves into
// a uniform for the figure's roles, by dye names only; the greatcoat covers the coat when worn; the boots are the
// set's; the ?dye= and ?uniforms=dyes switches' pure parts
import { describe, expect, it } from 'vitest'
import { DRESS, DYES } from '../src/rulesets/napoleonic-dyes.ts'
import { RULESETS } from '../src/rulesets/index.ts'
import { ARMIES_DEMO } from '../src/scenarios/armies-demo.ts'
import { FIGURE_PARTS, deltaE, dressAll, dressed, dyeOverride, labOf, wearInTurn } from '../src/look/world/dyes.ts'
import { farRule, type Battalion } from '../src/look/world/armies.ts'
import type { Dress } from '../src/sim/ruleset.ts'

const HEX = /^#[0-9A-F]{6}$/
const PALETTE_ROLES = ['coat', 'facings', 'white', 'dark', 'skin', 'leather', 'pack', 'wood', 'metal']

describe('the dye set', () => {
  it('is a short list of named colours, each one sRGB value, every one worn or flown', () => {
    const names = Object.keys(DYES.dyes)
    expect(names.length).toBeGreaterThanOrEqual(12)
    expect(names.length).toBeLessThanOrEqual(16)
    for (const h of [...Object.values(DYES.dyes), ...Object.values(DYES.materials)]) expect(h).toMatch(HEX)
    expect(new Set(Object.values(DYES.dyes)).size).toBe(names.length)
    const used = new Set(Object.values(DRESS).flatMap(d => [...Object.values(d.parts), ...d.flag]))
    // sky-blue is worn (the Grenzer's trousers); a dye nobody names is dead data
    expect(names.filter(n => !used.has(n) && n !== DYES.boots)).toEqual([])
  })
  it('names the boots by a dye', () => expect(DYES.dyes[DYES.boots]).toBeDefined())
})

describe('dressed', () => {
  it('resolves every dress of the era by the figure roles, the boots black, the materials the set’s', () => {
    expect(Object.keys(FIGURE_PARTS)).toEqual(PALETTE_ROLES)
    for (const winter of [false, true]) {
      for (const u of Object.values(dressAll(DRESS, DYES, { winter }))) {
        expect(Object.keys(u.colours)).toEqual(PALETTE_ROLES)
        expect(u.colours.dark).toBe(DYES.dyes.black)
        expect(u.colours.skin).toBe(DYES.materials.skin)
        for (const h of [...Object.values(u.colours), ...u.flag]) expect(h).toMatch(HEX)
      }
    }
  })
  it('maps the parts onto the roles: coat, facings, trousers on the white role', () => {
    const u = dressed(DRESS['br-line'], DYES)
    expect(u.colours.coat).toBe(DYES.dyes['madder-red'])
    expect(u.colours.facings).toBe(DYES.dyes.buff)
    expect(u.colours.white).toBe(DYES.dyes['pike-grey'])
    expect(u.flag).toEqual(DRESS['br-line'].flag.map(n => DYES.dyes[n]))
  })
  it('covers the coat and the facings with the greatcoat in winter, or always when the dress says so', () => {
    const d = DRESS['at-line']
    expect(dressed(d, DYES).colours.coat).toBe(DYES.dyes.white)
    const w = dressed(d, DYES, { winter: true })
    expect(w.colours.coat).toBe(DYES.dyes['greatcoat-grey'])
    expect(w.colours.facings).toBe(DYES.dyes['greatcoat-grey'])
    expect(w.colours.white).toBe(DYES.dyes.white) // the belts and the trousers below it
    const always: Dress = { ...d, greatcoat: 'always' }
    expect(dressed(always, DYES).colours.coat).toBe(DYES.dyes['greatcoat-grey'])
    const none: Dress = { ...d, parts: { coat: 'white', facings: 'crimson', trousers: 'white' } }
    expect(dressed(none, DYES, { winter: true }).colours.coat).toBe(DYES.dyes.white)
  })
  it('lets the far rule follow the worn coat: the white coat keeps its own, its grey greatcoat takes the coat’s', () => {
    expect(farRule(dressed(DRESS['at-line'], DYES))).toBe('own')
    expect(farRule(dressed(DRESS['at-line'], DYES, { winter: true }))).toBe('coat')
    expect(farRule(dressed(DRESS['fr-line'], DYES))).toBe('coat')
  })
  it('fails loudly on a dye the set lacks', () => {
    const bad: Dress = { ...DRESS['fr-line'], parts: { ...DRESS['fr-line'].parts, coat: 'woad' } }
    expect(() => dressed(bad, DYES)).toThrow(/names no dye woad/)
    expect(() => dressed({ ...DRESS['fr-line'], flag: ['purple'] }, DYES)).toThrow(/flag names no dye purple/)
  })
})

describe('dyeOverride (?dye=)', () => {
  it('keeps the set without the switch', () => {
    expect(dyeOverride(null, DYES)).toBe(DYES)
    expect(dyeOverride('', DYES)).toBe(DYES)
  })
  it('swaps a dye for every uniform that names it, the era data untouched', () => {
    const s = dyeOverride('imperial-blue:#26386e', DYES)
    expect(s.dyes['imperial-blue']).toBe('#26386E')
    expect(DYES.dyes['imperial-blue']).toBe('#1F2B52')
    const u = dressAll(DRESS, s)
    expect(u['fr-line'].colours.coat).toBe('#26386E')
    expect(u['fr-guard-grenadier'].colours.coat).toBe('#26386E')
    expect(u['fr-line'].flag[0]).toBe('#26386E')
  })
  it('fails loudly on a malformed entry, an unknown dye or a dye named twice', () => {
    expect(() => dyeOverride('imperial-blue', DYES)).toThrow(/must be/)
    expect(() => dyeOverride('woad:#123456', DYES)).toThrow(/no dye woad/)
    expect(() => dyeOverride('black:#000000;black:#111111', DYES)).toThrow(/twice/)
  })
})

describe('wearInTurn (?uniforms=dyes)', () => {
  const b = (side: number): Battalion => ({ side, uniform: 'x', x: 0, z: 0, heading: 0, offset: 0 })
  it("gives each side's battalions its list in turn, in the layout's order", () => {
    const out = wearInTurn([b(0), b(1), b(0), b(0), b(1), b(0)], [['a', 'b', 'c'], ['d']])
    expect(out.map(o => o.uniform)).toEqual(['a', 'd', 'b', 'c', 'd', 'a'])
  })
  it('names only uniforms the era dresses', () => {
    const era = RULESETS[ARMIES_DEMO.ruleset]
    for (const id of ARMIES_DEMO.dyeSides.flat()) expect(era.dress?.[id]).toBeDefined()
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
