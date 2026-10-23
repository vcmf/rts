// Fetches a real terrain crop for the staff map prototype's ?dem= mode (docs/plans/active/real-terrain-proto.md): ČÚZK's
// DMR 4G, the Czech Republic's 5 m bare-ground terrain model (© ČÚZK, open data under CC BY 4.0: attribute "ČÚZK,
// <year>"), from its image service in one request at its native 5 m, averaged onto the prototype's 10 m grid
// (±2700 × ±1900 m; a mean, so ditches and banks narrower than a cell do not alias into bumps), the
// real ground squeezed by `scale` so a battlefield fits the prototype's frame. Writes a generated .js defining
// window.DEM = { nx, nz, cell, tx, tz, h, scale, source, credit, fine: { step, nx, nz, h } } (h in centimetres, the
// south row first; fine: a finer grid for the relief shading), git-ignored
// under scratch/;
// never commit the data.
// Usage: node tools/dem-fetch.mjs [lat lon scale out]   (default: Austerlitz, 49.118 16.737 2.5 scratch/dem-austerlitz.js)
// Open: prototypes/staff-map.html?style=lit&dem= followed by this file's path relative to the page (also from file://)
import fs from 'node:fs'
import path from 'node:path'

const [lat0 = 49.118, lon0 = 16.737, scale = 2.5] = process.argv.slice(2, 5).map(Number)
const out = process.argv[5] ?? 'scratch/dem-austerlitz.js'
if (![lat0, lon0, scale].every(Number.isFinite) || scale <= 0) { console.error('usage: node tools/dem-fetch.mjs [lat lon scale out] (decimal degrees, a positive scale)'); process.exit(2) }
const TX = 2700, TZ = 1900, CELL = 10   // the prototype's terrain (prototypes/staff-map.html)
const GX = Math.round(2 * TX / CELL) + 1, GZ = Math.round(2 * TZ / CELL) + 1
const R = 6378137, mLon = 111320 * Math.cos(lat0 * Math.PI / 180), mLat = 111200
const mx = l => R * l * Math.PI / 180, my = l => R * Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360))   // Web Mercator
const K = Math.max(1, Math.round(scale * CELL / 5))   // source pixels (5 m) a page cell's side holds: averaged K × K
const ex = (TX + CELL / 2) * scale, ez = (TZ + CELL / 2) * scale   // cells are areas: their centres on the page's -TX + i·CELL nodes
const bbox = [mx(lon0 - ex / mLon), my(lat0 - ez / mLat), mx(lon0 + ex / mLon), my(lat0 + ez / mLat)]
const url = 'https://ags.cuzk.gov.cz/arcgis/rest/services/3D/dmr4g_wm/ImageServer/exportImage?' + new URLSearchParams({
  bbox: bbox.map(v => v.toFixed(2)).join(','), bboxSR: '3857', imageSR: '3857', size: `${GX * K},${GZ * K}`, format: 'tiff',
  pixelType: 'F32', compression: 'None', interpolation: 'RSP_BilinearInterpolation', f: 'image' })
const res = await fetch(url)
if (!res.ok) throw new Error(`ČÚZK answered ${res.status}`)
const b = Buffer.from(await res.arrayBuffer())
const magic = b.toString('latin1', 0, 2)   // the service answers errors as JSON, even with status 200
if (!((magic === 'II' && b.readUInt16LE(2) === 42) || (magic === 'MM' && b.readUInt16BE(2) === 42))) throw new Error(`not a TIFF: ${b.toString('utf8', 0, 300)}`)

// a minimal reader for the uncompressed float32 TIFF the service returns (strips or tiles)
const le = b.toString('latin1', 0, 2) === 'II'
const u16 = o => le ? b.readUInt16LE(o) : b.readUInt16BE(o), u32 = o => le ? b.readUInt32LE(o) : b.readUInt32BE(o)
const ifd = u32(4), T = {}
for (let i = 0; i < u16(ifd); i++) {
  const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4)
  if (type !== 3 && type !== 4) continue   // only the SHORT and LONG tags read below (ASCII, RATIONAL, DOUBLE skipped)
  const sz = type === 3 ? 2 : 4, at = cnt * sz <= 4 ? e + 8 : u32(e + 8)
  T[tag] = Array.from({ length: cnt }, (_, k) => type === 3 ? u16(at + k * 2) : u32(at + k * 4))
}
const W = T[256][0], H = T[257][0]
if (W !== GX * K || H !== GZ * K || T[259]?.[0] !== 1 || T[258]?.[0] !== 32 || T[339]?.[0] !== 3 || (T[277]?.[0] ?? 1) !== 1)
  throw new Error(`unexpected TIFF: ${W}×${H}, compression ${T[259]}, bits ${T[258]}, sample format ${T[339]}, samples ${T[277]} (want uncompressed float32, one band)`)
