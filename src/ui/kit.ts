// The specimen sheet (app/ui-kit.html): fills the samples that come from data (the army colours, cards, meters) and
// makes the settings controls and the dialog live. docs/systems/front-menu.md ("The specimen sheet").
import { find, h, paintArmy } from './dom.ts'
import { bar, barText, card, unitCard, type ModeGroup, type UnitCardData } from './elements.ts'
import { CATEGORY_ICONS, FIGHT_ICONS, METRIC_ICONS, SHAPE_ICONS, WEAPON_ICONS, icon, type IconName } from './icons.ts'
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

/** The bars section: each metric as a horizontal bar with its current and max, in the one style every bar has. */
function barSamples(): HTMLElement[] {
  const samples: [string, string, number, number][] = [
    ['Toughness', 'toughness', 812, 900],
    ['Morale', 'morale', 64, 100],
    ['Fatigue', 'fatigue', 71, 100],
  ]
  return samples.flatMap(([name, metric, value, max]) => [
    h('span', { class: 'mono' }, name),
    bar(metric, value, max),
    h('span', { class: 'bar-value' }, barText(value, max)),
  ])
}

/** The markers of the roster's levels, each at 40 and 16 px with its name (the ruleset's). */
function levelCells(names: readonly string[]): HTMLElement[] {
  return names.map((name, i) => {
    const big = levelMarker(i + 1, name)
    big.classList.add('big')
    return h('figure', {}, big, levelMarker(i + 1, name), h('figcaption', { class: 'mono' }, name))
  })
}

/** The sample units as the page's data gives them (#sample-units): the mode groups each kind of unit has, and each
 *  unit with its painting named by roster id, its kind's groups and the option set in each. */
interface SampleData {
  modeSets: Record<string, Omit<ModeGroup, 'current'>[]>
  units: (Omit<UnitCardData, 'image' | 'levelLabel' | 'modes'> & {
    regiment: string
    army: number
    modes: string
    set: number[]
  })[]
}

/** The page's sample units, made into card data with the roster's paintings and level names. */
function sampleUnits(roster: Roster): { unit: UnitCardData; army: number }[] {
  const data: SampleData = JSON.parse(find('#sample-units').textContent ?? '{}')
  return data.units.flatMap(({ regiment, army, modes, set, ...rest }) => {
    const entry = entryById(roster, 'regiments', regiment)
    if (!entry) return []
    const groups = (data.modeSets[modes] ?? []).map((g, i) => ({ ...g, current: set[i] ?? 0 }))
    const levelLabel = roster.levels[rest.level - 1] ?? ''
    return [{ unit: { ...rest, modes: groups, image: historyImage(entry.image), levelLabel }, army }]
  })
}

/** Section 11: the unit bar's battle cards (click one to select it), the selected unit's panel, where its modes are
 *  set (the cards follow), and the same units as portrait cards. */
function battleSections(roster: Roster): void {
  const units = sampleUnits(roster)
  const colour = (army: number) => roster.nations[army]?.colour ?? ''
  let selected = 0
  const draw = () => {
    const cards = units.map(({ unit, army }, i) => {
      const card = paintArmy(unitCard(unit, 'battle'), colour(army))
      card.classList.toggle('sel', i === selected)
      card.addEventListener('click', () => {
        selected = i
        draw()
      })
      return card
    })
    find('[data-slot=battle-cards]').replaceChildren(...cards)
    const { unit, army } = units[selected]
    const setMode = (group: number, option: number) => {
      unit.modes[group].current = option
      draw()
    }
    find('[data-slot=panel]').replaceChildren(paintArmy(unitCard(unit, 'panel', setMode), colour(army)))
  }
  draw()
  const portraits = units.slice(0, 3).map(({ unit, army }) => paintArmy(unitCard(unit, 'portrait'), colour(army)))
  find('[data-slot=portraits]').replaceChildren(...portraits)
}

/** Section 13: every icon by group, at 36 px, its name under it in small type. */
function iconGroups(): HTMLElement[] {
  const groups: [string, readonly IconName[]][] = [
    ['Categories', CATEGORY_ICONS],
    ['Weapon mode', WEAPON_ICONS],
    ['Fight mode', FIGHT_ICONS],
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
