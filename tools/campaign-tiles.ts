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
  roads: { kind: string; p: number[] }[]
  rivers: { name: string; rank: number; p: number[] }[]
  // the data file's places projected, metres: the towns by id, the regions in the data file's order
  towns: Record<string, [number, number]>
  regions: [number, number][]
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
            // a worker gone without its message (killed, out of memory) would leave the build waiting: after the
            // message, the promise is settled and this does nothing
            worker.on('exit', code => reject(new Error(`a light worker stopped (exit ${code}) before its band`)))
          }),
      ),
    )
  } finally {
    // a failed band stops the others: none is left baking
    await Promise.all(workers.map(worker => worker.terminate()))
  }
  return new Uint8Array(light)
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

/** A level baked, and its fields when it is the level they lie on. */
interface Baked {
  bake: LevelBake
  fields?: Plane[]
}

/**
 * One level baked: its heights (sampled at `zoom`), shape, lakes, light and forest, on a grid spanning the frame (the
 * cell must divide it); with `withFields`, its fields too.
 */
async function bakeLevel(src: Sources, cell: number, zoom: number, withFields: boolean): Promise<Baked> {
  const { t, proj, low } = src
  const { frame } = t
  const grid: Grid = { ...frameGrid(frame, cell), cell, x0: -frame.halfX, z0: -frame.halfZ }
  const sampled = await sampleGrid(proj, zoom, grid.x0, grid.z0, cell, grid.nx, grid.nz)
  const heights = despiked(sampled, grid.nx, grid.nz)
  const shape = buildShape(heights, grid, { ...SHAPE, low })
  const lakeD = lakeDistance(src.rings, grid, LAKE_BLUR_M)
  sinkLakes(shape, lakeD, SINK_WIDTH_M, SINK)
  const forest = resampleField(src.forest, cell, grid.nx, grid.nz)
  // made before the light, so the heights and the lakes' distance are not kept through the tiles' writing
  const fields = withFields ? fieldsOf(src, grid, heights, lakeD) : undefined
  const light = await bakeLight(shape, grid)
  return { bake: { grid, shape, light, forest }, fields }
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
 * The labels the page draws: the data file's towns (names, sizes, fortresses) and regions (names, angles) at the
 * theatre's places for them, and the theatre's named rivers, their points thinned to every other one (the last kept),
 * as the prototype projects them for their names. Throws on a town or region the theatre has no place for (a theatre
 * older than the data file).
 */
function labelsOf(t: Theatre, data: Data): LabelsFile {
  if (data.regions.length !== t.regions.length) {
    throw new Error(
      `${data.regions.length} regions in the data file, ${t.regions.length} placed: run tools/campaign-theatre.ts`,
    )
  }
  const towns = data.towns.map(town => {
    const at = t.towns[town.id]
    if (!at) throw new Error(`the theatre has no place for ${town.id}: run tools/campaign-theatre.ts`)
    return { id: town.id, name: town.name, size: town.size, fort: town.fort ?? false, x: at[0], z: at[1] }
  })
  const regions = data.regions.map((r, k) => ({ name: r.name, angle: r.angle, x: t.regions[k][0], z: t.regions[k][1] }))
  const rivers = t.rivers
    .filter(r => r.name)
    .map(r => {
      const p: number[] = []
      for (let i = 0; i < r.p.length; i += 4) p.push(r.p[i], r.p[i + 1])
      const n = r.p.length
      if (n >= 2 && (n - 2) % 4 !== 0) p.push(r.p[n - 2], r.p[n - 1])
      return { name: RIVER_NAMES[r.name] ?? r.name, rank: r.rank, p }
    })
  return { towns, regions, rivers }
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

// as many deflates at once as libuv's pool has threads (its default 4 when the variable is unset or not a count, 1024
// at most as libuv)
const WRITERS = Math.min(1024, Math.max(1, Math.floor(Number(process.env.UV_THREADPOOL_SIZE)) || 4))

/**
 * Writes a level's tiles under `dir`, deflated on libuv's thread pool and flushed to the disk, and, given
 * `prototypeDir`, the prototype's tiles there too, from the same cut. Returns the tiles written and the bytes on disk
 * of each output; throws unless every tile of the level was written.
 */
async function writeLevel(dir: string, bake: LevelBake, level: number, prototypeDir?: string) {
  fs.mkdirSync(dir, { recursive: true })
  if (prototypeDir) fs.mkdirSync(prototypeDir, { recursive: true })
  const tiles = tilesOf(bake, level)
  const written = { tiles: 0, bytes: 0, prototype: 0 }
  const worker = async () => {
    for (const tile of tiles) {
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
  const layout = levelLayout(bake.grid.nx, bake.grid.nz, SIZE)
  if (written.tiles !== layout.tilesX * layout.tilesZ) {
    throw new Error(`level ${level}: ${written.tiles} tiles written of ${layout.tilesX * layout.tilesZ}`)
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
  for (const [level, { cell, zoom }] of LEVELS.entries()) {
    const start = performance.now()
    const baked = await bakeLevel(src, cell, zoom, level === FIELDS_LEVEL)
    const { bake } = baked
    // the close level for the prototype too
    const forPrototype = level === LEVELS.length - 1 ? path.join(prototypeOut, prototypeBuild) : undefined
    const written = await writeLevel(path.join(out, build, `l${level}`), bake, level, forPrototype)
    const { nx, nz } = bake.grid
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
  const labels = labelsOf(t, loadData())
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
} else {
  const job = workerData as Job
  bakeLightRows(new Float32Array(job.shape), job.grid, job.sun, new Uint8Array(job.light), job.j0, job.j1)
  parentPort!.postMessage('done')
}
