// Builders for the theme's elements that are made in code (src/ui/theme.css): the roster card, the bar and the unit
// card.
// The screens and the specimen sheet (app/ui-kit.html) share them, so the sheet shows what the game draws.
import { h } from './dom.ts'
import { icon, type CategoryIcon, type IconName, type MetricIcon } from './icons.ts'
import { levelMarker } from './levels.ts'
import { historyImage } from './images.ts'
import { captionOf } from './plate.ts'
import type { Entry } from './roster.ts'

/** The share of `max` that `value` fills, clamped to 0–1 (0 for a value or max that is not a positive number). */
export function barShare(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.min(1, value / max)
}

/** What a bar writes beside itself, always: "<current>/<max>" in whole numbers (men left of the battalion's, the
 *  morale bar's points, fatigue). A current value below zero is written 0. */
export function barText(value: number, max: number): string {
  const current = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  return `${current}/${Number.isFinite(max) ? Math.round(max) : 0}`
}

/** A continuous bar of `metric` (toughness, morale, fatigue: its colour in src/ui/theme.css) showing `value` of
 *  `max`, one plain style for every unit and value; `vertical` fills it from the bottom (the unit cards' bars). */
export function bar(metric: string, value: number, max: number, vertical = false): HTMLElement {
  const aria = { role: 'meter', 'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': String(max) }
  const node = h('div', { class: vertical ? 'bar vertical' : 'bar', 'data-metric': metric, ...aria }, h('i'))
  node.style.setProperty('--share', `${barShare(value, max) * 100}%`)
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
}

/** One choice of a mode: its icon, its word (the tooltip) and its key. */
export interface ModeOption {
  icon: IconName
  label: string
  key?: string
}

/** A group of choices the player sets on a unit (its formation, weapon mode, fight mode), and the one set now. */
export interface ModeGroup {
  name: string
  options: ModeOption[]
  current: number
}

/** The option `group` has set (its first when `current` is out of range). */
export function currentMode(group: ModeGroup): ModeOption {
  return group.options[group.current] ?? group.options[0]
}

/** What a unit card shows; every word is the ruleset's or the scenario's (decision 0015). */
export interface UnitCardData {
  image: string
  name: string
  detail: string
  category: CategoryIcon
  categoryLabel: string
  level: number
  levelLabel: string
  modes: ModeGroup[]
  metrics: UnitMetric[]
}

/** The unit card's layouts: `portrait` (a large painting, its bars beside it, icons under it), `battle` (the
 *  compact card of the battle's unit bar: icons over the painting, the name only as a tooltip), `panel` (the selected
 *  unit: the painting, its bars, then its icons and its modes to set). */
export type UnitCardVariant = 'portrait' | 'battle' | 'panel'

/** The three bars standing side by side, each under its metric's icon, filled from the bottom, its value under it
 *  as current over max. */
export function verticalBars(metrics: readonly UnitMetric[], iconSize: 's' | 'm' = 's'): HTMLElement {
  const columns = metrics.map(m => {
    const [current, max] = barText(m.value, m.max).split('/')
    const value = h(
      'span',
      { class: 'vbar-value mono' },
      h('span', {}, current),
      h('span', { class: 'max' }, `/${max}`),
    )
    const column = h('div', { class: 'vbar', 'data-tip': `${m.label} · ${current}/${max}` })
    column.append(icon(m.metric, m.label, iconSize), bar(m.metric, m.value, m.max, true), value)
    return column
  })
  return h('div', { class: 'vbars' }, ...columns)
}

/** The unit's icons: category, level, then (`withModes`) the option each mode group has set; `captioned` writes each
 *  one's word under it. */
function unitIcons(unit: UnitCardData, size: 's' | 'm' | 'l', captioned: boolean, withModes = true): HTMLElement {
  const marker = h(
    'span',
    { class: `icon icon-${size}`, 'data-tip': unit.levelLabel },
    levelMarker(unit.level, unit.levelLabel),
  )
  const set = withModes ? unit.modes.map(currentMode) : []
  const items: [HTMLElement, string][] = [
    [icon(unit.category, unit.categoryLabel, size), unit.categoryLabel],
    [marker, unit.levelLabel],
    ...set.map((o): [HTMLElement, string] => [icon(o.icon, o.label, size), o.label]),
  ]
  const cells = items.map(([el, word]) =>
    captioned ? h('figure', { class: 'icon-cap' }, el, h('figcaption', { class: 'mono' }, word)) : el,
  )
  return h('div', { class: 'unit-icons' }, ...cells)
}

/** A mode group as icon toggles: its options side by side, the set one pressed; `choose` runs with the option's
 *  index when the player picks one. */
function modeToggles(group: ModeGroup, choose: (index: number) => void): HTMLElement {
  const buttons = group.options.map((option, i) => {
    const tip = option.key ? `${option.label} · ${option.key}` : option.label
    const button = h('button', { class: 'mode', 'aria-pressed': String(i === group.current), 'data-tip': tip })
    button.append(icon(option.icon, option.label, 'm'))
    if (option.key) button.append(h('span', { class: 'key' }, option.key))
    button.addEventListener('click', () => choose(i))
    return button
  })
  return h(
    'div',
    { class: 'mode-group' },
    h('span', { class: 'mono' }, group.name),
    h('div', { class: 'modes' }, ...buttons),
  )
}

/** The battle card's painting: the category and level on paper chips at the top, the modes set along the bottom. */
function battlePicture(unit: UnitCardData, img: HTMLElement): HTMLElement {
  const modes = unit.modes.map(currentMode).map(o => icon(o.icon, o.label, 's'))
  return h(
    'div',
    { class: 'ucard-pic' },
    img,
    h('span', { class: 'chip chip-tl' }, icon(unit.category, unit.categoryLabel, 's')),
    h('span', { class: 'chip chip-tr', 'data-tip': unit.levelLabel }, levelMarker(unit.level, unit.levelLabel)),
    h('span', { class: 'chip chip-bottom' }, ...modes),
  )
}

/** A unit card in `variant`; on the panel, `onMode(group, option)` runs when the player sets a mode. */
export function unitCard(
  unit: UnitCardData,
  variant: UnitCardVariant,
  onMode?: (group: number, option: number) => void,
): HTMLElement {
  const img = h('img', { src: unit.image, alt: unit.name })
  if (variant === 'battle') {
    const tip = `${unit.name} · ${unit.detail}`
    return h('button', { class: 'ucard battle', 'data-tip': tip }, battlePicture(unit, img), verticalBars(unit.metrics))
  }
  const pic = h('div', { class: 'ucard-pic' }, img)
  const body = h('div', { class: 'ucard-body' }, pic, verticalBars(unit.metrics, variant === 'panel' ? 'm' : 's'))
  const name = h('div', { class: 'ucard-name display' }, unit.name)
  const sub = h('div', { class: 'ucard-sub mono' }, unit.detail)
  if (variant === 'portrait') {
    return h('article', { class: 'ucard portrait' }, body, unitIcons(unit, 'm', false), name, sub)
  }
  const head = unitIcons(unit, 'l', true, false)
  const toggles = unit.modes.map((group, g) => modeToggles(group, option => onMode?.(g, option)))
  const text = h('div', { class: 'ucard-text' }, name, sub, head, h('div', { class: 'mode-groups' }, ...toggles))
  return h('article', { class: 'ucard panel frame' }, body, text)
}
