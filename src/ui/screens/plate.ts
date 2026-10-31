// The full plate: one commander or regiment over the whole screen, with its facts and previous / next.
// Its frame is in app/menu.html (`#plate`, slots by `data-slot`); this fills it, or hides it when no plate is open.
import { find, h, paintArmy } from '../dom.ts'
import { historyImage } from '../images.ts'
import { plateOf } from '../plate.ts'
import type { Roster } from '../roster.ts'
import type { Route, RosterRoute } from '../route.ts'

/** Shows the plate `route` opens in `root`, or hides `root` when it opens none. */
export function renderPlate(root: HTMLElement, roster: Roster, route: Route, go: (route: Route) => void): void {
  const plate = route.screen === 'roster' ? plateOf(roster, route) : null
  root.hidden = !plate
  if (!plate || route.screen !== 'roster') return
  paintArmy(root, plate.nation.colour)
  const img = find<HTMLImageElement>('[data-slot=image]', root)
  img.src = historyImage(plate.entry.image)
  img.alt = plate.entry.name
  find('[data-slot=nation]', root).textContent = `${plate.nation.name} · ${plate.nation.native}`
  find('[data-slot=name]', root).textContent = plate.entry.name
  find('[data-slot=subtitle]', root).textContent = plate.subtitle
  find('[data-slot=figure]', root).textContent = plate.figure
  find('[data-slot=position]', root).textContent = `${plate.index + 1} / ${plate.total}`
  const facts = plate.facts.flatMap(([label, value]) => [h('dt', { class: 'mono' }, label), h('dd', {}, value)])
  find('[data-slot=facts]', root).replaceChildren(...facts)
  wireTurn(find<HTMLButtonElement>('[data-turn=prev]', root), route, plate.index - 1, plate.total, go)
  wireTurn(find<HTMLButtonElement>('[data-turn=next]', root), route, plate.index + 1, plate.total, go)
  find<HTMLButtonElement>('[data-turn=close]', root).onclick = () => go({ ...route, open: null })
}

/** A previous / next button: to entry `to`, disabled past either end. */
function wireTurn(button: HTMLButtonElement, route: RosterRoute, to: number, total: number, go: (r: Route) => void) {
  button.disabled = to < 0 || to >= total
  button.onclick = () => go({ ...route, open: to })
}
