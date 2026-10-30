// ESA WorldCover 2021 (10 m land cover, © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data
// (2021) processed by ESA WorldCover consortium; CC BY 4.0) for the campaign map's forests
// (docs/plans/active/k1b-forests.md). The files are cloud-optimised GeoTIFFs of 3° × 3° on AWS, each holding reduced
// copies of itself; only one reduced level is read, tile by tile, by range requests (the header first), and cached
// under scratch/worldcover/: about 5 MB a file at about 70 m a pixel, where the full file is about 100 MB.
// Its tree-cover class (10) is sampled onto a grid in the theatre's projection as a coverage, 0 to 255.
// WOOD_BLUR_M: the cover is smoothed over about this many metres before it is printed (the large forests stay, the
// farm copses fade); the theatre and the tiles both smooth by it, and record it so the page can check they agree.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type { projection } from './campaign-theatre-lib.ts'

const BASE = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map'
const CACHE = 'scratch/worldcover'
// the header holds every level's tile tables within its first bytes
const HEADER_BYTES = 65536
// the class of tree cover
const TREES = 10
// the level read: the one closest to (and not coarser than) this many pixels across a 3° file
const LEVEL_PX = 4500
export const WOOD_BLUR_M = 1000
export const WORLDCOVER_CREDIT =
  'Forests: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA ' +
  'WorldCover consortium, CC BY 4.0.'

type Projection = ReturnType<typeof projection>

/** One reduced level of a cloud-optimised GeoTIFF: its size, its tiles' size, and each tile's bytes in the file. */
export interface CogLevel {
  width: number
  height: number
  tile: number
  offsets: number[]
  counts: number[]
  compression: number
}

/**
 * The levels of a little-endian tiled GeoTIFF (full size first), from its first bytes: each level's size, tile size,
 * compression and tile tables (TileOffsets 324, TileByteCounts 325). Throws when a table lies past the bytes given.
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
    levels.push({
      width: tags.get(256)![0],
      height: tags.get(257)![0],
      tile: tags.get(322)![0],
      offsets: tags.get(324)!,
      counts: tags.get(325)!,
      compression: tags.get(259)![0],
    })
    ifd = head.readUInt32LE(ifd + 2 + entries * 12)
  }
  return levels
}

/**
 * A byte range of a file, from the cache or fetched and cached: only a partial answer (206) of exactly the length
 * asked is kept (a server that ignored the range would answer the whole file; a cut answer would poison the cache).
 * A cached range of another length is fetched again. Null when the file does not exist (404: open sea has none).
 */
async function range(url: string, file: string, start: number, length: number): Promise<Buffer | null> {
  if (fs.existsSync(file)) {
    const kept = fs.readFileSync(file)
    if (kept.length === length) return kept
  }
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } })
  if (res.status === 404) return null
  if (res.status !== 206) throw new Error(`${url}: HTTP ${res.status}, not a partial answer to a range`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length !== length) throw new Error(`${url}: ${bytes.length} bytes for a range of ${length}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes)
  return bytes
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
 * Where (lat, lon) falls in a 3° sheet of `size` pixels whose south-west corner is (lat0, lon0): its column and row,
 * the north row first, as the file stores it.
 */
export function pixelOf(lat0: number, lon0: number, size: number, lat: number, lon: number): [number, number] {
  const col = Math.min(size - 1, Math.floor(((lon - lon0) / 3) * size))
  const row = Math.min(size - 1, Math.floor(((lat0 + 3 - lat) / 3) * size))
  return [col, row]
}

/**
 * Reads one file's reduced level: the header, then its tiles, fetched side by side and inflated (an empty tile is
 * no data: left 0). Null when there is no such file (open sea).
 */
async function readSheet(lat0: number, lon0: number): Promise<Sheet | null> {
  const name = fileName(lat0, lon0)
  const url = `${BASE}/${name}`
  const head = await range(url, path.join(CACHE, name, 'head.bin'), 0, HEADER_BYTES)
  if (!head) return null
  const level = chooseLevel(parseCog(head), LEVEL_PX)
  if (level.compression !== 8) throw new Error(`${name}: compression ${level.compression}, not Deflate`)
  const across = Math.ceil(level.width / level.tile)
  const classes = new Uint8Array(level.width * level.height)
  const tiles = await Promise.all(
    level.offsets.map((offset, t) =>
      level.counts[t]
        ? range(url, path.join(CACHE, name, `${level.width}-${t}.bin`), offset, level.counts[t])
        : Promise.resolve(null),
    ),
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
export async function forestCover(
  proj: Projection,
  x0: number,
  z0: number,
  step: number,
  nx: number,
  nz: number,
  per = 3,
): Promise<Uint8Array> {
  const sheets = new Map<string, Sheet>()
  // the 3° files the grid touches: every one between the lowest and highest latitude and longitude of its edges
  // (sampled densely: the projection curves them), not only those under its corners
  let latLo = Infinity
  let latHi = -Infinity
  let lonLo = Infinity
  let lonHi = -Infinity
  for (let k = 0; k <= 32; k++) {
    for (const [fx, fz] of [
      [k / 32, 0],
      [k / 32, 1],
      [0, k / 32],
      [1, k / 32],
    ]) {
      const [lat, lon] = proj.inverse(x0 + fx * (nx - 1) * step, z0 + fz * (nz - 1) * step)
      latLo = Math.min(latLo, lat)
      latHi = Math.max(latHi, lat)
      lonLo = Math.min(lonLo, lon)
      lonHi = Math.max(lonHi, lon)
    }
  }
  const need: string[] = []
  for (let lat = Math.floor(latLo / 3) * 3; lat <= latHi; lat += 3) {
    for (let lon = Math.floor(lonLo / 3) * 3; lon <= lonHi; lon += 3) need.push(`${lat},${lon}`)
  }
  const read = await Promise.all(
    need.map(key => {
      const [lat0, lon0] = key.split(',').map(Number)
      return readSheet(lat0, lon0)
    }),
  )
  need.forEach((key, k) => {
    const sheet = read[k]
    if (sheet) sheets.set(key, sheet)
  })
  console.log(`forests: ${sheets.size} WorldCover files`)
  const out = new Uint8Array(nx * nz)
  const sample = (lat: number, lon: number) => {
    const sheet = sheets.get(`${Math.floor(lat / 3) * 3},${Math.floor(lon / 3) * 3}`)
    if (!sheet) return 0
    const [col, row] = pixelOf(sheet.lat0, sheet.lon0, sheet.size, lat, lon)
    return sheet.classes[row * sheet.size + col] === TREES ? 1 : 0
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
