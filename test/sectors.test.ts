// The sectors model's properties P-1 to P-17 (docs/proposals/sectors-model.md, §§ 2–4), on the shipped ruleset's
// formations and on points and blocks sampled from a keyed stream (the same every run).
import { describe, it, expect } from 'vitest'
import { Sim, OPEN_DATA, openBattlefield } from './fx.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
import {
  blockGeometry,
  buildFaces,
  pointWeights,
  threatWeights,
  keyedStream,
  nextUnit,
  FACE_ALL,
  FACE_NONE,
  FACE_ONE,
  FACE_TRAIL,
  type World,
  type FireGeo,
  type Faces,
} from '../src/sim/index.ts'
import { FULL } from '../src/scenarios/sizes.ts'

const FIELD = openBattlefield()
const D = Math.PI / 180

// a world with one formation of `shape` at the origin facing north (+z), and its geometry and faces built
function one(shape: string, men: number = FULL.infantry, unit?: string, settle = 1) {
  const s = new Sim(1, napoleonic, FIELD, OPEN_DATA)
  const h = s.spawn(0, 0, 0, shape, men, 0, unit)
  s.advance(settle)
  return { s, h, j: s.slot(h), ...built(s.w) }
}
function built(w: World): { G: FireGeo; F: Faces } {
  const G = blockGeometry(w)
  return { G, F: buildFaces(w, G) }
}
const wt = (w: World, j: number, x: number, z: number) => Array.from(pointWeights(w, j, x, z, new Float64Array(3)))
// a sampler: n numbers in [lo, hi) from a fixed keyed stream
function sampler(key: number) {
  const rs = keyedStream(new Uint32Array(4), 7, key, 1, 2, 3)
  return (lo: number, hi: number) => lo + (hi - lo) * nextUnit(rs)
}
// a point at distance d and angle a (radians, from straight ahead, positive to the right) from the line's right end
const fromEnd = (F: Faces, j: number, d: number, a: number): [number, number] => [
  F.R[2 * j] + d * Math.sin(a),
  F.F[2 * j] + d * Math.cos(a),
]

describe('the face (§ 2)', () => {
  it('P-1: a line spans its companies with men, each side on its own', () => {
    const { s, j, F } = one('line')
    const [L, R] = [F.L[2 * j], F.R[2 * j]]
    expect(F.kind[j]).toBe(FACE_ONE)
    expect(R - L).toBeGreaterThan(50)
    // the two left-hand sections lose their men
    const CS = s.w.cr.maxC
    s.w.f.men[j * CS] = 0
    s.w.f.men[j * CS + 1] = 0
    const G = built(s.w).F
    expect(G.L[2 * j]).toBeGreaterThan(L + 25)
    expect(G.R[2 * j]).toBe(R)
  })
  it('P-2: a face is read where the formation now stands', () => {
    const { s, j } = one('line')
    s.w.f.z[j] += 20
    const { F } = built(s.w)
    expect(F.oz[2 * j]).toBeCloseTo(s.w.f.z[j], 9)
    expect(F.oz[2 * j] + F.F[2 * j]).toBeGreaterThan(19)
  })
  it('P-3: a march column has a narrow head across its facing, whatever its blocks rotation', () => {
    const { j, F } = one('march')
    expect(F.kind[j]).toBe(FACE_TRAIL)
    expect(F.R[2 * j] - F.L[2 * j]).toBeLessThan(5)
    expect(F.F[2 * j]).toBeGreaterThan(F.B[2 * j])
    // the tail lies behind the head
    expect(F.oz[2 * j + 1]).toBeLessThan(F.oz[2 * j] - 20)
  })
  it('P-3b: a formation changing shape is never front', () => {
    const { s, h, j } = one('line')
    s.order({ type: 'form', id: h, shape: 'column' })
    s.advance(2)
    expect(s.w.f.trans[j]).toBe(1)
    const { F } = built(s.w)
    expect(F.kind[j]).toBe(FACE_NONE)
    const at = sampler(31)
    for (let n = 0; n < 2000; n++) expect(wt(s.w, j, at(-300, 300), at(-300, 300))[0]).toBe(0)
  })
})

