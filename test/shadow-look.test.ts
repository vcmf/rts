// The simple shadows' look a zoom (decision 0062, src/look/shadow-look.ts) and the shape it reads
// (src/look/units-data.ts shadowShape): the looks' blend, the gradient's uniform, the strip's rows, the page's
// switches, and the shape's soft bake beside the shape it leaves as it was.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SHADOW_CONTACT,
  SHADOW_LOOK,
  SHADOW_LOOK_BAND,
  SHADE_LUMA,
  applyContactParams,
  applyLookParams,
  cappedCover,
  capShade,
  contactOvalOn,
  contactPoint,
  contactReachOf,
  contactShare,
  contactUniform,
  contactWeight,
  decalFragment,
  decalStrip,
  farShare,
  footUniform,
  heldLook,
  lookBetween,
  luma,
  decalPixel,
  parseNumbers,
  shadowModes,
  shadowShade,
  simpleShadowsDraw,
  stencilFor,
} from '../src/look/shadow-look.ts'
import { contactOvals, decodeUnits, enclosingOval, posedVertices, shadowShape } from '../src/look/units-data.ts'

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
  it("is darker than decision 0062 shipped it: the owner's gain, 2 up close and 1.5 far (2026-10-26)", () => {
    expect([SHADOW_LOOK.close.gain, SHADOW_LOOK.far.gain]).toEqual([2, 1.5])
    expect(lookBetween(SHADOW_LOOK.close, SHADOW_LOOK.far, 0.5, { ...SHADOW_LOOK.far }).gain).toBeCloseTo(1.75, 12)
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
  // (a smoke test: the gain is one colour for every shadow, so it cannot reorder them; the rule itself is above)
  it('the gain, one colour for every shadow, leaves the rule as it was', () => {
    const k = [0.42, 0.5, 0.66]
    const luma = (d: number[]) => 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]
    // each sample the first covering shadow's colour (its full darkness through the gain), else the ground as it is
    const colour = (frags: { cover: number; dark: number }[], gain: number) =>
      luma(
        thresholds
          .map(t => {
            const f = frags.find(x => x.cover > t)
            return f ? shadowShade(k, f.dark, gain) : [1, 1, 1]
          })
          .reduce((p, q) => p.map((v, i) => v + q[i] / thresholds.length), [0, 0, 0]),
      )
    for (const gain of [1, 1.5, 2]) {
      for (const [s1, g1, s2, g2] of [
        [1, 1, 1, 0],
        [0.6, 0.3, 0.9, 0.8],
        [0.2, 0, 1, 1],
      ]) {
        const a = decalFragment(s1, g1, c.foot, c.dark)
        const b = decalFragment(s2, g2, c.foot, c.dark)
        expect(colour([a, b], gain)).toBe(colour([b, a], gain))
        expect(colour([a, b], gain)).toBe(Math.min(colour([a], gain), colour([b], gain)))
      }
    }
  })
  it("darkens the soles' contact more than the tip, and never divides by nothing", () => {
    expect(decalFragment(1, 0, c.foot, c.dark).cover).toBe(1)
    expect(decalFragment(1, 1, c.foot, c.dark).cover).toBeCloseTo(c.dark / c.foot, 12)
    expect(decalFragment(1, 1, c.foot, c.dark).dark).toBe(c.foot)
    const z = decalFragment(1, 0.5, 0, 0)
    expect(Number.isFinite(z.cover) && z.cover === 0).toBe(true)
  })
})

