// The layered leaf atlas's clump layout (src/look/leaves.ts, clumpCopies; docs/plans/active/crown-leaves.md)
import { describe, expect, it } from 'vitest'
import { CLUMP_REACH, clumpCopies } from '../src/look/leaves.ts'

describe('clumpCopies', () => {
  it('takes about 3 / scale² smaller clumps, the cell its own last in the middle, every copy within the cell', () => {
    for (const s of [1, 0.75, 0.6, 0.5]) {
      for (let k = 0; k < 4; k++) {
        const c = clumpCopies(k, s)
        expect(c).toHaveLength(Math.ceil(3 / (s * s)))
        expect(c.at(-1)).toEqual([k, 0, 0, 0])
        for (const [j, dx, dy] of c) {
          expect(j).toBeGreaterThanOrEqual(0)
          expect(j).toBeLessThan(4)
          // the copy's clump (half-extent 0.47 × 0.8 × s of a cell) stays within the card's read (0.47): no leaf is
          // cut by the cell's clip into a straight edge across the crown (the owner's 2026-10-29 still)
          expect(Math.hypot(dx, dy) + 0.47 * 0.8 * s).toBeLessThanOrEqual(CLUMP_REACH + 1e-9)
          expect(CLUMP_REACH).toBeLessThan(0.47)
        }
      }
    }
  })

  it('draws the outer clumps first (back to front)', () => {
    const r = clumpCopies(0, 0.5).map(([, dx, dy]) => Math.hypot(dx, dy))
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThanOrEqual(r[i - 1] + 1e-12)
  })
})
