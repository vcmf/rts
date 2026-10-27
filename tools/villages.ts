// A map's villages read off its scan (docs/plans/active/m8-austerlitz.md M8e): each village given as the stretch of
// its street where the survey draws its houses (two pixels on the scan) and their number, written as a street village
// along the way nearest that stretch (the street-village generator builds its houses), and its church, where the
// survey draws one, as a building beside the street. Only the features the tool makes (villages and churches with the
// scan as their source and its note) are written again; every other feature is kept (the stable save,
// src/map/write.ts).
//   node tools/villages.ts <map.json> <villages inputs.json>
// The inputs: { piece, scan, villages: [{ id, note, from: [u, v], to: [u, v], houses, way?, church?: [u, v] }] }, in
// the scan's pixels, v down; `way` names the street where the nearest way is not it.
import fs from 'node:fs'
import path from 'node:path'
import type { Feature, MapFile, Pt } from '../src/map/schema.ts'
import { demPlace, toMap } from '../src/map/dem.ts'
import { nearLine } from '../src/map/apply.ts'
import { lineLength, pointAt } from '../src/map/geometry.ts'
import { writeMap } from '../src/map/write.ts'
import { scanFitOf } from './water.ts'

/** The tool's inputs for one map (a committed file beside it). */
export interface VillageInputs {
  piece: string
  scan: string
  villages: { id: string; note: string; from: Pt; to: Pt; houses: number; way?: string; church?: Pt }[]
}

// a parish church of the region: nave and chancel, about 24 × 11 m (buildings keep their real size on a scale model,
// decision 0070)
const CHURCH: Pt = [24, 11]
// its long side this far from the street's edge at least (the houses' setback and a churchyard's path)
const CHURCH_OFF = 6

/** The way nearest both of two points (the least sum of their distances), and each point's distance along it. */
export function nearestWay(ways: { id: string; line: Pt[] }[], a: Pt, b: Pt): { id: string; from: number; to: number } {
  let best = { id: '', from: 0, to: 0 }
  let bd = Infinity
  for (const w of ways) {
    const na = nearLine(w.line, a[0], a[1])
    const nb = nearLine(w.line, b[0], b[1])
    if (na.d + nb.d < bd) {
      bd = na.d + nb.d
      best = { id: w.id, from: na.along, to: nb.along }
    }
  }
  return best
}

/**
 * A church's ground: a rectangle `size` long and wide, its long side along the street at `along` m on it, on its left
 * (or its right), its near side `off` m past the street's edge (`half` its half-width). Counter-clockwise.
 */
export function churchAt(
  street: Pt[],
  along: number,
  left: boolean,
  half: number,
  size: Pt = CHURCH,
  off = CHURCH_OFF,
): Pt[] {
  const [px, pz, tx, tz] = pointAt(street, along)
  // the left of the street's direction is (−tz, tx)
  const [nx, nz] = left ? [-tz, tx] : [tz, -tx]
  const [l, w] = [size[0] / 2, size[1]]
  const d0 = half + off
  const c = (s: number, d: number): Pt => [
    Math.round((px + tx * s + nx * d) * 100) / 100,
    Math.round((pz + tz * s + nz * d) * 100) / 100,
  ]
  const ring = [c(-l, d0), c(l, d0), c(l, d0 + w), c(-l, d0 + w)]
  const area2 = ring.reduce((s, p, k) => {
    const q = ring[(k + 1) % ring.length]
    return s + p[0] * q[1] - q[0] * p[1]
  }, 0)
  return area2 < 0 ? ring.reverse() : ring
}

/**
 * Where on a street a church goes: from the survey's point outward along the street in `step` m up to `reach` m each
 * way, on the survey's side first and then across, the first ground `ok` takes; null if none.
 */
export function placeChurch(
  street: Pt[],
  at: Pt,
  half: number,
  ok: (ring: Pt[]) => boolean,
  step = 5,
  reach = 60,
): Pt[] | null {
  const n = nearLine(street, at[0], at[1])
  const length = lineLength(street)
  const l = CHURCH[0] / 2
  for (let k = 0; k <= reach / step; k++) {
    for (const s of k ? [k * step, -k * step] : [0]) {
      const along = n.along + s
      if (along < l || along > length - l) continue
      for (const left of [n.side >= 0, n.side < 0]) {
        const ring = churchAt(street, along, left, half)
        if (ok(ring)) return ring
      }
    }
  }
  return null
}

