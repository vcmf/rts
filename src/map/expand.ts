// Expansion (docs/proposals/map-engine.md §3.4, §4): every generator run, every feature at its exact shape, in the
// expanded form (features sorted by id, no `gen` left). A generated feature keeps its fields and attributes, takes
// its generator's output as its shape, and records where it came from (`origin`); its seed is
// hash(map.seed, id, generator), so no other feature's change reaches it. The expanded map is validated like any
// map: a generator's bad output (a line crossing itself, a shape outside the extent) is an error naming its feature.
// Then the checks that need the exact shapes: a bridge whose road crosses its water more than once must say `near`.
// Assumes a valid map (src/map/validate.ts).
import type { Catalogue, Feature, MapFile } from './schema.ts'
import { SHAPES } from './schema.ts'
import type { Issue } from './catalogue.ts'
import type { GenOutput } from './generators.ts'
import { GENERATOR_SPECS } from './generators.ts'
import { resolve } from './resolve.ts'
import { seedOf } from './seed.ts'
import { validate } from './validate.ts'
import { crossings } from './geometry.ts'

export const EXPAND_VERSION = 3   // recorded in a generated feature's `origin`; bump when any generator's output changes

export function expand(map: MapFile, cat: Catalogue): { map: MapFile; issues: Issue[] } {
  const issues: Issue[] = [], at = new Map(map.features.map((f, i) => [f.id, i]))
  // the features as they expand, by id; their resolved attributes and kinds, for the generators that read others
  const current = new Map(map.features.map(f => [f.id, f])), resolved = new Map<string, ReturnType<typeof resolve>>()
  const res = (f: Feature) => { let r = resolved.get(f.id); if (!r) { r = resolve(f, map, cat); resolved.set(f.id, r) } return r }
  const children: Feature[] = []
  const runOne = (f: Feature) => {
    const name = Object.keys(f.gen!)[0], params = f.gen![name] as Record<string, unknown>, spec = GENERATOR_SPECS[name]
    const origin = { generator: name, params, version: EXPAND_VERSION }
    let out: GenOutput
    try {
      out = spec.run({
        f, attrs: res(f).attrs, params, seed: seedOf(map.seed, f.id, name), mapSeed: map.seed, extent: map.extent, features: current,
        attrsOf: id => res(current.get(id)!).attrs, kindOf: id => res(current.get(id)!).kind,
      })
    } catch (err) { issues.push({ id: f.id, path: `features[${at.get(f.id)}].gen.${name}`, message: (err as Error).message }); return }
    if (out.self === null) current.delete(f.id)
    else {
      // the feature without its generator, and without its old shape when the generator gives a new one (a village
      // with its own area keeps it)
      const isShape = (k: string) => (SHAPES as readonly string[]).includes(k), newShape = Object.keys(out.self).some(isShape)
      const kept = Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'gen' && !(newShape && isShape(k)))) as Feature
      current.set(f.id, { ...kept, ...out.self, origin } as Feature)
    }
    for (const c of out.children ?? []) {
      const child = { ...c, origin: { ...origin, parent: f.id } } as Feature
      children.push(child); current.set(child.id, child)
    }
  }
  // the generators in two passes: every ordinary one in the file's order, then the late ones (scatter: they read the
  // others' output) in id order, a later one seeing an earlier one's children
  const gens = map.features.filter(f => f.gen)
  for (const f of gens) if (!GENERATOR_SPECS[Object.keys(f.gen!)[0]].late) runOne(f)
  for (const f of gens.filter(g => GENERATOR_SPECS[Object.keys(g.gen!)[0]].late).sort((a, b) => (a.id < b.id ? -1 : 1))) runOne(f)
  if (issues.length) return { map, issues }
  // the expanded features: the author's, in their order (generated ones at their new shape, removed ones gone), then
  // the children; validated like any map, so the paths of the author's features name their file
  const features = [...map.features.filter(f => current.has(f.id)).map(f => current.get(f.id)!), ...children]
  for (const i of validate({ ...map, features }, cat)) {
    const own = i.id !== null && at.has(i.id), child = !own && i.id !== null && children.some(c => c.id === i.id)
    const parent = child ? children.find(c => c.id === i.id)!.origin!.parent! : null
    issues.push({ ...i, id: parent ?? i.id, path: own ? i.path.replace(/^features\[\d+\]/, `features[${at.get(i.id!)}]`) : parent ? `features[${at.get(parent)}].gen (child ${i.id}: ${i.path})` : i.path, message: `after expansion: ${i.message}` })
  }
  const byIndex = features.filter(f => at.has(f.id)).map(f => ({ f, i: at.get(f.id)! }))
  features.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out: MapFile = { ...map, features }
  // a bridge needs `near` when its road and its water cross more than once (paths name the author's file's order)
  const byId = new Map(features.map(f => [f.id, f]))
  byIndex.forEach(({ f, i }) => {
    if (!f.carries || !f.crosses || f.near) return
    const road = byId.get(f.carries)?.line, water = byId.get(f.crosses)?.line
    if (!road || !water) return
    const hits = crossings(road, water)
    if (hits.length > 1) issues.push({ id: f.id, path: `features[${i}].near`, message: `"${f.carries}" crosses "${f.crosses}" ${hits.length} times (at ${hits.map(p => `[${p.map(v => Math.round(v)).join(', ')}]`).join(', ')}): say which with "near"` })
    if (hits.length === 0) issues.push({ id: f.id, path: `features[${i}]`, message: `"${f.carries}" never crosses "${f.crosses}"` })
  })
  return { map: out, issues }
}
