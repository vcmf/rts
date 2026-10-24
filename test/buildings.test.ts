// The buildings' placement (docs/plans/done/buildings.md): the gap between two paved yards (convex polygons) is 0
// where they overlap or cross and the edges' least distance otherwise, and the authored buildings' yards keep at least
// PAVE_GAP apart (the cover's authoring fails otherwise: src/look/world/cover.ts). The turn is Babylon's instance yaw:
// toWorld matches its Matrix, toLocal undoes it, and a house's yard lies before its door at every quarter turn
import { describe, expect, it } from 'vitest'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import fs from 'node:fs'
import {
  BUILDINGS,
  FOOT,
  PAVE,
  PAVE_EDGE,
  PAVE_GAP,
  PAVE_INNER,
  PAVE_REACH,
  PAVE_WOB,
  PAVE_WOBBLE,
  paveSdf,
  pavePoly,
  polyGap,
  toLocal,
  toWorld,
  type Building,
} from '../src/look/world/buildings.ts'

const box = (x: number, z: number, hx: number, hz: number): [number, number][] => [
  [x - hx, z - hz],
  [x + hx, z - hz],
  [x + hx, z + hz],
  [x - hx, z + hz],
]

describe('the yards', () => {
  it('measures the gap between two yards', () => {
    expect(polyGap(box(0, 0, 2, 2), box(1, 1, 2, 2))).toBe(0) // a corner of one in the other
    expect(polyGap(box(0, 0, 5, 1), box(0, 0, 1, 5))).toBe(0) // crossing as a plus: no corner in the other
    expect(polyGap(box(0, 0, 2, 2), box(10, 0, 2, 2))).toBeCloseTo(6)
    expect(polyGap(box(0, 0, 2, 2), box(5, 5, 1, 1))).toBeCloseTo(Math.hypot(2, 2))
  })
  it('keeps the authored yards apart', () => {
    const p = BUILDINGS.map(pavePoly)
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) expect(polyGap(p[i], p[j])).toBeGreaterThanOrEqual(PAVE_GAP)
    }
  })
})

// the paving's edge (shore.glsl, pavePaint): k = 1 − smoothstep(PAVE_EDGE, d + wobble), the wobble within ± half the
// sum of PAVE_WOB. Whole (k exactly 1, the noises skipped) inside PAVE_INNER; gone (k 0) past PAVE_WOBBLE; the cover's
// marker reaches PAVE_REACH (test/cover.test.ts). A retuned edge must keep these, or a seam opens
describe("the paving's edge", () => {
  const amp = (PAVE_WOB[0] + PAVE_WOB[1]) / 2
  it('is whole inside PAVE_INNER and gone past PAVE_WOBBLE, within PAVE_REACH', () => {
    expect(PAVE_INNER + amp).toBeLessThanOrEqual(PAVE_EDGE[0])
    expect(PAVE_EDGE[1] + amp).toBeLessThanOrEqual(PAVE_WOBBLE)
    expect(PAVE_WOBBLE).toBeLessThanOrEqual(PAVE_REACH)
  })
  it("is the shader's: its constants as defines, not numbers of its own", () => {
    const src = fs.readFileSync('src/look/shaders/shore.glsl', 'utf8')
    const fn = src.slice(src.indexOf('vec3 pavePaint('), src.indexOf('vec3 roadPaint('))
    expect(fn).toContain('if(d>PAVE_INNER)')
    expect(fn).toContain('*PAVE_WOB.x')
    expect(fn).toContain('*PAVE_WOB.y')
    expect(fn).toContain('smoothstep(PAVE_EDGE.x,PAVE_EDGE.y,')
    expect(fn).toContain('if(d>PAVE_REACH)return c;')
  })
})

