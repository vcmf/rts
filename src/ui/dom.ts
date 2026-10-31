// A small element builder for the interface's screens: no framework, the screens are a few hundred elements.

type Child = Node | string
/** Attributes by name; `class` sets the class list, `style` the inline style; undefined skips one. */
type Attrs = Record<string, string | undefined>

/** A new `tag` element with `attrs` and `children` (strings become text, never HTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) node.setAttribute(name, value)
  }
  node.append(...children)
  return node
}

/** The element `selector` finds under `root`; throws when there is none (the page's markup and code disagree). */
export function find<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(selector)
  if (!node) throw new Error(`front menu: no element ${selector}`)
  return node
}

/** `--army` set to a nation's colour on `node`: its swatches, frames and hovers take the army's colour. */
export function paintArmy<T extends HTMLElement>(node: T, colour: string): T {
  node.style.setProperty('--army', colour)
  return node
}
