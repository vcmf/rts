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
import { GENERATOR_SPECS } from './generators.ts'
import { resolve } from './resolve.ts'
import { seedOf } from './seed.ts'
import { validate } from './validate.ts'
import { crossings } from './geometry.ts'

export const EXPAND_VERSION = 2   // recorded in a generated feature's `origin`; bump when any generator's output changes

export function expand(map: MapFile, cat: Catalogue): { map: MapFile; issues: Issue[] } {
  const issues: Issue[] = []
  const features = map.features.map((f, i): Feature => {
    if (!f.gen) return f
    const name = Object.keys(f.gen)[0], params = f.gen[name] as Record<string, number>
    if (!Object.hasOwn(GENERATOR_SPECS, name)) { issues.push({ id: f.id, path: `features[${i}].gen`, message: `the "${name}" generator arrives in M3b; pin this feature's exact shape until then` }); return f }
    let out: Partial<Feature>
    try { out = GENERATOR_SPECS[name].run(f, resolve(f, map, cat).attrs, params, seedOf(map.seed, f.id, name)) } catch (err) {
      issues.push({ id: f.id, path: `features[${i}].gen.${name}`, message: (err as Error).message }); return f
    }
    const kept = Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'gen' && !(SHAPES as readonly string[]).includes(k))) as Feature
    return { ...kept, ...out, origin: { generator: name, params, version: EXPAND_VERSION } }
  })
  if (issues.length) return { map, issues }
  // the generators' output, checked as any map, in the author's order (so the paths name their file)
  for (const i of validate({ ...map, features }, cat)) issues.push({ ...i, message: `after expansion: ${i.message}` })
  const byIndex = features.map((f, i) => ({ f, i }))
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

