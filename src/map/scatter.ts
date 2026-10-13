// scatter (docs/proposals/map-engine.md §3.4, docs/plans/done/m3-generators.md M3b): `count` children inside a
// region, each a clump of radius between radiusMin and radiusMax, by seeded rejection sampling: a centre is kept when
// its clump (at its largest possible radius) lies inside the region, `clearance` m clear of everything it avoids and
// of its siblings, and, when asked, within reach of something it must stay near. The siblings sit in a grid and the
// avoided features are skipped by their boxes, so a scatter of hundreds stays quick. 0 A.D.'s placer, painter and
// constraint triple, as data (docs/research/map-generation-in-games.md §3).
import type { Pt } from './schema.ts'
import { random } from './seed.ts'
import { inRing } from './geometry.ts'
import { nearLine } from './apply.ts'

export interface ScatterSite { x: number; z: number; r: number; entry: number }
// one kind of child: how many, how large, how far its clump may reach past its radius (clumpMaxRadius)
export interface ScatterEntry { count: number; radiusMin: number; radiusMax: number; spread: number }
export interface ScatterRules {
  entries: ScatterEntry[]; clearance: number
  clear(x: number, z: number, need: number): boolean   // nothing to avoid lies closer than `need`
  near?(x: number, z: number): boolean                 // within reach of something it must stay near (when asked)
}

// Joint placement: each try serves the entry furthest behind its count (ties to the earlier entry), so every kind
// gets its share of the room; every site keeps `clearance` from every other, whatever their kinds. Each entry has
// its own budget of 400 tries per child asked, so one that cannot be placed gives up without starving the others.
export function scatterSites(region: Pt[][], rules: ScatterRules, seed: number): ScatterSite[] {
  const rnd = random(seed), outer = region[0], xs = outer.map(p => p[0]), zs = outer.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), rings = region.map(r => [...r, r[0]] as Pt[])
  const inside = (x: number, z: number) => { let k = false; for (const r of region) if (inRing(r, [x, z])) k = !k; return k }
  const edge = (x: number, z: number) => Math.min(...rings.map(r => nearLine(r, x, z).d))
  // siblings in a grid of cells as wide as the farthest two may need to be apart, so each try checks its neighbours only
  const reachMax = Math.max(...rules.entries.map(e => e.radiusMax * e.spread)), cell = 2 * reachMax + rules.clearance, grid = new Map<string, ScatterSite[]>()
  const key = (i: number, j: number) => `${i},${j}`
  const placed = rules.entries.map(() => 0), tried = rules.entries.map(() => 0), sites: ScatterSite[] = []
  const open = (k: number) => placed[k] < rules.entries[k].count && tried[k] < rules.entries[k].count * 400
  for (;;) {
    let e = -1
    for (let k = 0; k < rules.entries.length; k++) if (open(k) && (e < 0 || placed[k] / rules.entries[k].count < placed[e] / rules.entries[e].count)) e = k
    if (e < 0) break
    tried[e]++
    const en = rules.entries[e], x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), r = en.radiusMin + rnd() * (en.radiusMax - en.radiusMin), R = r * en.spread
    if (!inside(x, z) || edge(x, z) < R) continue
    const gi = Math.floor((x - x0) / cell), gj = Math.floor((z - z0) / cell)
    let crowded = false
    for (let dj = -1; dj <= 1 && !crowded; dj++) for (let di = -1; di <= 1 && !crowded; di++)
      for (const s of grid.get(key(gi + di, gj + dj)) ?? []) if (Math.sqrt((s.x - x) * (s.x - x) + (s.z - z) * (s.z - z)) < s.r * rules.entries[s.entry].spread + R + rules.clearance) { crowded = true; break }
    if (crowded || !rules.clear(x, z, R + rules.clearance) || (rules.near && !rules.near(x, z))) continue
    const site = { x, z, r, entry: e }
    sites.push(site); placed[e]++
    const k = key(gi, gj), list = grid.get(k)
    if (list) list.push(site); else grid.set(k, [site])
  }
  return sites
}
