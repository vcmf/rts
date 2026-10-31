// The front menu's keyboard: what a key does on the current route. Pure, so the page only performs the action.
// docs/systems/front-menu.md ("Keyboard").
import { parentRoute, type Route, type RosterRoute } from './route.ts'

export type KeyAction =
  | { type: 'go'; route: Route }
  /** move the home menu's selection by one live item */
  | { type: 'step'; by: 1 | -1 }
  /** open the home menu's selected item */
  | { type: 'activate' }

/** The action of `key` (a KeyboardEvent.key) on `route`; `entries` is the open roster's length. Null: not ours. */
export function keyAction(route: Route, key: string, entries: number): KeyAction | null {
  if (key === 'Escape') return route.screen === 'home' ? null : { type: 'go', route: parentRoute(route) }
  if (route.screen === 'roster' && route.open !== null) return plateKey(route, route.open, key, entries)
  if (route.screen !== 'home') return null
  if (key === 'ArrowDown') return { type: 'step', by: 1 }
  if (key === 'ArrowUp') return { type: 'step', by: -1 }
  if (key === 'Enter') return { type: 'activate' }
  return null
}

/** On an open plate: the arrows turn to the next or previous entry, stopping at the ends. */
function plateKey(route: RosterRoute, open: number, key: string, entries: number): KeyAction | null {
  if (key === 'ArrowRight' && open < entries - 1) return { type: 'go', route: { ...route, open: open + 1 } }
  if (key === 'ArrowLeft' && open > 0) return { type: 'go', route: { ...route, open: open - 1 } }
  return null
}

/** The index of the next live item from `from` by `by`, wrapping; `from` itself when no other item is live. Muted
 *  items (live false) are skipped: they are drawn in pencil and cannot be chosen. */
export function stepLive(live: readonly boolean[], from: number, by: 1 | -1): number {
  const n = live.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + by * k) % n) + n) % n
    if (live[i]) return i
  }
  return from
}

/** The first live item's index, or -1 when none is live. */
export function firstLive(live: readonly boolean[]): number {
  return live.indexOf(true)
}
