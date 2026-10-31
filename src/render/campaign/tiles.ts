// The campaign map's tiles (docs/systems/campaign-map.md, decision 0094): the bake (src/render/campaign/bake.ts) of
// one level of the map cut into square tiles, each a small binary file, deflated. tools/campaign-tiles.ts writes them
// with a manifest; the campaign page reads them. Packing and unpacking work on the raw bytes, the compression is the
// caller's (Node's zlib in the tool, inflate() below in a browser), so this module stays pure.
//
// A tile, little-endian:
//   0  'CMPT'                     4  version (1)        5  level        6  column (u16)   8  row (u16)
//   10 size, nodes a side (u16)   12 byte planes (3)    13 three bytes, 0
//   16 the shape: size × size Uint16, in the level's `scale` metres above its `base` (the manifest's), each row as
//      differences from the node before it (modulo 2^16; the row's first node as is): relief is smooth, so the
//      numbers are small and deflate well
//   then the planes, size × size bytes each: the sun (0 shadow to 255 lit), the sky (its open share), the forest
// Rows run south to north, nodes west to east; nodes past the level's grid repeat its edge.
import { wholeOf, type Grid, type Place } from './bake.ts'
import { rowDeltas, rowSums } from './rows.ts'

export const TILE_MAGIC = 'CMPT'
export const TILE_VERSION = 1
// the manifest's own format, apart from the tiles' (a field added to one need not refuse the other)
export const MANIFEST_FORMAT = 5
const HEADER = 16
const PLANES = 3

/** One tile, unpacked: where it lies in its level, its shape (in the level's scale) and its light and forest. */
export interface Tile {
  level: number
  column: number
  row: number
  size: number
  shape: Uint16Array
  sun: Uint8Array
  sky: Uint8Array
  forest: Uint8Array
}

/** One level of tiles, as the manifest lists it. */
export interface Level {
  cell: number
  nx: number
  nz: number
  size: number
  tilesX: number
  tilesZ: number
  // the shape's step and the height its zero stands for, in metres (lakes sink below the lowest ground)
  scale: number
  base: number
  // the terrain tiles' zoom the level's heights were sampled at
  zoom: number
  // a tile's path relative to the manifest (in its build's directory), its column and row as {i} and {j}
  path: string
}

/** The tiles' manifest: what the page checks before it uses them. */
export interface Manifest {
  format: number
  // the build directory the levels' paths lie in (tools/campaign-builds.ts): a new one each build
  build: string
  frame: { lat0: number; lon0: number; halfX: number; halfZ: number }
  // the bake's parameters (the shape's, the sun's, the forests'): tiles of other parameters are not used
  params: Record<string, number>
  levels: Level[]
  // the far level's fields (src/render/campaign/fields.ts): the level they lie on, their file relative to the manifest
  fields: { level: number; path: string }
  // the labels (src/render/campaign/labels.ts), their file relative to the manifest
  labels: string
  credit: string
}

/** A tile's bytes, before compression. Throws on a plane of the wrong length or a place past the header's range. */
export function packTile(tile: Tile): Uint8Array {
  const n = tile.size * tile.size
  for (const [name, value, max] of [
    ['level', tile.level, 0xff],
    ['column', tile.column, 0xffff],
    ['row', tile.row, 0xffff],
    ['size', tile.size, 0xffff],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new RangeError(`packTile: a ${name} of ${value}, past 0 to ${max}`)
    }
  }
  for (const [name, plane] of [
    ['shape', tile.shape],
    ['sun', tile.sun],
    ['sky', tile.sky],
    ['forest', tile.forest],
  ] as const) {
    if (plane.length !== n) throw new RangeError(`packTile: ${plane.length} ${name} values for ${n} nodes`)
  }
  const bytes = new Uint8Array(HEADER + n * 2 + n * PLANES)
  const view = new DataView(bytes.buffer)
  for (let k = 0; k < 4; k++) bytes[k] = TILE_MAGIC.charCodeAt(k)
  bytes[4] = TILE_VERSION
  bytes[5] = tile.level
  view.setUint16(6, tile.column, true)
  view.setUint16(8, tile.row, true)
  view.setUint16(10, tile.size, true)
  bytes[12] = PLANES
  const deltas = rowDeltas(tile.shape, tile.size, 1)
  for (let k = 0; k < n; k++) view.setUint16(HEADER + k * 2, deltas[k], true)
  const planes = HEADER + n * 2
  bytes.set(tile.sun, planes)
  bytes.set(tile.sky, planes + n)
  bytes.set(tile.forest, planes + 2 * n)
  return bytes
}

/** Where a tile was asked for: its level, column and row. */
export interface TilePlace {
  level: number
  column: number
  row: number
}

/**
 * A tile from its bytes (inflated), fetched for `place`. Throws on another format, version or length, and on a tile
 * of another place (a misnamed file would otherwise be drawn where it does not belong).
 */
