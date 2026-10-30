// Builds the campaign map prototype's theatre (docs/plans/active/k1-theatre-look.md) from the hand-written data file
// prototypes/campaign-1805.data.js, into a generated .js under scratch/ (git-ignored, never committed):
//   window.THEATRE = { frame, cell, nx, nz, h, forest, forestBlurM, towns, regions, rivers, lakes, roads, credit }
// - h: heights in whole metres on a `cell` grid (250 m by default) in a Lambert azimuthal equal-area projection
//   centred on the frame, nodes from edge to edge, base64 of little-endian Int16, the south row first. From the AWS
//   terrain tiles (Terrarium PNGs at zoom 9, about 200 m a pixel here; built from SRTM, GMTED2010 and EU-DEM), cached
//   under scratch/terrarium/.
// - towns, regions: the data file's places projected, in metres ({ id: [x, z] }, and [x, z] in the regions' order),
//   so the page draws them where the roads were routed to.
// - rivers, lakes: Natural Earth's 10 m rivers (with its European supplement) and lakes, public domain, cached under
//   scratch/natural-earth/, clipped to the frame and projected; points as flat [x, z, x, z, ...] arrays in metres.
// - roads: each road of the data file routed over the heights: the cheapest path on a 1 km grid, a slope costing
//   more than its distance, lakes closed, then simplified and smoothed. Its length in metres comes with it.
// The finer, offline-baked tiles for the close zoom are tools/campaign-tiles.ts's, which reads this file.
// The pure parts are tools/campaign-theatre-lib.ts.
// Usage: node tools/campaign-theatre.ts [cell out]
//   default: 250 scratch/campaign-1805.js (the cell must divide the frame's extents)
// Open: prototypes/campaign-map.html (it reads this default output; ?theatre= another path, relative to the page)
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {
  frameGrid,
  lineLength,
  projection,
  routeGrid,
  route,
  shapeRoad,
  simplify,
  type Frame,
  type Pt,
} from './campaign-theatre-lib.ts'
import { cached, sampleGrid } from './terrarium.ts'
import { blur } from './campaign-bake.ts'
import { forestCover, WOOD_BLUR_M, WORLDCOVER_CREDIT } from './worldcover.ts'

const DATA_FILE = 'prototypes/campaign-1805.data.js'
const TILE_ZOOM = 9
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
const NE_FILES = ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_lakes', 'ne_10m_lakes_europe']
const CACHE = 'scratch'
// the road router's grid, in metres, and the slope at which a step costs twice its length
const ROUTE_CELL = 1000
const ROUTE_SLOPE = 0.04

/** The hand-written theatre (prototypes/campaign-1805.data.js). */
interface Data {
  frame: Frame
  towns: { id: string; lat: number; lon: number }[]
  roads: [string, string, string][]
  regions: { lat: number; lon: number }[]
}
type Projection = ReturnType<typeof projection>
/** Heights on the frame's grid, in whole metres, the south row first. */
interface Heights {
  nx: number
  nz: number
  h: Int16Array
}

const cell = Number(process.argv[2] ?? 250)
const out = process.argv[3] ?? 'scratch/campaign-1805.js'
// the page draws grids from about 200 m: finer, its lake canvas and textures pass the browser's limits
if (!Number.isFinite(cell) || cell < 200 || cell > 2000) {
  console.error('usage: node tools/campaign-theatre.ts [cell out] (a cell of 200 to 2000 metres)')
  process.exit(2)
}

/** The hand-written theatre: the data file run with a stand-in `window`. */
function loadData(): Data {
  const context: { window: { CAMPAIGN_1805?: Data } } = { window: {} }
  vm.runInNewContext(fs.readFileSync(DATA_FILE, 'utf8'), context, { filename: DATA_FILE })
  const data = context.window.CAMPAIGN_1805
  if (!data?.frame || !Array.isArray(data.towns) || !Array.isArray(data.roads) || !Array.isArray(data.regions)) {
    throw new Error(`${DATA_FILE} does not set window.CAMPAIGN_1805 with a frame, towns, roads and regions`)
  }
  return data
}

/** The heights on the frame's grid, in whole metres, the south row first. */
async function buildHeights(frame: Frame, proj: Projection): Promise<Heights> {
  const { nx, nz } = frameGrid(frame, cell)
  const h = await sampleGrid(proj, TILE_ZOOM, -frame.halfX, -frame.halfZ, cell, nx, nz)
  return { nx, nz, h }
}

/** Points to a flat array of whole metres. */
const flat = (points: Pt[]) => points.flatMap(([x, z]) => [Math.round(x), Math.round(z)])

/** A GeoJSON geometry, as far as this tool reads one. */
interface Geometry {
  type: string
  coordinates: unknown
}

/** The lines of a GeoJSON geometry, each a list of [lon, lat]; for polygons, their outer rings. */
function geometryLines(geometry: Geometry | null): [number, number][][] {
  if (!geometry) return []
  const c = geometry.coordinates
  if (geometry.type === 'LineString') return [c as [number, number][]]
  if (geometry.type === 'MultiLineString') return c as [number, number][][]
  if (geometry.type === 'Polygon') return [(c as [number, number][][])[0]]
  if (geometry.type === 'MultiPolygon') return (c as [number, number][][][]).map(poly => poly[0])
  return []
}

