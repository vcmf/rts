// Builders for the theme's elements that are made in code (src/ui/theme.css): the roster card and the bar.
// The screens and the specimen sheet (app/ui-kit.html) share them, so the sheet shows what the game draws.
import { h } from './dom.ts'
import { historyImage } from './images.ts'
import { captionOf } from './plate.ts'
import type { Entry } from './roster.ts'

/** A bar's state: low and critical when the metric is that far toward its bad end (low strength, high fatigue). */
export type BarState = 'ok' | 'low' | 'critical'

/** Where low and critical begin, as the share of the way toward the bad end. */
export const BAR_LOW = 0.65
export const BAR_CRITICAL = 0.85

/** The share of `max` that `value` fills, clamped to 0–1 (0 for a value or max that is not a positive number). */
export function barShare(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.min(1, value / max)
}

/** The state of a bar at `share`; `highIsBad` for a metric that is worse when full (fatigue). */
export function barState(share: number, highIsBad = false): BarState {
  const badness = highIsBad ? share : 1 - share
  if (badness >= BAR_CRITICAL) return 'critical'
  return badness >= BAR_LOW ? 'low' : 'ok'
}

/** A continuous bar of `metric` (toughness, morale, fatigue: its colour in src/ui/theme.css) showing `value` of
 *  `max`, drawn in its state. */
export function bar(metric: string, value: number, max: number, highIsBad = false): HTMLElement {
  const share = barShare(value, max)
  const state = barState(share, highIsBad)
  const aria = { role: 'meter', 'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': String(max) }
  const node = h('div', { class: state === 'ok' ? 'bar' : `bar ${state}`, 'data-metric': metric, ...aria }, h('i'))
  node.style.setProperty('--share', `${share * 100}%`)
  return node
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
