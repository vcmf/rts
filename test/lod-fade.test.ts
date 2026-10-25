// The figures' LOD cross-fade (#188, decision 0066, src/look/lod-fade.ts): a man's share of each LOD by his height on
// screen, every pixel of him drawn by exactly one LOD, and the LODs a battalion draws covering every man's.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FADE_WIDTH,
  FAR_FROM,
  NEAR_FADE,
  TINY_FADE,
  battalionLods,
  boxPxRange,
  dropsMan,
  drawsPixel,
  fadeShare,
  lodAt,
  lodCount,
  lodCover,
  lodsDrawn,
  manHash,
  snapCover,
  type BattalionAt,
} from '../src/look/lod-fade.ts'

const shader = (f: string) => readFileSync(new URL(`../src/look/shaders/${f}`, import.meta.url), 'utf8')

const LOD_PX = 48
const TINY_PX = 12
const near: [number, number] = [LOD_PX * NEAR_FADE[0], LOD_PX * NEAR_FADE[1]]
const tiny: [number, number] = [TINY_PX * TINY_FADE[0], TINY_PX * TINY_FADE[1]]
// px from 4 to 120, 1 % apart
const PXS = Array.from({ length: 330 }, (_, i) => 4 * 1.0104 ** i)
const HASHES = Array.from({ length: 64 }, (_, i) => manHash(i))
// the dither's 16 thresholds (units.frag)
const QS = Array.from({ length: 16 }, (_, i) => (i + 0.5) / 16)

describe('manHash', () => {
  it('is in [0, 1), the same for a man every time, and spread over the band', () => {
    const hs = Array.from({ length: 4096 }, (_, i) => manHash(i))
    expect(hs.every(h => h >= 0 && h < 1)).toBe(true)
    expect(manHash(17)).toBe(manHash(17))
    const bins = new Array(8).fill(0)
    for (const h of hs) bins[Math.floor(h * 8)]++
    for (const b of bins) expect(Math.abs(b - 512)).toBeLessThan(80)
  })
  it('gives neighbours in the ranks unlike hashes (no two neighbours switch together)', () => {
    let alike = 0
    for (let i = 0; i < 1000; i++) if (Math.abs(manHash(i) - manHash(i + 1)) < 0.02) alike++
    expect(alike).toBeLessThan(60)
  })
})

describe('fadeShare', () => {
  it('is 0 below the band and 1 above it, whatever the hash', () => {
    for (const h of [0, 0.3, 0.999]) {
      expect(fadeShare(near[0] * 0.99, near, h)).toBe(0)
      expect(fadeShare(near[1] * 1.01, near, h)).toBe(1)
    }
  })
  it('grows with the height on screen', () => {
    for (const h of HASHES.slice(0, 8)) {
      for (let i = 1; i < PXS.length; i++) {
        expect(fadeShare(PXS[i], near, h)).toBeGreaterThanOrEqual(fadeShare(PXS[i - 1], near, h))
      }
    }
  })
  it('turns a man over his own share of the band, from a point set by his hash', () => {
    const span = Math.log(near[1] / near[0])
    for (const h of [0, 0.5, 0.99]) {
      const start = near[0] * Math.exp(h * (1 - FADE_WIDTH) * span)
      const end = start * Math.exp(FADE_WIDTH * span)
      expect(fadeShare(start * 0.999, near, h)).toBe(0)
      expect(fadeShare(start * 1.001, near, h)).toBeGreaterThan(0)
      expect(fadeShare(end * 0.999, near, h)).toBeLessThan(1)
      expect(fadeShare(end * 1.001, near, h)).toBe(1)
    }
  })
  it('is 1 with no band (no tiny LOD)', () => {
    expect(fadeShare(3, [0, 0], 0.5)).toBe(1)
  })
})

