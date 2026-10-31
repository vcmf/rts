// Bakes the campaign map offline (docs/systems/campaign-map.md, docs/plans/done/k2a-bake.md): for each level, 250 m
// (the whole theatre, far) and 100 m (close), the heights from the terrain tiles, the one shape, the lakes sunk into
// it, the light that does not change (on all cores) and the forests (src/render/campaign/bake.ts), cut into tiles of
// 256 × 256 nodes, deflated, under scratch/campaign/ (git-ignored, never committed):
//   manifest.json: the format, its build, the frame, the bake's parameters, the levels (src/render/campaign/tiles.ts,
//     Manifest)
//   b-<time>-<pid>/l<level>/t-<i>-<j>.bin: one tile of a build (src/render/campaign/tiles.ts, the format)
//   b-<time>-<pid>/fields.bin: the far level's fields, the lakes, the lines and the contours' heights
//     (src/render/campaign/fields.ts)
//   b-<time>-<pid>/labels.json: the towns, regions and named rivers the page letters (src/render/campaign/labels.ts)
// Until the campaign page replaces the prototype (K2b), the 100 m level is also written as the prototype's tiles
// (prototypes/campaign-map.html cannot fetch binary from file://), under scratch/campaign-tiles/:
//   meta.js: window.CAMPAIGN_TILES = { cell, nx, nz, size, tilesX, tilesZ, scale, params, build }
//   b-<time>-<pid>/t-<i>-<j>.js: window.__campaignTile(i, j, shape, light): the shape as base64 of little-endian
//     Uint16 in `scale` metres, the light as base64 of three bytes a node (the sun, the sky, the forest), the south
//     row first.
// Reads the theatre (tools/campaign-theatre.ts's output) for the frame, its lowest ground and the lakes, and the
// frame's forest field (tools/worldcover.ts, made by the theatre and cached). Each build of both outputs goes into a
// directory of its own and is made live by the file that names it, the manifest or the meta file, written last
// (tools/campaign-builds.ts): a failed run leaves the last build whole and in use, and the one before it is kept for
// a page still reading it. One run at a time: two at once each keep the other's build, but the last to finish wins.
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
  blur,
  lakeMask,
  lineOffsets,
  buildShape,
  despiked,
  lakeDistance,
  resampleField,
  sinkLakes,
  FIELD_CELL,
  WOOD_BOX_M,
  type ForestField,
  type Grid,
  type Rect,
  type ShapeParams,
  type SunParams,
} from '../src/render/campaign/bake.ts'
import {
  cutTile,
  levelBlocks,
  type Block,
  levelLayout,
  MANIFEST_FORMAT,
  packTile,
  type Level,
  type LevelBake,
  type Manifest,
  type Tile,
} from '../src/render/campaign/tiles.ts'
import { packFields, quantise, type Plane } from '../src/render/campaign/fields.ts'
import type { LabelsFile } from '../src/render/campaign/labels.ts'
import { loadData, type Data } from './campaign-data.ts'
import { commitBuild, liveBuild, pruneBuilds, startBuild, writeFlushed } from './campaign-builds.ts'
import { frameGrid, projection, type Frame, type Pt } from './campaign-theatre-lib.ts'
import { sampleGrid } from './terrarium.ts'
import { forestField, WORLDCOVER_LEVEL_PX } from './worldcover.ts'

