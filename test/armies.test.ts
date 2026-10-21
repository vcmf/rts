// The demo map's armies (src/look/world/armies.ts) and their figure (data/figures/fr-line-infantry.unitdata, written by
// tools/bake-figure.py; src/look/units-data.ts): the battalion's slots by the ruleset's drill, the script's phases in
// order, the layout clear of the blocked ground and failing loudly where there is no room, and the baked figure whole
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { APPROACH, CYCLE, SIDES, extents, facingAt, layout, manAt, phaseAt, slots, type Drill, type ManState } from '../src/look/world/armies.ts'
import { decodeUnits } from '../src/look/units-data.ts'

const g = napoleonic.types.infantry.geometry
const drill: Drill = { companies: g.companies, files: g.files, ranks: g.ranks, fileSpacing: g.fileSpacing, rankSpacing: g.rankSpacing }
const MARCH = 0.9, RUN = 3.2

describe('armies: the battalion', () => {
  it('has a slot in line and in column for every man, and his rank', () => {
    const s = slots(drill), n = g.companies * g.files * g.ranks
    expect(s.line.length).toBe(n); expect(s.column.length).toBe(n); expect(s.rank.length).toBe(n)
    expect(new Set(s.line.map(p => p.join())).size).toBe(n)   // no two men on one place
    expect(Math.max(...s.rank)).toBe(g.ranks - 1)
  })
  it('stands in line within its extents, the front rank at z 0', () => {
    const s = slots(drill), e = extents(drill)
    for (const [x, z] of s.line) { expect(Math.abs(x)).toBeLessThanOrEqual(e.halfFront + 1e-9); expect(z).toBeLessThanOrEqual(0); expect(-z).toBeLessThanOrEqual(e.lineDepth + 1e-9) }
    for (const [x, z] of s.column) { expect(Math.abs(x)).toBeLessThanOrEqual(e.columnHalf + 1e-9); expect(-z).toBeLessThanOrEqual(e.columnDepth + 1e-9) }
  })
})

describe('armies: the script', () => {
  it('goes column, halt, deploy, fire in one cycle', () => {
    const seen: string[] = []
    for (let t = 0; t < CYCLE; t += 0.25) { const p = phaseAt(drill, t, MARCH, RUN).phase; if (seen.at(-1) !== p) seen.push(p) }
    expect(seen).toEqual(['column', 'halt', 'deploy', 'fire'])
  })
  it('marches the column up to the line and deploys each man to his line slot', () => {
    const s = slots(drill), out = {} as ManState, tm = APPROACH / MARCH
    const p0 = phaseAt(drill, 0, MARCH, RUN), m0 = manAt(drill, s, 0, 0, p0, RUN, MARCH, 0, out)
    expect(m0.role).toBe('march'); expect(m0.z).toBeCloseTo(s.column[0][1] - APPROACH)
    const pe = phaseAt(drill, tm - 1e-6, MARCH, RUN), me = manAt(drill, s, 0, tm - 1e-6, pe, RUN, MARCH, 0, out)
    expect(me.z).toBeCloseTo(s.column[0][1], 3)
    const pd = phaseAt(drill, pe.deployEnd + 0.01, MARCH, RUN)
    for (let i = 0; i < s.line.length; i += 37) {
      const m = manAt(drill, s, i, pe.deployEnd + 0.01, pd, RUN, MARCH, 0, out)
      expect([m.x, m.z, m.moving]).toEqual([s.line[i][0], s.line[i][1], false])
    }
  })
  it('fires by ranks, each rank after the one in front', () => {
    const s = slots(drill), out = {} as ManState, p = phaseAt(drill, CYCLE - 1, MARCH, RUN)
    const since = (i: number) => manAt(drill, s, i, CYCLE - 1, p, RUN, MARCH, 0, out).since
    expect(p.phase).toBe('fire'); expect(since(g.files)).toBeGreaterThan(since(0)); expect(since(2 * g.files)).toBeGreaterThan(since(g.files))
  })
})

describe('armies: the layout', () => {
  const open = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > 370
  it('fields both sides on open ground, facing each other, clear of one another', () => {
    const bs = layout(10, drill, open), e = extents(drill)
    expect(bs.filter(b => b.side === 0).length).toBe(10); expect(bs.filter(b => b.side === 1).length).toBe(10)
    for (const b of bs) expect(b.side === 0 ? b.z < 0 && b.heading === 0 : b.z > 0 && b.heading === Math.PI).toBe(true)
    for (const a of bs) for (const b of bs) if (a !== b && a.side === b.side) expect(Math.abs(a.x - b.x) >= 2 * e.halfFront || Math.abs(a.z - b.z) >= APPROACH + e.columnDepth).toBe(true)
    const [fx, fz] = facingAt(bs); expect(Math.hypot(fx, fz)).toBeLessThan(60)
  })
  it('keeps off the blocked ground', () => {
    const wood = (x: number, z: number) => open(x, z) || (Math.abs(x) < 60 && Math.abs(z) < 200)
    for (const b of layout(4, drill, wood)) expect(Math.abs(b.x)).toBeGreaterThan(60)
  })
  it('fails loudly when a side has no room', () => {
    expect(() => layout(2, drill, (_x, z) => z > 0)).toThrow(/room for only 0 of 2 battalions for austria/)
  })
  it('has a colour for every role of the figure, for every side', () => {
    const d = decodeUnits(new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer)
    for (const s of SIDES) for (const r of d.palette) expect(s.palette[r], `${s.name}.${r}`).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe('the figure (fr-line-infantry.unitdata)', () => {
  const d = decodeUnits(new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer)
  it('decodes whole, with a clip range for every role the script gives', () => {
    for (const r of ['halt', 'march', 'run', 'fire']) expect(d.ranges[r], r).toBeDefined()
    expect(d.ranges.march.speed).toBeGreaterThan(0.5); expect(d.ranges.run.speed).toBeGreaterThan(d.ranges.march.speed)
  })
  it('has two LODs, the far one lighter', () => {
    expect(d.lods.length).toBe(2); expect(d.lods[1].triangles).toBeLessThan(d.lods[0].triangles)
  })
})
