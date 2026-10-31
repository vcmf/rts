// The player's grass detail (src/look/grass-detail.ts, issue #257, decision 0092): ?grassdetail's parsing, the rings
// of both levels, what each draws at a level and zoom (as meadow.vert reads it: weights, the hash's flip, the cull),
// and the clumps (src/look/meadow-clump.ts): the pack's indexed as the meadow does, Grass_Small thinned to every other
// blade.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BALANCED_CUT,
  type DetailRing,
  GRASS_DETAIL_DEFAULT,
  type GrassDetail,
  grassDetailOf,
  ringBands,
  ringBandsOf,
  ringsFor,
  slotBand,
} from '../src/look/grass-detail.ts'
import { type Clump, type ClumpSource, clumpRadius, indexClump, thinClump } from '../src/look/meadow-clump.ts'
import { CLOSE_ZOOM, CLUMP_RADIUS, RINGS } from '../src/look/meadow-spec.ts'
import { sstep } from '../src/look/noise.ts'

const q = (s: string) => new URLSearchParams(s)
const pack = JSON.parse(readFileSync(new URL('../data/meadow-grass.json', import.meta.url), 'utf8')) as Record<
  string,
  ClumpSource
>
// the pack's clumps as the meadow indexes them (src/look/meadow.ts)
const large = indexClump(pack.Grass_Large)
const small = indexClump(pack.Grass_Small)
const thin = thinClump(small)
const rings = ringsFor(clumpRadius(thin))
const maxY = (c: Clump) => Math.max(...c.pos.filter((_, i) => i % 3 === 1))

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

// meadow.vert's weight of a ring at a distance d from the focus, for the kind it grows there (0 if it does not draw
// that kind), and its hash h2 as the ring reads it (flipped on the cut and crop rings)
function weight(r: DetailRing, level: GrassDetail, radius: number, d: number, crop: boolean): number {
  const o = ringBandsOf()
  ringBands(r, level, radius, o)
  if ((crop ? o.crop : o.grass) < 0.5) return 0
  const inF = o.band[1] > 0 ? sstep(o.band[0], o.band[1], d) : 1
  const out = sstep(o.band[2], o.band[3], d) * (1 - o.mix[2]) + sstep(o.mix[0], o.mix[1], d) * o.mix[2]
  return inF * (1 - out) * o.mix[3]
}
const hashOf = (r: DetailRing, level: GrassDetail, radius: number, h2: number) => {
  const o = ringBandsOf()
  ringBands(r, level, radius, o)
  return o.flip > 0.5 ? 1 - h2 : h2
}
// main's own weight at d (its three rings), the same for grass and crops
const mainWeight = (d: number) =>
  RINGS.reduce(
    (a, r) => a + (r.band[1] > 0 ? sstep(r.band[0], r.band[1], d) : 1) * (1 - sstep(r.band[2], r.band[3], d)),
    0,
  )
