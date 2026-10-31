// The layered leaf atlas's pure parts (src/look/leaves.ts; docs/plans/done/crown-leaves.md): the clump layout, the
// clumps' radii, and the per-pixel pass (layers, strays, one draw per leaf, highlights)
import { describe, expect, it } from 'vitest'
import { CLUMP_REACH, HIGHLIGHT, SPLIT, clumpCopies, clumpRadii, layerPixels } from '../src/look/leaves.ts'

describe('clumpCopies', () => {
  it('takes about 3 / scale² clumps, the cell its own last in the middle, every leaf within CLUMP_REACH', () => {
    // round clumps (0.47) and square ones turned (corners at 0.66, the reviewer's case)
    for (const radii of [
      [0.47, 0.47, 0.47, 0.47],
      [0.66, 0.5, 0.66, 0.4],
    ]) {
      for (const s of [1, 0.75, 0.6, 0.5, 0.25]) {
        for (let k = 0; k < 4; k++) {
          const c = clumpCopies(k, s, radii)
          expect(c).toHaveLength(Math.ceil(3 / (s * s)))
          expect(c.at(-1)!.slice(0, 4)).toEqual([k, 0, 0, 0])
          for (const [j, dx, dy, , sc] of c) {
            expect(Math.hypot(dx, dy) + radii[j] * sc).toBeLessThanOrEqual(CLUMP_REACH + 1e-9)
          }
        }
      }
    }
    expect(CLUMP_REACH).toBeLessThan(0.47)
  })

  it('draws the outer clumps first (back to front)', () => {
    const r = clumpCopies(0, 0.5).map(([, dx, dy]) => Math.hypot(dx, dy))
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThanOrEqual(r[i - 1] + 1e-12)
  })
})

describe('clumpRadii', () => {
  it("measures each cell's farthest covered pixel from its middle", () => {
    const cell = 8
    const a = new Uint8Array(16 * 16)
    a[3 * 16 + 4] = 255 // cell 0, next to the middle
    a[15 * 16 + 15] = 255 // cell 3, its corner
    const r = clumpRadii(a, cell)
    expect(r[0]).toBeCloseTo(Math.hypot(0.5, -0.5) / cell, 6)
    expect(r[1]).toBe(0)
    expect(r[2]).toBe(0)
    expect(r[3]).toBeCloseTo(Math.hypot(3.5, 3.5) / cell, 6)
  })
})

describe('layerPixels', () => {
  const W = 12
  const sheet = (fill: (x: number, y: number) => number | null) => {
    const v = new Uint8Array(W * W)
    const a = new Uint8Array(W * W)
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const f = fill(x, y)
        if (f !== null) {
          v[y * W + x] = f
          a[y * W + x] = 255
        }
      }
    }
    return { v, a }
  }
  const dark = Math.floor(SPLIT[0] * 255) - 10
  const mid = Math.floor((SPLIT[0] + SPLIT[1]) * 127.5)
  const light = 250

  it('snaps each value to its layer by SPLIT, nothing where there is no coverage', () => {
    const { v, a } = sheet((x, y) => (y < 2 ? null : x < 4 ? dark : x < 8 ? mid : light))
    const { layer } = layerPixels(v, a, W, 1)
    expect(layer[0]).toBe(-1)
    expect(layer[6 * W + 1]).toBe(0)
    expect(layer[6 * W + 5]).toBe(1)
    expect([2, 3]).toContain(layer[6 * W + 10])
  })

  it('gives a stray pixel its neighbourhood’s commonest layer', () => {
    const { v, a } = sheet((x, y) => (x === 5 && y === 5 ? light : mid))
    const { layer } = layerPixels(v, a, W, 1)
    expect(layer[5 * W + 5]).toBe(1)
  })

  it('gives each leaf patch one draw, and different leaves their own', () => {
    // two mid leaves parted by a dark band (three pixels: a single line would be a stray)
    const { v, a } = sheet(x => (x >= 5 && x <= 7 ? dark : mid))
    const { pick } = layerPixels(v, a, W, 3)
    const left = new Set<number>()
    const right = new Set<number>()
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < 4; x++) left.add(pick[y * W + x])
      for (let x = 9; x < W; x++) right.add(pick[y * W + x])
    }
    expect(left.size).toBe(1)
    expect(right.size).toBe(1)
    expect([...left][0]).not.toBe([...right][0])
  })

  it('lifts about HIGHLIGHT of the light leaves to highlights, whole leaves at a time', () => {
    // a grid of single light leaves (5×5), parted by dark lines two pixels wide (one would be strays)
    const n = 120
    const big = 7 * n
    const v = new Uint8Array(big * big)
    const a = new Uint8Array(big * big).fill(255)
    for (let y = 0; y < big; y++) for (let x = 0; x < big; x++) v[y * big + x] = x % 7 > 1 && y % 7 > 1 ? light : dark
    const { layer } = layerPixels(v, a, big, 9)
    let leaves = 0
    let lifted = 0
    for (let y = 4; y < big; y += 7) {
      for (let x = 4; x < big; x += 7) {
        const L = layer[y * big + x]
        if (L < 2) continue
        leaves++
        if (L === 3) lifted++
        // the leaf's middle in one layer
        expect(layer[y * big + x + 1]).toBe(L)
        expect(layer[(y + 1) * big + x]).toBe(L)
      }
    }
    expect(leaves).toBeGreaterThan(n * n * 0.9)
    expect(lifted / leaves).toBeGreaterThan(HIGHLIGHT - 0.03)
    expect(lifted / leaves).toBeLessThan(HIGHLIGHT + 0.03)
  })
})
