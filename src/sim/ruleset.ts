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
  bins: number                                       // lateral bins per company (the lag model's sample points)
}
export interface FormationDef {
  kind: string             // the terrain table's column
  pace: string; roadPace?: string
  trail?: boolean          // companies follow the head's trail (a column of route)
  closeAcross?: boolean    // casualties close toward the colours across company boundaries
  // a trail shape's spacing of files and ranks when it is not the block's (a column of route of horses, nose
  // to tail): its places only; a change into or out of it passes through the block's spacing
  step?: { file: number; rank: number }
  braced?: boolean         // proof against a charge from any side (the square; S1d-2)
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
  fallback: { metres: number; after: number; rate: number }   // a wavering battalion without orders Retires `metres` once its morale has fallen by more than `rate` a second for `after` seconds
  rally: { safe: number; calm: number; time: number; cost: number; max: number }   // no enemy in the fight within safe metres, no loss for calm s; re-forms for time s; quality lost; rallies allowed
  shatter: number              // a router below this share of its spawn strength shatters
}
// a type that charges (S1d-2, docs/systems/melee.md): the shapes it charges from, its paces (the approach
// until gallopAt metres from the target, then the gallop), the metres of gallop for full momentum, the gap at
// which the test before contact is taken, the recoil's metres, and the seconds it is blown after a charge and
// pursues a broken foe
export interface ChargeDef { shapes: string[]; approach: string; pace: string; gallopAt: number; build: number; test: number; recoil: number; rest: number; pursue: number }
export interface Quarters { front: number; flank: number; rear: number }
// melee and the charge's effects (S1d-2): contact and its hold (metres between blocks); the threat's morale
// shock at the test and the impact's, by the side the charge comes from; the impact's losses (a share of the
// other's men in contact at full momentum); the melee's losses per second per man in contact, by kind; the
// chance a charger turns from a braced target and breaks into a wavering one; the refuge (a square) against a
// charging enemy
export interface MeleeDef {
  contact: number; hold: number
  threat: Quarters
  impact: { kill: number; shock: Quarters }
  rate: number; strength: Record<string, number>; cohesion: number
  refuse: number; breach: number
  refuge: { alert: number; closing: number; react: number; hold: number }   // forming the refuge shape against a charging enemy: metres, m/s, seconds, seconds
}
// a unit type (S1d-1): its block, its shapes and their change times. A formation is of one type for life
export interface UnitType {
  geometry: Geometry
  formations: Record<string, FormationDef>
  changeTime: Record<string, number>; defaultChangeTime: number   // seconds, keyed 'from>to'
  start: string                // the shape a spawn takes when it names none
  fires: boolean               // fires by company (S1c's musketry)
  figure: 'foot' | 'mounted' | 'crewed'   // how its men are drawn: on foot, on horseback, or serving pieces (the renderer's; no rule reads it)
  charge?: ChargeDef           // it charges (S1d-2)
  refuge?: string              // the shape it forms against a charging enemy (S1d-2, the standing behaviour)
}
export interface Ruleset {
  name: string
  types: Record<string, UnitType>   // the first is the default
  pace: Record<string, number>
  q: Record<string, Record<string, number>>
  start: { orders: string }
  slopeK: number
  terrain: Record<string, TerrainDef>
  water: { curve: [number, number][]; limit: number; limitByKind?: Record<string, number> }   // limit: metres, deeper is impassable (per kind where named)
  orders: Record<string, OrdersPreset>
  disorder: { Lok: number; kLag: number; kBow: number; kRec: number; scale: Record<string, number> }
  faceTime: number; dressTime: number
  fire: FireDef
  morale: MoraleDef
  melee: MeleeDef
}

