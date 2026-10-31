// The interface's icons (src/ui/icons.ts): one drawing for every arm, action, shape and metric, all different, and
// a unit's arm icon from its tags. docs/systems/front-menu.md.
import { describe, it, expect } from 'vitest'
import {
  ACTION_ICONS,
  ARM_ICONS,
  METRIC_ICONS,
  SHAPE_ICONS,
  armIcon,
  iconDrawing,
  type IconName,
} from '../src/ui/icons.ts'

const ALL: IconName[] = [...ARM_ICONS, ...ACTION_ICONS, ...SHAPE_ICONS, ...METRIC_ICONS]

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

describe('armIcon', () => {
  it("reads a unit's arm from its tags", () => {
    expect(armIcon(['foot'])).toBe('foot')
    expect(armIcon(['foot', 'light'])).toBe('foot')
    expect(armIcon(['horse', 'heavy'])).toBe('horse')
    expect(armIcon(['guns'])).toBe('guns')
  })

  it('makes horse artillery guns, not cavalry', () => {
    expect(armIcon(['guns', 'horse'])).toBe('guns')
  })

  it('is foot for a unit with no arm tag', () => {
    expect(armIcon([])).toBe('foot')
  })
})
