// What a card and a full plate say about an entry: pure, so the screens only lay it out. docs/systems/front-menu.md.
import { entriesOf, isRegiment, nationOf, type Entry, type Nation, type Roster } from './roster.ts'
import type { RosterRoute } from './route.ts'

/** A card's caption: the mono line (label left, tag right), the name, the line under it. */
export interface Caption {
  label: string
  tag: string
  name: string
  detail: string
}

/** One entry on a full plate, with its place among the entries the roster shows. */
export interface Plate {
  entry: Entry
  nation: Nation
  index: number
  total: number
  /** the ids of the entries before and after it, null at either end */
  prev: string | null
  next: string | null
  /** the plate's figure line, "Plate II · No. 13" */
  figure: string
  subtitle: string
  /** label and value; values the library leaves empty are left out */
  facts: [label: string, value: string][]
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** The caption of `entry`, the `index`-th card of its roster (from 0). A regiment keeps its library number; a
 *  commander is numbered by his place. */
export function captionOf(entry: Entry, index: number): Caption {
  if (isRegiment(entry)) return { label: `No. ${entry.no}`, tag: entry.arm, name: entry.name, detail: entry.detail }
  return { label: `Fig. ${pad2(index + 1)}`, tag: '', name: entry.name, detail: entry.role }
}

/** The plate `route` opens, or null when it opens none (or names an entry the roster lacks). */
export function plateOf(roster: Roster, route: RosterRoute): Plate | null {
  if (route.open === null) return null
  const entries = entriesOf(roster, route)
  const index = entries.findIndex(e => e.id === route.open)
  const entry = entries[index]
  const nation = entry && nationOf(roster, entry.nation)
  if (!entry || !nation) return null
  return {
    entry,
    nation,
    index,
    total: entries.length,
    prev: entries[index - 1]?.id ?? null,
    next: entries[index + 1]?.id ?? null,
    figure: isRegiment(entry) ? `Plate II · No. ${entry.no}` : `Plate I · ${pad2(index + 1)}`,
    subtitle: isRegiment(entry) ? entry.detail : entry.role,
    facts: factsOf(entry, nation),
  }
}

function factsOf(entry: Entry, nation: Nation): [string, string][] {
  const facts: [string, string][] = isRegiment(entry)
    ? [['Arm', entry.arm]]
    : [
        ['Life', entry.life],
        ['Likeness', entry.likeness],
      ]
  facts.push(['Army', nation.name])
  return facts.filter(([, value]) => value !== '')
}
