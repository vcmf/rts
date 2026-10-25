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
import { fillHoles, readTiff } from './dem-tiff.mjs'

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
const tiff = readTiff(Buffer.from(await res.arrayBuffer()), { width: GX * K, height: GZ * K })
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
