// When the page tools/shot.mjs opened has loaded: the top frame's commits and load events, read in order. Pure, so
// test/page-load.test.ts checks it without a browser.

/** One top-frame event: a document committed (Page.frameNavigated, its loader) or the load event fired. */
export type LoadEvent = { kind: 'commit'; loaderId: string } | { kind: 'load' }

/**
 * Whether the navigation that committed `loaderId` has loaded: a load event after its commit. A load after a later
 * commit counts too: a page that navigates itself before its load event (`location.replace` in its script) never
 * fires its own, only the next document's. A load before the commit (a fresh attached page's own about:blank) never
 * counts.
 * @param events the top frame's events, in the order they arrived
 * @param loaderId the loader Page.navigate returned
 */
export function navigationLoaded(events: readonly LoadEvent[], loaderId: string): boolean {
  const start = events.findIndex(e => e.kind === 'commit' && e.loaderId === loaderId)
  return start >= 0 && events.slice(start + 1).some(e => e.kind === 'load')
}
