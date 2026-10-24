// Fetches a real terrain crop for the staff map prototype's ?dem= mode (docs/plans/active/real-terrain-proto.md):
// ČÚZK's DMR 4G, the Czech Republic's 5 m bare-ground terrain model (© ČÚZK, open data under CC BY 4.0: attribute
// "ČÚZK, <year>"), in one request to its image service at its native 5 m. The real ground is squeezed by `scale` so a
// battlefield fits the prototype's frame (±2700 × ±1900 m). Writes a generated .js under scratch/ (git-ignored):
//   window.DEM = { nx, nz, cell, tx, tz, h, scale, source, credit, fine: { step, nx, nz, h } }
// h: heights in centimetres on the prototype's 10 m grid, each the mean of its source pixels (so ditches and banks
// narrower than a cell do not alias into bumps), the south row first. fine: a 4 m grid for the relief shading
// (docs/plans/active/relief-shading.md).
// Usage: node tools/dem-fetch.mjs [lat lon scale out]
//   default: Austerlitz, 49.118 16.737 2.5 scratch/dem-austerlitz.js
// Open: prototypes/staff-map.html?style=lit&dem= followed by this file's path relative to the page (also from file://)
import fs from 'node:fs'
import path from 'node:path'

// the prototype's terrain (prototypes/staff-map.html)
const TX = 2700
const TZ = 1900
const CELL = 10
const GX = Math.round((2 * TX) / CELL) + 1
const GZ = Math.round((2 * TZ) / CELL) + 1
// the fine grid for the relief shading, in page metres
const FINE = 4
const FX = Math.round((2 * TX) / FINE) + 1
const FZ = Math.round((2 * TZ) / FINE) + 1

const SERVICE = 'https://ags.cuzk.gov.cz/arcgis/rest/services/3D/dmr4g_wm/ImageServer/exportImage'
const EARTH_R = 6378137

const [lat0 = 49.118, lon0 = 16.737, scale = 2.5] = process.argv.slice(2, 5).map(Number)
const out = process.argv[5] ?? 'scratch/dem-austerlitz.js'
if (![lat0, lon0, scale].every(Number.isFinite) || scale <= 0) {
  console.error('usage: node tools/dem-fetch.mjs [lat lon scale out] (decimal degrees, a positive scale)')
  process.exit(2)
}

// source pixels (5 m) a page cell's side holds: each cell averages K × K of them
const K = Math.max(1, Math.round((scale * CELL) / 5))
// page metres a source pixel spans
const PX = CELL / K

/** The service's request URL for the crop: the page's extent, squeezed, in Web Mercator, at K pixels a cell. */
function requestUrl() {
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const mLat = 111200
  const mercX = lon => (EARTH_R * lon * Math.PI) / 180
  const mercY = lat => EARTH_R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  // cells are areas: their centres sit on the page's -TX + i·CELL nodes, so the crop reaches half a cell further
  const ex = (TX + CELL / 2) * scale
  const ez = (TZ + CELL / 2) * scale
  const bbox = [mercX(lon0 - ex / mLon), mercY(lat0 - ez / mLat), mercX(lon0 + ex / mLon), mercY(lat0 + ez / mLat)]
  const params = new URLSearchParams({
    bbox: bbox.map(v => v.toFixed(2)).join(','),
    bboxSR: '3857',
    imageSR: '3857',
    size: `${GX * K},${GZ * K}`,
    format: 'tiff',
    pixelType: 'F32',
    compression: 'None',
    interpolation: 'RSP_BilinearInterpolation',
    f: 'image',
  })
  return `${SERVICE}?${params}`
}

/**
 * A minimal reader for the uncompressed, one-band float32 TIFF the service returns, in strips or tiles.
 * Returns { width, height, data } with the rows north first, as the TIFF stores them.
 */
function readTiff(buf) {
  // the service answers errors as JSON, even with status 200
  const magic = buf.toString('latin1', 0, 2)
  const isTiff = (magic === 'II' && buf.readUInt16LE(2) === 42) || (magic === 'MM' && buf.readUInt16BE(2) === 42)
  if (!isTiff) {
    throw new Error(`not a TIFF: ${buf.toString('utf8', 0, 300)}`)
  }
  const le = magic === 'II'
  const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const f32 = o => (le ? buf.readFloatLE(o) : buf.readFloatBE(o))

  // the tags: only the SHORT and LONG ones read below (ASCII, RATIONAL, DOUBLE skipped)
  const ifd = u32(4)
  const tags = {}
  for (let i = 0; i < u16(ifd); i++) {
    const e = ifd + 2 + i * 12
    const tag = u16(e)
    const type = u16(e + 2)
    const count = u32(e + 4)
    if (type !== 3 && type !== 4) {
      continue
    }
    const size = type === 3 ? 2 : 4
    const at = count * size <= 4 ? e + 8 : u32(e + 8)
    tags[tag] = Array.from({ length: count }, (_, k) => (type === 3 ? u16(at + k * 2) : u32(at + k * 4)))
  }

  const width = tags[256][0]
  const height = tags[257][0]
  const oneFloatBand =
    tags[259]?.[0] === 1 && tags[258]?.[0] === 32 && tags[339]?.[0] === 3 && (tags[277]?.[0] ?? 1) === 1
  if (width !== GX * K || height !== GZ * K || !oneFloatBand) {
    throw new Error(
      `unexpected TIFF: ${width}×${height}, compression ${tags[259]}, bits ${tags[258]}, ` +
        `sample format ${tags[339]}, samples ${tags[277]} (want uncompressed float32, one band)`,
    )
  }

  const data = new Float32Array(width * height)
  if (tags[322]) {
    // tiles
    const tw = tags[322][0]
    const th = tags[323][0]
    const across = Math.ceil(width / tw)
    tags[324].forEach((offset, t) => {
      const x0 = (t % across) * tw
      const y0 = Math.floor(t / across) * th
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          if (x0 + x < width && y0 + y < height) {
            data[(y0 + y) * width + x0 + x] = f32(offset + (y * tw + x) * 4)
          }
        }
      }
    })
  } else {
    // strips
    const rowsPerStrip = tags[278] ? tags[278][0] : height
    tags[273].forEach((offset, s) => {
      for (let y = 0; y < rowsPerStrip && s * rowsPerStrip + y < height; y++) {
        for (let x = 0; x < width; x++) {
          data[(s * rowsPerStrip + y) * width + x] = f32(offset + (y * width + x) * 4)
        }
      }
    })
  }
  return { width, height, data }
}

