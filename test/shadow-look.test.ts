// The simple shadows' look a zoom (decision 0062, src/look/shadow-look.ts) and the shape it reads
// (src/look/units-data.ts shadowShape): the looks' blend, the gradient's uniform, the strip's rows, the page's
// switches, and the shape's soft bake beside the shape it leaves as it was.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SHADOW_LOOK,
  SHADOW_LOOK_BAND,
  applyLookParams,
  decalFragment,
  decalStrip,
  farShare,
  footUniform,
  lookBetween,
  parseNumbers,
  shadowModes,
} from '../src/look/shadow-look.ts'
import { decodeUnits, shadowShape } from '../src/look/units-data.ts'

const q = (s: string) => new URLSearchParams(s)
const looks = () => ({ close: { ...SHADOW_LOOK.close }, far: { ...SHADOW_LOOK.far } })

describe('the look a zoom', () => {
  it('is the close look up to the band, the far one past it, a smoothstep between', () => {
    const [r0, r1] = SHADOW_LOOK_BAND
    expect(farShare(r0 - 10, SHADOW_LOOK_BAND)).toBe(0)
    expect(farShare(r1 + 10, SHADOW_LOOK_BAND)).toBe(1)
    expect(farShare((r0 + r1) / 2, SHADOW_LOOK_BAND)).toBeCloseTo(0.5, 9)
    expect(farShare(r0 + 1, SHADOW_LOOK_BAND)).toBeLessThan(1 / (r1 - r0)) // (eased in, no kink)
    const out = { ...SHADOW_LOOK.far }
    expect(lookBetween(SHADOW_LOOK.close, SHADOW_LOOK.far, 0, out)).toEqual(SHADOW_LOOK.close)
    expect(lookBetween(SHADOW_LOOK.close, SHADOW_LOOK.far, 1, out)).toEqual(SHADOW_LOOK.far)
    const mid = lookBetween(SHADOW_LOOK.close, SHADOW_LOOK.far, 0.5, out)
    expect(mid.dark).toBeCloseTo((SHADOW_LOOK.close.dark + SHADOW_LOOK.far.dark) / 2, 9)
  })
  it('is darker at the soles than at the tip up close, one value end to end far off (decision 0049 as it was)', () => {
    expect(SHADOW_LOOK.close.foot).toBeGreaterThan(SHADOW_LOOK.close.dark)
    expect(SHADOW_LOOK.close.core).toBeGreaterThan(0)
    expect([SHADOW_LOOK.far.foot, SHADOW_LOOK.far.dark, SHADOW_LOOK.far.soft]).toEqual([1, 1, 0])
  })
  it("packs the gradient: the soles' and the tip's darkness, the core short of the tip, the tip shortened", () => {
    const l = { ...SHADOW_LOOK.close, len: 0.5, core: 3 }
    const [foot, dark, core, tip] = footUniform(l, 3.6)
    expect([foot, dark]).toEqual([l.foot, l.dark])
    expect(tip).toBeCloseTo(1.8, 9)
    expect(core).toBeLessThan(tip) // (a smoothstep with its edges crossed is undefined)
    expect(footUniform(SHADOW_LOOK.close, 3.6)[2]).toBe(SHADOW_LOOK.close.core)
  })
})

describe('the strip a soldier draws his shadow on', () => {
  const base = { across: [-1, 1], along: [-0.5, 5] } as const
  const full = { across: [-1.4, 1.4], along: [-0.9, 5.4] } as const
  const at = (s: { box: number[]; rows: number[] }, r: number) => s.box[1] + s.rows[r] * s.box[3]
  it('far off is decision 0049s own: the base box, its rows evenly spaced, exactly', () => {
    const s = decalStrip(base, full, 1, 1, 1.5)
    expect(s.box).toEqual([-1, -0.5, 2, 5.5])
    expect(s.rows).toEqual([0, 1 / 3, 2 / 3, 1])
  })
  it('up close covers the soft bake, a row at the soles and one where the lift ramp ends (along the shape)', () => {
    const s = decalStrip(base, full, 0, 0.7, 1.5)
    expect(s.box.map(v => +v.toFixed(9))).toEqual([-1.4, -0.9, 2.8, 6.3])
    expect(at(s, 0)).toBeCloseTo(-0.9, 12)
    expect(at(s, 1)).toBeCloseTo(0, 12) // the soles: the feet stay put when it is shortened
    expect(at(s, 2)).toBeCloseTo(1.5 / 0.7, 12) // the lift whole there, drawn 1.5 m from the soles
    expect(at(s, 3)).toBeCloseTo(5.4, 12)
    expect(() => decalStrip(base, { across: [-1, 1], along: [0.1, 5] }, 0, 1, 1.5)).toThrow(/soles/)
  })
  it('turns from one to the other with the look, nothing jumping at either end', () => {
    for (const r of [0, 1, 2, 3]) {
      expect(at(decalStrip(base, full, 1 - 1e-9, 1, 1.5), r)).toBeCloseTo(at(decalStrip(base, full, 1, 1, 1.5), r), 6)
      expect(at(decalStrip(base, full, 1e-9, 0.7, 1.5), r)).toBeCloseTo(at(decalStrip(base, full, 0, 0.7, 1.5), r), 6)
    }
    const m = decalStrip(base, full, 0.5, 0.85, 1.5)
    expect(m.rows[0]).toBe(0)
    expect(m.rows[3]).toBeCloseTo(1, 12)
    expect(m.rows[1]).toBeLessThan(m.rows[2])
  })
})

