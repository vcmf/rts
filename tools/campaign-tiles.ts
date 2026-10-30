// Bakes the campaign map offline (docs/systems/campaign-map.md, docs/plans/active/k2a-bake.md): for each level, 250 m
// (the whole theatre, far) and 100 m (close), the heights from the terrain tiles, the one shape, the lakes sunk into
// it, the light that does not change (on all cores) and the forests (src/render/campaign/bake.ts), cut into tiles of
// 256 × 256 nodes, deflated, under scratch/campaign/ (git-ignored, never committed):
//   manifest.json: the format, the frame, the bake's parameters, the levels (src/render/campaign/tiles.ts, Manifest)
//   l<level>/t-<i>-<j>.bin: one tile (src/render/campaign/tiles.ts, the format)
// Until the campaign page replaces the prototype (K2b), the 100 m level is also written as the prototype's tiles
// (prototypes/campaign-map.html cannot fetch binary from file://), under scratch/campaign-tiles/:
//   meta.js: window.CAMPAIGN_TILES = { cell, nx, nz, size, tilesX, tilesZ, scale, params }
//   t-<i>-<j>.js: window.__campaignTile(i, j, shape, light): the shape as base64 of little-endian Uint16 in `scale`
//     metres, the light as base64 of three bytes a node (the sun, the sky, the forest), the south row first.
// Reads the theatre (tools/campaign-theatre.ts's output) for the frame, its lowest ground and the lakes, and the
// frame's forest field (tools/worldcover.ts, made by the theatre and cached). Both outputs are built beside the last
// ones and swapped in when the run succeeds.
// Usage: node tools/campaign-tiles.ts [theatre out prototypeOut]
//   default: scratch/campaign-1805.js scratch/campaign scratch/campaign-tiles
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import {
  bakeLightRows,
  buildShape,
  despiked,
  lakeDistance,
  resampleField,
  sinkLakes,
  FIELD_CELL,
  WOOD_BOX_M,
  type ForestField,
  type Grid,
  type ShapeParams,
  type SunParams,
} from '../src/render/campaign/bake.ts'
import {
  cutTile,
  levelLayout,
  MANIFEST_FORMAT,
  packTile,
  type Level,
  type LevelBake,
  type Manifest,
  type Tile,
} from '../src/render/campaign/tiles.ts'
import { frameGrid, projection, type Frame, type Pt } from './campaign-theatre-lib.ts'
import { sampleGrid } from './terrarium.ts'
import { forestField, WORLDCOVER_LEVEL_PX } from './worldcover.ts'

// the levels: their cell in metres and the terrain tiles' zoom they are sampled from (zoom 9 is about 200 m a pixel
// here, zoom 10 about 100 m)
const LEVELS = [
  { cell: 250, zoom: 9 },
  { cell: 100, zoom: 10 },
]
// the tile size in nodes, the shape's storage step in metres
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
// the height the stored shape's zero stands for: the shape is 0 or more until the lakes sink it by SINK at most
const BASE = -SINK

const deflate = promisify(zlib.deflate)

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
  frame: Frame
  cell: number
  nx: number
  nz: number
  h: string
  lakes: number[][]
  credit: string
}

/** The theatre file run with a stand-in `window`. */
function loadTheatre(file: string): Theatre {
  const context: { window: { THEATRE?: Theatre } } = { window: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file })
  if (!context.window.THEATRE) throw new Error(`${file} does not set window.THEATRE: run tools/campaign-theatre.ts`)
  return context.window.THEATRE
}

/** The theatre's own heights, despiked as the page does. */
function theatreHeights(t: Theatre): Float32Array {
  const bytes = Buffer.from(t.h, 'base64')
  return despiked(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2), t.nx, t.nz)
}

/** The lowest ground of the theatre's heights, so every level starts from it. */
function lowest(h: Float32Array): number {
  let low = Infinity
  for (const v of h) low = Math.min(low, v)
  return low
}

/** Bakes the light on every core, each worker a band of rows; returns the sun and sky bytes a node. */
async function bakeLight(shape: Float32Array, grid: Grid): Promise<Uint8Array> {
  const shared = new SharedArrayBuffer(shape.byteLength)
  new Float32Array(shared).set(shape)
  const light = new SharedArrayBuffer(grid.nx * grid.nz * 2)
  const count = Math.max(1, os.cpus().length)
  const band = Math.ceil(grid.nz / count)
  const workers = Array.from({ length: count }, (_, w) => {
    const job: Job = { shape: shared, light, grid, sun: SUN, j0: w * band, j1: Math.min(grid.nz, (w + 1) * band) }
    return new Worker(new URL(import.meta.url), { workerData: job })
  })
  try {
    await Promise.all(
      workers.map(
        worker =>
          new Promise<void>((resolve, reject) => {
            worker.on('message', () => resolve())
            worker.on('error', reject)
          }),
      ),
    )
  } finally {
    // a failed band stops the others: none is left baking
    await Promise.all(workers.map(worker => worker.terminate()))
  }
  return new Uint8Array(light)
}

