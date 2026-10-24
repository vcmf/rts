// The demo map's armies (src/look/world/armies.ts) and their figure (data/figures/fr-line-infantry.unitdata, written by
// tools/bake-figure.py; src/look/units-data.ts): the battalion's slots by the ruleset's drill, the script's phases in
// order, the layout clear of the blocked ground and failing loudly where there is no room, and the baked figure whole.
// The demo map's blocked ground is a fixture (test/fixtures/demo-map-blocked.bin.gz), sampled from the page by
// tools/sample-blocked.mjs (rerun it when the map, its trees, river or buildings change)
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import {
  APPROACH,
  CYCLE,
  FAR_COAT_BELOW,
  FAR_ROLES,
  extents,
  facingAt,
  farPalette,
  farRule,
  layout,
  luminance,
  manAt,
  phaseAt,
  slots,
  type Drill,
  type ManState,
} from '../src/look/world/armies.ts'
import { UNIFORMS } from '../src/rulesets/napoleonic-uniforms.ts'
import { RULESETS } from '../src/rulesets/index.ts'
import { ARMIES_DEMO } from '../src/scenarios/armies-demo.ts'
import {
  TINY_ROLES,
  boneParts,
  checkUnits,
  decodeUnits,
  fromHalf,
  posedMesh,
  posedVertices,
  shadowProxy,
  shadowShape,
  tinyMesh,
  type Part,
  type UnitData,
} from '../src/look/units-data.ts'

const g = napoleonic.types.infantry.geometry
const drill: Drill = {
  companies: g.companies,
  files: g.files,
  ranks: g.ranks,
  fileSpacing: g.fileSpacing,
  rankSpacing: g.rankSpacing,
}
const MARCH = 0.9
const RUN = 3.2

describe('armies: the battalion', () => {
  it('has a slot in line and in column for every man, and his rank', () => {
    const s = slots(drill)
    const n = g.companies * g.files * g.ranks
    expect(s.line.length).toBe(n)
    expect(s.column.length).toBe(n)
    expect(s.rank.length).toBe(n)
    expect(new Set(s.line.map(p => p.join())).size).toBe(n) // no two men on one place
    expect(Math.max(...s.rank)).toBe(g.ranks - 1)
  })
  it('stands in line within its extents, the front rank at z 0', () => {
    const s = slots(drill)
    const e = extents(drill)
    for (const [x, z] of s.line) {
      expect(Math.abs(x)).toBeLessThanOrEqual(e.halfFront + 1e-9)
      expect(z).toBeLessThanOrEqual(0)
      expect(-z).toBeLessThanOrEqual(e.lineDepth + 1e-9)
    }
    for (const [x, z] of s.column) {
      expect(Math.abs(x)).toBeLessThanOrEqual(e.columnHalf + 1e-9)
      expect(-z).toBeLessThanOrEqual(e.columnDepth + 1e-9)
    }
  })
})

describe('armies: the script', () => {
  it('goes column, halt, deploy, fire in one cycle', () => {
    const seen: string[] = []
    for (let t = 0; t < CYCLE; t += 0.25) {
      const p = phaseAt(drill, t, MARCH, RUN).phase
      if (seen.at(-1) !== p) seen.push(p)
    }
    expect(seen).toEqual(['column', 'halt', 'deploy', 'fire'])
  })
  it('marches the column up to the line and deploys each man to his line slot', () => {
    const s = slots(drill)
    const out = {} as ManState
    const tm = APPROACH / MARCH
    const p0 = phaseAt(drill, 0, MARCH, RUN)
    const m0 = manAt(drill, s, 0, 0, p0, RUN, MARCH, 0, out)
    expect(m0.role).toBe('march')
    expect(m0.z).toBeCloseTo(s.column[0][1] - APPROACH)
    const pe = phaseAt(drill, tm - 1e-6, MARCH, RUN)
    const me = manAt(drill, s, 0, tm - 1e-6, pe, RUN, MARCH, 0, out)
    expect(me.z).toBeCloseTo(s.column[0][1], 3)
    const pd = phaseAt(drill, pe.deployEnd + 0.01, MARCH, RUN)
    for (let i = 0; i < s.line.length; i += 37) {
      const m = manAt(drill, s, i, pe.deployEnd + 0.01, pd, RUN, MARCH, 0, out)
      expect([m.x, m.z, m.moving]).toEqual([s.line[i][0], s.line[i][1], false])
    }
  })
  it('fires by ranks, each rank after the one in front', () => {
    const s = slots(drill)
    const out = {} as ManState
    const p = phaseAt(drill, CYCLE - 1, MARCH, RUN)
    const since = (i: number) => manAt(drill, s, i, CYCLE - 1, p, RUN, MARCH, 0, out).since
    expect(p.phase).toBe('fire')
    expect(since(g.files)).toBeGreaterThan(since(0))
    expect(since(2 * g.files)).toBeGreaterThan(since(g.files))
  })
})

