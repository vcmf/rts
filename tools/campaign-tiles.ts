// Bakes the campaign map's close zoom offline (docs/plans/active/k1-theatre-look.md, the tiles' proof of concept):
// the theatre at 100 m, its one shape (tools/campaign-bake.ts: the large forms kept, mountains lifted, raised, the
// lakes sunk) and the light that does not change (the sun's soft shadow, the sky's occlusion) at full resolution,
// cut into tiles of 256 × 256 nodes under scratch/campaign-tiles/ (git-ignored, never committed):
//   meta.js: window.CAMPAIGN_TILES = { cell, nx, nz, size, tilesX, tilesZ, scale, params }
//   t-<i>-<j>.js: window.__campaignTile(i, j, shape, light): the shape in metres / scale as base64 of little-endian
//     Uint16, the light as base64 of three bytes a node (the sun, the sky, the tree cover: tools/worldcover.ts), each
//     the south row first; nodes past the grid repeat its edge.
// The page (prototypes/campaign-map.html) loads the tiles around the camera when it closes in, and blends them over
// its own 250 m bake; it uses them only if their params match its own.
// Reads the theatre (tools/campaign-theatre.ts's output) for the frame, the lowest ground and the lakes; the heights
// from the terrain tiles at zoom 10 (about 100 m a pixel here; tools/terrarium.ts). The light is baked on all cores.
// Usage: node tools/campaign-tiles.ts [theatre out]
//   default: scratch/campaign-1805.js scratch/campaign-tiles
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import {
  bakeLightRows,
  blur,
  buildShape,
  despiked,
  lakeDistance,
  sinkLakes,
  type Grid,
  type ShapeParams,
  type SunParams,
} from './campaign-bake.ts'
import { projection, type Pt } from './campaign-theatre-lib.ts'
import { sampleGrid } from './terrarium.ts'
import { forestCover, WOOD_BLUR_M } from './worldcover.ts'

// the grid, the tiles' zoom, the tile size in nodes, the shape's storage step in metres
const CELL = 100
const ZOOM = 10
const SIZE = 256
const SCALE = 0.5
// the page's defaults (prototypes/campaign-map.html): the tiles are used only with these
const SHAPE: Omit<ShapeParams, 'low'> = {
  bigM: 3000,
  regionM: 6000,
  fine: 0.75,
  mount: 1,
  vert: 2.5,
  mountFrom: 500,
  mountTo: 1600,
  edgeKm: 12,
}
const SUN: SunParams = { el: 20, az: 55, size: 2.5 }
const SINK = 70
const LAKE_BLUR_M = 750

/** What a light worker is given. */
interface Job {
  shape: SharedArrayBuffer
  light: SharedArrayBuffer
  grid: Grid
  sun: SunParams
  j0: number
  j1: number
}

/** The generated theatre, as far as this tool reads it. */
interface Theatre {
  frame: { lat0: number; lon0: number; halfX: number; halfZ: number }
  cell: number
  nx: number
  nz: number
  h: string
  lakes: number[][]
}

/** The theatre file run with a stand-in `window`. */
function loadTheatre(file: string): Theatre {
  const context: { window: { THEATRE?: Theatre } } = { window: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file })
  if (!context.window.THEATRE) throw new Error(`${file} does not set window.THEATRE: run tools/campaign-theatre.ts`)
  return context.window.THEATRE
}

/** The lowest ground of the theatre's own heights (despiked as the page does), so both shapes start from it. */
function theatreLow(t: Theatre): number {
  const bytes = Buffer.from(t.h, 'base64')
  const h = despiked(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2), t.nx, t.nz)
  let low = Infinity
  for (const v of h) low = Math.min(low, v)
  return low
}

/** Bakes the light on every core, each worker a band of rows; returns the RG bytes. */
async function bakeLight(shape: Float32Array, grid: Grid): Promise<Uint8Array> {
  const shared = new SharedArrayBuffer(shape.byteLength)
  new Float32Array(shared).set(shape)
  const light = new SharedArrayBuffer(grid.nx * grid.nz * 2)
  const workers = Math.max(1, os.cpus().length)
  const band = Math.ceil(grid.nz / workers)
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const job: Job = { shape: shared, light, grid, sun: SUN, j0: w * band, j1: Math.min(grid.nz, (w + 1) * band) }
      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: job })
        worker.on('message', () => resolve())
        worker.on('error', reject)
      })
    }),
  )
  return new Uint8Array(light)
}

