// Terrain as the formation layer reads it: the build-time 1 m class and water-depth grids and the 1.79 m
// heightfield (decision 0012), joined with the ruleset's terrain table (decision 0015). Built once per
// world: the slope on the 1 m grid (level where the ruleset says so, e.g. a bridge deck), and per
// formation kind the impassable cells and each cell's distance to the nearest one (the gate's quick reject).
import type { SimData } from './data.ts'
import type { Compiled } from './ruleset.ts'

export interface Terrain {
  n: number
  cell: number
  x0: number
  z0: number
  cls: Uint8Array
  depth: Float64Array // class index (into the ruleset's table), metres
  gx: Float64Array
  gz: Float64Array // slope, rise over run
  classG: Float64Array // [class·K + kind]
  classQ: Float64Array // [class·P + pace]
  road: Uint8Array
  imp: Uint8Array[]
  impd: Float64Array[] // per kind
  waterCurve: [number, number][]
  waterLimit: Float64Array // per kind: deeper is impassable
  slope: Float64Array
  K: number
  P: number
}

// the heightfield, bilinear (exact operations)
export function heightAt(d: SimData, x: number, z: number): number {
  const h = d.height
  const u = Math.min(h.nx - 1.001, Math.max(0, (x - h.x0) / h.cell))
  const v = Math.min(h.nz - 1.001, Math.max(0, (z - h.z0) / h.cell))
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fu = u - i
  const fv = v - j
  const k = j * h.nx + i
  return (h.h[k] * (1 - fu) + h.h[k + 1] * fu) * (1 - fv) + (h.h[k + h.nx] * (1 - fu) + h.h[k + h.nx + 1] * fu) * fv
}

export function buildTerrain(d: SimData, cr: Compiled): Terrain {
  const rs = cr.rs
  const f = d.fine
  const n = f.nx
  const cell = f.cell
  const names = Object.keys(rs.terrain)
  const C = names.length
  const K = cr.kinds.length
  const P = cr.paces.length
  const remap = d.classes.map(c => {
    const k = names.indexOf(c)
    if (k < 0) throw new Error(`terrain class ${c} not in ruleset ${rs.name}`)
    return k
  })
  const cls = new Uint8Array(n * n)
  const depth = new Float64Array(n * n)
  const gx = new Float64Array(n * n)
  const gz = new Float64Array(n * n)
  for (let k = 0; k < n * n; k++) {
    cls[k] = remap[f.cls[k]]
    depth[k] = f.depth[k] / 1000
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const x = f.x0 + i * cell
      const z = f.z0 + j * cell
      if (rs.terrain[names[cls[k]]].level) continue
      gx[k] = (heightAt(d, x + cell, z) - heightAt(d, x - cell, z)) / (2 * cell)
      gz[k] = (heightAt(d, x, z + cell) - heightAt(d, x, z - cell)) / (2 * cell)
    }
  }
  const classG = new Float64Array(C * K)
  const classQ = new Float64Array(C * P)
  const road = new Uint8Array(C)
  names.forEach((name, c) => {
    const t = rs.terrain[name]
    cr.kinds.forEach((kind, q) => {
      classG[c * K + q] = t.g[kind]
    })
    cr.paces.forEach((pace, p) => {
      classQ[c * P + p] = rs.q[pace]?.[t.q] ?? 1
    })
    road[c] = t.road ? 1 : 0
  })
  const t: Terrain = {
    n,
    cell,
    x0: f.x0,
    z0: f.z0,
    cls,
    depth,
    gx,
    gz,
    classG,
    classQ,
    road,
    imp: [],
    impd: [],
    waterCurve: rs.water.curve,
    waterLimit: new Float64Array(cr.kinds.map(k => rs.water.limitByKind?.[k] ?? rs.water.limit)),
    slope: cr.slope,
    K,
    P,
  }
  rebuildImpassable(t)
  return t
}
// the per-kind impassable grids from the classes and depths (again after a test repaints the terrain)
export function rebuildImpassable(t: Terrain): void {
  t.imp = []
  t.impd = []
  for (let q = 0; q < t.K; q++) {
    const [imp, impd] = impassable(t, q)
    t.imp.push(imp)
    t.impd.push(impd)
  }
}