describe("the darkening's gain (shadowShade)", () => {
  const k = [0.42, 0.5, 0.66] // a painted cast shadow's ratio: darker, a little blue
  const luma = (d: number[]) => 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]
  it('is the darkening as it was at gain 1: toward the shade by f, clamped at 0', () => {
    shadowShade(k, 1, 1).forEach((v, i) => expect(v).toBeCloseTo(k[i], 15))
    expect(shadowShade(k, 0, 1)).toEqual([1, 1, 1])
    expect(shadowShade(k, 0.5, 1).map(v => +v.toFixed(12))).toEqual([0.71, 0.75, 0.83])
    expect(shadowShade(k, 2, 1)[0]).toBe(0)
  })
  it("darkens more the higher it is, its luminance the gain's power, the hue kept, never below 0", () => {
    let prev = luma(shadowShade(k, 1.05, 1))
    for (const gain of [1.25, 1.5, 2, 3]) {
      const d = shadowShade(k, 1.05, gain)
      const l = luma(d)
      expect(l).toBeLessThan(prev)
      expect(l).toBeCloseTo(luma(shadowShade(k, 1.05, 1)) ** gain, 12)
      expect(d[0] / d[2]).toBeCloseTo(shadowShade(k, 1.05, 1)[0] / shadowShade(k, 1.05, 1)[2], 12)
      expect(Math.min(...d)).toBeGreaterThan(0)
      prev = l
    }
  })
  it('darkens nothing where the ground is already in full shadow, and stays finite where the shade is black', () => {
    expect(shadowShade([1, 1, 1], 1, 2)).toEqual([1, 1, 1])
    for (const gain of [1, 2, 3]) expect(shadowShade([0, 0, 0], 1, gain).every(Number.isFinite)).toBe(true)
  })
  it('is what the shader does: the full darkness gained by its luminance, then the coverage or the share', () => {
    const frag = readFileSync(new URL('../src/look/shaders/unitdecal.frag', import.meta.url), 'utf8').replace(
      /\s+/g,
      '',
    )
    const gainLine = `d*=pow(max(dot(d,vec3(${SHADE_LUMA.join(',')})),1.0e-3),uShGain-1.0);`
    const at = frag.indexOf(gainLine)
    expect(at).toBeGreaterThan(frag.indexOf('vec3d=max(mix(vec3(1.0),k,f),0.0);'))
    expect(frag.indexOf('vec3d=max(mix(vec3(1.0),k,f),0.0);')).toBeGreaterThan(0)
    expect(frag.indexOf('gl_FragColor=vec4(d,a);')).toBeGreaterThan(at)
    expect(frag.indexOf('gl_FragColor=vec4(mix(vec3(1.0),d,a),0.0);')).toBeGreaterThan(at)
    expect(frag).toContain('#ifndefCOVERAGEif(s<0.02)discard;#endif')
    expect(frag).not.toContain('k,f*a')
  })
  it('never brightens a channel at any gain the switch takes (1 to 3)', () => {
    for (const gain of [1, 1.5, 3]) {
      for (const f of [0.3, 1, 1.05]) {
        const plain = shadowShade(k, f, 1)
        shadowShade(k, f, gain).forEach((v, i) => expect(v).toBeLessThanOrEqual(plain[i] + 1e-15))
      }
    }
  })
  it('gives a pixel the same darkening with and without the coverage (the full darkness gained, then shared)', () => {
    for (const gain of [1, 1.5, 2]) {
      for (const a of [0, 0.25, 0.5, 0.75, 1]) {
        const cov = decalPixel(k, 1.05, gain, a, true)
        decalPixel(k, 1.05, gain, a, false).forEach((v, i) => expect(v).toBeCloseTo(cov[i], 12))
      }
    }
    // (the first order, the share mixed in before the gain, made the soft parts darker without the coverage)
    const gainedAfter = (a: number, gain: number) => shadowShade(k, 1.05 * a, gain)
    expect(luma(gainedAfter(0.5, 2))).not.toBeCloseTo(luma(decalPixel(k, 1.05, 2, 0.5, true)), 3)
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
    expect(close).toEqual({ ...SHADOW_LOOK.close, soft: 0.4, dark: 0.6, foot: 1.1, core: 0.3, len: 0.8 })
    expect(far).toEqual({ ...SHADOW_LOOK.far, dark: 0.9, foot: 1, core: 0.1 })
    const g = looks()
    applyLookParams(q('ushgain=1'), g.close, g.far)
    expect([g.close.gain, g.far.gain]).toEqual([1, SHADOW_LOOK.far.gain]) // (1: as decision 0062 shipped it)
    applyLookParams(q('ushgain=1.75,1.25'), g.close, g.far)
    expect([g.close.gain, g.far.gain]).toEqual([1.75, 1.25])
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
      'ushgain=0.9',
      'ushgain=3.5',
      'ushgain=1.5,',
      'ushband=30',
    ]) {
      const { close, far } = looks()
      expect(() => applyLookParams(q(bad), close, far), bad).toThrow()
    }
    expect(parseNumbers(q('k=0.5'), 'k', [1, 2], [0, 1])).toEqual([0.5])
    expect(parseNumbers(q(''), 'k', [1], [0, 1])).toBeNull()
  })
})

