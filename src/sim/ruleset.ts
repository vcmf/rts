// Era rulesets (decision 0015): everything era-specific is data the world is created with: the block
// geometry, shapes and change times, paces, the terrain table, drill presets. The sim never imports a
// ruleset (decision 0005); `compileRuleset` turns one into indexed tables and precomputes each shape's
// layout, bins, accordion pairs and half-turn symmetry.
import { cos, sin, PI, exp } from './num.ts'
import { fnv1a } from './hash.ts'

export interface Placement { x: number; z: number; rot: number; face: number }   // a company in the battalion frame
export interface Geometry {
  companies: number; files: number; ranks: number   // a company is a block of files × ranks
  fileSpacing: number; rankSpacing: number           // metres
  minSpacing: number                                 // closest two men may stand (turn radius of a trail shape)
  accordionGap: number                               // closest a file may come to the file ahead of it
}
export interface FormationDef {
  kind: string             // the terrain table's column
  pace: string; roadPace?: string
  trail?: boolean          // companies follow the head's trail (a column of route)
  closeAcross?: boolean    // casualties close toward the colours across company boundaries
  place(g: Geometry): Placement[]
}
export interface TerrainDef { g: Record<string, number>; q: string; road?: boolean; level?: boolean }
export interface OrdersPreset { Lmax: number; Lmean: number; tau: number }
export interface Ruleset {
  name: string
  geometry: Geometry
  pace: Record<string, number>
  q: Record<string, Record<string, number>>
  formations: Record<string, FormationDef>
  changeTime: Record<string, number>; defaultChangeTime: number   // seconds, keyed 'from>to'
  start: { shape: string; orders: string }
  slopeK: number
  terrain: Record<string, TerrainDef>
  water: { curve: [number, number][]; limit: number }
  orders: Record<string, OrdersPreset>
  disorder: { Lok: number; kLag: number; kBow: number; kRec: number; scale: Record<string, number> }
  faceTime: number; dressTime: number
}

export interface ShapeLayout {
  name: string; def: FormationDef; kind: number
  place: Placement[]
  of: Int32Array        // [c][r][f] → bin within the company (0..2)
  posX: Float64Array; posZ: Float64Array   // [c][r][f] → place in the straight layout (heading 0)
  pairs: number[][]     // accordion: [bin ahead, bin behind, room]
  half: number          // half-width across travel
  turn: { cx: number; cz: number; m: Int32Array; bin: Int32Array } | null   // half-turn: slot map (c·R·F + r·F + f), bin map
  pace: number; roadPace: number   // indices into paces, −1 none
}
export interface Compiled {
  rs: Ruleset; hash: number; geo: Geometry
  NB: number; slots: number   // bins per formation, slots per formation
  shapes: ShapeLayout[]; shapeIndex(name: string): number
  kinds: string[]; paces: string[]; paceSpeed: Float64Array
  presets: string[]; presetIndex(name: string): number
  changeTime: Float64Array   // [from·S + to]
  qMax: number
  slope: Float64Array        // 401 entries over rise/run −1..1
}

export const rot2 = (x: number, z: number, a: number): [number, number] => [x * cos(a) - z * sin(a), x * sin(a) + z * cos(a)]
export const blockLocal = (g: Geometry, f: number, r: number): [number, number] => [(f - (g.files - 1) / 2) * g.fileSpacing, -r * g.rankSpacing]
export const slotIndex = (g: Geometry, c: number, r: number, f: number): number => (c * g.ranks + r) * g.files + f

// a stable hash of the ruleset's numbers and names (its functions by their output), recorded by a world
function rulesetHash(rs: Ruleset): number {
  const geo = rs.geometry
  const shapes = Object.keys(rs.formations).sort().map(n => { const d = rs.formations[n]; return [n, d.kind, d.pace, d.roadPace ?? '', !!d.trail, !!d.closeAcross, d.place(geo)] })
  const text = JSON.stringify([rs.name, geo, rs.pace, rs.q, shapes, rs.changeTime, rs.defaultChangeTime, rs.start, rs.slopeK, rs.terrain, rs.water, rs.orders, rs.disorder, rs.faceTime, rs.dressTime])
  return fnv1a(new TextEncoder().encode(text))
}