describe('lodCover and lodAt', () => {
  it("draws every pixel of every man by exactly one LOD's material at every height (no man hidden, none twice)", () => {
    for (const px of PXS) {
      for (const h of HASHES) {
        const c = lodCover(px, near, tiny, h)
        for (const q of QS) {
          const by = ([0, 1, 2] as const).filter(slot => drawsPixel(slot, q, c))
          expect(by.length).toBe(1)
          expect(['near', 'far', 'tiny'][by[0]]).toBe(lodAt(q, c))
        }
      }
    }
  })
  it('snaps the cover without changing a pixel, every threshold 1/32 or more from it (interpolation cannot flip one)', () => {
    for (const px of PXS) {
      for (const h of HASHES) {
        const c = lodCover(px, near, tiny, h)
        const s = snapCover(c)
        for (const q of QS) {
          for (const slot of [0, 1, 2] as const) expect(drawsPixel(slot, q, s)).toBe(drawsPixel(slot, q, c))
          expect(Math.min(Math.abs(q - s.near), Math.abs(q - s.far))).toBeGreaterThanOrEqual(1 / 32 - 1e-12)
        }
        // and a man dropped by a LOD has no pixel of it after the snap either
        for (const slot of [0, 1, 2] as const)
          {if (dropsMan(slot, c)) expect(QS.some(q => drawsPixel(slot, q, s))).toBe(false)}
      }
    }
  })
  it('drops a man from a LOD only when that LOD draws no pixel of him, and keeps him where it draws one', () => {
    for (const px of PXS) {
      for (const h of HASHES) {
        const c = lodCover(px, near, tiny, h)
        for (const slot of [0, 1, 2] as const) {
          // (any threshold in [0, 1), not only the dither's 16)
          const draws = Array.from({ length: 257 }, (_, i) => i / 257).some(q => drawsPixel(slot, q, c))
          if (dropsMan(slot, c)) expect(draws).toBe(false)
          if (QS.some(q => drawsPixel(slot, q, c))) expect(dropsMan(slot, c)).toBe(false)
        }
      }
    }
  })
  it('keeps the hard switch outside the bands: near above, far between, tiny below', () => {
    for (const h of HASHES) {
      expect(QS.every(q => lodAt(q, lodCover(near[1] * 1.01, near, tiny, h)) === 'near')).toBe(true)
      expect(QS.every(q => lodAt(q, lodCover(24, near, tiny, h)) === 'far')).toBe(true)
      expect(QS.every(q => lodAt(q, lodCover(tiny[0] * 0.99, near, tiny, h)) === 'tiny')).toBe(true)
    }
  })
  it('never draws the tiny LOD without one', () => {
    for (const px of PXS) for (const q of QS) expect(lodAt(q, lodCover(px, near, null, manHash(3)))).not.toBe('tiny')
  })
  it("spreads a battalion's switch over the band: half its men past it at the band's middle", () => {
    const mid = Math.sqrt(near[0] * near[1])
    const shares = HASHES.map(h => fadeShare(mid, near, h))
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length
    expect(mean).toBeGreaterThan(0.35)
    expect(mean).toBeLessThan(0.65)
    // and the men mid-fade are a few, not all
    expect(shares.filter(s => s > 0 && s < 1).length).toBeLessThan(HASHES.length * 0.6)
  })
})

describe('lodsDrawn', () => {
  it("draws every LOD any man between its nearest and farthest has a pixel at (a battalion's men all drawn)", () => {
    for (let a = 0; a < PXS.length; a += 23) {
      for (let b = a; b < PXS.length; b += 29) {
        const d = lodsDrawn(PXS[a], PXS[b], near, tiny)
        for (let i = a; i <= b; i += 3) {
          for (const h of HASHES.slice(0, 8)) {
            for (const q of QS) expect(d[lodAt(q, lodCover(PXS[i], near, tiny, h))]).toBe(true)
          }
        }
      }
    }
  })
  it('draws one LOD for a battalion wholly outside the bands, as the hard switch did', () => {
    expect(lodsDrawn(70, 90, near, tiny)).toEqual({ near: true, far: false, tiny: false })
    expect(lodsDrawn(20, 30, near, tiny)).toEqual({ near: false, far: true, tiny: false })
    expect(lodsDrawn(5, 8, near, tiny)).toEqual({ near: false, far: false, tiny: true })
    expect(lodsDrawn(5, 8, near, null)).toEqual({ near: false, far: true, tiny: false })
  })
})

describe('boxPxRange', () => {
  it('brackets the height on screen of a figure anywhere in the box', () => {
    const lo = { x: -10, y: 0, z: 30 }
    const hi = { x: 15, y: 3, z: 60 }
    const cam = { x: 2, y: 40, z: -5 }
    const k = 900
    const [a, b] = boxPxRange(lo, hi, cam, k)
    for (let i = 0; i < 200; i++) {
      const p = {
        x: lo.x + (hi.x - lo.x) * manHash(i),
        y: lo.y + (hi.y - lo.y) * manHash(i + 500),
        z: lo.z + (hi.z - lo.z) * manHash(i + 900),
      }
      const px = k / Math.max(1, Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z))
      expect(px).toBeGreaterThanOrEqual(a)
      expect(px).toBeLessThanOrEqual(b)
    }
  })
  it('takes a camera inside the box as the nearest, 1 m off', () => {
    expect(boxPxRange({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 }, 100)[1]).toBe(100)
  })
})