const RADII = [15, 45, 69, 75, 90, 105, 109.9, 110, 125, 260]

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
  it('falls back to Full without the meadow, so a saved address with Balanced still opens', () => {
    // (the regression: it threw, and the page never drew)
    expect(grassDetailOf(q('grassdetail=balanced'), false)).toBe('full')
    expect(grassDetailOf(q('grassdetail=full'), false)).toBe('full')
    expect(() => grassDetailOf(q('grassdetail=x'), false)).toThrow(/grassdetail must be/)
  })
  it("builds main's rings with the near one cut, the cut and crop rings on its cells, anchored to the world", () => {
    expect(rings.map(r => r.kind)).toEqual(['near', 'cut', 'crop', 'main', 'main'])
    const [near, cut, crop, ...rest] = rings
    expect(near).toMatchObject({ ...RINGS[0], band: [0, 0, ...BALANCED_CUT], main: RINGS[0].band })
    const beyond = [...BALANCED_CUT, RINGS[0].band[2], RINGS[0].band[3]]
    expect(cut).toMatchObject({ cell: RINGS[0].cell, clump: 'Grass_Small', band: beyond, world: true })
    expect(crop).toMatchObject({ cell: RINGS[0].cell, clump: 'Grass_Large', spread: RINGS[0].spread, band: beyond })
    expect(rest).toEqual(RINGS.slice(1).map(r => ({ ...r, kind: 'main' })))
  })
  it('indexes the pack as the meadow does, its radii as CLUMP_RADIUS rounds them', () => {
    for (const [name, c] of [
      ['Grass_Small', small],
      ['Grass_Large', large],
    ] as const) {
      expect(maxY(c)).toBe(1)
      expect(CLUMP_RADIUS[name] - clumpRadius(c)).toBeGreaterThanOrEqual(0)
      expect(CLUMP_RADIUS[name] - clumpRadius(c)).toBeLessThan(0.001)
    }
  })
  it("keeps the thinned clump as tall as the whole one, and scales its spread so its footprint is the large one's", () => {
    // (the regression: thinned, its tallest blade could go and the cut ring's grass stand shorter)
    expect(maxY(thin)).toBe(1)
    expect(thin.top).toBeLessThanOrEqual(small.top)
    expect(clumpRadius(thin)).toBeLessThanOrEqual(clumpRadius(small) + 1e-12)
    const [near, cut] = rings
    expect(cut.spread * clumpRadius(thin)).toBeCloseTo(near.spread * CLUMP_RADIUS.Grass_Large, 9)
  })
  it("draws main's weights at Full at every zoom, the cut and crop rings not at all", () => {
    for (const radius of RADII) {
      for (let d = 0; d <= 110; d += 0.25) {
        for (const crop of [false, true]) {
          const w = rings.map(r => weight(r, 'full', radius, d, crop))
          expect(w[1] + w[2]).toBe(0)
          expect(w.reduce((a, x) => a + x, 0)).toBeCloseTo(mainWeight(d), 12)
        }
      }
    }
  })
  it('adds to main at Balanced at every zoom, grass and crops (no pop, no overdraw), and is Full from 110 m out', () => {
    for (const radius of RADII) {
      for (let d = 0; d <= 110; d += 0.25) {
        for (const crop of [false, true]) {
          const w = rings.map(r => weight(r, 'balanced', radius, d, crop))
          expect(w.reduce((a, x) => a + x, 0)).toBeCloseTo(mainWeight(d), 9)
          // the crops beyond the cut: the crop ring's (the large clump), never the cut ring's thinned one
          expect(crop ? w[1] : w[2]).toBe(0)
          if (radius >= CLOSE_ZOOM[1]) expect(w).toEqual(rings.map(r => weight(r, 'full', radius, d, crop)))
        }
      }
    }
    // the cut and crop rings fade continuously across the zoom
    for (let radius = 60; radius <= 120; radius += 0.5) {
      expect(
        Math.abs(
          weight(rings[1], 'balanced', radius + 0.01, 15, false) - weight(rings[1], 'balanced', radius, 15, false),
        ),
      ).toBeLessThan(0.002)
    }
  })
  it('keeps each root by one ring at most across the cut, as many as Full keeps (complementary hashes)', () => {
    // (the regression: both rings kept by the same hash, so a root grew two clumps or none)
    const N = 2000
    for (const radius of [45, 80, 95]) {
      for (const d of [8, 9, 10, 11, 12, 15]) {
        for (const g of [1, 0.7, 0.35]) {
          for (const crop of [false, true]) {
            let kept = 0
            for (let i = 0; i < N; i++) {
              const h2 = (i + 0.5) / N
              // a ring keeps a root where its keep (the growth times its weight) passes its hash (meadow.vert's grow)
              const n = rings.filter(
                r => g * weight(r, 'balanced', radius, d, crop) > hashOf(r, 'balanced', radius, h2),
              )
              expect(n.length).toBeLessThanOrEqual(1)
              kept += n.length
            }
            const full = rings.filter(r => r.kind === 'near' || r.kind === 'main')
            expect(kept / N).toBeCloseTo(g * full.reduce((a, r) => a + weight(r, 'full', radius, d, crop), 0), 2)
          }
        }
      }
    }
  })
  it("culls each ring's chunks to the band it draws: the near ring at the cut up close, the faded rings not at all", () => {
    const cull = (r: DetailRing, level: GrassDetail, radius: number) => {
      const o = ringBandsOf()
      ringBands(r, level, radius, o)
      return o.cull
    }
    const [near, cut, crop, ...rest] = rings
    expect(cull(near, 'balanced', 45)).toEqual([0, 0, ...BALANCED_CUT])
    expect(cull(near, 'balanced', 90)).toEqual(RINGS[0].band)
    expect(cull(near, 'full', 45)).toEqual(RINGS[0].band)
    for (const r of [cut, crop]) {
      expect(cull(r, 'balanced', 45)).toEqual(r.band)
      expect(cull(r, 'balanced', 109)).toEqual(r.band)
      expect(cull(r, 'balanced', 110)[3]).toBe(0)
      expect(cull(r, 'full', 45)[3]).toBe(0)
    }
    for (const r of rest) for (const l of ['full', 'balanced'] as const) expect(cull(r, l, 45)).toEqual(r.band)
  })
  it("cuts the ring-anchored rings' slots to their widest band: the near ring keeps main's", () => {
    expect(slotBand(rings[0])).toEqual(RINGS[0].band)
    for (const r of rings.slice(3)) expect(slotBand(r)).toEqual(r.band)
  })
  it('normalises the thinned clump to a height of 1 again when its tallest blade went, its size unchanged', () => {
    // three blades, the middle (dropped) one the tallest: 1, the others 0.6 of it (top 2 in the export's units)
    const c = blades(3)
    c.top = 2
    for (let i = 1; i < c.pos.length; i += 3) if (Math.floor(c.pos[i - 1]) !== 1) c.pos[i] *= 0.6
    const t = thinClump(c)
    expect(maxY(t)).toBe(1)
    // in the export's units nothing moved: the kept blades 1.2 tall (0.6 of 2), their widths as they were
    expect(t.top).toBeCloseTo(1.2, 12)
    expect(t.pos[0] * t.top).toBeCloseTo(c.pos[0] * c.top, 12)
    expect(t.pos[3] * t.top).toBeCloseTo(c.pos[3] * c.top, 12)
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
    const c = small
    const t = thinClump(c)
    const tris = c.idx.length / 3
    expect(t.idx.length / 3).toBeGreaterThan(tris * 0.4)
    expect(t.idx.length / 3).toBeLessThan(tris * 0.6)
    // the kept blades are whole: thinning them again halves them again
    expect(thinClump(t).idx.length).toBeLessThan(t.idx.length)
  })
})