export function unpackTile(bytes: Uint8Array, place: TilePlace): Tile {
  if (bytes.length < HEADER) throw new RangeError(`unpackTile: ${bytes.length} bytes, shorter than the header`)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== TILE_MAGIC) throw new Error(`unpackTile: not a campaign tile (${JSON.stringify(magic)})`)
  if (bytes[4] !== TILE_VERSION) throw new Error(`unpackTile: version ${bytes[4]}, this reads ${TILE_VERSION}`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const size = view.getUint16(10, true)
  const n = size * size
  if (bytes[12] !== PLANES || bytes.length !== HEADER + n * 2 + n * PLANES) {
    throw new RangeError(`unpackTile: ${bytes.length} bytes for a tile of ${size} nodes and ${bytes[12]} planes`)
  }
  const deltas = new Uint16Array(n)
  for (let k = 0; k < n; k++) deltas[k] = view.getUint16(HEADER + k * 2, true)
  const shape = rowSums(deltas, size, 1)
  const level = bytes[5]
  const column = view.getUint16(6, true)
  const row = view.getUint16(8, true)
  if (level !== place.level || column !== place.column || row !== place.row) {
    throw new Error(
      `unpackTile: the tile of level ${level}, column ${column}, row ${row} where ` +
        `level ${place.level}, column ${place.column}, row ${place.row} was asked for`,
    )
  }
  const planes = HEADER + n * 2
  return {
    level,
    column,
    row,
    size,
    shape,
    sun: bytes.slice(planes, planes + n),
    sky: bytes.slice(planes + n, planes + 2 * n),
    forest: bytes.slice(planes + 2 * n, planes + 3 * n),
  }
}

/** A level's bake on its whole grid: the shape in metres, the light as sun and sky bytes a node, the forest. */
export interface LevelBake {
  grid: Grid
  shape: Float32Array
  light: Uint8Array
  forest: Uint8Array
  // a block of the level (baked by blocks): where its node (0, 0) lies in the level, and the level's size in nodes;
  // without it, the grid is the whole level
  place?: Place
}

/** How a level's grid is cut: `size` nodes a tile, tilesX × tilesZ tiles (the last ones padded with the edge). */
export function levelLayout(nx: number, nz: number, size: number) {
  return { size, tilesX: Math.ceil(nx / size), tilesZ: Math.ceil(nz / size) }
}

/** A block of a level, baked as one (tools/campaign-tiles.ts): its tiles, its own nodes, and those it is baked on. */
export interface Block {
  // its tiles' columns [c0, c1) and rows [r0, r1)
  tiles: { c0: number; c1: number; r0: number; r1: number }
  // its own nodes [i0, i1) × [j0, j1) (its tiles', up to the level's edge), and those of its margin round them
  own: { i0: number; i1: number; j0: number; j1: number }
  baked: { i0: number; i1: number; j0: number; j1: number }
}

/**
 * The blocks a level of nx × nz nodes is baked in: `blockTiles` × `blockTiles` tiles of `size` nodes each (the last
 * ones fewer), their own nodes (the last ones up to the level's edge) and those within `margin` nodes of them, clipped
 * to the level. Every tile is in exactly one block.
 */
export function levelBlocks(nx: number, nz: number, size: number, blockTiles: number, margin: number): Block[] {
  const { tilesX, tilesZ } = levelLayout(nx, nz, size)
  const out: Block[] = []
  for (let r0 = 0; r0 < tilesZ; r0 += blockTiles) {
    for (let c0 = 0; c0 < tilesX; c0 += blockTiles) {
      const c1 = Math.min(tilesX, c0 + blockTiles)
      const r1 = Math.min(tilesZ, r0 + blockTiles)
      const own = { i0: c0 * size, i1: Math.min(nx, c1 * size), j0: r0 * size, j1: Math.min(nz, r1 * size) }
      const baked = {
        i0: Math.max(0, own.i0 - margin),
        i1: Math.min(nx, own.i1 + margin),
        j0: Math.max(0, own.j0 - margin),
        j1: Math.min(nz, own.j1 + margin),
      }
      out.push({ tiles: { c0, c1, r0, r1 }, own, baked })
    }
  }
  return out
}

/**
 * The tile at (column, row) of a level, `size` nodes a side, cut from its bake: the shape in `scale` metres above
 * `base` (below it held at it; above the Uint16 range, or not a number, refused), nodes past the grid repeating
 * its edge.
 */
export function cutTile(bake: LevelBake, place: TilePlace, size: number, scale: number, base: number): Tile {
  const { level, column, row } = place
  // the level's size, and where the bake's arrays start in it
  const at = bake.place ?? wholeOf(bake.grid)
  const { nx, nz } = at
  const gx = bake.grid.nx
  const n = size * size
  const tile: Tile = {
    level,
    column,
    row,
    size,
    shape: new Uint16Array(n),
    sun: new Uint8Array(n),
    sky: new Uint8Array(n),
    forest: new Uint8Array(n),
  }
  for (let j = 0; j < size; j++) {
    const gj = Math.min(nz - 1, row * size + j) - at.j0
    for (let i = 0; i < size; i++) {
      const g = gj * gx + Math.min(nx - 1, column * size + i) - at.i0
      const k = j * size + i
      const height = bake.shape[g]
      if (!Number.isFinite(height)) throw new RangeError(`cutTile: a shape of ${height} m at node ${g}`)
      const steps = Math.round(Math.max(0, height - base) / scale)
      if (steps > 0xffff) {
        throw new RangeError(`cutTile: a shape of ${height} m past ${base + 0xffff * scale} m`)
      }
      tile.shape[k] = steps
      tile.sun[k] = bake.light[g * 2]
      tile.sky[k] = bake.light[g * 2 + 1]
      tile.forest[k] = bake.forest[g]
    }
  }
  return tile
}

/** Inflates deflated bytes (zlib's format, as Node's deflateSync writes them) with the platform's own stream. */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
