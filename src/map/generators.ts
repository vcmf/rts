// The generators (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): for each, the shape it
// reads, the shape it writes, its parameters (checked by the validator like attributes), what it reads of the other
// features, and the pure function that runs it. A generator's randomness comes from its seed alone:
// hash(map.seed, the feature's id, its name). Expansion (src/map/expand.ts, decision 0023) runs each after everything
// it reads, as a chain (a cycle is an error), and shows it only finished features.
import type { AttrValue, Catalogue, Feature, FieldSpec, Pt, ShapeName } from './schema.ts'
import { HEADING_MAX, meander } from './meander.ts'
import type { ClumpParams } from './clump.ts'
import { clump, clumpMaxRadius, CLUMP_DEFAULTS } from './clump.ts'
import { HOUSE_SPAN, streetVillage, villageZone } from './street-village.ts'
import { scatterSites } from './scatter.ts'
import type { Zone } from './reach.ts'
import { boxDistance, boxOf, distanceTo, distanceToPolygon, matches } from './reach.ts'
import { allowedIn, categoryOf, checkValue, kindChain, kindMeta } from './catalogue.ts'
import { random, seedOf } from './seed.ts'
import { cos, sin, PI } from '../sim/num.ts'
import { cm, num } from './util.ts'

export interface ParamSpec extends FieldSpec { required?: boolean }
// what a generator sees: its feature (resolved), its parameters and seed, and the finished features (everything it
// reads has run: the reads form a chain)
export interface GenContext {
  f: Feature; kind: string; attrs: Record<string, AttrValue>; params: Record<string, unknown>; seed: number; mapSeed: number
  features: Map<string, Feature>; attrsOf(id: string): Record<string, AttrValue>; kindOf(id: string): string
}
// its output: the feature's new shape (or null: the feature leaves the expanded map), and any children
export interface GenOutput { self: Partial<Feature> | null; children?: Feature[] }
export interface GenSpec {
  kinds?: string[]                 // the kinds (dotted prefixes) it may run on; any kind taking its output when absent
  input: (ShapeName | 'none')[]    // the shapes it reads (the feature's own shape, before expansion; 'none': no shape)
  output: ShapeName                // the shape it writes (for itself or its children), which the kind must take
  params: Record<string, ParamSpec>
  selects?: string[]               // the list parameters that name features (ids, categories or kind prefixes)
  // what it reads of the other features, as selectors (ids, categories, kind prefixes): it runs after every generator
  // whose output these could match
  reads?(f: Feature, params: Record<string, unknown>): string[]
  // the kinds of the children it writes, when it writes any (ids <feature>-<n>)
  childKinds?(kind: string, params: Record<string, unknown>): string[]
  removesSelf?: boolean            // its own feature leaves the expanded map (a scatter's region)
  // generators of this name never read each other (street villages, decision 0023): each declares where its output
  // can reach whatever its seed (a zone, and its own area), and two whose reaches come within `gap` are an error
  // before anything runs. Apart, neither can change the other's output, so neither needs to wait. Null: it cannot
  // tell (what it reaches from is not finished), which is an error too
  peers?: { gap: number; reach(f: Feature, features: Map<string, Feature>, attrsOf: (id: string) => Record<string, AttrValue>): Zone | null }
  // its own checks of its parameters, beyond their specs (a scatter's mix entries against the catalogue); always run,
  // so each must skip a parameter of the wrong type (its spec's error is reported already)
  check?(params: Record<string, unknown>, cat: Catalogue, f: Feature): { key: string; message: string }[]
  run(ctx: GenContext): GenOutput
}

// a generated child's id is its parent's and -1, -2, …: the one place the form is decided
export function childOf(id: string): { parent: string; n: number } | null {
  const m = /^(.*)-([1-9]\d*)$/.exec(id)
  return m ? { parent: m[1], n: Number(m[2]) } : null
}
// the parents that pinned children name (origin.parent): a selector may still name the parent to mean them
export const pinnedParentsOf = (features: Feature[]): Set<string> => new Set(features.flatMap(f => (typeof f.origin?.parent === 'string' ? [f.origin.parent] : [])))

