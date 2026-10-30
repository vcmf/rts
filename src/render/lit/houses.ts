// The lit map's buildings (docs/plans/active/m6-lit-view.md, M6b; decision 0065): which of a compiled map's houses,
// barns and churches stand, and their footprints' triangles. Pure functions, tested in test/render-lit-houses.test.ts;
// the view raises them (src/render/lit/view.ts setHouses).
import type { Feature, Pt } from '../../map/schema.ts'
import type { Resolved } from '../../map/resolve.ts'
import { inRing, ringArea2 } from '../../map/geometry.ts'
import { ringsOf } from '../../map/reach.ts'
import { BUILDING_BZ, clampSun, SHADOW_REACH, sunXZ, type Sun } from './bake.ts'

/** A building as the view stands it: its outer ring and its courtyards (counter-clockwise), wall height, kind. */
export interface Standing {
  rings: Pt[][]
  height: number
  church: boolean
  roof: boolean
}

/** The share of a building's cells that must be its own for it to stand. */
export const OWN_SHARE = 0.5

/**
 * The buildings that stand: each `built.house`, `.barn` and `.church` whose cells (those whose centre lies in its
 * footprint) are at least OWN_SHARE its own in the `built` layer. A building whose cells another built feature took
 * does not stand (decision 0065); a cell lost to a neighbour on a shared wall, or a sliver where a curve's polygon and
 * the curve differ, does not topple it. `index`: a feature's 1-based value in the layers (its table position + 1).
 */
export function standing(
  features: Feature[],
  table: Resolved[],
  built: Uint16Array,
  grid: { x0: number; z0: number; cell: number; nx: number; nz: number },
): Standing[] {
  const index = new Map(table.map((r, k) => [r.id, k]))
  return features.flatMap(f => {
    const k = index.get(f.id)
    const r = k === undefined ? undefined : table[k]
    if (k === undefined || !r || !/^built\.(house|barn|church)(\.|$)/.test(r.kind)) return []
    const rings = ringsOf(f)
    if (!rings) return []
    const [outer, ...holes] = rings
    const xs = outer.map(p => p[0])
    const zs = outer.map(p => p[1])
    const i0 = Math.floor((Math.min(...xs) - grid.x0) / grid.cell)
    const i1 = Math.floor((Math.max(...xs) - grid.x0) / grid.cell)
    const j0 = Math.floor((Math.min(...zs) - grid.z0) / grid.cell)
    const j1 = Math.floor((Math.max(...zs) - grid.z0) / grid.cell)
    let own = 0
    let under = 0
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p: Pt = [grid.x0 + (i + 0.5) * grid.cell, grid.z0 + (j + 0.5) * grid.cell]
        if (!inRing(outer, p) || holes.some(h => inRing(h, p))) continue
        under++
        if (i >= 0 && j >= 0 && i < grid.nx && j < grid.nz && built[j * grid.nx + i] === k + 1) own++
      }
    }
    if (!under || own < OWN_SHARE * under) return []
    const wall = typeof r.attrs.wall === 'number' ? r.attrs.wall : 4
    return [
      {
        rings: [ccw(outer), ...holes.map(h => ccw(h))],
        height: wall,
        church: r.kind.startsWith('built.church'),
        roof: r.attrs.roof !== 'none', // a burnt house: its state lowers its walls and takes its roof
      },
    ]
  })
}

/** A ring turned counter-clockwise (seen from above, x east, z north). */
export const ccw = (ring: Pt[]): Pt[] => (ringArea2(ring) < 0 ? [...ring].reverse() : ring)

/**
 * A footprint's outline with its courtyards bridged in: each hole joined to the outer ring by a slit from the hole's
 * vertex farthest east to the nearest outer vertex east of it, so one simple ring covers the footprint less its
 * courtyards (for the roof's triangles). Holes are walked clockwise, the outer ring counter-clockwise.
 */
