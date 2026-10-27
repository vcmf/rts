// A map's modern works mended out of its relief (docs/plans/active/m8-austerlitz.md M8d): the relief file read over a
// box, the cost of a work against the ground around it, a traced line's loops cut out.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import { gridOf, untangle, workCost, type Grid } from '../tools/works.ts'

/** A grid of plain ground at 200 m, with `bank` m more where `on` says. */
function ground(w: number, h: number, bank: number, on: (x: number, y: number) => boolean): Grid {
  const h0 = new Float64Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) h0[y * w + x] = 200 + (on(x, y) ? bank : 0)
  return { w, h, x0: 0, z0: 0, cell: 5, h0 }
}

describe("a map's modern works", () => {
  it('reads the relief file over a box of its frame, in whole nodes, at its heights above the sea', () => {
    // a 5 × 5 file at 10 m, its frame centred: nodes at −20 … 20; heights 1 cm × the node's number above 180 m
    const cm = Uint16Array.from({ length: 25 }, (_, k) => k)
    const g = gridOf({ nx: 5, nz: 5, cell: 10, base: 180, cm }, [-5, -15, 15, 5])
    // the nodes covering it: −10 … 20 east, −20 … 10 north
    expect([g.w, g.h, g.x0, g.z0]).toEqual([4, 4, -10, -20])
    // its first node is the file's (1, 0); its last (4, 3)
    expect(g.h0[0]).toBeCloseTo(180.01, 9)
    expect(g.h0[15]).toBeCloseTo(180.19, 9)
  })
  it('makes an embankment and a cutting cheap and the plain ground dear', () => {
    const bank = workCost(ground(40, 40, 3, x => x >= 19 && x <= 21))
    expect(bank[20 * 40 + 20]).toBe(1)
    expect(bank[20 * 40 + 5]).toBe(31)
    const cut = workCost(ground(40, 40, -3, x => x >= 19 && x <= 21))
    expect(cut[20 * 40 + 20]).toBe(1)
  })
  it("cuts out a line's loops: a crossing, and a spur out and back to a point", () => {
    const loop: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, -5],
      [20, -5],
    ]
    // segment 0 (0,0)→(10,0) and segment 3 (5,5)→(5,−5) cross at (5, 0)
    expect(untangle(loop)).toEqual([
      [0, 0],
      [5, 0],
      [5, -5],
      [20, -5],
    ])
    const spur: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 8],
      [11, 2],
      [10, 0],
      [20, 0],
    ]
    const out = untangle(spur)
    expect(out[0]).toEqual([0, 0])
    expect(out.at(-1)).toEqual([20, 0])
    expect(Math.max(...out.map(p => p[1]))).toBe(0)
    // a line that does not cross itself is left as it is
    const plain: Pt[] = [
      [0, 0],
      [10, 3],
      [20, 0],
    ]
    expect(untangle(plain)).toEqual(plain)
  })
})
