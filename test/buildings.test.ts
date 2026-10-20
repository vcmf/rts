// The buildings' placement (docs/plans/active/buildings.md): the gap between two paved yards (convex polygons) is 0
// where they overlap or cross and the edges' least distance otherwise, and the authored buildings' yards keep at least
// PAVE_GAP apart (the cover's authoring fails otherwise: src/look/world/cover.ts)
import { describe, expect, it } from 'vitest'
import { BUILDINGS, PAVE_GAP, pavePoly, polyGap } from '../src/look/world/buildings.ts'

const box = (x: number, z: number, hx: number, hz: number): [number, number][] => [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]]

describe('the yards', () => {
  it('measures the gap between two yards', () => {
    expect(polyGap(box(0, 0, 2, 2), box(1, 1, 2, 2))).toBe(0)        // a corner of one in the other
    expect(polyGap(box(0, 0, 5, 1), box(0, 0, 1, 5))).toBe(0)        // crossing as a plus: no corner in the other
    expect(polyGap(box(0, 0, 2, 2), box(10, 0, 2, 2))).toBeCloseTo(6)
    expect(polyGap(box(0, 0, 2, 2), box(5, 5, 1, 1))).toBeCloseTo(Math.hypot(2, 2))
  })
  it('keeps the authored yards apart', () => {
    const p = BUILDINGS.map(pavePoly)
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(polyGap(p[i], p[j])).toBeGreaterThanOrEqual(PAVE_GAP)
  })
})
