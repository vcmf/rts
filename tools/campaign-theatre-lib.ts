// The pure parts of tools/campaign-theatre.ts (docs/plans/active/k1-theatre-look.md): the frame's projection and grid,
// lines in the map's metres, and the road router. No file or network access here. Plain float64 in a tool, not the
// sim's. Tested in test/campaign-theatre.test.ts.
import { inRing, lineLength } from '../src/map/geometry.ts'
import type { Pt } from '../src/map/schema.ts'
import { Heap, simplify } from './streams.ts'

export type { Pt }

/** The theatre's frame: a projection centred on (lat0, lon0) and the map's half extents in metres. */
export interface Frame {
  lat0: number
  lon0: number
  halfX: number
  halfZ: number
}

// the authalic sphere's radius, in metres
const EARTH_R = 6371007.2
const RAD = Math.PI / 180

/** Lambert azimuthal equal-area on a sphere, centred on (lat0, lon0), both ways. */
export function projection(lat0: number, lon0: number) {
  const sin0 = Math.sin(lat0 * RAD)
  const cos0 = Math.cos(lat0 * RAD)

  /** Degrees to the map's metres. */
  function forward(lat: number, lon: number): Pt {
    const phi = lat * RAD
    const dLon = (lon - lon0) * RAD
    const cosC = sin0 * Math.sin(phi) + cos0 * Math.cos(phi) * Math.cos(dLon)
    const k = Math.sqrt(2 / (1 + cosC))
    const x = EARTH_R * k * Math.cos(phi) * Math.sin(dLon)
    const z = EARTH_R * k * (cos0 * Math.sin(phi) - sin0 * Math.cos(phi) * Math.cos(dLon))
    return [x, z]
  }

  /** The map's metres to degrees, as [lat, lon]. */
  function inverse(x: number, z: number): [number, number] {
    const rho = Math.hypot(x, z)
    if (rho < 1e-9) return [lat0, lon0]
    const c = 2 * Math.asin(rho / (2 * EARTH_R))
    const sinC = Math.sin(c)
    const cosC = Math.cos(c)
    const lat = Math.asin(cosC * sin0 + (z * sinC * cos0) / rho)
    const lon = lon0 * RAD + Math.atan2(x * sinC, rho * cos0 * cosC - z * sin0 * sinC)
    return [lat / RAD, lon / RAD]
  }

  return { forward, inverse }
}

/**
 * The frame's height grid: nodes `cell` metres apart from edge to edge, node (i, j) at (-halfX + i·cell,
 * -halfZ + j·cell). The cell must divide both extents, so the last node sits on the far edge and the page can map the
 * grid onto the frame exactly.
 */
export function frameGrid(frame: Frame, cell: number): { nx: number; nz: number } {
  const sx = (2 * frame.halfX) / cell
  const sz = (2 * frame.halfZ) / cell
  if (!Number.isInteger(sx) || !Number.isInteger(sz)) {
    throw new Error(`a cell of ${cell} m does not divide the frame (${2 * frame.halfX} × ${2 * frame.halfZ} m)`)
  }
  return { nx: sx + 1, nz: sz + 1 }
}

/** Chaikin's corner cutting, `rounds` times, the ends kept. */
export function smooth(points: Pt[], rounds: number): Pt[] {
  let P = points
  for (let r = 0; r < rounds; r++) {
    const Q: Pt[] = [P[0]]
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k]
      const [bx, bz] = P[k + 1]
      Q.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz])
    }
    Q.push(P[P.length - 1])
    P = Q
  }
  return P
}

/** The road router's grid: heights every `size` metres from the frame's south-west corner, and its closed cells. */
export interface RouteGrid {
  gx: number
  gz: number
  size: number
  x0: number
  z0: number
  h: Float32Array
  closed: Uint8Array
}

/**
 * The router's grid from a height function, with every cell whose centre lies in one of `closedRings` closed (lakes).
 */
