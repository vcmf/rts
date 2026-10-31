// The player's grass detail (src/look/grass-detail.ts, issue #257, decision 0092): ?grassdetail's parsing, the share
// of the near ring's grass clumps Balanced drops by distance and zoom, and the shader's drop (meadow.vert, GRASS_THIN):
// on the grass branch only, absent from Full's program.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BALANCED_CUT,
  BALANCED_DROP,
  dropAtZoom,
  dropShare,
  GRASS_DETAIL_DEFAULT,
  grassDetailOf,
  isGrassDetail,
} from '../src/look/grass-detail.ts'
import { CLOSE_ZOOM } from '../src/look/meadow-spec.ts'

const q = (s: string) => new URLSearchParams(s)
const VERT = readFileSync(new URL('../src/look/shaders/meadow.vert', import.meta.url), 'utf8')
// the shader as Full compiles it: every #ifdef GRASS_THIN block gone (none of them has an #else)
const fullOf = (src: string) => src.replace(/[ \t]*#ifdef GRASS_THIN\n[\s\S]*?#endif\n/g, '')

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
  it('drops nothing inside the cut and BALANCED_DROP beyond it up close, ramping across it', () => {
    for (const radius of [15, 45, CLOSE_ZOOM[0]]) {
      for (let d = 0; d <= BALANCED_CUT[0]; d += 0.5) expect(dropShare(d, radius)).toBe(0)
      for (let d = BALANCED_CUT[1]; d <= 30; d += 0.5) expect(dropShare(d, radius)).toBe(BALANCED_DROP)
      let last = 0
      for (let d = BALANCED_CUT[0]; d <= BALANCED_CUT[1]; d += 0.1) {
        const s = dropShare(d, radius)
        expect(s).toBeGreaterThanOrEqual(last)
        expect(s - last).toBeLessThan(0.03)
        last = s
      }
    }
  })
  it('falls to none across CLOSE_ZOOM continuously, so from its end out (the default zoom too) Balanced is Full', () => {
    expect(dropAtZoom(CLOSE_ZOOM[0])).toBe(BALANCED_DROP)
    for (const radius of [CLOSE_ZOOM[1], 125, 260]) {
      expect(dropAtZoom(radius)).toBe(0)
      for (let d = 0; d <= 110; d += 0.5) expect(dropShare(d, radius)).toBe(0)
    }
    for (let r = CLOSE_ZOOM[0] - 5; r <= CLOSE_ZOOM[1] + 5; r += 0.25) {
      expect(dropAtZoom(r + 0.25)).toBeLessThanOrEqual(dropAtZoom(r))
      expect(dropAtZoom(r) - dropAtZoom(r + 0.25)).toBeLessThan(0.01)
    }
  })
  it("leaves the crops untouched: the shader's drop is on the grass branch, after the crop decision", () => {
    const at = VERT.indexOf('#ifdef GRASS_THIN', VERT.indexOf('void main()'))
    expect(at).toBeGreaterThan(VERT.indexOf('bool crop=m.a>m.g;'))
    // (its code, the comments left out)
    const block = VERT.slice(at, VERT.indexOf('#endif', at)).replace(/\/\/.*$/gm, '')
    // its one test: a grass clump (!crop) under the share of this zoom (uThin) ramped across THIN_CUT, by its own hash
    expect(block).toMatch(/if\(!crop&&mHash\([^)]*\)<uThin\*smoothstep\(THIN_CUT\.x,THIN_CUT\.y,d\)\)\{gl_Position=/)
    expect(block).not.toMatch(/\bh2\b/)
  })
  it("keeps Full's program as main's: GRASS_THIN only in its own blocks, nothing of it outside", () => {
    const full = fullOf(VERT)
    expect(full).not.toMatch(/uThin|THIN_CUT|GRASS_THIN/)
    expect((VERT.match(/#ifdef GRASS_THIN/g) ?? []).length).toBe(2)
  })
})
