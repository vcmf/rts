// A feature's effective attributes (docs/proposals/map-engine.md §3.2, §3.5), lowest first: the catalogue along
// the kind's path, the map preset, the feature's own fields, the season's overrides (the catalogue's, then the
// feature's), the state's overlay. A season beats a fixed value: a field given its own crop height is still
// ploughed bare in winter, unless the feature overrides that season too. The one place this order lives: the CLI, the compilers and the tests call it.
// Assumes a valid map (src/map/validate.ts).
import type { AttrValue, Catalogue, Feature, MapFile, Season } from './schema.ts'
import { RESERVED } from './schema.ts'
import { kindChain, kindMeta, kindSeason, kindStates } from './catalogue.ts'

export interface Resolved { id: string; kind: string; priority: number; attrs: Record<string, AttrValue> }

export function resolve(f: Feature, map: MapFile, cat: Catalogue, season: Season = map.season, state: string | undefined = f.state): Resolved {
  const preset = f.preset ? map.presets![f.preset] : undefined
  const kind = (f.kind ?? preset!.kind)
  const chain = kindChain(cat, kind)
  if (!chain) throw new Error(`${f.id}: unknown kind ${kind} (validate the map first)`)
  const own = (o: Record<string, unknown>, skip: readonly string[]): Record<string, AttrValue> =>
    Object.fromEntries(Object.entries(o).filter(([k]) => !skip.includes(k))) as Record<string, AttrValue>
  const attrs: Record<string, AttrValue> = {}
  for (const name of chain) Object.assign(attrs, cat.kinds[name].set)
  if (preset) Object.assign(attrs, own(preset, ['kind']))
  Object.assign(attrs, own(f, RESERVED))
  Object.assign(attrs, kindSeason(cat, chain, season))
  Object.assign(attrs, f.seasons?.[season] ?? {})
  if (state) {
    const states = kindStates(cat, chain), overlay = Object.hasOwn(states, state) ? states[state] : undefined
    if (!overlay) throw new Error(`${f.id}: ${kind} has no state "${state}"`)
    Object.assign(attrs, overlay)
  }
  return { id: f.id, kind, priority: f.priority ?? kindMeta(cat, chain).priority, attrs }
}
