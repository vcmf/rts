// The specimen sheet (app/ui-kit.html): fills the samples that come from data (the army colours, cards, meters) and
// makes the settings controls and the dialog live. docs/systems/front-menu.md ("The specimen sheet").
import { find, h, paintArmy } from './dom.ts'
import { card, meter } from './elements.ts'
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

function fillMeters(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-meter]')) {
    // data-meter="<value>/<max>"
    const [value, max] = (node.dataset.meter ?? '0/1').split('/').map(Number)
    node.replaceWith(meter(value, max, node.classList.contains('low')))
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
  fillMeters()
  liveSwitches()
  liveRanges()
  liveSegments()
  liveDialog()
}

void main()
