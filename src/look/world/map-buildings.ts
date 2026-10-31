// A map's buildings as the look page's models (G3d, docs/plans/active/g3d-villages.md): each standing house, barn and
// church (src/render/lit/houses.ts, standing: the staff map's rule) a model of prototypes/buildings.data.js turned and
// scaled onto its footprint. Pure: the compiler (window-build.ts) and the tile worker run it.
import type { Pt } from '../../map/schema.ts'
import type { Standing } from '../../render/lit/houses.ts'
import { FOOT, type Building } from './buildings.ts'
import { segD } from './geom.ts'
import { hash } from '../noise.ts'
import type { MapLine } from './from-map.ts'

// the models a building may take, by their index in the look data (BUILDING_MODELS[k])
export const BUILDING_MODELS: readonly Building['model'][] = ['windmill', 'house', 'farmhouse', 'manor']
// floats a building in the look data: its model's index, x, z (m), yaw (rad), scale
export const BUILDING_FLOATS = 5
// the models a house or a barn may take, and a church (none of its own yet: the manor, scaled to its length)
const HOUSES: readonly Building['model'][] = ['house', 'farmhouse', 'manor']
// a fit within this share of the best (its width against the footprint's) is as good: picked among by the building's
// place, so a street of like houses is not one model
const FIT_SLACK = 0.12
// m: a road farther than this from a building turns it no way (its front its long side's either)
const ROAD_NEAR = 60

/** A footprint's centre, its long axis (unit) and its length and width along and across it, m (a 4-corner ring's) */
function frame(ring: readonly Pt[]): { c: Pt; u: Pt; length: number; width: number } {
  const n = ring.length
  const c: Pt = [ring.reduce((a, p) => a + p[0], 0) / n, ring.reduce((a, p) => a + p[1], 0) / n]
  // the longest side's direction; the extent along it and across it (any convex ring)
  let best = 0
  let u: Pt = [1, 0]
  for (let k = 0; k < n; k++) {
    const [a, b] = [ring[k], ring[(k + 1) % n]]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) [best, u] = [l, [(b[0] - a[0]) / l, (b[1] - a[1]) / l]]
  }
  const along = ring.map(p => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1])
  const across = ring.map(p => -(p[0] - c[0]) * u[1] + (p[1] - c[1]) * u[0])
  return {
    c,
    u,
    length: Math.max(...along) - Math.min(...along),
    width: Math.max(...across) - Math.min(...across),
  }
}

/**
 * The buildings of a tile as models, in the window's metres: each standing building (map metres; ruins, roofless,
 * left out: no burnt model) whose centre lies within `half` m of the tile's centre `at` (map metres; the window's
 * frame is `at` less `tileAt`), its model (a house or a barn the model whose shape fits its footprint best, the long
 * side the model's x, the fits within FIT_SLACK picked among by its place; a church the manor), its scale (the
 * model's length to the footprint's), its yaw (the front, the model's −z, toward the nearest road within ROAD_NEAR of
 * it: `lines`, in the window's metres). BUILDING_FLOATS a building.
 */
export function mapBuildings(
  standing: readonly Standing[],
  at: { x: number; z: number },
  half: number,
  lines: readonly MapLine[],
): Float32Array {
  const out: number[] = []
  for (const b of standing) {
    if (!b.roof) continue
    const f = frame(b.rings[0])
    const x = f.c[0] - at.x
    const z = f.c[1] - at.z
    if (Math.abs(x) > half || Math.abs(z) > half) continue
    let model: Building['model'] = 'manor'
    if (!b.church) {
      const err = HOUSES.map(m => {
        const { hx = 1, hz = 1 } = FOOT[m]
        return Math.abs((f.length / (2 * hx)) * 2 * hz - f.width) / f.width
      })
      const best = Math.min(...err)
      const good = HOUSES.filter((_, k) => err[k] <= best + FIT_SLACK)
      // (picked by its place on the map, not on the tile: a house keeps its model whichever tile holds it)
      model = good[Math.min(good.length - 1, Math.floor(hash(f.c[0], f.c[1]) * good.length))]
    }
    const scale = f.length / (2 * (FOOT[model].hx ?? 1))
    // the front: across the long axis, toward the nearest road's segment
    let n: Pt = [-f.u[1], f.u[0]]
    let near = ROAD_NEAR
    let toward: Pt | null = null
    for (const l of lines) {
      for (let k = 0; k + 1 < l.pts.length; k++) {
        const [a, c] = [l.pts[k], l.pts[k + 1]]
        const d = segD(x, z, a, c)
        if (d < near) {
          near = d
          // the segment's nearest point
          const dx = c[0] - a[0]
          const dz = c[1] - a[1]
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)))
          toward = [a[0] + t * dx - x, a[1] + t * dz - z]
        }
      }
    }
    if (toward && n[0] * toward[0] + n[1] * toward[1] < 0) n = [-n[0], -n[1]]
    // (the model's front, local (0, −1), is (−sin yaw, −cos yaw) in the world: buildings.ts, toWorld)
    const yaw = Math.atan2(-n[0], -n[1])
    out.push(BUILDING_MODELS.indexOf(model), x, z, yaw, scale)
  }
  return Float32Array.from(out)
}

/** A tile's buildings from its data (BUILDING_FLOATS each) as the page's list. Throws on a record cut short or a model
 *  no index names. */
export function decodeBuildings(b: Float32Array): Building[] {
  if (b.length % BUILDING_FLOATS) throw new Error(`buildings: ${b.length} floats, not a whole number of buildings`)
  const out: Building[] = []
  for (let k = 0; k < b.length; k += BUILDING_FLOATS) {
    const model = BUILDING_MODELS[b[k]]
    if (!model) throw new Error(`buildings: no model ${b[k]} (building ${k / BUILDING_FLOATS})`)
    out.push({ model, x: b[k + 1], z: b[k + 2], yaw: b[k + 3], scale: b[k + 4] })
  }
  return out
}
