// A map's ways traced off its scan (docs/plans/active/m8-austerlitz.md M8c): the ink's cost against its own paper, the
// cheapest path along a drawn line, waypoints onto the ink, spurs cut, shared stretches cut back to their fork, the
// path evened with its junctions kept.
import { describe, it, expect } from 'vitest'
import type { Pt } from '../src/map/schema.ts'
import {
  cheapest,
  doubled,
  evenKept,
  evenPath,
  forks,
  grey,
  inkCost,
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
  it('cuts a way with an end running along another back to their fork, which both keep, whichever is listed first', () => {
    // the main road along y = 0 from x = -20 to 40; the branch along it from x = 0 to 20, then down x = 20
    const main: Pt[] = Array.from({ length: 61 }, (_, x) => [x - 20, 0])
    const branch: Pt[] = [
      ...Array.from({ length: 21 }, (_, x): Pt => [x, 1]),
      ...Array.from({ length: 20 }, (_, k): Pt => [20, k + 2]),
    ]
    const ways = [
      { px: main, keep: new Set([0, 60]) },
      { px: branch, keep: new Set([0, branch.length - 1]) },
    ]
    for (const order of [ways, [...ways].reverse()]) {
      const out = forks(order, 3, 8)
      const a = out[order.indexOf(ways[0])]
      const b = out[order.indexOf(ways[1])]
      expect(a.px).toEqual(main)
      // the branch starts on a pixel of the main road, which the main road keeps
      const at = main.findIndex(p => p[0] === b.px[0][0] && p[1] === b.px[0][1])
      expect(at).toBeGreaterThan(0)
      expect(a.keep.has(at)).toBe(true)
      expect(b.px.at(-1)).toEqual([20, 21])
      expect(b.px.length).toBeLessThan(25)
      expect(b.keep.has(0) && b.keep.has(b.px.length - 1)).toBe(true)
    }
    // a short touch at an end (a road leaving from another's side) is left as it is
    const leaving: Pt[] = Array.from({ length: 20 }, (_, k): Pt => [10, k + 1])
    const [, c] = forks(
      [
        { px: main, keep: new Set([0, 60]) },
        { px: leaving, keep: new Set([0, 19]) },
      ],
      3,
      8,
    )
    expect(c.px).toEqual(leaving)
    // one wholly along it is left empty
    const [, d] = forks(
      [
        { px: main, keep: new Set([0, 60]) },
        { px: main.slice(25, 50), keep: new Set([0, 24]) },
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
  it('never cuts a spur back past a junction kept before it', () => {
    // ink along y = 10; a junction at x = 30, then a plain waypoint 6 px on, then back to x = 20
    const g = sheet(60, 30, 230, 150, (_x, y) => y === 10)
    const t = traceWay(
      inkCost(g),
      60,
      30,
      [
        [5, 10],
        [30, 10],
        [36, 10],
        [20, 10],
      ],
      [false, true, false, false],
    )
    const at = t.px.findIndex(p => p[0] === 30 && p[1] === 10)
    expect(at).toBeGreaterThan(0)
    expect(t.keep.has(at)).toBe(true)
    for (const k of t.keep) expect(k).toBeLessThan(t.px.length)
  })
  it("finds a stretch traced twice in two ways' middles", () => {
    const a: Pt[] = [
      ...Array.from({ length: 20 }, (_, k): Pt => [0, 40 - k]),
      ...Array.from({ length: 50 }, (_, x): Pt => [x, 20]),
    ]
    const b: Pt[] = [
      ...Array.from({ length: 20 }, (_, k): Pt => [10, k]),
      ...Array.from({ length: 50 }, (_, x): Pt => [x + 5, 21]),
      ...Array.from({ length: 20 }, (_, k): Pt => [54, 22 + k]),
    ]
    const ways = [
      { px: a, keep: new Set([0, a.length - 1]) },
      { px: b, keep: new Set([0, b.length - 1]) },
    ]
    expect(doubled(ways, 3, 32)?.slice(0, 2).sort()).toEqual([0, 1])
    // a crossing is not
    const across: Pt[] = Array.from({ length: 40 }, (_, k): Pt => [25, k])
    expect(doubled([ways[0], { px: across, keep: new Set([0, 39]) }], 3, 32)).toBeNull()
  })
  it('leaves a waypoint on its line where it is, though darker ink lies near', () => {
    // a line along y = 10 drawn lighter than a letter's stroke at y = 13
    const l = new Float32Array(30 * 30).fill(230)
    for (let x = 0; x < 30; x++) l[10 * 30 + x] = 160
    for (let x = 12; x < 18; x++) l[13 * 30 + x] = 60
    const c = inkCost({ w: 30, h: 30, l })
    expect(snapToInk(c, 30, 30, [15, 10], 4)).toEqual([15, 10])
  })
  it('refuses a waypoint off the image before moving it, and keeps one on a faint line', () => {
    const g = sheet(30, 30, 230, 150, x => x === 10)
    const c = inkCost(g)
    expect(() => snapToInk(c, 30, 30, [-3, 7], 4)).toThrow(/off the 30 × 30 image/)
    expect(() => snapToInk(c, 30, 30, [-10, 7], 4)).toThrow(/off/)
    // a line 15 levels darker than its paper (not saturated) beside a letter's dark stroke 3 px off
    const l = new Float32Array(30 * 30).fill(230)
    for (let x = 0; x < 30; x++) l[10 * 30 + x] = 212
    for (let x = 12; x < 18; x++) l[13 * 30 + x] = 60
    expect(snapToInk(inkCost({ w: 30, h: 30, l }), 30, 30, [15, 10], 4)).toEqual([15, 10])
  })
  it('passes straight through a plain waypoint and round a right-angled corner without cutting them', () => {
    const line = sheet(60, 30, 230, 150, (x, y) => y === 10 || (x === 40 && y >= 10))
    const c = inkCost(line)
    for (const pts of [
      [
        [5, 10],
        [30, 10],
        [55, 10],
      ],
      [
        [5, 10],
        [40, 10],
        [40, 28],
      ],
    ] as Pt[][]) {
      const t = traceWay(c, 60, 30, pts, [false, false, false])
      expect(t.px.some(p => p[0] === pts[1][0] && p[1] === pts[1][1])).toBe(true)
      // still a chain of neighbouring pixels
      for (let k = 1; k < t.px.length; k++) {
        expect(Math.max(Math.abs(t.px[k][0] - t.px[k - 1][0]), Math.abs(t.px[k][1] - t.px[k - 1][1]))).toBe(1)
      }
    }
  })
  it('refuses to cut a junction off with the end it runs along another way', () => {
    const main: Pt[] = Array.from({ length: 61 }, (_, x) => [x - 20, 0])
    const branch: Pt[] = [
      ...Array.from({ length: 21 }, (_, x): Pt => [x, 1]),
      ...Array.from({ length: 20 }, (_, k): Pt => [20, k + 2]),
    ]
    expect(() =>
      forks(
        [
          { px: main, keep: new Set([0, 60]) },
          { px: branch, keep: new Set([0, 10, branch.length - 1]) },
        ],
        3,
        8,
        ['main', 'branch'],
      ),
    ).toThrow(/branch: a junction lies on the end it runs along main/)
  })
  it('finds a stretch traced twice though a third way crosses it', () => {
    const a: Pt[] = Array.from({ length: 80 }, (_, x): Pt => [x, 20])
    const b: Pt[] = [
      ...Array.from({ length: 20 }, (_, k): Pt => [5, k]),
      ...Array.from({ length: 60 }, (_, x): Pt => [x + 6, 21]),
      ...Array.from({ length: 19 }, (_, k): Pt => [65, 22 + k]),
    ]
    const across: Pt[] = Array.from({ length: 40 }, (_, k): Pt => [36, k + 2])
    const ways = [a, b, across].map(px => ({ px, keep: new Set([0, px.length - 1]) }))
    const twice = doubled(ways, 3, 32)
    expect(twice).not.toBeNull()
    expect([twice![0], twice![1]].sort()).toEqual([0, 1])
  })
  it('takes the cost at or under which a waypoint is on its line from its caller', () => {
    // a pixel costing 18: on a line by the scan's rule (21.5), off it by a stricter one, which moves it onto the ink
    const c = new Float32Array(9 * 9).fill(31)
    c[4 * 9 + 4] = 18
    c[4 * 9 + 6] = 1
    expect(snapToInk(c, 9, 9, [4, 4], 3)).toEqual([4, 4])
    expect(snapToInk(c, 9, 9, [4, 4], 3, 2, 16)).toEqual([6, 4])
  })
})
