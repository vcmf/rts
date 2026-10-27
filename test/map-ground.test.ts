// A map's woods and meadows read off its scan (docs/plans/active/m8-austerlitz.md M8f): the survey's green against its
// paper, its regions, no two touching at a corner, and the rings round them.
import { describe, it, expect } from 'vitest'
import { ringArea2, ringCrossing } from '../src/map/geometry.ts'
import { boxMean, greenOf, noPinches, regions, rings } from '../tools/ground.ts'

/** A w × h mask from rows of '#' and '.'. */
const mask = (rows: string[]) => {
  const [w, h] = [rows[0].length, rows.length]
  return { w, h, m: Uint8Array.from(rows.join('').split(''), c => (c === '#' ? 1 : 0)) }
}

describe("a map's woods and meadows", () => {
  it('means a grid over a box, narrowed at its edges', () => {
    const a = Float64Array.from([1, 2, 3, 4])
    expect(Array.from(boxMean(a, 4, 1, 1))).toEqual([1.5, 2, 3, 3.5])
  })
  it("finds the survey's green and not its paper", () => {
    // paper (213, 202, 148) on the left half, the woods' green (175, 170, 89) on the right
    const [w, h] = [40, 10]
    const rgba = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) rgba.set(x < 20 ? [213, 202, 148, 255] : [175, 170, 89, 255], 4 * (y * w + x))
    }
    const g = greenOf(rgba, w, h, 2)
    expect(g[5 * w + 5]).toBe(0)
    expect(g[5 * w + 35]).toBe(1)
  })
  it('numbers the regions of a mask, four-connected, with their sizes', () => {
    const { w, h, m } = mask(['##..', '#..#', '...#'])
    const { label, sizes } = regions(m, w, h)
    expect(sizes).toEqual([0, 3, 2])
    expect(label[0]).toBe(label[4])
    expect(label[7]).toBe(label[11])
    expect(label[0]).not.toBe(label[7])
  })
  it('fills a corner where two of a mask’s ones, or two of its zeros, meet only diagonally', () => {
    const { w, h, m } = mask(['#.', '.#'])
    const out = noPinches(m, w, h)
    expect(out.reduce((s, v) => s + v, 0)).toBe(3)
  })
  it('rings a region: one simple ring round a block, a hole as its own ring of the other turn', () => {
    const block = mask(['....', '.##.', '.##.', '....'])
    const one = rings((x, y) => block.m[y * block.w + x] === 1, block.w, block.h)
    expect(one).toHaveLength(1)
    expect(Math.abs(ringArea2(one[0])) / 2).toBe(4)
    const holed = mask(['#####', '#...#', '#...#', '#####'])
    const two = rings((x, y) => holed.m[y * holed.w + x] === 1, holed.w, holed.h)
    expect(two).toHaveLength(2)
    const areas = two.map(r => ringArea2(r) / 2).sort((a, b) => Math.abs(b) - Math.abs(a))
    expect(Math.abs(areas[0])).toBe(20)
    expect(Math.abs(areas[1])).toBe(6)
    expect(Math.sign(areas[0])).not.toBe(Math.sign(areas[1]))
    for (const r of two) expect(ringCrossing(r)).toBeNull()
  })
  it('fills a pinch only where allowed, else clears one of its ones; and ends', () => {
    const { w, h, m } = mask(['#.', '.#'])
    // neither zero may become a one (off the map): a one goes instead
    const out = noPinches(m, w, h, Uint8Array.from([1, 0, 0, 1]))
    expect(Array.from(out)).toEqual([0, 0, 0, 1])
  })
  it('does not read a red line over paper as green (hue as a weighted angle, not a plain mean)', () => {
    // paper with every third column a red line (hue about 350°): a plain mean of the hues lifts the paper past 48°
    const [w, h] = [30, 10]
    const rgba = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) rgba.set(x % 3 ? [213, 202, 148, 255] : [200, 40, 60, 255], 4 * (y * w + x))
    }
    expect(greenOf(rgba, w, h, 2).some(v => v === 1)).toBe(false)
  })
  it('stops with an error, not a hang, where the fills and clears undo each other', () => {
    // a 4 × 3 mask and a mask of where it may fill that is not convex: a fill makes a pinch only a clear can undo
    const m = Uint8Array.from('011011000010'.split(''), Number)
    const allowed = Uint8Array.from('011011001010'.split(''), Number)
    expect(() => noPinches(m, 4, 3, allowed)).toThrow(/corner pinches remain/)
  })
})
