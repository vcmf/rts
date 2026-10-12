// clump (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): an organic outline around a point,
// a circle or an ellipse. A radial polygon (so always simple) whose radius swings by a few seeded low harmonics
// (the shape) and, with raggedness, some higher ones (the edge's wobble); coherence 1 is the plain circle or ellipse.
import type { Pt } from './schema.ts'
import { random } from './seed.ts'
import { cos, sin, PI } from '../sim/num.ts'
import { cm } from './util.ts'

export interface ClumpParams { coherence?: number; raggedness?: number; points?: number }
export const CLUMP_DEFAULTS = { coherence: 0.6, raggedness: 0.3, points: 48 }
// the shape's and the wobble's weights, and the harmonics they swing (below); a clump's radius never exceeds
// clumpMaxRadius × its own (each harmonic's weight at most its full share)
const SHAPE = 0.35, WOBBLE = 0.15, SHAPE_H = [2, 3, 4], WOBBLE_H = [7, 8, 9, 10], SHAPE_DIV = 1.6, WOBBLE_DIV = 2.2
export const clumpMaxRadius = (coherence: number, raggedness: number): number =>
  1 + (1 - coherence) * SHAPE * SHAPE_H.length / SHAPE_DIV + (1 - coherence) * raggedness * WOBBLE * WOBBLE_H.length / WOBBLE_DIV

export function clump(centre: Pt, ra: number, rb: number, angle: number, p: ClumpParams, seed: number): Pt[] {
  const coherence = p.coherence ?? CLUMP_DEFAULTS.coherence, ragged = p.raggedness ?? CLUMP_DEFAULTS.raggedness, N = p.points ?? CLUMP_DEFAULTS.points
  const rnd = random(seed), shape = (1 - coherence) * SHAPE, wobble = (1 - coherence) * ragged * WOBBLE
  // harmonics 2–4 for the shape, 7–10 for the wobble: a weight and a phase each
  const H = [...SHAPE_H.map(k => ({ k, a: shape * (0.4 + 0.6 * rnd()) / SHAPE_DIV, ph: rnd() * 2 * PI })), ...WOBBLE_H.map(k => ({ k, a: wobble * (0.4 + 0.6 * rnd()) / WOBBLE_DIV, ph: rnd() * 2 * PI }))]
  const ca = cos(angle), sa = sin(angle), ring: Pt[] = []
  for (let i = 0; i < N; i++) {
    const t = 2 * PI * i / N
    let r = 1
    for (const h of H) r += h.a * sin(h.k * t + h.ph)
    r = Math.max(0.4, r)
    const lx = cos(t) * ra * r, lz = sin(t) * rb * r
    ring.push([cm(centre[0] + lx * ca - lz * sa), cm(centre[1] + lx * sa + lz * ca)])
  }
  return ring.filter((q, k) => k === 0 || q[0] !== ring[k - 1][0] || q[1] !== ring[k - 1][1])
}