describe('where the stencil goes (stencilFor, #134)', () => {
  // (#134: the engine's own stencil gave every target one, the scene's depth DEPTH24_STENCIL8, not DEPTH32_FLOAT)
  const cases: [string, 'none' | 'scene' | 'engine'][] = [
    ['', 'none'],
    ['stencil=scene', 'none'],
    ['armies=20', 'scene'],
    ['armies=20&unitshadow=1', 'scene'],
    ['armies=20&ushadowclose=map', 'scene'],
    ['armies=20&ushadowfar=simple', 'scene'],
    ['armies=20&unitshadow=0', 'none'],
    ['armies=20&ushadowfar=map', 'none'],
    ['armies=20&stencil=0', 'none'],
    ['stencil=all', 'engine'],
    ['armies=20&stencil=all', 'engine'],
    ['armies=20&unitshadow=0&stencil=all', 'engine'],
  ]
  for (const [params, at] of cases) {
    it(`?${params}: ${at}`, () => {
      expect(stencilFor(q(params))).toBe(at)
    })
  }
  // (?armies=0 never gets here: the page refuses a count outside 1 to 40, src/look/main.ts)
  it('refuses another value', () => {
    for (const v of ['1', 'engine', '']) expect(() => stencilFor(q(`stencil=${v}`)), v).toThrow(/\?stencil must be/)
  })
})

