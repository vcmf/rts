// The full plate: one commander or regiment over the whole screen, with its facts and previous / next.
// Its frame is in app/menu.html (`#plate`, slots by `data-slot`); this fills it, or hides it when no plate is open.
import { find, h, paintArmy } from '../dom.ts'
import { historyImage } from '../images.ts'
import { plateOf } from '../plate.ts'
import type { Roster } from '../roster.ts'
import type { Move, Route, RosterRoute } from '../route.ts'

type Go = (route: Route, move?: Move) => void

/** Shows the plate `route` opens in `root`, or hides `root` when it opens none; returns whether one is shown. */
export function renderPlate(root: HTMLElement, roster: Roster, route: Route, go: Go): boolean {
  const plate = route.screen === 'roster' ? plateOf(roster, route) : null
  root.hidden = !plate
  if (!plate || route.screen !== 'roster') return false
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
  // read before the turn buttons change: a button disabled while focused loses focus at once
  const focused = document.activeElement
  wireTurn(find<HTMLButtonElement>('[data-turn=prev]', root), route, plate.prev, go)
  wireTurn(find<HTMLButtonElement>('[data-turn=next]', root), route, plate.next, go)
  const close = find<HTMLButtonElement>('[data-turn=close]', root)
  close.onclick = () => go({ ...route, open: null }, 'up')
  // a turn button just disabled at an end would drop focus out of the modal plate: Close takes it
  if (focused instanceof HTMLButtonElement && focused.disabled && root.contains(focused)) close.focus()
  return true
}

/** A previous / next button: to entry `to` in place of this plate (a turn, not a new history entry); disabled at the
 *  ends. */
function wireTurn(button: HTMLButtonElement, route: RosterRoute, to: string | null, go: Go): void {
  button.disabled = to === null
  button.onclick = () => go({ ...route, open: to }, 'replace')
}
