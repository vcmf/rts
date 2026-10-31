// A unit's experience level as a marker: five ink glyphs that read as an ordered scale at 14–16 px, without colour.
// Three candidate series (the plan's open questions, docs/plans/active/front-menu.md); the levels' names are a
// ruleset's, not this file's (decision 0015). Drawn on a 16 × 16 box.

/** One stroke of a glyph: drawn as an ink line, an ink fill, or cut out of the fill in paper. */
export interface Stroke {
  d: string
  mode: 'line' | 'fill' | 'cut'
}

export type LevelSeries = 'sleeve' | 'shield' | 'honours'
export const LEVEL_SERIES: readonly LevelSeries[] = ['sleeve', 'shield', 'honours']
export const LEVELS = 5

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

/** "Sleeve": a ring, one to three service chevrons, then a star (the period's chevrons, then a distinction). */
const SLEEVE: Stroke[][] = [
  [ring(2.5)],
  [chevron(6.2)],
  [chevron(4.2), chevron(8.2)],
  [chevron(2.2), chevron(6.2), chevron(10.2)],
  [fill(starPath(8, 8.4, 7.2))],
]

/** "Shield": one outline at every level, filling with bars, then solid, then solid with a cross cut out. */
const SHIELD_SERIES: Stroke[][] = [
  [line(SHIELD)],
  [line(SHIELD), line('M5.5 7.5 H10.5')],
  [line(SHIELD), line('M5.5 6 H10.5'), line('M5.5 9.5 H10.5')],
  [fill(SHIELD)],
  [fill(SHIELD), cut('M8 4.8 V11.6 M5.2 7.8 H10.8')],
]

/** "Honours": every mark filled: a bar, one and two chevrons, two and a dot, then a star in a laurel. */
const HONOURS: Stroke[][] = [
  [fill('M5 7 H11 V9.4 H5 Z')],
  [solidChevron(5)],
  [solidChevron(2.5), solidChevron(8)],
  [solidChevron(4.5), solidChevron(9.5), fill('M6.6 2.2 A1.4 1.4 0 1 0 9.4 2.2 A1.4 1.4 0 1 0 6.6 2.2')],
  [line('M3.2 5 C2 9 4 13.4 8 14.6'), line('M12.8 5 C14 9 12 13.4 8 14.6'), fill(starPath(8, 8, 4.6))],
]

const SERIES: Record<LevelSeries, Stroke[][]> = { sleeve: SLEEVE, shield: SHIELD_SERIES, honours: HONOURS }

/** The strokes of `level` (0 to LEVELS − 1, clamped) in `series`. */
export function levelGlyph(series: LevelSeries, level: number): Stroke[] {
  const at = Math.min(LEVELS - 1, Math.max(0, Math.round(level)))
  return SERIES[series][at]
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