// the levels: their cell in metres and the terrain tiles' zoom they are sampled from (zoom 9 is about 200 m a pixel
// here, zoom 10 about 100 m)
const LEVELS = [
  { cell: 250, zoom: 9 },
  { cell: 100, zoom: 10 },
]
// the bake by blocks (docs/plans/active/europe.md, EU1): BLOCK_TILES × BLOCK_TILES tiles a block, baked with a margin
// of MARGIN_M round it, which covers every step's reach on the block's own nodes (the shape's widest blur, 10.5 km;
// the lakes' distance, 12 km, and its blur, 1.5 km; the sky's horizon, 9 km, on a shape exact that far out); the sun's
// rays (60 km) read the coarse shape of the whole map past it, a cell of COARSE_CELLS sampled at COARSE_ZOOM
const BLOCK_TILES = 4
const MARGIN_M = 24000
// the coarse cell: the first of these the frame's extents divide
const COARSE_CELLS = [1000, 500, 250]
const COARSE_ZOOM = 7
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
// the width the lakes sink over at their shore, the same at every level (over one cell, the 100 m level drew a
// staircase along the shore; 250 m left faint teeth, 500 m none: docs/plans/done/k2c-stream.md); the prototype sinks
// its own far level over the same
const SINK_WIDTH_M = 500
// the level the fields are baked on (the far one, which spans the whole theatre in one texture), their file
const FIELDS_LEVEL = 0
const FIELDS_FILE = 'fields.bin'
// the labels the page draws (src/render/campaign/labels.ts LabelsFile)
const LABELS_FILE = 'labels.json'
// the rivers' names as the map letters them (Natural Earth's are the local ones)
const RIVER_NAMES: Record<string, string> = { Rhein: 'Rhine', Rhin: 'Rhine', Donau: 'Danube' }
// the far level's fields (the prototype's): the lakes' mask, texels a cell (a page on a GPU whose textures are smaller
// than the mask halves it); the lines' reach in cells either way, the rivers drawn (rank 6 or larger: Natural Earth's
// scalerank, smaller is larger); the contours' heights blurred over cells; the Uint16 steps of the lakes' distance
// (km, from its lowest) and of the contours' heights (m)
const LAKE_RES = 2
const LINE_REACH = 6
const RIVER_RANK = 6
const CONTOUR_SMOOTH = 3
const LAKE_D_STEP = 0.00025
const LAKE_D_FROM = -3
const CONTOUR_STEP = 0.25
// the height the stored shape's zero stands for: the shape is 0 or more until the lakes sink it by SINK at most
const BASE = -SINK

const deflate = promisify(zlib.deflate)
// the files that name each output's live build
const MANIFEST = 'manifest.json'
const META = 'meta.js'

/** A shape shared with the light's workers, on its grid. */
interface SharedShape {
  shape: SharedArrayBuffer
  g: Grid
}

/** What a light worker is given. */
interface Job {
  shape: SharedArrayBuffer
  light: SharedArrayBuffer
  grid: Grid
  sun: SunParams
  j0: number
  j1: number
  i0: number
  i1: number
  // the coarse shape of the whole map, read past `near` (where the block's shape is exact)
  far: SharedShape
  near: Rect
}

/** The generated theatre, as far as this tool reads it. */
interface Theatre {
  frame: Frame
  cell: number
  nx: number
  nz: number
  h: string
  lakes: number[][]
  roads: { kind: string; p: number[] }[]
  rivers: { name: string; rank: number; p: number[] }[]
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

/**
 * The light's workers, one a core, kept for the whole run (a block's light is baked by all of them, each a band of its
 * rows): a block's shape and the coarse shape of the whole map are shared with them, not copied.
 */
class LightPool {
  private readonly workers: Worker[]
  private broken: Error | null = null

  constructor() {
    const count = Math.max(1, os.cpus().length)
    this.workers = Array.from({ length: count }, () => new Worker(new URL(import.meta.url), { workerData: 'light' }))
    for (const worker of this.workers) {
      // a worker gone (killed, out of memory) fails the run, not leaves it waiting
      worker.on('exit', code => (this.broken ??= new Error(`a light worker stopped (exit ${code})`)))
      worker.on('error', e => (this.broken ??= e))
    }
  }

