// What the campaign page makes of the tool's output (docs/systems/campaign-map.md): the manifest checked, a level's
// tiles put together into the arrays its textures take (the detail area's ring of tiles: ./ring.ts). Pure: the page
// fetches and inflates (src/app/campaign/main.ts), the view uploads (src/render/campaign/view.ts).
import type { Plane } from './fields.ts'
import { MANIFEST_FORMAT, type Level, type Manifest, type Tile } from './tiles.ts'

/** The planes the page reads from the fields' file (src/render/campaign/fields.ts). */
export const FIELD_PLANES = ['lakes', 'lakeD', 'high', 'country', 'rivers', 'contour'] as const

/** A level's bake on its whole grid, as the view uploads it. */
export interface LevelData {
  nx: number
  nz: number
  // the shape in metres (above the theatre's lowest ground; lakes below it), a node, the south row first
  shape: Float32Array
  // R the sun, G the sky, B the tree cover, A 255, a node
  light: Uint8Array
}

/** The manifest from its JSON, checked: its format, its levels and its fields. Throws with what is wrong. */
export function readManifest(json: unknown): Manifest {
  const m = json as Partial<Manifest> | null
  if (!m || typeof m !== 'object') throw new Error('the manifest is not an object')
  if (m.format !== MANIFEST_FORMAT) {
    throw new Error(
      `the manifest's format is ${m.format}, this page reads ${MANIFEST_FORMAT}: run tools/campaign-tiles.ts`,
    )
  }
  if (!m.frame || !Array.isArray(m.levels) || !m.levels.length || !m.fields || !m.params || !m.labels) {
    throw new Error('the manifest has no frame, levels, fields, labels or parameters')
  }
  for (const [k, level] of m.levels.entries()) {
    const spans = (level.nx - 1) * level.cell === 2 * m.frame.halfX && (level.nz - 1) * level.cell === 2 * m.frame.halfZ
    if (!spans) throw new Error(`the manifest's level ${k} does not span the frame`)
  }
  if (!m.levels[m.fields.level]) throw new Error(`the manifest's fields lie on level ${m.fields.level}, not one of its`)
  return m as Manifest
}

/** A tile's URL relative to the manifest. */
export function tilePath(level: Level, column: number, row: number): string {
  return level.path.replace('{i}', String(column)).replace('{j}', String(row))
}

/** The tiles a level is cut into, as [column, row], row by row from the south-west. */
export function tilesOf(level: Level): [number, number][] {
  const out: [number, number][] = []
  for (let row = 0; row < level.tilesZ; row++) {
    for (let column = 0; column < level.tilesX; column++) out.push([column, row])
  }
  return out
}

/**
 * Copies a tile into arrays of `n` × `m` nodes whose node (0, 0) is node (ox, oz) of the tile's level: the shape in
 * metres (the level's base plus its steps), the light and forest as RGBA with A 255 (loaded). Nodes of the tile past
 * the arrays (its padding past the level's grid, or past a window) are left out.
 */
export function blitTile(
  tile: Tile,
  level: Level,
  into: { shape: Float32Array; light: Uint8Array; n: number; m: number; ox: number; oz: number },
) {
  const { size } = tile
  const x0 = tile.column * size - into.ox
  const z0 = tile.row * size - into.oz
  for (let r = Math.max(0, -z0); r < size && z0 + r < into.m; r++) {
    for (let c = Math.max(0, -x0); c < size && x0 + c < into.n; c++) {
      const k = r * size + c
      const o = (z0 + r) * into.n + x0 + c
      into.shape[o] = level.base + tile.shape[k] * level.scale
      into.light[o * 4] = tile.sun[k]
      into.light[o * 4 + 1] = tile.sky[k]
      into.light[o * 4 + 2] = tile.forest[k]
      into.light[o * 4 + 3] = 255
    }
  }
}

/** A level's arrays, every tile copied in. */
export function assembleLevel(level: Level, tiles: Tile[]): LevelData {
  const data: LevelData = {
    nx: level.nx,
    nz: level.nz,
    shape: new Float32Array(level.nx * level.nz),
    light: new Uint8Array(level.nx * level.nz * 4),
  }
  if (tiles.length !== level.tilesX * level.tilesZ) {
    throw new Error(`${tiles.length} tiles for a level of ${level.tilesX} × ${level.tilesZ}`)
  }
  const into = { shape: data.shape, light: data.light, n: level.nx, m: level.nz, ox: 0, oz: 0 }
  for (const tile of tiles) blitTile(tile, level, into)
  return data
}

/** A byte plane of one channel halved: each texel the mean of 2 × 2 (the last row or column kept when odd). */
export function halved(p: Plane): Plane {
  const w = Math.ceil(p.w / 2)
  const h = Math.ceil(p.h / 2)
  const values = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let sum = 0
      let n = 0
      for (const [di, dj] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const x = 2 * i + di
        const z = 2 * j + dj
        if (x < p.w && z < p.h) {
          sum += p.values[z * p.w + x]
          n++
        }
      }
      values[j * w + i] = Math.round(sum / n)
    }
  }
  return { name: p.name, kind: 'bytes', w, h, channels: 1, values }
}

/** Two planes of two byte channels as one RGBA array (the second's channels in B and A; without it, 0 and 255). */
export function interleave(a: Plane, b: Plane | null): Uint8Array {
  const n = a.w * a.h
  const out = new Uint8Array(n * 4)
  for (let k = 0; k < n; k++) {
    out[k * 4] = a.values[k * 2]
    out[k * 4 + 1] = a.values[k * 2 + 1]
    out[k * 4 + 2] = b ? b.values[k * 2] : 0
    out[k * 4 + 3] = b ? b.values[k * 2 + 1] : 255
  }
  return out
}

/**
 * A grid's value at a fractional node (fx, fz), bilinear between the four nodes round it, `get(i, j)` reading node
 * (i, j) of a grid of nx × nz nodes; a point past the grid is held at its edge.
 */
export function bilinear(get: (i: number, j: number) => number, fx: number, fz: number, nx: number, nz: number) {
  const x = Math.min(nx - 1.001, Math.max(0, fx))
  const z = Math.min(nz - 1.001, Math.max(0, fz))
  const i = Math.floor(x)
  const j = Math.floor(z)
  const u = x - i
  const v = z - j
  const top = get(i, j) * (1 - u) + get(i + 1, j) * u
  const bottom = get(i, j + 1) * (1 - u) + get(i + 1, j + 1) * u
  return top * (1 - v) + bottom * v
}
