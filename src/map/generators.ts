// The generators (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): for each, the shape it
// reads, the shape it writes, its parameters (checked by the validator like attributes) and the pure function that
// runs it. A generator's randomness comes from its seed alone: hash(map.seed, the feature's id, its name).
import type { AttrValue, Feature, FieldSpec, Pt, ShapeName } from './schema.ts'
import { HEADING_MAX, meander } from './meander.ts'
import type { ClumpParams } from './clump.ts'
import { clump, clumpMaxRadius, CLUMP_DEFAULTS } from './clump.ts'
import { streetVillage } from './street-village.ts'
import { scatterSites } from './scatter.ts'
import { distanceTo, distanceToPolygon, matches } from './reach.ts'
import { seedOf } from './seed.ts'
import { cm, num } from './util.ts'

export interface ParamSpec extends FieldSpec { required?: boolean }
// what a generator sees: its feature (resolved), its parameters and seed, and the features already expanded (the
// ones it may read: a village's road, the things a scatter avoids)
export interface GenContext {
  f: Feature; attrs: Record<string, AttrValue>; params: Record<string, unknown>; seed: number; mapSeed: number
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
  reads?: boolean                  // reads other features (after the ones that only reshape their own, in id order)
  late?: boolean                   // runs after every other generator (it reads their output; scatters)
  children?: boolean               // writes children (ids <feature>-<n>, reserved by the validator)
  run(ctx: GenContext): GenOutput
}

const P = (p: Record<string, unknown>, k: string): number | undefined => (typeof p[k] === 'number' ? p[k] as number : undefined)

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
    kinds: ['built.village'], input: ['area', 'none'], output: 'area', reads: true, children: true,
    params: { min: { type: 'int', unit: 'count', min: 0, max: 500 } },
    run: ({ f, attrs, params, seed, features, attrsOf, kindOf }) => {
      const along = f.along!, road = features.get(along.id)!.line!, want = num(attrs.houses, 12), min = P(params, 'min') ?? want
      // what a house must keep clear of, as a whole polygon: water, other buildings (any shape; a bridge has none
      // and is skipped), other ways and barriers, and its own road where the road bends back
      const water = [...features.values()].filter(g => kindOf(g.id).startsWith('water.'))
      const built = [...features.values()].filter(g => kindOf(g.id).startsWith('built.') && g.id !== f.id && (g.area || g.circle || g.ellipse || g.point))
      const roadF = features.get(along.id)!, roadA = attrsOf(along.id), rw = num(roadA.width, 5)
      const lines = [...features.values()].filter(g => g.id !== along.id && g.line && (kindOf(g.id).startsWith('way.') || kindOf(g.id).startsWith('barrier.')))
      // a barrier's band is its thickness in 2 m cells, centred on its line (proposal §3.6)
      const lineGap = (g: Feature) => (kindOf(g.id).startsWith('barrier.') ? num(attrsOf(g.id).thickness, 2) : 0) + 1
      const clear = (house: Pt[]) => water.every(g => distanceToPolygon(g, attrsOf(g.id), house) > 2) && built.every(g => distanceToPolygon(g, attrsOf(g.id), house) > 1)
        && lines.every(g => distanceToPolygon(g, attrsOf(g.id), house) > lineGap(g)) && distanceToPolygon(roadF, roadA, house) > 1
      const row = streetVillage(road, rw, along.from, along.to, want, seed, { clear })
      if (row.houses.length < min) throw new Error(`placed ${row.houses.length} of ${want} houses between ${along.from} and ${along.to} m along "${along.id}"; lengthen the stretch, ask fewer houses, or allow fewer with min`)
      const children: Feature[] = row.houses.map((h, k) => ({ id: `${f.id}-${k + 1}`, kind: 'built.house', area: [h] }))
      // the village's ground: its own area, or the hull of its houses (none when no house fits and min allows it)
      return { self: f.area || row.hull.length < 3 ? {} : { area: [row.hull] }, children }
    },
  },
  scatter: {
    input: ['area'], output: 'area', late: true, children: true, selects: ['avoid', 'within'],
    params: {
      count: { type: 'int', unit: 'count', min: 1, max: 500, required: true },
      radiusMin: { type: 'number', unit: 'm', min: 2, max: 2000 },
      radiusMax: { type: 'number', unit: 'm', min: 2, max: 2000 },
      avoid: { type: 'list' }, clearance: { type: 'number', unit: 'm', min: 0, max: 2000 },
      within: { type: 'list' }, reach: { type: 'number', unit: 'm', min: 0, max: 5000 },
      min: { type: 'int', unit: 'count', min: 0, max: 500 },
      coherence: { type: 'number', unit: '0..1', min: 0, max: 1 }, raggedness: { type: 'number', unit: '0..1', min: 0, max: 1 },
    },
    run: ({ f, params, seed, mapSeed, features, attrsOf, kindOf }) => {
      const count = P(params, 'count')!, rMin = P(params, 'radiusMin') ?? 30, rMax = P(params, 'radiusMax') ?? Math.max(rMin, 60)
      if (rMax < rMin) throw new Error(`radiusMax (${rMax}) is below radiusMin (${rMin})`)
      const coherence = P(params, 'coherence') ?? CLUMP_DEFAULTS.coherence, ragged = P(params, 'raggedness') ?? CLUMP_DEFAULTS.raggedness
      // a clump's largest radius over its radius, from clump's own harmonics (3 for the shape, 4 for the wobble)
      const spread = clumpMaxRadius(coherence, ragged)
      const pick = (sel: unknown) => (Array.isArray(sel) ? sel as string[] : [])
      const of = (sels: string[]) => [...features.values()].filter(g => g.id !== f.id && sels.some(s => matches(s, g, kindOf(g.id))))
      const avoid = of(pick(params.avoid)), within = of(pick(params.within))
      if (pick(params.within).length && !within.length) throw new Error(`nothing matches within (${pick(params.within).join(', ')}): no child could be placed near it`)
      const nearest = (gs: Feature[], x: number, z: number) => gs.reduce((d, g) => Math.min(d, distanceTo(g, attrsOf(g.id), x, z)), Infinity)
      const sites = scatterSites(f.area!, {
        count, radiusMin: rMin, radiusMax: rMax, clearance: P(params, 'clearance') ?? 20, reach: P(params, 'reach') ?? 100, spread,
        avoid: (x, z) => nearest(avoid, x, z), near: within.length ? (x, z) => nearest(within, x, z) : undefined,
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
