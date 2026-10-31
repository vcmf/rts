// The front menu page (app/menu.html): home, History, the rosters and the full plate. Loads the roster, follows the
// route in the hash, and turns keys into actions. docs/systems/front-menu.md.
import { accentOf, applyAccent } from './accent.ts'
import { find } from './dom.ts'
import { keyAction, type KeyAction } from './keys.ts'
import { loadRoster } from './load.ts'
import { entriesOf, type Roster } from './roster.ts'
import { formatRoute, normalizeRoute, parseRoute, sameGrid, upMove, type Move, type Route } from './route.ts'
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

/** The history entry's state: the hash the page pushed it from, so an `up` move can go back to it. */
interface EntryState {
  from?: string
}

const SCREENS = ['home', 'history', 'roster'] as const

class FrontMenu {
  private readonly roster: Roster
  private readonly home: HomeMenu
  /** the route last drawn: the grid is redrawn only when its kind, nation or arm changes */
  private drawn: Route | null = null

  constructor(roster: Roster) {
    this.roster = roster
    this.home = new HomeMenu(find('#home'), route => this.go(route))
    setUpHistory(find('#history'), roster, route => this.go(route))
    for (const crumb of document.querySelectorAll<HTMLElement>('[data-route]:not(.menu-item)')) {
      crumb.addEventListener('click', () => this.go(parseRoute(crumb.dataset.route ?? '')))
    }
    document.addEventListener('keydown', event => this.onKey(event))
    // a pushed entry, Back and Forward, and an address typed or set by a script
    window.addEventListener('popstate', () => this.render())
    window.addEventListener('hashchange', () => this.render())
    this.render()
  }

  /** The route the hash names, made valid for the roster. */
  route(): Route {
    return normalizeRoute(parseRoute(location.hash), this.roster)
  }

  /** Follows `route`: a new history entry (push), in place of this one (replace), or one level up (back when the
   *  page came from there, so Back never returns to what Esc closed). */
  go(route: Route, move: Move = 'push'): void {
    const hash = formatRoute(route)
    const state = history.state as EntryState | null
    if (move === 'up' && upMove(state?.from, hash) === 'back') {
      history.back()
      return
    }
    if (move === 'push') history.pushState({ from: location.hash || '#home' } satisfies EntryState, '', hash)
    else history.replaceState(state, '', hash)
    this.render()
  }

  /** Draws the screen of the current route; a hash that needed repair is rewritten in place. */
  private render(): void {
    const route = this.route()
    const hash = formatRoute(route)
    if (location.hash && location.hash !== hash) history.replaceState(history.state, '', hash)
    for (const id of SCREENS) find(`#${id}`).hidden = id !== route.screen
    const go = (r: Route, move?: Move) => this.go(r, move)
    if (route.screen === 'roster' && !sameGrid(route, this.drawn)) renderRoster(find('#roster'), this.roster, route, go)
    const wasOpen = this.drawn?.screen === 'roster' ? this.drawn.open : null
    const open = renderPlate(find('#plate'), this.roster, route, go)
    this.placeFocus(wasOpen, open)
    find('[data-slot=where]').textContent = route.screen
    this.drawn = route
  }

  /** The plate is modal: the roster behind it is inert, focus goes to its Close button as it opens, and back to the
   *  card it came from as it closes. */
  private placeFocus(wasOpen: string | null, open: boolean): void {
    find('#roster').inert = open
    if (open && wasOpen === null) find<HTMLButtonElement>('#plate [data-turn=close]').focus()
    if (!open && wasOpen !== null) {
      document.querySelector<HTMLElement>(`#roster .card[data-id="${CSS.escape(wasOpen)}"]`)?.focus()
    }
  }

  private onKey(event: KeyboardEvent): void {
    // Enter on a focused button already clicks it (on home, the focused item is the chosen one: HomeMenu)
    if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return
    const route = this.route()
    const ids = route.screen === 'roster' ? entriesOf(this.roster, route).map(e => e.id) : []
    const modified = event.altKey || event.ctrlKey || event.metaKey
    const action = keyAction(route, { key: event.key, modified }, ids)
    if (!action) return
    event.preventDefault()
    this.perform(action)
  }

  private perform(action: KeyAction): void {
    if (action.type === 'go') this.go(action.route, action.move)
    else if (action.type === 'step') this.home.step(action.by)
    else this.home.activate()
  }
}

async function main(): Promise<void> {
  applyAccent(accentOf(location.search))
  const roster = await loadRoster()
  const menu = new FrontMenu(roster)
  window.MENU = { roster, route: () => menu.route() }
}

void main()
