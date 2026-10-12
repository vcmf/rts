// The generators (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): for each, the shape it
// reads, the shape it writes, its parameters (checked by the validator like attributes) and the pure function that
// runs it. A generator's randomness comes from its seed alone: hash(map.seed, the feature's id, its name).
import type { AttrValue, Feature, FieldSpec, ShapeName } from './schema.ts'
import { HEADING_MAX, meander } from './meander.ts'
import { clump } from './clump.ts'
import { num } from './util.ts'

export interface ParamSpec extends FieldSpec { required?: boolean }
export interface GenSpec {
  kinds?: string[]                 // the kinds (dotted prefixes) it may run on; any kind taking its output when absent
  input: ShapeName[]               // the shapes it reads (the feature's own shape, before expansion)
  output: ShapeName                // the shape it writes, which the feature's kind must take
  params: Record<string, ParamSpec>
  run(f: Feature, attrs: Record<string, AttrValue>, params: Record<string, number>, seed: number): Partial<Feature>
}

export const GENERATOR_SPECS: Record<string, GenSpec> = {
  meander: {
    kinds: ['water.stream', 'water.river'], input: ['line'], output: 'line',
    params: {
      amplitude: { type: 'number', unit: 'm', min: 1, max: 1000, required: true },   // the belt's half-width
      wavelength: { type: 'number', unit: 'm', min: 10, max: 10000 },               // along the valley; default 11 widths
      bend: { type: 'number', unit: 'rad', min: 0.2, max: HEADING_MAX },             // the largest swing; default 1.2
    },
    run: (f, a, p, seed) => ({ line: meander(f.line!, num(a.width, 6), { amplitude: p.amplitude, wavelength: p.wavelength, bend: p.bend }, seed) }),
  },
  clump: {
    input: ['point', 'circle', 'ellipse'], output: 'area',
    params: {
      radius: { type: 'number', unit: 'm', min: 1, max: 2000 },   // for a point
      coherence: { type: 'number', unit: '0..1', min: 0, max: 1 },
      raggedness: { type: 'number', unit: '0..1', min: 0, max: 1 },
      points: { type: 'int', unit: 'count', min: 8, max: 256 },
    },
    run: (f, _a, p, seed) => {
      if (p.radius !== undefined && !f.point) throw new Error('radius is for a clump around a point; a circle or an ellipse gives its own size')
      const [c, ra, rb, ang] = f.point ? [f.point, p.radius ?? 50, p.radius ?? 50, 0] : f.circle ? [f.circle[0], f.circle[1], f.circle[1], 0] : f.ellipse!
      return { area: [clump(c, ra, rb, ang, p, seed)] }
    },
  },
}
// named by the language, built in M3b
export const PENDING_GENERATORS = ['street-village', 'scatter']
