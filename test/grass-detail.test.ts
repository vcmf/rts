// The player's grass detail (src/look/grass-detail.ts, issue #257): ?grassdetail's parsing, the presets' rings, and the
// thinned clump (every other blade of the pack's Grass_Small).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bandAt,
  type Clump,
  GRASS_DETAIL_DEFAULT,
  GRASS_DETAIL_PRESETS,
  grassDetailOf,
  ringsFor,
  slotBand,
  thinClump,
} from '../src/look/grass-detail.ts'
import { CLUMP_RADIUS, RINGS } from '../src/look/meadow-spec.ts'

const q = (s: string) => new URLSearchParams(s)

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

describe('the grass detail', () => {
  it('is Full when absent, and takes full or balanced', () => {
    expect(GRASS_DETAIL_DEFAULT).toBe('full')
    expect(grassDetailOf(q(''))).toBe('full')
    expect(grassDetailOf(q('grassdetail=full'))).toBe('full')
    expect(grassDetailOf(q('grassdetail=balanced'))).toBe('balanced')
  })
  it('refuses anything else, an empty value included', () => {
    for (const v of ['', 'Full', 'low', 'thin', '1']) {
      expect(() => grassDetailOf(q(`grassdetail=${v}`))).toThrow(/grassdetail must be full or balanced/)
    }
  })
  it("draws main's rings and clumps at Full", () => {
    expect(GRASS_DETAIL_PRESETS.full).toEqual({ split: null })
    expect(ringsFor(GRASS_DETAIL_PRESETS.full)).toEqual(RINGS.map(r => ({ ...r, thin: false })))
  })
  it('cuts the near ring in two at Balanced, the thinned small clump outside with the large footprint', () => {
    const r = ringsFor(GRASS_DETAIL_PRESETS.balanced)
    expect(r).toHaveLength(RINGS.length + 1)
    expect(r[0]).toEqual({ ...RINGS[0], band: [0, 0, 8, 12], thin: false, far: { band: RINGS[0].band, gone: false } })
    expect(r[1].cell).toBe(RINGS[0].cell)
    expect(r[1].clump).toBe('Grass_Small')
    expect(r[1].thin).toBe(true)
    expect(r[1].far).toEqual({ band: [18, 25, 18, 25], gone: true })
    expect(r[1].band).toEqual([8, 12, RINGS[0].band[2], RINGS[0].band[3]])
    expect(r[1].spread * CLUMP_RADIUS.Grass_Small).toBeCloseTo(RINGS[0].spread * CLUMP_RADIUS.Grass_Large, 9)
    // the outer rings as main's, unthinned
    expect(r.slice(2)).toEqual(RINGS.slice(1).map(x => ({ ...x, thin: false })))
  })
  it("keeps main's bands at Full at every zoom", () => {
    const full = GRASS_DETAIL_PRESETS.full
    for (const r of ringsFor(full)) {
      for (const radius of [15, 45, 90, 125, 260]) expect(bandAt(r, full, radius)).toBe(r.band)
    }
  })
  it('moves the split out to the ring edge across its zoom at Balanced, so the default zoom draws Full', () => {
    const p = GRASS_DETAIL_PRESETS.balanced
    const [near, cut] = ringsFor(p)
    // up close: the split's own bands
    expect(bandAt(near, p, 45)).toEqual([0, 0, 8, 12])
    expect(bandAt(cut, p, 45)).toEqual([8, 12, 18, 25])
    // halfway: halfway, the two rings handing over at the same distance
    const mid = bandAt(near, p, 90)!
    expect(mid).toEqual([0, 0, 13, 18.5])
    expect(bandAt(cut, p, 90)!.slice(0, 2)).toEqual(mid.slice(2))
    // from the zoom's end out: the near ring is main's, the cut ring not drawn
    for (const radius of [110, 125, 260]) {
      expect(bandAt(near, p, radius)).toEqual(RINGS[0].band)
      expect(bandAt(cut, p, radius)).toBeNull()
    }
  })
  it("cuts each ring's slots to its widest band: the near ring keeps main's slots, the cut ring its own", () => {
    for (const r of ringsFor(GRASS_DETAIL_PRESETS.full)) expect(slotBand(r)).toEqual(r.band)
    const [near, cut, ...rest] = ringsFor(GRASS_DETAIL_PRESETS.balanced)
    // (the regression: the near ring's slots cut at 12 m left bare ground from 13 to 18 m once its band moved out)
    expect(slotBand(near)).toEqual(RINGS[0].band)
    expect(slotBand(cut)).toEqual([8, 12, 18, 25])
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
    const src = JSON.parse(readFileSync(new URL('../data/meadow-grass.json', import.meta.url), 'utf8')) as Record<
      string,
      { pos: number[]; nrm: number[]; v: number[] }
    >
    const g = src.Grass_Small
    const c: Clump = { pos: g.pos, nrm: g.nrm, vv: g.v, idx: g.v.map((_, i) => i), top: 1 }
    const t = thinClump(c)
    const tris = c.idx.length / 3
    expect(t.idx.length / 3).toBeGreaterThan(tris * 0.4)
    expect(t.idx.length / 3).toBeLessThan(tris * 0.6)
    // the kept blades are whole: thinning them again halves them again
    expect(thinClump(t).idx.length).toBeLessThan(t.idx.length)
  })
})
