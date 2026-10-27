// Streams from a heightfield (docs/plans/active/m8-austerlitz.md M8b): the sinks filled, the flow routed down, the
// channels traced from their heads, a smaller stream ending where it joins a larger one.
import { describe, it, expect } from 'vitest'
import { drainage, fill, simplify, streams, type Grid } from '../tools/streams.ts'

/** A grid of heights from a function of (x, z), 10 m apart, centred on the origin. */
function grid(n: number, f: (x: number, z: number) => number): Grid {
  const cell = 10
  const x0 = (-(n - 1) * cell) / 2
  const h = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = f(x0 + i * cell, x0 + j * cell)
  return { nx: n, nz: n, cell, x0, z0: x0, h }
}
const run = (g: Grid, minNodes: number) => {
  const { to, acc } = drainage(g, fill(g))
  return streams(g, to, acc, minNodes)
}

describe('streams from a heightfield', () => {
  it('fills a sink so that it drains, every step down', () => {
    // a bowl in a slope: its bottom lower than its rim
    const g = grid(21, (x, z) => 100 - x * 0.05 + (Math.hypot(x, z) < 30 ? -5 : 0))
    const f = fill(g)
    const { to } = drainage(g, f)
    // from the bowl's middle, down to the edge without climbing
    let k = 10 * 21 + 10
    let steps = 0
    while (to[k] >= 0 && steps < 100) {
      expect(f[to[k]]).toBeLessThan(f[k])
      k = to[k]
      steps++
    }
    expect(steps).toBeGreaterThan(0)
    const i = k % 21
    expect(i === 0 || i === 20 || k < 21 || k >= 20 * 21).toBe(true)
  })
  it('traces a valley as one stream, from its head down, along its floor', () => {
    // a V-valley along z = 0, falling to the east
    const g = grid(41, (x, z) => 100 - x * 0.02 + Math.abs(z) * 0.2)
    const s = run(g, 30)
    const main = s.reduce((a, b) => (b.pts.length > a.pts.length ? b : a))
    // down the valley: x grows along it, on its floor
    expect(main.pts[main.pts.length - 1][0]).toBeGreaterThan(main.pts[0][0])
    for (const [, z] of main.pts.slice(3)) expect(Math.abs(z)).toBeLessThanOrEqual(10)
    expect(main.into).toBeNull()
  })
  it('ends a tributary where it joins the larger stream, and says which', () => {
    // a main valley along z = 0 falling east, and a side valley from the north joining it at x = 0
    const g = grid(61, (x, z) => {
      const mainV = 100 - x * 0.02 + Math.abs(z) * 0.2
      const side = z > 0 ? 100 - x * 0.02 + z * 0.05 + Math.abs(x) * 0.2 - 2 : Infinity
      return Math.min(mainV, side)
    })
    const s = run(g, 40)
    const longest = s.reduce((a, b) => (b.km2 > a.km2 ? b : a))
    const trib = s.find(t => t.into === longest.id)
    expect(trib).toBeDefined()
    // it ends on the main stream's line
    const end = trib!.pts[trib!.pts.length - 1]
    expect(longest.pts.some(p => p[0] === end[0] && p[1] === end[1])).toBe(true)
    expect(trib!.km2).toBeLessThan(longest.km2)
  })
  it('simplifies a line within its tolerance, keeping its ends', () => {
    const line: [number, number][] = [
      [0, 0],
      [10, 0.5],
      [20, -0.4],
      [30, 0],
      [40, 20],
    ]
    expect(simplify(line, 1)).toEqual([
      [0, 0],
      [30, 0],
      [40, 20],
    ])
  })
})
