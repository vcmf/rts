// The interface's icons: ink glyphs (src/ui/glyph.ts) for a unit's category, its modes (weapon, fight), its shapes
// and its metrics. Icons lead and words follow: an icon carries its name as a tooltip (`data-tip`) and an accessible
// label, and a screen shows text only as a subtitle. Named by role, not by an era's unit or weapon (decision 0015):
// the categories by the unit model's tags (foot, horse, guns; light, heavy), the shapes by its shapes
// (docs/proposals/unit-model.md); the drawings are the Napoleonic ruleset's look. Shapes are drawn as Total War draws
// formations: each rank a line.
import { h } from './dom.ts'
import { cut, fill, glyph, line, type Stroke } from './glyph.ts'

export type CategoryIcon = 'foot' | 'foot-light' | 'horse-heavy' | 'horse-light' | 'guns-heavy' | 'guns-light'
/** The weapon mode: hand to hand, or the firearm (volley or aimed). */
export type WeaponIcon = 'melee' | 'fire' | 'aimed-fire'
/** The fight mode: fire on its own at any enemy in range, or only when ordered. */
export type FightIcon = 'fire-at-will' | 'hold-fire'
export type ShapeIcon = 'line' | 'column' | 'march' | 'square' | 'skirmish' | 'unlimbered' | 'limbered'
export type MetricIcon = 'toughness' | 'morale' | 'fatigue'
export type IconName = CategoryIcon | WeaponIcon | FightIcon | ShapeIcon | MetricIcon

export const CATEGORY_ICONS: readonly CategoryIcon[] = [
  'foot',
  'foot-light',
  'horse-heavy',
  'horse-light',
  'guns-heavy',
  'guns-light',
]
export const WEAPON_ICONS: readonly WeaponIcon[] = ['melee', 'fire', 'aimed-fire']
export const FIGHT_ICONS: readonly FightIcon[] = ['fire-at-will', 'hold-fire']
export const SHAPE_ICONS: readonly ShapeIcon[] = [
  'line',
  'column',
  'march',
  'square',
  'skirmish',
  'unlimbered',
  'limbered',
]
export const METRIC_ICONS: readonly MetricIcon[] = ['toughness', 'morale', 'fatigue']

/** An icon's drawing: its strokes on a `box` × `box` view. */
interface Drawing {
  box: number
  strokes: Stroke[]
}

/** The owner's gun (from the staff map prototype, prototypes/staff-map.html GUN_D): 15 × 15, the barrel level along
 *  the top, the wheel under it. */
const GUN =
  'M14.86 3.75c-.27.34-.68.34-.68.34L4.3 4.3c-.89.06-1.03.75-1.1 1.15c-.06-.13-.2-.2-.4-.2c-.21 0-.48.2-.48.48c0 .27.2.47.48.47c.2 0 .34-.13.4-.27c.07.27.21.68.55.89L2.11 9.48l-.88.07v-.28L0 9.41l.14 1.64L3 10.7l1.57-2.59l.82-1.22l.2.13l.96.96c-.07.07-.14.2-.14.27H4.64v.27h1.7c0 .14.07.21.14.34l-1.16 1.16l.2.21l1.16-1.16c.07.07.21.13.34.13v1.71h.28V9.2c.13 0 .2-.06.27-.13L8.8 10.3l.2-.21l-1.23-1.23c.07-.06.07-.2.07-.27h1.77v-.27H7.84c0-.07.21-.34.14-.48L9 6.75l-.14-.14l5.46-.88s.34-.07.68.27zM7.02 6.82v.82c-.07 0-.2.06-.27.06l-.82-.81zm.55.95c-.07-.07-.14-.07-.27-.07v-.88l1.56-.21zm-.41-2.32c-1.71 0-3.07 1.37-3.07 3.07c0 1.71 1.36 3.07 3.07 3.07c1.7 0 3.07-1.36 3.07-3.07c0-1.7-1.37-3.07-3.07-3.07m0 5.46c-1.3 0-2.39-1.09-2.39-2.39c0-1.29 1.09-2.38 2.39-2.38c1.29 0 2.39 1.09 2.39 2.38c0 1.3-1.1 2.39-2.39 2.39'

/** Horizontal rank lines from `x0` to `x1` at each of `ys`. */
const ranks = (x0: number, x1: number, ys: number[]) => ys.map(y => line(`M${x0} ${y} H${x1}`, 2.2))

