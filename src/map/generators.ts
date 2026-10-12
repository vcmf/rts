// The generators (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): for each, the shape it
// reads, the shape it writes, its parameters (checked by the validator like attributes), what it reads of the other
// features, and the pure function that runs it. A generator's randomness comes from its seed alone:
// hash(map.seed, the feature's id, its name). Expansion (src/map/expand.ts) runs each after what it reads, and shows
// it only finished features.
import type { AttrValue, Feature, FieldSpec, Pt, ShapeName } from './schema.ts'
import { HEADING_MAX, meander } from './meander.ts'
import type { ClumpParams } from './clump.ts'
import { clump, clumpMaxRadius, CLUMP_DEFAULTS } from './clump.ts'
import { streetVillage } from './street-village.ts'
import { scatterSites } from './scatter.ts'
import { boxDistance, boxOf, distanceTo, distanceToPolygon, matches } from './reach.ts'
import { seedOf } from './seed.ts'
import { cm, num } from './util.ts'

export interface ParamSpec extends FieldSpec { required?: boolean }
// a selector's state when a generator runs: a finished feature (or a generator that has run, whatever it produced),
// a generator still to run (only ever a soft read inside a group of mutual readers: it sees nothing of it yet), or
// nothing the map holds
export type Status = 'finished' | 'pending' | 'unknown'
// what a generator sees: its feature (resolved), its parameters and seed, and the finished features
export interface GenContext {
  f: Feature; attrs: Record<string, AttrValue>; params: Record<string, unknown>; seed: number; mapSeed: number
  features: Map<string, Feature>; attrsOf(id: string): Record<string, AttrValue>; kindOf(id: string): string
  isKind(sel: string): boolean       // a category or a kind of the catalogue (else a selector names a feature)
  status(id: string): Status         // for a selector that names a feature
  // the output of the generators that ran earlier in its group and wanted to keep clear of it (separation is mutual:
  // if A keeps clear of B, they end up apart whichever runs first): it keeps clear of these too
  keepClearOf: Feature[]
}
// its output: the feature's new shape (or null: the feature leaves the expanded map), and any children
export interface GenOutput { self: Partial<Feature> | null; children?: Feature[] }
// what it reads of the others, as selectors (ids, categories, kind prefixes). Hard: it cannot run without them (a
// village's road, a scatter's `within`), so they always come first, and a loop of hard reads is an error. Soft: it
// keeps clear of them (water, buildings, a scatter's `avoid`); inside a group of generators that read each other, a
// soft read of one not yet run sees nothing of it.
export interface Reads { hard: string[]; soft: string[] }
export interface GenSpec {
  kinds?: string[]                 // the kinds (dotted prefixes) it may run on; any kind taking its output when absent
  input: (ShapeName | 'none')[]    // the shapes it reads (the feature's own shape, before expansion; 'none': no shape)
  output: ShapeName                // the shape it writes (for itself or its children), which the kind must take
  params: Record<string, ParamSpec>
  selects?: string[]               // the list parameters that name features (ids, categories or kind prefixes)
  reads?(f: Feature, params: Record<string, unknown>): Reads
  childKind?(kind: string): string // the kind of the children it writes, when it writes any (ids <feature>-<n>)
  removesSelf?: boolean            // its own feature leaves the expanded map (a scatter's region)
  run(ctx: GenContext): GenOutput
}

// a generated child's id is its parent's and -1, -2, …: the one place the form is decided
export function childOf(id: string): { parent: string; n: number } | null {
  const m = /^(.*)-([1-9]\d*)$/.exec(id)
  return m ? { parent: m[1], n: Number(m[2]) } : null
}

const P = (p: Record<string, unknown>, k: string): number | undefined => (typeof p[k] === 'number' ? p[k] as number : undefined)
const list = (v: unknown): string[] => (Array.isArray(v) ? v as string[] : [])
// the finished features with a shape that a set of selectors matches (never the generator's own feature)
const hasShape = (g: Feature) => !!(g.line || g.area || g.circle || g.ellipse || g.point)
const select = (ctx: GenContext, sels: string[]) => [...ctx.features.values()].filter(g => g.id !== ctx.f.id && hasShape(g) && sels.some(s => matches(s, g, ctx.kindOf(g.id))))

// the parents that pinned children name (origin.parent): a selector may still name the parent to mean them
export const pinnedParentsOf = (features: Feature[]): Set<string> => new Set(features.flatMap(f => (f.origin?.parent ? [f.origin.parent] : [])))
// every selector that names a feature must name one the map holds (a kind may match nothing on a map; a name that does
// is a mistake: a child past its parent's count, a feature since removed)
function checkNames(ctx: GenContext, sels: string[]): void {
  for (const sel of sels) if (!ctx.isKind(sel) && ctx.status(sel) === 'unknown') throw new Error(`"${sel}" names nothing on the map`)
}

