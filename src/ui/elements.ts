// Builders for the theme's elements that are made in code (src/ui/theme.css): the roster card and the meter.
// The screens and the specimen sheet (app/ui-kit.html) share them, so the sheet shows what the game draws.
import { h } from './dom.ts'
import { historyImage } from './images.ts'
import { captionOf } from './plate.ts'
import type { Entry } from './roster.ts'

/** A meter's cells: how many of `cells` a `value` of `max` fills, rounded to the nearest, at least one for any value
 *  above zero (a unit with a few men left still shows them), never more than `cells`. */
export function meterCells(value: number, max: number, cells = 10): number {
  if (!(value > 0) || !(max > 0)) return 0
  const filled = Math.round((value / max) * cells)
  return Math.min(cells, Math.max(1, filled))
}

/** A ten-cell meter with `filled` cells on; `low` draws them in the accent. */
export function meter(filled: number, low = false): HTMLElement {
  const cells = Array.from({ length: 10 }, (_, i) => h('i', { class: i < filled ? 'on' : undefined }))
  return h('div', { class: low ? 'meter low' : 'meter', role: 'meter', 'aria-valuenow': String(filled) }, ...cells)
}

/** A roster card: the framed painting and its caption, the `index`-th of its roster; `open` runs on a click. The
 *  army's colour comes from an ancestor's `--army`. */
export function card(entry: Entry, index: number, open?: () => void): HTMLButtonElement {
  const caption = captionOf(entry, index)
  const img = h('img', { src: historyImage(entry.image), alt: entry.name, loading: 'lazy', decoding: 'async' })
  const button = h(
    'button',
    { class: 'card', 'data-id': entry.id },
    h('div', { class: 'frame' }, img),
    h(
      'div',
      { class: 'cap' },
      h('div', { class: 'fig mono' }, h('span', {}, caption.label), h('span', {}, caption.tag)),
      h('div', { class: 'name display' }, caption.name),
      h('div', { class: 'detail' }, caption.detail),
    ),
  )
  if (open) button.onclick = open
  return button
}