export interface ShapeLayout {
  name: string; def: FormationDef; kind: number
  place: Placement[]
  of: Int32Array        // [c][r][f] → bin within the company (0..bins − 1)
  posX: Float64Array; posZ: Float64Array   // [c][r][f] → place in the straight layout (heading 0)
  pairs: number[][]     // accordion: [bin ahead, bin behind, room]
  half: number          // half-width across travel
  turn: { cx: number; cz: number; m: Int32Array; bin: Int32Array; flipsFiles: boolean } | null   // half-turn: slot map (c·R·F + r·F + f), bin map, whether files reverse
  pace: number; roadPace: number   // indices into paces, −1 none
  fileStep: number     // metres between files in its places (the block's, or a trail shape's step)
  kx: number; kz: number   // its places' spacing of files and of ranks over the block's (1 but for a step)
  spread: number       // the larger of kx, kz and 1: how much farther than the block a company's places reach
  trailLimit: number   // a trail shape's trail length: its depth, two company frontages and 12 m, and at least 24 m past its farthest place
  depth: number        // how far the layout reaches behind the anchor
  extent: Float64Array // [c·3 + 0..2]: company c's nearest and farthest place behind the anchor (−posZ), its widest |posX|
}
// a unit type compiled: what one block needs (its slots, bins and shapes)
export interface TypeTable {
  name: string; def: UnitType; geo: Geometry
  C: number; NB: number; slots: number   // companies, bins and slots of a formation of this type
  qMax: number               // the largest hurry factor of its shapes' paces (how far a man may step in a tick)
  slotC: Int32Array                                         // each slot's company
  slotLX: Float64Array; slotLZ: Float64Array                // each slot's place in its company block (blockLocal)
  slotReach: number                                         // the farthest place in a company block from its origin
  shapes: ShapeLayout[]; shapeIndex(name: string): number
  changeTime: Float64Array   // [from·S + to]
  start: number              // the spawn's shape
  charge: { from: Uint8Array; approach: number; pace: number } | null   // the shapes it charges from (1 by shape) and its paces' indices; null: it does not charge
  refuge: number             // the shape it forms against cavalry, −1 none
}
export interface Compiled {
  rs: Ruleset; hash: number
  types: TypeTable[]; typeIndex(name: string): number
  // the strides of the world's per-formation buffers: the most companies, bins and slots of any type (a
  // formation of a smaller type leaves the rest of its row unused)
  maxC: number; maxNB: number; maxSlots: number
  trail: number               // points in a formation's trail ring (trailRing)
  kinds: string[]; paces: string[]; paceSpeed: Float64Array
  presets: string[]; presetIndex(name: string): number
  slope: Float64Array        // 401 entries over rise/run −1..1
  depthByKind: Float64Array  // fire: the target's depth factor, by kind
  sightByClass: Float64Array // fire: metres of each terrain class a sight line may cross (Infinity: any)
  cosArc: number             // fire: cos of the arc's half-angle
  stateFactor: Float64Array  // fire: by morale state (steady, shaken, wavering; a router does not fire)
  recentDecay: number        // morale: recent losses' factor per tick
  relax: number              // morale: the share of the gap to its target closed per tick
  supportCos: number         // morale: cos of the support arc
  strengthByKind: Float64Array   // melee: strength by kind
}

// the morale states that fire, in MS_* order (world.ts)
export const FIRING_STATES = ['steady', 'shaken', 'wavering']
// companies per battalion: per-company scratch and the re-packing gate's company mask are sized by it
export const MAX_COMPANIES = 32
// a formation's trail ring: at least TRAIL_MIN points, more for a deep trail shape, never past TRAIL_MAX
export const TRAIL_MIN = 256, TRAIL_MAX = 4096

// the ruleset with one type's block changed (tests and tools: the S1a block, the ceiling)
export const withBlock = (rs: Ruleset, type: string, g: Partial<Geometry>): Ruleset =>
  ({ ...rs, types: { ...rs.types, [type]: { ...rs.types[type], geometry: { ...rs.types[type].geometry, ...g } } } })
export const rot2 = (x: number, z: number, a: number): [number, number] => [x * cos(a) - z * sin(a), x * sin(a) + z * cos(a)]
export const blockLocal = (g: Geometry, f: number, r: number): [number, number] => [(f - (g.files - 1) / 2) * g.fileSpacing, -r * g.rankSpacing]
export const slotIndex = (g: Geometry, c: number, r: number, f: number): number => (c * g.ranks + r) * g.files + f