export function routeGrid(frame: Frame, size: number, height: (x: number, z: number) => number, closedRings: Pt[][]) {
  const gx = Math.floor((2 * frame.halfX) / size) + 1
  const gz = Math.floor((2 * frame.halfZ) / size) + 1
  const x0 = -frame.halfX
  const z0 = -frame.halfZ
  const h = new Float32Array(gx * gz)
  const closed = new Uint8Array(gx * gz)
  for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) h[j * gx + i] = height(x0 + i * size, z0 + j * size)
  for (const ring of closedRings) {
    const xs = ring.map(p => p[0])
    const zs = ring.map(p => p[1])
    const i0 = Math.max(0, Math.ceil((Math.min(...xs) - x0) / size))
    const i1 = Math.min(gx - 1, Math.floor((Math.max(...xs) - x0) / size))
    const j0 = Math.max(0, Math.ceil((Math.min(...zs) - z0) / size))
    const j1 = Math.min(gz - 1, Math.floor((Math.max(...zs) - z0) / size))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) if (inRing(ring, [x0 + i * size, z0 + j * size])) closed[j * gx + i] = 1
    }
  }
  return { gx, gz, size, x0, z0, h, closed } satisfies RouteGrid
}

/**
 * The cheapest path between two points over the router's grid (A*, eight neighbours). A step costs its length times
 * 1 + (slope / slopeAtDouble)², so a road climbs only where it must. It never enters a closed cell (unless it starts
 * or ends there), and a diagonal step never cuts past one (both cells it passes between must be open). Returns the
 * points in metres, from `from` to `to` exactly; throws when `to` cannot be reached.
 */
export function route(grid: RouteGrid, from: Pt, to: Pt, slopeAtDouble: number): Pt[] {
  const { gx, gz, size, x0, z0, h, closed } = grid
  const cellOf = ([x, z]: Pt) => {
    const i = Math.min(gx - 1, Math.max(0, Math.round((x - x0) / size)))
    const j = Math.min(gz - 1, Math.max(0, Math.round((z - z0) / size)))
    return j * gx + i
  }
  const start = cellOf(from)
  const goal = cellOf(to)
  const gi = goal % gx
  const gj = Math.floor(goal / gx)
  const cost = new Float64Array(gx * gz).fill(Infinity)
  const prev = new Int32Array(gx * gz).fill(-1)
  // a node is final once popped: later, staler entries for it in the heap are skipped
  const done = new Uint8Array(gx * gz)
  const heap = new Heap()
  cost[start] = 0
  heap.push(start, 0)
  while (heap.size) {
    const k = heap.pop()
    if (done[k]) continue
    done[k] = 1
    if (k === goal) break
    const i = k % gx
    const j = Math.floor(k / gx)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ni = i + di
        const nj = j + dj
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= gx || nj >= gz) continue
        const n = nj * gx + ni
        if (closed[n] && n !== goal) continue
        if (di && dj && (closed[j * gx + ni] || closed[nj * gx + i])) continue
        const len = Math.hypot(di, dj) * size
        const slope = (h[n] - h[k]) / len
        const c = cost[k] + len * (1 + (slope / slopeAtDouble) ** 2)
        if (c < cost[n]) {
          cost[n] = c
          prev[n] = k
          heap.push(n, c + Math.hypot(ni - gi, nj - gj) * size)
        }
      }
    }
  }
  if (goal !== start && prev[goal] < 0) throw new Error('no route')
  const points: Pt[] = []
  for (let k = goal; k >= 0; k = prev[k]) points.push([x0 + (k % gx) * size, z0 + Math.floor(k / gx) * size])
  points.reverse()
  points[0] = from
  if (points.length === 1) points.push(to)
  else points[points.length - 1] = to
  return points
}

/** A routed road, simplified within `tol` metres and smoothed, the way it is drawn. */
export function shapeRoad(points: Pt[], tol: number): Pt[] {
  return smooth(simplify(points, tol), 2)
}

export { inRing, lineLength, simplify }
