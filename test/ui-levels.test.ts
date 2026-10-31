// The experience markers (src/ui/levels.ts) and the accent's choice (src/ui/accent.ts). docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import { ACCENTS, DEFAULT_ACCENT, accentOf } from '../src/ui/accent.ts'
import { LEVEL_SERIES, LEVELS, levelGlyph, starPath } from '../src/ui/levels.ts'

describe('levelGlyph', () => {
  it('gives every series five glyphs, all different', () => {
    for (const series of LEVEL_SERIES) {
      const glyphs = Array.from({ length: LEVELS }, (_, level) => JSON.stringify(levelGlyph(series, level)))
      expect(new Set(glyphs).size, series).toBe(LEVELS)
    }
  })

  it('clamps a level outside 0–4 to the ends', () => {
    expect(levelGlyph('sleeve', -2)).toEqual(levelGlyph('sleeve', 0))
    expect(levelGlyph('sleeve', 9)).toEqual(levelGlyph('sleeve', 4))
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

describe('accentOf', () => {
  it('reads a known accent from the query string', () => {
    for (const accent of ACCENTS) expect(accentOf(`?accent=${accent}`)).toBe(accent)
  })

  it('falls back to the default for none or an unknown one', () => {
    expect(accentOf('')).toBe(DEFAULT_ACCENT)
    expect(accentOf('?accent=orange')).toBe(DEFAULT_ACCENT)
  })
})
