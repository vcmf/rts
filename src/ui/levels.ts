// A unit's experience level as a marker: six ink glyphs that read as an ordered scale at 14–16 px, without colour.
// The levels are the unit model's, 1 to 6 (docs/proposals/unit-model.md § Experience: three of the line, then three
// of the Guard); their names are a ruleset's, not this file's (decision 0015). Every series draws the line's levels
// as counted marks and the Guard's as one family of a star, so the step into the Guard reads as a change of kind.
// Three candidate series (the plan's open questions, docs/plans/active/front-menu.md). Drawn on a 16 × 16 box.

/** One stroke of a glyph: drawn as an ink line, an ink fill, or cut out of the fill in paper. */
export interface Stroke {
  d: string
  mode: 'line' | 'fill' | 'cut'
}

export type LevelSeries = 'sleeve' | 'shield' | 'honours'
export const LEVEL_SERIES: readonly LevelSeries[] = ['sleeve', 'shield', 'honours']
/** The unit model's levels: 1 to LEVELS. */
export const LEVELS = 6

const line = (d: string): Stroke => ({ d, mode: 'line' })
const fill = (d: string): Stroke => ({ d, mode: 'fill' })
const cut = (d: string): Stroke => ({ d, mode: 'cut' })

/** A chevron pointing up, its apex at (8, `y`), 10 wide and 3.5 high. */
const chevron = (y: number) => line(`M3 ${y + 3.5} L8 ${y} L13 ${y + 3.5}`)

/** A filled chevron 12 wide, `t` thick, its apex at (8, `y`). */
const solidChevron = (y: number, t = 2.4) =>
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

const ring = (r: number) => line(`M${8 - r} 8 A${r} ${r} 0 1 0 ${8 + r} 8 A${r} ${r} 0 1 0 ${8 - r} 8`)
const SHIELD = 'M3 2.5 H13 V8 C13 11.5 10.5 13.5 8 14.8 C5.5 13.5 3 11.5 3 8 Z'
/** The shield made smaller to sit inside a laurel. */
const SMALL_SHIELD = 'M4.8 3.2 H11.2 V8 C11.2 10.4 9.6 11.9 8 12.8 C6.4 11.9 4.8 10.4 4.8 8 Z'

const LAUREL = [line('M3.2 5 C2 9 4 13.4 8 14.6'), line('M12.8 5 C14 9 12 13.4 8 14.6')]
/** A star as an outline (the Young Guard's in Sleeve). */
const starLine = (cx: number, cy: number, r: number) => line(starPath(cx, cy, r))

/** "Sleeve": a ring, one and two service chevrons; then the Guard: a star drawn, filled, filled in a laurel. */
const SLEEVE: Stroke[][] = [
  [ring(2.5)],
  [chevron(6.2)],
  [chevron(4.2), chevron(8.2)],
  [starLine(8, 8.4, 6.6)],
  [fill(starPath(8, 8.4, 7.2))],
  [...LAUREL, fill(starPath(8, 8, 4.6))],
]

/** "Shield": one outline at every level, filling with bars; the Guard's a star: inside the outline, cut out of the
 *  solid shield, then that shield in a laurel. */
const SHIELD_SERIES: Stroke[][] = [
  [line(SHIELD)],
  [line(SHIELD), line('M5.5 7.5 H10.5')],
  [line(SHIELD), line('M5.5 6 H10.5'), line('M5.5 9.5 H10.5')],
  [line(SHIELD), fill(starPath(8, 7.6, 3.4))],
  [fill(SHIELD), cut(starPath(8, 7.6, 3.2))],
  [...LAUREL, fill(SMALL_SHIELD), cut(starPath(8, 7.4, 2.4))],
]

/** "Honours": every mark filled: a bar, one and two chevrons; then the Guard: a star, a star over a bar, a star in
 *  a laurel. */
const HONOURS: Stroke[][] = [
  [fill('M5 7 H11 V9.4 H5 Z')],
  [solidChevron(5)],
  [solidChevron(2.5), solidChevron(8)],
  [fill(starPath(8, 8, 5.6))],
  [fill(starPath(8, 6.6, 5)), fill('M3.5 12.4 H12.5 V14.6 H3.5 Z')],
  [...LAUREL, fill(starPath(8, 8, 4.6))],
]

const SERIES: Record<LevelSeries, Stroke[][]> = { sleeve: SLEEVE, shield: SHIELD_SERIES, honours: HONOURS }

/** The strokes of `level` (1 to LEVELS, clamped) in `series`. */
export function levelGlyph(series: LevelSeries, level: number): Stroke[] {
  const at = Math.min(LEVELS, Math.max(1, Math.round(level)))
  return SERIES[series][at - 1]
}

const SVG = 'http://www.w3.org/2000/svg'

/** The marker of `level` in `series` as an inline SVG (class `level`; ink is its `color`), titled `name`. */
export function levelMarker(series: LevelSeries, level: number, name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'level')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', name)
  for (const stroke of levelGlyph(series, level)) svg.append(strokeElement(stroke))
  return svg
}

function strokeElement(stroke: Stroke): SVGPathElement {
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', stroke.d)
  const width = stroke.mode === 'cut' ? '2' : '1.6'
  path.setAttribute('fill', stroke.mode === 'fill' ? 'currentColor' : 'none')
  // a cut is paper: its colour comes from the theme (`.level .cut`), which an SVG attribute cannot read
  path.setAttribute('stroke', stroke.mode === 'fill' ? 'none' : 'currentColor')
  if (stroke.mode === 'cut') path.setAttribute('class', 'cut')
  path.setAttribute('stroke-width', width)
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  return path
}
