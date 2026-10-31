// The interface's icons (src/ui/icons.ts): one drawing for every category, mode, shape and metric, all different,
// and a unit's category icon from its tags. docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import {
  CATEGORY_ICONS,
  FIGHT_ICONS,
  METRIC_ICONS,
  SHAPE_ICONS,
  WEAPON_ICONS,
  categoryIcon,
  iconDrawing,
  type IconName,
} from '../src/ui/icons.ts'

const ALL: IconName[] = [...CATEGORY_ICONS, ...WEAPON_ICONS, ...FIGHT_ICONS, ...SHAPE_ICONS, ...METRIC_ICONS]

describe('the icon set', () => {
  it('draws every icon, each on a square box, with at least one stroke', () => {
    for (const name of ALL) {
      const drawing = iconDrawing(name)
      expect(drawing.strokes.length, name).toBeGreaterThan(0)
      expect(drawing.box, name).toBeGreaterThan(0)
    }
  })

  it('draws no two icons alike', () => {
    const drawings = ALL.map(name => JSON.stringify(iconDrawing(name)))
    expect(new Set(drawings).size).toBe(ALL.length)
  })

  it("has an icon for each of the unit model's shapes (docs/proposals/unit-model.md)", () => {
    expect([...SHAPE_ICONS].sort()).toEqual(['column', 'limbered', 'line', 'march', 'skirmish', 'square', 'unlimbered'])
  })

  it('draws the infantry shapes as ranks of lines, as Total War draws formations', () => {
    for (const name of ['line', 'column', 'march', 'skirmish'] as const) {
      const strokes = iconDrawing(name).strokes
      expect(
        strokes.every(s => s.mode === 'line'),
        name,
      ).toBe(true)
      expect(strokes.length, name).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('categoryIcon', () => {
  it("reads a unit's category from its tags (the unit model's categories)", () => {
    expect(categoryIcon(['foot'])).toBe('foot')
    expect(categoryIcon(['foot', 'light'])).toBe('foot-light')
    expect(categoryIcon(['horse', 'heavy'])).toBe('horse-heavy')
    expect(categoryIcon(['horse', 'light', 'lancer'])).toBe('horse-light')
    expect(categoryIcon(['guns'])).toBe('guns-heavy')
  })

  it('makes horse artillery light artillery, not cavalry', () => {
    expect(categoryIcon(['guns', 'horse'])).toBe('guns-light')
  })

  it('makes cavalry heavy unless tagged light, and a unit with no arm tag line infantry', () => {
    expect(categoryIcon(['horse'])).toBe('horse-heavy')
    expect(categoryIcon([])).toBe('foot')
  })
})
