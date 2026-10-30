// ESA WorldCover 2021 (10 m land cover, © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data
// (2021) processed by ESA WorldCover consortium; CC BY 4.0) for the campaign map's forests
// (docs/plans/done/k1b-forests.md). The files are cloud-optimised GeoTIFFs of 3° × 3° on AWS, each holding reduced
// copies of itself; only one reduced level is read, tile by tile, by range requests (the header first), and cached
// under scratch/worldcover/: about 5 MB a file at about 70 m a pixel, where the full file is about 100 MB.
// Its tree-cover class (10) is sampled onto a grid in the theatre's projection as a coverage, 0 to 255.
// forestField: one field for the whole frame, made once: the cover at 100 m, smoothed before it is printed
// (src/render/campaign/bake.ts, smoothCover), cached under scratch/worldcover/. Every grid of the map resamples it
// (resampleField): one source, so the levels agree where they meet.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { FIELD_CELL, smoothCover, WOOD_BOX_M, type ForestField } from '../src/render/campaign/bake.ts'
import { frameGrid, type Frame, type projection } from './campaign-theatre-lib.ts'

const BASE = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map'
const CACHE = 'scratch/worldcover'
// the header holds every level's tile tables within its first bytes
const HEADER_BYTES = 65536
// the class of tree cover
const TREES = 10
// the level read: the one closest to (and not coarser than) this many pixels across a 3° file
export const WORLDCOVER_LEVEL_PX = 4500
// downloads: files read side by side, and each file's tiles
const FILES_AT_ONCE = 2
const TILES_AT_ONCE = 8
export const WORLDCOVER_CREDIT =
  'Forests: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA ' +
  'WorldCover consortium, CC BY 4.0.'

type Projection = ReturnType<typeof projection>

/** One reduced level of a cloud-optimised GeoTIFF: its size, its tiles' size, and each tile's bytes in the file. */
export interface CogLevel {
  width: number
  height: number
  tile: number
  tileLength: number
  offsets: number[]
  counts: number[]
  compression: number
}

/**
 * The levels of a little-endian tiled GeoTIFF (full size first), from its first bytes: each level's size, tile width
 * and length, compression and tile tables (TileOffsets 324, TileByteCounts 325). Throws when a table lies past the
 * bytes given.
 */
export function parseCog(head: Buffer): CogLevel[] {
  if (head.toString('latin1', 0, 2) !== 'II' || head.readUInt16LE(2) !== 42) throw new Error('not a little-endian TIFF')
  const levels: CogLevel[] = []
  const seen = new Set<number>()
  let ifd = head.readUInt32LE(4)
  while (ifd > 0) {
    if (seen.has(ifd)) throw new Error(`a TIFF directory chain that loops back to ${ifd}`)
    seen.add(ifd)
    if (ifd + 2 > head.length) throw new Error(`a TIFF directory at ${ifd} past the ${head.length} bytes read`)
    const entries = head.readUInt16LE(ifd)
    if (ifd + 2 + entries * 12 + 4 > head.length) {
      throw new Error(`a TIFF directory at ${ifd} past the ${head.length} bytes read`)
    }
    const tags = new Map<number, number[]>()
    for (let i = 0; i < entries; i++) {
      const e = ifd + 2 + i * 12
      const tag = head.readUInt16LE(e)
      const type = head.readUInt16LE(e + 2)
      const count = head.readUInt32LE(e + 4)
      const size = type === 3 ? 2 : type === 4 ? 4 : type === 16 ? 8 : 0
      if (!size) continue
      const inline = size * count <= 4
      const at = inline ? e + 8 : head.readUInt32LE(e + 8)
      if (at + size * count > head.length) throw new Error(`TIFF tag ${tag} past the ${head.length} bytes read`)
      const values: number[] = []
      for (let k = 0; k < count; k++) {
        const o = at + k * size
        values.push(
          size === 2 ? head.readUInt16LE(o) : size === 4 ? head.readUInt32LE(o) : Number(head.readBigUInt64LE(o)),
        )
      }
      tags.set(tag, values)
    }
    const need = (tag: number) => {
      const v = tags.get(tag)
      if (!v) throw new Error(`a TIFF directory at ${ifd} without tag ${tag}`)
      return v
    }
    // one band of 8-bit classes, chunky, with no predictor: what the reader decodes (anything else would decode
    // silently wrong)
    const bits = tags.get(258)?.[0] ?? 1
    const bands = tags.get(277)?.[0] ?? 1
    const predictor = tags.get(317)?.[0] ?? 1
    if (bits !== 8 || bands !== 1 || predictor !== 1) {
      throw new Error(`a TIFF directory at ${ifd} of ${bands} band(s) of ${bits} bits, predictor ${predictor}`)
    }
    levels.push({
      width: need(256)[0],
      height: need(257)[0],
      tile: need(322)[0],
      tileLength: need(323)[0],
      offsets: need(324),
      counts: need(325),
      compression: need(259)[0],
    })
    ifd = head.readUInt32LE(ifd + 2 + entries * 12)
  }
  return levels
}