// the fields a generator's children take from their parent: all but its id, generator, shape and origin
const childFields = (f: Feature, shape: string): Record<string, unknown> => Object.fromEntries(Object.entries(f).filter(([k]) => !['id', 'gen', 'origin', shape].includes(k)))
const P = (p: Record<string, unknown>, k: string): number | undefined => (typeof p[k] === 'number' ? p[k] as number : undefined)
const list = (v: unknown): string[] => (Array.isArray(v) ? v as string[] : [])
const hasShape = (g: Feature) => !!(g.line || g.area || g.circle || g.ellipse || g.point)
// the finished features with a shape that a set of selectors matches (never the generator's own feature), each once
const select = (ctx: GenContext, sels: string[]) => [...ctx.features.values()].filter(g => g.id !== ctx.f.id && hasShape(g) && sels.some(s => matches(s, g, ctx.kindOf(g.id))))

const VILLAGE_KEEPS_CLEAR = ['water', 'built', 'zone.nogo', 'way', 'barrier']   // what a house keeps clear of
const TREE_KEEPS_CLEAR = ['water', 'way', 'built', 'barrier']   // what a group's crowns keep clear of
const BUILT_GAP = 1   // m between a house and any other building (another village's included)

// a scatter's kinds: its mix's entries, or one entry from the scatter itself
interface Entry { kind: string; count: number; radiusMin: number; radiusMax: number; min: number; coherence: number; raggedness: number; set: Record<string, AttrValue> }
// a clump's parameters: the scatter's own for a single kind, each entry's in a mix
const CLUMP_PARAMS: Record<string, ParamSpec> = {
  count: { type: 'int', unit: 'count', min: 1, max: 500 },
  radiusMin: { type: 'number', unit: 'm', min: 2, max: 2000 },
  radiusMax: { type: 'number', unit: 'm', min: 2, max: 2000 },
  min: { type: 'int', unit: 'count', min: 0, max: 500 },
  coherence: { type: 'number', unit: '0..1', min: 0, max: 1 }, raggedness: { type: 'number', unit: '0..1', min: 0, max: 1 },
}
const ENTRY_KEYS = ['kind', ...Object.keys(CLUMP_PARAMS), 'set']
// the fields a mix scatter's feature may carry: its children take their entry's kind and set, nothing of the scatter's
const MIX_SCATTER_FIELDS = ['id', 'kind', 'gen', 'area', 'note', 'source', 'follow', 'clear']   // follow shapes the region; its clear reaches every child
function entriesOf(kind: string, p: Record<string, unknown>): Entry[] {
  const one = (e: Record<string, unknown>, k: string, set: Record<string, AttrValue>): Entry => {
    const count = P(e, 'count')!, radiusMin = P(e, 'radiusMin') ?? 30
    return { kind: k, count, radiusMin, radiusMax: P(e, 'radiusMax') ?? Math.max(radiusMin, 60), min: P(e, 'min') ?? count, coherence: P(e, 'coherence') ?? CLUMP_DEFAULTS.coherence, raggedness: P(e, 'raggedness') ?? CLUMP_DEFAULTS.raggedness, set }
  }
  return Array.isArray(p.mix) ? (p.mix as Record<string, unknown>[]).map(e => one(e, e.kind as string, (e.set ?? {}) as Record<string, AttrValue>)) : [one(p, kind, {})]
}

