// scatter (docs/proposals/map-engine.md §3.4, docs/plans/active/m3-generators.md M3b): `count` children inside a
// region, each a clump of radius between radiusMin and radiusMax, by seeded rejection sampling: a centre is kept when
// its clump (at its largest possible radius) lies inside the region, `clearance` m clear of everything it avoids and
// of its siblings, and, when asked, within `reach` m of something it must stay near. 0 A.D.'s placer, painter and
// constraint triple, as data (docs/research/map-generation-in-games.md §3).
import type { Pt } from './schema.ts'
import { random } from './seed.ts'
import { inRing } from './geometry.ts'
import { nearLine } from './apply.ts'

export interface ScatterSite { x: number; z: number; r: number }
export interface ScatterRules {
  count: number; radiusMin: number; radiusMax: number; clearance: number; reach: number; spread: number   // spread: a clump's largest radius / its radius
  avoid(x: number, z: number): number      // the distance to the nearest feature to avoid (Infinity: none)
  near?(x: number, z: number): number      // the distance to the nearest feature to stay within reach of
}

export function scatterSites(region: Pt[][], rules: ScatterRules, seed: number): ScatterSite[] {
  const rnd = random(seed), outer = region[0], xs = outer.map(p => p[0]), zs = outer.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), rings = region.map(r => [...r, r[0]] as Pt[])
  const inside = (x: number, z: number) => { let k = false; for (const r of region) if (inRing(r, [x, z])) k = !k; return k }
  const edge = (x: number, z: number) => Math.min(...rings.map(r => nearLine(r, x, z).d))
  const sites: ScatterSite[] = []
  for (let tries = 0; sites.length < rules.count && tries < rules.count * 400; tries++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), r = rules.radiusMin + rnd() * (rules.radiusMax - rules.radiusMin), R = r * rules.spread
    if (!inside(x, z) || edge(x, z) < R) continue
    if (rules.avoid(x, z) < R + rules.clearance) continue
    if (rules.near && rules.near(x, z) > rules.reach) continue
    if (sites.some(s => Math.sqrt((s.x - x) * (s.x - x) + (s.z - z) * (s.z - z)) < s.r * rules.spread + R + rules.clearance)) continue
    sites.push({ x, z, r })
  }
  return sites
}