/** What every level is baked from: the theatre, its projection, its lowest ground, the forests. */
interface Sources {
  t: Theatre
  proj: ReturnType<typeof projection>
  low: number
  forest: ForestField
}

/**
 * One level baked: its heights (sampled at `zoom`), shape, lakes, light and forest, on a grid spanning the frame (the
 * cell must divide it).
 */
async function bakeLevel(src: Sources, cell: number, zoom: number): Promise<LevelBake> {
  const { t, proj, low } = src
  const { frame } = t
  const grid: Grid = { ...frameGrid(frame, cell), cell, x0: -frame.halfX, z0: -frame.halfZ }
  const sampled = await sampleGrid(proj, zoom, grid.x0, grid.z0, cell, grid.nx, grid.nz)
  const shape = buildShape(despiked(sampled, grid.nx, grid.nz), grid, { ...SHAPE, low })
  const rings: Pt[][] = t.lakes.map(flat => {
    const ring: Pt[] = []
    for (let k = 0; k < flat.length; k += 2) ring.push([flat[k], flat[k + 1]])
    return ring
  })
  sinkLakes(shape, lakeDistance(rings, grid, LAKE_BLUR_M), cell, SINK)
  const forest = resampleField(src.forest, cell, grid.nx, grid.nz)
  const light = await bakeLight(shape, grid)
  return { grid, shape, light, forest }
}

/** The tiles of a level, cut from its bake row by row, their shape above BASE. */
function* tilesOf(bake: LevelBake, level: number): Generator<Tile> {
  const { tilesX, tilesZ } = levelLayout(bake.grid.nx, bake.grid.nz, SIZE)
  for (let row = 0; row < tilesZ; row++) {
    for (let column = 0; column < tilesX; column++) yield cutTile(bake, { level, column, row }, SIZE, SCALE, BASE)
  }
}

/**
 * A tile as the prototype loads it: a script calling window.__campaignTile with the shape (from zero, a lake below
 * the lowest ground held there, as the prototype has always drawn it) and the light's three bytes a node interleaved.
 */
function prototypeTile(tile: Tile): string {
  const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
  const zero = -BASE / SCALE
  const shape = Uint16Array.from(tile.shape, steps => Math.max(0, steps - zero))
  const light = new Uint8Array(tile.sun.length * 3)
  for (let k = 0; k < tile.sun.length; k++) {
    light[k * 3] = tile.sun[k]
    light[k * 3 + 1] = tile.sky[k]
    light[k * 3 + 2] = tile.forest[k]
  }
  return `window.__campaignTile(${tile.column},${tile.row},"${b64(shape)}","${b64(light)}")\n`
}

/**
 * Writes a level's tiles under `dir`, deflated on libuv's thread pool (as many at once as it has threads), and, given
 * `prototypeDir`, the prototype's tiles and meta file there too, from the same cut. Returns the bytes on disk of each.
 */
async function writeLevel(dir: string, bake: LevelBake, level: number, prototypeDir?: string) {
  fs.mkdirSync(dir, { recursive: true })
  if (prototypeDir) fs.mkdirSync(prototypeDir, { recursive: true })
  const tiles = tilesOf(bake, level)
  const written = { bytes: 0, prototype: 0 }
  const worker = async () => {
    for (const tile of tiles) {
      const name = `t-${tile.column}-${tile.row}`
      const packed = await deflate(packTile(tile), { level: 9 })
      await fs.promises.writeFile(path.join(dir, `${name}.bin`), packed)
      written.bytes += packed.length
      if (prototypeDir) {
        const js = prototypeTile(tile)
        await fs.promises.writeFile(path.join(prototypeDir, `${name}.js`), js)
        written.prototype += js.length
      }
    }
  }
  await Promise.all(Array.from({ length: Number(process.env.UV_THREADPOOL_SIZE ?? 4) }, worker))
  if (prototypeDir) {
    const { nx, nz, cell } = bake.grid
    const meta = { cell, nx, nz, ...levelLayout(nx, nz, SIZE), scale: SCALE, params: prototypeParams() }
    fs.writeFileSync(path.join(prototypeDir, 'meta.js'), `window.CAMPAIGN_TILES = ${JSON.stringify(meta)}\n`)
  }
  return written
}