/** Writes the tiles and the meta file. */
function writeTiles(dir: string, grid: Grid, shape: Float32Array, light: Uint8Array, forest: Uint8Array) {
  fs.mkdirSync(dir, { recursive: true })
  const tilesX = Math.ceil(grid.nx / SIZE)
  const tilesZ = Math.ceil(grid.nz / SIZE)
  for (let tj = 0; tj < tilesZ; tj++) {
    for (let ti = 0; ti < tilesX; ti++) {
      const s = new Uint16Array(SIZE * SIZE)
      const l = new Uint8Array(SIZE * SIZE * 3)
      for (let j = 0; j < SIZE; j++) {
        const gj = Math.min(grid.nz - 1, tj * SIZE + j)
        for (let i = 0; i < SIZE; i++) {
          const k = gj * grid.nx + Math.min(grid.nx - 1, ti * SIZE + i)
          s[j * SIZE + i] = Math.round(Math.max(0, shape[k]) / SCALE)
          l[(j * SIZE + i) * 3] = light[k * 2]
          l[(j * SIZE + i) * 3 + 1] = light[k * 2 + 1]
          l[(j * SIZE + i) * 3 + 2] = forest[k]
        }
      }
      const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
      const js = `window.__campaignTile(${ti},${tj},"${b64(s)}","${b64(l)}")\n`
      fs.writeFileSync(path.join(dir, `t-${ti}-${tj}.js`), js)
    }
  }
  const meta = { cell: CELL, nx: grid.nx, nz: grid.nz, size: SIZE, tilesX, tilesZ, scale: SCALE, params: paramsKey() }
  fs.writeFileSync(path.join(dir, 'meta.js'), `window.CAMPAIGN_TILES = ${JSON.stringify(meta)}\n`)
  return tilesX * tilesZ
}

/** The parameters the tiles were baked with, as the page compares them. */
function paramsKey() {
  return {
    vert: SHAPE.vert,
    fine: SHAPE.fine,
    mount: SHAPE.mount,
    sun: SUN.el,
    az: SUN.az,
    soft: SUN.size,
    bytes: 3,
    woodBlurM: WOOD_BLUR_M,
  }
}

async function main() {
  const t0 = performance.now()
  const theatreFile = process.argv[2] ?? 'scratch/campaign-1805.js'
  const dir = process.argv[3] ?? 'scratch/campaign-tiles'
  const t = loadTheatre(theatreFile)
  const { frame } = t
  const grid: Grid = {
    nx: Math.round((2 * frame.halfX) / CELL) + 1,
    nz: Math.round((2 * frame.halfZ) / CELL) + 1,
    cell: CELL,
    x0: -frame.halfX,
    z0: -frame.halfZ,
  }
  const proj = projection(frame.lat0, frame.lon0)
  const raw = await sampleGrid(proj, ZOOM, grid.x0, grid.z0, CELL, grid.nx, grid.nz)
  const heights = despiked(raw, grid.nx, grid.nz)
  console.log(`heights: ${grid.nx} × ${grid.nz} at ${CELL} m, ${Math.round(performance.now() - t0)} ms`)
  const shape = buildShape(heights, grid, { ...SHAPE, low: theatreLow(t) })
  const rings: Pt[][] = t.lakes.map(flat => {
    const ring: Pt[] = []
    for (let k = 0; k < flat.length; k += 2) ring.push([flat[k], flat[k + 1]])
    return ring
  })
  sinkLakes(shape, lakeDistance(rings, grid, LAKE_BLUR_M), CELL, SINK)
  console.log(`shape and lakes: ${Math.round(performance.now() - t0)} ms`)
  // the light on the workers and the tree cover on this thread, side by side (they do not depend on each other); the
  // cover smoothed as the theatre's is (WOOD_BLUR_M): farm copses fade, the large forests stay
  const [light, cover] = await Promise.all([
    bakeLight(shape, grid),
    forestCover(proj, grid.x0, grid.z0, CELL, grid.nx, grid.nz, 2),
  ])
  const forest = Uint8Array.from(blur(cover, grid.nx, grid.nz, WOOD_BLUR_M / CELL), v => Math.round(v))
  console.log(`light on ${os.cpus().length} cores and forests: ${Math.round(performance.now() - t0)} ms`)
  const n = writeTiles(dir, grid, shape, light, forest)
  console.log(`${dir}: ${n} tiles of ${SIZE} × ${SIZE} nodes; built in ${Math.round(performance.now() - t0)} ms`)
}

if (isMainThread) {
  await main()
} else {
  const job = workerData as Job
  bakeLightRows(new Float32Array(job.shape), job.grid, job.sun, new Uint8Array(job.light), job.j0, job.j1)
  parentPort!.postMessage('done')
}
