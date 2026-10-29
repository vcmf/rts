// The AWS terrain tiles (Terrarium PNGs: height = red · 256 + green + blue / 256 − 32768 m; built from SRTM,
// GMTED2010 and, in Europe, EU-DEM), fetched once and cached under scratch/terrarium/, and sampled onto a grid in the
// campaign map's projection. Used by tools/campaign-theatre.ts and tools/campaign-tiles.ts
// (docs/plans/active/k1-theatre-look.md).
import fs from 'node:fs'
import path from 'node:path'
import { read as readPng } from './png.mjs'
import type { projection } from './campaign-theatre-lib.ts'

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const TILE_SIZE = 256
const CACHE = 'scratch'

type Projection = ReturnType<typeof projection>

/** A file from the cache, or fetched and cached. */
export async function cached(file: string, url: string): Promise<Buffer> {
  if (fs.existsSync(file)) return fs.readFileSync(file)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes)
  return bytes
}

/** Degrees to the global Web Mercator pixel at a tile zoom, as [px, py]. */
function mercatorPixel(lat: number, lon: number, zoom: number): [number, number] {
  const world = TILE_SIZE * 2 ** zoom
  const phi = (lat * Math.PI) / 180
  const px = ((lon + 180) / 360) * world
  const py = ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * world
  return [px, py]
}

/** Fetches the terrain tiles at a zoom over the given pixel span, a few at a time, as a map from "tx,ty" to heights. */
async function loadTiles(
  zoom: number,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
): Promise<Map<string, Float32Array>> {
  const keys: [number, number][] = []
  for (let ty = Math.floor(py0 / TILE_SIZE); ty <= Math.floor(py1 / TILE_SIZE); ty++) {
    for (let tx = Math.floor(px0 / TILE_SIZE); tx <= Math.floor(px1 / TILE_SIZE); tx++) keys.push([tx, ty])
  }
  const tiles = new Map<string, Float32Array>()
  let next = 0
  async function worker() {
    while (next < keys.length) {
      const [tx, ty] = keys[next++]
      const rel = `${zoom}/${tx}/${ty}.png`
      const png = readPng(await cached(path.join(CACHE, 'terrarium', rel), `${TILE_URL}/${rel}`))
      const h = new Float32Array(TILE_SIZE * TILE_SIZE)
      for (let k = 0; k < h.length; k++) {
        const o = k * 4
        h[k] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768
      }
      tiles.set(`${tx},${ty}`, h)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  console.log(`terrain: ${keys.length} tiles at zoom ${zoom}`)
  return tiles
}

/** The height at a global pixel position, bilinear over the tiles' pixel centres. */
function sampleTiles(tiles: Map<string, Float32Array>, px: number, py: number): number {
  const fx = px - 0.5
  const fy = py - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const u = fx - x0
  const v = fy - y0
  const at = (x: number, y: number) => {
    const tile = tiles.get(`${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`)!
    const ix = ((x % TILE_SIZE) + TILE_SIZE) % TILE_SIZE
    const iy = ((y % TILE_SIZE) + TILE_SIZE) % TILE_SIZE
    return tile[iy * TILE_SIZE + ix]
  }
  const top = at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u
  const bottom = at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u
  return top * (1 - v) + bottom * v
}

/**
 * Heights in whole metres on a grid of nx × nz nodes `step` metres apart from (x0, z0) in the map's metres, the south
 * row first, sampled from the terrain tiles at a zoom.
 */
export async function sampleGrid(
  proj: Projection,
  zoom: number,
  x0: number,
  z0: number,
  step: number,
  nx: number,
  nz: number,
): Promise<Int16Array> {
  // the pixel span of the grid: its corners and edge midpoints, with a margin of two pixels
  let px0 = Infinity
  let py0 = Infinity
  let px1 = -Infinity
  let py1 = -Infinity
  for (const fx of [0, 0.5, 1]) {
    for (const fz of [0, 0.5, 1]) {
      const [lat, lon] = proj.inverse(x0 + fx * (nx - 1) * step, z0 + fz * (nz - 1) * step)
      const [px, py] = mercatorPixel(lat, lon, zoom)
      px0 = Math.min(px0, px - 2)
      py0 = Math.min(py0, py - 2)
      px1 = Math.max(px1, px + 2)
      py1 = Math.max(py1, py + 2)
    }
  }
  const tiles = await loadTiles(zoom, px0, py0, px1, py1)
  const h = new Int16Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [lat, lon] = proj.inverse(x0 + i * step, z0 + j * step)
      const [px, py] = mercatorPixel(lat, lon, zoom)
      h[j * nx + i] = Math.round(sampleTiles(tiles, px, py))
    }
  }
  return h
}
