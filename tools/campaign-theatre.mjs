// Builds the campaign map prototype's theatre (docs/plans/active/k1-theatre-look.md) from the hand-written data file
// prototypes/campaign-1805.data.js, into a generated .js under scratch/ (git-ignored, never committed):
//   window.THEATRE = { frame, cell, nx, nz, h, rivers, lakes, roads, credit }
// - h: heights in whole metres on a `cell` grid (250 m by default) in a Lambert azimuthal equal-area projection
//   centred on the frame, base64 of little-endian Int16, the south row first. From the AWS terrain tiles (Terrarium
//   PNGs at zoom 9, about 200 m a pixel here; built from SRTM, GMTED2010 and EU-DEM), cached under scratch/terrarium/.
// - rivers, lakes: Natural Earth's 10 m rivers (with its European supplement) and lakes, public domain, cached under
//   scratch/natural-earth/, clipped to the frame and projected; points as flat [x, z, x, z, ...] arrays in metres.
// - roads: each road of the data file routed over the heights: the cheapest path on a 1 km grid, a slope costing
//   more than its distance, lakes closed, then simplified and smoothed. Its length in metres comes with it.
// Usage: node tools/campaign-theatre.mjs [cell out]
//   default: 250 scratch/campaign-1805.js
// Open: prototypes/campaign-map.html (it reads this default output; ?theatre= another path, relative to the page)
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import zlib from 'node:zlib'

const DATA_FILE = 'prototypes/campaign-1805.data.js'
const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const TILE_ZOOM = 9
const TILE_SIZE = 256
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
const NE_FILES = ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_lakes', 'ne_10m_lakes_europe']
const CACHE = 'scratch'
// the authalic sphere's radius, in metres
const EARTH_R = 6371007.2
// the road router's grid, in metres, and the slope at which a step costs twice its length
const ROUTE_CELL = 1000
const ROUTE_SLOPE = 0.04

const cell = Number(process.argv[2] ?? 250)
const out = process.argv[3] ?? 'scratch/campaign-1805.js'
if (!Number.isFinite(cell) || cell < 50 || cell > 2000) {
  console.error('usage: node tools/campaign-theatre.mjs [cell out] (a cell of 50 to 2000 metres)')
  process.exit(2)
}

/** The hand-written theatre: the data file run with a stand-in `window`. */
function loadData() {
  const context = { window: {} }
  vm.runInNewContext(fs.readFileSync(DATA_FILE, 'utf8'), context, { filename: DATA_FILE })
  const data = context.window.CAMPAIGN_1805
  if (!data?.frame || !Array.isArray(data.towns) || !Array.isArray(data.roads)) {
    throw new Error(`${DATA_FILE} does not set window.CAMPAIGN_1805 with a frame, towns and roads`)
  }
  return data
}

/**
 * The frame's projection: Lambert azimuthal equal-area on a sphere, centred on (lat0, lon0). x runs east and z north,
 * in metres from the centre.
 */
function projection(lat0, lon0) {
  const rad = Math.PI / 180
  const sin0 = Math.sin(lat0 * rad)
  const cos0 = Math.cos(lat0 * rad)

  /** Degrees to the map's metres, as [x, z]. */
  function forward(lat, lon) {
    const phi = lat * rad
    const dLon = (lon - lon0) * rad
    const cosC = sin0 * Math.sin(phi) + cos0 * Math.cos(phi) * Math.cos(dLon)
    const k = Math.sqrt(2 / (1 + cosC))
    const x = EARTH_R * k * Math.cos(phi) * Math.sin(dLon)
    const z = EARTH_R * k * (cos0 * Math.sin(phi) - sin0 * Math.cos(phi) * Math.cos(dLon))
    return [x, z]
  }

  /** The map's metres to degrees, as [lat, lon]. */
  function inverse(x, z) {
    const rho = Math.hypot(x, z)
    if (rho < 1e-9) return [lat0, lon0]
    const c = 2 * Math.asin(rho / (2 * EARTH_R))
    const sinC = Math.sin(c)
    const cosC = Math.cos(c)
    const lat = Math.asin(cosC * sin0 + (z * sinC * cos0) / rho)
    const lon = lon0 * rad + Math.atan2(x * sinC, rho * cos0 * cosC - z * sin0 * sinC)
    return [lat / rad, lon / rad]
  }

  return { forward, inverse }
}

/** A file from the cache, or fetched and cached. */
async function cached(file, url) {
  if (fs.existsSync(file)) return fs.readFileSync(file)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes)
  return bytes
}

