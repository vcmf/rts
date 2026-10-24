// The roads' segments and grid (docs/plans/done/roads.md): the shader's roadAt, emulated, finds in its cell the
// exact nearest segment everywhere the paint or the junction weight reads; a line's free ends are flagged only on its
// first and last segments; the distance along, as roadAt picks its segment (strict, in the cell's order, the mitre
// slab breaking a tie), is continuous round every bend, inside and out.
import { describe, expect, it } from 'vitest'
import { SPEC } from '../src/look/spec.ts'
import { ROAD_SEG, ROAD_SLOTS } from '../src/look/world/data.ts'
import { roadGrid } from '../tools/build-look-data.ts'

const R = roadGrid()
const sn = R.segs.length / ROAD_SEG
const seg = (i: number) => R.segs.subarray(i * ROAD_SEG, (i + 1) * ROAD_SEG)
// the shader's per-segment reads: the score (distance less the half width) and the distance along (between mitres)
const look = (i: number, x: number, z: number) => {
  const [ax, az, bx, bz, along, hw, , , m0x, m0z, m1x, m1z] = seg(i)
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  const t = Math.min(len, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len))
  const px = ax + (dx / len) * t
  const pz = az + (dz / len) * t
  const d0 = (x - ax) * m0x + (z - az) * m0z
  const d1 = (bx - x) * m1x + (bz - z) * m1z
  return {
    score: Math.hypot(x - px, z - pz) - hw + (d0 >= 0 && d1 >= 0 ? 0 : 1e-3),
    s: along + len * Math.min(1, Math.max(0, d0 / Math.max(d0 + d1, 1e-3))),
  }
}
const cellIds = (x: number, z: number): number[] => {
  const i = Math.floor((x - R.x0) / R.cell)
  const j = Math.floor((z - R.z0) / R.cell)
  const o = (j * R.n + i) * ROAD_SLOTS
  const out: number[] = []
  for (let k = 0; k < ROAD_SLOTS && R.ids[o + k] >= 0; k++) out.push(R.ids[o + k])
  return out
}

describe('roads', () => {
  it('finds the exact nearest segment wherever the paint or the junction weight reads', () => {
    let checked = 0
    const h = SPEC.tile / 2 - 0.01
    for (let z = -h; z < h; z += 0.71) {
      for (let x = -h; x < h; x += 0.71) {
        let best = Infinity
        let line = -1
        for (let i = 0; i < sn; i++) {
          const sc = look(i, x, z).score
          if (sc < best) {
            best = sc
            line = seg(i)[6]
          }
        }
        if (best > SPEC.road.junction) continue
        const ids = cellIds(x, z)
        expect(Math.min(...ids.map(i => look(i, x, z).score))).toBeCloseTo(best, 9)
        // and every other line within the junction weight's reach is listed too
        for (let i = 0; i < sn; i++) {
          if (seg(i)[6] !== line && look(i, x, z).score < SPEC.road.junction) {
            expect(ids.some(k => seg(k)[6] === seg(i)[6])).toBe(true)
          }
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10000)
  })
  it("flags only a line's first and last segments as its free ends", () => {
    for (let i = 0; i < sn; i++) {
      const f = seg(i)[7]
      const prev = i > 0 && seg(i - 1)[6] === seg(i)[6]
      const next = i < sn - 1 && seg(i + 1)[6] === seg(i)[6]
      if (prev) expect(f & 1).toBe(0)
      if (next) expect(f & 2).toBe(0)
    }
  })
  it('reads the distance along continuously round every bend, inside and out', () => {
    // roadAt's pick among a bend's two segments: the lower score, the first listed on a tie (strict <)
    // (another line's nearer near a junction: there the shader lays its patterns in the world, not by s: NaN, skipped)
    const pick = (i: number, x: number, z: number) => {
      let best = Infinity
      let sv = NaN
      for (const k of cellIds(x, z)) {
        const l = look(k, x, z)
        if (l.score < best) {
          best = l.score
          sv = seg(k)[6] === seg(i)[6] ? l.s : NaN
        }
      }
      return sv
    }
    let bends = 0
    for (let i = 0; i < sn - 1; i++) {
      const a = seg(i)
      const b = seg(i + 1)
      if (a[6] !== b[6]) continue
      const vx = a[2]
      const vz = a[3]
      if (Math.abs(vx) > SPEC.tile / 2 - 6 || Math.abs(vz) > SPEC.tile / 2 - 6) continue
      for (const r of [1, 3, 5]) {
        // a circle round the shared vertex, in 0.5° steps: s moves by under r·step plus float32
        let prev = pick(i, vx + r, vz)
        for (let k = 1; k <= 720; k++) {
          const t = (k * Math.PI) / 360
          const cur = pick(i, vx + r * Math.cos(t), vz + r * Math.sin(t))
          if (!Number.isNaN(cur) && !Number.isNaN(prev)) {
            expect(Math.abs(cur - prev)).toBeLessThan(((r * Math.PI) / 360) * 1.5 + 2e-3)
          }
          prev = cur
        }
      }
      bends++
    }
    expect(bends).toBeGreaterThan(100)
  })
})
