// The experience markers (src/ui/levels.ts). docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import { LEVEL_SERIES, LEVELS, levelGlyph, starPath, type LevelSeries } from '../src/ui/levels.ts'

describe('levelGlyph', () => {
  it("gives every series six glyphs (the unit model's levels 1–6), all different", () => {
    for (const series of LEVEL_SERIES) {
      const glyphs = Array.from({ length: LEVELS }, (_, i) => JSON.stringify(levelGlyph(series, i + 1)))
      expect(new Set(glyphs).size, series).toBe(LEVELS)
    }
  })

  it("marks the Guard's levels (4–6) with a star in every series, and the line's (1–3) without", () => {
    const hasStar = (series: LevelSeries, level: number) =>
      levelGlyph(series, level).some(stroke => (stroke.d.match(/ L/g) ?? []).length === 9)
    for (const series of LEVEL_SERIES) {
      const stars = Array.from({ length: LEVELS }, (_, i) => hasStar(series, i + 1))
      expect(stars, series).toEqual([false, false, false, true, true, true])
    }
  })

  it('clamps a level outside 1–6 to the ends', () => {
    expect(levelGlyph('sleeve', -2)).toEqual(levelGlyph('sleeve', 1))
    expect(levelGlyph('sleeve', 9)).toEqual(levelGlyph('sleeve', 6))
  })

  it('draws a closed star of ten points inside its radius', () => {
    const path = starPath(8, 8, 7)
    const points = path.match(/-?\d+\.\d+ -?\d+\.\d+/g) ?? []
    expect(points).toHaveLength(10)
    expect(path.endsWith('Z')).toBe(true)
    for (const p of points) {
      const [x, y] = p.split(' ').map(Number)
      expect(Math.hypot(x - 8, y - 8)).toBeLessThanOrEqual(7.01)
    }
  })
})
