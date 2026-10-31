// The front menu page (app/menu.html): home, History, the rosters and the full plate. Loads the roster, follows the
// route in the hash, and turns keys into actions. docs/systems/front-menu.md.
import ROSTER_URL from '../../data/history/roster.json?url'
import { find } from './dom.ts'
import { keyAction, type KeyAction } from './keys.ts'
import { entriesOf, rosterProblems, type Roster } from './roster.ts'
import { formatRoute, normalizeRoute, parseRoute, type Route } from './route.ts'
import { HomeMenu } from './screens/home.ts'
import { setUpHistory } from './screens/history.ts'
import { renderPlate } from './screens/plate.ts'
import { renderRoster } from './screens/roster.ts'

/** What the page check (tools/menu-check.ts) reads. */
export interface MenuHandle {
  roster: Roster
  route(): Route
}

declare global {
  interface Window {
    MENU?: MenuHandle
  }
}

const SCREENS = ['home', 'history', 'roster'] as const

/** The roster, checked: a page that shows an unsound roster would show it wrong, so it fails loudly instead. */
async function loadRoster(): Promise<Roster> {
  const roster: Roster = await (await fetch(ROSTER_URL)).json()
  const problems = rosterProblems(roster)
  if (problems.length) throw new Error(`front menu: unsound roster: ${problems.join('; ')}`)
  return roster
}

/** The route the hash names, made valid for `roster`. */
function currentRoute(roster: Roster): Route {
  return normalizeRoute(parseRoute(location.hash), roster)
}

/** Follows `route`: a new history entry, then the hashchange draws it. */
function go(route: Route): void {
  location.hash = formatRoute(route)
}

/** Draws the screen of the current route; a hash that needed normalizing is rewritten in place. */
function render(roster: Roster): void {
  const route = currentRoute(roster)
  const hash = formatRoute(route)
  if (location.hash && location.hash !== hash) history.replaceState(null, '', hash)
  for (const id of SCREENS) find(`#${id}`).hidden = id !== route.screen
  if (route.screen === 'roster') renderRoster(find('#roster'), roster, route, go)
  renderPlate(find('#plate'), roster, route, go)
  find('[data-slot=where]').textContent = route.screen
}

/** Performs a key's action. */
function perform(action: KeyAction, home: HomeMenu): void {
  if (action.type === 'go') go(action.route)
  else if (action.type === 'step') home.step(action.by)
  else home.activate()
}

async function main(): Promise<void> {
  const roster = await loadRoster()
  const home = new HomeMenu(find('#home'), go)
  setUpHistory(find('#history'), roster, go)
  for (const crumb of document.querySelectorAll<HTMLElement>('[data-route]:not(.menu-item)')) {
    crumb.addEventListener('click', () => go(parseRoute(crumb.dataset.route ?? '')))
  }
  document.addEventListener('keydown', event => {
    // Enter on a focused button already clicks it
    if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return
    const route = currentRoute(roster)
    const entries = route.screen === 'roster' ? entriesOf(roster, route).length : 0
    const action = keyAction(route, event.key, entries)
    if (!action) return
    event.preventDefault()
    perform(action, home)
  })
  window.addEventListener('hashchange', () => render(roster))
  render(roster)
  window.MENU = { roster, route: () => currentRoute(roster) }
}

void main()
