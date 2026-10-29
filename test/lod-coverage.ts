// The share of a figure's nearest LOD a lighter LOD fails to cover, seen as the page draws it (back faces culled),
// from the RTS camera's views at the figure's baked steps: what catches a torn LOD (holes, shredded parts, flipped
// faces), the cuirassier's near LOD found by the owner (2026-10-29, docs/plans/active/cavalry-artillery-demo.md).
// A test helper: orthographic rasters of the posed vertices, no renderer.
import { posedVertices, type UnitData } from '../src/look/units-data.ts'

/** a view's direction toward the camera: elevation e above the horizon and yaw a round the figure (rad) */
function viewDir(e: number, a: number): [number, number, number] {
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]
}

/** the cells of a size × size raster (cell m a side, centred on the origin) covered by the LOD's front faces at one
 *  step, seen from d: a front, Babylon's clockwise from outside, has its right-hand normal pointing in, away from
 *  the viewer (tools/bake-figure.py's winding check) */
function raster(
  d: UnitData,
  lod: string,
  pv: { data: Float32Array },
  step: number,
  dir: number[],
  cell: number,
  size: number,
): Uint8Array {
  const m = d.mesh[lod]
  const nv = m.positions.length / 3
  // the view's frame: u across, w up the screen, dir toward the viewer
  const up = Math.abs(dir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]
  const u = norm(cross(up, dir))
  const w = cross(dir, u)
  const at = (v: number) => {
    const o = (step * nv * 2 + v * 2) * 4
    return [pv.data[o], pv.data[o + 1], pv.data[o + 2]]
  }
  const out = new Uint8Array(size * size)
  for (let t = 0; t < m.indices.length; t += 3) {
    const p = [at(m.indices[t]), at(m.indices[t + 1]), at(m.indices[t + 2])]
    const rh = cross(sub(p[1], p[0]), sub(p[2], p[0]))
    if (dot(rh, dir) >= 0) continue
    const q = p.map(x => [dot(x, u) / cell + size / 2, dot(x, w) / cell + size / 2])
    fillTriangle(out, size, q)
  }
  return out
}

/** the cells whose centres fall inside the triangle q (raster coordinates) */
function fillTriangle(out: Uint8Array, size: number, q: number[][]): void {
  const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0])))
  const x1 = Math.min(size - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])))
  const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1])))
  const y1 = Math.min(size - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])))
  const edge = (a: number[], b: number[], x: number, y: number) =>
    (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
  const area = edge(q[0], q[1], q[2][0], q[2][1])
  if (area === 0) return
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      const e0 = edge(q[1], q[2], cx, cy) * area
      const e1 = edge(q[2], q[0], cx, cy) * area
      const e2 = edge(q[0], q[1], cx, cy) * area
      if (e0 >= 0 && e1 >= 0 && e2 >= 0) out[y * size + x] = 1
    }
  }
}

/** the raster grown by one cell (a lighter LOD's silhouette a little inside the nearest's is not a hole) */
function grown(a: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(a)
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (a[y * size + x]) continue
      if (a[y * size + x - 1] || a[y * size + x + 1] || a[(y - 1) * size + x] || a[(y + 1) * size + x]) {
        out[y * size + x] = 1
      }
    }
  }
  return out
}

/** For each view and sampled step, the share of the nearest LOD's covered cells the lighter LOD leaves uncovered
 *  (grown a cell): its worst and its mean. elevations (degrees) and yaws: the views; steps: evenly over the baked
 *  steps; cell: m */
export function lodGaps(
  d: UnitData,
  lod: string,
  opts: { elevations?: number[]; yaws?: number; steps?: number; cell?: number } = {},
): { worst: number; mean: number } {
  const { elevations = [16, 30, 50, 70, 90], yaws = 8, steps = 6, cell = 0.02 } = opts
  const size = Math.ceil(4 / cell)
  const ref = d.lods[0].name
  const pvRef = posedVertices(d, ref)
  const pvLod = posedVertices(d, lod)
  let worst = 0
  let sum = 0
  let n = 0
  for (let s = 0; s < steps; s++) {
    const step = Math.floor((s * d.vat.height) / steps)
    for (const e of elevations) {
      for (let k = 0; k < (e === 90 ? 1 : yaws); k++) {
        const dir = viewDir((e * Math.PI) / 180, (2 * Math.PI * k) / yaws)
        const a = raster(d, ref, pvRef, step, dir, cell, size)
        const b = grown(raster(d, lod, pvLod, step, dir, cell, size), size)
        let cov = 0
        let miss = 0
        for (let i = 0; i < a.length; i++) {
          if (!a[i]) continue
          cov++
          if (!b[i]) miss++
        }
        const g = cov ? miss / cov : 0
        worst = Math.max(worst, g)
        sum += g
        n++
      }
    }
  }
  return { worst, mean: sum / n }
}

function sub(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: number[]): number[] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** A LOD's open edges (used by one triangle only) a triangle, its vertices welded by place (a figure's are split
 *  where its colour roles meet): about 0.1 for a whole mesh, near 2 for one torn into scraps (the cuirassier's near LOD
 *  decimated from the GLB's split mesh: 1.9) */
export function openEdgeShare(d: UnitData, lod: string): number {
  const m = d.mesh[lod]
  const ids = new Map<string, number>()
  const id = (v: number) => {
    const k = [0, 1, 2].map(j => Math.round(m.positions[v * 3 + j] * 1e4)).join(',')
    if (!ids.has(k)) ids.set(k, ids.size)
    return ids.get(k)!
  }
  const edges = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [id(m.indices[t]), id(m.indices[t + 1]), id(m.indices[t + 2])]
    for (let e = 0; e < 3; e++) {
      const [a, b] = [v[e], v[(e + 1) % 3]]
      const k = a < b ? `${a},${b}` : `${b},${a}`
      edges.set(k, (edges.get(k) ?? 0) + 1)
    }
  }
  let open = 0
  for (const c of edges.values()) if (c === 1) open++
  return open / (m.indices.length / 3)
}