const f = new Float32Array(W * H), rd = o => le ? b.readFloatLE(o) : b.readFloatBE(o)
if (T[322]) {   // tiles
  const tw = T[322][0], th = T[323][0], across = Math.ceil(W / tw)
  T[324].forEach((o, t) => { const x0 = (t % across) * tw, y0 = Math.floor(t / across) * th
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (x0 + x < W && y0 + y < H) f[(y0 + y) * W + x0 + x] = rd(o + (y * tw + x) * 4) })
} else {        // strips
  const rps = T[278] ? T[278][0] : H
  T[273].forEach((o, s) => { for (let y = 0; y < rps && s * rps + y < H; y++) for (let x = 0; x < W; x++) f[(s * rps + y) * W + x] = rd(o + (y * W + x) * 4) })
}
const ok = v => Number.isFinite(v) && v > -100 && v < 3000   // outside the country the service returns no data
let bad = 0, lo = Infinity, hi = -Infinity
for (let q = 0; q < f.length; q++) if (!ok(f[q])) { f[q] = NaN; bad++ } else { lo = Math.min(lo, f[q]); hi = Math.max(hi, f[q]) }
if (bad > f.length * 0.05) throw new Error(`${bad} of ${f.length} source pixels without data (outside the Czech Republic?)`)
// holes filled from their valid neighbours, pass by pass (a lowest-height fill would cut craters)
for (let pass = 0, left = bad; left > 0 && pass < 64; pass++) {
  const next = f.slice(); left = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x; if (!Number.isNaN(f[q])) continue
    let s0 = 0, n0 = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = f[(y + dy) * W + x + dx]
      if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && !Number.isNaN(v)) { s0 += v; n0++ } }
    if (n0) next[q] = s0 / n0; else left++ }
  f.set(next)
}
const h = new Int32Array(GX * GZ)
for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {   // the K x K mean; rows: the page's south first, the TIFF's north first
  let s0 = 0; for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) s0 += f[((GZ - 1 - j) * K + y) * W + i * K + x]
  h[j * GX + i] = Math.round(s0 / (K * K) * 100) }
// a finer grid for the relief shading (docs/plans/active/relief-shading.md): every FINE metres of the page, from the
// 5 m source (one source pixel is CELL / K page metres; its centre sits half a pixel in)
const FINE = 4
const FX = Math.round(2 * TX / FINE) + 1, FZ = Math.round(2 * TZ / FINE) + 1
const px = CELL / K
const sample = (x, z) => {
  const fx = Math.min(W - 1.001, Math.max(0, (x + TX + CELL / 2) / px - 0.5))
  const fy = Math.min(H - 1.001, Math.max(0, (TZ + CELL / 2 - z) / px - 0.5))   // the TIFF's rows run north first
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0
  const at = (xx, yy) => f[yy * W + xx]
  return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay
}
// the mean of the area a fine node stands for (FINE page metres square), from four bilinear samples a quarter cell
// apart: a ditch or bank narrower than a node is averaged in, not kept or dropped by where the nodes fall
const q = FINE / 4
const fine = new Int32Array(FX * FZ)
for (let j = 0; j < FZ; j++) for (let i = 0; i < FX; i++) {   // the page's south first
  const x = -TX + i * FINE, z = -TZ + j * FINE
  fine[j * FX + i] = Math.round((sample(x - q, z - q) + sample(x + q, z - q) + sample(x - q, z + q) + sample(x + q, z + q)) / 4 * 100)
}
fs.mkdirSync(path.dirname(out), { recursive: true })
const year = new Date().getFullYear()
fs.writeFileSync(out, `// ČÚZK DMR 4G (© ČÚZK, ${year}, CC BY 4.0), resampled by tools/dem-fetch.mjs; generated, never committed\nwindow.DEM={nx:${GX},nz:${GZ},cell:${CELL},tx:${TX},tz:${TZ},scale:${scale},source:'ČÚZK DMR 4G, ${lat0} N ${lon0} E, squeezed ${scale}×',credit:'© ČÚZK, ${year} (DMR 4G, CC BY 4.0)',h:[${h.join(',')}],fine:{step:${FINE},nx:${FX},nz:${FZ},h:[${fine.join(',')}]}};\n`)
console.log(`${out}: ${GX}×${GZ} and a ${FINE} m grid ${FX}×${FZ}, from ${W}×${H} at 5 m, heights ${lo.toFixed(1)}–${hi.toFixed(1)} m, ${bad} source pixels without data (filled)`)