/**
 * Marks the pixels without data (outside the country the service returns none) and fills them from their valid
 * neighbours, pass by pass (a lowest-height fill would cut craters). Returns the count and the valid heights' range.
 */
function fillHoles(f, width, height) {
  const valid = v => Number.isFinite(v) && v > -100 && v < 3000
  let bad = 0
  let lo = Infinity
  let hi = -Infinity
  for (let q = 0; q < f.length; q++) {
    if (valid(f[q])) {
      lo = Math.min(lo, f[q])
      hi = Math.max(hi, f[q])
    } else {
      f[q] = NaN
      bad++
    }
  }
  if (bad > f.length * 0.05) {
    throw new Error(`${bad} of ${f.length} source pixels without data (outside the Czech Republic?)`)
  }
  for (let pass = 0, left = bad; left > 0 && pass < 64; pass++) {
    const next = f.slice()
    left = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const q = y * width + x
        if (!Number.isNaN(f[q])) {
          continue
        }
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const inside = x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height
            const v = f[(y + dy) * width + x + dx]
            if (inside && !Number.isNaN(v)) {
              sum += v
              n++
            }
          }
        }
        if (n) {
          next[q] = sum / n
        } else {
          left++
        }
      }
    }
    f.set(next)
  }
  return { bad, lo, hi }
}

/** The page's 10 m grid: each cell the mean of its K × K source pixels, in centimetres, the south row first. */
function cellGrid(f, width) {
  const h = new Int32Array(GX * GZ)
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      // the page's rows run south first, the TIFF's north first
      let sum = 0
      for (let y = 0; y < K; y++) {
        for (let x = 0; x < K; x++) {
          sum += f[((GZ - 1 - j) * K + y) * width + i * K + x]
        }
      }
      h[j * GX + i] = Math.round((sum / (K * K)) * 100)
    }
  }
  return h
}

/**
 * The fine 4 m grid, in centimetres, the south row first. Each node is the mean of the area it stands for, from four
 * bilinear samples a quarter node apart, so a ditch or bank narrower than a node is averaged in, not kept or dropped
 * by where the nodes fall.
 */
function fineGrid(f, width, height) {
  // a bilinear sample at page metres (x, z); a source pixel's centre sits half a pixel in
  const sample = (x, z) => {
    const fx = Math.min(width - 1.001, Math.max(0, (x + TX + CELL / 2) / PX - 0.5))
    const fy = Math.min(height - 1.001, Math.max(0, (TZ + CELL / 2 - z) / PX - 0.5)) // the TIFF's rows run north first
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const ax = fx - x0
    const ay = fy - y0
    const at = (xx, yy) => f[yy * width + xx]
    const top = at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax
    const bottom = at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax
    return top * (1 - ay) + bottom * ay
  }
  const q = FINE / 4
  const fine = new Int32Array(FX * FZ)
  for (let j = 0; j < FZ; j++) {
    for (let i = 0; i < FX; i++) {
      const x = -TX + i * FINE
      const z = -TZ + j * FINE
      const mean = (sample(x - q, z - q) + sample(x + q, z - q) + sample(x - q, z + q) + sample(x + q, z + q)) / 4
      fine[j * FX + i] = Math.round(mean * 100)
    }
  }
  return fine
}

const res = await fetch(requestUrl())
if (!res.ok) {
  throw new Error(`ČÚZK answered ${res.status}`)
}
const tiff = readTiff(Buffer.from(await res.arrayBuffer()))
const { bad, lo, hi } = fillHoles(tiff.data, tiff.width, tiff.height)
const h = cellGrid(tiff.data, tiff.width)
const fine = fineGrid(tiff.data, tiff.width, tiff.height)

fs.mkdirSync(path.dirname(out), { recursive: true })
const year = new Date().getFullYear()
const dem =
  `window.DEM={nx:${GX},nz:${GZ},cell:${CELL},tx:${TX},tz:${TZ},scale:${scale},` +
  `source:'ČÚZK DMR 4G, ${lat0} N ${lon0} E, squeezed ${scale}×',credit:'© ČÚZK, ${year} (DMR 4G, CC BY 4.0)',` +
  `h:[${h.join(',')}],fine:{step:${FINE},nx:${FX},nz:${FZ},h:[${fine.join(',')}]}};`
const header = `// ČÚZK DMR 4G (© ČÚZK, ${year}, CC BY 4.0), resampled by tools/dem-fetch.mjs; generated, never committed`
fs.writeFileSync(out, `${header}\n${dem}\n`)
console.log(
  `${out}: ${GX}×${GZ} and a ${FINE} m grid ${FX}×${FZ}, from ${tiff.width}×${tiff.height} at 5 m, ` +
    `heights ${lo.toFixed(1)}–${hi.toFixed(1)} m, ${bad} source pixels without data (filled)`,
)
