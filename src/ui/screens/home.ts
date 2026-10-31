// The home menu: its items are in the page's markup (app/menu.html), each live one naming its route in `data-route`,
// each muted one `aria-disabled`. This keeps the selection (keyboard and pointer) and opens the chosen item.
import { firstLive, stepLive } from '../keys.ts'
import { parseRoute, type Route } from '../route.ts'

export class HomeMenu {
  private readonly items: HTMLButtonElement[]
  private readonly live: boolean[]
  private readonly go: (route: Route) => void
  private selected: number

  /** `root` holds the `.menu-item` buttons; `go` follows a route. */
  constructor(root: HTMLElement, go: (route: Route) => void) {
    this.go = go
    this.items = [...root.querySelectorAll<HTMLButtonElement>('.menu-item')]
    this.live = this.items.map(item => item.getAttribute('aria-disabled') !== 'true')
    this.selected = firstLive(this.live)
    this.items.forEach((item, i) => this.wire(item, i))
    this.show()
  }

  /** Moves the selection by one live item. */
  step(by: 1 | -1): void {
    if (this.selected < 0) return
    this.selected = stepLive(this.live, this.selected, by)
    this.show()
  }

  /** Opens the selected item. */
  activate(): void {
    if (this.selected >= 0) this.open(this.selected)
  }

  private wire(item: HTMLButtonElement, i: number): void {
    if (!this.live[i]) {
      item.tabIndex = -1 // muted: not reachable by Tab either
      return
    }
    item.addEventListener('click', () => this.open(i))
    item.addEventListener('pointerenter', () => {
      this.selected = i
      this.show()
    })
  }

  private open(i: number): void {
    this.go(parseRoute(this.items[i].dataset.route ?? ''))
  }

  private show(): void {
    this.items.forEach((item, i) => item.classList.toggle('sel', i === this.selected))
  }
}
