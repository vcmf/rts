// The front menu's routes: which screen, and on a roster which kind, nation, arm and open plate. They live in the
// page's hash (#home, #history, #roster/<kind>/<nation>/<arm>[/<entry id>]), so every screen has an address the
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
      /** the roster id of the entry whose full plate is open (an id, not a place: a link survives a rebuilt roster);
       *  null when none is */
      open: string | null
    }

export type RosterRoute = Extract<Route, { screen: 'roster' }>

export const HOME: Route = { screen: 'home' }

/** `part` percent-decoded; null for a malformed sequence ("%E0"), which a typed or pasted address can hold. */
function decodePart(part: string): string | null {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

/** The route a hash names, as written; normalizeRoute checks it against the roster. Unknown screens, and hashes that
 *  do not decode, are home. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').map(decodePart)
  if (parts.includes(null)) return HOME
  const [screen, kind, nation, arm, open] = parts as string[]
  if (screen === 'history') return { screen: 'history' }
  if (screen !== 'roster') return HOME
  return {
    screen: 'roster',
    kind: KINDS.includes(kind as Kind) ? (kind as Kind) : 'commanders',
    nation: nation ?? '',
    arm: arm || ALL_ARMS,
    open: open || null,
  }
}

/** The hash of `route`, the inverse of parseRoute for a normalized route. */
export function formatRoute(route: Route): string {
  if (route.screen !== 'roster') return `#${route.screen}`
  const parts = [route.screen, route.kind, route.nation, route.arm]
  if (route.open !== null) parts.push(route.open)
  return '#' + parts.map(p => encodeURIComponent(p)).join('/')
}

/** `route` made valid for `roster`: an unknown nation becomes the first, an unknown arm (or any arm for commanders)
 *  all arms, an open entry the filtered roster does not show none. */
export function normalizeRoute(route: Route, roster: Roster): Route {
  if (route.screen !== 'roster') return route
  const nation = nationOf(roster, route.nation) ? route.nation : roster.nations[0].id
  const armKnown = route.kind === 'regiments' && roster.arms.includes(route.arm)
  const arm = armKnown ? route.arm : ALL_ARMS
  const shown = entriesOf(roster, { kind: route.kind, nation, arm }).some(e => e.id === route.open)
  return { ...route, nation, arm, open: shown ? route.open : null }
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

/** How a move reaches the browser's history: a new entry (push), in place of the current one (replace, a plate
 *  turned), or one level up: back when the page came from there, so Back does not return to what Esc closed. */
export type Move = 'push' | 'replace' | 'up'

/** For an `up` move to `target`: 'back' when the current history entry was pushed from `target` (`from`, the hash it
 *  was pushed from, if the page pushed it), else 'replace'. */
export function upMove(from: string | undefined, target: string): 'back' | 'replace' {
  return from === target ? 'back' : 'replace'
}

/** True when two roster routes show the same grid (only the open plate may differ). */
export function sameGrid(a: Route, b: Route | null): boolean {
  if (a.screen !== 'roster' || b?.screen !== 'roster') return false
  return a.kind === b.kind && a.nation === b.nation && a.arm === b.arm
}