// a stable hash of the ruleset's numbers and names (its functions by their output), recorded by a world
function rulesetHash(rs: Ruleset): number {
  const types = Object.keys(rs.types).map(t => { const u = rs.types[t], geo = u.geometry
    return [t, geo, Object.keys(u.formations).sort().map(n => { const d = u.formations[n]; return [n, d.kind, d.pace, d.roadPace ?? '', !!d.trail, !!d.closeAcross, d.step ?? null, !!d.braced, d.place(geo)] }), u.changeTime, u.defaultChangeTime, u.start, u.fires, u.figure, u.charge ?? null, u.refuge ?? ''] })
  const text = JSON.stringify([rs.name, types, rs.pace, rs.q, rs.start, rs.slopeK, rs.terrain, rs.water, rs.orders, rs.disorder, rs.faceTime, rs.dressTime, rs.fire, rs.morale, rs.melee])
  return fnv1a(new TextEncoder().encode(text))
}

// a unit type's tables
function compileType(rs: Ruleset, name: string, kinds: string[], paces: string[]): TypeTable {
  const u = rs.types[name], g = u.geometry, C = g.companies, R = g.ranks, F = g.files, NB = C * g.bins, at = `ruleset ${rs.name}, type ${name}`
  if (!(C >= 1 && C <= MAX_COMPANIES)) throw new Error(`${at}: ${C} companies, outside 1..${MAX_COMPANIES}`)
  if (!(Number.isInteger(g.bins) && g.bins >= 1 && g.bins <= F)) throw new Error(`${at}: geometry.bins must be a whole number in 1..files`)
  const names = Object.keys(u.formations)
  const shapes: ShapeLayout[] = names.map(n => layout(g, u.formations, n, kinds, paces))
  const S = names.length, changeTime = new Float64Array(S * S)
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) changeTime[a * S + b] = u.changeTime[names[a] + '>' + names[b]] ?? u.defaultChangeTime
  const start = names.indexOf(u.start)
  if (start < 0) throw new Error(`${at}: start shape ${u.start} is not one of its shapes`)
  const slots = C * R * F, slotC = new Int32Array(slots), slotLX = new Float64Array(slots), slotLZ = new Float64Array(slots)
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) for (let f = 0; f < F; f++) { const s = slotIndex(g, c, r, f), [lx, lz] = blockLocal(g, f, r)
    slotC[s] = c; slotLX[s] = lx; slotLZ[s] = lz }
  let slotReach = 0; for (let s = 0; s < slots; s++) slotReach = Math.max(slotReach, Math.sqrt(slotLX[s] * slotLX[s] + slotLZ[s] * slotLZ[s]))
  // at least 1: a pace with no q table hurries at 1 (groundQAt)
  let charge: TypeTable['charge'] = null
  if (u.charge) {
    const ch = u.charge, from = new Uint8Array(S), approach = paces.indexOf(ch.approach), pace = paces.indexOf(ch.pace)
    for (const n of ch.shapes) { const k = names.indexOf(n); if (k < 0) throw new Error(`${at}: it charges from ${n}, not one of its shapes`); if (u.formations[n].trail) throw new Error(`${at}: it charges from ${n}, a trail shape`); from[k] = 1 }
    if (approach < 0 || pace < 0) throw new Error(`${at}: a charge pace is not one of the paces`)
    if (!(ch.gallopAt >= ch.test && ch.test > rs.melee.contact && ch.build > 0)) throw new Error(`${at}: the charge needs gallopAt ≥ test > melee.contact and build > 0`)
    charge = { from, approach, pace }
  }
  const refuge = u.refuge === undefined ? -1 : names.indexOf(u.refuge)
  if (u.refuge !== undefined && (refuge < 0 || !u.formations[u.refuge].braced)) throw new Error(`${at}: its refuge ${u.refuge} is not one of its braced shapes`)
  const own = [...shapes.flatMap(L => [L.pace, L.roadPace]), ...(charge ? [charge.approach, charge.pace] : [])]
  let qMax = 1; for (const p of own) if (p >= 0) for (const v of Object.values(rs.q[paces[p]] ?? {})) qMax = Math.max(qMax, v)
  return { name, def: u, geo: g, C, NB, slots, qMax, slotC, slotLX, slotLZ, slotReach, shapes, shapeIndex: n => names.indexOf(n), changeTime, start, charge, refuge }
}