  /**
   * The light of a block's rows j0..j1 and columns i0..i1 (its nodes in the block's grid), its shape on its grid and
   * the far shape past it: the sun and sky bytes a node of the block (the rest left 0).
   */
  async bake(
    shape: Float32Array,
    grid: Grid,
    far: SharedShape,
    near: Rect,
    rows: [number, number],
    cols: [number, number],
  ): Promise<Uint8Array> {
    const shared = new SharedArrayBuffer(shape.byteLength)
    new Float32Array(shared).set(shape)
    const light = new SharedArrayBuffer(grid.nx * grid.nz * 2)
    const band = Math.ceil((rows[1] - rows[0]) / this.workers.length)
    await Promise.all(
      this.workers.map((worker, w) => {
        const j0 = rows[0] + w * band
        const j1 = Math.min(rows[1], j0 + band)
        if (j0 >= j1) return Promise.resolve()
        const job: Job = { shape: shared, light, grid, sun: SUN, j0, j1, i0: cols[0], i1: cols[1], far, near }
        return new Promise<void>((resolve, reject) => {
          if (this.broken) return reject(this.broken)
          const failed = (e: unknown) => reject(e instanceof Error ? e : new Error(`a light worker stopped (${e})`))
          worker.once('message', () => {
            worker.off('error', failed)
            worker.off('exit', failed)
            resolve()
          })
          worker.once('error', failed)
          worker.once('exit', failed)
          worker.postMessage(job)
        })
      }),
    )
    return new Uint8Array(light)
  }

