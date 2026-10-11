// The S1e battlefield (docs/plans/active/s1e1-battlefield.md) as a map definition for the sim data build
// (tools/build-sim-data.ts): an invented 1.2 km square of lowland, written as build-time formulas (Math.* is fine
// here: the output is data, and the committed file is the authority), with the sim's exact-operation trigonometry
// so the bytes are the same on every machine. Two low ridges face each other across a
// valley about 560 m apart; a stream meanders along the valley, wadeable by men and horses but in its pools, by guns
// only at two fords, with a bridge where the road crosses and a marsh in one bend; a wood on each side's flank, fields with hedges, rough ground
// on the steeper slopes. x is east, z north; side 0 holds the southern ridge, side 1 the northern.
// The class names are the Napoleonic ruleset's terrain classes; the map names no rule. When the map format
// (docs/proposals/map-format.md) lands, this map becomes its first file.
import type { MapDef } from './formation-field.ts'
import { napoleonic } from '../src/rulesets/napoleonic.ts'
// the sim's exact-operation functions, not Math's: the build must give the same bytes on every machine (Math.sin and
// friends may differ in the last bit between platforms, enough to move a cell across a class threshold)
import { sin, cos, exp, atan2 } from '../src/sim/num.ts'

const HALF = 600, CELL = 2, N = Math.round(2 * HALF / CELL) + 1
const CLASSES = Object.keys(napoleonic.terrain)
const C = (name: string): number => { const k = CLASSES.indexOf(name); if (k < 0) throw new Error(`battlefield: no terrain class ${name}`); return k }

// relief: the two ridges (crest at |z| ≈ 280, 14–18 m over the valley floor), spurs and hollows along them, a
// hollow behind each crest (reverse slopes), and a gentle rise toward the map's corners
const sq = (v: number): number => v * v
const ridge = (z: number, x: number): number => {
  const crest = 280 + 25 * sin(x / 140 + (z > 0 ? 1.3 : 0)), d = (Math.abs(z) - crest) / 115
  return (14 + 4 * sin(x / 210 + (z > 0 ? 2 : 0))) * exp(-d * d)
}
const hollow = (z: number, x: number): number => { const d = (Math.abs(z) - 400) / 45; return -4 * exp(-d * d) * (0.6 + 0.4 * cos(x / 160)) }
const spurs = (x: number, z: number): number => 2.5 * sin(x / 95 + z / 160) * exp(-sq((Math.abs(z) - 180) / 120))
const heightAt = (x: number, z: number): number => 3 + ridge(z, x) + hollow(z, x) + spurs(x, z) + 0.000006 * (x * x + z * z) - 1.5 * exp(-sq((z - streamZ(x)) / 30))

// the stream: its centre line, a meander along the valley; 6 m wide
export const streamZ = (x: number): number => 30 * sin(x / 95) + 14 * sin(x / 37 + 1)
const STREAM_HALF = 3
// the road: north–south, crossing the stream by the bridge
export const roadX = (z: number): number => 60 + 12 * sin(z / 130)
const ROAD_HALF = 3
// the fords, where the stream is shallow enough to wade (x of their centres, ±10 m)
export const FORDS = [-260, 330]
const FORD_HALF = 10
const woods = [
  { x: -380, z: -190, r: 75, core: 30 },   // side 0's western flank
  { x: 370, z: 215, r: 85, core: 35 },     // side 1's eastern flank
]
const rect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1
const crops = [[-160, -20, -215, -135], [110, 270, 120, 205], [-470, -330, 40, 130]] as const
const ploughed = [[150, 300, -240, -155], [-300, -170, 140, 225]] as const
// hedges, as segments 2 m thick along field edges
const hedges = [[-160, -20, -135, -135], [110, 110, 120, 205], [150, 300, -155, -155]] as const

function classAt(x: number, z: number): number {
  const ds = Math.abs(z - streamZ(x)), onRoad = Math.abs(x - roadX(z)) <= ROAD_HALF
  if (ds <= STREAM_HALF) return C(onRoad ? 'bridge' : 'water')
  if (onRoad) return C('road')
  // the marsh: the stream's northern bank in the bend west of the road
  if (x > -170 && x < -60 && z > streamZ(x) && ds < 28) return C('marsh')
  for (const w of woods) { const d = Math.sqrt(sq(x - w.x) + sq(z - w.z)) * (1 + 0.15 * sin(atan2(z - w.z, x - w.x) * 3)); if (d < w.core) return C('denseWood'); if (d < w.r) return C('woods') }
  for (const [x0, x1, z0, z1] of hedges) if (rect(x, z, x0 - 1, x1 + 1, z0 - 1, z1 + 1)) return C('hedge')
  for (const [x0, x1, z0, z1] of crops) if (rect(x, z, x0, x1, z0, z1)) return C('crops')
  for (const [x0, x1, z0, z1] of ploughed) if (rect(x, z, x0, x1, z0, z1)) return C('ploughed')
  // rough ground where the slope is steepest
  const gx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4, gz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4
  if (Math.sqrt(gx * gx + gz * gz) > 0.14) return C('rough')
  return C('open')
}
// water depth in metres, shallower to the banks: 0.8 in most of the channel (men and horses wade it, slowly; guns
// cannot), 1.4 in its pools (no kind wades them), 0.5 at the fords (every kind)
export const pool = (x: number): boolean => Math.abs(x) > 420 && sin(x / 30) > 0   // out on the flanks, clear of the lines' advance
function depthAt(x: number, z: number): number {
  const ds = Math.abs(z - streamZ(x)); if (ds > STREAM_HALF || Math.abs(x - roadX(z)) <= ROAD_HALF) return 0
  const deep = FORDS.some(f => Math.abs(x - f) <= FORD_HALF) ? 0.5 : pool(x) ? 1.4 : 0.8
  return deep * (1 - sq(ds / STREAM_HALF) * 0.5)
}

export function battlefield(): MapDef {
  const cls = new Uint8Array(N * N), depth = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -HALF + i * CELL, z = -HALF + j * CELL; cls[j * N + i] = classAt(x, z); depth[j * N + i] = depthAt(x, z) }
  const T = napoleonic.terrain, limit = napoleonic.water.limit
  return {
    name: 'battlefield',
    half: HALF,
    heightAt,
    // a column's speed factor: the class's, and none where the water is too deep (slope comes from the heightfield)
    groundAt: (x, z) => depthAt(x, z) > limit ? 0 : T[CLASSES[classAt(x, z)]].g.column,
    slopeFactor: rise => Math.min(1, napoleonic.slopeK * exp(-3.5 * rise)),
    classes: CLASSES,
    fine: { cell: CELL, n: N, classAt: (i, j) => cls[j * N + i], depthAt: (i, j) => depth[j * N + i] },
  }
}