const VILLAGE_KEEPS_CLEAR = ['water', 'built', 'zone.nogo', 'way', 'barrier']   // soft reads: what a house keeps clear of

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
    kinds: ['built.village'], input: ['area', 'none'], output: 'area', childKind: () => 'built.house',
    reads: f => ({ hard: [f.along!.id], soft: VILLAGE_KEEPS_CLEAR }),
    params: { min: { type: 'int', unit: 'count', min: 0, max: 500 } },
    run: ctx => {
      const { f, attrs, params, seed, features, attrsOf, kindOf } = ctx
      const along = f.along!, roadF = features.get(along.id)!, road = roadF.line!, roadA = attrsOf(along.id), rw = num(roadA.width, 5)
      const want = num(attrs.houses, 12), min = P(params, 'min') ?? want
      // what a house keeps clear of, as a whole polygon: what its soft reads match among the finished features (its
      // own road aside: a house keeps 1 m from it where it bends back), at 2 m from water, a barrier's band (its
      // thickness in 2 m cells, centred, proposal §3.6) plus 1 m, and 1 m from the rest (a bridge has no shape)
      const gap = (g: Feature) => matches('water', g, kindOf(g.id)) ? 2 : matches('barrier', g, kindOf(g.id)) ? num(attrsOf(g.id).thickness, 2) + 1 : 1
      const near = [...select(ctx, VILLAGE_KEEPS_CLEAR).filter(g => g.id !== along.id), ...ctx.keepClearOf.filter(hasShape)]
        .map(g => ({ g, box: boxOf(g, attrsOf(g.id)), gap: gap(g) }))
      // a house is far from a feature whose box is farther than the gap from every corner: skipped without measuring
      const clear = (house: Pt[]) => near.every(({ g, box, gap }) => house.every(([x, z]) => boxDistance(box, x, z) > gap + 30) || distanceToPolygon(g, attrsOf(g.id), house) > gap)
        && distanceToPolygon(roadF, roadA, house) > 1
      const row = streetVillage(road, rw, along.from, along.to, want, seed, { clear })
      if (row.houses.length < min) throw new Error(`placed ${row.houses.length} of ${want} houses between ${along.from} and ${along.to} m along "${along.id}"; lengthen the stretch, ask fewer houses, or allow fewer with min`)
      const children: Feature[] = row.houses.map((h, k) => ({ id: `${f.id}-${k + 1}`, kind: 'built.house', area: [h] }))
      // the village's ground: its own area, or the hull of its houses (none when no house fits and min allows it)
      return { self: f.area || row.hull.length < 3 ? {} : { area: [row.hull] }, children }
    },
  },
  scatter: {
    input: ['area'], output: 'area', childKind: kind => kind, removesSelf: true, selects: ['avoid', 'within'],
    reads: (_f, p) => ({ hard: list(p.within), soft: list(p.avoid) }),
    params: {
      count: { type: 'int', unit: 'count', min: 1, max: 500, required: true },
      radiusMin: { type: 'number', unit: 'm', min: 2, max: 2000 },
      radiusMax: { type: 'number', unit: 'm', min: 2, max: 2000 },
      avoid: { type: 'list' }, clearance: { type: 'number', unit: 'm', min: 0, max: 2000 },
      within: { type: 'list' }, reach: { type: 'number', unit: 'm', min: 0, max: 5000 },
      min: { type: 'int', unit: 'count', min: 0, max: 500 },
      coherence: { type: 'number', unit: '0..1', min: 0, max: 1 }, raggedness: { type: 'number', unit: '0..1', min: 0, max: 1 },
    },
    run: ctx => {
      const { f, params, seed, mapSeed, attrsOf } = ctx
      const count = P(params, 'count')!, rMin = P(params, 'radiusMin') ?? 30, rMax = P(params, 'radiusMax') ?? Math.max(rMin, 60)
      if (rMax < rMin) throw new Error(`radiusMax (${rMax}) is below radiusMin (${rMin})`)
      const coherence = P(params, 'coherence') ?? CLUMP_DEFAULTS.coherence, ragged = P(params, 'raggedness') ?? CLUMP_DEFAULTS.raggedness
      checkNames(ctx, [...list(params.avoid), ...list(params.within)])
      const avoid = [...select(ctx, list(params.avoid)), ...ctx.keepClearOf.filter(hasShape)].map(g => ({ g, box: boxOf(g, attrsOf(g.id)) }))
      const within = select(ctx, list(params.within)).map(g => ({ g, box: boxOf(g, attrsOf(g.id)) }))
      if (list(params.within).length && !within.length) throw new Error(`nothing matches within (${list(params.within).join(', ')}): no child could be placed near it`)
      const reach = P(params, 'reach') ?? 100
      const sites = scatterSites(f.area!, {
        count, radiusMin: rMin, radiusMax: rMax, clearance: P(params, 'clearance') ?? 20, spread: clumpMaxRadius(coherence, ragged),
        // a feature whose box is already far enough cannot be too close: skipped without measuring it
        clear: (x, z, need) => avoid.every(({ g, box }) => boxDistance(box, x, z) >= need || distanceTo(g, attrsOf(g.id), x, z) >= need),
        near: within.length ? (x, z) => within.some(({ g, box }) => boxDistance(box, x, z) <= reach && distanceTo(g, attrsOf(g.id), x, z) <= reach) : undefined,
      }, seed)
      const min = P(params, 'min') ?? count
      if (sites.length < min) throw new Error(`placed ${sites.length} of ${count} in the region; widen it, ask fewer or smaller, ease the clearance, or allow fewer with min`)
      const own = Object.fromEntries(Object.entries(f).filter(([k]) => !['id', 'gen', 'area', 'origin'].includes(k)))
      const children: Feature[] = sites.map((s, k) => {
        const id = `${f.id}-${k + 1}`
        return { ...own, id, area: [clump([cm(s.x), cm(s.z)], s.r, s.r, 0, { coherence, raggedness: ragged }, seedOf(mapSeed, id, 'clump'))] } as Feature
      })
      return { self: null, children }
    },
  },
}