export function compileRuleset(rs: Ruleset): Compiled {
  const kinds = Object.keys(Object.values(rs.terrain)[0].g)
  const paces = Object.keys(rs.pace), paceSpeed = new Float64Array(paces.map(p => rs.pace[p]))
  const typeNames = Object.keys(rs.types)
  if (!typeNames.length) throw new Error(`ruleset ${rs.name}: no unit types`)
  const types = typeNames.map(t => compileType(rs, t, kinds, paces))
  const presets = Object.keys(rs.orders)
  // Tobler's hiking curve capped at the drill pace, over rise/run −1..1 in 400 steps, from exact operations
  const slope = new Float64Array(401)
  for (let i = 0; i <= 400; i++) { const sl = i / 200 - 1, a = sl + 0.05 < 0 ? -(sl + 0.05) : sl + 0.05; slope[i] = Math.min(1, rs.slopeK * expNeg(3.5 * (a - 0.05))) }
  const depthByKind = new Float64Array(kinds.map(k => rs.fire.depth[k] ?? 1))
  const sightByClass = new Float64Array(Object.keys(rs.terrain).map(c => rs.fire.sight[c] ?? Infinity))
  for (const s of FIRING_STATES) if (!(s in rs.fire.state)) throw new Error(`ruleset ${rs.name}: fire.state has no ${s}`)
  if (rs.fire.pRange.some((p, k) => k > 0 && p[0] <= rs.fire.pRange[k - 1][0])) throw new Error(`ruleset ${rs.name}: fire.pRange ranges must increase`)
  for (const k of Object.keys(rs.water.limitByKind ?? {})) if (!kinds.includes(k)) throw new Error(`ruleset ${rs.name}: a wading limit names ${k}, not a kind of the terrain table`)
  // one friend's break must not rout a steady battalion of default quality on its own (s1c-plan-review L2)
  const M = rs.morale
  if (M.contagion.shock > 0.6 * (M.quality - M.rout)) throw new Error(`ruleset ${rs.name}: morale.contagion.shock over 0.6 of the gap from the default quality to the rout`)
  if (!(M.rally.max >= 0 && M.rally.max < 255)) throw new Error(`ruleset ${rs.name}: morale.rally.max must be 0..254 (the break count is a byte)`)
  if (!(M.support.arc > 0 && M.support.arc <= PI / 2)) throw new Error(`ruleset ${rs.name}: morale.support.arc must be in (0, π/2]: wider, a friend ahead would count as a flank`)
  for (const k of Object.keys(rs.melee.strength)) if (!kinds.includes(k)) throw new Error(`ruleset ${rs.name}: melee.strength names ${k}, not a kind of the terrain table`)
  let maxC = 0, maxNB = 0, maxSlots = 0
  for (const t of types) { maxC = Math.max(maxC, t.C); maxNB = Math.max(maxNB, t.NB); maxSlots = Math.max(maxSlots, t.slots) }
  return {
    rs, hash: rulesetHash(rs), types, typeIndex: n => typeNames.indexOf(n), maxC, maxNB, maxSlots, trail: trailRing(rs, types), kinds, paces, paceSpeed, presets, slope,
    depthByKind, sightByClass, cosArc: cos(rs.fire.arc), stateFactor: new Float64Array(FIRING_STATES.map(s => rs.fire.state[s])), recentDecay: exp(-DT / rs.morale.recentTime), relax: 1 - exp(-DT / rs.morale.relaxTime), supportCos: cos(rs.morale.support.arc),
    strengthByKind: new Float64Array(kinds.map(k => rs.melee.strength[k] ?? 1)),
    presetIndex: n => presets.indexOf(n),
  }
}
const expNeg = (x: number): number => exp(-x)
// a trail shape's trail, and the one Face about rebuilds, must fit the ring (0.25 m points): the ring is
// the smallest multiple of 64 points that holds the deepest, at least TRAIL_MIN
function trailRing(rs: Ruleset, types: TypeTable[]): number {
  let lmax = 0; for (const p of Object.values(rs.orders)) lmax = Math.max(lmax, p.Lmax)
  let need = 0
  for (const t of types) for (const s of t.shapes) if (s.def.trail) need = Math.max(need, Math.max(s.trailLimit, 15 + (s.turn ? -2 * s.turn.cz : s.depth) + lmax) / 0.25 + 16)
  const n = Math.max(TRAIL_MIN, Math.ceil(need / 64) * 64)
  if (n > TRAIL_MAX) throw new Error(`ruleset ${rs.name}: a trail of ${n} points does not fit ${TRAIL_MAX}`)
  return n
}