describe('the turn', () => {
  it('is Babylon instance yaw', () => {
    for (const yaw of [-Math.PI / 2, -0.3, 0, 0.3, Math.PI / 2, 2.9]) {
      const q = new Quaternion()
      const m = new Matrix()
      Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, q)
      Matrix.ComposeToRef(new Vector3(1, 1, 1), q, Vector3.Zero(), m)
      for (const [x, z] of [
        [1, 0],
        [0, -1],
        [2.5, 3.5],
      ]) {
        const v = Vector3.TransformCoordinates(new Vector3(x, 0, z), m)
        const [wx, wz] = toWorld(yaw, x, z)
        // (Babylon's matrices are float32)
        expect(wx).toBeCloseTo(v.x, 6)
        expect(wz).toBeCloseTo(v.z, 6)
        const [lx, lz] = toLocal(yaw, wx, wz)
        expect(lx).toBeCloseTo(x, 9)
        expect(lz).toBeCloseTo(z, 9)
      }
    }
  })
  it("puts a house's yard before its door at every quarter turn", () => {
    for (const k of [0, 1, 2, 3]) {
      const b: Building = { model: 'house', x: 0, z: 0, yaw: (k * Math.PI) / 2, scale: 1 }
      // (the door, local (0, −3.35): its yard reaches 10.4 m out, its back 6.9)
      const [fx, fz] = toWorld(b.yaw, 0, -9.5)
      const [bx, bz] = toWorld(b.yaw, 0, 9.5)
      expect(onPavingOf(b, fx, fz)).toBe(true)
      expect(onPavingOf(b, bx, bz)).toBe(false)
    }
  })
})
// (onPaving asks of the authored buildings: one house alone, by its polygon)
const onPavingOf = (b: Building, x: number, z: number) =>
  polyGap(pavePoly(b), [
    [x - 0.01, z - 0.01],
    [x + 0.01, z - 0.01],
    [x + 0.01, z + 0.01],
    [x - 0.01, z + 0.01],
  ]) === 0

describe("the yard's distance", () => {
  it("reaches further before the door than behind it, the shader's rounded box", () => {
    const b: Building = { model: 'house', x: 10, z: -5, yaw: 0.7, scale: 1.0 }
    const f = FOOT.house
    const p = PAVE.house
    const at = (lx: number, lz: number) => {
      const [x, z] = toWorld(b.yaw, lx, lz)
      return paveSdf(b, b.x + x, b.z + z)
    }
    // the yard's edges: its door's (local −z) at hz + front, its back at hz + side, its sides at hx + side
    expect(at(0, -(f.hz! + p.front))).toBeCloseTo(0, 6)
    expect(at(0, f.hz! + p.side)).toBeCloseTo(0, 6)
    expect(at(f.hx! + p.side, 0)).toBeCloseTo(0, 6)
    expect(at(0, -(f.hz! + p.front) - 2)).toBeCloseTo(2, 6)
    expect(at(0, 0)).toBeLessThan(0)
    // a point 8 m before the door is on the yard, 8 m behind is not
    expect(at(0, -8)).toBeLessThan(0)
    expect(at(0, 8)).toBeGreaterThan(0)
    // its corners rounded (1.5 m): the corner point itself lies outside by (√2 − 1)·1.5
    expect(at(f.hx! + p.side, f.hz! + p.side)).toBeCloseTo((Math.SQRT2 - 1) * 1.5, 6)
    const w: Building = { model: 'windmill', x: 0, z: 0, yaw: 2, scale: 1 }
    expect(paveSdf(w, FOOT.windmill.r! + PAVE.windmill.side, 0)).toBeCloseTo(0, 6)
  })
})

// the light atlas (src/look/building-light.ts): every instance's tile in a cell of its own, INSET texels from the cell's
// edge; the exported light UVs' islands at least MIN_GAP texels apart in a tile, every texel any part of a face touches
// counted (the bake draws a face's corners and edges too), so no read at MAX_LOD brings a neighbour's light in; the
// export's check (tools/building-to-js.py, light_gap) on the runtime's numbers
describe('the light atlas', () => {
  it('gives each instance a tile of its own, inset from its cell', async () => {
    const { atlasLayout, tileOf, INSET, TILE } = await import('../src/look/building-light.ts')
    for (const n of [1, 4, 5, BUILDINGS.length, 13]) {
      const { width, height, rows, cols, inner } = atlasLayout(n)
      expect(rows * cols).toBeGreaterThanOrEqual(n)
      // (square-ish)
      expect(Math.abs(rows - cols)).toBeLessThanOrEqual(1)
      for (let i = 0; i < n; i++) {
        const [x, y, w, h] = tileOf(i, n)
        const cx = (i % cols) * TILE
        const cy = Math.floor(i / cols) * TILE
        expect(x * width).toBeCloseTo(cx + INSET)
        expect(y * height).toBeCloseTo(cy + INSET)
        expect((x + w) * width).toBeCloseTo(cx + TILE - INSET)
        expect((y + h) * height).toBeCloseTo(cy + TILE - INSET)
        expect([w, h]).toEqual(inner)
      }
    }
    expect(() => atlasLayout(200, 4096)).not.toThrow() // (15 × 14 tiles: 3840 × 3584, within; 300 is 18 × 17: 4608)
    expect(() => atlasLayout(300, 4096)).toThrow(/too many buildings/)
  })
  it("keeps the light UVs' islands apart, as the export checks", async () => {
    const { DILATE, INSET, MIN_GAP, REACH, TILE } = await import('../src/look/building-light.ts')
    const n = TILE - 2 * INSET
    const tool = fs.readFileSync(new URL('../tools/building-to-js.py', import.meta.url), 'utf8')
    expect(Number(/^LIGHT_TEXELS = (\d+)/m.exec(tool)?.[1])).toBe(n)
    expect(Number(/LIGHT_MIN_GAP = (\d+)/.exec(tool)?.[1])).toBe(MIN_GAP)
    expect(DILATE).toBeGreaterThanOrEqual(REACH) // (the fill reaches as far as a read)
    const t = fs.readFileSync(new URL('../prototypes/buildings.data.js', import.meta.url), 'utf8')
    const data = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) as Record<
      string,
      { pos: number[]; uv2: number[]; idx: number[] }
    >
    for (const [name, d] of Object.entries(data)) expect(lightGap(d, n, MIN_GAP), name).toBe(MIN_GAP) // (MIN_GAP: none nearer)
  })
})

