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
import type { AttrValue, Catalogue, Feature, MapFile, Pt } from '../src/map/schema.ts'
import { demPlace, toMap } from '../src/map/dem.ts'
import { nearLine } from '../src/map/apply.ts'
import { distanceToPolygon } from '../src/map/reach.ts'
import { resolve } from '../src/map/resolve.ts'
import { cm, num } from '../src/map/util.ts'
import { lineLength, pointAt, ringArea2 } from '../src/map/geometry.ts'
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
// the share of the survey's houses a village must place: a scale model shortens its street while its houses keep their
// real size (decision 0070), so it places those that fit, and the expansion says why when most of them do not
export const MIN_SHARE = 0.5

/** The fewest houses a village of the survey's `houses` must place (MIN_SHARE of them, at least one). */
export function minHouses(houses: number): number {
  return Math.max(1, Math.ceil(houses * MIN_SHARE))
}

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
  const c = (s: number, d: number): Pt => [cm(px + tx * s + nx * d), cm(pz + tz * s + nz * d)]
  const ring = [c(-l, d0), c(l, d0), c(l, d0 + w), c(-l, d0 + w)]
  return ringArea2(ring) < 0 ? ring.reverse() : ring
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

/**
 * Whether a church's ground keeps `gap` m from every obstacle (water, ways, buildings, at their resolved widths; a
 * crossing or an end inside it 0) and its setback from its own `street`.
 */
export function churchClear(
  ring: Pt[],
  obstacles: { f: Feature; attrs: Record<string, AttrValue> }[],
  street: string,
  gap: number,
): boolean {
  return obstacles.every(
    ({ f, attrs }) => distanceToPolygon(f, attrs, ring) >= (f.id === street ? CHURCH_OFF - 0.01 : gap),
  )
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
    // the pixel's centre, as the ways were traced (the fit reads the image as continuous, pixel u spanning u to u + 1)
    const [fx, fz] = fit.toFrame(u + 0.5, v + 0.5)
    return toMap(place, fx, fz)
  }
  const cat = JSON.parse(fs.readFileSync(path.join(path.dirname(import.meta.filename), '../maps/kinds.json'), 'utf8'))
  // each feature's attributes as the catalogue resolves them (a way's or a stream's width by its kind)
  const attrsOf = (f: Feature) => resolve(f, map, cat as Catalogue).attrs
  const ways = map.features
    .filter(f => (f.kind ?? '').startsWith('way.') && f.line)
    .map(f => ({ f, id: f.id, line: f.line!, width: num(attrsOf(f).width, 5) }))
  const NOTE = ': read off the survey'
  const mine = (f: Feature) =>
    (f.kind === 'built.village' || f.kind === 'built.church') && f.source === ins.scan && (f.note ?? '').endsWith(NOTE)
  // what a church keeps CLEAR m from: what a house keeps clear of (water, streams and ponds; ways; buildings, the
  // churches placed before it too; barriers; no-go zones); and its own street by
  // its setback, so a bend cannot bring the street under it (the same distances the generators keep:
  // src/map/reach.ts, a crossing or an end inside the church 0)
  const CLEAR = 3
  const obstacles = map.features
    .filter(
      f => /^(water|way|built|barrier)\.|^zone\.nogo/.test(f.kind ?? '') && !mine(f) && f.kind !== 'built.village',
    )
    .map(f => ({ f, attrs: attrsOf(f) }))
  const clear = (ring: Pt[], street: string) => churchClear(ring, obstacles, street, CLEAR)
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
      // the survey's houses asked, at least MIN_SHARE of them placed, or the expansion says why not
      gen: { 'street-village': { min: minHouses(v.houses) } },
      note: `${v.note}${NOTE}`,
    })
    let church = ''
    if (v.church) {
      // along the way nearest the survey's church (by a crossroads, not always the village's street), on its side,
      // else across or along it, clear of water, ways and buildings
      const at = toPoint(v.church)
      const way = ways.reduce((a, w) => (nearLine(w.line, at[0], at[1]).d < nearLine(a.line, at[0], at[1]).d ? w : a))
      const ring = placeChurch(way.line, at, way.width / 2, r => clear(r, way.id))
      if (!ring) {
        throw new Error(
          `${v.id}: no ground for its church within 60 m along ${way.id} of the survey's, ${CLEAR} m clear`,
        )
      }
      add({
        id: `${v.id}-church`,
        kind: 'built.church',
        source: ins.scan,
        area: [ring],
        note: `the church of ${v.note}${NOTE}`,
      })
      // the next church keeps clear of this one
      const placed = { id: `${v.id}-church`, kind: 'built.church', area: [ring] } as Feature
      obstacles.push({ f: placed, attrs: {} })
      church = ', its church'
    }
    report.push(`${v.id}: ${v.houses} houses along ${near.id} from ${from.toFixed(0)} to ${to.toFixed(0)} m${church}`)
  }
  const others = map.features.filter(f => !mine(f))
  for (const f of features) {
    if (others.some(o => o.id === f.id)) throw new Error(`${String(f.id)}: another feature has this id`)
  }
  fs.writeFileSync(mapFile, writeMap(text, { ...map, features: [...others, ...(features as MapFile['features'])] }))
  console.log(`${ins.villages.length} villages`)
  console.log(report.join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
