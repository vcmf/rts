// The demo map's armies (src/look/world/armies.ts) and their figure (data/figures/fr-line-infantry.unitdata, written by
// tools/bake-figure.py; src/look/units-data.ts): the battalion's slots by the ruleset's drill, the script's phases in
// order, the layout clear of the blocked ground and failing loudly where there is no room, and the baked figure whole
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import { APPROACH, CYCLE, FAR_COAT_BELOW, FAR_ROLES, extents, facingAt, farPalette, farRule, layout, luminance, manAt, phaseAt, slots, type Drill, type ManState } from '../src/look/world/armies.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'
import { RULESETS } from '../src/rulesets/index.ts'
import { ARMIES_DEMO } from '../src/scenarios/armies-demo.ts'
import { decodeUnits, fromHalf, posedMesh, posedVertices, shadowProxy } from '../src/look/units-data.ts'

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

describe('armies: the scenario', () => {
  it('resolves as the page resolves it: its ruleset, unit type, figure file and every side\'s uniform', () => {
    const era = RULESETS[ARMIES_DEMO.ruleset]; expect(era, ARMIES_DEMO.ruleset).toBeDefined()
    const type = era.ruleset.types[ARMIES_DEMO.unitType]; expect(type, ARMIES_DEMO.unitType).toBeDefined()
    expect(type.geometry.companies * type.geometry.files * type.geometry.ranks).toBeGreaterThan(0)
    expect(existsSync(new URL(`../data/figures/${ARMIES_DEMO.figure}.unitdata`, import.meta.url))).toBe(true)
    for (const id of ARMIES_DEMO.sides) expect(era.uniforms[id], id).toBeDefined()
  })
})