// impassable cells for a kind (too deep to wade, or a class with g = 0) and the distance in metres to the
// nearest one or to the map's edge, whichever is nearer (two-pass chamfer; ground beyond the edge is impassable)
function impassable(t: Terrain, kind: number): [Uint8Array, Float64Array] {
  const n = t.n
  const h = t.cell
  const D2 = Math.SQRT2 * h
  const imp = new Uint8Array(n * n)
  const d = new Float64Array(n * n)
  for (let k = 0; k < n * n; k++) {
    imp[k] = t.depth[k] > t.waterLimit[kind] || t.classG[t.cls[k] * t.K + kind] <= 0 ? 1 : 0
    const i = k % n
    const j = (k - i) / n
    d[k] = imp[k] ? 0 : Math.min(i, n - 1 - i, j, n - 1 - j) * h
  }
  const rel = (k: number, j: number, s: number) => {
    if (d[j] + s < d[k]) d[k] = d[j] + s
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      if (i > 0) rel(k, k - 1, h)
      if (j > 0) {
        rel(k, k - n, h)
        if (i > 0) rel(k, k - n - 1, D2)
        if (i < n - 1) rel(k, k - n + 1, D2)
      }
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i
      if (i < n - 1) rel(k, k + 1, h)
      if (j < n - 1) {
        rel(k, k + n, h)
        if (i < n - 1) rel(k, k + n + 1, D2)
        if (i > 0) rel(k, k + n - 1, D2)
      }
    }
  }
  return [imp, d]
}

// a point off the map reads the edge cell: ground there is asked through impAt, which counts it impassable
export const cellK = (t: Terrain, x: number, z: number): number =>
  Math.min(t.n - 1, Math.max(0, Math.round((z - t.z0) / t.cell))) * t.n +
  Math.min(t.n - 1, Math.max(0, Math.round((x - t.x0) / t.cell)))

// ground at (x, z) is impassable for a kind (its `imp`): ground beyond the map's edge is (issue #37)
export const impAt = (t: Terrain, imp: Uint8Array, x: number, z: number): number =>
  x < t.x0 || z < t.z0 || x > t.x0 + (t.n - 1) * t.cell || z > t.z0 + (t.n - 1) * t.cell ? 1 : imp[cellK(t, x, z)]
export function waterG(t: Terrain, d: number, kind: number): number {
  const c = t.waterCurve
  if (d <= 0) return 1
  if (d > t.waterLimit[kind]) return 0
  for (let k = 1; k < c.length; k++) {
    if (d <= c[k][0]) return c[k - 1][1] + ((c[k][1] - c[k - 1][1]) * (d - c[k - 1][0])) / (c[k][0] - c[k - 1][0])
  }
  return c[c.length - 1][1]
}
export function slopeG(t: Terrain, sl: number): number {
  const u = Math.min(400, Math.max(0, (sl + 1) * 200))
  const i = Math.min(399, Math.floor(u))
  const f = u - i
  return t.slope[i] + (t.slope[i + 1] - t.slope[i]) * f
}
// speed factor of the ground at (x, z) for a formation kind, moving along (dx, dz)
export const groundG = (t: Terrain, x: number, z: number, kind: number, dx: number, dz: number): number =>
  groundGAt(t, cellK(t, x, z), kind, dx, dz)
// the same, for cell k
export function groundGAt(t: Terrain, k: number, kind: number, dx: number, dz: number): number {
  return t.classG[t.cls[k] * t.K + kind] * waterG(t, t.depth[k], kind) * slopeG(t, t.gx[k] * dx + t.gz[k] * dz)
}
export const groundQ = (t: Terrain, x: number, z: number, pace: number): number => groundQAt(t, cellK(t, x, z), pace)
export const groundQAt = (t: Terrain, k: number, pace: number): number => t.classQ[t.cls[k] * t.P + pace]
export const onRoad = (t: Terrain, x: number, z: number): boolean => onRoadAt(t, cellK(t, x, z))
export const onRoadAt = (t: Terrain, k: number): boolean => t.road[t.cls[k]] === 1
