// The water data's pieces (docs/plans/active/w3-water-data.md, src/look/world/water-data.ts): the distance transform
// against brute force, the encoding's round trip, a span grid's unpacking and the GPU-style bilinear read.
import { describe, expect, it } from 'vitest'
import { mulberry } from '../src/look/noise.ts'
import { SPEC } from '../src/look/spec.ts'
import { unpackSpans, type SpanGrid } from '../src/look/world/data.ts'
import { decodeWater, edt, encodeWater, sampleRGBA } from '../src/look/world/water-data.ts'

const brute = (mask: Uint8Array, n: number, to: number) => Float64Array.from(mask, (_, k) => {
  let best = Infinity
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (mask[j * n + i] === to) best = Math.min(best, (i - k % n) ** 2 + (j - Math.floor(k / n)) ** 2)
  return best
})

describe('distance transform', () => {
  it('matches brute force on random masks, both ways', () => {
    const r = mulberry(11)
    for (const [n, p] of [[1, 0.5], [7, 0.1], [16, 0.03], [23, 0.5], [31, 0.9]] as const) {
      const mask = Uint8Array.from({ length: n * n }, () => r() < p ? 1 : 0)
      for (const to of [0, 1]) expect(Array.from(edt(mask, n, to))).toEqual(Array.from(brute(mask, n, to)))
    }
  })
  it('is Infinity everywhere when nothing matches', () => {
    expect(Array.from(edt(new Uint8Array(9), 3, 1))).toEqual(Array(9).fill(Infinity))
  })
})

describe('water encoding', () => {
  it('round-trips within half a step, and clamps', () => {
    const W = SPEC.water, step = (W.depth[1] - W.depth[0]) / 255
    for (const [d, s, fx, fz] of [[0, 0, 0, 0], [1.234, 3.21, 0.5, -0.7], [-0.9, -12.3, -1, 1], [W.depth[1], W.sdf, 1, -1]]) {
      const b = encodeWater(d, s, fx, fz), w = decodeWater(...(b.map(v => v / 255) as [number, number, number, number]))
      expect(Math.abs(w.depth - d)).toBeLessThanOrEqual(step / 2 + 1e-9)
      expect(Math.abs(w.sdf - s)).toBeLessThanOrEqual(W.sdf / 255 + 1e-9)
      expect(Math.abs(w.fx - fx)).toBeLessThanOrEqual(1 / 255 + 1e-9)
      expect(Math.abs(w.fz - fz)).toBeLessThanOrEqual(1 / 255 + 1e-9)
    }
    expect(encodeWater(9, 99, 3, -3)).toEqual([255, 255, 255, 0])
  })
})

describe('span grids', () => {
  const g: SpanGrid = { n: 4, cell: 1, x0: 0, z0: 0, ch: 2, spans: Float32Array.from([1, 1, 2, 3, 0, 1]), tex: Uint8Array.from([10, 11, 20, 21, 30, 31]) }
  it('unpacks the covered texels over the fill', () => {
    const d = unpackSpans(g, [1, 2, 3, 4]), at = (i: number, j: number) => Array.from(d.subarray((j * 4 + i) * 4, (j * 4 + i) * 4 + 4))
    expect(at(0, 0)).toEqual([1, 2, 3, 4])
    expect(at(1, 1)).toEqual([10, 11, 3, 4])
    expect(at(2, 1)).toEqual([20, 21, 3, 4])
    expect(at(0, 3)).toEqual([30, 31, 3, 4])
    expect(at(3, 1)).toEqual([1, 2, 3, 4])
  })
  it('reads bilinearly between texel centres, clamped at the edges', () => {
    const d = unpackSpans(g, [0, 0, 0, 0])
    expect(sampleRGBA(d, 4, 1, 0, 0, 1.5, 1.5)[0]).toBeCloseTo(10 / 255, 9)              // a texel's centre
    expect(sampleRGBA(d, 4, 1, 0, 0, 2, 1.5)[0]).toBeCloseTo(15 / 255, 9)                // halfway to its neighbour
    expect(sampleRGBA(d, 4, 1, 0, 0, 0.2, 3.9)[1]).toBeCloseTo(31 / 255, 9)              // clamped in the corner
  })
})
