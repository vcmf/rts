// A roster screen: the kind tabs, the nation and arm filters, the nation's heading and its grid of cards.
// The frame of the screen (crumbs, tab buttons, empty containers) is in app/menu.html; this fills it per route.
import { find, h, paintArmy } from '../dom.ts'
import { card } from '../elements.ts'
import { ALL_ARMS, KIND_WORDS, countByArm, countByNation, entriesOf, nationOf } from '../roster.ts'
import type { Entry, Roster } from '../roster.ts'
import type { Route, RosterRoute } from '../route.ts'

type Go = (route: Route) => void

/** Draws `route` into the roster screen `root`. */
export function renderRoster(root: HTMLElement, roster: Roster, route: RosterRoute, go: Go): void {
  for (const tab of root.querySelectorAll<HTMLButtonElement>('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.kind === route.kind))
    tab.onclick = () => go({ ...route, kind: tab.dataset.kind as RosterRoute['kind'], arm: ALL_ARMS, open: null })
  }
  find('[data-slot=crumb]', root).textContent = KIND_WORDS[route.kind].name
  const total = roster[route.kind].length
  find('[data-slot=total]', root).textContent =
    `${total} ${KIND_WORDS[route.kind].noun} · ${roster.nations.length} nations`
  find('[data-slot=nations]', root).replaceChildren(...nationChips(roster, route, go))
  const arms = find('[data-slot=arms]', root)
  arms.hidden = route.kind !== 'regiments'
  arms.replaceChildren(...(arms.hidden ? [] : armChips(roster, route, go)))
  const entries = entriesOf(roster, route)
  find('[data-slot=heading]', root).replaceChildren(heading(roster, route, entries.length))
  const grid = find('[data-slot=grid]', root)
  const nation = nationOf(roster, route.nation)
  if (nation) paintArmy(grid, nation.colour)
  grid.replaceChildren(...cards(entries, route, go))
}

function nationChips(roster: Roster, route: RosterRoute, go: Go): HTMLElement[] {
  return countByNation(roster, route.kind).map(({ nation, count }) => {
    const pressed = String(nation.id === route.nation)
    const chip = h('button', { class: 'chip', 'aria-pressed': pressed }, h('span', { class: 'sw' }), nation.name)
    chip.append(h('span', { class: 'n' }, String(count)))
    chip.onclick = () => go({ ...route, nation: nation.id, arm: ALL_ARMS, open: null })
    return paintArmy(chip, nation.colour)
  })
}

function armChips(roster: Roster, route: RosterRoute, go: Go): HTMLElement[] {
  return countByArm(roster, route.nation).map(({ arm, count }) => {
    const chip = h('button', { class: 'chip dashed', 'aria-pressed': String(arm === route.arm) }, arm)
    chip.append(h('span', { class: 'n' }, String(count)))
    chip.disabled = count === 0
    chip.onclick = () => go({ ...route, arm, open: null })
    return chip
  })
}

function heading(roster: Roster, route: RosterRoute, count: number): HTMLElement {
  const nation = nationOf(roster, route.nation)
  const which = route.arm === ALL_ARMS ? '' : `${route.arm} · `
  const row = h(
    'div',
    { class: 'nation-head' },
    h('span', { class: 'sw' }),
    h('h3', { class: 'display' }, nation?.name ?? ''),
    h('span', { class: 'mono native' }, nation?.native ?? ''),
    h('span', { class: 'rule' }),
    h('span', { class: 'mono' }, `${count} ${which}${KIND_WORDS[route.kind].name.toLowerCase()}`),
  )
  return nation ? paintArmy(row, nation.colour) : row
}

function cards(entries: Entry[], route: RosterRoute, go: Go): HTMLElement[] {
  if (!entries.length) return [h('p', { class: 'empty mono' }, 'None painted yet')]
  return entries.map((entry, index) => card(entry, index, () => go({ ...route, open: entry.id })))
}
