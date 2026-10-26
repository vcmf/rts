// Pinning (docs/plans/active/m7-editor.md M7d, docs/proposals/map-engine.md §3.4): a generated feature's expanded form
// copied into the map's intent, so it stops being generated and can be tuned by hand. The rules are the language's
// (docs/systems/map.md): the feature takes its expanded form (no `gen`, with its `origin`), or leaves the map when its
// generator takes it off (a scatter's region, a group's point), and its children are kept. The expansion is the
// engine's, run on the copy given, so the pinned map expands to the same map as the original. Tested in
// test/map-pin.test.ts.
import type { Catalogue, Feature, MapFile } from '../../map/schema.ts'
import { validate } from '../../map/validate.ts'
import { expand } from '../../map/expand.ts'
import { childOf } from '../../map/generators.ts'
import { sameJson } from '../../map/write.ts'

/** An issue as one line: its feature, its path, its message. */
const say = (i: { id: string | null; path: string; message: string }) =>
  `${i.id ? `[${i.id}] ` : ''}${i.path ? `${i.path}: ` : ''}${i.message}`

/**
 * The map with the feature `id` pinned: replaced by its expanded form, or removed when its generator takes it off the
 * map, and its children appended after the last feature in their order (`<id>-1`, `<id>-2`, …), so a stable save
 * rewrites its line and appends. Or why it cannot be: it has no generator, the map does not validate or expand (the
 * first problem), or pinned it would not expand to the same map (a feature naming a generator that made nothing, which
 * pinned leaves nothing to name).
 */
export function pinned(map: MapFile, cat: Catalogue, id: string): MapFile | string {
  const f = map.features.find(x => x.id === id)
  if (!f) return `no feature ${id}`
  if (f.gen === undefined) return `${id} has no generator: it is pinned already, or was never generated`
  // expansion reads a valid map only
  const problems = validate(map, cat)
  if (problems.length) return `the map has a problem to fix first: ${say(problems[0])}`
  const ex = expand(map, cat)
  if (ex.issues.length) return `the map does not expand: ${say(ex.issues[0])}`
  // its expanded form; a ring sharing a line's edge never stays (a village's own area may not follow a line, a
  // scatter's region leaves the map: its children keep off the line through their `clear`)
  const self = ex.map.features.find(x => x.id === id)
  // the children the expansion makes: not a feature already in the file that names it as its parent (one pinned before)
  const n = (c: Feature) => childOf(c.id)?.n ?? 0
  const own = new Set(map.features.map(x => x.id))
  const children = ex.map.features.filter(x => x.origin?.parent === id && !own.has(x.id)).sort((a, b) => n(a) - n(b))
  const features = map.features.flatMap(x => (x === f ? (self ? [self] : []) : [x]))
  const out = { ...map, features: [...features, ...children] }
  // pinning must change nothing the map makes: checked, never assumed
  const after = validate(out, cat)
  const again = after.length ? null : expand(out, cat)
  const why = after[0] ?? again?.issues[0]
  if (why) return `pinned, the map would not expand as it does: ${say(why)}`
  if (!sameJson(again!.map, ex.map)) return 'pinned, the map would not expand as it does'
  return out
}