function layout(g: Geometry, formations: Record<string, FormationDef>, name: string, kinds: string[], paces: string[]): ShapeLayout {
  const C = g.companies, R = g.ranks, F = g.files, B = g.bins, def = formations[name]
  const place = def.place(g)
  if (def.step && !def.trail) throw new Error(`shape ${name}: a step needs a trail shape (a straight shape's places are the block's)`)
  const gs: Geometry = def.step ? { ...g, fileSpacing: def.step.file, rankSpacing: def.step.rank } : g   // the spacing of its places
  if (place.length !== C) throw new Error(`shape ${name}: ${place.length} placements for ${C} companies`)
  const n = C * R * F, of = new Int32Array(n), posX = new Float64Array(n), posZ = new Float64Array(n)
  const box: { j: number; x0: number; x1: number; z0: number; z1: number }[] = []
  for (let c = 0; c < C; c++) {
    const ca = cos(place[c].rot), sa = sin(place[c].rot)
    let lo = Infinity, hi = -Infinity
    for (let r = 0; r < R; r++) for (let f = 0; f < F; f++) { const [lx, lz] = blockLocal(gs, f, r), s = slotIndex(g, c, r, f)
      posX[s] = place[c].x + lx * ca - lz * sa; posZ[s] = place[c].z + lx * sa + lz * ca; lo = Math.min(lo, posX[s]); hi = Math.max(hi, posX[s]) }
    for (let k = 0; k < B; k++) box.push({ j: c * B + k, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity })
    for (let r = 0; r < R; r++) for (let f = 0; f < F; f++) {
      const s = slotIndex(g, c, r, f), k = Math.min(B - 1, Math.floor((posX[s] - lo) / Math.max(1e-6, hi - lo) * B)), bx = box[c * B + k]
      of[s] = k; bx.x0 = Math.min(bx.x0, posX[s]); bx.x1 = Math.max(bx.x1, posX[s]); bx.z0 = Math.min(bx.z0, posZ[s]); bx.z1 = Math.max(bx.z1, posZ[s])
    }
  }
  // accordion: a bin wholly behind another, with men less than the gap apart across travel; rear-most last
  const pairs: number[][] = []
  for (const rb of [...box].sort((p, q) => q.z1 - p.z1 || p.j - q.j)) for (const ab of box)
    if (Math.floor(ab.j / B) !== Math.floor(rb.j / B) && ab.z0 > rb.z1 && ab.x0 < rb.x1 + g.accordionGap && rb.x0 < ab.x1 + g.accordionGap)
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
    const bin = new Int32Array(C * B)
    for (let s = 0; s < n; s++) { const c = Math.floor(s / (R * F)), c2 = Math.floor(m[s] / (R * F)); bin[c * B + of[s]] = c2 * B + of[m[s]] }
    turn = { cx, cz, m, bin, flipsFiles: F > 1 && m[0] % F === F - 1 }
  }
  const kind = kinds.indexOf(def.kind)
  if (kind < 0) throw new Error(`shape ${name}: kind ${def.kind} not in the terrain table`)
  let depth = 0; for (const p of place) depth = Math.max(depth, -p.z)
  const extent = new Float64Array(C * 3)
  for (let c = 0; c < C; c++) { extent[c * 3] = Infinity; extent[c * 3 + 1] = -Infinity
    for (let s = c * R * F; s < (c + 1) * R * F; s++) { extent[c * 3] = Math.min(extent[c * 3], -posZ[s]); extent[c * 3 + 1] = Math.max(extent[c * 3 + 1], -posZ[s]); extent[c * 3 + 2] = Math.max(extent[c * 3 + 2], Math.abs(posX[s])) } }
  let far = 0; for (let c = 0; c < C; c++) far = Math.max(far, extent[c * 3 + 1])
  const trailLimit = Math.max(depth + 2 * g.files * g.fileSpacing + 12, far + 24)
  return { name, def, kind, place, of, posX, posZ, pairs, half, turn, pace: paces.indexOf(def.pace), roadPace: def.roadPace ? paces.indexOf(def.roadPace) : -1, fileStep: gs.fileSpacing, kx: gs.fileSpacing / g.fileSpacing, kz: gs.rankSpacing / g.rankSpacing,
    spread: Math.max(1, gs.fileSpacing / g.fileSpacing, gs.rankSpacing / g.rankSpacing), trailLimit, depth, extent }
}

export const HALF_PI = PI / 2