export function bridged(rings: Pt[][]): Pt[] {
  let ring = ccw(rings[0])
  const holes = rings.slice(1).map(h => [...ccw(h)].reverse())
  holes.sort((a, b) => Math.max(...b.map(p => p[0])) - Math.max(...a.map(p => p[0])))
  for (const hole of holes) {
    const hi = hole.reduce((best, p, k) => (p[0] > hole[best][0] ? k : best), 0)
    const h = hole[hi]
    let oi = 0
    let bestD = Infinity
    ring.forEach((p, k) => {
      const d = (p[0] - h[0]) ** 2 + (p[1] - h[1]) ** 2 + (p[0] < h[0] ? 1e12 : 0)
      if (d < bestD) {
        bestD = d
        oi = k
      }
    })
    const walk = [...hole.slice(hi), ...hole.slice(0, hi + 1)]
    ring = [...ring.slice(0, oi + 1), ...walk, ...ring.slice(oi)]
  }
  return ring
}

/** The triangles of a simple counter-clockwise ring, by ear clipping (a footprint has a few corners). */
export function triangulate(ring: Pt[]): [number, number, number][] {
  const left = ring.map((_, k) => k)
  const out: [number, number, number][] = []
  const area2 = (a: number, b: number, c: number) =>
    (ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[b][1] - ring[a][1]) * (ring[c][0] - ring[a][0])
  // strictly inside: a corner on an ear's edge (a traced footprint's midpoint, a courtyard's slit) does not block it
  const inside = (p: number, a: number, b: number, c: number) =>
    ring[p] !== ring[a] &&
    ring[p] !== ring[b] &&
    ring[p] !== ring[c] &&
    area2(a, b, p) > 0 &&
    area2(b, c, p) > 0 &&
    area2(c, a, p) > 0
  let guard = ring.length * ring.length
  while (left.length > 3 && guard-- > 0) {
    let cut = false
    for (let k = 0; k < left.length; k++) {
      const a = left[(k + left.length - 1) % left.length]
      const b = left[k]
      const c = left[(k + 1) % left.length]
      if (area2(a, b, c) === 0) {
        left.splice(k, 1) // a corner on a straight edge: drop it, it bounds nothing
        cut = true
        break
      }
      if (area2(a, b, c) < 0) continue // a reflex corner is no ear
      if (left.some(p => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue
      out.push([a, b, c])
      left.splice(k, 1)
      cut = true
      break
    }
    if (!cut) break // a ring that is not simple: what is left is fanned
  }
  for (let k = 1; k + 1 < left.length; k++) out.push([left[0], left[k], left[k + 1]])
  return out
}

/**
 * The buildings' shadows on the ground (G2b, decision 0090): along every wall of each building (a courtyard's too), a
 * quad from its foot to where the sun casts its top, `bz` times its height (BUILDING_BZ by default) at the sun's
 * height, at most SHADOW_REACH. Their union is the shadow, the footprint's own swept copy within it; the view draws it
 * over the plane in the ground's light, darkening each pixel once (shaders/shadows.frag). As x, z pairs and triangles.
 */
export function shadowQuads(houses: Standing[], sun: Sun, bz = BUILDING_BZ): { xz: number[]; tris: number[] } {
  const lit = clampSun(sun)
  const [lx, lz] = sunXZ(lit)
  const cast = 1 / Math.tan((lit.el * Math.PI) / 180)
  const xz: number[] = []
  const tris: number[] = []
  for (const h of houses) {
    const reach = Math.min(SHADOW_REACH, h.height * Math.max(0, bz) * cast)
    const dx = -lx * reach
    const dz = -lz * reach
    for (const ring of h.rings) {
      for (let k = 0; k < ring.length; k++) {
        const [ax, az] = ring[k]
        const [bx, bz2] = ring[(k + 1) % ring.length]
        const v = xz.length / 2
        xz.push(ax, az, bx, bz2, bx + dx, bz2 + dz, ax + dx, az + dz)
        tris.push(v, v + 1, v + 2, v, v + 2, v + 3)
      }
    }
  }
  return { xz, tris }
}