describe('armies: the layout', () => {
  const open = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > 370
  it('fields 20 a side within the play area: lines in front, the rest in column behind, clear of one another', () => {
    const bs = layout(20, drill, open, ARMIES_DEMO.sides), e = extents(drill)
    expect(bs.filter(b => b.side === 0).length).toBe(20); expect(bs.filter(b => b.side === 1).length).toBe(20)
    for (const b of bs) expect(b.side === 0 ? b.z < 0 && b.heading === 0 : b.z > 0 && b.heading === Math.PI).toBe(true)
    // the whole footprint within ±235: a line's front and its approach behind, a column's depth
    for (const b of bs) { expect(Math.abs(b.x) + (b.reserve ? e.columnHalf : e.halfFront)).toBeLessThanOrEqual(235); expect(Math.abs(b.z) + (b.reserve ? e.columnDepth : APPROACH + e.columnDepth)).toBeLessThanOrEqual(235) }
    const lines = bs.filter(b => !b.reserve), back = (b: typeof bs[0]) => Math.abs(b.z)
    expect(lines.length).toBeGreaterThanOrEqual(8)
    for (const s of [0, 1]) expect(Math.min(...bs.filter(b => b.side === s && b.reserve).map(back))).toBeGreaterThan(Math.min(...lines.filter(b => b.side === s).map(back)))
    // no two boxes overlap: a line's (its front, its approach) or a column's
    const box = (b: typeof bs[0]) => ({ w: b.reserve ? e.columnHalf : e.halfFront, f: back(b), d: b.reserve ? e.columnDepth : APPROACH + e.columnDepth })
    for (const a of bs) for (const b of bs) if (a !== b && a.side === b.side) { const p = box(a), q = box(b); expect(Math.abs(a.x - b.x) >= p.w + q.w || p.f + p.d <= q.f || q.f + q.d <= p.f).toBe(true) }
    const [fx, fz] = facingAt(bs); expect(Math.hypot(fx, fz)).toBeLessThan(60)
  })
  // the demo map's blocked ground (the page's __armies.blocked sampled every 0.5 m over ±240 m, a bit a sample, row by
  // row from (−240, −240); read conservatively: blocked when any of the four samples round a point is)
  const bits = gunzipSync(readFileSync(new URL('./fixtures/demo-map-blocked.bin.gz', import.meta.url))), N = 961, R = 240, S = 0.5
  const bit = (i: number, j: number) => i < 0 || j < 0 || i >= N || j >= N || ((bits[(j * N + i) >> 3] >> ((j * N + i) & 7)) & 1) === 1
  const demo = (x: number, z: number) => { const i = Math.floor((x + R) / S), j = Math.floor((z + R) / S); return bit(i, j) || bit(i + 1, j) || bit(i, j + 1) || bit(i + 1, j + 1) }
  it('lays out 20 a side and fewer exactly as before the close reserves (hashes of the layouts at 084d6e0)', () => {
    const want = JSON.parse(readFileSync(new URL('./fixtures/armies-layout-20.json', import.meta.url), 'utf8')) as Record<string, string[]>
    const masks: Record<string, (x: number, z: number) => boolean> = { open, wood: (x, z) => open(x, z) || (Math.abs(x) < 60 && Math.abs(z) < 200), demo }
    for (const [k, b] of Object.entries(masks)) for (let n = 1; n <= 20; n++) {
      expect(createHash('sha256').update(JSON.stringify(layout(n, drill, b, ARMIES_DEMO.sides))).digest('hex').slice(0, 16), `${k} ${n}`).toBe(want[k][n - 1])
    }
  })
  it('fields 40 a side on the demo map: the close reserves behind, never ahead of a line, clear of every other box', () => {
    const bs = layout(40, drill, demo, ARMIES_DEMO.sides), e = extents(drill)
    for (const s of [0, 1]) expect(bs.filter(b => b.side === s).length).toBe(40)
    const back = (b: typeof bs[0]) => Math.abs(b.z), lines = bs.filter(b => !b.reserve)
    for (const b of bs) {
      expect(Math.abs(b.x) + (b.reserve ? e.columnHalf : e.halfFront)).toBeLessThanOrEqual(235)
      expect(Math.abs(b.z) + (b.reserve ? e.columnDepth : APPROACH + e.columnDepth)).toBeLessThanOrEqual(235)
    }
    // the men's own ground: a line's ranks (its full width) and its approach (its column's width); a column's
    const parts = (b: typeof bs[0]) => b.reserve ? [{ w: e.columnHalf, f: back(b), d: e.columnDepth }]
      : [{ w: e.halfFront, f: back(b), d: e.lineDepth }, { w: e.columnHalf, f: back(b), d: APPROACH + e.columnDepth }]
    for (const a of bs) for (const b of bs) if (a !== b && a.side === b.side) for (const p of parts(a)) for (const q of parts(b)) {
      expect(Math.abs(a.x - b.x) >= p.w + q.w || p.f + p.d <= q.f || q.f + q.d <= p.f, `${a.x},${a.z} / ${b.x},${b.z}`).toBe(true)
    }
    for (const r of bs.filter(b => b.reserve)) for (const l of lines) if (l.side === r.side && Math.abs(l.x - r.x) < e.halfFront + e.columnHalf) expect(back(r)).toBeGreaterThan(back(l))
    // every man of a reserve on open ground
    const sl = slots(drill)
    for (const b of bs) if (b.reserve) for (const [px, pz] of sl.column) { const c = Math.cos(b.heading); expect(demo(b.x + c * px, b.z + c * pz)).toBe(false) }
  })
  it('keeps off the blocked ground', () => {
    const wood = (x: number, z: number) => open(x, z) || (Math.abs(x) < 60 && Math.abs(z) < 200)
    for (const b of layout(4, drill, wood, ARMIES_DEMO.sides)) expect(Math.abs(b.x)).toBeGreaterThan(60)
  })
  it('fails loudly when a side has no room', () => {
    expect(() => layout(2, drill, (_x, z) => z > 0, ARMIES_DEMO.sides)).toThrow(/room for only 0 of 2 battalions for side 1/)
  })
  it('has a colour for every role of the figure, for every uniform, and a flag', () => {
    const d = decodeUnits(new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer)
    for (const u of Object.values(UNIFORMS)) {
      for (const r of d.palette) expect(u.colours[r], `${u.id}.${r}`).toMatch(/^#[0-9A-F]{6}$/i)
      expect(u.flag.length).toBeGreaterThan(0); for (const c of u.flag) expect(c).toMatch(/^#[0-9A-F]{6}$/i)
    }
    for (const id of ARMIES_DEMO.sides) expect(UNIFORMS[id], id).toBeDefined()
  })
})

describe('armies: the far palette', () => {
  it('paints the far roles in the coat a value step down, the rest as the uniform', () => {
    for (const u of Object.values(UNIFORMS)) {
      const f = farPalette(u.colours), ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
      for (const [r, k] of Object.entries(FAR_ROLES)) for (let i = 0; i < 3; i++) expect(ch(f[r], i)).toBe(Math.round(ch(u.colours.coat, i) * k))
      for (const r of Object.keys(u.colours)) if (!(r in FAR_ROLES)) expect(f[r]).toBe(u.colours[r])
    }
  })
  it('takes the coat from far off for a dark coat, keeps a light one, and an explicit rule wins', () => {
    expect([luminance('#000000'), luminance('#FFFFFF')]).toEqual([0, 1]); expect(luminance('#767676')).toBeCloseTo(FAR_COAT_BELOW, 2)
    const u = (coat: string, far?: 'coat' | 'own') => ({ id: 'x', colours: { coat }, flag: [], far })
    expect([farRule(u('#2C4FA8')), farRule(u('#E9E3D3')), farRule(u('#E9E3D3', 'coat')), farRule(u('#2C4FA8', 'own'))]).toEqual(['coat', 'own', 'coat', 'own'])
  })
})

describe('the figure (fr-line-infantry.unitdata)', () => {
  const d = decodeUnits(new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer)
  it('decodes whole, with a clip range for every role the script gives', () => {
    for (const r of ['halt', 'march', 'run', 'fire']) expect(d.ranges[r], r).toBeDefined()
    expect(d.ranges.march.speed).toBeGreaterThan(0.5); expect(d.ranges.run.speed).toBeGreaterThan(d.ranges.march.speed)
  })
  it('poses the far LOD at every step: on its feet, a figure tall, its normals not degenerate', () => {
    const l = d.lods[1], p = posedVertices(d, l.name), nv = l.vertices
    expect([p.width, p.height]).toEqual([nv * 2, d.vat.height])
    for (const f of [0, d.ranges.march.start + 3, d.ranges.fire.end - 1]) {
      let lo = Infinity, hi = -Infinity
      for (let v = 0; v < nv; v++) {
        const o = (f * nv * 2 + v * 2) * 4; lo = Math.min(lo, p.data[o + 1]); hi = Math.max(hi, p.data[o + 1])
        expect(Math.hypot(p.data[o + 4], p.data[o + 5], p.data[o + 6])).toBeGreaterThan(0.5)   // (blended: shorter, units.vert normalizes)
      }
      expect(lo).toBeGreaterThan(-0.1); expect(hi - lo).toBeGreaterThan(1.6); expect(hi - lo).toBeLessThan(2.8)   // m: a man, his bayonet up
    }
    expect([fromHalf(0x3c00), fromHalf(0xc000), fromHalf(0x0001)]).toEqual([1, -2, 2 ** -24])
  })
  it('has a shadow proxy of crossed quads, each corner wholly on one bone, a figure tall when posed', () => {
    const p = shadowProxy(d, d.lods[1].name), n = p.positions.length / 3
    expect(p.indices.length / 3).toBeLessThanOrEqual(64); expect(p.indices.length / 3).toBeGreaterThanOrEqual(40)
    expect(n * 6 / 4).toBe(p.indices.length)   // four corners, two triangles a quad
    for (let v = 0; v < n; v++) { expect(p.boneWeights[v * 4]).toBe(1); expect(p.boneIndices[v * 4]).toBeLessThan(d.bones.length) }
    const q = posedMesh(d, p), f = d.ranges.halt.start
    let lo = Infinity, hi = -Infinity
    for (let v = 0; v < n; v++) { const y = q.data[(f * n * 2 + v * 2) * 4 + 1]; lo = Math.min(lo, y); hi = Math.max(hi, y) }
    expect(hi - lo).toBeGreaterThan(1.4); expect(lo).toBeLessThan(0.3)
  })
  it('has two LODs, the far one lighter', () => {
    expect(d.lods.length).toBe(2); expect(d.lods[1].triangles).toBeLessThan(d.lods[0].triangles)
  })
})
