// A scan from a map service (docs/plans/active/m7-editor.md M7e, decision 0069): an image of a WMS layer over a box
// around a centre, in WGS 84 (EPSG:4326), and the scan source the map pastes in: its file, and control points that
// place it in the transverse Mercator centred there, which is the relief importer's frame (tools/dem-import.ts), so it
// lands on the heights at once. Points are then added or moved by hand on the map page against the relief.
//   node tools/scan-wms.ts <service url> <layer> <lat> <lon> <width km> <height km> <maps/scans/name.png|.jpg>
//     [--px 4096] [--id name] [--frame dem-source-id --map maps/x.map.json] [--ref text] [--credit text]
//     [--licence text]
// With --frame, the centre must be the one the dem source's file was cropped around (its ref says it, as
// tools/dem-import.ts writes it): the points are in that file's frame. The image goes under maps/scans/, which git
// ignores: a scan is committed only where its source says public domain.
// Example (the Habsburg First Military Survey over Austerlitz, Chartae Antiquae, docs/research/period-maps.md):
//   node tools/scan-wms.ts http://www.chartae-antiquae.cz/WMS/Military1/ Military1 49.118 16.737 6 6 \
//     maps/scans/austerlitz-first-survey.jpg --frame cuzk --map maps/austerlitz.map.json
import fs from 'node:fs'
import path from 'node:path'
import { geoBox, geoPoints, transverseMercator } from './geo.ts'
import { SCAN_FILE } from '../src/map/validate.ts'

const MAX_PX = 4096 // a common WMS limit (Chartae Antiquae's)

/** The GetMap URL for a box [south, west, north, east] in WGS 84, WMS 1.1.1 (longitude first). */
export function getMapUrl(service: string, layer: string, box: number[], w: number, h: number, format: string): string {
  const [s, west, n, e] = box
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layer,
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: [west, s, e, n].join(','),
    WIDTH: String(w),
    HEIGHT: String(h),
    FORMAT: format,
  })
  return `${service}${service.includes('?') ? '&' : '?'}${q}`
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const k = args.indexOf(`--${name}`)
    return k >= 0 ? args.splice(k, 2)[1] : undefined
  }
  const px = Number(flag('px') ?? MAX_PX)
  const id = flag('id')
  const frame = flag('frame')
  const mapFile = flag('map')
  const ref = flag('ref')
  const credit = flag('credit')
  const licence = flag('licence')
  const [service, layer, ...rest] = args
  const [lat, lon, wKm, hKm] = rest.slice(0, 4).map(Number)
  const out = rest[4]
  const file = out ? path.relative('maps', out).split(path.sep).join('/') : ''
  if (!service || !layer || ![lat, lon, wKm, hKm, px].every(Number.isFinite) || !SCAN_FILE.test(file)) {
    console.error(
      'usage: node tools/scan-wms.ts <service url> <layer> <lat> <lon> <width km> <height km> <maps/scans/name.png|.jpg>' +
        ' [--px 4096] [--id name] [--frame dem-source-id --map maps/x.map.json] [--ref text] [--credit text] [--licence text]',
    )
    process.exit(2)
  }
  if (frame) {
    // the points are in the dem file's frame: a transverse Mercator centred where that file was cropped
    const map = mapFile
      ? (JSON.parse(fs.readFileSync(mapFile, 'utf8')) as { sources?: { id: string; ref?: string }[] })
      : null
    const ref = map?.sources?.find(x => x.id === frame)?.ref ?? ''
    const m = /(-?\d+(?:\.\d+)?) N (-?\d+(?:\.\d+)?) E/.exec(ref)
    if (!m) {
      console.error(`--frame ${frame} needs --map with that dem source, whose ref gives its centre ("<lat> N <lon> E")`)
      process.exit(2)
    }
    if (Number(m[1]) !== lat || Number(m[2]) !== lon) {
      console.error(
        `${frame}'s file is centred on ${m[1]} N ${m[2]} E: give that centre, so the points are in its frame`,
      )
      process.exit(2)
    }
  }
  const box = geoBox(lat, lon, wKm * 1000, hKm * 1000)
  // pixels about square on the ground: the box's sides in metres, through the local projection
  const tm = transverseMercator(lat, lon)
  const across = tm(lat, box[3])[0] - tm(lat, box[1])[0]
  const along = tm(box[2], lon)[1] - tm(box[0], lon)[1]
  const w = Math.min(px, MAX_PX, Math.round((px * across) / Math.max(across, along)))
  const h = Math.min(MAX_PX, Math.round((w * along) / across))
  const format = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  const url = getMapUrl(service, layer, box, w, h, format)
  const res = await fetch(url)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) {
    console.error(`the service said ${res.status} ${type}: ${(await res.text()).slice(0, 500)}`)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()))
  const source = {
    id: id ?? path.basename(file).replace(/\.[a-z]+$/, ''),
    kind: 'scan',
    file,
    ref: ref ?? `${layer} from ${service}, ${lat} N ${lon} E, WGS 84`,
    ...(credit ? { credit } : {}),
    ...(licence ? { licence } : {}),
    ...(frame ? { frame } : {}),
    points: geoPoints(box, w, h, lat, lon),
  }
  console.log(`${out}: ${w} × ${h} px, ${(across / w).toFixed(2)} m a pixel. The source to paste into the map:`)
  console.log(JSON.stringify(source))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main()
