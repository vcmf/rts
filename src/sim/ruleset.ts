// Era rulesets (decision 0015): everything era-specific is data the world is created with: the block
// geometry, shapes and change times, paces, the terrain table, drill presets. The sim never imports a
// ruleset (decision 0005); `compileRuleset` turns one into indexed tables and precomputes each shape's
// layout, bins, accordion pairs and half-turn symmetry.
import { cos, sin, PI, exp } from './num.ts'
import { fnv1a } from './hash.ts'
import { DT } from './time.ts'

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
// fire by company (docs/plans/active/s1c-fire-morale.md): who can hit whom, how often and how hard
export interface FireDef {
  arc: number                  // half-angle about a company's facing, radians
  maxRange: number             // metres, company centre to company centre
  pRange: [number, number][]   // hit chance per round by range (metres), linear between points, 0 past the last
  reload: number; reloadJitter: number   // seconds per volley, and its spread (a share, drawn per volley)
  firingRanks: number          // the front ranks that fire
  misfire: number              // share of rounds that do not go off
  depth: Record<string, number>          // how easy a target is to hit, by its kind
  state: Record<string, number>          // how well a battalion fires, by morale state (steady, shaken, wavering)
  cohesion: number             // fire falls by this share at full disorder
  eye: number                  // eye height above the ground, metres
  sight: Record<string, number>          // metres of a terrain class a sight line may cross (classes not named: any)
}
// loss-driven morale: morale relaxes toward quality less losses; the states follow it with hysteresis
export interface MoraleDef {
  quality: number              // a battalion's quality when the scenario gives none (0..1)
  losses: number; recent: number   // weights of the share of men lost, and of men lost recently
  recentTime: number           // seconds over which recent losses decay (e-folding)
  relaxTime: number            // seconds for morale to close 63% of the gap to its target
  shaken: [number, number]; wavering: [number, number]   // [enter below, leave at or above]
  rout: number                 // routs below this
  routPace: number             // a router's pace, times its shape's
  // S1c-2 (docs/plans/active/s1c2-morale-machine.md)
  contagion: { shock: number; front: number; back: number }   // a friend's break: the morale lost at 0 m, falling to 0 at front (ahead of the side's front) or back metres
  support: { bonus: number; reach: number; arc: number }      // per secured flank: target bonus; a friend within reach metres and arc radians of the left or right axis
  fallback: { metres: number; after: number }                 // a wavering battalion without orders Retires this far once its morale has fallen for `after` seconds
  rally: { safe: number; calm: number; time: number; cost: number; max: number }   // no enemy in the fight within safe metres, no loss for calm s; re-forms for time s; quality lost; rallies allowed
  shatter: number              // a router below this share of its spawn strength shatters
}
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
  fire: FireDef
  morale: MoraleDef
}

export interface ShapeLayout {
  name: string; def: FormationDef; kind: number
  place: Placement[]
  of: Int32Array        // [c][r][f] → bin within the company (0..2)
  posX: Float64Array; posZ: Float64Array   // [c][r][f] → place in the straight layout (heading 0)
  pairs: number[][]     // accordion: [bin ahead, bin behind, room]
  half: number          // half-width across travel
  turn: { cx: number; cz: number; m: Int32Array; bin: Int32Array; flipsFiles: boolean } | null   // half-turn: slot map (c·R·F + r·F + f), bin map, whether files reverse
  pace: number; roadPace: number   // indices into paces, −1 none
  trailLimit: number   // a trail shape's trail length: its depth, two company frontages and 12 m
  depth: number        // how far the layout reaches behind the anchor
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
  depthByKind: Float64Array  // fire: the target's depth factor, by kind
  sightByClass: Float64Array // fire: metres of each terrain class a sight line may cross (Infinity: any)
  cosArc: number             // fire: cos of the arc's half-angle
  stateFactor: Float64Array  // fire: by morale state (steady, shaken, wavering; a router does not fire)
  recentDecay: number        // morale: recent losses' factor per tick
  relax: number              // morale: the share of the gap to its target closed per tick
  supportCos: number         // morale: cos of the support arc
}

// the morale states that fire, in MS_* order (world.ts)
export const FIRING_STATES = ['steady', 'shaken', 'wavering']
// each company is split in this many lateral bins (the lag model's sample points)
export const BINS = 3
export const MAX_BINS = 32   // bins per formation: bit masks are 32-bit

export const rot2 = (x: number, z: number, a: number): [number, number] => [x * cos(a) - z * sin(a), x * sin(a) + z * cos(a)]
export const blockLocal = (g: Geometry, f: number, r: number): [number, number] => [(f - (g.files - 1) / 2) * g.fileSpacing, -r * g.rankSpacing]
export const slotIndex = (g: Geometry, c: number, r: number, f: number): number => (c * g.ranks + r) * g.files + f

