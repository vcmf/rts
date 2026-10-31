// The player's grass detail (src/look/grass-detail.ts, issue #257, decision 0095): ?grassdetail's parsing and the
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
  THIN_EASE_S,
  ThinEase,
  thinOn,
  searchWithGrassDetail,
} from '../src/look/grass-detail.ts'
import { type DefineHost, switchDefineWhenReady, warmDefine } from '../src/look/define-switch.ts'
import { CLOSE_ZOOM, RINGS } from '../src/look/meadow-spec.ts'

const q = (s: string) => new URLSearchParams(s)
// Balanced's whole share up close: the hash under which a clump starts to shrink
const WHOLE = BALANCED_DROP + THIN_SOFT
const VERT = readFileSync(new URL('../src/look/shaders/meadow.vert', import.meta.url), 'utf8')
// the shader as Full compiles it: every #ifdef GRASS_THIN block gone (none of them has an #else)
const fullOf = (src: string) => src.replace(/[ \t]*#ifdef GRASS_THIN\n[\s\S]*?#endif\n/g, '')
// the code of a shader's GRASS_THIN blocks, their comments left out
const thinCode = (src: string) =>
  [...src.matchAll(/#ifdef GRASS_THIN\n([\s\S]*?)#endif/g)].map(m => m[1].replace(/\/\/.*$/gm, '')).join('\n')
// a clump's size at a distance and zoom with the drop's hash hd: what meadow.vert grows it to, times this
const sizeAt = (hd: number, d: number, radius: number) => thinKeep(hd, dropShare(d, dropAtZoom(radius)))

describe('the grass detail', () => {
  it('is Balanced when absent (the owner, 2026-10-31), and takes full or balanced', () => {
    expect(GRASS_DETAIL_DEFAULT).toBe('balanced')
    expect(grassDetailOf(q(''), true)).toBe('balanced')
    expect(grassDetailOf(q('map=austerlitz&window=kobelnitz'), true)).toBe('balanced')
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
  it('reads Full without the meadow, Balanced asked or by default, so a saved address still opens', () => {
    expect(grassDetailOf(q('grassdetail=balanced'), false)).toBe('full')
    expect(grassDetailOf(q(''), false)).toBe('full')
    expect(() => grassDetailOf(q('grassdetail=x'), false)).toThrow(/grassdetail must be/)
  })
  it('keeps the address byte for byte unless its grassdetail names another level, then edits only that key', () => {
    // (the regression: every load re-encoded the whole query: ?bench became bench=, lean,big lean%2Cbig)
    for (const a of ['', '?bench&grassoff=lean,big&midtone=u3,b2', '?map=austerlitz&window=kobelnitz&x=%20']) {
      expect(searchWithGrassDetail(a, 'balanced')).toBe(a)
    }
    // (an explicit default kept: it names the level in force)
    expect(searchWithGrassDetail('?grassdetail=balanced&bench', 'balanced')).toBe('?grassdetail=balanced&bench')
    expect(searchWithGrassDetail('?bench&grassdetail=full&a=b,c', 'full')).toBe('?bench&grassdetail=full&a=b,c')
    // the key written only off the default, removed back to it, in its place
    expect(searchWithGrassDetail('?bench&grassdetail=full&a=b,c', 'balanced')).toBe('?bench&a=b,c')
    expect(searchWithGrassDetail('?bench&a=b,c', 'full')).toBe('?bench&a=b,c&grassdetail=full')
    expect(searchWithGrassDetail('?grassdetail=balanced&bench', 'full')).toBe('?grassdetail=full&bench')
    expect(searchWithGrassDetail('?grassdetail=full', 'balanced')).toBe('')
    expect(searchWithGrassDetail('', 'full')).toBe('?grassdetail=full')
  })
  it('culls BALANCED_DROP of the grass clumps between its ramps up close, shrinks THIN_SOFT more, none outside', () => {
    // (the regression: the share was 0.5 with the soft band under it, so only 0.3 of the clumps were culled)
    let culled = 0
    let shrunk = 0
    const N = 10000
    for (let i = 0; i < N; i++) {
      const k = thinKeep((i + 0.5) / N, dropAtZoom(45))
      if (k === 0) culled++
      else if (k < 1) shrunk++
    }
    expect(culled / N).toBeCloseTo(BALANCED_DROP, 3)
    expect(shrunk / N).toBeCloseTo(THIN_SOFT, 3)
    // (the ramp out: the near ring's own band out, where the middle ring fades in at full density)
    expect(THIN_RAMP.slice(2)).toEqual(RINGS[0].band.slice(2))
    for (let d = 0; d <= THIN_RAMP[0]; d += 0.5) expect(dropShare(d, WHOLE)).toBe(0)
    for (let d = THIN_RAMP[1]; d <= THIN_RAMP[2]; d += 0.5) expect(dropShare(d, WHOLE)).toBe(WHOLE)
    for (let d = THIN_RAMP[3]; d <= 110; d += 0.5) expect(dropShare(d, WHOLE)).toBe(0)
  })
  it('falls to none across CLOSE_ZOOM, so from its end out (the default zoom too) Balanced is Full', () => {
    expect(dropAtZoom(CLOSE_ZOOM[0])).toBe(WHOLE)
    for (const radius of [CLOSE_ZOOM[1], 125, 260]) {
      expect(dropAtZoom(radius)).toBe(0)
      // (Full's own program there: no GRASS_THIN)
      expect(thinOn('balanced', radius)).toBe(false)
    }
    expect(thinOn('balanced', 45)).toBe(true)
    expect(thinOn('full', 45)).toBe(false)
  })
  it('shrinks each clump away and back as the camera pans or zooms, never a pop', () => {
    // (the regression: a clump was culled whole the moment its hash fell under the share)
    for (let hd = 0.005; hd < 1; hd += 0.01) {
      for (const radius of [15, 45, 80, 100]) {
        for (let d = 0; d <= 30; d += 0.05) {
          expect(Math.abs(sizeAt(hd, d + 0.05, radius) - sizeAt(hd, d, radius))).toBeLessThan(0.1)
        }
      }
      for (const d of [10, 15, 21]) {
        for (let r = 60; r <= 120; r += 0.1) {
          expect(Math.abs(sizeAt(hd, d, r + 0.1) - sizeAt(hd, d, r))).toBeLessThan(0.05)
        }
      }
    }
    // whole above the share, nothing THIN_SOFT under it, whole at a share of none
    expect(thinKeep(WHOLE, WHOLE)).toBe(1)
    expect(thinKeep(BALANCED_DROP, WHOLE)).toBeCloseTo(0, 12)
    expect(thinKeep(0, 0)).toBe(1)
  })
  it('switches the program on at a share of none and eases it up, and down to none before it switches off', () => {
    // (the regression: the full share applied the frame the program landed, half the near tufts gone at once)
    const e = new ThinEase()
    const dt = 1 / 60
    // Balanced chosen up close: the program asked for, the share none until it is in force
    for (let i = 0; i < 30; i++) expect(e.step('balanced', 45, dt)).toBe(true)
    expect(e.share).toBe(0)
    e.program = true
    let last = 0
    for (let t = 0; t < THIN_EASE_S + 0.1; t += dt) {
      e.step('balanced', 45, dt)
      expect(e.share - last).toBeLessThanOrEqual((WHOLE / THIN_EASE_S) * dt + 1e-12)
      last = e.share
    }
    expect(e.share).toBe(WHOLE)
    // back to Full: the program kept while the share eases down, given up at none
    let steps = 0
    while (e.step('full', 45, dt)) {
      expect(e.share).toBeLessThan(WHOLE)
      steps++
    }
    expect(e.share).toBe(0)
    expect(steps).toBeGreaterThanOrEqual(Math.floor(THIN_EASE_S / dt) - 1)
    // zoomed out past CLOSE_ZOOM: the same, Full's program from 110 m
    e.program = true
    e.share = WHOLE
    for (let i = 0; i < 40; i++) e.step('balanced', 125, dt)
    expect(e.share).toBe(0)
    expect(e.step('balanced', 125, dt)).toBe(false)
  })
  it('is settled only with the program asked for in force and the share at its target (the tools wait on it)', () => {
    const e = new ThinEase(0)
    expect(e.settled('full', 45)).toBe(true)
    expect(e.settled('balanced', 125)).toBe(true)
    // Balanced up close: unsettled until the program lands; then, snapped on that frame, settled
    e.step('balanced', 45, 0)
    expect(e.settled('balanced', 45)).toBe(false)
    e.program = true
    e.step('balanced', 45, 0)
    expect(e.share).toBe(WHOLE)
    expect(e.settled('balanced', 45)).toBe(true)
    // eased: unsettled while the share moves
    const f = new ThinEase()
    f.program = true
    f.step('balanced', 45, 0.1)
    expect(f.settled('balanced', 45)).toBe(false)
  })
  it('snaps the share at once with no ease (the frozen page of the look tools)', () => {
    const e = new ThinEase(0)
    e.program = true
    e.step('balanced', 45, 0)
    expect(e.share).toBe(WHOLE)
  })
  it('switches a define only once its program is ready, the old defines kept meanwhile; warms one without switching', () => {
    // (the regression: the ring drew nothing the frames its new program compiled)
    const host = (defines: string[]): DefineHost => ({
      options: { defines },
      setDefine(d: string, on: boolean) {
        const i = this.options.defines.findIndex(x => x === d || x.startsWith(d + ' '))
        if (i >= 0) this.options.defines.splice(i, 1)
        if (on) this.options.defines.push(d + ' true')
      },
    })
    const m = host(['#define A', '#define TRAMPLE true'])
    const seen: string[][] = []
    const notYet = () => (seen.push(m.options.defines.slice()), false)
    expect(switchDefineWhenReady(m, '#define GRASS_THIN', true, notYet)).toBe(false)
    // asked with the new defines, then put back as they were
    expect(seen[0]).toEqual(['#define A', '#define TRAMPLE true', '#define GRASS_THIN true'])
    expect(m.options.defines).toEqual(['#define A', '#define TRAMPLE true'])
    expect(switchDefineWhenReady(m, '#define GRASS_THIN', true, () => true)).toBe(true)
    expect(m.options.defines).toEqual(['#define A', '#define TRAMPLE true', '#define GRASS_THIN true'])
    // off again, not ready: the program with it kept
    expect(switchDefineWhenReady(m, '#define GRASS_THIN', false, () => false)).toBe(false)
    expect(m.options.defines).toEqual(['#define A', '#define TRAMPLE true', '#define GRASS_THIN true'])
    // warming never switches, ready or not
    const w = host(['#define A'])
    expect(warmDefine(w, '#define GRASS_THIN', true, () => true)).toBe(true)
    expect(warmDefine(w, '#define GRASS_THIN', true, () => false)).toBe(false)
    expect(w.options.defines).toEqual(['#define A'])
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