describe('armies: the scenario', () => {
  it("resolves as the page resolves it: its ruleset, unit type, figure file and every side's uniform", () => {
    const era = RULESETS[ARMIES_DEMO.ruleset]
    expect(era, ARMIES_DEMO.ruleset).toBeDefined()
    const type = era.ruleset.types[ARMIES_DEMO.unitType]
    expect(type, ARMIES_DEMO.unitType).toBeDefined()
    expect(type.geometry.companies * type.geometry.files * type.geometry.ranks).toBeGreaterThan(0)
    expect(existsSync(new URL(`../data/figures/${ARMIES_DEMO.figure}.unitdata`, import.meta.url))).toBe(true)
    for (const id of ARMIES_DEMO.sides) expect(era.uniforms[id], id).toBeDefined()
  })
})

describe('armies: the layout', () => {
  const open = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > 370
  it('fields 20 a side within the play area: lines in front, the rest in column behind, clear of one another', () => {
    const bs = layout(20, drill, open, ARMIES_DEMO.sides)
    const e = extents(drill)
    expect(bs.filter(b => b.side === 0).length).toBe(20)
    expect(bs.filter(b => b.side === 1).length).toBe(20)
    for (const b of bs) expect(b.side === 0 ? b.z < 0 && b.heading === 0 : b.z > 0 && b.heading === Math.PI).toBe(true)
    // the whole footprint within ±235: a line's front and its approach behind, a column's depth
    for (const b of bs) {
      expect(Math.abs(b.x) + (b.reserve ? e.columnHalf : e.halfFront)).toBeLessThanOrEqual(235)
      expect(Math.abs(b.z) + (b.reserve ? e.columnDepth : APPROACH + e.columnDepth)).toBeLessThanOrEqual(235)
    }
    const lines = bs.filter(b => !b.reserve)
    const back = (b: (typeof bs)[0]) => Math.abs(b.z)
    expect(lines.length).toBeGreaterThanOrEqual(8)
    for (const s of [0, 1]) {
      expect(Math.min(...bs.filter(b => b.side === s && b.reserve).map(back))).toBeGreaterThan(
        Math.min(...lines.filter(b => b.side === s).map(back)),
      )
    }
    // no two boxes overlap: a line's (its front, its approach) or a column's
    const box = (b: (typeof bs)[0]) => ({
      w: b.reserve ? e.columnHalf : e.halfFront,
      f: back(b),
      d: b.reserve ? e.columnDepth : APPROACH + e.columnDepth,
    })
    for (const a of bs) {
      for (const b of bs) {
        if (a !== b && a.side === b.side) {
          const p = box(a)
          const q = box(b)
          expect(Math.abs(a.x - b.x) >= p.w + q.w || p.f + p.d <= q.f || q.f + q.d <= p.f).toBe(true)
        }
      }
    }
    const [fx, fz] = facingAt(bs)
    expect(Math.hypot(fx, fz)).toBeLessThan(60)
  })
  // the demo map's blocked ground (the page's __armies.blocked sampled every 0.5 m over ±240 m, a bit a sample, row by
  // row from (−240, −240), by tools/sample-blocked.mjs; read conservatively: blocked when any of the
  // four samples round a point is)
  const bits = gunzipSync(readFileSync(new URL('./fixtures/demo-map-blocked.bin.gz', import.meta.url)))
  const N = 961
  const R = 240
  const S = 0.5
  const bit = (i: number, j: number) =>
    i < 0 || j < 0 || i >= N || j >= N || ((bits[(j * N + i) >> 3] >> ((j * N + i) & 7)) & 1) === 1
  const demo = (x: number, z: number) => {
    const i = Math.floor((x + R) / S)
    const j = Math.floor((z + R) / S)
    return bit(i, j) || bit(i + 1, j) || bit(i, j + 1) || bit(i + 1, j + 1)
  }
  it('lays out 20 a side and fewer exactly as before the close reserves (hashes of the layouts at 084d6e0)', () => {
    const want = JSON.parse(
      readFileSync(new URL('./fixtures/armies-layout-20.json', import.meta.url), 'utf8'),
    ) as Record<string, string[]>
    const masks: Record<string, (x: number, z: number) => boolean> = {
      open,
      wood: (x, z) => open(x, z) || (Math.abs(x) < 60 && Math.abs(z) < 200),
      demo,
    }
    for (const [k, b] of Object.entries(masks)) {
      for (let n = 1; n <= 20; n++) {
        expect(
          createHash('sha256')
            .update(JSON.stringify(layout(n, drill, b, ARMIES_DEMO.sides)))
            .digest('hex')
            .slice(0, 16),
          `${k} ${n}`,
        ).toBe(want[k][n - 1])
      }
    }
  })
  it('fields 40 a side on the demo map: the close reserves behind, never ahead of a line, clear of every other box', () => {
    const bs = layout(40, drill, demo, ARMIES_DEMO.sides)
    const e = extents(drill)
    for (const s of [0, 1]) expect(bs.filter(b => b.side === s).length).toBe(40)
    const back = (b: (typeof bs)[0]) => Math.abs(b.z)
    const lines = bs.filter(b => !b.reserve)
    for (const b of bs) {
      expect(Math.abs(b.x) + (b.reserve ? e.columnHalf : e.halfFront)).toBeLessThanOrEqual(235)
      expect(Math.abs(b.z) + (b.reserve ? e.columnDepth : APPROACH + e.columnDepth)).toBeLessThanOrEqual(235)
    }
    // the men's own ground: a line's ranks (its full width) and its approach (its column's width); a column's
    const parts = (b: (typeof bs)[0]) =>
      b.reserve
        ? [{ w: e.columnHalf, f: back(b), d: e.columnDepth }]
        : [
            { w: e.halfFront, f: back(b), d: e.lineDepth },
            { w: e.columnHalf, f: back(b), d: APPROACH + e.columnDepth },
          ]
    for (const a of bs) {
      for (const b of bs) {
        if (a !== b && a.side === b.side) {
          for (const p of parts(a)) {
            for (const q of parts(b)) {
              expect(
                Math.abs(a.x - b.x) >= p.w + q.w || p.f + p.d <= q.f || q.f + q.d <= p.f,
                `${a.x},${a.z} / ${b.x},${b.z}`,
              ).toBe(true)
            }
          }
        }
      }
    }
    for (const r of bs.filter(b => b.reserve)) {
      for (const l of lines) {
        if (l.side === r.side && Math.abs(l.x - r.x) < e.halfFront + e.columnHalf) {
          expect(back(r)).toBeGreaterThan(back(l))
        }
      }
    }
    // every man of a reserve on open ground
    const sl = slots(drill)
    for (const b of bs) {
      if (b.reserve) {
        for (const [px, pz] of sl.column) {
          const c = Math.cos(b.heading)
          expect(demo(b.x + c * px, b.z + c * pz)).toBe(false)
        }
      }
    }
    // and no deploying man's path (his column place to his line place) within a metre of a reserve's column
    for (const l of lines) {
      for (let i = 0; i < sl.line.length; i++) {
        for (let k = 0; k <= 10; k++) {
          const c = Math.cos(l.heading)
          const lx = sl.column[i][0] + ((sl.line[i][0] - sl.column[i][0]) * k) / 10
          const lz = sl.column[i][1] + ((sl.line[i][1] - sl.column[i][1]) * k) / 10
          const x = l.x + c * lx
          const z = l.z + c * lz
          for (const r of bs) {
            if (r.reserve && r.side === l.side) {
              const rc = Math.cos(r.heading)
              const ax = rc * (x - r.x)
              const az = rc * (z - r.z)
              expect(
                Math.abs(ax) > e.columnHalf + 1 || az > 1 || az < -e.columnDepth - 1,
                `${l.x},${l.z} man ${i} / ${r.x},${r.z}`,
              ).toBe(true)
            }
          }
        }
      }
    }
  })
  it('keeps off the blocked ground', () => {
    const wood = (x: number, z: number) => open(x, z) || (Math.abs(x) < 60 && Math.abs(z) < 200)
    for (const b of layout(4, drill, wood, ARMIES_DEMO.sides)) expect(Math.abs(b.x)).toBeGreaterThan(60)
  })
  it('fails loudly when a side has no room', () => {
    expect(() => layout(2, drill, (_x, z) => z > 0, ARMIES_DEMO.sides)).toThrow(
      /room for only 0 of 2 battalions for side 1/,
    )
  })
  it('has a colour for every role of the figure, for every uniform, and a flag', () => {
    const d = decodeUnits(
      new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer,
    )
    for (const u of Object.values(UNIFORMS)) {
      for (const r of d.palette) expect(u.colours[r], `${u.id}.${r}`).toMatch(/^#[0-9A-F]{6}$/i)
      expect(u.flag.length).toBeGreaterThan(0)
      for (const c of u.flag) expect(c).toMatch(/^#[0-9A-F]{6}$/i)
    }
    for (const id of ARMIES_DEMO.sides) expect(UNIFORMS[id], id).toBeDefined()
  })
})

describe('armies: the far palette', () => {
  it('paints the far roles in the coat a value step down, the rest as the uniform', () => {
    for (const u of Object.values(UNIFORMS)) {
      const f = farPalette(u.colours)
      const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
      for (const [r, k] of Object.entries(FAR_ROLES)) {
        for (let i = 0; i < 3; i++) expect(ch(f[r], i)).toBe(Math.round(ch(u.colours.coat, i) * k))
      }
      for (const r of Object.keys(u.colours)) if (!(r in FAR_ROLES)) expect(f[r]).toBe(u.colours[r])
    }
  })
  it('takes the coat from far off for a dark coat, keeps a light one, and an explicit rule wins', () => {
    expect([luminance('#000000'), luminance('#FFFFFF')]).toEqual([0, 1])
    expect(luminance('#767676')).toBeCloseTo(FAR_COAT_BELOW, 2)
    const u = (coat: string, far?: 'coat' | 'own') => ({ id: 'x', colours: { coat }, flag: [], far })
    expect([
      farRule(u('#2C4FA8')),
      farRule(u('#E9E3D3')),
      farRule(u('#E9E3D3', 'coat')),
      farRule(u('#2C4FA8', 'own')),
    ]).toEqual(['coat', 'own', 'coat', 'own'])
  })
})

// a mesh's signed volume by the right hand, Σ p0 · (p1 × p2) / 6: negative when its fronts are Babylon's
function signedVolume(pos: Float32Array, idx: Uint16Array): number {
  let s = 0
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3]
    const cx = pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]
    const cy = pos[b + 2] * pos[c] - pos[b] * pos[c + 2]
    const cz = pos[b] * pos[c + 1] - pos[b + 1] * pos[c]
    s += pos[a] * cx + pos[a + 1] * cy + pos[a + 2] * cz
  }
  return s / 6
}
const cross3 = (p: number[], q: number[]) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
]
// the share of a LOD's head (its bone named …Head) that is skin, seen orthographically along f (from the eye into the
// figure, its rest pose) with the back faces culled as Babylon culls them (drawn when the right-hand normal points
// away from the eye): a 128² depth buffer over a 0.5 m square round the head's height
function headSkinSeen(d: UnitData, lod: string, f: number[]): number {
  const m = d.mesh[lod]
  const head = d.bones.findIndex(b => /Head$/.test(b))
  const skin = d.palette.indexOf('skin')
  const r = [f[2], 0, -f[0]]
  const u = cross3(r, f)
  const res = 128
  const depth = new Float64Array(res * res).fill(Infinity)
  const id = new Int32Array(res * res).fill(-1)
  const nv = m.positions.length / 3
  const px = new Float64Array(nv * 3)
  for (let v = 0; v < nv; v++) {
    const p = [m.positions[v * 3], m.positions[v * 3 + 1] - 1.62, m.positions[v * 3 + 2]]
    const dot = (a: number[]) => p[0] * a[0] + p[1] * a[1] + p[2] * a[2]
    px[v * 3] = (dot(r) / 0.5 + 0.5) * res
    px[v * 3 + 1] = (dot(u) / 0.5 + 0.5) * res
    px[v * 3 + 2] = dot(f)
  }
  for (let t = 0; t < m.indices.length / 3; t++) {
    const [a, b, c] = [0, 1, 2].map(k => m.indices[t * 3 + k] * 3)
    const Q = (i: number) => [0, 1, 2].map(k => m.positions[i + k])
    const [pa, pb, pc] = [Q(a), Q(b), Q(c)]
    const n = cross3(
      pb.map((x, k) => x - pa[k]),
      pc.map((x, k) => x - pa[k]),
    )
    if (n[0] * f[0] + n[1] * f[1] + n[2] * f[2] <= 0) continue // a back face
    const ar = (px[b] - px[a]) * (px[c + 1] - px[a + 1]) - (px[c] - px[a]) * (px[b + 1] - px[a + 1])
    if (Math.abs(ar) < 1e-12) continue
    const y0 = Math.max(0, Math.floor(Math.min(px[a + 1], px[b + 1], px[c + 1])))
    const y1 = Math.min(res - 1, Math.ceil(Math.max(px[a + 1], px[b + 1], px[c + 1])))
    const x0 = Math.max(0, Math.floor(Math.min(px[a], px[b], px[c])))
    const x1 = Math.min(res - 1, Math.ceil(Math.max(px[a], px[b], px[c])))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5
        const qy = y + 0.5
        const w0 = ((px[b] - qx) * (px[c + 1] - qy) - (px[c] - qx) * (px[b + 1] - qy)) / ar
        const w1 = ((px[c] - qx) * (px[a + 1] - qy) - (px[a] - qx) * (px[c + 1] - qy)) / ar
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue
        const z = w0 * px[a + 2] + w1 * px[b + 2] + (1 - w0 - w1) * px[c + 2]
        if (z < depth[y * res + x]) {
          depth[y * res + x] = z
          id[y * res + x] = t
        }
      }
    }
  }
  let all = 0
  let sk = 0
  for (const t of id) {
    if (t < 0) continue
    const v = m.indices[t * 3]
    let bi = 0
    for (let i = 1; i < 4; i++) if (m.boneWeights[v * 4 + i] > m.boneWeights[v * 4 + bi]) bi = i
    if (m.boneIndices[v * 4 + bi] !== head) continue
    all++
    if (m.roles[v] === skin) sk++
  }
  return sk / all
}