describe('where shadows overlap (the decal at a fragment, decalFragment)', () => {
  // a pixel's four samples, each covered when a shadow's share is over its threshold (alpha to coverage: the masks of
  // smaller shares inside those of larger ones), the stencil letting the first shadow at a sample through
  const thresholds = [0.125, 0.375, 0.625, 0.875]
  const resolve = (frags: { cover: number; dark: number }[]) =>
    thresholds.map(t => frags.find(f => f.cover > t)?.dark ?? 0).reduce((a, b) => a + b, 0) / thresholds.length
  const c = SHADOW_LOOK.close
  it('takes the darkest whatever the order: a light tip drawn first takes nothing from a dark contact', () => {
    for (const [s1, g1, s2, g2] of [
      [1, 1, 1, 0], // a tip over the next man's contact
      [0.6, 0.3, 0.9, 0.8],
      [0.2, 0, 1, 1],
    ]) {
      const a = decalFragment(s1, g1, c.foot, c.dark)
      const b = decalFragment(s2, g2, c.foot, c.dark)
      expect(resolve([a, b])).toBe(resolve([b, a]))
      expect(resolve([a, b])).toBe(Math.max(resolve([a]), resolve([b])))
    }
    // (the darkness as a colour, the first commit's: the tip drawn first wins the sample)
    const colour = (s: number, g: number) => ({ cover: s, dark: c.foot + (c.dark - c.foot) * g })
    expect(resolve([colour(1, 1), colour(1, 0)])).not.toBe(resolve([colour(1, 0), colour(1, 1)]))
  })
  it("darkens the soles' contact more than the tip, and never divides by nothing", () => {
    expect(decalFragment(1, 0, c.foot, c.dark).cover).toBe(1)
    expect(decalFragment(1, 1, c.foot, c.dark).cover).toBeCloseTo(c.dark / c.foot, 12)
    expect(decalFragment(1, 1, c.foot, c.dark).dark).toBe(c.foot)
    const z = decalFragment(1, 0.5, 0, 0)
    expect(Number.isFinite(z.cover) && z.cover === 0).toBe(true)
  })
})

describe("the page's switches", () => {
  it('by default draw the simple shadows at every zoom, no map (no proxy, no planks)', () => {
    expect(shadowModes(q(''))).toEqual({ simpleFar: true, simpleClose: true })
    expect(shadowModes(q('ushadowclose=map'))).toEqual({ simpleFar: true, simpleClose: false })
    expect(shadowModes(q('ushadowfar=map'))).toEqual({ simpleFar: false, simpleClose: true })
    expect(() => shadowModes(q('ushadowclose=x'))).toThrow(/ushadowclose/)
  })
  it('set the close look, and the far one when a second value is given', () => {
    const { close, far } = looks()
    const r = applyLookParams(
      q('ushsoft=0.4&ushdark=0.6,0.9&ushlen=0.8&ushfoot=1.1,0.3,1,0.1&ushband=30,70'),
      close,
      far,
    )
    expect(close).toEqual({ soft: 0.4, dark: 0.6, foot: 1.1, core: 0.3, len: 0.8 })
    expect(far).toEqual({ ...SHADOW_LOOK.far, dark: 0.9, foot: 1, core: 0.1 })
    expect(r.band).toEqual([30, 70])
    expect(applyLookParams(q(''), close, far).band).toBeNull()
  })
  it('refuse empty, malformed and out-of-range fields (not 0)', () => {
    for (const bad of [
      'ushsoft=',
      'ushsoft=,0.5',
      'ushsoft=0.5,',
      'ushsoft=2',
      'ushsoft=-0.1',
      'ushsoft=1e-1',
      'ushlen=0.1',
      'ushfoot=1',
      'ushfoot=1,4',
      'ushfoot=1,0.3,1',
      'ushband=70,30',
      'ushband=30',
    ]) {
      const { close, far } = looks()
      expect(() => applyLookParams(q(bad), close, far), bad).toThrow()
    }
    expect(parseNumbers(q('k=0.5'), 'k', [1, 2], [0, 1])).toEqual([0.5])
    expect(parseNumbers(q(''), 'k', [1], [0, 1])).toBeNull()
  })
})

