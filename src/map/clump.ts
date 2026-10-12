// clump (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md): an organic outline around a point,
// a circle or an ellipse. A radial polygon (so always simple) whose radius swings by a few seeded low harmonics
// (the shape) and, with raggedness, some higher ones (the edge's wobble); coherence 1 is the plain circle or ellipse.
import type { Pt } from './schema.ts'
import { random } from './seed.ts'
import { cos, sin, PI } from '../sim/num.ts'
import { cm } from './util.ts'

export interface ClumpParams { coherence?: number; raggedness?: number; points?: number }
export const CLUMP_DEFAULTS = { coherence: 0.6, raggedness: 0.3, points: 48 }

export function clump(centre: Pt, ra: number, rb: number, angle: number, p: ClumpParams, seed: number): Pt[] {
  const coherence = p.coherence ?? CLUMP_DEFAULTS.coherence, ragged = p.raggedness ?? CLUMP_DEFAULTS.raggedness, N = p.points ?? CLUMP_DEFAULTS.points
  const rnd = random(seed), shape = (1 - coherence) * 0.35, wobble = (1 - coherence) * ragged * 0.15
  // harmonics 2–4 for the shape, 7–10 for the wobble: a weight and a phase each
  const H = [2, 3, 4, 7, 8, 9, 10].map(k => ({ k, a: (k < 7 ? shape : wobble) * (0.4 + 0.6 * rnd()) / (k < 7 ? 1.6 : 2.2), ph: rnd() * 2 * PI }))
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