// a stable hash of the ruleset's numbers and names (its functions by their output), recorded by a world
function rulesetHash(rs: Ruleset): number {
  const geo = rs.geometry
  const shapes = Object.keys(rs.formations).sort().map(n => { const d = rs.formations[n]; return [n, d.kind, d.pace, d.roadPace ?? '', !!d.trail, !!d.closeAcross, d.place(geo)] })
  const text = JSON.stringify([rs.name, geo, rs.pace, rs.q, shapes, rs.changeTime, rs.defaultChangeTime, rs.start, rs.slopeK, rs.terrain, rs.water, rs.orders, rs.disorder, rs.faceTime, rs.dressTime, rs.fire, rs.morale])
  return fnv1a(new TextEncoder().encode(text))
}

export function compileRuleset(rs: Ruleset): Compiled {
  const g = rs.geometry, C = g.companies, R = g.ranks, F = g.files, NB = C * BINS
  if (NB > MAX_BINS) throw new Error(`ruleset ${rs.name}: ${C} companies make ${NB} bins, more than ${MAX_BINS}`)
  if (R * F > 32) throw new Error(`ruleset ${rs.name}: a company of ${R * F} slots, more than a 32-bit mask holds (the re-packing gate)`)
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
  const depthByKind = new Float64Array(kinds.map(k => rs.fire.depth[k] ?? 1))
  const sightByClass = new Float64Array(Object.keys(rs.terrain).map(c => rs.fire.sight[c] ?? Infinity))
  for (const s of FIRING_STATES) if (!(s in rs.fire.state)) throw new Error(`ruleset ${rs.name}: fire.state has no ${s}`)
  if (rs.fire.pRange.some((p, k) => k > 0 && p[0] <= rs.fire.pRange[k - 1][0])) throw new Error(`ruleset ${rs.name}: fire.pRange ranges must increase`)
  // one friend's break must not rout a steady battalion of default quality on its own (s1c-plan-review L2)
  const M = rs.morale
  if (M.contagion.shock > 0.6 * (M.quality - M.rout)) throw new Error(`ruleset ${rs.name}: morale.contagion.shock over 0.6 of the gap from the default quality to the rout`)
  return {
    rs, hash: rulesetHash(rs), geo: g, NB, slots: C * R * F, shapes, kinds, paces, paceSpeed, presets, changeTime, qMax, slope,
    depthByKind, sightByClass, cosArc: cos(rs.fire.arc), stateFactor: new Float64Array(FIRING_STATES.map(s => rs.fire.state[s])), recentDecay: exp(-DT / rs.morale.recentTime), relax: 1 - exp(-DT / rs.morale.relaxTime), supportCos: cos(rs.morale.support.arc),
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
    for (let k = 0; k < BINS; k++) box.push({ j: c * BINS + k, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity })
    for (let r = 0; r < R; r++) for (let f = 0; f < F; f++) {
      const s = slotIndex(g, c, r, f), k = Math.min(BINS - 1, Math.floor((posX[s] - lo) / Math.max(1e-6, hi - lo) * BINS)), bx = box[c * BINS + k]
      of[s] = k; bx.x0 = Math.min(bx.x0, posX[s]); bx.x1 = Math.max(bx.x1, posX[s]); bx.z0 = Math.min(bx.z0, posZ[s]); bx.z1 = Math.max(bx.z1, posZ[s])
    }
  }
  // accordion: a bin wholly behind another, with men less than the gap apart across travel; rear-most last
  const pairs: number[][] = []
  for (const rb of [...box].sort((p, q) => q.z1 - p.z1 || p.j - q.j)) for (const ab of box)
    if (Math.floor(ab.j / BINS) !== Math.floor(rb.j / BINS) && ab.z0 > rb.z1 && ab.x0 < rb.x1 + g.accordionGap && rb.x0 < ab.x1 + g.accordionGap)
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
    const bin = new Int32Array(C * BINS)
    for (let s = 0; s < n; s++) { const c = Math.floor(s / (R * F)), c2 = Math.floor(m[s] / (R * F)); bin[c * BINS + of[s]] = c2 * BINS + of[m[s]] }
    turn = { cx, cz, m, bin, flipsFiles: F > 1 && m[0] % F === F - 1 }
  }
  const kind = kinds.indexOf(def.kind)
  if (kind < 0) throw new Error(`shape ${name}: kind ${def.kind} not in the terrain table`)
  let depth = 0; for (const p of place) depth = Math.max(depth, -p.z)
  const trailLimit = depth + 2 * g.files * g.fileSpacing + 12
  return { name, def, kind, place, of, posX, posZ, pairs, half, turn, pace: paces.indexOf(def.pace), roadPace: def.roadPace ? paces.indexOf(def.roadPace) : -1, trailLimit, depth }
}

export const HALF_PI = PI / 2