/** The Paeth predictor of the PNG filters. */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/**
 * Decodes an 8-bit RGB or RGBA PNG, not interlaced (what the terrain tiles are), into its pixels' bytes.
 * @returns {{ width: number, height: number, channels: number, pixels: Uint8Array }}
 */
function decodePng(bytes) {
  let pos = 8
  let width = 0
  let height = 0
  let channels = 0
  const idat = []
  while (pos < bytes.length) {
    const length = bytes.readUInt32BE(pos)
    const type = bytes.toString('latin1', pos + 4, pos + 8)
    const body = bytes.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [depth, colour, , , interlace] = body.subarray(8, 13)
      channels = { 2: 3, 6: 4 }[colour] ?? 0
      if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG: depth ${depth}, colour ${colour}`)
    } else if (type === 'IDAT') {
      idat.push(body)
    }
    pos += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[row + i - channels] : 0
      const up = y > 0 ? pixels[row - stride + i] : 0
      const upLeft = y > 0 && i >= channels ? pixels[row - stride + i - channels] : 0
      const predict = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter]
      if (predict === undefined) throw new Error(`bad PNG filter ${filter}`)
      pixels[row + i] = (raw[src + i] + predict) & 255
    }
  }
  return { width, height, channels, pixels }
}

/** Degrees to the global Web Mercator pixel at the tiles' zoom, as [px, py]. */
function mercatorPixel(lat, lon) {
  const world = TILE_SIZE * 2 ** TILE_ZOOM
  const phi = (lat * Math.PI) / 180
  const px = ((lon + 180) / 360) * world
  const py = ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * world
  return [px, py]
}

/** Fetches the terrain tiles over the given pixel span, a few at a time, as a map from "tx,ty" to heights. */
async function loadTiles(px0, py0, px1, py1) {
  const keys = []
  for (let ty = Math.floor(py0 / TILE_SIZE); ty <= Math.floor(py1 / TILE_SIZE); ty++) {
    for (let tx = Math.floor(px0 / TILE_SIZE); tx <= Math.floor(px1 / TILE_SIZE); tx++) keys.push([tx, ty])
  }
  const tiles = new Map()
  let next = 0
  async function worker() {
    while (next < keys.length) {
      const [tx, ty] = keys[next++]
      const rel = `${TILE_ZOOM}/${tx}/${ty}.png`
      const png = decodePng(await cached(path.join(CACHE, 'terrarium', rel), `${TILE_URL}/${rel}`))
      const h = new Float32Array(TILE_SIZE * TILE_SIZE)
      for (let k = 0; k < h.length; k++) {
        const o = k * png.channels
        h[k] = png.pixels[o] * 256 + png.pixels[o + 1] + png.pixels[o + 2] / 256 - 32768
      }
      tiles.set(`${tx},${ty}`, h)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  console.log(`terrain: ${keys.length} tiles at zoom ${TILE_ZOOM}`)
  return tiles
}

/** The height at a global pixel position, bilinear over the tiles' pixel centres. */
function sampleTiles(tiles, px, py) {
  const fx = px - 0.5
  const fy = py - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const u = fx - x0
  const v = fy - y0
  const at = (x, y) => {
    const tile = tiles.get(`${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`)
    const ix = ((x % TILE_SIZE) + TILE_SIZE) % TILE_SIZE
    const iy = ((y % TILE_SIZE) + TILE_SIZE) % TILE_SIZE
    return tile[iy * TILE_SIZE + ix]
  }
  const top = at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u
  const bottom = at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u
  return top * (1 - v) + bottom * v
}

/** The heights on the frame's grid, in whole metres, the south row first. */
async function buildHeights(frame, proj) {
  const nx = Math.round((2 * frame.halfX) / cell) + 1
  const nz = Math.round((2 * frame.halfZ) / cell) + 1
  // the pixel span of the frame: its corners and edge midpoints, with a margin of two pixels
  let px0 = Infinity
  let py0 = Infinity
  let px1 = -Infinity
  let py1 = -Infinity
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 0, 1]) {
      const [lat, lon] = proj.inverse(sx * frame.halfX, sz * frame.halfZ)
      const [px, py] = mercatorPixel(lat, lon)
      px0 = Math.min(px0, px - 2)
      py0 = Math.min(py0, py - 2)
      px1 = Math.max(px1, px + 2)
      py1 = Math.max(py1, py + 2)
    }
  }
  const tiles = await loadTiles(px0, py0, px1, py1)
  const h = new Int16Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [lat, lon] = proj.inverse(-frame.halfX + i * cell, -frame.halfZ + j * cell)
      const [px, py] = mercatorPixel(lat, lon)
      h[j * nx + i] = Math.round(sampleTiles(tiles, px, py))
    }
  }
  return { nx, nz, h }
}

/** Douglas–Peucker over flat [x, z] points, keeping points further than `tol` metres from the simplified line. */
function simplify(points, tol) {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, az] = points[a]
    const [bx, bz] = points[b]
    const len = Math.hypot(bx - ax, bz - az) || 1
    let far = -1
    let farD = tol
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((bx - ax) * (az - points[k][1]) - (ax - points[k][0]) * (bz - az)) / len
      if (d > farD) {
        far = k
        farD = d
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return points.filter((_, k) => keep[k])
}

/** [[x, z], ...] to a flat array of whole metres. */
const flat = points => points.flatMap(([x, z]) => [Math.round(x), Math.round(z)])

/** The lines of a GeoJSON geometry, each a list of [lon, lat]. */
function geometryLines(geometry) {
  if (!geometry) return []
  if (geometry.type === 'LineString') return [geometry.coordinates]
  if (geometry.type === 'MultiLineString') return geometry.coordinates
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map(poly => poly[0])
  return []
}

/** The frame with a margin, for clipping. */
const inFrame = (frame, [x, z], margin) => Math.abs(x) <= frame.halfX + margin && Math.abs(z) <= frame.halfZ + margin

/** Natural Earth's rivers and lakes over the frame, projected and simplified. */
async function buildWater(frame, proj) {
  const margin = 20000
  const rivers = []
  const lakes = []
  for (const name of NE_FILES) {
    const json = JSON.parse(
      await cached(path.join(CACHE, 'natural-earth', `${name}.geojson`), `${NE_URL}/${name}.geojson`),
    )
    const isLake = name.includes('lakes')
    for (const feature of json.features) {
      const props = feature.properties ?? {}
      if (!isLake && !/river/i.test(props.featurecla ?? '')) continue
      for (const line of geometryLines(feature.geometry)) {
        const points = line.map(([lon, lat]) => proj.forward(lat, lon))
        if (isLake) {
          if (points.some(p => inFrame(frame, p, 0))) lakes.push(flat(simplify(points, cell / 2)))
          continue
        }
        // a river: the runs of its points inside the frame (with the margin), each run a line of its own
        let run = []
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

/** Whether a point lies inside a flat [x, z, ...] ring (even–odd rule). */
function inRing(ring, x, z) {
  let inside = false
  for (let a = 0, b = ring.length - 2; a < ring.length; b = a, a += 2) {
    const [ax, az, bx, bz] = [ring[a], ring[a + 1], ring[b], ring[b + 1]]
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}

/** A binary min-heap of grid indices keyed by cost. */
class Heap {
  constructor() {
    this.items = []
    this.keys = []
  }

  get size() {
    return this.items.length
  }

  /** Adds an item with its key. */
  push(item, key) {
    const { items, keys } = this
    let k = items.length
    items.push(item)
    keys.push(key)
    while (k > 0) {
      const parent = (k - 1) >> 1
      if (keys[parent] <= key) break
      items[k] = items[parent]
      keys[k] = keys[parent]
      k = parent
    }
    items[k] = item
    keys[k] = key
  }

  /** Removes and returns the item with the lowest key. */
  pop() {
    const { items, keys } = this
    const top = items[0]
    const lastItem = items.pop()
    const lastKey = keys.pop()
    if (!items.length) return top
    let k = 0
    for (;;) {
      let child = 2 * k + 1
      if (child >= items.length) break
      if (child + 1 < items.length && keys[child + 1] < keys[child]) child++
      if (keys[child] >= lastKey) break
      items[k] = items[child]
      keys[k] = keys[child]
      k = child
    }
    items[k] = lastItem
    keys[k] = lastKey
    return top
  }
}

/** The router's grid: heights every ROUTE_CELL metres and the cells closed by lakes. */
function routeGrid(frame, heights, lakes) {
  const step = Math.max(1, Math.round(ROUTE_CELL / cell))
  const gx = Math.floor((heights.nx - 1) / step) + 1
  const gz = Math.floor((heights.nz - 1) / step) + 1
  const h = new Float32Array(gx * gz)
  const closed = new Uint8Array(gx * gz)
  for (let j = 0; j < gz; j++) {
    for (let i = 0; i < gx; i++) h[j * gx + i] = heights.h[j * step * heights.nx + i * step]
  }
  const size = step * cell
  for (const ring of lakes) {
    let x0 = Infinity
    let z0 = Infinity
    let x1 = -Infinity
    let z1 = -Infinity
    for (let k = 0; k < ring.length; k += 2) {
      x0 = Math.min(x0, ring[k])
      x1 = Math.max(x1, ring[k])
      z0 = Math.min(z0, ring[k + 1])
      z1 = Math.max(z1, ring[k + 1])
    }
    const i0 = Math.max(0, Math.ceil((x0 + frame.halfX) / size))
    const i1 = Math.min(gx - 1, Math.floor((x1 + frame.halfX) / size))
    const j0 = Math.max(0, Math.ceil((z0 + frame.halfZ) / size))
    const j1 = Math.min(gz - 1, Math.floor((z1 + frame.halfZ) / size))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (inRing(ring, -frame.halfX + i * size, -frame.halfZ + j * size)) closed[j * gx + i] = 1
      }
    }
  }
  return { gx, gz, size, h, closed }
}

/**
 * The cheapest path between two points on the router's grid (A*, eight neighbours): a step costs its length times
 * 1 + (slope / ROUTE_SLOPE)², so a road climbs only where it must. Returns [x, z] points in metres.
 */
function route(frame, grid, from, to) {
  const { gx, gz, size, h, closed } = grid
  const cellOf = ([x, z]) => {
    const i = Math.min(gx - 1, Math.max(0, Math.round((x + frame.halfX) / size)))
    const j = Math.min(gz - 1, Math.max(0, Math.round((z + frame.halfZ) / size)))
    return j * gx + i
  }
  const start = cellOf(from)
  const goal = cellOf(to)
  const gi = goal % gx
  const gj = Math.floor(goal / gx)
  const cost = new Float64Array(gx * gz).fill(Infinity)
  const prev = new Int32Array(gx * gz).fill(-1)
  const heap = new Heap()
  cost[start] = 0
  heap.push(start, 0)
  while (heap.size) {
    const k = heap.pop()
    if (k === goal) break
    const i = k % gx
    const j = Math.floor(k / gx)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ni = i + di
        const nj = j + dj
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= gx || nj >= gz) continue
        const n = nj * gx + ni
        if (closed[n] && n !== goal) continue
        const len = Math.hypot(di, dj) * size
        const slope = (h[n] - h[k]) / len
        const c = cost[k] + len * (1 + (slope / ROUTE_SLOPE) ** 2)
        if (c < cost[n]) {
          cost[n] = c
          prev[n] = k
          heap.push(n, c + Math.hypot(ni - gi, nj - gj) * size)
        }
      }
    }
  }
  if (prev[goal] < 0 && goal !== start) throw new Error('no route')
  const points = []
  for (let k = goal; k >= 0; k = prev[k]) {
    points.push([-frame.halfX + (k % gx) * size, -frame.halfZ + Math.floor(k / gx) * size])
  }
  points.reverse()
  points[0] = from
  points[points.length - 1] = to
  return points
}

/** Chaikin's corner cutting, `rounds` times, the ends kept. */
function smooth(points, rounds) {
  let P = points
  for (let r = 0; r < rounds; r++) {
    const Q = [P[0]]
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k]
      const [bx, bz] = P[k + 1]
      Q.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz])
    }
    Q.push(P[P.length - 1])
    P = Q
  }
  return P
}

/** Every road of the data file, routed over the heights. */
function buildRoads(data, proj, heights, lakes) {
  const towns = new Map(data.towns.map(t => [t.id, proj.forward(t.lat, t.lon)]))
  const grid = routeGrid(data.frame, heights, lakes)
  return data.roads.map(([a, b, kind]) => {
    if (!towns.has(a) || !towns.has(b)) throw new Error(`road ${a}–${b}: unknown town`)
    const path = smooth(simplify(route(data.frame, grid, towns.get(a), towns.get(b)), grid.size * 0.4), 2)
    let length = 0
    for (let k = 1; k < path.length; k++) length += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1])
    return { a, b, kind, length: Math.round(length), p: flat(path) }
  })
}

async function main() {
  const t0 = performance.now()
  const data = loadData()
  const { frame } = data
  const proj = projection(frame.lat0, frame.lon0)
  const heights = await buildHeights(frame, proj)
  const water = await buildWater(frame, proj)
  const roads = buildRoads(data, proj, heights, water.lakes)
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
    rivers: water.rivers,
    lakes: water.lakes,
    roads,
    credit: 'Heights: AWS Terrain Tiles (SRTM, GMTED2010, EU-DEM © Copernicus). Water: Natural Earth.',
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
