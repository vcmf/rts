// A map's ways traced off its scan (docs/plans/active/m8-austerlitz.md M8c): the ink's cost against its own paper, the
// cheapest path along a drawn line, waypoints onto the ink, spurs cut, shared stretches cut back to their fork, the
// path evened with its junctions kept.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import {
  cheapest,
  evenKept,
  evenPath,
  forks,
  grey,
  inkCost,
  isWayId,
  snapToInk,
  traceWay,
  type Grey,
} from '../tools/ways.ts'

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
    // it crosses the paper between the two ink lines, which a search reaching y = 45 would not
    expect(near.some(([x, y]) => g.l[y * g.w + x] !== 150)).toBe(true)
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
  it('refuses a waypoint off the image', () => {
    const g = sheet(10, 10, 230, 150, () => false)
    expect(() => cheapest(inkCost(g), 10, 10, [0, 0], [10, 3])).toThrow(/off the 10 × 10 image/)
    expect(() => cheapest(inkCost(g), 10, 10, [-1, 0], [3, 3])).toThrow(/off/)
  })
  it('moves a waypoint beside a line onto it, and leaves one on paper far from any', () => {
    const g = sheet(30, 30, 230, 150, x => x === 10)
    const c = inkCost(g)
    expect(snapToInk(c, 30, 30, [13, 7], 4)).toEqual([10, 7])
    expect(snapToInk(c, 30, 30, [20, 7], 4)).toEqual([20, 7])
  })
  it("cuts a spur where a waypoint lies beside the road, but keeps a junction's", () => {
    // a road along y = 10, a waypoint on a stub of ink 6 px below it: the trace goes down the stub and back
    const g = sheet(60, 30, 230, 150, (x, y) => y === 10 || (x === 30 && y >= 10 && y <= 16))
    const c = inkCost(g)
    const spur = traceWay(
      c,
      60,
      30,
      [
        [5, 10],
        [30, 16],
        [55, 10],
      ],
      [false, false, false],
    )
    expect(Math.max(...spur.px.map(p => p[1]))).toBeLessThanOrEqual(11)
    expect([...spur.keep].sort((a, b) => a - b)).toEqual([0, spur.px.length - 1])
    // fixed (a junction), the waypoint stays on the way and is kept
    const fixed = traceWay(
      c,
      60,
      30,
      [
        [5, 10],
        [30, 16],
        [55, 10],
      ],
      [false, true, false],
    )
    const at = fixed.px.findIndex(p => p[0] === 30 && p[1] === 16)
    expect(at).toBeGreaterThan(0)
    expect(fixed.keep.has(at)).toBe(true)
  })
  it('cuts a way running along an earlier one back to their fork, which both keep', () => {
    // the first along y = 0 from x = 0 to 40; the second along it from x = 0 to 20, then down x = 20
    const first: Pt[] = Array.from({ length: 41 }, (_, x) => [x, 0])
    const second: Pt[] = [
      ...Array.from({ length: 21 }, (_, x): Pt => [x, 1]),
      ...Array.from({ length: 20 }, (_, k): Pt => [20, k + 2]),
    ]
    const [a, b] = forks(
      [
        { px: first, keep: new Set([0, 40]) },
        { px: second, keep: new Set([0, second.length - 1]) },
      ],
      3,
      8,
    )
    expect(a.px).toEqual(first)
    // the second starts on a pixel of the first, which the first keeps
    const fork = b.px[0]
    expect(first.some(p => p[0] === fork[0] && p[1] === fork[1])).toBe(true)
    expect(a.keep.has(first.findIndex(p => p[0] === fork[0] && p[1] === fork[1]))).toBe(true)
    expect(b.px.at(-1)).toEqual([20, 21])
    expect(b.keep.has(0) && b.keep.has(b.px.length - 1)).toBe(true)
    // a short touch at an end (a road leaving from another's side) is left as it is
    const leaving: Pt[] = Array.from({ length: 20 }, (_, k): Pt => [10, k + 1])
    const [, c] = forks(
      [
        { px: first, keep: new Set([0, 40]) },
        { px: leaving, keep: new Set([0, 19]) },
      ],
      3,
      8,
    )
    expect(c.px).toEqual(leaving)
    // one wholly along it is left empty
    const [, d] = forks(
      [
        { px: first, keep: new Set([0, 40]) },
        { px: first.slice(5, 30), keep: new Set([0, 24]) },
      ],
      3,
      8,
    )
    expect(d.px).toEqual([])
  })
  it('evens a path between the points it keeps, each kept point where it was', () => {
    const zig: Pt[] = Array.from({ length: 21 }, (_, k) => [k, k % 2 ? 2 : 0])
    const even = evenKept({ px: zig, keep: new Set([0, 9, 20]) }, 3)
    expect(even).toHaveLength(21)
    expect(even[9]).toEqual([9, 2])
    expect(Math.abs(even[5][1] - 1)).toBeLessThanOrEqual(0.3)
  })
  it("takes as the tool's own only the inputs' ids and their pieces'", () => {
    expect(isWayId(['road'], 'road')).toBe(true)
    expect(isWayId(['road'], 'road2')).toBe(true)
    expect(isWayId(['road'], 'road-lane')).toBe(false)
    expect(isWayId(['road'], 'lane')).toBe(false)
  })
})
