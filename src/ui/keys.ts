// The front menu's keyboard: what a key does on the current route. Pure, so the page only performs the action.
// docs/systems/front-menu.md ("Keyboard").
import { parentRoute, type Move, type Route, type RosterRoute } from './route.ts'

export type KeyAction =
  | { type: 'go'; route: Route; move: Move }
  /** move the home menu's selection by one live item */
  | { type: 'step'; by: 1 | -1 }
  /** open the home menu's selected item */
  | { type: 'activate' }

/** The keys a press carries: its KeyboardEvent.key and whether a modifier was held. */
export interface Press {
  key: string
  modified: boolean
}

/** The action of `press` on `route`; `ids` are the open roster's entry ids, in order. Null: not ours (a key held
 *  with Alt, Ctrl or Meta is the browser's: Alt+← is Back). */
export function keyAction(route: Route, press: Press, ids: readonly string[]): KeyAction | null {
  if (press.modified) return null
  const { key } = press
  if (key === 'Escape') return route.screen === 'home' ? null : { type: 'go', route: parentRoute(route), move: 'up' }
  if (route.screen === 'roster' && route.open !== null) return plateKey(route, route.open, key, ids)
  if (route.screen !== 'home') return null
  if (key === 'ArrowDown') return { type: 'step', by: 1 }
  if (key === 'ArrowUp') return { type: 'step', by: -1 }
  if (key === 'Enter') return { type: 'activate' }
  return null
}

/** On an open plate: the arrows turn to the next or previous entry, stopping at the ends; a turn replaces the
 *  history entry, so Back leaves the plates rather than replaying them. */
function plateKey(route: RosterRoute, open: string, key: string, ids: readonly string[]): KeyAction | null {
  const at = ids.indexOf(open)
  const to = key === 'ArrowRight' ? at + 1 : key === 'ArrowLeft' ? at - 1 : -1
  if (at < 0 || to < 0 || to >= ids.length) return null
  return { type: 'go', route: { ...route, open: ids[to] }, move: 'replace' }
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