export function compileRuleset(rs: Ruleset): Compiled {
  const g = rs.geometry, C = g.companies, R = g.ranks, F = g.files, NB = C * 3
  const kinds = Object.keys(Object.values(rs.terrain)[0].g)
  const paces = Object.keys(rs.pace), paceSpeed = new Float64Array(paces.map(p => rs.pace[p]))
  const names = Object.keys(rs.formations)
  const shapes: ShapeLayout[] = names.map(name => layout(rs, name, kinds, paces))
  const S = names.length, changeTime = new Float64Array(S * S)
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) changeTime[a * S + b] = rs.changeTime[names[a] + '>' + names[b]] ?? rs.defaultChangeTime
  const presets = Object.keys(rs.orders)
  let qMax = 0; for (const t of Object.values(rs.q)) for (const v of Object.values(t)) qMax = Math.max(qMax, v)
  // Tobler's hiking curve capped at the drill pace, over rise/run −1..1 in 400 steps, from exact operations
  const slope = new Float64Array(401)
  for (let i = 0; i <= 400; i++) { const sl = i / 200 - 1, a = sl + 0.05 < 0 ? -(sl + 0.05) : sl + 0.05; slope[i] = Math.min(1, rs.slopeK * expNeg(3.5 * (a - 0.05))) }
  return {
    rs, hash: rulesetHash(rs), geo: g, NB, slots: C * R * F, shapes, kinds, paces, paceSpeed, presets, changeTime, qMax, slope,
    shapeIndex: n => names.indexOf(n), presetIndex: n => presets.indexOf(n),
  }
}
const expNeg = (x: number): number => exp(-x)

function layout(rs: Ruleset, name: string, kinds: string[], paces: string[]): ShapeLayout {
  const g = rs.geometry, C = g.companies, R = g.ranks, F = g.files, def = rs.formations[name]
  const place = def.place(g)
  if (place.length !== C) throw new Error(`shape ${name}: ${place.length} placements for ${C} companies`)
  const n = C * R * F, of = new Int32Array(n), posX = new Float64Array(n), posZ = new Float64Array(n)
  const box: { j: number; x0: number; x1: number; z0: number; z1: number }[] = []
  for (let c = 0; c < C; c++) {
    const ca = cos(place[c].rot), sa = sin(place[c].rot)
    let lo = Infinity, hi = -Infinity
    for (let r = 0; r < R; r++) for (let f = 0; f < F; f++) { const [lx, lz] = blockLocal(g, f, r), s = slotIndex(g, c, r, f)
      posX[s] = place[c].x + lx * ca - lz * sa; posZ[s] = place[c].z + lx * sa + lz * ca; lo = Math.min(lo, posX[s]); hi = Math.max(hi, posX[s]) }
    for (let k = 0; k < 3; k++) box.push({ j: c * 3 + k, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity })
    for (let r = 0; r < R; r++) for (let f = 0; f < F; f++) {
      const s = slotIndex(g, c, r, f), k = Math.min(2, Math.floor((posX[s] - lo) / Math.max(1e-6, hi - lo) * 3)), bx = box[c * 3 + k]
      of[s] = k; bx.x0 = Math.min(bx.x0, posX[s]); bx.x1 = Math.max(bx.x1, posX[s]); bx.z0 = Math.min(bx.z0, posZ[s]); bx.z1 = Math.max(bx.z1, posZ[s])
    }
  }
  // accordion: a bin wholly behind another, with men less than the gap apart across travel; rear-most last
  const pairs: number[][] = []
  for (const rb of [...box].sort((p, q) => q.z1 - p.z1 || p.j - q.j)) for (const ab of box)
    if (Math.floor(ab.j / 3) !== Math.floor(rb.j / 3) && ab.z0 > rb.z1 && ab.x0 < rb.x1 + g.accordionGap && rb.x0 < ab.x1 + g.accordionGap)
      pairs.push([ab.j, rb.j, ab.z0 - rb.z1 - g.accordionGap])
  let half = 0; for (let s = 0; s < n; s++) half = Math.max(half, Math.abs(posX[s]))
  // half-turn symmetry: the slot at the point reflection through the layout's centre
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let s = 0; s < n; s++) { x0 = Math.min(x0, posX[s]); x1 = Math.max(x1, posX[s]); z0 = Math.min(z0, posZ[s]); z1 = Math.max(z1, posZ[s]) }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, m = new Int32Array(n).fill(-1)
  for (let s = 0; s < n; s++) for (let q = 0; q < n; q++)
    if (Math.abs(posX[q] - (2 * cx - posX[s])) < 1e-6 && Math.abs(posZ[q] - (2 * cz - posZ[s])) < 1e-6) { m[s] = q; break }
  let turn: ShapeLayout['turn'] = null
  if (m.every(q => q >= 0)) {
    const bin = new Int32Array(C * 3)
    for (let s = 0; s < n; s++) { const c = Math.floor(s / (R * F)), c2 = Math.floor(m[s] / (R * F)); bin[c * 3 + of[s]] = c2 * 3 + of[m[s]] }
    turn = { cx, cz, m, bin }
  }
  const kind = kinds.indexOf(def.kind)
  if (kind < 0) throw new Error(`shape ${name}: kind ${def.kind} not in the terrain table`)
  return { name, def, kind, place, of, posX, posZ, pairs, half, turn, pace: paces.indexOf(def.pace), roadPace: def.roadPace ? paces.indexOf(def.roadPace) : -1 }
}

export const HALF_PI = PI / 2
