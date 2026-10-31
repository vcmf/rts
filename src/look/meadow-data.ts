// The meadow map's arithmetic (src/look/meadow.ts, buildMeadowMap): the growth and the crops on the tile's 2 m cells,
// blended to 1 m texels, kept off their rules and shrunk by a texel, the ground's heights, as half floats. Pure: the
// page runs it, and the tile worker for a moved tile on a map world (G3c: src/look/tile-worker.ts). No Babylon but its
// half floats.
import { ToHalfFloat } from '@babylonjs/core/Misc/halfFloat.js'

/** The map's texels a side over a tile of side `tile` m: 1 m texels (the page's texture and the worker's data) */
export const meadowN = (tile: number): number => Math.round(tile)

/** A bilinear blend of at(i, j) at the grid point (u, v) */
export const bilerp = (at: (i: number, j: number) => number, u: number, v: number) => {
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fu = u - i
  const fv = v - j
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv
}

/** The meadow map's data and what the checks read of it */
export interface MeadowData {
  data: Uint16Array // RGBA half floats: the ground's height, the grass's growth, its height factor, the crops'
  g: Float32Array // the grass's growth, a texel
  cropG: Float32Array // the crops', a texel
  growingCells: number
  croppingCells: number
}

/**
 * The meadow map's data over a tile of side `tile` m from (X0, Z0): the cover's growth on its 2 m grid, each texel
 * interpolating the cells round it (the edge follows no grid); then the rules at the texel itself (the cover's edge,
 * the formation zones, the banks) zero it; then the growing area shrinks by a texel, so the GPU's bilinear read never
 * carries grass across a rule. growth(x, z): how much grass grows (0..1) and its height factor; allowed(x, z): the
 * placement rule's hard edges; crop(x, z): a sown field, 0 or 1; allowedCrop: the crops' rule; heightAt: the ground, m
 */
export function meadowMapData(
  X0: number,
  Z0: number,
  tile: number,
  growth: (x: number, z: number) => [number, number],
  allowed: (x: number, z: number) => boolean,
  crop: (x: number, z: number) => number,
  allowedCrop: (x: number, z: number) => boolean,
  heightAt: (x: number, z: number) => number,
): MeadowData {
  const MAP_N = meadowN(tile)
  const G = MAP_N / 2
  // the 2 m cells: f at each cell's centre
  const cellGrid = (f: (x: number, z: number) => number) => {
    const a = new Float32Array(G * G)
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) a[j * G + i] = f(X0 + (i + 0.5) * 2, Z0 + (j + 0.5) * 2)
    }
    return a
  }
  const atCell = (a: Float32Array, i: number, j: number) =>
    a[Math.min(G - 1, Math.max(0, j)) * G + Math.min(G - 1, Math.max(0, i))]
  const sampler = (a: Float32Array) => (i: number, j: number) => atCell(a, i, j)
  // the hard rules at the 2 m cells' centres too: a texel whose four cells agree takes their answer, and only a texel
  // near a rule's edge (its cells disagree) is tested itself (a few in a hundred: the bake's time)
  const okGrass = cellGrid((x, z) => (allowed(x, z) ? 1 : 0))
  const okCrop = allowedCrop === allowed ? okGrass : cellGrid((x, z) => (allowedCrop(x, z) ? 1 : 0))
  // the grass's growth and height factor from one growth() call a cell
  const gCell = new Float32Array(G * G)
  const hCell = new Float32Array(G * G)
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      ;[gCell[j * G + i], hCell[j * G + i]] = growth(X0 + (i + 0.5) * 2, Z0 + (j + 0.5) * 2)
    }
  }
  const cCell = cellGrid((x, z) => crop(x, z))
  // one growth channel (the grass's by growth(), the crops' by crop()), each texel interpolating its cells, zeroed by
  // the cover's edge and the rules at the texel, then shrunk a texel against the GPU's blend
  const channel = (
    cell: Float32Array,
    cover: (x: number, z: number) => number,
    okCell: Float32Array,
    ruleAt: (x: number, z: number) => boolean,
  ): { g: Float32Array; count: number } => {
    const raw = new Float32Array(MAP_N * MAP_N)
    const at = sampler(cell)
    for (let j = 0; j < MAP_N; j++) {
      for (let i = 0; i < MAP_N; i++) {
        const x = X0 + i + 0.5
        const z = Z0 + j + 0.5
        const k = j * MAP_N + i
        const gu = (i + 0.5) / 2 - 0.5
        const gv = (j + 0.5) / 2 - 0.5
        const i0 = Math.floor(gu)
        const j0 = Math.floor(gv)
        const d = bilerp(at, gu, gv)
        if (d <= 0) continue
        const c00 = atCell(cell, i0, j0)
        const c10 = atCell(cell, i0 + 1, j0)
        const c01 = atCell(cell, i0, j0 + 1)
        const c11 = atCell(cell, i0 + 1, j0 + 1)
        const ok =
          atCell(okCell, i0, j0) +
          atCell(okCell, i0 + 1, j0) +
          atCell(okCell, i0, j0 + 1) +
          atCell(okCell, i0 + 1, j0 + 1)
        const coverOk = (c00 > 0 && c10 > 0 && c01 > 0 && c11 > 0) || cover(x, z) > 0
        const ruleOk = ok === 4 ? true : ok === 0 ? false : ruleAt(x, z)
        raw[k] = coverOk && ruleOk ? d : 0
      }
    }
    const g = new Float32Array(MAP_N * MAP_N)
    let count = 0
    for (let j = 0; j < MAP_N; j++) {
      for (let i = 0; i < MAP_N; i++) {
        const k = j * MAP_N + i
        let d = raw[k]
        for (let dj = -1; dj <= 1 && d > 0; dj++) {
          for (let di = -1; di <= 1; di++) {
            const a = i + di
            const b = j + dj
            if (a >= 0 && b >= 0 && a < MAP_N && b < MAP_N && raw[b * MAP_N + a] <= 0) {
              d = 0
              break
            }
          }
        }
        g[k] = d
        if (d > 0) count++
      }
    }
    return { g, count }
  }
  const grass = channel(gCell, (x, z) => growth(x, z)[0], okGrass, allowed)
  const crops = channel(cCell, crop, okCrop, allowedCrop)
  const g = grass.g
  const growingCells = grass.count
  // the meadow map: R the ground's height, G the grass's growth, B the grass's height factor, A the crops' growth
  // (half floats, filtered by the GPU)
  const data = new Uint16Array(MAP_N * MAP_N * 4)
  const hAtCell = sampler(hCell)
  for (let j = 0; j < MAP_N; j++) {
    for (let i = 0; i < MAP_N; i++) {
      const k = j * MAP_N + i
      const hf = bilerp(hAtCell, (i + 0.5) / 2 - 0.5, (j + 0.5) / 2 - 0.5)
      data[k * 4] = ToHalfFloat(heightAt(X0 + i + 0.5, Z0 + j + 0.5))
      data[k * 4 + 1] = ToHalfFloat(g[k])
      data[k * 4 + 2] = ToHalfFloat(hf)
      data[k * 4 + 3] = ToHalfFloat(crops.g[k])
    }
  }
  return { data, g, cropG: crops.g, growingCells, croppingCells: crops.count }
}