/** `count` values from `start`, `step` apart. */
const steps = (start: number, step: number, count: number) => Array.from({ length: count }, (_, i) => start + i * step)

/** A sabre from its grip at (`x`, 20) curving to its point; `side` −1 mirrors it. */
const sabre = (side: 1 | -1) => {
  const x = (v: number) => 12 + side * (v - 12)
  return [
    line(`M${x(4.5)} 19.5 Q${x(8)} 9 ${x(20)} 3`, 2.2),
    line(`M${x(3)} 15.2 L${x(8.6)} 20.8`, 2.2),
    line(`M${x(4.5)} 19.5 L${x(2.2)} 21.8`, 3),
  ]
}

const STOCK = fill('M1.2 18.4 L7 13.8 L9.2 16.2 L3.6 21.4 Z')

const DRAWINGS: Record<IconName, Drawing> = {
  // the line infantry's shako: its body, a short peak, the plume, band and plate
  foot: {
    box: 24,
    strokes: [
      fill('M6.4 5.6 H17.6 L16.8 17.6 H7.2 Z'),
      fill('M7 17.6 H17 L17.9 19.4 Q12 21 6.1 19.4 Z'),
      fill('M10.6 1.4 Q12 0 13.4 1.4 L12.9 5.6 H11.1 Z'),
      cut('M6.9 8.6 H17.1', 1.3),
      cut('M12 10.6 L14 12.9 L12 15.2 L10 12.9 Z', 1.3),
    ],
  },
  // the light infantry's hunting horn (the badge of light infantry): the coiled tube, its bell, its cord
  'foot-light': {
    box: 24,
    strokes: [
      line('M4.4 12.6 A6.2 6.2 0 1 0 16.8 12.6 A6.2 6.2 0 1 0 4.4 12.6', 2.4),
      fill('M16.2 8.4 L22.6 4.6 V20.6 L16.2 16.8 Z'),
      line('M4.4 12.6 H1.4', 2.4),
      line('M10.6 18.8 Q9.6 22 12.4 23', 1.4),
    ],
  },
  // the heavy cavalry's helmet: the dome, its peak, the comb and the horsehair mane
  'horse-heavy': {
    box: 24,
    strokes: [
      fill('M4.6 16 C4.6 9.6 8 6.8 12 6.8 C16 6.8 19.4 9.6 19.4 16 Z'),
      fill('M3 16 H21 L20 18.4 H4 Z'),
      fill('M7.6 7.6 C8.6 3.4 15.4 3.4 16.4 7.6 Z'),
      line('M15.4 4.6 C20.6 5 22.6 10 22 16.4', 2.2),
      cut('M12 9 V15', 1.2),
    ],
  },
  // the light cavalry's horse: its head and neck, facing left
  'horse-light': {
    box: 24,
    strokes: [
      fill(
        'M12.6 0.8 L14.2 3.4 L15.6 1.2 L16.6 4.6 C19.6 7 21.4 11.6 22.2 23.2 H10.4 C10.8 19.6 11.6 17.4 12.4 15.6 C10.6 16.6 8.6 17.2 6.2 17.4 C4.2 17.6 2.4 16.6 1.8 14.8 C1.4 13.4 2 12.2 3.2 11.2 L9.6 5.6 C10.6 4.6 11.6 3.4 12.6 0.8 Z',
      ),
      cut('M11.2 8.2 L11.4 8.2', 2),
      cut('M3.8 14.2 L3.9 14.2', 1.4),
      cut('M16.4 6 C18.6 10 19.6 15.4 19.8 21.4', 1.2),
    ],
  },
  // the heavy artillery: the staff map's gun, large, with its shot piled by it
  'guns-heavy': {
    box: 24,
    strokes: [
      { ...fill(GUN), transform: 'translate(0 1.5) scale(1.3)' },
      fill('M17.6 21.4 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0'),
      fill('M20.8 21.4 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0'),
      fill('M19.2 18.6 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0'),
    ],
  },
  // the light (horse) artillery: the gun, lighter, under a horseshoe
  'guns-light': {
    box: 24,
    strokes: [
      { ...fill(GUN), transform: 'translate(5 7.4) scale(1.12)' },
      line('M2.6 1.6 V5.6 A3.6 3.6 0 0 0 9.8 5.6 V1.6', 2.2),
    ],
  },
  // crossed sabres: the charge and the melee
  melee: { box: 24, strokes: [...sabre(1), ...sabre(-1)] },
  // a musket with its bayonet: fire by volley
  fire: {
    box: 24,
    strokes: [STOCK, line('M7.6 15.2 L19.6 5.6', 2.4), line('M19.6 5.6 L22.8 3', 1.2), line('M18.4 5 L20 7', 1.6)],
  },
  // a rifle, shorter, no bayonet, slung: aimed fire
  'aimed-fire': {
    box: 24,
    strokes: [
      STOCK,
      line('M7.6 15.2 L18.4 6.6', 2.4),
      fill('M16.4 6.4 L18 4.6 L18.8 6.4 Z'),
      line('M5.6 18.2 Q12.6 19.6 16.2 9.2', 1.2),
    ],
  },
  // fight modes: the range ring with its target; crossed through when holding fire
  'fire-at-will': {
    box: 24,
    strokes: [
      line('M3.5 12 A8.5 8.5 0 1 0 20.5 12 A8.5 8.5 0 1 0 3.5 12', 2),
      fill('M9.6 12 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0'),
      line('M12 1 V4.4 M12 19.6 V23 M1 12 H4.4 M19.6 12 H23', 2),
    ],
  },
  'hold-fire': {
    box: 24,
    strokes: [
      line('M3.5 12 A8.5 8.5 0 1 0 20.5 12 A8.5 8.5 0 1 0 3.5 12', 2),
      fill('M9.6 12 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0'),
      line('M4 20 L20 4', 2.4),
    ],
  },
  // shapes: each rank a line
  line: { box: 24, strokes: ranks(2, 22, [7.5, 12, 16.5]) },
  column: { box: 24, strokes: ranks(7, 17, steps(4, 4, 5)) },
  march: { box: 24, strokes: ranks(10, 14, steps(2, 3.3, 7)) },
  square: { box: 24, strokes: [line('M3 3 H21 V21 H3 Z', 2.2), line('M8 8 H16 V16 H8 Z', 2.2)] },
  skirmish: {
    box: 24,
    strokes: [
      ...[
        [2, 8.6],
        [8, 10.4],
        [14, 8.2],
        [19.4, 10],
        [4.6, 15],
        [11, 16.2],
        [17, 14.4],
      ].map(([x, y]) => line(`M${x} ${y} h3`, 2.2)),
    ],
  },
  unlimbered: { box: 15, strokes: [fill(GUN), line('M13.4 1.2 Q15 4.2 13.4 7.2')] },
  limbered: { box: 15, strokes: [fill(GUN), fill('M0 1 H3.4 V4.2 H0 Z'), line('M3.4 2.6 H4.4')] },
  // metrics
  toughness: { box: 24, strokes: [fill('M5 3 H19 V11 C19 16 15.5 19.5 12 21.5 C8.5 19.5 5 16 5 11 Z')] },
  morale: { box: 24, strokes: [line('M6 2.5 V21.5'), fill('M6.8 3.4 H19.4 L16.2 7.6 L19.4 11.8 H6.8 Z')] },
  fatigue: {
    box: 24,
    strokes: [
      fill('M6 2.5 H18 V4.2 L13.2 11.4 V12.6 L18 19.8 V21.5 H6 V19.8 L10.8 12.6 V11.4 L6 4.2 Z'),
      cut('M9 5.2 H15'),
    ],
  },
}

