// The player's grass detail (src/look/grass-detail.ts, issue #257, decision 0092): ?grassdetail's parsing and the
// address, the share of the near ring's grass Balanced drops by distance and zoom, the clumps shrinking away instead
// of popping, and the shader's drop (meadow.vert, GRASS_THIN): the same rule, on the grass branch only, absent from
// Full's program.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BALANCED_DROP,
  dropAtZoom,
  dropShare,
  GRASS_DETAIL_DEFAULT,
  grassDetailOf,
  isGrassDetail,
  THIN_RAMP,
  THIN_SOFT,
  thinKeep,
  thinOn,
  withGrassDetail,
} from '../src/look/grass-detail.ts'
import { CLOSE_ZOOM, RINGS } from '../src/look/meadow-spec.ts'

const q = (s: string) => new URLSearchParams(s)
const VERT = readFileSync(new URL('../src/look/shaders/meadow.vert', import.meta.url), 'utf8')
// the shader as Full compiles it: every #ifdef GRASS_THIN block gone (none of them has an #else)
const fullOf = (src: string) => src.replace(/[ \t]*#ifdef GRASS_THIN\n[\s\S]*?#endif\n/g, '')
// the code of a shader's GRASS_THIN blocks, their comments left out
const thinCode = (src: string) =>
  [...src.matchAll(/#ifdef GRASS_THIN\n([\s\S]*?)#endif/g)].map(m => m[1].replace(/\/\/.*$/gm, '')).join('\n')
// a clump's size at a distance and zoom with the drop's hash hd: what meadow.vert grows it to, times this
const sizeAt = (hd: number, d: number, radius: number) => thinKeep(hd, dropShare(d, radius))

describe('the grass detail', () => {
  it('is Full when absent, and takes full or balanced', () => {
    expect(GRASS_DETAIL_DEFAULT).toBe('full')
    expect(grassDetailOf(q(''), true)).toBe('full')
    expect(grassDetailOf(q('grassdetail=full'), true)).toBe('full')
    expect(grassDetailOf(q('grassdetail=balanced'), true)).toBe('balanced')
    expect(isGrassDetail('balanced')).toBe(true)
    expect(isGrassDetail('Balanced')).toBe(false)
  })
  it('refuses anything else, an empty value included', () => {
    for (const v of ['', 'Full', 'low', 'thin', '1']) {
      expect(() => grassDetailOf(q(`grassdetail=${v}`), true)).toThrow(/grassdetail must be full or balanced/)
    }
  })
  it('reads Balanced as Full without the meadow, so a saved address still opens', () => {
    expect(grassDetailOf(q('grassdetail=balanced'), false)).toBe('full')
    expect(grassDetailOf(q(''), false)).toBe('full')
    expect(() => grassDetailOf(q('grassdetail=x'), false)).toThrow(/grassdetail must be/)
  })
  it('writes the level in force to the address: Balanced named, Full none, the rest kept', () => {
    expect(withGrassDetail(q('map=a&grassdetail=balanced'), 'full').toString()).toBe('map=a')
    expect(withGrassDetail(q('map=a'), 'balanced').toString()).toBe('map=a&grassdetail=balanced')
    expect(withGrassDetail(q('grassdetail=full&x=1'), 'full').toString()).toBe('x=1')
  })
  it('drops BALANCED_DROP between its ramps up close, none inside 8 m nor from the near ring edge out', () => {
    // (the ramp out: the near ring's own band out, where the middle ring fades in at full density)
    expect(THIN_RAMP.slice(2)).toEqual(RINGS[0].band.slice(2))
    for (const radius of [15, 45, CLOSE_ZOOM[0]]) {
      for (let d = 0; d <= THIN_RAMP[0]; d += 0.5) expect(dropShare(d, radius)).toBe(0)
      for (let d = THIN_RAMP[1]; d <= THIN_RAMP[2]; d += 0.5) expect(dropShare(d, radius)).toBe(BALANCED_DROP)
      for (let d = THIN_RAMP[3]; d <= 110; d += 0.5) expect(dropShare(d, radius)).toBe(0)
    }
  })
  it('falls to none across CLOSE_ZOOM, so from its end out (the default zoom too) Balanced is Full', () => {
    expect(dropAtZoom(CLOSE_ZOOM[0])).toBe(BALANCED_DROP)
    for (const radius of [CLOSE_ZOOM[1], 125, 260]) {
      expect(dropAtZoom(radius)).toBe(0)
      // (Full's own program there: no GRASS_THIN)
      expect(thinOn('balanced', radius)).toBe(false)
      for (let d = 0; d <= 110; d += 0.5) expect(dropShare(d, radius)).toBe(0)
    }
    expect(thinOn('balanced', 45)).toBe(true)
    expect(thinOn('full', 45)).toBe(false)
  })
  it('shrinks each clump away and back as the camera pans or zooms, never a pop', () => {
    // (the regression: a clump was culled whole the moment its hash fell under the share)
    for (let hd = 0.005; hd < 1; hd += 0.01) {
      for (const radius of [15, 45, 80, 100]) {
        for (let d = 0; d <= 30; d += 0.05) {
          expect(Math.abs(sizeAt(hd, d + 0.05, radius) - sizeAt(hd, d, radius))).toBeLessThan(0.08)
        }
      }
      for (const d of [10, 15, 21]) {
        for (let r = 60; r <= 120; r += 0.1) {
          expect(Math.abs(sizeAt(hd, d, r + 0.1) - sizeAt(hd, d, r))).toBeLessThan(0.05)
        }
      }
    }
    // whole above the share, nothing THIN_SOFT under it, whole at a share of none
    expect(thinKeep(0.6, 0.5)).toBe(1)
    expect(thinKeep(0.5 - THIN_SOFT, 0.5)).toBe(0)
    expect(thinKeep(0.01, 0)).toBe(1)
  })
  it("leaves the crops untouched: the shader's drop is on the grass branch, after the crop decision", () => {
    const body = VERT.slice(VERT.indexOf('void main()'))
    expect(body.indexOf('#ifdef GRASS_THIN')).toBeGreaterThan(body.indexOf('bool crop=m.a>m.g;'))
    const code = thinCode(body)
    // the thinning only under !crop (thinK stays 1 for a crop), by a hash of its own, not h2
    expect(code).toMatch(/float thinK=1\.0;\s*if\(!crop\)\{/)
    expect(code).not.toMatch(/\bh2\b/)
  })
  it('reads the same rule as dropShare and thinKeep, its numbers the uniforms', () => {
    const code = thinCode(VERT)
    expect(code).toMatch(
      /sh=uThin\.x\*smoothstep\(uThinRamp\.x,uThinRamp\.y,d\)\*\(1\.0-smoothstep\(uThinRamp\.z,uThinRamp\.w,d\)\)/,
    )
    expect(code).toMatch(/lo=sh-uThin\.y/)
    expect(code).toMatch(/if\(hd<lo\)\{gl_Position=/)
    expect(code).toMatch(/thinK=smoothstep\(lo,sh,hd\)/)
    expect(code).toMatch(/grow\*=thinK/)
  })
  it("keeps Full's program as main's: GRASS_THIN only in its own blocks, nothing of it outside", () => {
    expect(fullOf(VERT)).not.toMatch(/uThin|thinK|GRASS_THIN/)
    expect((VERT.match(/#ifdef GRASS_THIN/g) ?? []).length).toBe(3)
  })
})