/** Whether a point lies in the frame, grown by a margin in metres. */
const inFrame = (frame: Frame, [x, z]: Pt, margin: number) =>
  Math.abs(x) <= frame.halfX + margin && Math.abs(z) <= frame.halfZ + margin

/** Natural Earth's rivers and lakes over the frame, projected and simplified. Lakes as rings of points. */
async function buildWater(frame: Frame, proj: Projection) {
  const margin = 20000
  const rivers: { name: string; rank: number; p: number[] }[] = []
  const lakes: Pt[][] = []
  for (const name of NE_FILES) {
    const file = path.join(CACHE, 'natural-earth', `${name}.geojson`)
    const json = JSON.parse((await cached(file, `${NE_URL}/${name}.geojson`)).toString('utf8'))
    const isLake = name.includes('lakes')
    for (const feature of json.features) {
      const props = feature.properties ?? {}
      if (!isLake && !/river/i.test(props.featurecla ?? '')) continue
      for (const line of geometryLines(feature.geometry)) {
        const points = line.map(([lon, lat]) => proj.forward(lat, lon))
        if (isLake) {
          if (points.some(p => inFrame(frame, p, 0))) lakes.push(simplify(points, cell / 2))
          continue
        }
        // a river: the runs of its points inside the frame (with the margin), each run a line of its own
        let run: Pt[] = []
        for (const p of [...points, null]) {
          if (p && inFrame(frame, p, margin)) {
            run.push(p)
            continue
          }
          if (run.length >= 2) {
            rivers.push({ name: props.name ?? '', rank: props.scalerank ?? 10, p: flat(simplify(run, cell / 2)) })
          }
          run = []
        }
      }
    }
  }
  console.log(`water: ${rivers.length} river lines, ${lakes.length} lakes`)
  return { rivers, lakes }
}

/** Every road of the data file, routed over the heights. */
function buildRoads(data: Data, towns: Map<string, Pt>, heights: Heights, lakes: Pt[][]) {
  const { frame } = data
  const height = (x: number, z: number) => {
    const i = Math.round((x + frame.halfX) / cell)
    const j = Math.round((z + frame.halfZ) / cell)
    return heights.h[Math.min(heights.nz - 1, j) * heights.nx + Math.min(heights.nx - 1, i)]
  }
  const grid = routeGrid(frame, ROUTE_CELL, height, lakes)
  return data.roads.map(([a, b, kind]) => {
    const from = towns.get(a)
    const to = towns.get(b)
    if (!from || !to) throw new Error(`road ${a}–${b}: unknown town`)
    let routed: Pt[]
    try {
      routed = route(grid, from, to, ROUTE_SLOPE)
    } catch (e) {
      throw new Error(`road ${a}–${b}: ${(e as Error).message}`, { cause: e })
    }
    const shaped = shapeRoad(routed, ROUTE_CELL * 0.4)
    return { a, b, kind, length: Math.round(lineLength(shaped)), p: flat(shaped) }
  })
}

async function main() {
  const t0 = performance.now()
  const data = loadData()
  const { frame } = data
  const proj = projection(frame.lat0, frame.lon0)
  const towns = new Map(data.towns.map(t => [t.id, proj.forward(t.lat, t.lon)]))
  const heights = await buildHeights(frame, proj)
  const water = await buildWater(frame, proj)
  const roads = buildRoads(data, towns, heights, water.lakes)
  let lo = Infinity
  let hi = -Infinity
  for (const v of heights.h) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  const theatre = {
    frame,
    cell,
    nx: heights.nx,
    nz: heights.nz,
    h: Buffer.from(heights.h.buffer).toString('base64'),
    // the tree cover a node, 0–255, the south row first, smoothed over forestBlurM metres (tools/worldcover.ts)
    forest: Buffer.from(
      Uint8Array.from(
        blur(
          await forestCover(proj, -frame.halfX, -frame.halfZ, cell, heights.nx, heights.nz),
          heights.nx,
          heights.nz,
          WOOD_BLUR_M / cell,
        ),
        v => Math.round(v),
      ),
    ).toString('base64'),
    forestBlurM: WOOD_BLUR_M,
    towns: Object.fromEntries([...towns].map(([id, p]) => [id, p.map(Math.round)])),
    regions: data.regions.map(r => proj.forward(r.lat, r.lon).map(Math.round)),
    rivers: water.rivers,
    lakes: water.lakes.map(flat),
    roads,
    credit:
      'Heights: AWS Terrain Tiles (SRTM, GMTED2010, EU-DEM © Copernicus). Water: Natural Earth. ' + WORLDCOVER_CREDIT,
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `window.THEATRE = ${JSON.stringify(theatre)}\n`)
  const ms = Math.round(performance.now() - t0)
  console.log(
    `${out}: ${heights.nx} × ${heights.nz} nodes at ${cell} m, heights ${lo} to ${hi} m, ${roads.length} roads`,
  )
  console.log(`built in ${ms} ms`)
}

await main()