describe('the weight of a point (§ 3)', () => {
  const shapes: [string, number, string | undefined][] = [
    ['line', FULL.infantry, undefined],
    ['column', FULL.infantry, undefined],
    ['march', FULL.infantry, undefined],
    ['square', FULL.infantry, undefined],
    ['line', FULL.cavalry, 'cavalry'],
    ['unlimbered', FULL.battery, 'battery'],
    ['limbered', FULL.battery, 'battery'],
  ]
  it('P-4: each weight in 0..1, summing to 1, for every kind', () => {
    for (const [shape, men, unit] of shapes) {
      const { s, j } = one(shape, men, unit)
      const at = sampler(41)
      for (let n = 0; n < 3000; n++) {
        const [a, b, c] = wt(s.w, j, at(-400, 400), at(-400, 400))
        for (const v of [a, b, c]) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
        expect(Math.abs(a + b + c - 1)).toBeLessThan(1e-12)
      }
    }
  })
  it('P-5: straight ahead within the width is front 1 at any distance, contact included', () => {
    const { s, j, F } = one('line')
    const at = sampler(51)
    for (let n = 0; n < 2000; n++) {
      const x = at(F.L[2 * j], F.R[2 * j])
      expect(wt(s.w, j, x, F.F[2 * j] + at(0, 300))[0]).toBe(1)
    }
  })
  it("P-6: on its flankFrom's line from the nearer end front is half, inside the blend front, past it flank", () => {
    // the blend's band as angles off straight ahead: t = tan a / (1 + tan a)
    const H = napoleonic.sectors.blend.H
    const angle = (t: number) => Math.atan(t / (1 - t))
    // the line flanked from 80°; cavalry on the ruleset's blend, 45° (35° to 55°)
    for (const [shape, men, unit, deg] of [
      ['line', FULL.infantry, undefined, 80],
      ['line', FULL.cavalry, 'cavalry', 45],
    ] as const) {
      const { s, j, F } = one(shape, men, unit)
      const T = Math.tan(deg * D) / (1 + Math.tan(deg * D))
      for (const d of [50, 100, 200, 300]) {
        // the corner's metre moves a steep line's half the more (at 80°: by 0.08 at 50 m, 0.02 at 200 m)
        const tol = deg < 60 ? (d >= 150 ? 0.02 : 0.05) : d >= 150 ? 0.03 : d >= 100 ? 0.05 : 0.1
        expect(Math.abs(wt(s.w, j, ...fromEnd(F, j, d, deg * D))[0] - 0.5)).toBeLessThan(tol)
        expect(wt(s.w, j, ...fromEnd(F, j, d, angle(T - H) - D))[0]).toBeGreaterThan(1 - tol)
        expect(wt(s.w, j, ...fromEnd(F, j, d, angle(T + H) + D))[0]).toBeLessThan(tol)
      }
    }
  })
  it('P-7: at range the weights hardly change with scale', () => {
    const { s, j, F } = one('line')
    const at = sampler(71)
    for (let n = 0; n < 2000; n++) {
      const a = at(0, 89) * D
      const d = at(150, 400)
      const k = at(1, 3)
      const w1 = wt(s.w, j, ...fromEnd(F, j, d, a))[0]
      const w2 = wt(s.w, j, ...fromEnd(F, j, d * k, a))[0]
      expect(Math.abs(w1 - w2)).toBeLessThan(0.02)
    }
  })
  it('P-8: a point and its mirror across the centre line weigh the same', () => {
    const { s, j } = one('line')
    const at = sampler(81)
    for (let n = 0; n < 2000; n++) {
      const x = at(-300, 300)
      const z = at(-300, 300)
      const p = wt(s.w, j, x, z)
      const q = wt(s.w, j, -x, z)
      for (let k = 0; k < 3; k++) expect(Math.abs(p[k] - q[k])).toBeLessThan(1e-9)
    }
  })
  it('P-9: walking round the end at a fixed distance, front never rises and flank never falls until the rear', () => {
    const { s, j, F } = one('line')
    for (const d of [3, 20, 100, 250]) {
      let last = [1, 0, 0]
      for (let deg = 0; deg <= 90; deg += 0.5) {
        const p = wt(s.w, j, ...fromEnd(F, j, d, deg * D))
        expect(p[0]).toBeLessThanOrEqual(last[0] + 1e-12)
        expect(p[1]).toBeGreaterThanOrEqual(last[1] - 1e-12)
        last = p
      }
    }
  })
  it('P-10: a point moved 0.1 m changes its weights by at most 0.2', () => {
    for (const [shape, men, unit] of shapes) {
      const { s, j } = one(shape, men, unit)
      const at = sampler(101)
      let worst = 0
      for (let n = 0; n < 4000; n++) {
        const x = at(-120, 120)
        const z = at(-160, 60)
        const a = at(0, 2 * Math.PI)
        const p = wt(s.w, j, x, z)
        const q = wt(s.w, j, x + 0.1 * Math.sin(a), z + 0.1 * Math.cos(a))
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(p[k] - q[k]))
      }
      expect(worst, `${unit ?? 'inf'} ${shape}`).toBeLessThanOrEqual(0.2)
    }
  })
  it('P-11: a square is front from every side, corners included', () => {
    const { s, j, F } = one('square')
    expect(F.kind[j]).toBe(FACE_ALL)
    const at = sampler(111)
    for (let n = 0; n < 1000; n++) expect(wt(s.w, j, at(-200, 200), at(-200, 200))).toEqual([1, 0, 0])
  })
  it('P-12 (A-04): 60° off the centre of a 54 m line, within 50 m, is front', () => {
    const { s, j } = one('line')
    for (const r of [20, 35, 50]) expect(wt(s.w, j, r * Math.sin(60 * D), r * Math.cos(60 * D))[0]).toBe(1)
  })
  it('P-13: a march column is front ahead of its head, flank abreast of its body, rear behind its tail', () => {
    const { s, j, F } = one('march')
    const headZ = F.oz[2 * j] + F.F[2 * j]
    const tailZ = F.oz[2 * j + 1] + F.B[2 * j + 1]
    expect(wt(s.w, j, F.ox[2 * j], headZ + 50)[0]).toBe(1)
    for (const x of [-60, 60]) expect(wt(s.w, j, x, (headZ + tailZ) / 2)[1]).toBe(1)
    expect(wt(s.w, j, F.ox[2 * j + 1], tailZ - 50)[2]).toBe(1)
  })
})