describe('the shape with its soft bake', () => {
  const d = decodeUnits(
    new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer,
  )
  const l = Math.hypot(-0.7, 0.45, 0.55)
  const sun = [-0.7 / l, 0.45 / l, 0.55 / l] as const
  const roles = ['halt', 'march', 'run', 'fire']
  const lod = d.lods[d.lods.length - 1].name
  const plain = shadowShape(d, lod, sun, roles, { facings: 4 })
  const soft = shadowShape(d, lod, sun, roles, { facings: 4, soft: 0.12 })
  it("leaves the shape's texels as they were, whole blocks of 8 texels further in (its mips unchanged too)", () => {
    expect(soft.base).toEqual(plain.base)
    expect(plain.base).toEqual({ across: plain.across, along: plain.along })
    const ex = Math.round((soft.base.across[0] - soft.across[0]) / soft.texel)
    expect(ex % 8).toBe(0)
    expect(ex).toBeGreaterThan(0)
    expect(Math.round((soft.base.along[0] - soft.along[0]) / soft.texel)).toBe(ex)
    for (let r = 0; r < roles.length; r++) {
      for (let k = 0; k < 4; k++) {
        for (let j = 0; j < plain.cellH - 2 * plain.margin; j++) {
          for (let i = 0; i < plain.cellW - 2 * plain.margin; i++) {
            const a =
              plain.data[(r * plain.cellH + plain.margin + j) * plain.width + k * plain.cellW + plain.margin + i]
            const o = (r * soft.cellH + soft.margin + ex + j) * soft.width + k * soft.cellW + soft.margin + ex + i
            if (a !== soft.data[o * 2]) expect(soft.data[o * 2], `${roles[r]} ${k} ${i},${j}`).toBe(a)
          }
        }
      }
    }
  })
  it('bakes in G the shape spread wider at its own darkest value, the border still empty', () => {
    expect(soft.channels).toBe(2)
    expect(soft.data.length).toBe(soft.width * soft.height * 2)
    for (let r = 0; r < roles.length; r++) {
      for (let k = 0; k < 4; k++) {
        const sum = [0, 0]
        const peak = [0, 0]
        for (let j = 0; j < soft.cellH; j++) {
          for (let i = 0; i < soft.cellW; i++) {
            const o = ((r * soft.cellH + j) * soft.width + k * soft.cellW + i) * 2
            if (i < soft.margin || j < soft.margin || i >= soft.cellW - soft.margin || j >= soft.cellH - soft.margin) {
              expect(soft.data[o] + soft.data[o + 1]).toBe(0)
              continue
            }
            for (const c of [0, 1]) {
              sum[c] += soft.data[o + c]
              peak[c] = Math.max(peak[c], soft.data[o + c])
            }
          }
        }
        expect(sum[1] / sum[0]).toBeGreaterThan(1)
        expect(sum[1] / sum[0]).toBeLessThan(4)
        expect(Math.abs(peak[1] - peak[0])).toBeLessThanOrEqual(1)
      }
    }
    expect(() => shadowShape(d, lod, sun, roles, { soft: -1 })).toThrow(/soft/)
  })
  it('shows no musket plank: past the body, at most a faint stroke (the bayonet) at the close look', () => {
    // along the shadow, the darkest value a row holds at the close look's tip (its soft share of G, its darkness over
    // the soles'): the torso's against what lies past 3.6 m (beyond his head)
    const c = SHADOW_LOOK.close
    for (const r of [0, 1]) {
      for (let k = 0; k < 4; k++) {
        let body = 0
        let past = 0
        for (let j = soft.margin; j < soft.cellH - soft.margin; j++) {
          const along = soft.along[0] + (j - soft.margin + 0.5) * soft.texel
          for (let i = soft.margin; i < soft.cellW - soft.margin; i++) {
            const o = ((r * soft.cellH + j) * soft.width + k * soft.cellW + i) * 2
            if (along > 1 && along < 3) body = Math.max(body, soft.data[o])
            const tip = ((1 - c.soft) * soft.data[o] + c.soft * soft.data[o + 1]) * (c.dark / c.foot)
            if (along > 3.6) past = Math.max(past, tip)
          }
        }
        expect(body, `${roles[r]} ${k}`).toBeGreaterThan(200)
        expect(past / body, `${roles[r]} ${k}`).toBeLessThan(0.15)
      }
    }
  })
})