// the least Chebyshev distance in texels of an n² tile between two islands' touched texels (most if none nearer):
// tools/building-to-js.py's light_gap
function lightGap(d: { pos: number[]; uv2: number[]; idx: number[] }, n: number, most: number): number {
  const nv = d.uv2.length / 2
  const par = Array.from({ length: nv }, (_, i) => i)
  const find = (a: number): number => {
    while (par[a] !== a) {
      par[a] = par[par[a]!]!
      a = par[a]!
    }
    return a
  }
  const join = (a: number, b: number) => {
    a = find(a)
    b = find(b)
    if (a !== b) par[a] = b
  }
  for (let f = 0; f < d.idx.length; f += 3) {
    join(d.idx[f]!, d.idx[f + 1]!)
    join(d.idx[f + 1]!, d.idx[f + 2]!)
  }
  const first = new Map<string, number>()
  for (let i = 0; i < nv; i++) {
    const k = [d.uv2[i * 2]!, d.uv2[i * 2 + 1]!, d.pos[i * 3]!, d.pos[i * 3 + 1]!, d.pos[i * 3 + 2]!]
      .map(v => Math.round(v * 1e4))
      .join()
    const j = first.get(k)
    if (j === undefined) first.set(k, i)
    else join(i, j)
  }
  const img = new Int32Array(n * n).fill(-1)
  for (let f = 0; f < d.idx.length; f += 3) {
    const P = [0, 1, 2].map(k => [d.uv2[d.idx[f + k]! * 2]! * n, d.uv2[d.idx[f + k]! * 2 + 1]! * n] as [number, number])
    const lab = find(d.idx[f]!)
    const cl = (v: number) => Math.min(n - 1, Math.max(0, v)) // (a corner on a texel's edge touches both texels)
    const x0 = cl(Math.ceil(Math.min(...P.map(p => p[0]))) - 1)
    const x1 = cl(Math.floor(Math.max(...P.map(p => p[0]))))
    const y0 = cl(Math.ceil(Math.min(...P.map(p => p[1]))) - 1)
    const y1 = cl(Math.floor(Math.max(...P.map(p => p[1]))))
    const area = (P[1]![0] - P[0]![0]) * (P[2]![1] - P[0]![1]) - (P[2]![0] - P[0]![0]) * (P[1]![1] - P[0]![1])
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let hit = true
        if (area !== 0) {
          for (let k = 0; k < 3 && hit; k++) {
            const A = P[k]!
            const B = P[(k + 1) % 3]!
            if (
              [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ].every(
                ([cx, cy]) =>
                  ((B[0] - A[0]) * (y + cy! - A[1]) - (B[1] - A[1]) * (x + cx! - A[0])) * Math.sign(area) < 0,
              )
            ) {
              hit = false
            }
          }
        }
        if (!hit) continue
        const old = img[y * n + x]!
        if (old >= 0 && old !== lab) return 0
        img[y * n + x] = lab
      }
    }
  }
  let gap = most
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = img[y * n + x]!
      if (a < 0) continue
      for (let dy = -gap + 1; dy < gap; dy++) {
        for (let dx = -gap + 1; dx < gap; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= n || xx < 0 || xx >= n) continue
          const b = img[yy * n + xx]!
          if (b >= 0 && b !== a) gap = Math.max(Math.abs(dx), Math.abs(dy))
        }
      }
    }
  }
  return gap
}