describe('battalionLods', () => {
  const at = (o: Partial<BattalionAt>): BattalionAt => ({
    pLo: 30,
    pHi: 30,
    px: 30,
    split: false,
    wasNear: false,
    wasTiny: false,
    ...o,
  })
  it('fades a split battalion too: its men inside the near band drawn at the far LOD as well (#188 review)', () => {
    // a deep column split at its near end (its nearest point 95 px), its far end inside the near band
    const l = battalionLods(at({ pLo: 45, pHi: 95, px: 60, split: true }), true, LOD_PX, TINY_PX, near, tiny)
    expect(l).toEqual({ near: true, far: true, tiny: false })
    expect(lodCount(l)).toBe(2)
  })
  it('draws the near LOD while split even with every man above the band (the nearest LOD takes some)', () => {
    expect(battalionLods(at({ pLo: 80, pHi: 150, split: true }), true, LOD_PX, TINY_PX, near, tiny)).toEqual({
      near: true,
      far: false,
      tiny: false,
    })
  })
  it('draws one LOD outside the bands (lodCount 1: its meshes draw every man, no per-man work)', () => {
    expect(lodCount(battalionLods(at({ pLo: 20, pHi: 30 }), true, LOD_PX, TINY_PX, near, tiny))).toBe(1)
    expect(lodCount(battalionLods(at({ pLo: 70, pHi: 90 }), true, LOD_PX, TINY_PX, near, tiny))).toBe(1)
  })
  it('keeps the hard switch without the fade: one LOD by the centre, ±10 %, the near alone while split', () => {
    const hard = (o: Partial<BattalionAt>) => battalionLods(at(o), false, LOD_PX, TINY_PX, near, tiny)
    expect(hard({ px: 50, wasNear: false })).toEqual({ near: false, far: true, tiny: false })
    expect(hard({ px: 50, wasNear: true })).toEqual({ near: true, far: false, tiny: false })
    expect(hard({ px: 11, wasTiny: false })).toEqual({ near: false, far: true, tiny: false })
    expect(hard({ px: 10, wasTiny: false })).toEqual({ near: false, far: false, tiny: true })
    expect(hard({ px: 30, pLo: 30, pHi: 120, split: true })).toEqual({ near: true, far: false, tiny: false })
    expect(battalionLods(at({ px: 5 }), false, LOD_PX, 0, near, null)).toEqual({ near: false, far: true, tiny: false })
  })
})

describe('the shaders mirror it', () => {
  it("hash a man's index as manHash does, with the fade's width", () => {
    const vert = shader('units.vert')
    const hash = /float manHash\(float m\)\{(.*?)return/s.exec(vert)?.[1] ?? ''
    expect(hash.replace(/\s+/g, '')).toBe(
      'uintx=uint(m+0.5)*0x9e3779b9u;x^=x>>16;x*=0x21f0aaadu;x^=x>>15;x*=0x735a2d97u;x^=x>>15;',
    )
    expect(vert).toMatch(/return float\(x>>8\)\/16777216\.0/)
    expect(vert).toMatch(/\(t-h\*\(1\.0-LOD_FADE_W\)\)\/LOD_FADE_W/)
    expect(vert).toMatch(/manHash\(aMan\)/)
    expect(vert).not.toMatch(/gl_InstanceID/)
    const units = readFileSync(new URL('../src/look/units.ts', import.meta.url), 'utf8')
    expect(units).toContain('`#define LOD_FADE_W ${FADE_WIDTH.toFixed(4)}`')
  })
  it("draw a pixel by drawsPixel's predicates and drop a man by dropsMan's, the cover flat", () => {
    const frag = shader('units.frag').replace(/\s+/g, '')
    expect(frag).toContain(
      '#ifLOD_SLOT==0if(q>=vFade.x)discard;#elifLOD_SLOT==1if(q<vFade.x||q>=vFade.y)discard;#elseif(q<vFade.y)discard;',
    )
    expect(frag).toContain('varyingvec2vFade;')
    const vert = shader('units.vert').replace(/\s+/g, '')
    expect(vert).toContain('boolnone=LOD_SLOT==0?fn<=0.0:LOD_SLOT==1?fn>=1.0||ff<=0.0:ff>=1.0;')
    expect(vert).toContain('vFade=floor(vec2(fn,ff)*16.0+0.5)/16.0;')
  })
  it("start the far palette, lift and growth at the near band's foot, so they are 0 across the band", () => {
    expect(FAR_FROM).toBe(NEAR_FADE[0])
    const vert = shader('units.vert')
    expect(vert).toContain('fk=clamp((FAR_FROM*uFarK.y-fpx)/((FAR_FROM-0.25)*uFarK.y),0.0,1.0)')
    expect(vert).toContain('vFar=1.0-smoothstep(uFarK.y*0.35,uFarK.y*FAR_FROM,px)')
    expect(shader('unitdecal.vert')).toContain('fg=clamp((FAR_FROM*uFarK.y-fpx)/((FAR_FROM-0.25)*uFarK.y),0.0,1.0)')
    const units = readFileSync(new URL('../src/look/units.ts', import.meta.url), 'utf8')
    expect(units).toContain('`#define FAR_FROM ${FAR_FROM.toFixed(4)}`')
  })
  it("rescale the tiny's coat mask over the share it draws in its band", () => {
    expect(shader('units.frag').replace(/\s+/g, '')).toContain('v=step((q-vFade.y)/max(1e-6,1.0-vFade.y),vCoatW);')
  })
})
