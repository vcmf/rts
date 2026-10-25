// The real-relief importer (docs/plans/active/m5-relief.md): a crop of ČÚZK's terrain model, the Czech Republic's
// bare-ground heights (© ČÚZK, open data under CC BY 4.0), written as an .rdem heightfield beside a map, with the dem
// source entry the map pastes in (its file, hash, credit and licence).
//   node tools/dem-import.ts <lat> <lon> <width km> <height km> <out.rdem> [--model 4g|5g]
// The crop is asked for in a transverse Mercator centred on (lat, lon), at scale 1: true metres, north up, so the
// file's frame is the map's (centred, x east, z north). The service reprojects from its own grid (S-JTSK, Křovák)
// with bilinear interpolation. DMR 4G is the 5 m model (the default), DMR 5G the 2 m one. Large crops are fetched
// in tiles below the service's export limit (15000 × 4100 pixels) and stitched.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeRdem, sha256 } from '../src/map/dem.ts'
import { fillHoles, readTiff } from './dem-tiff.mjs'

const MODELS = {
  '4g': { service: 'dmr4g', name: 'DMR 4G', cell: 5 },
  '5g': { service: 'dmr5g', name: 'DMR 5G', cell: 2 },
} as const
const SERVICE = (s: string) => `https://ags.cuzk.gov.cz/arcgis/rest/services/3D/${s}/ImageServer/exportImage`
const TILE_ROWS = 4000 // under the service's 4100-pixel height limit
const MAX_WIDTH = 15000

/** The local projection: a transverse Mercator at scale 1 centred on the crop, in metres. */
function localWkt(lat: number, lon: number): string {
  return (
    'PROJCS["local",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
    `PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",${lon}],` +
    `PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",${lat}],UNIT["Meter",1.0]]`
  )
}

/** One band of rows of the crop, north first: pixel centres on the file's nodes, so the box reaches half a cell out. */
async function fetchRows(
  service: string,
  sr: string,
  cell: number,
  x0: number,
  zTop: number,
  nx: number,
  rows: number,
): Promise<Float32Array> {
  const bbox = [x0 - cell / 2, zTop - (rows - 0.5) * cell, x0 + (nx - 0.5) * cell, zTop + cell / 2]
  const params = new URLSearchParams({
    bbox: bbox.join(','),
    bboxSR: sr,
    imageSR: sr,
    size: `${nx},${rows}`,
    format: 'tiff',
    pixelType: 'F32',
    compression: 'None',
    interpolation: 'RSP_BilinearInterpolation',
    f: 'image',
  })
  const res = await fetch(`${SERVICE(service)}?${params}`)
  if (!res.ok) throw new Error(`the service answered ${res.status} ${res.statusText}`)
  const tiff = readTiff(Buffer.from(await res.arrayBuffer()), { width: nx, height: rows })
  return tiff.data as Float32Array
}

/** Imports the crop; returns the source entry for the map. */
export async function importDem(
  lat: number,
  lon: number,
  widthKm: number,
  heightKm: number,
  out: string,
  model: keyof typeof MODELS = '4g',
): Promise<Record<string, string>> {
  const m = MODELS[model]
  const nx = Math.round((widthKm * 1000) / m.cell) + 1
  const nz = Math.round((heightKm * 1000) / m.cell) + 1
  if (nx > MAX_WIDTH) throw new Error(`${nx} pixels across is over the service's ${MAX_WIDTH}`)
  const sr = JSON.stringify({ wkt: localWkt(lat, lon) })
  const x0 = (-(nx - 1) * m.cell) / 2
  const zTop = ((nz - 1) * m.cell) / 2
  const north = new Float32Array(nx * nz) // rows north first, as fetched
  for (let r = 0; r < nz; r += TILE_ROWS) {
    const rows = Math.min(TILE_ROWS, nz - r)
    north.set(await fetchRows(m.service, sr, m.cell, x0, zTop - r * m.cell, nx, rows), r * nx)
  }
  const { bad, lo, hi } = fillHoles(north, nx, nz)
  if (bad > 0.05 * nx * nz) throw new Error(`${bad} of ${nx * nz} pixels have no data: is the crop inside Czechia?`)
  const baseCm = Math.floor(lo * 100)
  if (Math.ceil(hi * 100) - baseCm > 0xffff) throw new Error(`heights ${lo}–${hi} m span more than an .rdem's 655 m`)
  const cm = new Uint16Array(nx * nz) // south row first
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) cm[j * nx + i] = Math.round(north[(nz - 1 - j) * nx + i] * 100 - baseCm)
  }
  const bytes = encodeRdem({ nx, nz, cellMm: m.cell * 1000, baseCm, cm })
  fs.writeFileSync(out, bytes)
  const year = new Date().getFullYear()
  console.error(
    `${out}: ${nx}×${nz} at ${m.cell} m (${(((nx - 1) * m.cell) / 1000).toFixed(1)} × ` +
      `${(((nz - 1) * m.cell) / 1000).toFixed(1)} km), heights ${lo.toFixed(1)}–${hi.toFixed(1)} m, ` +
      `${bad} pixels filled, ${(bytes.length / 1e6).toFixed(1)} MB`,
  )
  return {
    id: 'cuzk',
    kind: 'dem',
    ref: `ČÚZK ${m.name}, ${lat} N ${lon} E, a transverse Mercator centred there`,
    file: path.basename(out),
    hash: sha256(bytes),
    credit: `© ČÚZK, ${year} (${m.name})`,
    licence: 'CC BY 4.0',
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const mi = args.indexOf('--model')
  const model = mi >= 0 ? args.splice(mi, 2)[1] : '4g'
  const [lat, lon, w, h] = args.slice(0, 4).map(Number)
  const out = args[4]
  if (![lat, lon, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || !out?.endsWith('.rdem') || !(model in MODELS)) {
    console.error('usage: node tools/dem-import.ts <lat> <lon> <width km> <height km> <out.rdem> [--model 4g|5g]')
    process.exit(2)
  }
  const source = await importDem(lat, lon, w, h, out, model as keyof typeof MODELS)
  console.log(JSON.stringify(source))
}