/** The parameters the prototype's tiles were baked with, as the prototype compares them. */
function prototypeParams() {
  return {
    vert: SHAPE.vert,
    fine: SHAPE.fine,
    mount: SHAPE.mount,
    sun: SUN.el,
    az: SUN.az,
    soft: SUN.size,
    bytes: 3,
    woodBoxM: WOOD_BOX_M,
  }
}

/** Every parameter the bake depends on, as the page compares them: tiles baked otherwise are not used. */
function params(low: number): Record<string, number> {
  return {
    ...SHAPE,
    low,
    sunEl: SUN.el,
    sunAz: SUN.az,
    sunSize: SUN.size,
    sink: SINK,
    lakeBlurM: LAKE_BLUR_M,
    woodBoxM: WOOD_BOX_M,
    forestCell: FIELD_CELL,
    forestLevelPx: WORLDCOVER_LEVEL_PX,
  }
}

/**
 * Swaps finished builds in for the last ones, as nearly at once as the file system allows: each old directory
 * renamed aside, each new one renamed into its place, and only then the old ones removed. When a rename fails, what
 * was moved goes back (the new builds to their building directories, the old ones to their places), so the last
 * builds stay whole.
 */
function swapIn(pairs: [building: string, dir: string][]) {
  const asideDone: string[] = []
  const inDone: [building: string, dir: string][] = []
  try {
    for (const [, dir] of pairs) {
      if (!fs.existsSync(dir)) continue
      fs.renameSync(dir, `${dir}.old`)
      asideDone.push(dir)
    }
    for (const [building, dir] of pairs) {
      fs.renameSync(building, dir)
      inDone.push([building, dir])
    }
  } catch (e) {
    for (const [building, dir] of inDone) fs.renameSync(dir, building)
    for (const dir of asideDone) fs.renameSync(`${dir}.old`, dir)
    throw e
  }
  for (const dir of asideDone) fs.rmSync(`${dir}.old`, { recursive: true, force: true })
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`

async function main() {
  const t0 = performance.now()
  // resolved, so a path given with a trailing slash names the directory, not a place inside it
  const theatreFile = process.argv[2] ?? 'scratch/campaign-1805.js'
  const out = path.resolve(process.argv[3] ?? 'scratch/campaign')
  const prototypeOut = path.resolve(process.argv[4] ?? 'scratch/campaign-tiles')
  const t = loadTheatre(theatreFile)
  const proj = projection(t.frame.lat0, t.frame.lon0)
  const src: Sources = { t, proj, low: lowest(theatreHeights(t)), forest: await forestField(t.frame, proj) }
  // built beside the last builds and swapped in at the end: a failed run leaves them as they were
  const building = `${out}.building`
  const prototypeBuilding = `${prototypeOut}.building`
  // and what a crashed run may have left beside them
  for (const dir of [building, prototypeBuilding, `${out}.old`, `${prototypeOut}.old`]) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const levels: Level[] = []
  for (const [level, { cell, zoom }] of LEVELS.entries()) {
    const start = performance.now()
    const bake = await bakeLevel(src, cell, zoom)
    // the close level for the prototype too
    const forPrototype = level === LEVELS.length - 1 ? prototypeBuilding : undefined
    const written = await writeLevel(path.join(building, `l${level}`), bake, level, forPrototype)
    const { nx, nz } = bake.grid
    const layout = levelLayout(nx, nz, SIZE)
    levels.push({ cell, nx, nz, ...layout, scale: SCALE, base: BASE, zoom, path: `l${level}/t-{i}-{j}.bin` })
    const ms = Math.round(performance.now() - start)
    const tiles = layout.tilesX * layout.tilesZ
    console.log(`level ${level}: ${nx} × ${nz} nodes at ${cell} m, ${tiles} tiles, ${mb(written.bytes)}, ${ms} ms`)
    if (forPrototype) console.log(`prototype tiles: ${mb(written.prototype)}`)
  }
  const manifest: Manifest = {
    format: MANIFEST_FORMAT,
    frame: t.frame,
    params: params(src.low),
    levels,
    credit: t.credit,
  }
  fs.writeFileSync(path.join(building, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  swapIn([
    [building, out],
    [prototypeBuilding, prototypeOut],
  ])
  console.log(`${out}: built on ${os.cpus().length} cores in ${Math.round(performance.now() - t0)} ms`)
}

if (isMainThread) {
  await main()
} else {
  const job = workerData as Job
  bakeLightRows(new Float32Array(job.shape), job.grid, job.sun, new Uint8Array(job.light), job.j0, job.j1)
  parentPort!.postMessage('done')
}
