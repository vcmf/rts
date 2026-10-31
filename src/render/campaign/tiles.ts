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
import type { Grid } from './bake.ts'

export const TILE_MAGIC = 'CMPT'
export const TILE_VERSION = 1
// the manifest's own format, apart from the tiles' (a field added to one need not refuse the other)
export const MANIFEST_FORMAT = 2
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
  for (let j = 0; j < tile.size; j++) {
    for (let i = 0; i < tile.size; i++) {
      const k = j * tile.size + i
      const before = i > 0 ? tile.shape[k - 1] : 0
      view.setUint16(HEADER + k * 2, (tile.shape[k] - before) & 0xffff, true)
    }
  }
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
  const shape = new Uint16Array(n)
  for (let j = 0; j < size; j++) {
    let value = 0
    for (let i = 0; i < size; i++) {
      const k = j * size + i
      value = (value + view.getUint16(HEADER + k * 2, true)) & 0xffff
      shape[k] = value
    }
  }
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
}

/** How a level's grid is cut: `size` nodes a tile, tilesX × tilesZ tiles (the last ones padded with the edge). */
export function levelLayout(nx: number, nz: number, size: number) {
  return { size, tilesX: Math.ceil(nx / size), tilesZ: Math.ceil(nz / size) }
}

/**
 * The tile at (column, row) of a level, `size` nodes a side, cut from its bake: the shape in `scale` metres above
 * `base` (below it held at it; above the Uint16 range, or not a number, refused), nodes past the grid repeating
 * its edge.
 */
export function cutTile(bake: LevelBake, place: TilePlace, size: number, scale: number, base: number): Tile {
  const { level, column, row } = place
  const { nx, nz } = bake.grid
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
    const gj = Math.min(nz - 1, row * size + j)
    for (let i = 0; i < size; i++) {
      const g = gj * nx + Math.min(nx - 1, column * size + i)
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
