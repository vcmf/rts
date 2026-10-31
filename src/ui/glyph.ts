// Ink glyphs drawn as inline SVG: the experience markers (src/ui/levels.ts) and the icons (src/ui/icons.ts). A glyph
// is a list of strokes on a square box; its ink is the element's `color`, so it follows the theme and the army.

/** One stroke of a glyph: an ink line, an ink fill, or a cut (a line in paper, across what is filled). */
export interface Stroke {
  d: string
  mode: 'line' | 'fill' | 'cut'
  /** this line's width in the box's units, when not the glyph's */
  width?: number
}

export const line = (d: string, width?: number): Stroke => ({ d, mode: 'line', width })
export const fill = (d: string): Stroke => ({ d, mode: 'fill' })
export const cut = (d: string, width?: number): Stroke => ({ d, mode: 'cut', width })

const SVG = 'http://www.w3.org/2000/svg'

/** `strokes` as an inline SVG on a `box` × `box` view, with `className`, labelled `label` for assistive tech. Lines
 *  are `width` units wide (in the box's units). */
export function glyph(strokes: readonly Stroke[], box: number, className: string, label: string, width = 1.6) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  for (const stroke of strokes) svg.append(strokeElement(stroke, width))
  return svg
}

function strokeElement(stroke: Stroke, width: number): SVGPathElement {
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', stroke.d)
  path.setAttribute('fill', stroke.mode === 'fill' ? 'currentColor' : 'none')
  path.setAttribute('stroke', stroke.mode === 'fill' ? 'none' : 'currentColor')
  // a cut is paper: the theme colours it (`.cut`), which an SVG attribute cannot read
  if (stroke.mode === 'cut') path.setAttribute('class', 'cut')
  path.setAttribute('stroke-width', String(stroke.width ?? width))
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  return path
}