describe('the figure parts at the ground (boneParts, #165)', () => {
  // a made-up figure: a torso (0.6 to 1.4 m), a shin under it (0.15 to 0.55 m), a foot under the shin on the ground,
  // and a hem hung from the torso down to the ground beside it; the foot and the hem too small to be parts
  const bones = ['Torso', 'Shin', 'Foot', 'Hem']
  const parents = [-1, 0, 1, 0]
  const pos: number[] = []
  const bone: number[] = []
  const add = (b: number, x: number, y: number, z: number) => {
    pos.push(x, y, z)
    bone.push(b)
  }
  for (let i = 0; i < 12; i++) add(0, (i % 2) * 0.3 - 0.15, 0.6 + (i / 11) * 0.8, (i % 3) * 0.1 - 0.1)
  for (let i = 0; i < 10; i++) add(1, 0.1 + (i % 2) * 0.05, 0.15 + (i / 9) * 0.4, (i % 3) * 0.04)
  for (let i = 0; i < 4; i++) add(2, 0.1 + (i % 2) * 0.05, 0.02, 0.05 + i * 0.03)
  for (let i = 0; i < 4; i++) add(3, -0.25, 0.05 + i * 0.1, 0.1)
  const n = bone.length
  const bi = new Uint8Array(n * 4)
  const bw = new Float32Array(n * 4)
  bone.forEach((b, v) => {
    bi[v * 4] = b
    bw[v * 4] = 1
  })
  const fig = {
    bones,
    parents,
    mesh: { body: { positions: Float32Array.from(pos), boneIndices: bi, boneWeights: bw } },
  } as unknown as UnitData
  const lowestOf = (p: Part) => {
    const ends = [p.t0, p.t1].map(t => p.c[1] + p.ax[1] * t)
    return Math.min(...ends)
  }
  it('runs the shin down to the foot on the ground, and not the torso down to the hem', () => {
    const parts = boneParts(fig, 'body')
    expect(parts.map(p => bones[p.bone])).toEqual(['Torso', 'Shin'])
    const [torso, shin] = parts
    expect(lowestOf(shin)).toBeLessThan(0.05)
    expect(shin.lent.length).toBe(4)
    expect(lowestOf(torso)).toBeGreaterThan(0.55)
    expect(torso.lent.length).toBe(0)
  })
})