/** The strokes and box of icon `name`. */
export function iconDrawing(name: IconName): Drawing {
  return DRAWINGS[name]
}

/** The category icon of a unit with `tags` (the unit model's: foot, horse, guns; light, heavy). Guns come first, so
 *  horse artillery is light artillery; cavalry is heavy unless tagged light. */
export function categoryIcon(tags: readonly string[]): CategoryIcon {
  const light = tags.includes('light')
  if (tags.includes('guns')) return light || tags.includes('horse') ? 'guns-light' : 'guns-heavy'
  if (tags.includes('horse')) return light ? 'horse-light' : 'horse-heavy'
  return light ? 'foot-light' : 'foot'
}

/** Icon `name` as an element: the glyph, its `label` as tooltip and accessible name; `size` picks the theme's size
 *  (`icon-s` 16, `icon-m` 24, `icon-l` 36 px). */
export function icon(name: IconName, label: string, size: 's' | 'm' | 'l' = 'm'): HTMLElement {
  const drawing = DRAWINGS[name]
  const width = drawing.box === 15 ? 1.1 : 1.8
  const svg = glyph(drawing.strokes, drawing.box, 'icon-glyph', label, width)
  return h('span', { class: `icon icon-${size}`, 'data-tip': label, 'data-icon': name }, svg)
}
