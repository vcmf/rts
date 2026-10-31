// The front menu's routes: which screen, and on a roster which kind, nation, arm and open plate. They live in the
// page's hash (#home, #history, #roster/regiments/<nation>/<arm>[/<index>]), so every screen has an address the
// browser's back button and the page checks can reach. docs/systems/front-menu.md.
import { ALL_ARMS, KINDS, entriesOf, nationOf, type Kind, type Roster } from './roster.ts'

export type Route =
  | { screen: 'home' }
  | { screen: 'history' }
  | {
      screen: 'roster'
      kind: Kind
      nation: string
      arm: string
      /** the index of the entry whose full plate is open, in the roster's filtered order; null when none is */
      open: number | null
    }

export type RosterRoute = Extract<Route, { screen: 'roster' }>

export const HOME: Route = { screen: 'home' }

/** The route a hash names, as written; normalizeRoute checks it against the roster. Unknown screens are home. */
export function parseRoute(hash: string): Route {
  const [screen, kind, nation, arm, open] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  if (screen === 'history') return { screen: 'history' }
  if (screen !== 'roster') return HOME
  return {
    screen: 'roster',
    kind: KINDS.includes(kind as Kind) ? (kind as Kind) : 'commanders',
    nation: nation ?? '',
    arm: arm || ALL_ARMS,
    open: /^\d+$/.test(open ?? '') ? Number(open) : null,
  }
}

/** The hash of `route`, the inverse of parseRoute for a normalized route. */
export function formatRoute(route: Route): string {
  if (route.screen !== 'roster') return `#${route.screen}`
  const parts: (string | number)[] = [route.screen, route.kind, route.nation, route.arm]
  if (route.open !== null) parts.push(route.open)
  return '#' + parts.map(p => encodeURIComponent(p)).join('/')
}

/** `route` made valid for `roster`: an unknown nation becomes the first, an unknown arm (or any arm for commanders)
 *  all arms, an open index past the entries none. */
export function normalizeRoute(route: Route, roster: Roster): Route {
  if (route.screen !== 'roster') return route
  const nation = nationOf(roster, route.nation) ? route.nation : roster.nations[0].id
  const armKnown = route.kind === 'regiments' && roster.arms.includes(route.arm)
  const arm = armKnown ? route.arm : ALL_ARMS
  const count = entriesOf(roster, { kind: route.kind, nation, arm }).length
  const open = route.open !== null && route.open < count ? route.open : null
  return { ...route, nation, arm, open }
}

/** One level up: a plate closes to its roster, a roster goes to History, History to home; home stays. */
export function parentRoute(route: Route): Route {
  if (route.screen === 'roster' && route.open !== null) return { ...route, open: null }
  if (route.screen === 'roster') return { screen: 'history' }
  return HOME
}

/** The roster screen of `kind` for `nation`, every arm, no plate open. */
export function rosterRoute(kind: Kind, nation: string): RosterRoute {
  return { screen: 'roster', kind, nation, arm: ALL_ARMS, open: null }
}