describe('whether the simple shadows draw (simpleShadowsDraw)', () => {
  it('only with armies, their shadows on and the simple ones beyond close zoom', () => {
    expect(simpleShadowsDraw(q(''))).toBe(false)
    expect(simpleShadowsDraw(q('armies=20'))).toBe(true)
    expect(simpleShadowsDraw(q('armies=20&ushadowclose=map'))).toBe(true)
    expect(simpleShadowsDraw(q('armies=20&unitshadow=0'))).toBe(false)
    expect(simpleShadowsDraw(q('armies=20&ushadowfar=map'))).toBe(false)
    expect(() => simpleShadowsDraw(q('armies=20&ushadowfar=x'))).toThrow(/ushadowfar/)
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

describe('the contact shadow and the cap (decision 0071)', () => {
  const k = [0.25, 0.3, 0.42]
  it("are on by default, the owner's (2026-10-27): the oval following the feet, soft, 0.9 dark, capped", () => {
    expect(SHADOW_CONTACT).toEqual({ mode: 'step', pad: 0.1, dark: 0.9, soft: 1, cap: 1.15, band: [60, 100] })
    expect(applyContactParams(q('armies=20'))).toEqual(SHADOW_CONTACT)
  })
  it('turn off with ?ushcontact=0 (and no ?ushcap): the shadows exactly as decision 0067 left them', () => {
    expect(applyContactParams(q('ushcontact=0'))).toBeNull()
    expect(applyContactParams(q('ushcontact=0,1'))).toBeNull()
    expect(applyContactParams(q('ushcontact=0.1,0'))).toBeNull()
    expect(applyContactParams(q('ushcontact=0&ushcap=1.3'))).toMatchObject({ pad: 0, dark: 0, cap: 1.3 })
  })
  it('parse the contact, its place, its band and the cap, the defaults where not given', () => {
    expect(applyContactParams(q('ushcontact=0.1,1'))).toEqual({ ...SHADOW_CONTACT, dark: 1 })
    expect(applyContactParams(q('ushcontact=0.35,0.8,0.2&ushcontactat=root&ushcap=2&ushcontactband=40,70'))).toEqual({
      mode: 'root',
      pad: 0.35,
      dark: 0.8,
      soft: 0.2,
      cap: 2,
      band: [40, 70],
    })
    expect(() => applyContactParams(q('ushcontact=0.1'))).toThrow(/ushcontact/)
    expect(() => applyContactParams(q('ushcontact=0.1,1&ushcap=0.5'))).toThrow(/ushcap/)
    expect(() => applyContactParams(q('ushcontactat=feet'))).toThrow(/ushcontactat/)
    expect(() => applyContactParams(q('ushcontactband=70,40'))).toThrow(/ushcontactband/)
  })
  it('the contact is whole up close and to the default zoom, gone by the wide one (only where feet show)', () => {
    const b = SHADOW_CONTACT.band
    expect(contactWeight(20, b)).toBe(1)
    expect(contactWeight(63, b)).toBeGreaterThan(0.95)
    expect(contactWeight(80, b)).toBeCloseTo(0.5, 9)
    expect(contactWeight(125, b)).toBe(0)
    expect(contactWeight(250, b)).toBe(0)
  })
  it("the strip's reach only while the oval's material draws (the other reads no cell bounds), none past the band", () => {
    expect(contactUniform(SHADOW_CONTACT, 1, 0.9, true)).toEqual({ uniform: [0.1, 0.9, 1, 1.15], reach: 0.9 })
    expect(contactUniform(SHADOW_CONTACT, 0.5, 0.9, true).uniform[1]).toBeCloseTo(0.45, 12)
    expect(contactUniform(SHADOW_CONTACT, 0, 0.9, true)).toEqual({ uniform: [0.1, 0, 1, 1.15], reach: 0 })
    expect(contactUniform(SHADOW_CONTACT, 1, 0.9, false).reach).toBe(0)
    expect(contactUniform({ ...SHADOW_CONTACT, dark: 0 }, 1, 0.9, true).reach).toBe(0)
  })
  it('draws the oval only within its band and with a darkness (else the material without it)', () => {
    expect(contactOvalOn(SHADOW_CONTACT, 1)).toBe(true)
    expect(contactOvalOn(SHADOW_CONTACT, 0.01)).toBe(true)
    expect(contactOvalOn(SHADOW_CONTACT, 0)).toBe(false)
    expect(contactOvalOn({ ...SHADOW_CONTACT, dark: 0 }, 1)).toBe(false)
    expect(contactOvalOn(null, 1)).toBe(false)
  })
  it("the cap's darkening: the shade's luminance to the cap, its hue kept, none with the shadows off", () => {
    const c = capShade(k, 1, 1.15)
    expect(luma(c)).toBeCloseTo(luma(k) ** 1.15, 12)
    expect(c[0] / c[2]).toBeCloseTo(k[0] / k[2], 12)
    expect(capShade(k, 0, 1.15)).toEqual([1, 1, 1])
    expect(capShade([1, 1, 1], 1, 1.15)).toEqual([1, 1, 1])
    capShade(k, 0.5, 1.15).forEach((v, i) => expect(v).toBeCloseTo(1 + (c[i] - 1) * 0.5, 12))
  })
  it("the material with the oval: the look's own, the gain eased toward the cap's exponent across the band", () => {
    const fu: [number, number, number, number] = [1.05, 0.55, 0.4, 2.5]
    expect(heldLook(fu, 2, SHADOW_CONTACT, 1, true)).toEqual({ foot: fu, gain: 2 })
    expect(heldLook(fu, 1.5, SHADOW_CONTACT, 0.5, true).gain).toBeCloseTo(1.325, 12)
    // the cap alone (no oval) and no contact: the look's own, either material
    expect(heldLook(fu, 1.5, { ...SHADOW_CONTACT, dark: 0 }, 0, false)).toEqual({ foot: fu, gain: 1.5 })
    expect(heldLook(fu, 1.5, null, 0, false)).toEqual({ foot: fu, gain: 1.5 })
  })
  it('the material without the oval keeps the cap at any weight and any switch (foot up to 1.5)', () => {
    for (const w of [0, 0.5, 1]) {
      for (const fu of [
        [1, 1, 0, 3],
        [1.05, 0.55, 0.4, 2.5],
        [1.5, 0.6, 0.6, 3],
      ] as [number, number, number, number][]) {
        const h = heldLook(fu, 2, SHADOW_CONTACT, w, false)
        expect(h.gain).toBe(1.15)
        expect(Math.max(h.foot[0], h.foot[1])).toBeLessThanOrEqual(1)
        expect(h.foot[0] / h.foot[1]).toBeCloseTo(fu[0] / fu[1], 12) // (the coverage, their ratio, unchanged)
        // the darkest pixel it can draw, fully covered at its darkest, no darker than the cap
        const dm = Math.max(h.foot[0], h.foot[1])
        expect(luma(shadowShade(k, dm, h.gain))).toBeGreaterThanOrEqual(luma(k) ** 1.15 - 1e-12)
      }
    }
    // (without the hold a foot of 1.5 at gain 1.15 would go past it)
    expect(luma(shadowShade(k, 1.5, 1.15))).toBeLessThan(luma(k) ** 1.15)
  })
  it("past the band the uncapped shader at that gain is no darker than the cap, and the capped one's pixel", () => {
    const far = { s: 1, g: 1, foot: 1, dark: 1, cap: 1.15 }
    for (const gain of [1, 1.1, 1.15]) {
      for (const s of [0.2, 0.7, 1]) {
        const fr = decalFragment(s, 1, 1, 1)
        const uncapped = luma(decalPixel(k, fr.dark, gain, fr.cover, false))
        expect(uncapped).toBeGreaterThanOrEqual(luma(k) ** 1.15 - 1e-12)
        expect(pixel(cappedCover(k, 1, { ...far, s, gain }, 0))).toBeCloseTo(uncapped, 12)
      }
    }
  })
  it('the contact is solid over its oval and fades to nothing past it', () => {
    expect(contactShare([0.5, 0.5], 1, 0.35)).toBe(1)
    expect(contactShare([0, 1], 0.8, 0.35)).toBe(0.8)
    expect(contactShare([0, 1.35], 1, 0.35)).toBe(0)
    expect(contactShare([0, 1.1], 1, 0.35)).toBeGreaterThan(contactShare([0, 1.2], 1, 0.35))
  })
  // a pixel's luminance with one shadow: the covered samples take the shade, the rest none
  const pixel = (c: { cover: number; shade: number[] }) => 1 - c.cover * (1 - luma(c.shade))
  const looks = [
    { s: 1, g: 0, foot: 1.05, dark: 0.55, gain: 2, cap: 1.15 },
    { s: 0.6, g: 0.7, foot: 1.05, dark: 0.55, gain: 2, cap: 1.15 },
    { s: 1, g: 1, foot: 1, dark: 1, gain: 3, cap: 1.15 },
    { s: 0.3, g: 0.2, foot: 1.5, dark: 0.5, gain: 1, cap: 1.5 },
  ]
  it('never goes darker than the cap, at any gain, with or without the contact', () => {
    for (const l of looks) {
      for (const contact of [0, 0.5, 1]) {
        const c = cappedCover(k, 1, l, contact)
        expect(pixel(c)).toBeGreaterThanOrEqual(luma(k) ** l.cap - 1e-12)
      }
    }
  })
  it('gives the sun shadow the darkening it had wherever that was lighter than the cap', () => {
    const l = { s: 0.4, g: 0.8, foot: 1.05, dark: 0.55, gain: 1.25, cap: 1.15 }
    const fr = decalFragment(l.s, l.g, l.foot, l.dark)
    const was = 1 - fr.cover * (1 - luma(shadowShade(k, fr.dark, l.gain)))
    expect(was).toBeGreaterThan(luma(k) ** l.cap)
    expect(pixel(cappedCover(k, 1, l, 0))).toBeCloseTo(was, 12)
  })
  it("the contact at full darkness is the cap, the hue the ground shade's", () => {
    const c = cappedCover(k, 1, { s: 0, g: 0, foot: 1.05, dark: 0.55, gain: 2, cap: 1.15 }, 1)
    expect(c.cover).toBe(1)
    expect(luma(c.shade)).toBeCloseTo(luma(k) ** 1.15, 12)
    expect(c.shade[0] / c.shade[2]).toBeCloseTo(k[0] / k[2], 12)
  })
  it('darkens nothing with the shadows off or where the ground is already in full shadow', () => {
    expect(cappedCover(k, 0, looks[0], 1).cover).toBe(0)
    expect(cappedCover([1, 1, 1], 1, looks[0], 1).cover).toBe(0)
  })
  it('keeps the overlap rule: one shade for every shadow at a pixel, the darkest share wins whatever the order', () => {
    const thresholds = [0.125, 0.375, 0.625, 0.875]
    const resolve = (fr: { cover: number; shade: number[] }[]) =>
      thresholds.map(t => (fr.find(f => f.cover > t) ? luma(fr[0].shade) : 1)).reduce((a, b) => a + b, 0) / 4
    const a = cappedCover(k, 1, looks[1], 0)
    const b = cappedCover(k, 1, looks[0], 0.6)
    expect(a.shade).toEqual(b.shade)
    expect(resolve([a, b])).toBe(resolve([b, a]))
    expect(resolve([a, b])).toBe(Math.min(resolve([a]), resolve([b])))
  })
  it("the strip holds the contact's reach, past the shape's cell where it must, and is as before without it", () => {
    const base = { across: [-1, 1], along: [-0.3, 5] } as const
    const full = { across: [-1.4, 1.4], along: [-0.9, 5.4] } as const
    expect(decalStrip(base, full, 1, 1, 1.5, 0)).toEqual(decalStrip(base, full, 1, 1, 1.5))
    expect(decalStrip(base, full, 1, 1, 1.5, 0.7).box.map(v => +v.toFixed(9))).toEqual([-1, -0.7, 2, 5.7])
    expect(decalStrip(base, full, 1, 1, 1.5, 2).box.map(v => +v.toFixed(9))).toEqual([-2, -2, 4, 7])
    expect(decalStrip(base, full, 0, 1, 1.5, 2).box.map(v => +v.toFixed(9))).toEqual([-2, -2, 4, 7.4])
  })
})

describe("the contact's ovals over the figure's feet (contactOvals)", () => {
  it('an oval holds every point it is made from, centred on their box', () => {
    const pts: [number, number][] = [
      [0.1, -0.5],
      [-0.15, 0.3],
      [0.17, 0.34],
      [-0.1, -0.2],
    ]
    const [cx, cz, ax, az] = enclosingOval(pts)
    expect([cx, cz].map(v => +v.toFixed(9))).toEqual([0.01, -0.08])
    for (const [x, z] of pts) expect(Math.hypot((x - cx) / ax, (z - cz) / az)).toBeLessThanOrEqual(1 + 1e-9)
    expect(enclosingOval([])).toEqual([0, 0, 0, 0])
  })
  const d = decodeUnits(
    new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer,
  )
  const lod = d.lods[d.lods.length - 1].name
  const pv = posedVertices(d, lod)
  const nv = pv.width / 2
  // each step's feet: the vertices within 0.12 m of its clip's lowest
  const feetOf = (s: number, floor: number) =>
    Array.from({ length: nv }, (_, v) => pv.data.slice((s * nv * 2 + v * 2) * 4, (s * nv * 2 + v * 2) * 4 + 3)).filter(
      p => p[1] <= floor + 0.12,
    )
  it('keep the feet on the contact at every step of every clip, following them (step) or over the stride', () => {
    const step = contactOvals(d, pv, 'step')
    const stride = contactOvals(d, pv, 'stride')
    for (const r of Object.values(d.ranges)) {
      let floor = Infinity
      for (let s = r.start; s < r.end; s++) for (const p of feetOf(s, Infinity)) floor = Math.min(floor, p[1])
      for (let s = r.start; s < r.end; s++) {
        expect([...stride.slice(s * 4, s * 4 + 4)]).toEqual([...stride.slice(r.start * 4, r.start * 4 + 4)])
        for (const ov of [step, stride]) {
          for (const p of feetOf(s, floor)) {
            const q = Math.hypot((p[0] - ov[s * 4]) / ov[s * 4 + 2], (p[2] - ov[s * 4 + 1]) / ov[s * 4 + 3])
            expect(q).toBeLessThanOrEqual(1 + 1e-5)
          }
        }
      }
    }
    expect(contactOvals(d, pv, 'root').every(v => v === 0)).toBe(true)
  })
  it('the strip holds the whole oval, its fade too: no contact at any strip edge (every step, 64 facings)', () => {
    const l = Math.hypot(-0.7, 0.45, 0.55)
    const sun = [-0.7 / l, 0.45 / l, 0.55 / l] as const
    const shape = shadowShape(d, lod, sun, ['halt', 'march', 'run', 'fire'], { facings: 16, soft: 0.12, posed: pv })
    const full = { across: shape.across, along: shape.along }
    const c = SHADOW_CONTACT
    for (const mode of ['step', 'stride'] as const) {
      const ov = contactOvals(d, pv, mode)
      const reach = contactReachOf(ov, c.pad, c.soft)
      for (const [t, len] of [
        [0, 0.7],
        [0.6, 0.85],
        [1, 1],
      ]) {
        const [a0, l0, as, ls] = decalStrip(shape.base, full, t, len, 1.5, reach).box
        const edge: [number, number][] = []
        for (let i = 0; i <= 24; i++) {
          const u = i / 24
          edge.push([a0 + u * as, l0], [a0 + u * as, l0 + ls], [a0, l0 + u * ls], [a0 + as, l0 + u * ls])
        }
        let worst = 0
        for (let st = 0; st < ov.length / 4; st++) {
          const o = [...ov.slice(st * 4, st * 4 + 4)]
          for (let f = 0; f < 64; f++) {
            for (const [x, y] of edge) {
              const q = contactPoint(x, y > 0 ? y * len : y, (2 * Math.PI * f) / 64, shape.dir, o, c.pad)
              worst = Math.max(worst, contactShare(q, 1, c.soft))
            }
          }
        }
        expect(worst, `${mode} t ${t}`).toBe(0)
      }
    }
  })
  it("keeps the nearer LODs' feet on the solid part too (the ovals are the far LOD's)", () => {
    const step = contactOvals(d, pv, 'step')
    for (const near of d.lods.slice(0, -1)) {
      const npv = posedVertices(d, near.name)
      const nn = npv.width / 2
      const at = (s: number, v: number) => (s * nn * 2 + v * 2) * 4
      for (const r of Object.values(d.ranges)) {
        let floor = Infinity
        for (let s = r.start; s < r.end; s++) {
          for (let v = 0; v < nn; v++) floor = Math.min(floor, npv.data[at(s, v) + 1])
        }
        let worst = 0
        for (let s = r.start; s < r.end; s++) {
          for (let v = 0; v < nn; v++) {
            const o = at(s, v)
            if (npv.data[o + 1] > floor + 0.12) continue
            const qx = (npv.data[o] - step[s * 4]) / (step[s * 4 + 2] + SHADOW_CONTACT.pad)
            const qz = (npv.data[o + 2] - step[s * 4 + 1]) / (step[s * 4 + 3] + SHADOW_CONTACT.pad)
            worst = Math.max(worst, Math.hypot(qx, qz))
          }
        }
        expect(worst, `${near.name}`).toBeLessThanOrEqual(1)
      }
    }
  })
  it("its frame is the shader's: a man faced 0 has his own x across and z along the sun's frame's turn", () => {
    // (facing 0, the shadow along +z: across is -x; a point 1 m along the shadow is 1 m along his z)
    expect(contactPoint(0, 1, 0, [0, 1], [0, 0, 1, 1], 0).map(v => +v.toFixed(12))).toEqual([0, 1])
    expect(contactPoint(1, 0, 0, [0, 1], [0, 0, 1, 1], 0).map(v => +v.toFixed(12))).toEqual([-1, 0])
    // (turned a quarter: his z now along world x)
    expect(contactPoint(0, 1, Math.PI / 2, [1, 0], [0, 0, 1, 1], 0).map(v => +v.toFixed(12))).toEqual([0, 1])
  })
})

describe('the contact and cap shaders match their mirrors (the source)', () => {
  const src = (f: string) =>
    readFileSync(new URL(`../src/look/shaders/${f}`, import.meta.url), 'utf8').replace(/\s+/g, '')
  const L = `vec3(${SHADE_LUMA.join(',')})`
  it("unitdecal.frag: the cap's room and the gained darkness from one dot, the contact, the share (cappedCover)", () => {
    const f = src('unitdecal.frag')
    expect(f).toContain(`lk=dot(K.rgb,${L});`)
    expect(f).toContain('floatlg=pow(max(1.0-(1.0-lk)*fz*dm,1.0e-3),uShGain),room=fz*(1.0-lk*K.a);')
    expect(f).toContain('vec3d=mix(vec3(1.0),K.rgb*K.a,fz);')
    expect(f).toContain('a=room<1.0e-3?0.0:min(1.0,max(a*(1.0-lg)/room,ct));')
    expect(f).toContain('floatct=uShContact.y*(1.0-smoothstep(1.0,1.0+uShContact.z,length(vCt)));')
    expect(f).toContain('s*=step(0.0,vCell.x)*step(vCell.x,1.0)*step(0.0,vCell.y)*step(vCell.y,1.0);')
  })
  it("unitshade.frag: the cap's factor in the alpha, L(k)^(cap - 1) (capShade)", () => {
    expect(src('unitshade.frag')).toContain(`gl_FragColor=vec4(k,pow(max(dot(k,${L}),1.0e-3),SH_CAP_E-1.0));`)
  })
  it("unitdecal.vert: his step as units.vert counts it, the oval's frame (contactPoint), his cell", () => {
    const v = src('unitdecal.vert')
    expect(src('units.vert')).toContain('intf=int(r.x+mod(uVATStep+r.z,r.y));')
    expect(v).toContain('floatst=aVAT.x+mod(uVATStep+aVAT.z,aVAT.y);')
    expect(v).toContain('vec2P=C*l0.x+uShDir*vAlong;')
    expect(v).toContain(
      'vCt=(vec2(dot(P,normalize(finalWorld[0].xz)),dot(P,normalize(finalWorld[2].xz)))-ov.xy)/max(ov.zw+uShContact.x,1.0e-3);',
    )
    expect(v).toContain('vCell=c/uShapeCell.xy;')
  })
})
