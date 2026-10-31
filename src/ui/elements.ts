// Builders for the theme's elements that are made in code (src/ui/theme.css): the roster card and the meter.
// The screens and the specimen sheet (app/ui-kit.html) share them, so the sheet shows what the game draws.
import { h } from './dom.ts'
import { historyImage } from './images.ts'
import { captionOf } from './plate.ts'
import type { Entry } from './roster.ts'

/** A meter's cells (the theme's `.meter` grid, src/ui/theme.css). */
export const METER_CELLS = 10

/** How many of a meter's cells a `value` of `max` fills: rounded to the nearest, at least one for any value above
 *  zero (a unit with a few men left still shows them), never more than all. */
export function meterCells(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  const filled = Math.round((value / max) * METER_CELLS)
  return Math.min(METER_CELLS, Math.max(1, filled))
}

/** A meter showing `value` of `max`; `low` draws its filled cells in the accent. */
export function meter(value: number, max: number, low = false): HTMLElement {
  const filled = meterCells(value, max)
  const cells = Array.from({ length: METER_CELLS }, (_, i) => h('i', { class: i < filled ? 'on' : undefined }))
  const aria = { role: 'meter', 'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': String(max) }
  return h('div', { class: low ? 'meter low' : 'meter', ...aria }, ...cells)
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
