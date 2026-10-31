// The specimen sheet (app/ui-kit.html): fills the samples that come from data (the army colours, cards, meters) and
// makes the settings controls and the dialog live. docs/systems/front-menu.md ("The specimen sheet").
import { find, h, paintArmy } from './dom.ts'
import { bar, barShare, barState, card, unitCard, type UnitCardData } from './elements.ts'
import { ACTION_ICONS, ARM_ICONS, METRIC_ICONS, SHAPE_ICONS, icon, type IconName } from './icons.ts'
import { levelMarker } from './levels.ts'
import { historyImage } from './images.ts'
import { loadRoster } from './load.ts'
import { entryById, isRegiment, type Roster } from './roster.ts'

/** Paints every `[data-army=<i>]` with the roster's i-th army. */
function paintArmies(roster: Roster): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-army]')) {
    const nation = roster.nations[Number(node.dataset.army)]
    if (nation) paintArmy(node, nation.colour)
  }
}

function armySwatches(roster: Roster): HTMLElement[] {
  return roster.nations.map(nation => {
    const swatch = h('i', { style: `background: ${nation.colour}` })
    const label = h('figcaption', { class: 'mono' }, nation.name, h('br'), h('span', {}, `${nation.colour} · army`))
    return h('figure', {}, swatch, label)
  })
}

/** The cards: a commander, a regiment, and a regiment drawn as hovered. */
function sampleCards(roster: Roster): HTMLElement[] {
  const commander = entryById(roster, 'commanders', roster.featured.commanders)
  const featured = entryById(roster, 'regiments', roster.featured.regiments)
  const regiment = featured && isRegiment(featured) ? featured : undefined
  // a regiment of another arm from the same army, to show the hover beside the rest
  const hovered = roster.regiments.find(r => r.nation === regiment?.nation && r.arm !== regiment.arm) ?? regiment
  const samples = [commander, regiment, hovered].flatMap((entry, i) => (entry ? [card(entry, i)] : []))
  samples[2]?.classList.add('is-hover')
  return samples
}

/** A bar and its value, from `data-bar="<metric> <value>/<max>[ high]"` (high: worse when full). */
function barRow(spec: string): HTMLElement[] {
  const [metric, amount, high] = spec.split(' ')
  const [value, max] = amount.split('/').map(Number)
  const state = barState(barShare(value, max), high === 'high')
  const label = h('span', { class: state === 'critical' ? 'bar-value critical' : 'bar-value' }, String(value))
  return [bar(metric, value, max, high === 'high'), label]
}

function fillBars(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-bar]')) {
    node.replaceWith(...barRow(node.dataset.bar ?? ''))
  }
}

/** Each metric at rest, low and critical: the bars section's grid. */
function barSamples(): HTMLElement[] {
  const samples: [string, string, string[]][] = [
    ['Toughness', 'toughness', ['812/900', '260/900', '90/900']],
    ['Morale', 'morale', ['72/100', '30/100', '10/100']],
    ['Fatigue', 'fatigue', ['20/100 high', '70/100 high', '92/100 high']],
  ]
  const head = ['', 'Rest', 'Low', 'Critical'].map(t => h('span', { class: 'mono pencil' }, t))
  const rows = samples.flatMap(([name, metric, amounts]) => [
    h('span', { class: 'mono' }, name),
    ...amounts.map(a => h('span', { class: 'bar-cell' }, ...barRow(`${metric} ${a}`))),
  ])
  return [...head, ...rows]
}

/** The markers of the roster's levels, each at 40 and 16 px with its name (the ruleset's). */
function levelCells(names: readonly string[]): HTMLElement[] {
  return names.map((name, i) => {
    const big = levelMarker(i + 1, name)
    big.classList.add('big')
    return h('figure', {}, big, levelMarker(i + 1, name), h('figcaption', { class: 'mono' }, name))
  })
}

/** A sample unit as the page's data gives it (#sample-units): a unit card's data, its painting named by roster id. */
interface SampleUnit extends Omit<UnitCardData, 'image' | 'levelLabel'> {
  regiment: string
  army: number
}

/** The page's sample units, made into card data with the roster's paintings and level names. */
function sampleUnits(roster: Roster): { unit: UnitCardData; army: number }[] {
  const samples: SampleUnit[] = JSON.parse(find('#sample-units').textContent ?? '[]')
  return samples.flatMap(({ regiment, army, ...rest }) => {
    const entry = entryById(roster, 'regiments', regiment)
    if (!entry) return []
    const levelLabel = roster.levels[rest.level - 1] ?? ''
    return [{ unit: { ...rest, image: historyImage(entry.image), levelLabel }, army }]
  })
}

/** Section 11: the unit bar's battle cards (click one to select it), the selected unit's panel and its orders, and
 *  the same units as portrait cards. */
