// The History screen: two plates, Commanders and Regiments, each with its featured painting and its count. Its words
// are in the page's markup (app/menu.html); this fills in what comes from the roster and wires the plates.
import { find } from '../dom.ts'
import { historyImage } from '../images.ts'
import { KINDS, KIND_WORDS, entryById, type Roster } from '../roster.ts'
import { rosterRoute, type Route } from '../route.ts'

/** Fills the plates under `root` (`[data-kind=<kind>]`, each with an `img` and a `.count`) and wires them to `go`. */
export function setUpHistory(root: HTMLElement, roster: Roster, go: (route: Route) => void): void {
  for (const kind of KINDS) {
    const plate = find(`[data-kind=${kind}]`, root)
    const featured = entryById(roster, kind, roster.featured[kind])
    if (featured) find<HTMLImageElement>('img', plate).src = historyImage(featured.image)
    find('.count', plate).textContent = `${roster[kind].length} ${KIND_WORDS[kind].noun}`
    plate.addEventListener('click', () => go(rosterRoute(kind, roster.nations[0].id)))
  }
}