/** An answer a retry cannot change (the server ignored the range, or refused it): not tried again. */
class Refused extends Error {}

/** A fetch, as range() uses it (a test passes its own). */
export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>

/**
 * A byte range of a file, from the cache or fetched and cached: only a partial answer (206) of exactly the length
 * asked (or the rest of a shorter file, as its Content-Range says) is kept: a server that ignored the range would
 * answer the whole file, a cut answer would poison the cache. A cached range of another length is fetched again. A
 * failure that may pass (the network, a server error, a cut answer) is tried three times, `waitMs` and then twice
 * that apart; an answer a retry cannot change (a whole file, another client error) throws at once. Null when the
 * file does not exist (404: open sea has none).
 */
export async function range(
  url: string,
  file: string,
  start: number,
  length: number,
  get: Fetch = fetch,
  waitMs = 500,
): Promise<Buffer | null> {
  if (fs.existsSync(file)) {
    const kept = fs.readFileSync(file)
    if (kept.length === length || fs.existsSync(file + '.short')) return kept
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await get(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } })
      if (res.status === 404) return null
      if (res.status !== 206) {
        const message = `${url}: HTTP ${res.status}, not a partial answer to a range`
        // a server error or a throttle may pass; anything else answers the same again
        throw res.status >= 500 || res.status === 429 ? new Error(message) : new Refused(message)
      }
      const bytes = Buffer.from(await res.arrayBuffer())
      // the file's whole size, from "bytes a-b/total": a range past its end answers only what is there
      const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
      const expected = Number.isFinite(total) ? Math.min(length, total - start) : length
      if (bytes.length !== expected) throw new Error(`${url}: ${bytes.length} bytes for a range of ${expected}`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, bytes)
      if (expected < length) fs.writeFileSync(file + '.short', '')
      return bytes
    } catch (e) {
      if (e instanceof Refused || attempt >= 3) throw e
      await new Promise(resolve => setTimeout(resolve, waitMs * 2 ** (attempt - 1)))
    }
  }
}

/** Runs the jobs, at most `n` at once, in order of their results. */
async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length)
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const k = next++
      out[k] = await jobs[k]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker))
  return out
}

/** The file name of the 3° WorldCover file whose south-west corner is (lat, lon). */
export function fileName(lat: number, lon: number): string {
  const ns = `${lat >= 0 ? 'N' : 'S'}${String(Math.abs(lat)).padStart(2, '0')}`
  const ew = `${lon >= 0 ? 'E' : 'W'}${String(Math.abs(lon)).padStart(3, '0')}`
  return `ESA_WorldCover_10m_2021_v200_${ns}${ew}_Map.tif`
}

/** One 3° file at its reduced level: its pixels, one byte of class a pixel, the north row first. */
interface Sheet {
  lat0: number
  lon0: number
  size: number
  classes: Uint8Array
}

/** The level to read: the smallest at least `px` pixels across (the full size if none is). */
export function chooseLevel(levels: CogLevel[], px: number): CogLevel {
  return levels.reduce((best, l) => (l.width >= px && l.width < best.width ? l : best), levels[0])
}

/**
 * Where (lat, lon) falls in a 3° sheet of `size` pixels whose south-west corner is (lat0, lon0): the index of its
 * pixel, row × size + column, the north row first as the file stores it (a number, not a pair: the sampling loop
 * calls it 160 million times).
 */
export function pixelOf(lat0: number, lon0: number, size: number, lat: number, lon: number): number {
  const col = Math.min(size - 1, Math.floor(((lon - lon0) / 3) * size))
  const row = Math.min(size - 1, Math.floor(((lat0 + 3 - lat) / 3) * size))
  return row * size + col
}

/**
 * Reads one file's reduced level: the header, then its tiles, TILES_AT_ONCE at a time, inflated (an empty tile is
 * no data: left 0). Null when there is no such file (open sea).
 */
async function readSheet(lat0: number, lon0: number): Promise<Sheet | null> {
  const name = fileName(lat0, lon0)
  const url = `${BASE}/${name}`
  const head = await range(url, path.join(CACHE, name, 'head.bin'), 0, HEADER_BYTES)
  if (!head) return null
  const level = chooseLevel(parseCog(head), WORLDCOVER_LEVEL_PX)
  if (level.compression !== 8) throw new Error(`${name}: compression ${level.compression}, not Deflate`)
  // a 3° file is square, and so are its tiles: pixelOf and the tile copy below count on both
  if (level.height !== level.width) throw new Error(`${name}: a level of ${level.width} × ${level.height} pixels`)
  if (level.tileLength !== level.tile) throw new Error(`${name}: tiles of ${level.tile} × ${level.tileLength}`)
  const across = Math.ceil(level.width / level.tile)
  const classes = new Uint8Array(level.width * level.height)
  const tiles = await pool(
    level.offsets.map(
      (offset, t) => () =>
        level.counts[t]
          ? range(url, path.join(CACHE, name, `${level.width}-${t}.bin`), offset, level.counts[t])
          : Promise.resolve(null),
    ),
    TILES_AT_ONCE,
  )
  for (let t = 0; t < tiles.length; t++) {
    const raw = tiles[t]
    if (!raw) continue
    const pixels = zlib.inflateSync(raw)
    const tx = (t % across) * level.tile
    const ty = Math.floor(t / across) * level.tile
    for (let y = 0; y < level.tile && ty + y < level.height; y++) {
      for (let x = 0; x < level.tile && tx + x < level.width; x++) {
        classes[(ty + y) * level.width + tx + x] = pixels[y * level.tile + x]
      }
    }
  }
  return { lat0, lon0, size: level.width, classes }
}

