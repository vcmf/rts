// The player's grass detail (src/look/grass-detail.ts, issue #257, decision 0092): ?grassdetail's parsing, the rings
// of both levels, what each draws at a level and zoom (as meadow.vert reads it), and the thinned clump (every other
// blade of the pack's Grass_Small).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BALANCED_CUT,
  BALANCED_ZOOM,
  type Clump,
  clumpRadius,
  type DetailRing,
  GRASS_DETAIL_DEFAULT,
  type GrassDetail,
  grassDetailOf,
  handBack,
  ringBands,
  ringBandsOf,
  ringsFor,
  slotBand,
  thinClump,
} from '../src/look/grass-detail.ts'
import { CLUMP_RADIUS, RINGS } from '../src/look/meadow-spec.ts'

const q = (s: string) => new URLSearchParams(s)
const pack = JSON.parse(readFileSync(new URL('../data/meadow-grass.json', import.meta.url), 'utf8')) as Record<
  string,
  { pos: number[]; nrm: number[]; v: number[] }
>
// a clump of the pack, unindexed (every corner its own vertex), its positions normalised to a height of 1 as
// src/look/meadow.ts does
function packClump(name: string): Clump {
  const g = pack[name]
  let top = 0
  for (let i = 1; i < g.pos.length; i += 3) top = Math.max(top, g.pos[i])
  return { pos: g.pos.map(p => p / top), nrm: g.nrm, vv: g.v, idx: g.v.map((_, i) => i), top }
}
const thinRadius = clumpRadius(thinClump(packClump('Grass_Small')))
const rings = ringsFor(thinRadius)
// a clump of n blades, each a quad (two triangles sharing an edge), apart from each other; unindexed (every corner its
// own vertex), as the export is
function blades(n: number): Clump {
  const c: Clump = { pos: [], nrm: [], vv: [], idx: [], top: 1 }
  const quad = [
    [0, 0],
    [0.1, 0],
    [0, 1],
    [0.1, 0],
    [0.1, 1],
    [0, 1],
  ]
  for (let b = 0; b < n; b++) {
    for (const [x, y] of quad) {
      c.idx.push(c.vv.length)
      c.pos.push(b + x, y, 0)
      c.nrm.push(0, 0, 1)
      c.vv.push(y)
    }
  }
  return c
}

// meadow.vert's weights at a distance d from the focus, from a ring's bands (its bandG and bandC)
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const inFade = (b: number[], d: number) => (b[1] > 0 ? smooth(b[0], b[1], d) : 1)
function weights(r: DetailRing, level: GrassDetail, radius: number, d: number): { grass: number; crop: number } {
  const o = ringBandsOf()
  ringBands(r, level, radius, o)
  const out = smooth(o.band[2], o.band[3], d) * (1 - o.mix[2]) + smooth(o.mix[0], o.mix[1], d) * o.mix[2]
  const grass = inFade(o.band, d) * (1 - out) * o.mix[3]
  const crop = o.crop[3] > 0 ? inFade(o.crop, d) * (1 - smooth(o.crop[2], o.crop[3], d)) : 0
  return { grass, crop }
}
// main's own weights at d (its three rings)
const mainWeight = (d: number) =>
  RINGS.reduce((a, r) => a + inFade(r.band, d) * (1 - smooth(r.band[2], r.band[3], d)), 0)

