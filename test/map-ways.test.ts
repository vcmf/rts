// A map's ways traced off its scan (docs/plans/active/m8-austerlitz.md M8c): the ink's cost against its own paper, the
// cheapest path along a drawn line, the path evened.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import { cheapest, evenPath, grey, inkCost, type Grey } from '../tools/ways.ts'

/** A w × h grey image of paper at `paper`, with the pixels `ink` says at `dark`. */
function sheet(w: number, h: number, paper: number, dark: number, ink: (x: number, y: number) => boolean): Grey {
  const l = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l[y * w + x] = ink(x, y) ? dark : paper
  return { w, h, l }
}

describe("a map's ways", () => {
  it('reads RGBA as luminance', () => {
    const g = grey({ w: 2, h: 1, data: new Uint8Array([255, 255, 255, 255, 100, 0, 0, 255]) })
    expect(g.l[0]).toBeCloseTo(255, 3)
    expect(g.l[1]).toBeCloseTo(30, 3)
  })
  it('makes ink cheap and paper dear against its own paper, whatever its shade', () => {
    // a line on light paper and the same contrast on dark paper cost the same
    for (const paper of [240, 170]) {
      const c = inkCost(sheet(21, 21, paper, paper - 60, x => x === 10))
      expect(c[10 * 21 + 10]).toBe(1)
      expect(c[10 * 21 + 3]).toBe(31)
    }
    // plain paper is dear everywhere, however dark
    const flat = inkCost(sheet(9, 9, 120, 0, () => false))
    expect(Math.min(...flat)).toBe(31)
  })
  it('follows a drawn line between two of its points rather than the straight way across paper', () => {
    // an L of ink: down x = 5, then along y = 35; the straight way from its top to its far end crosses paper
    const g = sheet(41, 41, 230, 150, (x, y) => (x === 5 && y <= 35) || (y === 35 && x >= 5))
    const path = cheapest(inkCost(g), g.w, g.h, [5, 0], [35, 35])
    expect(path[0]).toEqual([5, 0])
    expect(path.at(-1)).toEqual([35, 35])
    const l = g.l
    expect(path.filter(([x, y]) => l[y * g.w + x] !== 150)).toEqual([])
    // steps of one pixel, each to one of the eight neighbours
    for (let k = 1; k < path.length; k++) {
      expect(Math.max(Math.abs(path[k][0] - path[k - 1][0]), Math.abs(path[k][1] - path[k - 1][1]))).toBe(1)
    }
  })
  it('searches only the box around its ends widened by its pad', () => {
    // a detour of ink 30 px away is out of a 10 px pad, so the path crosses the paper
    const g = sheet(60, 60, 230, 150, (x, y) => y === 45 || (x === 5 && y >= 5) || (x === 50 && y >= 5))
    const near = cheapest(inkCost(g), g.w, g.h, [5, 5], [50, 5], 10)
    expect(Math.max(...near.map(p => p[1]))).toBeLessThanOrEqual(15)
    const far = cheapest(inkCost(g), g.w, g.h, [5, 5], [50, 5], 50)
    expect(Math.max(...far.map(p => p[1]))).toBe(45)
  })
  it('evens a path by its moving mean, its ends kept', () => {
    // a zigzag between a road's two edges evens onto its middle
    const zig: Pt[] = Array.from({ length: 21 }, (_, k) => [k, k % 2 ? 2 : 0])
    const even = evenPath(zig, 2)
    expect(even[0]).toEqual([0, 0])
    expect(even[20]).toEqual([20, 0])
    for (const [, y] of even.slice(3, -3)) expect(Math.abs(y - 1)).toBeLessThanOrEqual(0.2)
    // a straight path stays where it was
    const line: Pt[] = Array.from({ length: 9 }, (_, k) => [k, 2 * k])
    expect(evenPath(line, 3)).toEqual(line)
  })
})
