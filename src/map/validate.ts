// The map validator (docs/proposals/map-engine.md §4, docs/plans/done/m1-language.md): every problem in a map
// file, each with the feature's id and a JSON path, as values, never thrown. Generic over the kinds catalogue:
// which attributes exist, their types, units and ranges, and which kinds may set them are the catalogue's data.
import type { Catalogue, Feature, MapFile, Pt } from './schema.ts'
import { GENERATORS, ID, RESERVED, REFS, SEASONS, SHAPES } from './schema.ts'
import type { GenSpec } from './generators.ts'
import { GENERATOR_SPECS, childOf, pinnedParentsOf } from './generators.ts'
import type { Issue } from './catalogue.ts'
import { CLEAR_KEYS, FOLLOW_KEYS, listOf } from './follow.ts'
import { allowedIn, categoryOf, checkCatalogue, checkValue, isKindName, kindChain, kindMeta, kindStates } from './catalogue.ts'
import { kindMatches } from './reach.ts'
import { barrierProblem, inRing, isPt, lineCrossing, lineFoldBack, lineLength, onCentimetres, ringArea2, ringCrossing, ringsTouch } from './geometry.ts'

export type { Issue }
const isRadius = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0 && onCentimetres(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const BARRIER_MARGIN = 8   // m: half the thickest barrier (8 cells of 2 m)
const TOP = ['format', 'id', 'name', 'note', 'seed', 'season', 'datum', 'extent', 'play', 'sources', 'presets', 'features']

export function validate(map: unknown, cat: Catalogue): Issue[] {
  const out: Issue[] = [...checkCatalogue(cat)]
  if (out.length) return out
  const bad = (id: string | null, path: string, message: string) => { out.push({ id, path, message }) }
  if (!isObj(map)) return [{ id: null, path: '', message: 'a map is a JSON object' }]

  // the map's own fields
  for (const k of Object.keys(map)) if (!TOP.includes(k)) bad(null, k, 'unknown field')
  if (map.format !== 1) bad(null, 'format', 'must be 1')
  if (typeof map.id !== 'string' || !ID.test(map.id)) bad(null, 'id', 'must be lowercase letters, digits and dashes')
  if (typeof map.name !== 'string' || !map.name) bad(null, 'name', 'must be a non-empty string')
  if (!Number.isInteger(map.seed) || (map.seed as number) < 0 || (map.seed as number) > 0xffffffff) bad(null, 'seed', 'must be a whole number from 0 to 4294967295')
  if (!(SEASONS as readonly unknown[]).includes(map.season)) bad(null, 'season', `must be one of ${SEASONS.join(', ')}`)
  if (map.datum !== undefined && (typeof map.datum !== 'number' || !Number.isFinite(map.datum))) bad(null, 'datum', 'must be a number (m)')
  const size = (k: 'extent' | 'play'): { w: number; h: number } | null => {
    const v = map[k]
    if (!isObj(v) || Object.keys(v).sort().join() !== 'h,w' || ![v.w, v.h].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) { bad(null, k, 'must be { "w": m, "h": m }, both positive'); return null }
    // whole multiples of 4 m: the 2 m grid then starts at an even coordinate, so its cell corners are the barrier lattice
    if (![v.w, v.h].every(n => Number.isInteger((n as number) / 4))) { bad(null, k, 'must be a whole multiple of 4 m (the 2 m grid, centred, keeps its corners on even metres)'); return null }
    return v as { w: number; h: number }
  }
  const extent = size('extent'), play = size('play')
  if (extent && play && (play.w > extent.w || play.h > extent.h)) bad(null, 'play', 'must fit inside the extent')
  const sources = new Set<string>(['invented'])
  if (map.sources !== undefined) {
    if (!Array.isArray(map.sources)) bad(null, 'sources', 'must be an array')
    else map.sources.forEach((s, i) => {
      if (!isObj(s) || typeof s.id !== 'string' || typeof s.kind !== 'string' || Object.keys(s).some(k => !['id', 'kind', 'ref', 'note'].includes(k))) bad(null, `sources[${i}]`, 'must be { "id", "kind", "ref"?, "note"? }')
      else if (sources.has(s.id)) bad(null, `sources[${i}].id`, `"${s.id}" is used twice`)
      else sources.add(s.id)
    })
  }
  const presets: Record<string, Record<string, unknown>> = {}
  if (map.presets !== undefined) {
    if (!isObj(map.presets)) bad(null, 'presets', 'must be an object of named presets')
    else for (const [name, p] of Object.entries(map.presets)) {
      const path = `presets.${name}`
      if (!ID.test(name)) bad(null, path, 'a preset name is lowercase letters, digits and dashes')
      if (!isObj(p) || typeof p.kind !== 'string' || !kindChain(cat, p.kind)) { bad(null, `${path}.kind`, 'must name a kind in the catalogue'); continue }
      checkAttrs(cat, null, p, path, categoryOf(p.kind), bad, ['kind'])
      presets[name] = p
    }
  }
  if (!Array.isArray(map.features)) { bad(null, 'features', 'must be an array'); return out }

  // ids first, so references can be checked in any order
  const byId = new Map<string, Feature>()
  map.features.forEach((f, i) => {
    if (!isObj(f) || typeof f.id !== 'string' || !ID.test(f.id)) { bad(null, `features[${i}].id`, 'every feature needs an id of lowercase letters, digits and dashes'); return }
    if (byId.has(f.id)) bad(f.id, `features[${i}].id`, `"${f.id}" is used twice`)
    else if (Object.hasOwn(cat.categories, f.id)) bad(f.id, `features[${i}].id`, `"${f.id}" is a category's name: a selector naming it would mean both`)
    else byId.set(f.id, f as Feature)
  })

  // the ids generated children will take, <parent>-<n> (childOf, src/map/generators.ts): reserved while their parent
  // generates, so an author's feature never collides with one. The parents, and how one is pinned
  const parents = new Map<string, string>()
  for (const f of map.features) if (isObj(f) && typeof f.id === 'string' && isObj(f.gen)) {
    const g = Object.keys(f.gen)[0], spec = Object.hasOwn(GENERATOR_SPECS, g) ? GENERATOR_SPECS[g] : undefined
    if (spec?.childKinds) parents.set(f.id, spec.removesSelf ? `remove "${f.id}" itself (its region leaves the map) and keep its expanded children` : `replace "${f.id}" by its expanded form (it keeps the area it was given) and keep its expanded children`)
  }
  const parentOf = (x: string): string | undefined => { const c = childOf(x); return c && parents.has(c.parent) ? c.parent : undefined }
  // ids that pinned children name as their parent: a selector may still name the parent to mean them
  const pinnedParents = pinnedParentsOf(map.features.filter(f => isObj(f) && isObj(f.origin)) as Feature[])
  map.features.forEach((f, i) => {
    if (!isObj(f) || typeof f.id !== 'string') return
    const id = f.id, path = `features[${i}]`
    if (parentOf(id)) bad(id, `${path}.id`, `"${id}" is reserved for the children of "${parentOf(id)}"; to pin them, ${parents.get(parentOf(id)!)}`)
    // the kind: its own, or its preset's
    let kind = f.kind
    if (f.preset !== undefined) {
      const p = typeof f.preset === 'string' && Object.hasOwn(presets, f.preset) ? presets[f.preset] : undefined
      if (!p) { bad(id, `${path}.preset`, `no preset "${String(f.preset)}" in the map's presets`); return }
      if (kind !== undefined && kind !== p.kind) { bad(id, `${path}.kind`, `differs from its preset's kind "${String(p.kind)}"`); return }
      kind = p.kind
    }
    if (typeof kind !== 'string') { bad(id, `${path}.kind`, 'every feature needs a kind (or a preset that gives one)'); return }
    const chain = kindChain(cat, kind)
    if (!chain) { bad(id, `${path}.kind`, `"${kind}" is not in the catalogue (maps/kinds.json)`); return }
    const category = categoryOf(kind), meta = kindMeta(cat, chain)

    for (const k of ['note', 'source', 'state'] as const) if (f[k] !== undefined && typeof f[k] !== 'string') bad(id, `${path}.${k}`, 'must be a string')
    if (typeof f.source === 'string' && !sources.has(f.source)) bad(id, `${path}.source`, `"${f.source}" is not one of the map's sources (or "invented")`)
    if (f.priority !== undefined && (!Number.isInteger(f.priority) || (f.priority as number) < 0 || (f.priority as number) > 1000)) bad(id, `${path}.priority`, 'must be a whole number from 0 to 1000')
    if (typeof f.state === 'string') {
      const states = kindStates(cat, chain)
      if (!Object.hasOwn(states, f.state)) bad(id, `${path}.state`, `${kind} has no state "${f.state}" (it has: ${Object.keys(states).join(', ') || 'none'})`)
    }
    // shared edges and keeping off lines (decision 0025) hold where apply paints an area's cells and honours `clear`:
    // ground, vegetation, buildings and zones, never an edit of the relief (it moves heights, not cells)
    const keepsOff = ['ground', 'veg', 'built', 'zone'].includes(category) && !meta.edit
    for (const k of ['follow', 'clear'] as const) if (f[k] !== undefined && !keepsOff) bad(id, `${path}.${k}`, `${kind} cannot keep off a line: shared edges are for ground, vegetation, buildings and zones`)
    const offsetProblem = (v: unknown) => (v !== undefined && (typeof v !== 'number' || v < 0 || v > 500 || !onCentimetres(v)) ? 'must be 0 to 500 m, at most 2 decimals' : null)
    // shared edges (docs/plans/active/m3d-follow.md): each follows a line feature, on an area feature
    if (f.follow !== undefined) {
      const edges = listOf<unknown>(f.follow), fp = (n: number) => (Array.isArray(f.follow) ? `${path}.follow[${n}]` : `${path}.follow`)
      if (edges.length === 0) bad(id, `${path}.follow`, 'must be a shared edge or a list of them')
      if (!Array.isArray(f.area)) bad(id, `${path}.follow`, 'shapes the outer ring of an area: the feature needs an "area" (its other points)')
      // a generator with peers checks its reach against its own area before expansion, when the ring is not whole yet
      const g0 = isObj(f.gen) ? Object.keys(f.gen)[0] : undefined
      if (g0 !== undefined && Object.hasOwn(GENERATOR_SPECS, g0) && GENERATOR_SPECS[g0].peers) bad(id, `${path}.follow`, `a ${g0} feature's own area cannot follow a line (its reach is checked before expansion)`)
      const ats = new Set<number>(), ringLen = Array.isArray(f.area) && Array.isArray(f.area[0]) ? f.area[0].length : 0
      edges.forEach((e, n) => {
        const ep = fp(n)
        if (!isObj(e)) { bad(id, ep, `must be { ${FOLLOW_KEYS.join(', ')} }`); return }
        for (const k of Object.keys(e)) if (!FOLLOW_KEYS.includes(k)) bad(id, `${ep}.${k}`, `unknown field (${FOLLOW_KEYS.join(', ')})`)
        const op = offsetProblem(e.offset); if (op) bad(id, `${ep}.offset`, op)
        for (const k of ['from', 'to'] as const) { if (!isPt(e[k])) bad(id, `${ep}.${k}`, 'must be a point [x, z]'); else checkInside(e[k] as Pt, `${ep}.${k}`, extent, (p, m) => bad(id, p, m)) }
        const atN = e.at === undefined ? 0 : e.at
        if (typeof atN !== 'number' || !Number.isInteger(atN) || atN < 0 || atN > ringLen) bad(id, `${ep}.at`, `must be a whole number from 0 to ${ringLen} (a position in the outer ring)`)
        else if (ats.has(atN)) bad(id, `${ep}.at`, `another shared edge already goes at ${atN}`)
        else ats.add(atN)
        const t = typeof e.id === 'string' ? byId.get(e.id) : undefined
        if (!t) bad(id, `${ep}.id`, `no feature "${String(e.id)}"`)
        else if (t.id === id) bad(id, `${ep}.id`, 'a feature cannot follow itself')
        else if (t.line === undefined) bad(id, `${ep}.id`, `"${t.id}" is not drawn as a line; an edge follows a line (a stream, a road, a hedge…)`)
      })
    }
    // lines an area keeps off (decision 0025): what a shared edge expands to, or the author's own
    if (f.clear !== undefined) {
      const many = Array.isArray(f.clear)
      if (f.area === undefined && f.circle === undefined && f.ellipse === undefined) bad(id, `${path}.clear`, 'keeps an area off lines: the feature needs an area, a circle or an ellipse')
      listOf<unknown>(f.clear).forEach((e, n) => {
        const ep = many ? `${path}.clear[${n}]` : `${path}.clear`
        if (!isObj(e)) { bad(id, ep, `must be { ${CLEAR_KEYS.join(', ')} }`); return }
        for (const k of Object.keys(e)) if (!CLEAR_KEYS.includes(k)) bad(id, `${ep}.${k}`, `unknown field (${CLEAR_KEYS.join(', ')})`)
        const op = offsetProblem(e.offset); if (op) bad(id, `${ep}.offset`, op)
        const t = typeof e.id === 'string' ? byId.get(e.id) : undefined
        if (!t) bad(id, `${ep}.id`, `no feature "${String(e.id)}"`)
        else if (t.id === id) bad(id, `${ep}.id`, 'a feature cannot keep off itself')
        else if (t.line === undefined) bad(id, `${ep}.id`, `"${t.id}" is not drawn as a line`)
      })
    }
    // a generator: its name, its parameters, and (below) the shape it reads and the one it writes
    let gen: GenSpec | undefined
    if (f.gen !== undefined) {
      const names = isObj(f.gen) ? Object.keys(f.gen) : [], params = names.length === 1 ? (f.gen as Record<string, unknown>)[names[0]] : undefined
      if (names.length !== 1 || !(GENERATORS as readonly string[]).includes(names[0]) || !isObj(params)) bad(id, `${path}.gen`, `must be { "<generator>": { params } }, one of ${GENERATORS.join(', ')}`)
      else if (Object.hasOwn(GENERATOR_SPECS, names[0])) {
        gen = GENERATOR_SPECS[names[0]]
        const gp = `${path}.gen.${names[0]}`
        for (const [k, v] of Object.entries(params)) {
          if (!Object.hasOwn(gen.params, k)) { bad(id, `${gp}.${k}`, `unknown parameter (${Object.keys(gen.params).join(', ')})`); continue }
          const e = checkValue(gen.params[k], v); if (e) bad(id, `${gp}.${k}`, e)
        }
        for (const [k, spec] of Object.entries(gen.params)) if (spec.required && !(k in params)) bad(id, `${gp}.${k}`, 'is required')
        // the generator's own checks (they skip a parameter whose type is already wrong)
        for (const problem of gen.check?.(params as Record<string, unknown>, cat, f as Feature) ?? []) bad(id, `${gp}.${problem.key}`, problem.message)
        // the parameters that name features: each an id (a generator's children too, <id>-<n>), a category, or a
        // dotted kind prefix in the catalogue; never the feature itself
        for (const k of gen.selects ?? []) {
          const sel = (params as Record<string, unknown>)[k]
          if (Array.isArray(sel)) sel.forEach((x, n) => {
            if (typeof x !== 'string') return
            if (x === id || parentOf(x) === id) bad(id, `${gp}.${k}[${n}]`, 'a feature cannot name itself or its own children')
            else if (!byId.has(x) && !parentOf(x) && !pinnedParents.has(x) && !isKindName(cat, x)) bad(id, `${gp}.${k}[${n}]`, `"${x}" is no feature id, generated child, category or kind`)
          })
        }
      }
    }
    if (f.origin !== undefined && (!isObj(f.origin) || typeof f.origin.generator !== 'string' || !isObj(f.origin.params) || !Number.isInteger(f.origin.version) || (f.origin.parent !== undefined && typeof f.origin.parent !== 'string'))) bad(id, `${path}.origin`, 'must be { "generator", "params", "version", "parent"? }')

    // the shape
    const shapes = SHAPES.filter(s => f[s] !== undefined)
    if (shapes.length > 1) bad(id, path, `has ${shapes.length} shapes (${shapes.join(', ')}); a feature has one`)
    else if (shapes.length === 0 && gen && !gen.input.includes('none')) bad(id, path, `needs a shape for its ${Object.keys(f.gen!)[0]} generator: one of ${gen.input.join(', ')}`)
    else if (shapes.length === 0 && !meta.shapes.includes('none') && f.gen === undefined) bad(id, path, `needs a shape: one of ${meta.shapes.join(', ')}`)
    else if (shapes.length === 1) {
      const s = shapes[0]
      // with a generator, the shape is its input, and its output must be a shape the kind takes
      if (gen?.kinds && !gen.kinds.some(k => kindMatches(k, kind))) bad(id, `${path}.gen`, `the ${Object.keys(f.gen!)[0]} generator runs on ${gen.kinds.join(', ')}, not ${kind}`)
      else if (gen && !gen.input.includes(s as typeof gen.input[number])) bad(id, `${path}.${s}`, `the ${Object.keys(f.gen!)[0]} generator reads ${gen.input.join(', ')}, not ${s}`)
      else if (gen && !meta.shapes.includes(gen.output)) bad(id, `${path}.gen`, `the ${Object.keys(f.gen!)[0]} generator writes a ${gen.output}, which ${kind} does not take`)
      else if (!gen && !meta.shapes.includes(s)) bad(id, `${path}.${s}`, `${kind} takes ${meta.shapes.filter(x => x !== 'none').join(', ') || 'no shape'}, not ${s}`)
      else checkShape(s, f[s], `${path}.${s}`, extent, (p, m) => bad(id, p, m), s === 'area' && f.follow !== undefined)
      if (category === 'barrier' && s === 'line' && Array.isArray(f.line) && f.line.every(isPt)) {
        const e = barrierProblem(f.line as Pt[]); if (e) bad(id, `${path}.line[${e[0]}]`, e[1])
        // the band (up to 8 cells, 16 m) must fit inside the grid
        else if (extent) (f.line as Pt[]).forEach((q, k) => { if (Math.abs(q[0]) > extent.w / 2 - BARRIER_MARGIN || Math.abs(q[1]) > extent.h / 2 - BARRIER_MARGIN) bad(id, `${path}.line[${k}]`, `a barrier stays ${BARRIER_MARGIN} m inside the extent, so its band fits the grid`) })
      }
    }

    // free-standing trees (decision 0024) are their own kinds: a feature cannot turn into one or out of one (it would
    // paint nothing), and the trees' attributes mean nothing on other kinds
    const kindGrowth = chain.reduce<unknown>((g, n) => cat.kinds[n].set?.growth ?? g, undefined)
    if (f.growth !== undefined && (f.growth === 'tree') !== (kindGrowth === 'tree')) bad(id, `${path}.growth`, kindGrowth === 'tree' ? `${kind} is a free-standing tree; for an area of growth use another kind` : 'a free-standing tree is a kind of its own (veg.tree…), on a point or a line')
    if (kindGrowth !== 'tree') for (const a of ['form', 'crown', 'spacing']) if (f[a] !== undefined) bad(id, `${path}.${a}`, 'is for free-standing trees (veg.tree…)')

    // references
    for (const r of REFS) {
      const want = meta.refs[r]
      if (f[r] === undefined) { if (want && !meta.optional.includes(r)) bad(id, `${path}.${r}`, `${kind} needs "${r}"`); continue }
      if (!want) { bad(id, `${path}.${r}`, `${kind} takes no "${r}"`); continue }
      if (want === 'point') { if (!isPt(f[r])) bad(id, `${path}.${r}`, 'must be a point [x, z]'); else checkInside(f[r] as Pt, `${path}.${r}`, extent, (p, m) => bad(id, p, m)); continue }
      const target = r === 'along' ? (isObj(f.along) ? f.along.id : undefined) : f[r]
      if (r === 'along' && (!isObj(f.along) || Object.keys(f.along).sort().join() !== 'from,id,to' || typeof f.along.from !== 'number' || typeof f.along.to !== 'number' || f.along.from < 0 || f.along.to <= f.along.from)) {
        bad(id, `${path}.along`, 'must be { "id", "from": m, "to": m } with 0 ≤ from < to'); continue
      }
      if (r === 'along' && (!onCentimetres((f.along as { from: number }).from) || !onCentimetres((f.along as { to: number }).to))) bad(id, `${path}.along`, 'metres carry at most 2 decimals (1 cm)')
      const t = typeof target === 'string' ? byId.get(target) : undefined
      if (!t) { bad(id, `${path}.${r}`, `no feature "${String(target)}"`); continue }
      if (t.id === id) { bad(id, `${path}.${r}`, 'a feature cannot reference itself'); continue }
      const tk = featureKind(t, presets), [wantCat, wantShape] = want.split(':')
      if (!tk || categoryOf(tk) !== wantCat) { bad(id, `${path}.${r}`, `"${t.id}" is a ${tk ?? 'feature without a kind'}; "${r}" needs a ${wantCat}.* feature`); continue }
      if (wantShape && t[wantShape] === undefined) { bad(id, `${path}.${r}`, `"${t.id}" has no ${wantShape}; "${r}" needs a ${wantCat}.* feature drawn as a ${wantShape}`); continue }
      if (r === 'along' && Array.isArray(t.line) && t.line.every(isPt)) {
        const len = lineLength(t.line as Pt[]), a = f.along as { from: number; to: number }
        if (a.to > len) bad(id, `${path}.along.to`, `${a.to} m runs past the end of "${t.id}" (${Math.floor(len)} m long)`)
      }
    }

    // attributes, seasons
    checkAttrs(cat, id, f, path, category, bad, RESERVED as readonly string[])
    // a ramp's input must fit the shape: `edge` on an area, `along` on a line
    for (const [a, v] of Object.entries(f)) {
      if (!isObj(v) || !Object.hasOwn(cat.attributes, a) || !cat.attributes[a].ramp) continue
      const input = Object.keys(v)[0], shape = SHAPES.find(s => f[s] !== undefined)
      if (input === 'edge' && shape && !['area', 'circle', 'ellipse'].includes(shape)) bad(id, `${path}.${a}`, `an "edge" ramp needs an area, circle or ellipse, not a ${shape}`)
      if (input === 'along' && shape && shape !== 'line') bad(id, `${path}.${a}`, `an "along" ramp needs a line, not a ${shape}`)
    }
    if (f.seasons !== undefined) {
      if (!isObj(f.seasons)) bad(id, `${path}.seasons`, 'must be an object of seasons')
      else for (const [season, attrs] of Object.entries(f.seasons)) {
        const sp = `${path}.seasons.${season}`
        if (!(SEASONS as readonly string[]).includes(season)) { bad(id, sp, `unknown season (${SEASONS.join(', ')})`); continue }
        if (!isObj(attrs)) { bad(id, sp, 'must be an object of attributes'); continue }
        checkAttrs(cat, id, attrs, sp, category, bad, [], true)
      }
    }
  })

  // references must not loop (a feature is expanded after what it references, §4)
  const state = new Map<string, 1 | 2>()
  const trail: string[] = []
  const visit = (fid: string): void => {
    if (state.get(fid) === 2) return
    if (state.get(fid) === 1) { bad(fid, 'features', `references loop: ${[...trail.slice(trail.indexOf(fid)), fid].join(' → ')}`); return }
    state.set(fid, 1); trail.push(fid)
    const f = byId.get(fid)!
    for (const r of ['on', 'carries', 'crosses'] as const) if (typeof f[r] === 'string' && byId.has(f[r] as string)) visit(f[r] as string)
    if (isObj(f.along) && typeof f.along.id === 'string' && byId.has(f.along.id)) visit(f.along.id)
    trail.pop(); state.set(fid, 2)
  }
  for (const fid of [...byId.keys()].sort()) visit(fid)
  return out
}

const featureKind = (f: Feature, presets: Record<string, Record<string, unknown>>): string | undefined =>
  typeof f.kind === 'string' ? f.kind : typeof f.preset === 'string' && Object.hasOwn(presets, f.preset) && typeof presets[f.preset].kind === 'string' ? presets[f.preset].kind as string : undefined

function checkAttrs(cat: Catalogue, id: string | null, obj: Record<string, unknown>, path: string, category: string, bad: (id: string | null, p: string, m: string) => void, skip: readonly string[], seasonal = false): void {
  for (const [a, v] of Object.entries(obj)) {
    if (skip.includes(a)) continue
    const spec = Object.hasOwn(cat.attributes, a) ? cat.attributes[a] : undefined
    if (!spec) { bad(id, `${path}.${a}`, 'unknown field or attribute'); continue }
    if (!allowedIn(cat, spec, category)) { bad(id, `${path}.${a}`, `is not an attribute of ${category}.* kinds (it belongs to ${spec.layers.join(', ')})`); continue }
    if (seasonal && !spec.season) { bad(id, `${path}.${a}`, 'cannot change with the season'); continue }
    const e = checkValue(spec, v, true); if (e) bad(id, `${path}.${a}`, e)
  }
}

function checkInside(p: Pt, path: string, extent: { w: number; h: number } | null, bad: (p: string, m: string) => void, r = 0): void {
  if (!onCentimetres(p[0]) || !onCentimetres(p[1])) bad(path, 'coordinates carry at most 2 decimals (1 cm)')
  if (extent && (Math.abs(p[0]) + r > extent.w / 2 || Math.abs(p[1]) + r > extent.h / 2)) bad(path, `lies outside the extent (±${extent.w / 2}, ±${extent.h / 2} m)`)
}

// `partial`: the outer ring is completed by shared edges (`follow`) at expansion, so it may hold a single point and
// is checked as a ring only then (holes are checked as always)
function checkShape(s: typeof SHAPES[number], v: unknown, path: string, extent: { w: number; h: number } | null, bad: (p: string, m: string) => void, partial = false): void {
  const pts = (a: unknown, min: number, p: string): Pt[] | null => {
    if (!Array.isArray(a) || a.length < min || !a.every(isPt)) { bad(p, `must be a list of at least ${min} points [x, z]`); return null }
    a.forEach((q, i) => checkInside(q, `${p}[${i}]`, extent, bad))
    return a
  }
  switch (s) {
    case 'point': if (!isPt(v)) bad(path, 'must be a point [x, z]'); else checkInside(v, path, extent, bad); return
    case 'line': {
      const l = pts(v, 2, path); if (!l) return
      const last = l[l.length - 1], closed = l.length > 3 && last[0] === l[0][0] && last[1] === l[0][1]
      const open = closed ? l.slice(0, -1) : l
      const b = lineFoldBack(open); if (b >= 0) { bad(`${path}[${b}]`, 'the line turns back on itself here, or repeats a point'); return }
      // a line that ends where it starts is closed (a walled yard): checked as a ring, with no free ends (§3.6)
      const c = closed ? ringCrossing(open) : lineCrossing(l)
      if (c) bad(path, `crosses itself (segments ${c[0]} and ${c[1]})`)
      return
    }
    case 'area': {
      if (!Array.isArray(v) || v.length < 1) { bad(path, 'must be a list of rings: the outer ring, then holes'); return }
      const rings = v.map((r, k) => pts(r, partial && k === 0 ? 1 : 3, `${path}[${k}]`))
      rings.forEach((r, k) => {
        if (!r || (partial && k === 0)) return
        const last = r[r.length - 1]
        if (last[0] === r[0][0] && last[1] === r[0][1]) { bad(`${path}[${k}]`, 'rings close by themselves: drop the repeated last point'); rings[k] = null; return }
        const c = ringCrossing(r)
        if (c) { bad(`${path}[${k}]`, `crosses itself (edges ${c[0]} and ${c[1]})`); rings[k] = null; return }
        if (ringArea2(r) === 0) { bad(`${path}[${k}]`, 'has no area (its points are in a line)'); rings[k] = null }
      })
      const outer = rings[0]
      if (!outer || partial) return   // holes inside a ring that is not whole yet: checked after expansion
      rings.forEach((h, k) => {
        if (!h || k === 0) return
        const hp = `${path}[${k}]`
        if (!h.every(q => inRing(outer, q))) { bad(hp, 'a hole must lie inside the outer ring'); return }
        for (let j = 0; j < k; j++) {
          const o = rings[j]
          if (o && ringsTouch(h, o)) { bad(hp, j ? `touches or crosses hole ${j}` : 'touches or crosses the outer ring'); return }
          if (o && j > 0 && (inRing(o, h[0]) || inRing(h, o[0]))) { bad(hp, `lies inside or around hole ${j}`); return }
        }
      })
      return
    }
    case 'circle': {
      if (!Array.isArray(v) || v.length !== 2 || !isPt(v[0]) || !isRadius(v[1])) { bad(path, 'must be [[x, z], radius > 0, at most 2 decimals]'); return }
      checkInside(v[0], path, extent, bad, v[1]); return
    }
    case 'ellipse': {
      if (!Array.isArray(v) || v.length !== 4 || !isPt(v[0]) || !isRadius(v[1]) || !isRadius(v[2]) || typeof v[3] !== 'number' || !Number.isFinite(v[3])) { bad(path, 'must be [[x, z], radius along, radius across, angle]: radii > 0 with at most 2 decimals'); return }
      checkInside(v[0], path, extent, bad, Math.max(v[1], v[2])); return
    }
  }
}

// an expanded map's own check: no generator left (§3.4)
export function validateExpanded(map: MapFile, cat: Catalogue): Issue[] {
  const out = validate(map, cat)
  map.features.forEach((f, i) => {
    if (f.gen !== undefined) out.push({ id: f.id, path: `features[${i}].gen`, message: 'an expanded map has no generators left' })
    if (f.follow !== undefined) out.push({ id: f.id, path: `features[${i}].follow`, message: 'an expanded map has no shared edges left' })
  })
  return out
}
