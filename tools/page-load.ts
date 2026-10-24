// When the page tools/shot.mjs opened has loaded: the top frame's commits and load events, read in order. Pure, so
// test/page-load.test.ts checks it without a browser.

/**
 * One top-frame event: a document committed (Page.frameNavigated: its loader, and the URL Chrome could not open when
 * it committed its error page instead) or the load event fired.
 */
export type LoadEvent = { kind: 'commit'; loaderId: string; unreachableUrl?: string } | { kind: 'load' }

/** Not loaded yet; or loaded, with the URL that could not be opened when the loaded document is an error page. */
export type LoadState = { loaded: false } | { loaded: true; unreachableUrl?: string }

/**
 * Whether the navigation that committed `loaderId` has loaded: a load event after its commit. A load after a later
 * commit counts too: a page that navigates itself before its load event (`location.replace` in its script) never
 * fires its own, only the next document's. A load before the commit (a fresh attached page's own about:blank) never
 * counts. The document loaded is the last commit before that load: when it is Chrome's error page, the state names
 * the URL that failed (a page that sent itself to a missing one).
 * @param events the top frame's events, in the order they arrived
 * @param loaderId the loader Page.navigate returned
 */
export function loadState(events: readonly LoadEvent[], loaderId: string): LoadState {
  const start = events.findIndex(e => e.kind === 'commit' && e.loaderId === loaderId)
  if (start < 0) return { loaded: false }
  let last = events[start] as Extract<LoadEvent, { kind: 'commit' }>
  for (const e of events.slice(start + 1)) {
    if (e.kind === 'load') return { loaded: true, unreachableUrl: last.unreachableUrl }
    last = e
  }
  return { loaded: false }
}
