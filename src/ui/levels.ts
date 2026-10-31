// A unit's experience level as a marker: six ink glyphs, every mark filled, that read as an ordered scale at 14–16 px
// without colour ("Honours", the owner's choice, 2026-10-31). The levels are the unit model's, 1 to 6
// (docs/proposals/unit-model.md § Experience: three of the line, then three of the Guard); their names are a
// ruleset's, not this file's (decision 0015). The line's levels are counted marks (a bar, one and two chevrons) and
// the Guard's one family of a star, so the step into the Guard reads as a change of kind. A 16 × 16 box.

import { fill, glyph, line, type Stroke } from './glyph.ts'

/** The unit model's levels: 1 to LEVELS. */
export const LEVELS = 6

/** A filled chevron 12 wide, `t` thick, its apex at (8, `y`). */
const chevron = (y: number, t = 2.4) =>
  fill(`M2 ${y + 4.5} L8 ${y} L14 ${y + 4.5} V${y + 4.5 + t} L8 ${y + t} L2 ${y + 4.5 + t} Z`)

/** A five-pointed star centred on (`cx`, `cy`), outer radius `r`, as a closed path. */
export function starPath(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.42
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`
  })
  return `M${points.join(' L')} Z`
}

const LAUREL = [line('M3.2 5 C2 9 4 13.4 8 14.6'), line('M12.8 5 C14 9 12 13.4 8 14.6')]

/** The glyph of each level, 1 to 6: a bar, one and two chevrons; a star, a star over a bar, a star in a laurel. */
const GLYPHS: Stroke[][] = [
  [fill('M5 7 H11 V9.4 H5 Z')],
  [chevron(5)],
  [chevron(2.5), chevron(8)],
  [fill(starPath(8, 8, 5.6))],
  [fill(starPath(8, 6.6, 5)), fill('M3.5 12.4 H12.5 V14.6 H3.5 Z')],
  [...LAUREL, fill(starPath(8, 8, 4.6))],
]

/** The strokes of `level` (1 to LEVELS, clamped; a level that is not a number is 1). */
export function levelGlyph(level: number): Stroke[] {
  const known = Number.isFinite(level) ? Math.round(level) : 1
  const at = Math.min(LEVELS, Math.max(1, known))
  return GLYPHS[at - 1]
}

/** The marker of `level` as an inline SVG (class `level`; its ink is the element's `color`), labelled `name`. */
export function levelMarker(level: number, name: string): SVGSVGElement {
  return glyph(levelGlyph(level), 16, 'level', name)
}
