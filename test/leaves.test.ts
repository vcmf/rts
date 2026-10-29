// The layered leaf atlas's clump layout (src/look/leaves.ts, clumpCopies; docs/plans/active/crown-leaves.md)
import { describe, expect, it } from 'vitest'
import { clumpCopies } from '../src/look/leaves.ts'

describe('clumpCopies', () => {
  it('keeps the three clumps of leafScale 1, the cell its own on top', () => {
    const c = clumpCopies(2, 1)
    expect(c).toHaveLength(3)
    expect(c[2]).toEqual([2, 0, 0, 0])
  })

  it('takes about 3 / scale² smaller clumps, the cell its own last in the middle, every copy within the cell', () => {
    for (const s of [0.75, 0.6, 0.5]) {
      for (let k = 0; k < 4; k++) {
        const c = clumpCopies(k, s)
        expect(c).toHaveLength(Math.ceil(3 / (s * s)))
        expect(c.at(-1)).toEqual([k, 0, 0, 0])
        for (const [j, dx, dy] of c) {
          expect(j).toBeGreaterThanOrEqual(0)
          expect(j).toBeLessThan(4)
          // the copy's clump (half-extent 0.47 × 0.8 × s of a cell) reaches past the cell's middle by at most 0.51
          expect(Math.hypot(dx, dy) + 0.47 * 0.8 * s).toBeLessThanOrEqual(0.51 + 1e-9)
        }
      }
    }
  })

  it('draws the outer clumps first (back to front)', () => {
    const r = clumpCopies(0, 0.5).map(([, dx, dy]) => Math.hypot(dx, dy))
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThanOrEqual(r[i - 1] + 1e-12)
  })
})
