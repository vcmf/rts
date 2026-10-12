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
import { kindMatches } from './reach.ts'
import { childOf } from './generators.ts'
import { kindChain } from './catalogue.ts'

export const EXPAND_VERSION = 3   // recorded in a generated feature's `origin`; bump when any generator's output changes

export function expand(map: MapFile, cat: Catalogue): { map: MapFile; issues: Issue[] } {
  const issues: Issue[] = [], at = new Map(map.features.map((f, i) => [f.id, i]))
  // the finished features, by id: the author's without a generator, then each generator's output once it has run. A
  // generator sees only these: one still to run is invisible, so its input (a guide, a region) never leaks
  const current = new Map(map.features.filter(f => !f.gen).map(f => [f.id, f])), resolved = new Map<string, ReturnType<typeof resolve>>()
  const res = (f: Feature) => { let r = resolved.get(f.id); if (!r) { r = resolve(f, map, cat); resolved.set(f.id, r) } return r }
  const children: Feature[] = []
  const runOne = (f: Feature) => {
    const name = Object.keys(f.gen!)[0], params = f.gen![name] as Record<string, unknown>, spec = GENERATOR_SPECS[name]
    const origin = { generator: name, params, version: EXPAND_VERSION }
    let out: GenOutput
    try {
      out = spec.run({
        f, attrs: res(f).attrs, params, seed: seedOf(map.seed, f.id, name), mapSeed: map.seed, features: current,
        attrsOf: id => res(current.get(id)!).attrs, kindOf: id => res(current.get(id)!).kind,
        isKind: sel => Object.hasOwn(cat.categories, sel) || kindChain(cat, sel) !== null,
      })
    } catch (err) { issues.push({ id: f.id, path: `features[${at.get(f.id)}].gen.${name}`, message: (err as Error).message }); return }
    if (out.self !== null) {
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
  // the order: F waits for G when what F reads (its selectors) could match what G produces (G's id, its children's
  // ids, the kinds of G and of its children). The strongly connected groups of that graph run in dependency order
  // (Tarjan's algorithm emits a group after every group it depends on); inside a group, generators that read each
  // other run in id order, each seeing the earlier ones' output. The file's order never matters.
  const gens = [...map.features.filter(f => f.gen)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const specOf = (f: Feature) => GENERATOR_SPECS[Object.keys(f.gen!)[0]]
  const readsOf = (f: Feature) => specOf(f).reads?.(f, f.gen![Object.keys(f.gen!)[0]] as Record<string, unknown>) ?? []
  const produces = (g: Feature) => { const k = res(g).kind, c = specOf(g).childKind; return c ? [k, c(k)] : [k] }
  const waitsFor = (f: Feature, g: Feature) => readsOf(f).some(sel => sel === g.id || childOf(sel)?.parent === g.id || produces(g).some(k => kindMatches(sel, k)))
  const index = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>(), stack: Feature[] = []
  let counter = 0
  const strong = (f: Feature) => {
    index.set(f.id, counter); low.set(f.id, counter); counter++; stack.push(f); onStack.add(f.id)
    for (const g of gens) {
      if (g === f || !waitsFor(f, g)) continue
      if (!index.has(g.id)) { strong(g); low.set(f.id, Math.min(low.get(f.id)!, low.get(g.id)!)) }
      else if (onStack.has(g.id)) low.set(f.id, Math.min(low.get(f.id)!, index.get(g.id)!))
    }
    if (low.get(f.id) !== index.get(f.id)) return
    const group: Feature[] = []
    let g: Feature
    do { g = stack.pop()!; onStack.delete(g.id); group.push(g) } while (g !== f)
    for (const h of group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) runOne(h)
  }
  for (const f of gens) if (!index.has(f.id)) strong(f)
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
