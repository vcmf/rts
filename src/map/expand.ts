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
import type { GenOutput, GenSpec } from './generators.ts'
import { followEdge, followsOf } from './follow.ts'
import { lineReach } from './apply.ts'
import { GENERATOR_SPECS, childOf, pinnedParentsOf } from './generators.ts'
import { resolve } from './resolve.ts'
import { seedOf } from './seed.ts'
import { validate } from './validate.ts'
import { crossings } from './geometry.ts'
import { kindMatches, zoneGap, zoneToArea } from './reach.ts'
import { categoryOf, isKindName } from './catalogue.ts'

export const EXPAND_VERSION = 3   // recorded in a generated feature's `origin`; bump when any generator's output changes

const idOrder = (a: Feature, b: Feature): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function expand(map: MapFile, cat: Catalogue): { map: MapFile; issues: Issue[] } {
  const issues: Issue[] = [], at = new Map(map.features.map((f, i) => [f.id, i]))
  // the finished features, by id: the author's without a generator or a shared edge, then each of those once it has
  // run. A generator sees only these: one still to run is invisible, so its input (a guide, a region) never leaks
  const current = new Map(map.features.filter(f => !f.gen && !f.follow).map(f => [f.id, f])), resolved = new Map<string, ReturnType<typeof resolve>>()
  const res = (f: Feature) => { let r = resolved.get(f.id); if (!r) { r = resolve(f, map, cat); resolved.set(f.id, r) } return r }
  const children: Feature[] = [], ran = new Set<string>(), failed = new Set<string>()
  const pinnedParents = pinnedParentsOf(map.features)
  const runOne = (authored: Feature) => {
    // shared edges first (docs/plans/active/m3d-follow.md): each edge's points into the outer ring, before its `at`
    let f = authored
    if (f.follow) {
      const edges = followsOf(f), outer = [...f.area![0]], many = Array.isArray(f.follow)
      for (const n of edges.map((_, n) => n).sort((a, b) => (edges[b].at ?? 0) - (edges[a].at ?? 0))) {
        const e = edges[n], line = current.get(e.id)!
        try { outer.splice(e.at ?? 0, 0, ...followEdge(line.line!, lineReach(categoryOf(res(line).kind), res(line).attrs), e)) }
        catch (err) { issues.push({ id: f.id, path: `features[${at.get(f.id)}].follow${many ? `[${n}]` : ''}`, message: (err as Error).message }); failed.add(f.id); return }
      }
      f = { ...Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'follow')), area: [outer, ...f.area!.slice(1)] } as Feature
      if (!f.gen) { current.set(f.id, f); return }
    }
    const name = Object.keys(f.gen!)[0], params = f.gen![name] as Record<string, unknown>, spec = GENERATOR_SPECS[name]
    const origin = { generator: name, params, version: EXPAND_VERSION }
    let out: GenOutput
    try {
      out = spec.run({
        f, kind: res(f).kind, attrs: res(f).attrs, params, seed: seedOf(map.seed, f.id, name), mapSeed: map.seed, features: current,
        attrsOf: id => res(current.get(id)!).attrs, kindOf: id => res(current.get(id)!).kind,
      })
    } catch (err) { issues.push({ id: f.id, path: `features[${at.get(f.id)}].gen.${name}`, message: (err as Error).message }); failed.add(f.id); return }
    ran.add(f.id)
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
  // the order (decision 0023): F reads G when F's selectors could match what G produces (G's id, its children's ids,
  // the kinds of G and of its children; not G's own kind when G leaves the map), and G is not F's peer. The reads must form a chain: the strongly connected groups of that graph
  // (Tarjan's algorithm, which emits a group after every group it depends on) are single generators, run in that
  // order, each seeing only finished features. A group of several is a cycle: an error naming its members and how to
  // break it. A generator reading one that failed (or a cycle) is skipped, so the first error is the one reported.
  // The file's order and the ids never matter (beyond seeds).
  // a feature with a shared edge is in the chain too: it reads the lines it follows
  const gens = [...map.features.filter(f => f.gen || f.follow)].sort(idOrder)
  const specOf = (f: Feature): GenSpec | undefined => (f.gen ? GENERATOR_SPECS[Object.keys(f.gen)[0]] : undefined)
  const paramsOf = (f: Feature) => (f.gen ? f.gen[Object.keys(f.gen)[0]] as Record<string, unknown> : {})
  const readsOf = new Map(gens.map(f => [f.id, [...followsOf(f).map(e => e.id), ...(specOf(f)?.reads?.(f, paramsOf(f)) ?? [])]]))
  const produces = new Map(gens.map(g => { const k = res(g).kind, sp = specOf(g); return [g.id, [...(sp?.removesSelf ? [] : [k]), ...(sp?.childKinds?.(k, paramsOf(g)) ?? [])]] }))
  const matching = (f: Feature, g: Feature) => readsOf.get(f.id)!.filter(sel => sel === g.id || childOf(sel)?.parent === g.id || produces.get(g.id)!.some(k => kindMatches(sel, k)))
  const peers = (f: Feature, g: Feature) => !!specOf(f)?.peers && specOf(f) === specOf(g)
  const reads = (f: Feature, g: Feature) => f !== g && !peers(f, g) && matching(f, g).length > 0   // its own output is its own business (a scatter's siblings)
  const index = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>(), stack: Feature[] = []
  let counter = 0
  const strong = (f: Feature) => {
    index.set(f.id, counter); low.set(f.id, counter); counter++; stack.push(f); onStack.add(f.id)
    for (const g of gens) {
      if (!reads(f, g)) continue
      if (!index.has(g.id)) { strong(g); low.set(f.id, Math.min(low.get(f.id)!, low.get(g.id)!)) }
      else if (onStack.has(g.id)) low.set(f.id, Math.min(low.get(f.id)!, index.get(g.id)!))
    }
    if (low.get(f.id) !== index.get(f.id)) return
    const group: Feature[] = []
    let g: Feature
    do { g = stack.pop()!; onStack.delete(g.id); group.push(g) } while (g !== f)
    if (group.length > 1) {
      group.sort(idOrder)
      for (const h of group) {
        const how = group.filter(o => reads(h, o)).map(o => `"${o.id}" (by ${matching(h, o).map(s => `'${s}'`).join(', ')})`).join(', ')
        const mix = group.every(o => specOf(o) === GENERATOR_SPECS.scatter) ? ", or place their kinds jointly in one scatter's mix" : ''
        issues.push({ id: h.id, path: `features[${at.get(h.id)}].${h.gen ? 'gen' : 'follow'}`, message: `it reads ${how}, and they read it back: generators must form a chain. Drop one side's read (keeping clear on one side is enough)${mix}` })
        failed.add(h.id)
      }
      return
    }
    if (failed.has(f.id) || gens.some(o => failed.has(o.id) && reads(f, o))) { failed.add(f.id); return }
    runOne(f)
  }
  // peers (decision 0023) do not read each other, so they must not be able to meet: whatever their seeds, their zones
  // (and an author's own area) lie more than the gap apart, checked before anything runs. One issue per peer, naming
  // every peer too close to it
  for (const spec of new Set(gens.map(specOf))) if (spec?.peers) {
    const { gap, reach } = spec.peers, attrsOf = (id: string) => res(current.get(id)!).attrs
    const ps = gens.filter(g => specOf(g) === spec).map(g => ({ g, zone: reach(g, current, attrsOf) }))
    const close = new Map<string, string[]>()
    if (ps.length > 1) for (const p of ps) if (!p.zone) {
      issues.push({ id: p.g.id, path: `features[${at.get(p.g.id)}].gen`, message: `cannot tell where it reaches before generators run (what it is built along is generated): ${Object.keys(p.g.gen!)[0]} generators must be kept apart beforehand` })
      failed.add(p.g.id)
    }
    const known = ps.filter(p => p.zone)
    for (let a = 0; a < known.length; a++) for (let b = a + 1; b < known.length; b++) {
      const A = known[a], B = known[b], d = Math.min(zoneGap(A.zone!, B.zone!), A.g.area ? zoneToArea(B.zone!, A.g) : Infinity, B.g.area ? zoneToArea(A.zone!, B.g) : Infinity)
      if (d > gap) continue
      const say = (o: string) => `"${o}" (${d > 0 ? `${d.toFixed(1)} m between their zones` : 'their zones meet'})`
      close.set(A.g.id, [...(close.get(A.g.id) ?? []), say(B.g.id)]); close.set(B.g.id, [...(close.get(B.g.id) ?? []), say(A.g.id)])
    }
    for (const p of known) {
      const others = close.get(p.g.id)
      if (!others) continue
      issues.push({ id: p.g.id, path: `features[${at.get(p.g.id)}].gen`, message: `it could come within ${gap} m of ${others.join(', ')}: ${Object.keys(p.g.gen!)[0]} generators do not see each other, so each keeps to its own ground (its stretch, the inside of its bends, and its own area): move their stretches apart` })
      failed.add(p.g.id)
    }
  }
  for (const f of gens) if (!index.has(f.id)) strong(f)
  // every selector that names a feature names one of the expanded map (or a generator that ran and made nothing, or
  // the parent of pinned children): checked once everything has run, so the answer never depends on the order
  for (const f of gens) if (ran.has(f.id)) for (const k of specOf(f)?.selects ?? []) {
    const sels = (f.gen![Object.keys(f.gen!)[0]] as Record<string, unknown>)[k]
    if (Array.isArray(sels)) sels.forEach((sel, n) => {
      if (typeof sel === 'string' && !isKindName(cat, sel) && !current.has(sel) && !ran.has(sel) && !pinnedParents.has(sel)) issues.push({ id: f.id, path: `features[${at.get(f.id)}].gen.${Object.keys(f.gen!)[0]}.${k}[${n}]`, message: `"${sel}" names nothing on the expanded map` })
    })
  }
  if (issues.length) return { map, issues }
  // the expanded features: the author's, in their order (generated ones at their new shape, removed ones gone), then
  // the children; validated like any map, so the paths of the author's features name their file
  const features = [...map.features.filter(f => current.has(f.id)).map(f => current.get(f.id)!), ...children]
  for (const i of validate({ ...map, features }, cat)) {
    const own = i.id !== null && at.has(i.id), child = !own && i.id !== null && children.some(c => c.id === i.id)
    const parent = child ? children.find(c => c.id === i.id)!.origin!.parent! : null
    // a ring with shared edges is counted as expanded (the edges' points included), not as the author wrote it
    const shared = own && map.features[at.get(i.id!)!].follow !== undefined && /\.area/.test(i.path) ? ' (counting the ring as expanded, its shared edges included)' : ''
    issues.push({ ...i, id: parent ?? i.id, path: own ? i.path.replace(/^features\[\d+\]/, `features[${at.get(i.id!)}]`) : parent ? `features[${at.get(parent)}].gen (child ${i.id}: ${i.path})` : i.path, message: `after expansion: ${i.message}${shared}` })
  }
  const byIndex = features.filter(f => at.has(f.id)).map(f => ({ f, i: at.get(f.id)! }))
  features.sort(idOrder)
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