/**
 * The tree cover on a grid of nx × nz nodes `step` metres apart from (x0, z0) in the theatre's projection, the south
 * row first: for each node, the share of `per` × `per` samples spread over its cell that fall on trees, 0 to 255.
 */
async function forestCover(
  proj: Projection,
  x0: number,
  z0: number,
  step: number,
  nx: number,
  nz: number,
  per = 3,
): Promise<Uint8Array> {
  // the 3° files the grid touches: every one between the lowest and highest latitude and longitude of its edges
  // (sampled densely: the projection curves them), not only those under its corners
  let latLo = Infinity
  let latHi = -Infinity
  let lonLo = Infinity
  let lonHi = -Infinity
  // the samples reach half a cell past the edge nodes
  const reach = step / 2
  for (let k = 0; k <= 32; k++) {
    for (const [fx, fz] of [
      [k / 32, 0],
      [k / 32, 1],
      [0, k / 32],
      [1, k / 32],
    ]) {
      const x = x0 - reach + fx * ((nx - 1) * step + 2 * reach)
      const z = z0 - reach + fz * ((nz - 1) * step + 2 * reach)
      const [lat, lon] = proj.inverse(x, z)
      latLo = Math.min(latLo, lat)
      latHi = Math.max(latHi, lat)
      lonLo = Math.min(lonLo, lon)
      lonHi = Math.max(lonHi, lon)
    }
  }
  // the sheets by their 3° cell, rows of latitude: indexed numerically (a string key a sample cost minutes over 160
  // million samples)
  const lat3 = Math.floor(latLo / 3)
  const lon3 = Math.floor(lonLo / 3)
  const rows = Math.floor(latHi / 3) - lat3 + 1
  const cols = Math.floor(lonHi / 3) - lon3 + 1
  const grid = await pool(
    Array.from(
      { length: rows * cols },
      (_, k) => () => readSheet((lat3 + Math.floor(k / cols)) * 3, (lon3 + (k % cols)) * 3),
    ),
    FILES_AT_ONCE,
  )
  console.log(`forests: ${grid.filter(Boolean).length} WorldCover files`)
  const out = new Uint8Array(nx * nz)
  const sample = (lat: number, lon: number) => {
    const row = Math.floor(lat / 3) - lat3
    const col = Math.floor(lon / 3) - lon3
    // a sample past the files read (it cannot be, but a wrong index would read another file's pixel): no trees
    if (row < 0 || row >= rows || col < 0 || col >= cols) return 0
    const sheet = grid[row * cols + col]
    if (!sheet) return 0
    return sheet.classes[pixelOf(sheet.lat0, sheet.lon0, sheet.size, lat, lon)] === TREES ? 1 : 0
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let trees = 0
      for (let a = 0; a < per; a++) {
        for (let b = 0; b < per; b++) {
          const x = x0 + (i + (a + 0.5) / per - 0.5) * step
          const z = z0 + (j + (b + 0.5) / per - 0.5) * step
          const [lat, lon] = proj.inverse(x, z)
          trees += sample(lat, lon)
        }
      }
      out[j * nx + i] = Math.round((trees / (per * per)) * 255)
    }
  }
  return out
}

/**
 * The forest field of a frame centred on (lat0, lon0), from edge to edge: the cover at FIELD_CELL (2 × 2 samples a
 * node), smoothed (smoothCover). Made once and cached, its parameters in the file's name; the theatre makes it first,
 * the tiles then read it.
 */
export async function forestField(frame: Frame, proj: Projection): Promise<ForestField> {
  const { nx, nz } = frameGrid(frame, FIELD_CELL)
  const key = [frame.lat0, frame.lon0, frame.halfX, frame.halfZ, FIELD_CELL, WOOD_BOX_M, WORLDCOVER_LEVEL_PX].join('_')
  const file = path.join(CACHE, `field-${key}.bin`)
  if (fs.existsSync(file)) {
    const kept = fs.readFileSync(file)
    if (kept.length === nx * nz) return { cell: FIELD_CELL, nx, nz, cover: new Uint8Array(kept) }
  }
  const cover = await forestCover(proj, -frame.halfX, -frame.halfZ, FIELD_CELL, nx, nz, 2)
  const field: ForestField = { cell: FIELD_CELL, nx, nz, cover: smoothCover(cover, nx, nz, FIELD_CELL) }
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(file, field.cover)
  return field
}
