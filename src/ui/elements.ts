// Builders for the theme's elements that are made in code (src/ui/theme.css): the roster card, the bar and the unit
// card.
// The screens and the specimen sheet (app/ui-kit.html) share them, so the sheet shows what the game draws.
import { h } from './dom.ts'
import { icon, type ActionIcon, type ArmIcon, type MetricIcon, type ShapeIcon } from './icons.ts'
import { levelMarker } from './levels.ts'
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
 *  `max`, drawn in its state; `vertical` fills it from the bottom (the unit cards' bars). */
export function bar(metric: string, value: number, max: number, highIsBad = false, vertical = false): HTMLElement {
  const share = barShare(value, max)
  const state = barState(share, highIsBad)
  const aria = { role: 'meter', 'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': String(max) }
  const classes = ['bar', vertical ? 'vertical' : '', state === 'ok' ? '' : state].filter(Boolean).join(' ')
  const node = h('div', { class: classes, 'data-metric': metric, ...aria }, h('i'))
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

/** One of a unit's metrics as its card shows it. */
export interface UnitMetric {
  metric: MetricIcon
  label: string
  value: number
  max: number
  /** worse when full (fatigue) */
  highIsBad?: boolean
}

/** What a unit card shows; every label is the ruleset's or the scenario's words (decision 0015). */
export interface UnitCardData {
  image: string
  name: string
  detail: string
  arm: ArmIcon
  armLabel: string
  level: number
  levelLabel: string
  shape: ShapeIcon
  shapeLabel: string
  actions: { icon: ActionIcon; label: string }[]
  metrics: UnitMetric[]
}

/** The unit card's layouts: `portrait` (a large painting, its bars beside it, icons under it), `battle` (the
 *  compact card of the battle's unit bar: icons over the painting, the name only as a tooltip), `panel` (the selected
 *  unit: the painting, its bars, then icons with their words as subtitles). */
export type UnitCardVariant = 'portrait' | 'battle' | 'panel'

/** The three bars standing side by side, each under its metric's icon, filled from the bottom. */
export function verticalBars(metrics: readonly UnitMetric[], iconSize: 's' | 'm' = 's'): HTMLElement {
  const columns = metrics.map(m => {
    const tip = `${m.label} · ${m.value} / ${m.max}`
    const column = h('div', { class: 'vbar', 'data-tip': tip }, icon(m.metric, m.label, iconSize))
    column.append(bar(m.metric, m.value, m.max, m.highIsBad, true))
    return column
  })
  return h('div', { class: 'vbars' }, ...columns)
}

/** The unit's icons: arm, level, shape, then its actions; `captioned` writes each one's word under it. */
function unitIcons(unit: UnitCardData, size: 's' | 'm' | 'l', captioned: boolean): HTMLElement {
  const marker = h(
    'span',
    { class: `icon icon-${size}`, 'data-tip': unit.levelLabel },
    levelMarker(unit.level, unit.levelLabel),
  )
  const items: [HTMLElement, string][] = [
    [icon(unit.arm, unit.armLabel, size), unit.armLabel],
    [marker, unit.levelLabel],
    [icon(unit.shape, unit.shapeLabel, size), unit.shapeLabel],
    ...unit.actions.map((a): [HTMLElement, string] => [icon(a.icon, a.label, size), a.label]),
  ]
  const cells = items.map(([el, word]) =>
    captioned ? h('figure', { class: 'icon-cap' }, el, h('figcaption', { class: 'mono' }, word)) : el,
  )
  return h('div', { class: 'unit-icons' }, ...cells)
}

/** A unit card in `variant`. */
export function unitCard(unit: UnitCardData, variant: UnitCardVariant): HTMLElement {
  const img = h('img', { src: unit.image, alt: unit.name })
  if (variant === 'battle') {
    const pic = h(
      'div',
      { class: 'ucard-pic' },
      img,
      h('span', { class: 'chip-tl' }, icon(unit.arm, unit.armLabel, 's')),
      h('span', { class: 'chip-tr', 'data-tip': unit.levelLabel }, levelMarker(unit.level, unit.levelLabel)),
      h('span', { class: 'chip-bl' }, icon(unit.shape, unit.shapeLabel, 's')),
    )
    const tip = `${unit.name} · ${unit.detail}`
    return h('button', { class: 'ucard battle frame', 'data-tip': tip }, pic, verticalBars(unit.metrics))
  }
  const pic = h('div', { class: 'ucard-pic' }, img)
  const body = h('div', { class: 'ucard-body' }, pic, verticalBars(unit.metrics, variant === 'panel' ? 'm' : 's'))
  const name = h('div', { class: 'ucard-name display' }, unit.name)
  const sub = h('div', { class: 'ucard-sub mono' }, unit.detail)
  if (variant === 'portrait') {
    return h('article', { class: 'ucard portrait' }, body, unitIcons(unit, 'm', false), name, sub)
  }
  const text = h('div', { class: 'ucard-text' }, name, sub, unitIcons(unit, 'l', true))
  return h('article', { class: 'ucard panel frame' }, body, text)
}
