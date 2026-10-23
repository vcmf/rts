// Fetches a real terrain crop for the staff map prototype's ?dem= mode (docs/plans/active/real-terrain-proto.md): ČÚZK's
// DMR 4G, the Czech Republic's 5 m bare-ground terrain model (© ČÚZK, open data under CC BY 4.0: attribute "ČÚZK,
// <year>"), from its image service in one request, resampled onto the prototype's 10 m grid (±2700 × ±1900 m), the
// real ground squeezed by `scale` so a battlefield fits the prototype's frame. Writes a generated .js defining
// window.DEM = { nx, nz, h, scale, source, credit } (h in centimetres, the south row first), git-ignored under scratch/;
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
const ex = (TX + CELL / 2) * scale, ez = (TZ + CELL / 2) * scale   // pixels are areas: their centres on the page's -TX + i·CELL nodes
const bbox = [mx(lon0 - ex / mLon), my(lat0 - ez / mLat), mx(lon0 + ex / mLon), my(lat0 + ez / mLat)]
const url = 'https://ags.cuzk.gov.cz/arcgis/rest/services/3D/dmr4g_wm/ImageServer/exportImage?' + new URLSearchParams({
  bbox: bbox.map(v => v.toFixed(2)).join(','), bboxSR: '3857', imageSR: '3857', size: `${GX},${GZ}`, format: 'tiff',
  pixelType: 'F32', compression: 'None', interpolation: 'RSP_BilinearInterpolation', f: 'image' })
const res = await fetch(url)
if (!res.ok) throw new Error(`ČÚZK answered ${res.status}`)
const b = Buffer.from(await res.arrayBuffer())

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
if (W !== GX || H !== GZ || T[259]?.[0] !== 1 || T[258]?.[0] !== 32 || T[339]?.[0] !== 3 || (T[277]?.[0] ?? 1) !== 1)
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
let lo = Infinity, hi = -Infinity, bad = 0
for (const v of f) { if (!ok(v)) { bad++; continue } lo = Math.min(lo, v); hi = Math.max(hi, v) }
if (lo === Infinity) throw new Error('no height in the crop (outside the Czech Republic?)')
const h = new Int32Array(W * H)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = f[(H - 1 - j) * W + i]; h[j * W + i] = Math.round((ok(v) ? v : lo) * 100) }   // south row first
fs.mkdirSync(path.dirname(out), { recursive: true })
const year = new Date().getFullYear()
fs.writeFileSync(out, `// ČÚZK DMR 4G (© ČÚZK, ${year}, CC BY 4.0), resampled by tools/dem-fetch.mjs; generated, never committed\nwindow.DEM={nx:${W},nz:${H},scale:${scale},source:'ČÚZK DMR 4G, ${lat0} N ${lon0} E, squeezed ${scale}×',credit:'© ČÚZK, ${year} (DMR 4G, CC BY 4.0)',h:[${h.join(',')}]};\n`)
console.log(`${out}: ${W}×${H}, heights ${lo.toFixed(1)}–${hi.toFixed(1)} m, ${bad} without data`)