export const GENERATOR_SPECS: Record<string, GenSpec> = {
  meander: {
    kinds: ['water.stream', 'water.river'], input: ['line'], output: 'line',
    params: {
      amplitude: { type: 'number', unit: 'm', min: 1, max: 1000, required: true },   // the belt's half-width
      wavelength: { type: 'number', unit: 'm', min: 10, max: 10000 },               // along the valley; default 11 widths
      bend: { type: 'number', unit: 'rad', min: 0.2, max: HEADING_MAX },             // the largest swing; default 1.2
    },
    run: ({ f, attrs, params, seed }) => ({ self: { line: meander(f.line!, num(attrs.width, 6), { amplitude: P(params, 'amplitude')!, wavelength: P(params, 'wavelength'), bend: P(params, 'bend') }, seed) } }),
  },
  clump: {
    input: ['point', 'circle', 'ellipse'], output: 'area',
    params: {
      radius: { type: 'number', unit: 'm', min: 1, max: 2000 },   // for a point
      coherence: { type: 'number', unit: '0..1', min: 0, max: 1 },
      raggedness: { type: 'number', unit: '0..1', min: 0, max: 1 },
      points: { type: 'int', unit: 'count', min: 8, max: 256 },
    },
    run: ({ f, params, seed }) => {
      const radius = P(params, 'radius')
      if (radius !== undefined && !f.point) throw new Error('radius is for a clump around a point; a circle or an ellipse gives its own size')
      const [c, ra, rb, ang] = f.point ? [f.point, radius ?? 50, radius ?? 50, 0] : f.circle ? [f.circle[0], f.circle[1], f.circle[1], 0] : f.ellipse!
      return { self: { area: [clump(c, ra, rb, ang, params as ClumpParams, seed)] } }
    },
  },
  'street-village': {
    kinds: ['built.village'], input: ['area', 'none'], output: 'area', childKinds: () => ['built.house'],
    reads: f => [f.along!.id, ...VILLAGE_KEEPS_CLEAR],
    peers: {
      gap: BUILT_GAP,
      reach: (f, features, attrsOf) => { const road = features.get(f.along!.id); return road?.line ? villageZone(road.line, num(attrsOf(road.id).width, 5), f.along!.from, f.along!.to, !!f.area) : null },
    },
    params: { min: { type: 'int', unit: 'count', min: 0, max: 500 } },
    run: ctx => {
      const { f, attrs, params, seed, features, attrsOf, kindOf } = ctx
      const along = f.along!, roadF = features.get(along.id)!, road = roadF.line!, roadA = attrsOf(along.id), rw = num(roadA.width, 5)
      const want = num(attrs.houses, 12), min = P(params, 'min') ?? want
      // what a house keeps clear of, as a whole polygon (its own road aside: a house keeps 1 m from it where it bends
      // back): 2 m from water, a barrier's band (its thickness in 2 m cells, centred, proposal §3.6) plus 1 m, and
      // 1 m from the rest (a bridge has no shape)
      const gap = (g: Feature) => matches('water', g, kindOf(g.id)) ? 2 : matches('barrier', g, kindOf(g.id)) ? num(attrsOf(g.id).thickness, 2) + 1 : BUILT_GAP
      const near = select(ctx, VILLAGE_KEEPS_CLEAR).filter(g => g.id !== along.id).map(g => ({ g, box: boxOf(g, attrsOf(g.id)), gap: gap(g) }))
      // a feature whose box lies farther than the gap plus a house's reach from a corner cannot touch the house
      const clear = (house: Pt[]) => near.every(({ g, box, gap }) => house.some(([x, z]) => boxDistance(box, x, z) > gap + HOUSE_SPAN) || distanceToPolygon(g, attrsOf(g.id), house) > gap)
        && distanceToPolygon(roadF, roadA, house) > 1
      const row = streetVillage(road, rw, along.from, along.to, want, seed, { clear })
      if (row.houses.length < min) throw new Error(`placed ${row.houses.length} of ${want} houses between ${along.from} and ${along.to} m along "${along.id}"; lengthen the stretch, ask fewer houses, or allow fewer with min`)
      const children: Feature[] = row.houses.map((h, k) => ({ id: `${f.id}-${k + 1}`, kind: 'built.house', area: [h] }))
      // the village's ground: its own area, or the hull of its houses (none when no house fits and min allows it)
      return { self: f.area || row.hull.length < 3 ? {} : { area: [row.hull] }, children }
    },
  },
  scatter: {
    input: ['area'], output: 'area', removesSelf: true, selects: ['avoid', 'within'],
    childKinds: (kind, p) => (Array.isArray(p.mix) ? (p.mix as Record<string, unknown>[]).map(e => String(e.kind)) : [kind]),
    reads: (_f, p) => [...list(p.avoid), ...list(p.within)],
    params: {
      ...CLUMP_PARAMS,
      mix: { type: 'entries' },   // several kinds placed jointly: [{ kind, count, radiusMin?, radiusMax?, min?, coherence?, raggedness?, set? }]
      avoid: { type: 'list' }, clearance: { type: 'number', unit: 'm', min: 0, max: 2000 },
      within: { type: 'list' }, reach: { type: 'number', unit: 'm', min: 0, max: 5000 },
    },
    check: (p, cat, f) => {
      const out: { key: string; message: string }[] = []
      if (p.mix === undefined) { if (p.count === undefined) out.push({ key: 'count', message: 'is required (or give a mix)' }); return out }
      if (!Array.isArray(p.mix) || p.mix.some(e => typeof e !== 'object' || e === null || Array.isArray(e))) return out   // its spec's error is reported already
      for (const k of Object.keys(CLUMP_PARAMS)) if (p[k] !== undefined) out.push({ key: k, message: 'belongs to each entry of a mix, not to the scatter' })
      const own = Object.keys(f).filter(k => !MIX_SCATTER_FIELDS.includes(k))
      if (own.length) out.push({ key: 'mix', message: `the scatter's own ${own.join(', ')} reach no child of a mix: each child takes only its entry's kind and set` })
      ;(p.mix as Record<string, unknown>[]).forEach((e, n) => {
        const at = `mix[${n}]`
        for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) out.push({ key: `${at}.${k}`, message: `unknown field (${ENTRY_KEYS.join(', ')})` })
        const chain = typeof e.kind === 'string' ? kindChain(cat, e.kind) : null
        if (!chain) { out.push({ key: `${at}.kind`, message: 'must name a kind in the catalogue' }); return }
        if (!kindMeta(cat, chain).shapes.includes('area')) out.push({ key: `${at}.kind`, message: `${e.kind} takes no area` })
        if (e.count === undefined) out.push({ key: `${at}.count`, message: 'is required' })
        for (const [k, spec] of Object.entries(CLUMP_PARAMS)) if (e[k] !== undefined) { const m = checkValue(spec, e[k]); if (m) out.push({ key: `${at}.${k}`, message: m }) }
        if (typeof e.radiusMin === 'number' && typeof e.radiusMax === 'number' && e.radiusMax < e.radiusMin) out.push({ key: `${at}.radiusMax`, message: 'is below radiusMin' })
        if (e.set !== undefined) {
          if (typeof e.set !== 'object' || e.set === null || Array.isArray(e.set)) out.push({ key: `${at}.set`, message: 'must be an object of attributes' })
          else for (const [a, v] of Object.entries(e.set)) {
            const spec = Object.hasOwn(cat.attributes, a) ? cat.attributes[a] : undefined
            if (!spec) out.push({ key: `${at}.set.${a}`, message: 'unknown attribute' })
            else if (!allowedIn(cat, spec, categoryOf(e.kind as string))) out.push({ key: `${at}.set.${a}`, message: `is not an attribute of ${categoryOf(e.kind as string)}.* kinds` })
            else { const m = checkValue(spec, v, true); if (m) out.push({ key: `${at}.set.${a}`, message: m }) }
          }
        }
      })
      return out
    },
    run: ctx => {
      const { f, params, seed, mapSeed, attrsOf } = ctx
      const entries = entriesOf(ctx.kind, params)
      // a single kind's children carry the scatter's own fields (its kind or preset, its attributes); a mix's, their
      // entry's kind and set
      const single = Array.isArray(params.mix) ? null : childFields(f, 'area')
      for (const e of entries) if (e.radiusMax < e.radiusMin) throw new Error(`radiusMax (${e.radiusMax}) is below radiusMin (${e.radiusMin})`)
      const avoid = select(ctx, list(params.avoid)).map(g => ({ g, box: boxOf(g, attrsOf(g.id)) }))
      const within = select(ctx, list(params.within)).map(g => ({ g, box: boxOf(g, attrsOf(g.id)) }))
      if (list(params.within).length && !within.length) throw new Error(`nothing matches within (${list(params.within).join(', ')}): no child could be placed near it`)
      const reach = P(params, 'reach') ?? 100
      const sites = scatterSites(f.area!, {
        entries: entries.map(e => ({ count: e.count, radiusMin: e.radiusMin, radiusMax: e.radiusMax, spread: clumpMaxRadius(e.coherence, e.raggedness) })),
        clearance: P(params, 'clearance') ?? 20,
        // a feature whose box is already far enough cannot be too close: skipped without measuring it
        clear: (x, z, need) => avoid.every(({ g, box }) => boxDistance(box, x, z) >= need || distanceTo(g, attrsOf(g.id), x, z) >= need),
        near: within.length ? (x, z) => within.some(({ g, box }) => boxDistance(box, x, z) <= reach && distanceTo(g, attrsOf(g.id), x, z) <= reach) : undefined,
      }, seed)
      const short = entries.map((e, k) => ({ e, n: sites.filter(s => s.entry === k).length })).filter(({ e, n }) => n < e.min)
      if (short.length) throw new Error(`placed ${short.map(({ e, n }) => `${n} of ${e.count} ${e.kind}`).join(', ')} in the region; widen it, ask fewer or smaller, ease the clearance, or allow fewer with min`)
      const children: Feature[] = sites.map((s, k) => {
        const id = `${f.id}-${k + 1}`, e = entries[s.entry]
        return { ...(single ?? { ...e.set, kind: e.kind, ...(f.clear !== undefined ? { clear: f.clear } : {}) }), id, area: [clump([cm(s.x), cm(s.z)], s.r, s.r, 0, { coherence: e.coherence, raggedness: e.raggedness }, seedOf(mapSeed, id, 'clump'))] } as Feature
      })
      return { self: null, children }
    },
  },
  // a few free-standing trees around a point (two or three poplars by a farm): `count` trees within `spread` m of it,
  // their crowns apart (trunks a crown's width from each other) and clear of water, ways, buildings and barriers,
  // seeded; the point leaves the map, the trees are its children
  group: {
    kinds: ['veg.tree'], input: ['point'], output: 'point', removesSelf: true, childKinds: kind => [kind],
    reads: () => TREE_KEEPS_CLEAR,
    params: {
      count: { type: 'int', unit: 'count', min: 2, max: 5 },
      spread: { type: 'number', unit: 'm', min: 1, max: 50 },
    },
    run: ctx => {
      const { f, attrs, params, seed, attrsOf } = ctx
      const crown = num(attrs.crown, 4), count = P(params, 'count') ?? 3, spread = P(params, 'spread') ?? 3 * crown
      const rnd = random(seed), pts: Pt[] = [], [cx, cz] = f.point!
      // a crown keeps clear of the water, ways, buildings and barriers within its reach (those farther are skipped by their boxes)
      const near = select(ctx, TREE_KEEPS_CLEAR).map(g => ({ g, box: boxOf(g, attrsOf(g.id)) })).filter(({ box }) => boxDistance(box, cx, cz) <= spread + crown)
      const clear = (x: number, z: number) => near.every(({ g }) => distanceTo(g, attrsOf(g.id), x, z) > crown)
      for (let tries = 0; pts.length < count && tries < count * 200; tries++) {
        // uniform in the disc: the radius as the square root of a uniform draw
        const r = spread * Math.sqrt(rnd()), t = 2 * PI * rnd(), p: Pt = [cm(cx + r * cos(t)), cm(cz + r * sin(t))]
        if (clear(p[0], p[1]) && pts.every(q => (q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]) >= 4 * crown * crown)) pts.push(p)
      }
      if (pts.length < count) throw new Error(`placed ${pts.length} of ${count} trees ${2 * crown} m apart within ${spread} m, clear of water, ways, buildings and barriers: move the point, widen spread or ask fewer`)
      const own = childFields(f, 'point')
      return { self: null, children: pts.map((p, k) => ({ ...own, id: `${f.id}-${k + 1}`, point: p }) as Feature) }
    },
  },
}