describe('the grass detail', () => {
  it('is Full when absent, and takes full or balanced', () => {
    expect(GRASS_DETAIL_DEFAULT).toBe('full')
    expect(grassDetailOf(q(''), true)).toBe('full')
    expect(grassDetailOf(q('grassdetail=full'), true)).toBe('full')
    expect(grassDetailOf(q('grassdetail=balanced'), true)).toBe('balanced')
  })
  it('refuses anything else, an empty value included', () => {
    for (const v of ['', 'Full', 'low', 'thin', '1']) {
      expect(() => grassDetailOf(q(`grassdetail=${v}`), true)).toThrow(/grassdetail must be full or balanced/)
    }
  })
  it('refuses Balanced without the meadow (no rings to thin), and takes Full there', () => {
    expect(() => grassDetailOf(q('grassdetail=balanced'), false)).toThrow(/needs the meadow/)
    expect(grassDetailOf(q('grassdetail=full'), false)).toBe('full')
    expect(grassDetailOf(q(''), false)).toBe('full')
  })
  it("builds main's rings with the near one cut in two, the cut ring on the same cells", () => {
    expect(rings.map(r => r.kind)).toEqual(['near', 'cut', 'main', 'main'])
    const [near, cut, ...rest] = rings
    expect(near).toMatchObject({ ...RINGS[0], band: [0, 0, ...BALANCED_CUT], main: RINGS[0].band })
    expect(cut).toMatchObject({ cell: RINGS[0].cell, n: RINGS[0].n, clump: 'Grass_Small' })
    expect(cut.band).toEqual([...BALANCED_CUT, RINGS[0].band[2], RINGS[0].band[3]])
    expect(rest).toEqual(RINGS.slice(1).map(r => ({ ...r, kind: 'main' })))
  })
  it("scales the cut ring's spread by the thinned clump's own radius, so its footprint is the large clump's", () => {
    // (the clumps' radii as measured: CLUMP_RADIUS rounds the pack's up to the millimetre)
    for (const name of ['Grass_Small', 'Grass_Large'] as const) {
      const r = clumpRadius(packClump(name))
      expect(CLUMP_RADIUS[name] - r).toBeGreaterThanOrEqual(0)
      expect(CLUMP_RADIUS[name] - r).toBeLessThan(0.001)
    }
    // (thinned, the clump is no wider than it was)
    expect(thinRadius).toBeLessThanOrEqual(clumpRadius(packClump('Grass_Small')))
    const [near, cut] = rings
    expect(cut.spread * thinRadius).toBeCloseTo(near.spread * CLUMP_RADIUS.Grass_Large, 9)
  })
  it("draws main's bands at Full at every zoom, the cut ring not at all", () => {
    for (const radius of [15, 45, 90, 109, 125, 260]) {
      for (let d = 0; d <= 110; d += 0.25) {
        const w = rings.map(r => weights(r, 'full', radius, d))
        expect(w[1]).toEqual({ grass: 0, crop: 0 })
        // grass and crops each as main's three rings
        expect(w.reduce((a, x) => a + x.grass, 0)).toBeCloseTo(mainWeight(d), 12)
        expect(w.reduce((a, x) => a + x.crop, 0)).toBeCloseTo(mainWeight(d), 12)
      }
    }
  })
  it("keeps the crops at Balanced as at Full: the near ring's to main's edge, none on the cut ring", () => {
    // (the regression: the cut ring grew the crops with its thinned clump, the wheat's fill lost)
    for (const radius of [15, 45, 90, 125]) {
      for (let d = 0; d <= 110; d += 0.25) {
        const w = rings.map(r => weights(r, 'balanced', radius, d))
        expect(w[1].crop).toBe(0)
        expect(w.map(x => x.crop)).toEqual(rings.map(r => weights(r, 'full', radius, d).crop))
      }
    }
  })
  it('hands back to Full across the zoom continuously, the rings always adding to one (no pop, no overdraw)', () => {
    // (the regression: the cut ring's band shrank to [c, d, c, d], never zero, and then vanished at 110 m; the
    // 18-25 m annulus drawn by three rings from about 95 m)
    const fade = (radius: number) => {
      const o = ringBandsOf()
      ringBands(rings[1], 'balanced', radius, o)
      return o.mix[3]
    }
    expect(fade(BALANCED_ZOOM[0])).toBe(1)
    expect(fade(BALANCED_ZOOM[1])).toBe(0)
    for (let radius = 60; radius <= 120; radius += 0.5) {
      expect(Math.abs(fade(radius + 0.01) - fade(radius))).toBeLessThan(0.001)
      for (let d = 0; d <= 110; d += 0.25) {
        const grass = rings.reduce((a, r) => a + weights(r, 'balanced', radius, d).grass, 0)
        expect(grass).toBeCloseTo(mainWeight(d), 9)
      }
    }
    // from the zoom's end out Balanced draws Full's
    for (const radius of [110, 125, 260]) {
      for (let d = 0; d <= 110; d += 0.5) {
        expect(rings.map(r => weights(r, 'balanced', radius, d))).toEqual(rings.map(r => weights(r, 'full', radius, d)))
      }
    }
    expect(handBack(BALANCED_ZOOM, 45)).toBe(0)
  })
  it("cuts each ring's slots to its widest band: the near ring keeps main's slots, the cut ring its own", () => {
    const [near, cut, ...rest] = rings
    expect(slotBand(near)).toEqual(RINGS[0].band)
    expect(slotBand(cut)).toEqual(cut.band)
    for (const r of rest) expect(slotBand(r)).toEqual(r.band)
  })
  it('keeps every other blade, only their vertices, unchanged', () => {
    const c = blades(5)
    const t = thinClump(c)
    expect(t.idx).toHaveLength(3 * 6)
    expect(t.vv).toHaveLength(3 * 6)
    expect(t.top).toBe(c.top)
    // blades 0, 2 and 4, where they were
    const xs = new Set(t.idx.map(v => Math.floor(t.pos[v * 3])))
    expect([...xs]).toEqual([0, 2, 4])
    expect(t.pos.slice(0, 18)).toEqual(c.pos.slice(0, 18))
  })
  it("keeps about half of the pack's Grass_Small, in whole blades", () => {
    const c = packClump('Grass_Small')
    const t = thinClump(c)
    const tris = c.idx.length / 3
    expect(t.idx.length / 3).toBeGreaterThan(tris * 0.4)
    expect(t.idx.length / 3).toBeLessThan(tris * 0.6)
    // the kept blades are whole: thinning them again halves them again
    expect(thinClump(t).idx.length).toBeLessThan(t.idx.length)
  })
})
