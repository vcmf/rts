// The specimen sheet (app/ui-kit.html): fills the samples that come from data (the army colours, cards, meters) and
// makes the settings controls and the dialog live. docs/systems/front-menu.md ("The specimen sheet").
import { find, h, paintArmy } from './dom.ts'
import { bar, barShare, barState, card } from './elements.ts'
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

/** The levels' names: the Napoleonic ruleset's (docs/proposals/unit-model.md § Experience), 1 to 6. In the game
 *  they come from the ruleset; the sheet names them here. */
const LEVEL_NAMES = ['Recruits', 'Line', 'Veterans', 'Young Guard', 'Middle Guard', 'Old Guard']
/** The six markers, each at 40 and 16 px with its name. */
function levelCells(): HTMLElement[] {
  return LEVEL_NAMES.map((name, i) => {
    const big = levelMarker(i + 1, name)
    big.classList.add('big')
    return h('figure', {}, big, levelMarker(i + 1, name), h('figcaption', { class: 'mono' }, name))
  })
}

/** Each `data-level="<1–6>"` becomes its marker. */
function fillLevelMarks(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-level]')) {
    const level = Number(node.dataset.level)
    node.replaceWith(levelMarker(level, LEVEL_NAMES[level - 1]))
  }
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
  const regiment = entryById(roster, 'regiments', roster.featured.regiments)
  if (regiment) find<HTMLImageElement>('[data-slot=unit-image]').src = historyImage(regiment.image)
  fillBars()
  find('[data-slot=bars]').replaceChildren(...barSamples())
  find('[data-slot=levels]').replaceChildren(...levelCells())
  fillLevelMarks()
  liveSwitches()
  liveRanges()
  liveSegments()
  liveDialog()
}

void main()