function main(): void {
  const [mapFile, inputsFile] = process.argv.slice(2)
  if (!mapFile || !inputsFile) {
    console.error('usage: node tools/villages.ts <map.json> <villages inputs.json>')
    process.exit(2)
  }
  const text = fs.readFileSync(mapFile, 'utf8')
  const map = JSON.parse(text) as MapFile
  const ins = JSON.parse(fs.readFileSync(inputsFile, 'utf8')) as VillageInputs
  const piece = map.features.find(f => f.id === ins.piece)
  const scan = map.sources?.find(s => s.id === ins.scan)
  if (!piece || !scan?.file) throw new Error(`no piece ${ins.piece} or scan ${ins.scan}`)
  const place = demPlace(piece as unknown as Record<string, unknown>)
  const fit = scanFitOf(map, place, scan, path.dirname(mapFile))
  const toPoint = ([u, v]: Pt): Pt => {
    const [fx, fz] = fit.toFrame(u, v)
    return toMap(place, fx, fz)
  }
  const ways = map.features
    .filter(f => (f.kind ?? '').startsWith('way.') && f.line)
    .map(f => ({ id: f.id, line: f.line!, width: typeof f.width === 'number' ? f.width : 5 }))
  const NOTE = ': read off the survey'
  // the least distance from a church's corners and sides to the edge of any water line or way but its own street
  const waters = map.features
    .filter(f => (f.kind ?? '').startsWith('water.') && f.line)
    .map(f => ({ id: f.id, line: f.line!, width: typeof f.width === 'number' ? f.width : 2 }))
  const CLEAR = 3
  const clearance = (ring: Pt[], street: string) => {
    let d = Infinity
    for (const l of [...ways, ...waters]) {
      if (l.id === street) continue
      for (let k = 0; k < ring.length; k++) {
        const [a, b] = [ring[k], ring[(k + 1) % ring.length]]
        // its corners and its sides' middles
        for (const p of [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt]) {
          d = Math.min(d, nearLine(l.line, p[0], p[1]).d - l.width / 2)
        }
      }
    }
    return d
  }
  const features: Record<string, unknown>[] = []
  const report: string[] = []
  const made = new Set<string>()
  const add = (f: Record<string, unknown>) => {
    if (made.has(f.id as string)) throw new Error(`${String(f.id)}: the tool makes two features with this id`)
    made.add(f.id as string)
    features.push(f)
  }
  for (const v of ins.villages) {
    const [a, b] = [toPoint(v.from), toPoint(v.to)]
    const pool = v.way ? ways.filter(w => w.id === v.way) : ways
    if (!pool.length) throw new Error(`${v.id}: no way ${v.way}`)
    const near = nearestWay(pool, a, b)
    // whole metres, inside the street (its end rounds down)
    const length = lineLength(pool.find(w => w.id === near.id)!.line)
    const from = Math.ceil(Math.min(near.from, near.to))
    const to = Math.floor(Math.min(length, Math.max(near.from, near.to)))
    if (to - from < 20) throw new Error(`${v.id}: its stretch of ${near.id} is ${(to - from).toFixed(0)} m`)
    add({
      id: v.id,
      kind: 'built.village',
      source: ins.scan,
      along: { id: near.id, from, to },
      houses: v.houses,
      gen: { 'street-village': { min: Math.ceil(v.houses / 2) } },
      note: `${v.note}${NOTE}`,
    })
    let church = ''
    if (v.church) {
      const way = ways.find(w => w.id === near.id)!
      // on its side of the street near the survey's point, else across it or along it, clear of water and other ways
      const ring = placeChurch(way.line, toPoint(v.church), way.width / 2, r => clearance(r, near.id) >= CLEAR)
      if (!ring) throw new Error(`${v.id}: no ground for its church within 60 m of the survey's, ${CLEAR} m clear`)
      add({
        id: `${v.id}-church`,
        kind: 'built.church',
        source: ins.scan,
        area: [ring],
        note: `the church of ${v.note.replace(/^the /, '')}${NOTE}`,
      })
      church = ', its church'
    }
    report.push(`${v.id}: ${v.houses} houses along ${near.id} from ${from.toFixed(0)} to ${to.toFixed(0)} m${church}`)
  }
  const mine = (f: Feature) =>
    (f.kind === 'built.village' || f.kind === 'built.church') && f.source === ins.scan && (f.note ?? '').endsWith(NOTE)
  const others = map.features.filter(f => !mine(f))
  for (const f of features) {
    if (others.some(o => o.id === f.id)) throw new Error(`${String(f.id)}: another feature has this id`)
  }
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${ins.villages.length} villages`)
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