describe('the figure (fr-line-infantry.unitdata)', () => {
  const d = decodeUnits(
    new Uint8Array(readFileSync(new URL('../data/figures/fr-line-infantry.unitdata', import.meta.url))).buffer,
  )
  it('decodes whole, with a clip range for every role the script gives', () => {
    for (const r of ['halt', 'march', 'run', 'fire']) expect(d.ranges[r], r).toBeDefined()
    expect(d.ranges.march.speed).toBeGreaterThan(0.5)
    expect(d.ranges.run.speed).toBeGreaterThan(d.ranges.march.speed)
  })
  it('poses the far LOD at every step: on its feet, a figure tall, its normals not degenerate', () => {
    const l = d.lods[d.lods.length - 1]
    const p = posedVertices(d, l.name)
    const nv = l.vertices
    expect([p.width, p.height]).toEqual([nv * 2, d.vat.height])
    for (const f of [0, d.ranges.march.start + 3, d.ranges.fire.end - 1]) {
      let lo = Infinity
      let hi = -Infinity
      for (let v = 0; v < nv; v++) {
        const o = (f * nv * 2 + v * 2) * 4
        lo = Math.min(lo, p.data[o + 1])
        hi = Math.max(hi, p.data[o + 1])
        // (blended: shorter, units.vert normalizes)
        expect(Math.hypot(p.data[o + 4], p.data[o + 5], p.data[o + 6])).toBeGreaterThan(0.5)
      }
      // m: a man, his bayonet up
      expect(lo).toBeGreaterThan(-0.1)
      expect(hi - lo).toBeGreaterThan(1.6)
      expect(hi - lo).toBeLessThan(2.8)
    }
    expect([fromHalf(0x3c00), fromHalf(0xc000), fromHalf(0x0001)]).toEqual([1, -2, 2 ** -24])
  })
  it("has a tiny LOD of boxes on its parts: under a quarter of the far LOD's vertices, each corner on one bone, a mix of roles, fronts out, a figure tall", () => {
    const t = tinyMesh(d, d.lods[d.lods.length - 1].name)
    const n = t.positions.length / 3
    // eight corners, twelve triangles a box
    expect(n % 8).toBe(0)
    expect(t.indices.length).toBe((n / 8) * 36)
    expect(n).toBeLessThan(d.lods[d.lods.length - 1].vertices / 4)
    for (let v = 0; v < n; v++) {
      expect(t.boneWeights[v * 4]).toBe(1)
      expect(t.roles[v]).toBeLessThan(d.palette.length)
      let sum = 0
      for (let i = 0; i < TINY_ROLES; i++) {
        const w = t.weights[v * TINY_ROLES + i]
        expect(w).toBeGreaterThanOrEqual(0)
        if (i >= d.palette.length) expect(w).toBe(0)
        sum += w
      }
      expect(sum).toBeCloseTo(1, 5) // (a mix of the roles: its box's mean colour from above)
    }
    expect(new Set(t.roles).size).toBeGreaterThanOrEqual(4) // (the roles that read from far off show on it)
    // every triangle's front faces out of its box: Babylon's clockwise fronts, the right-hand normal in (#164)
    for (let k = 0; k < t.indices.length; k += 3) {
      const box = Math.floor(t.indices[k] / 8)
      const P = (i: number) => [0, 1, 2].map(j => t.positions[i * 3 + j])
      const c = [0, 1, 2].map(j => {
        let a = 0
        for (let i = 0; i < 8; i++) a += t.positions[(box * 8 + i) * 3 + j]
        return a / 8
      })
      const [a, b, e] = [P(t.indices[k]), P(t.indices[k + 1]), P(t.indices[k + 2])]
      const u = [0, 1, 2].map(j => b[j] - a[j])
      const w = [0, 1, 2].map(j => e[j] - a[j])
      const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
      expect(nn[0] * (a[0] - c[0]) + nn[1] * (a[1] - c[1]) + nn[2] * (a[2] - c[2])).toBeLessThan(0)
    }
    const q = posedMesh(d, t)
    const f = d.ranges.halt.start
    let lo = Infinity
    let hi = -Infinity
    for (let v = 0; v < n; v++) {
      const y = q.data[(f * n * 2 + v * 2) * 4 + 1]
      lo = Math.min(lo, y)
      hi = Math.max(hi, y)
    }
    expect(hi - lo).toBeGreaterThan(1.4)
    expect(lo).toBeLessThan(0.3)
  })
  it('has a shadow proxy of crossed quads, each corner wholly on one bone, a figure tall when posed', () => {
    const p = shadowProxy(d, d.lods[d.lods.length - 1].name)
    const n = p.positions.length / 3
    expect(p.indices.length / 3).toBeLessThanOrEqual(64)
    expect(p.indices.length / 3).toBeGreaterThanOrEqual(40)
    expect((n * 6) / 4).toBe(p.indices.length) // four corners, two triangles a quad
    for (let v = 0; v < n; v++) {
      expect(p.boneWeights[v * 4]).toBe(1)
      expect(p.boneIndices[v * 4]).toBeLessThan(d.bones.length)
    }
    const q = posedMesh(d, p)
    const f = d.ranges.halt.start
    let lo = Infinity
    let hi = -Infinity
    for (let v = 0; v < n; v++) {
      const y = q.data[(f * n * 2 + v * 2) * 4 + 1]
      lo = Math.min(lo, y)
      hi = Math.max(hi, y)
    }
    expect(hi - lo).toBeGreaterThan(1.4)
    expect(lo).toBeLessThan(0.3)
  })
  it('is wound for Babylon: each LOD a negative signed volume by the right hand, so no man is inside out (#164)', () => {
    // Babylon (left-handed) draws clockwise fronts: a front triangle's right-hand normal points into the figure, so
    // Σ p0 · (p1 × p2) over the mesh is negative (the bake reversed them once: every man inside out, a face on the
    // back of his head)
    for (const l of d.lods) {
      expect(signedVolume(d.mesh[l.name].positions, d.mesh[l.name].indices), l.name).toBeLessThan(0)
    }
  })
  it('shows its face from the front and not from behind, drawn as Babylon culls (#164)', () => {
    // the LODs whose head has a face to show (the far LOD's head is 20 triangles); the back at +z
    for (const l of d.lods.filter(x => x.triangles > 1000)) {
      const behind = headSkinSeen(d, l.name, [0, -0.3, -1])
      const front = headSkinSeen(d, l.name, [0, -0.3, 1])
      expect(behind, `${l.name} from behind`).toBeLessThan(0.15)
      expect(front, `${l.name} from the front`).toBeGreaterThan(2 * behind)
    }
  })
  it('casts its shadow from the soles: the proxy reaches the ground in every baked step (#165)', () => {
    // the proxy's lowest point against each LOD's soles, at every step of every role: no more than 4 cm above (it
    // stood at the ankles, 13 cm up: the shadows started 26 cm off the feet at a 27° sun), nor deep under the ground
    const p = shadowProxy(d, d.lods[d.lods.length - 1].name)
    const q = posedMesh(d, p)
    const n = p.positions.length / 3
    for (const l of d.lods) {
      const pv = posedVertices(d, l.name)
      const nv = l.vertices
      for (const [role, r] of Object.entries(d.ranges)) {
        for (let f = r.start; f <= r.end; f++) {
          let lo = Infinity
          let plo = Infinity
          for (let v = 0; v < nv; v++) lo = Math.min(lo, pv.data[(f * nv * 2 + v * 2) * 4 + 1])
          for (let v = 0; v < n; v++) plo = Math.min(plo, q.data[(f * n * 2 + v * 2) * 4 + 1])
          expect(plo - lo, `${l.name} ${role} step ${f}`).toBeLessThan(0.04)
          expect(plo - lo).toBeGreaterThan(-0.1)
        }
      }
    }
  })
  it('refuses the inside-out version 2 data, telling to rebake (#164)', () => {
    expect(() => checkUnits({ ...d, version: 2 })).toThrow(/version 2.*inside out.*rebake/)
  })
  it('has three LODs nearest first, each lighter: the full figure nearest', () => {
    expect(d.lods.map(l => l.name)).toEqual(['lod0', 'lod1', 'lod2'])
    expect(d.lods[0].triangles).toBeGreaterThan(9000)
    expect(d.lods[1].triangles).toBeLessThan(d.lods[0].triangles)
    expect(d.lods[2].triangles).toBeLessThan(d.lods[1].triangles)
    const bad = { ...d, lods: [d.lods[1], d.lods[0], d.lods[2]] }
    expect(() => checkUnits(bad)).toThrow(/not lighter/)
  })
  it("casts one simple shadow a role and a facing: from his feet away from the sun, a man's shadow long, soft (decision 0049)", () => {
    const l = Math.hypot(-0.7, 0.45, 0.55)
    const sun = [-0.7 / l, 0.45 / l, 0.55 / l] as const
    const roles = ['halt', 'march', 'run', 'fire']
    const s = shadowShape(d, d.lods[d.lods.length - 1].name, sun, roles, { facings: 8 })
    expect([s.width, s.height]).toEqual([s.cellW * 8, s.cellH * 4])
    expect(s.data.length).toBe(s.width * s.height)
    expect(Math.hypot(...s.dir)).toBeCloseTo(1, 6)
    // away from the sun
    expect(s.dir[0] * sun[0] + s.dir[1] * sun[2]).toBeLessThan(0)
    const tanE = sun[1] / Math.hypot(sun[0], sun[2])
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 8; k++) {
        let mass = 0
        let far = -Infinity
        let soft = 0
        for (let j = 0; j < s.cellH; j++) {
          for (let i = 0; i < s.cellW; i++) {
            const v = s.data[(r * s.cellH + j) * s.width + k * s.cellW + i]
            // (the border: no bleed between cells)
            if (i < s.margin || j < s.margin || i >= s.cellW - s.margin || j >= s.cellH - s.margin) {
              expect(v).toBe(0)
              continue
            }
            mass += v / 255
            if (v > 0 && v < 200) soft++
            if (v > 128) far = Math.max(far, s.along[0] + (j - s.margin + 0.5) * s.texel)
          }
        }
        // a man's shadow: about his height over the sun's tangent (1.8 m at 27°: 3.5 m), its area some tenths of a m²
        expect(far, `${roles[r]} ${k}`).toBeGreaterThan(1.4 / tanE)
        expect(far).toBeLessThan(2.9 / tanE)
        expect(mass * s.texel ** 2).toBeGreaterThan(0.25)
        expect(mass * s.texel ** 2).toBeLessThan(2)
        expect(soft).toBeGreaterThan(0)
      }
    }
    expect(() => shadowShape(d, d.lods[d.lods.length - 1].name, [1, 0, 0], roles)).toThrow(/horizon/)
  })
})