function battleSections(roster: Roster): void {
  const units = sampleUnits(roster)
  const colour = (army: number) => roster.nations[army]?.colour ?? ''
  const panel = find('[data-slot=panel]')
  const cards = units.map(({ unit, army }) => paintArmy(unitCard(unit, 'battle'), colour(army)))
  const select = (i: number) => {
    cards.forEach((c, j) => c.classList.toggle('sel', i === j))
    const card = paintArmy(unitCard(units[i].unit, 'panel'), colour(units[i].army))
    find('.ucard-text', card).append(h('div', { class: 'orders' }, ...orderButtons()))
    panel.replaceChildren(card)
  }
  cards.forEach((c, i) => c.addEventListener('click', () => select(i)))
  find('[data-slot=battle-cards]').replaceChildren(...cards)
  select(0)
  const portraits = units.slice(0, 3).map(({ unit, army }) => paintArmy(unitCard(unit, 'portrait'), colour(army)))
  find('[data-slot=portraits]').replaceChildren(...portraits)
}

/** The orders as icon buttons: the icon leads, its word and key are the tooltip. */
function orderButtons(): HTMLElement[] {
  const orders: [IconName, string, string][] = [
    ['line', 'Line', 'L'],
    ['column', 'Column', 'C'],
    ['square', 'Square', 'Q'],
    ['skirmish', 'Skirmish', 'K'],
    ['fire', 'Fire', 'F'],
    ['melee', 'Charge', 'G'],
  ]
  return orders.map(([name, word, key]) => {
    const button = h('button', { class: 'btn order', 'data-tip': `${word} · ${key}`, 'aria-label': word })
    button.append(icon(name, word, 'm'), h('span', { class: 'key' }, key))
    return button
  })
}

/** Section 13: every icon by group, at 36 px, its name under it in small type. */
function iconGroups(): HTMLElement[] {
  const groups: [string, readonly IconName[]][] = [
    ['Arms', ARM_ICONS],
    ['Actions', ACTION_ICONS],
    ['Shapes', SHAPE_ICONS],
    ['Metrics', METRIC_ICONS],
  ]
  return groups.map(([title, names]) => {
    const cells = names.map(name =>
      h(
        'figure',
        { class: 'icon-cap' },
        icon(name, name, 'l'),
        icon(name, name, 's'),
        h('figcaption', { class: 'mono' }, name),
      ),
    )
    return h(
      'div',
      { class: 'icon-group' },
      h('div', { class: 'mono pencil' }, title),
      h('div', { class: 'icon-row' }, ...cells),
    )
  })
}

function liveSwitches(): void {
  for (const sw of document.querySelectorAll<HTMLButtonElement>('.switch')) {
    sw.addEventListener('click', () => {
      const on = sw.getAttribute('aria-checked') !== 'true'
      sw.setAttribute('aria-checked', String(on))
      find('[data-label]', sw).textContent = on ? 'On' : 'Off'
    })
  }
}

/** A range shows its value and inks its track up to the needle. */
function liveRanges(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>('.range input')) {
    const output = input.parentElement?.querySelector('output')
    const show = () => {
      const share = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))
      input.style.setProperty('--fill', `${share * 100}%`)
      if (output) output.textContent = input.value
    }
    input.addEventListener('input', show)
    show()
  }
}

function liveSegments(): void {
  for (const group of document.querySelectorAll<HTMLElement>('.seg')) {
    const buttons = [...group.querySelectorAll('button')]
    for (const button of buttons) {
      button.addEventListener('click', () => {
        for (const b of buttons) b.setAttribute('aria-pressed', String(b === button))
      })
    }
  }
}

function liveDialog(): void {
  const veil = find('[data-slot=veil]')
  const close = () => (veil.hidden = true)
  find('[data-open=dialog]').addEventListener('click', () => {
    veil.hidden = false
    find<HTMLButtonElement>('[data-close]', veil).focus()
  })
  for (const button of veil.querySelectorAll('[data-close]')) button.addEventListener('click', close)
  veil.addEventListener('click', event => event.target === veil && close())
  document.addEventListener('keydown', event => event.key === 'Escape' && close())
}

async function main(): Promise<void> {
  const roster = await loadRoster()
  paintArmies(roster)
  find('[data-slot=armies]').replaceChildren(...armySwatches(roster))
  const cards = find('[data-slot=cards]')
  paintArmy(cards, roster.nations[0].colour)
  cards.replaceChildren(...sampleCards(roster))
  fillBars()
  find('[data-slot=bars]').replaceChildren(...barSamples())
  find('[data-slot=levels]').replaceChildren(...levelCells(roster.levels))
  battleSections(roster)
  find('[data-slot=icons]').replaceChildren(...iconGroups())
  liveSwitches()
  liveRanges()
  liveSegments()
  liveDialog()
}

void main()