describe('the weight of a threat (§ 4)', () => {
  // formation j, a line at the origin facing north, and a threat formation of `shape` at (x, z) heading h
  function pair(x: number, z: number, h: number, shape = 'line', unit?: string, men: number = FULL.infantry) {
    const s = new Sim(1, napoleonic, FIELD, OPEN_DATA)
    const a = s.spawn(0, 0, 0, 'line', FULL.infantry, 0)
    const b = s.spawn(x, z, h, shape, men, 1, unit)
    const { G } = built(s.w)
    return { s, G, j: s.slot(a), i: s.slot(b) }
  }
  // threat weights of every company of i with men, one array per company
  function each(s: Sim, G: FireGeo, j: number, i: number) {
    const CS = s.w.cr.maxC
    const out: number[][] = []
    for (let c = 0; c < s.w.cr.types[s.w.f.type[i]].C; c++) {
      if (s.w.f.men[i * CS + c] <= 0) continue
      out.push(Array.from(threatWeights(s.w, G, j, i, i * CS + c, new Float64Array(3))))
    }
    return out
  }
  it('P-14: a line straight ahead within the width is front 1; at contact a block over the end in proportion', () => {
    const a = pair(0, 100, Math.PI)
    for (const p of each(a.s, a.G, a.j, a.i)) expect(p[0]).toBe(1)
    // a squadron line 2 m ahead, offset so its second squadron overlaps the end by part of its width
    const b = pair(20, 6, Math.PI, 'line', 'cavalry', FULL.cavalry)
    const ws = each(b.s, b.G, b.j, b.i).map(p => p[0])
    expect(Math.min(...ws)).toBeLessThan(1)
    expect(Math.max(...ws)).toBe(1)
  })
  it('P-15: a squadron striking a line end at right angles is flank', () => {
    // cavalry in line facing west, its line of squadrons along z, its front 1 m beyond the line's east end
    const { s, G, j, i } = pair(0, 0, -Math.PI / 2, 'line', 'cavalry', FULL.cavalry)
    const R = buildFaces(s.w, G).R[2 * j]
    s.w.f.x[i] = R + 2
    // its two squadrons stand 10.5 m either side of its anchor: the second one's centre on the line's mid-depth
    s.w.f.z[i] = (buildFaces(s.w, G).F[2 * j] + buildFaces(s.w, G).B[2 * j]) / 2 - 10.5
    const G2 = built(s.w).G
    // the squadron whose frontage crosses the line's depth, beside its end, is flank; those ahead or behind are not
    const flanks = each(s, G2, j, i).map(p => p[1])
    expect(Math.max(...flanks)).toBeGreaterThan(0.99)
  })
  it('P-16: a block moved 0.1 m changes its weights by at most 0.05', () => {
    const at = sampler(161)
    let worst = 0
    for (let n = 0; n < 300; n++) {
      const x = at(-120, 120)
      const z = at(12, 80)
      const h = at(0, 2 * Math.PI)
      const a = pair(x, z, h, 'line', 'cavalry', FULL.cavalry)
      const p = each(a.s, a.G, a.j, a.i)
      const t = at(0, 2 * Math.PI)
      a.s.w.f.x[a.i] += 0.1 * Math.sin(t)
      a.s.w.f.z[a.i] += 0.1 * Math.cos(t)
      const q = each(a.s, built(a.s.w).G, a.j, a.i)
      for (let c = 0; c < p.length; c++) {
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(p[c][k] - q[c][k]))
      }
    }
    expect(worst).toBeLessThanOrEqual(0.05)
  })
  it('P-17: the same weights every run', () => {
    const a = pair(70, 30, 2.4, 'line', 'cavalry', FULL.cavalry)
    const b = pair(70, 30, 2.4, 'line', 'cavalry', FULL.cavalry)
    expect(each(a.s, a.G, a.j, a.i)).toEqual(each(b.s, b.G, b.j, b.i))
  })
})