  /** Stops the workers. */
  async close() {
    await Promise.all(this.workers.map(worker => worker.terminate()))
  }
}

/** What every level is baked from: the theatre, its projection, its lowest ground, its lakes, the forests. */
interface Sources {
  t: Theatre
  proj: ReturnType<typeof projection>
  low: number
  rings: Pt[][]
  forest: ForestField
}

/** The theatre's lakes as rings of points. */
function lakeRings(t: Theatre): Pt[][] {
  return t.lakes.map(flat => {
    const ring: Pt[] = []
    for (let k = 0; k < flat.length; k += 2) ring.push([flat[k], flat[k + 1]])
    return ring
  })
}

/**
 * The coarse shape of the whole map (the first of COARSE_CELLS that divides it, sampled at COARSE_ZOOM, the lakes
 * sunk), which a block's light reads past where its own shape is exact (the sun's rays reach 60 km): small for any
 * map (a continent's is a few thousand nodes a side).
 */
async function coarseShape(src: Sources): Promise<SharedShape> {
  const { t, proj, low } = src
  const cell = COARSE_CELLS.find(c => (2 * t.frame.halfX) % c === 0 && (2 * t.frame.halfZ) % c === 0)
  if (!cell) throw new Error(`no coarse cell (${COARSE_CELLS.join(', ')} m) divides the frame`)
  const grid: Grid = { ...frameGrid(t.frame, cell), cell, x0: -t.frame.halfX, z0: -t.frame.halfZ }
  const heights = despiked(
    await sampleGrid(proj, COARSE_ZOOM, grid.x0, grid.z0, cell, grid.nx, grid.nz),
    grid.nx,
    grid.nz,
  )
  const shape = buildShape(heights, grid, { ...SHAPE, low })
  sinkLakes(shape, lakeDistance(src.rings, grid, LAKE_BLUR_M), SINK_WIDTH_M, SINK)
  const shared = new SharedArrayBuffer(shape.byteLength)
  new Float32Array(shared).set(shape)
  return { shape: shared, g: grid }
}

/**
 * A block of a level baked: its heights (sampled at `zoom`), shape, lakes and forest on its nodes and its margin's,
 * exact on its own nodes and out to the sky's reach (the margin covers every step's: the shape's blurs, the lakes'
 * distance and its blur, the sky's horizon), and its light on its own nodes, the sun's rays reading the coarse shape
 * past the margin. Returns the bake (a block of the level) and its heights and lakes' distance for the fields.
 */
async function bakeBlock(
  src: Sources,
  level: { cell: number; zoom: number; nx: number; nz: number },
  block: Block,
  pool: LightPool,
  far: SharedShape,
  withFields: boolean,
): Promise<{ bake: LevelBake; heights?: Float32Array; lakeD?: Float32Array }> {
  const { t, proj, low } = src
  const { cell } = level
  const b = block.baked
  const grid: Grid = {
    nx: b.i1 - b.i0,
    nz: b.j1 - b.j0,
    cell,
    x0: -t.frame.halfX + b.i0 * cell,
    z0: -t.frame.halfZ + b.j0 * cell,
  }
  const place = { i0: b.i0, j0: b.j0, nx: level.nx, nz: level.nz }
  const sampled = await sampleGrid(proj, level.zoom, grid.x0, grid.z0, cell, grid.nx, grid.nz)
  const heights = despiked(sampled, grid.nx, grid.nz)
  const shape = buildShape(heights, grid, { ...SHAPE, low }, place)
  const lakeD = lakeDistance(src.rings, grid, LAKE_BLUR_M)
  sinkLakes(shape, lakeD, SINK_WIDTH_M, SINK)
  const forest = resampleField(src.forest, cell, grid.nx, grid.nz, b.i0, b.j0)
  const o = block.own
  // the block read out to its whole span, the far shape past it: measured, its margin's shape past the 10.5 km where it
  // is exact is still far nearer the truth than the coarse shape (the sun within 1 level of the whole level's bake;
  // read from the coarse shape past 10.5 km instead, up to 255 levels off at a few hundred nodes: docs/plans/active/
  // europe.md)
  const near: Rect = {
    x0: grid.x0,
    z0: grid.z0,
    x1: grid.x0 + (grid.nx - 1) * cell,
    z1: grid.z0 + (grid.nz - 1) * cell,
  }
  const light = await pool.bake(shape, grid, far, near, [o.j0 - b.j0, o.j1 - b.j0], [o.i0 - b.i0, o.i1 - b.i0])
  const bake: LevelBake = { grid, shape, light, forest, place }
  return withFields ? { bake, heights, lakeD } : { bake }
}

/**
 * One level baked block by block (each its tiles' worth with a margin), its tiles written as each block is done, and
 * its fields when it is the level they lie on (from its blocks' own heights and lakes' distance, put together).
 */
async function bakeLevel(
  src: Sources,
  levelIndex: number,
  cell: number,
  zoom: number,
  pool: LightPool,
  far: SharedShape,
  dir: string,
  prototypeDir: string | undefined,
): Promise<{ nx: number; nz: number; written: Written; fields?: Plane[] }> {
  const { nx, nz } = frameGrid(src.t.frame, cell)
  const margin = Math.ceil(MARGIN_M / cell)
  const withFields = levelIndex === FIELDS_LEVEL
  const heights = withFields ? new Float32Array(nx * nz) : null
  const lakeD = withFields ? new Float32Array(nx * nz) : null
  const written: Written = { tiles: 0, bytes: 0, prototype: 0 }
  for (const block of levelBlocks(nx, nz, SIZE, BLOCK_TILES, margin)) {
    const baked = await bakeBlock(src, { cell, zoom, nx, nz }, block, pool, far, withFields)
    if (heights && lakeD && baked.heights && baked.lakeD) {
      copyOwn(block, { heights: baked.heights, lakeD: baked.lakeD }, nx, heights, lakeD)
    }
    const tiles: Tile[] = []
    for (let row = block.tiles.r0; row < block.tiles.r1; row++) {
      for (let column = block.tiles.c0; column < block.tiles.c1; column++) {
        tiles.push(cutTile(baked.bake, { level: levelIndex, column, row }, SIZE, SCALE, BASE))
      }
    }
    await writeTiles(dir, tiles, written, prototypeDir)
  }
  const { tilesX, tilesZ } = levelLayout(nx, nz, SIZE)
  if (written.tiles !== tilesX * tilesZ) {
    throw new Error(`level ${levelIndex}: ${written.tiles} tiles of ${tilesX * tilesZ}`)
  }
  const grid: Grid = { nx, nz, cell, x0: -src.t.frame.halfX, z0: -src.t.frame.halfZ }
  const fields = heights && lakeD ? fieldsOf(src, grid, heights, lakeD) : undefined
  return { nx, nz, written, fields }
}

/** A block's own nodes' heights and lakes' distance copied into the whole level's arrays. */
function copyOwn(
  block: Block,
  baked: { heights: Float32Array; lakeD: Float32Array },
  nx: number,
  heights: Float32Array,
  lakeD: Float32Array,
) {
  const b = block.baked
  const o = block.own
  const bw = b.i1 - b.i0
  for (let j = o.j0; j < o.j1; j++) {
    const from = (j - b.j0) * bw + (o.i0 - b.i0)
    heights.set(baked.heights.subarray(from, from + (o.i1 - o.i0)), j * nx + o.i0)
    lakeD.set(baked.lakeD.subarray(from, from + (o.i1 - o.i0)), j * nx + o.i0)
  }
}

/**
 * The far level's fields (src/render/campaign/fields.ts): the lakes' mask (LAKE_RES texels a cell) and distance, the
 * offsets to the high roads, the country roads and the rivers of rank RIVER_RANK or larger, the contours' heights
 * (stored from the lowest of them, a whole step below).
 */
function fieldsOf(src: Sources, grid: Grid, heights: Float32Array, lakeD: Float32Array): Plane[] {
  const { t } = src
  const { nx, nz } = grid
  const mask = lakeMask(src.rings, grid, LAKE_RES)
  const lines = (name: string, of: number[][]): Plane => {
    const values = lineOffsets(of, grid, LINE_REACH)
    return { name, kind: 'bytes', w: nx - 1, h: nz - 1, channels: 2, values }
  }
  const contour = blur(heights, nx, nz, CONTOUR_SMOOTH)
  const contourFrom = Math.floor(lowest(contour) / CONTOUR_STEP) * CONTOUR_STEP
  return [
    { name: 'lakes', kind: 'bytes', w: mask.w, h: mask.h, channels: 1, values: mask.data },
    quantise('lakeD', nx, nz, lakeD, LAKE_D_STEP, LAKE_D_FROM),
    lines(
      'high',
      t.roads.filter(r => r.kind === 'high').map(r => r.p),
    ),
    lines(
      'country',
      t.roads.filter(r => r.kind !== 'high').map(r => r.p),
    ),
    lines(
      'rivers',
      t.rivers.filter(r => r.rank <= RIVER_RANK).map(r => r.p),
    ),
    quantise('contour', nx, nz, contour, CONTOUR_STEP, contourFrom),
  ]
}

/**
 * The labels the page draws: the data file's towns (names, sizes, fortresses) and regions (names, angles), placed
 * through the theatre's projection (as tools/campaign-theatre.ts placed them for the roads: from the data file itself,
 * so a town moved or a region renamed there is lettered where it now is), and the theatre's named rivers, their points
 * thinned to every other one (the last kept), as the prototype projects them for their names. Throws when the data
 * file's frame is not the theatre's.
 */
function labelsOf(t: Theatre, data: Data, proj: ReturnType<typeof projection>): LabelsFile {
  const same = (['lat0', 'lon0', 'halfX', 'halfZ'] as const).every(k => data.frame[k] === t.frame[k])
  if (!same) throw new Error("the data file's frame is not the theatre's: run tools/campaign-theatre.ts")
  const towns = data.towns.map(town => {
    const [x, z] = proj.forward(town.lat, town.lon)
    return { id: town.id, name: town.name, size: town.size, fort: town.fort ?? false, x, z }
  })
  const regions = data.regions.map(r => {
    const [x, z] = proj.forward(r.lat, r.lon)
    return { name: r.name, angle: r.angle, x, z }
  })
  // the rivers the page draws (rank RIVER_RANK or larger), not a name where no river is
  const rivers = t.rivers
    .filter(r => r.name && r.rank <= RIVER_RANK)
    .map(r => {
      const p: number[] = []
      for (let i = 0; i < r.p.length; i += 4) p.push(r.p[i], r.p[i + 1])
      const n = r.p.length
      if (n >= 2 && (n - 2) % 4 !== 0) p.push(r.p[n - 2], r.p[n - 1])
      return { name: RIVER_NAMES[r.name] ?? r.name, rank: r.rank, p }
    })
  return { towns, regions, rivers }
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

// as many deflates at once as libuv's pool has threads (its default 4 when the variable is unset or not a count, 1024
// at most as libuv)
const WRITERS = Math.min(1024, Math.max(1, Math.floor(Number(process.env.UV_THREADPOOL_SIZE)) || 4))

/** The tiles written so far, and their bytes on disk in each output. */
interface Written {
  tiles: number
  bytes: number
  prototype: number
}

/**
 * Writes tiles under `dir`, deflated on libuv's thread pool and flushed to the disk, and, given `prototypeDir`, the
 * prototype's tiles there too, from the same cut; counts them into `written`.
 */
async function writeTiles(dir: string, tiles: Tile[], written: Written, prototypeDir?: string) {
  fs.mkdirSync(dir, { recursive: true })
  if (prototypeDir) fs.mkdirSync(prototypeDir, { recursive: true })
  const queue = tiles.values()
  const worker = async () => {
    for (const tile of queue) {
      const name = `t-${tile.column}-${tile.row}`
      const packed = await deflate(packTile(tile), { level: 9 })
      await writeFlushed(path.join(dir, `${name}.bin`), packed)
      written.tiles++
      written.bytes += packed.length
      if (prototypeDir) {
        const js = prototypeTile(tile)
        await writeFlushed(path.join(prototypeDir, `${name}.js`), js)
        written.prototype += js.length
      }
    }
  }
  await Promise.all(Array.from({ length: WRITERS }, worker))
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
    sinkWidthM: SINK_WIDTH_M,
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
    sinkWidthM: SINK_WIDTH_M,
    woodBoxM: WOOD_BOX_M,
    forestCell: FIELD_CELL,
    forestLevelPx: WORLDCOVER_LEVEL_PX,
    lakeRes: LAKE_RES,
    lineReach: LINE_REACH,
    riverRank: RIVER_RANK,
    contourSmooth: CONTOUR_SMOOTH,
  }
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`

async function main() {
  const t0 = performance.now()
  // resolved, so a path given with a trailing slash names the directory, not a place inside it
  const theatreFile = process.argv[2] ?? 'scratch/campaign-1805.js'
  const out = path.resolve(process.argv[3] ?? 'scratch/campaign')
  const prototypeOut = path.resolve(process.argv[4] ?? 'scratch/campaign-tiles')
  const t = loadTheatre(theatreFile)
  // the data file read and checked first: a bad one stops the run before minutes of baking, not after
  const data = loadData()
  if (!(['lat0', 'lon0', 'halfX', 'halfZ'] as const).every(k => data.frame[k] === t.frame[k])) {
    throw new Error("the data file's frame is not the theatre's: run tools/campaign-theatre.ts")
  }
  const proj = projection(t.frame.lat0, t.frame.lon0)
  // the level the fields lie on must be one of the levels: the manifest names their file
  if (!LEVELS[FIELDS_LEVEL]) throw new Error(`the fields' level ${FIELDS_LEVEL} is not one of the ${LEVELS.length}`)
  const low = lowest(theatreHeights(t))
  const src: Sources = { t, proj, low, rings: lakeRings(t), forest: await forestField(t.frame, proj) }
  // a directory of its own in each output, live once its manifest and meta file are written: a failed run leaves the
  // last builds as they were
  const build = startBuild(out)
  const prototypeBuild = startBuild(prototypeOut)
  const levels: Level[] = []
  let prototypeMeta = {}
  const pool = new LightPool()
  // the workers stopped however the bake ends: a failure stops them all, none left baking or holding the run open
  try {
    const coarseStart = performance.now()
    const far = await coarseShape(src)
    console.log(
      `coarse shape: ${far.g.nx} × ${far.g.nz} nodes at ${far.g.cell} m, ${Math.round(performance.now() - coarseStart)} ms`,
    )
    for (const [level, { cell, zoom }] of LEVELS.entries()) {
      const start = performance.now()
      // the close level for the prototype too
      const forPrototype = level === LEVELS.length - 1 ? path.join(prototypeOut, prototypeBuild) : undefined
      const baked = await bakeLevel(src, level, cell, zoom, pool, far, path.join(out, build, `l${level}`), forPrototype)
      const { nx, nz, written } = baked
      const layout = levelLayout(nx, nz, SIZE)
      levels.push({ cell, nx, nz, ...layout, scale: SCALE, base: BASE, zoom, path: `${build}/l${level}/t-{i}-{j}.bin` })
      const ms = Math.round(performance.now() - start)
      const tiles = layout.tilesX * layout.tilesZ
      console.log(`level ${level}: ${nx} × ${nz} nodes at ${cell} m, ${tiles} tiles, ${mb(written.bytes)}, ${ms} ms`)
      if (baked.fields) {
        const fieldsStart = performance.now()
        const packed = await deflate(packFields(baked.fields), { level: 9 })
        await writeFlushed(path.join(out, build, FIELDS_FILE), packed)
        console.log(`fields: ${mb(packed.length)}, packed in ${Math.round(performance.now() - fieldsStart)} ms`)
      }
      if (forPrototype) {
        console.log(`prototype tiles: ${mb(written.prototype)}`)
        prototypeMeta = { cell, nx, nz, ...layout, scale: SCALE, params: prototypeParams(), build: prototypeBuild }
      }
    }
  } finally {
    await pool.close()
  }
  const labels = labelsOf(t, data, proj)
  await writeFlushed(path.join(out, build, LABELS_FILE), JSON.stringify(labels))
  console.log(`labels: ${labels.towns.length} towns, ${labels.regions.length} regions, ${labels.rivers.length} rivers`)
  const manifest: Manifest = {
    format: MANIFEST_FORMAT,
    build,
    frame: t.frame,
    params: params(src.low),
    levels,
    fields: { level: FIELDS_LEVEL, path: `${build}/${FIELDS_FILE}` },
    labels: `${build}/${LABELS_FILE}`,
    credit: t.credit,
  }
  // the builds replaced, kept for a page still reading them
  const last = liveBuild(out, MANIFEST)
  const prototypeLast = liveBuild(prototypeOut, META)
  commitBuild(out, build, MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  commitBuild(prototypeOut, prototypeBuild, META, `window.CAMPAIGN_TILES = ${JSON.stringify(prototypeMeta)}\n`)
  const removed = [...pruneBuilds(out, MANIFEST, [last]), ...pruneBuilds(prototypeOut, META, [prototypeLast])]
  console.log(
    `${out}/${build}: built on ${os.cpus().length} cores in ${Math.round(performance.now() - t0)} ms, ${removed.length} older build(s) removed`,
  )
}

if (isMainThread) {
  await main()
} else if (workerData === 'light') {
  // a light worker: bakes the bands it is sent until it is stopped
  parentPort!.on('message', (job: Job) => {
    const far = { shape: new Float32Array(job.far.shape), g: job.far.g }
    const out = new Uint8Array(job.light)
    bakeLightRows(new Float32Array(job.shape), job.grid, job.sun, out, job.j0, job.j1, far, job.i0, job.i1, job.near)
    parentPort!.postMessage('done')
  })
}
