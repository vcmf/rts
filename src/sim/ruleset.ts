// Era rulesets (decision 0015): everything era-specific is data the world is created with: the block
// geometry, shapes and change times, paces, the terrain table, drill presets. The sim never imports a
// ruleset (decision 0005); `compileRuleset` turns one into indexed tables and precomputes each shape's
// layout, bins, accordion pairs and half-turn symmetry.
import { cos, sin, PI, exp } from './num.ts'
import { fnv1a } from './hash.ts'

// a company in the battalion frame
export interface Placement {
  x: number
  z: number
  rot: number
  face: number
}
export interface Geometry {
  // a company is a block of files × ranks
  companies: number
  files: number
  ranks: number
  // metres
  fileSpacing: number
  rankSpacing: number
  minSpacing: number // closest two men may stand (turn radius of a trail shape)
  accordionGap: number // closest a file may come to the file ahead of it
  bins: number // lateral bins per company (the lag model's sample points)
}
export interface FormationDef {
  kind: string // the terrain table's column
  pace: string
  roadPace?: string
  trail?: boolean // companies follow the head's trail (a column of route)
  closeAcross?: boolean // casualties close toward the colours across company boundaries
  // a trail shape's spacing of files and ranks when it is not the block's (a column of route of horses, nose
  // to tail): its places only; a change into or out of it passes through the block's spacing
  step?: { file: number; rank: number }
  allRound?: boolean // no flank: every side a front (the square)
  traits?: TraitsDef // its strengths and weaknesses; none: neutral
  place(g: Geometry): Placement[]
}
// a shape's compiled traits (TypeTable.traits), a row of T_LEN per shape, read through src/sim/traits.ts: hits taken
// from the front, from the flank and the rear as multiples of it, whether those two are given, melee, brace by the side
// struck, whether it has no flank, its fire, the shocks it takes, the charge's shock from its flank, the sector blend's
// centre and whether it may move
export const T_HITS = 0
export const T_FLANK = 1
export const T_REAR = 2
export const T_SIDED = 3
export const T_MELEE = 4
export const T_BRACE = 5 // struck in front
export const T_ROUND = 6 // 1: no flank, every side a front (the shape's allRound)
export const T_FIRE = 7
export const T_SHOCK = 8
export const T_BRACE_FLANK = 9
export const T_BRACE_REAR = 10
export const T_FLANK_SHOCK = 11
export const T_BLEND = 12 // the sector blend's centre on the angle measure (sectors.blend.T, or the flankFrom)
export const T_MOVES = 13 // 1: it may be given a move
export const T_LEN = 14
// a unit's enabled shapes are a bit each in an int32 (World f.enabled)
export const MAX_SHAPES = 31
/** Bracing by the side a charge strikes, each 0..1; a number: the same on every side. */
export type BraceDef = number | { front?: number; flank?: number; rear?: number }
/**
 * A shape's strengths and weaknesses (docs/proposals/formations.md § 5a), multipliers read through
 * src/sim/traits.ts; a field left out is neutral.
 */
export interface TraitsDef {
  // hits taken from musketry and canister: from its front (how easy a target it is), and from its flank and its rear
  // as multiples of the front's (each ≥ 1: fire from the front is never the worst; docs/proposals/sectors-model.md
  // § 5); none: 1
  hits?: { front?: number; flank?: number; rear?: number }
  melee?: number // its strength in melee
  brace?: BraceDef // how far it is proof against a charge, by the side struck (the square 1; S1d-2); none: 0
  fire?: number // ≥ 0: the share of its musketry's hit chance (geometry already masks what cannot fire); none: 1
  shock?: number // the morale shocks it takes: a charge's, contagion's and the drain (never its losses' cost); none: 1
  flankShock?: number // a charge's shock from its flank, as a multiple; none: 1
  // radians off straight ahead from its front's ends where its flank begins (the front's sector blend's centre,
  // docs/proposals/sectors-model.md § 3; the rear's stays the ruleset's); none: sectors.blend.T
  flankFrom?: number
  moves?: boolean // whether it may be given a move (the square cannot); none: true
}
export interface TerrainDef {
  g: Record<string, number>
  q: string
  road?: boolean
  level?: boolean
}
export interface OrdersPreset {
  Lmax: number
  Lmean: number
  tau: number
}
// fire by company (docs/plans/active/s1c-fire-morale.md): who can hit whom, how often and how hard
export interface FireDef {
  arc: number // half-angle about a company's facing, radians
  maxRange: number // metres, company centre to company centre
  pRange: [number, number][] // hit chance per round by range (metres), linear between points, 0 past the last
  // seconds per volley, and its spread (a share, drawn per volley)
  reload: number
  reloadJitter: number
  firingRanks: number // the front ranks that fire
  misfire: number // share of rounds that do not go off
  state: Record<string, number> // how well a battalion fires, by morale state (steady, shaken, wavering)
  cohesion: number // fire falls by this share at full disorder
  eye: number // eye height above the ground, metres
  sight: Record<string, number> // metres of a terrain class a sight line may cross (classes not named: any)
}
// the morale bar (docs/proposals/morale-bar-model.md), in points: level 2's bar holds 100
export interface MoraleDef {
  level: number // a formation's level when the scenario gives none (1..6)
  loss: number // points the whole spawn strength costs; a man lost costs loss / start
  regen: number // points a second the bar recovers in the fight, up to its maximum less what its losses cost
  scar: number // the share of its losses' cost a bar never recovers (0..1)
  // shares of the bar's maximum: [enter below, leave at or above]
  shaken: [number, number]
  wavering: [number, number]
  routPace: number // a router's pace, times its shape's
  // S1c-2 (docs/plans/active/s1c2-morale-machine.md)
  // a friend's break: the points lost at 0 m, falling to 0 at front (ahead of the side's front) or back metres
  contagion: { shock: number; front: number; back: number }
  // the back exposed (decision 0086): points off the effective bar per weight of flank and of rear of the worst enemy
  // that can hurt it (docs/proposals/sectors-model.md § 5)
  drain: { flank: number; rear: number }
  // per secured flank: points on the effective bar; a friend within reach metres and arc radians of the left or right
  // axis
  support: { bonus: number; reach: number; arc: number }
  // no enemy in the fight within safe metres, no loss for calm s; re-forms for time s; its maximum cut by the share
  // cut, its bar refilled to the share `share` of it; rallies allowed
  rally: { safe: number; calm: number; time: number; cut: number; share: number; max: number }
  shatter: number // a router below this share of its spawn strength shatters
  // a shattered formation with any corner of a company block this near the map's edge (metres) leaves the field
  leave: number
}
// an experience level (docs/proposals/morale-bar-model.md § 8): its name, the points to reach it, its bar's maximum,
// and its effects as factors (owed men ÷ toughness; reload, change times and the square's reaction ×; hit chance ×
// precision; pursuit ×)
// experience's credits (docs/proposals/morale-bar-model.md § 7), points: a man struck, a second under fire (a man
// lost in the last `window` seconds), a charge turned away, an enemy broken in front of it
export interface PointsDef {
  man: number
  fire: number
  window: number
  repulse: number
  broke: number
}
export interface LevelDef {
  name: string
  points: number
  bar: number
  toughness: number
  reload: number
  precision: number
  drill: number
  react: number
  pursue: number
}
// a type that charges (S1d-2, docs/systems/melee.md): the shapes it charges from, its paces (the approach
// until gallopAt metres from the target, then the gallop), the metres of gallop for full momentum, the gap at
// which the test before contact is taken, the recoil's metres, and the seconds it is blown after a charge and
// pursues a broken foe
export interface ChargeDef {
  shapes: string[]
  approach: string
  pace: string
  gallopAt: number
  build: number
  test: number
  recoil: number
  rest: number
  pursue: number
}
export interface Quarters {
  front: number
  flank: number
  rear: number
}
// melee and the charge's effects (S1d-2): contact and its hold (metres between blocks); the threat's morale
// shock at the test and the impact's, by the side the charge comes from; the impact's losses (a share of the
// other's men in contact at full momentum); the melee's losses per second per man in contact, by kind; the
// chance a charger turns from a braced target and breaks into a wavering one; the refuge (a square) against a
// charging enemy
export interface MeleeDef {
  contact: number
  hold: number
  threat: Quarters
  impact: { kill: number; shock: Quarters }
  // the shock of a charge striking a battalion already in melee with another, by the side it strikes (decision 0080)
  second: { flank: number; rear: number }
  rate: number
  cohesion: number
  refuse: number
  breach: number
  // forming the refuge shape against a charging enemy: metres, m/s, seconds, seconds
  refuge: { alert: number; closing: number; react: number; hold: number }
}
// a type that fires shot (S1d-3, docs/systems/artillery.md): a ball walked over the heightfield (the ray) and
// a short-range cone. The shapes it fires from, a piece's arc, its reload and the crew that keeps it
export interface RayDef {
  range: number // the farthest a piece aims, metres
  step: number // metres the ball moves per step of its walk
  muzzle: number // the muzzle's height above the ground, metres
  speed: number // m/s (sets the drop per metre of the flat trajectory)
  energy: number // metres of travel the ball has, spent by flight, grazes and men struck
  // energy lost at a graze; the share of its drop it keeps as rise
  graze: number
  restitution: number
  bury: number // a graze into ground rising steeper than this (rise over run) stops it
  height: number // the ball strikes men while this low over the ground, metres
  width: number // the lane it cuts through a block, metres
  perMan: number // metres of energy a man struck absorbs
  kill: number // share of the men in its lane who fall
  // keyed dispersion: across (radians, ±) and in range (a share, ±)
  spread: number
  short: number
}
// inside range; half-angle; men struck per shot by range
export interface ConeDef {
  range: number
  half: number
  hits: [number, number][]
}
// shapes it fires from; a piece's arc (half-angle, radians); reload seconds and spread; full crew per piece, and
// the most a short crew may slow the reload (a factor); how far ahead of its detachment's front rank the piece stands
export interface ArtilleryDef {
  shapes: string[]
  arc: number
  reload: number
  reloadJitter: number
  crew: number
  crewSlow: number
  ahead: number
  ray: RayDef
  cone: ConeDef
  // metres: with an enemy in the fight this near a muzzle, no piece fires (the enemy is among the guns)
  min: number
}
// a unit type (S1d-1): its block, its shapes and their change times. A formation is of one type for life
export interface UnitType {
  geometry: Geometry
  formations: Record<string, FormationDef>
  // seconds, keyed 'from>to'
  changeTime: Record<string, number>
  defaultChangeTime: number
  start: string // the shape a spawn takes when it names none
  // the shapes a unit of this type may form unless given its own set (docs/plans/active/formations.md § C3: a
  // formation enabled or not per unit, later by research or a general); none: every shape
  enabled?: string[]
  fires: boolean // fires by company (S1c's musketry)
  // how its men are drawn: on foot, on horseback, or serving pieces (the renderer's; no rule reads it)
  figure: 'foot' | 'mounted' | 'crewed'
  charge?: ChargeDef // it charges (S1d-2)
  refuge?: string // the shape it forms against a charging enemy (S1d-2, the standing behaviour)
  artillery?: ArtilleryDef // it fires shot (S1d-3)
  traits?: TraitsDef // its shapes' traits where a shape names none (a shape's own override them, field by field)
}
/** how a unit looks, as the renderer paints it (docs/plans/active/armies-demo.md): resolved from its Dress (decision
 *  0068, src/look/world/dyes.ts). Its colours by the figure's colour roles (tools/bake-figure.py:
 *  coat, facings, white, dark, skin, leather, pack, wood, metal), its flag's (vertical bands from the staff out), and
 *  what its figure shows from above when far: 'coat' (the headgear, pack and leather in the coat's colour) or 'own'
 *  (its own); unset, by the coat's value (src/look/world/armies.ts, farRule). A battalion wears one by id, whatever
 *  its side. Not read by the simulation */
export interface Uniform {
  id: string
  colours: Record<string, string>
  flag: readonly string[]
  far?: 'coat' | 'own'
}
/** an era's dyes (docs/plans/active/dye-palette.md, decision 0068): a short list of named cloth colours, each one sRGB
 *  value chosen once against the landscape; the flags' own dyes (brighter, cleaner: a side reads by its flag); the
 *  materials that are not cloth (skin, leather, the pack, wood, metal: the figure's neutral roles), and the dye every
 *  man's boots take. Era data (src/rulesets/<era>-dyes.ts) */
export interface DyeSet {
  dyes: Readonly<Record<string, string>>
  flags: Readonly<Record<string, string>>
  materials: Readonly<Record<string, string>>
  boots: string
}
/** the parts a dress names a dye for: its cloth, and the paint of its kit (a gun's carriage and wheels) */
export const CLOTH_PARTS = ['coat', 'facings', 'trousers', 'waistcoat', 'headgear', 'greatcoat', 'paint'] as const
export type ClothPart = (typeof CLOTH_PARTS)[number]
/** a uniform as its cloth parts' dyes, by name, never a colour (decision 0068): its coat, facings, trousers (or
 *  breeches), waistcoat, headgear and greatcoat (worn over the coat: by a share of the men by the cold, a later step;
 *  ?uniforms=all-greatcoats, all of them), and its flag's bands by flag dye. Era data (src/rulesets/<era>-uniforms.ts),
 *  resolved into a Uniform by the figure's roles (src/look/world/dyes.ts). Not read by the simulation */
export interface Dress {
  id: string
  parts: Readonly<Partial<Record<ClothPart, string>>> & { coat: string; facings: string; trousers: string }
  flag: readonly string[]
  far?: 'coat' | 'own'
}

// where a threat stands to a formation (docs/proposals/sectors-model.md § 8): the blend's centre T and half-width H on
// the angle measure (45°, 35° to 55°), the corner's length (metres), the slices a threat's block is cut into, and the
// farthest an enemy presses on a battalion's morale (metres between their nearest companies)
export interface SectorsDef {
  blend: { T: number; H: number }
  corner: number
  slices: number
  reach: number
}
export interface Ruleset {
  name: string
  menPerFigure: number // the men a figure stands for (decision 0076: 25); the page's, no rule reads it
  types: Record<string, UnitType> // the first is the default
  pace: Record<string, number>
  q: Record<string, Record<string, number>>
  start: { orders: string }
  slopeK: number
  terrain: Record<string, TerrainDef>
  // limit: metres, deeper is impassable (per kind where named)
  water: { curve: [number, number][]; limit: number; limitByKind?: Record<string, number> }
  orders: Record<string, OrdersPreset>
  disorder: { Lok: number; kLag: number; kBow: number; kRec: number; scale: Record<string, number> }
  faceTime: number
  dressTime: number
  fire: FireDef
  morale: MoraleDef
  levels: LevelDef[] // six, from recruits (1) up
  points: PointsDef
  melee: MeleeDef
  sectors: SectorsDef
  // S1e-2: a side is broken at this share of its spawned men in the fight; at a time limit, shares within margin draw
  end: { broken: number; margin: number }
}

export interface ShapeLayout {
  name: string
  def: FormationDef
  kind: number
  place: Placement[]
  of: Int32Array // [c][r][f] → bin within the company (0..bins − 1)
  // [c][r][f] → place in the straight layout (heading 0)
  posX: Float64Array
  posZ: Float64Array
  pairs: number[][] // accordion: [bin ahead, bin behind, room]
  half: number // half-width across travel
  // half-turn: slot map (c·R·F + r·F + f), bin map, whether files reverse
  turn: { cx: number; cz: number; m: Int32Array; bin: Int32Array; flipsFiles: boolean } | null
  // indices into paces, −1 none
  pace: number
  roadPace: number
  fileStep: number // metres between files in its places (the block's, or a trail shape's step)
  // its places' spacing of files and of ranks over the block's (1 but for a step)
  kx: number
  kz: number
  spread: number // the larger of kx, kz and 1: how much farther than the block a company's places reach
  // a trail shape's trail length: its depth, two company frontages and 12 m, and at least 24 m past its farthest place
  trailLimit: number
  depth: number // how far the layout reaches behind the anchor
  // [c·3 + 0..2]: company c's nearest and farthest place behind the anchor (−posZ), its widest |posX|
  extent: Float64Array
}
// a unit type compiled: what one block needs (its slots, bins and shapes)
export interface TypeTable {
  name: string
  def: UnitType
  geo: Geometry
  // companies, bins and slots of a formation of this type
  C: number
  NB: number
  slots: number
  qMax: number // the largest hurry factor of its shapes' paces (how far a man may step in a tick)
  slotC: Int32Array // each slot's company
  // each slot's place in its company block (blockLocal)
  slotLX: Float64Array
  slotLZ: Float64Array
  slotReach: number // the farthest place in a company block from its origin
  shapes: ShapeLayout[]
  shapeIndex(name: string): number
  changeTime: Float64Array // [from·S + to]
  traits: Float64Array // [shape·T_LEN + field] (src/sim/traits.ts)
  start: number // the spawn's shape
  enabled: number // the shapes a unit may form unless given its own set: bit s for shape s
  // the shapes it charges from (1 by shape) and its paces' indices; null: it does not charge
  charge: { from: Uint8Array; approach: number; pace: number } | null
  refuge: number // the shape it forms against cavalry, −1 none
  // the shapes it fires from (1 by shape), cos of its arc, the ray's drop per metre per metre
  artillery: { from: Uint8Array; cosArc: number; drop: number } | null
}
export interface Compiled {
  rs: Ruleset
  hash: number
  types: TypeTable[]
  typeIndex(name: string): number
  // the strides of the world's per-formation buffers: the most companies, bins and slots of any type (a
  // formation of a smaller type leaves the rest of its row unused)
  maxC: number
  maxNB: number
  maxSlots: number
  trail: number // points in a formation's trail ring (trailRing)
  kinds: string[]
  paces: string[]
  paceSpeed: Float64Array
  presets: string[]
  presetIndex(name: string): number
  slope: Float64Array // 401 entries over rise/run −1..1
  sightByClass: Float64Array // fire: metres of each terrain class a sight line may cross (Infinity: any)
  cosArc: number // fire: cos of the arc's half-angle
  stateFactor: Float64Array // fire: by morale state (steady, shaken, wavering; a router does not fire)
  supportCos: number // morale: cos of the support arc
}

// the morale states that fire, in MS_* order (world.ts)
export const FIRING_STATES = ['steady', 'shaken', 'wavering']
// companies per battalion: per-company scratch and the re-packing gate's company mask are sized by it
export const MAX_COMPANIES = 32
// a formation's trail ring: at least TRAIL_MIN points, more for a deep trail shape, never past TRAIL_MAX
export const TRAIL_MIN = 256
export const TRAIL_MAX = 4096

// the ruleset with one type's block changed (tests and tools: the S1a block, the ceiling)
export const withBlock = (rs: Ruleset, type: string, g: Partial<Geometry>): Ruleset => ({
  ...rs,
  types: { ...rs.types, [type]: { ...rs.types[type], geometry: { ...rs.types[type].geometry, ...g } } },
})
export const rot2 = (x: number, z: number, a: number): [number, number] => [
  x * cos(a) - z * sin(a),
  x * sin(a) + z * cos(a),
]
export const blockLocal = (g: Geometry, f: number, r: number): [number, number] => [
  (f - (g.files - 1) / 2) * g.fileSpacing,
  -r * g.rankSpacing,
]
export const slotIndex = (g: Geometry, c: number, r: number, f: number): number => (c * g.ranks + r) * g.files + f

// a stable hash of the ruleset's numbers and names (its functions by their output), recorded by a world
function rulesetHash(rs: Ruleset): number {
  const types = Object.keys(rs.types).map(t => {
    const u = rs.types[t]
    const geo = u.geometry
    return [
      t,
      geo,
      Object.keys(u.formations)
        .sort()
        .map(n => {
          const d = u.formations[n]
          return [
            n,
            d.kind,
            d.pace,
            d.roadPace ?? '',
            !!d.trail,
            !!d.closeAcross,
            d.step ?? null,
            !!d.allRound,
            d.traits ?? null,
            d.place(geo),
          ]
        }),
      u.changeTime,
      u.defaultChangeTime,
      u.start,
      u.fires,
      u.figure,
      u.charge ?? null,
      u.refuge ?? '',
      u.artillery ?? null,
      u.traits ?? null,
    ]
  })
  const text = JSON.stringify([
    rs.name,
    types,
    rs.pace,
    rs.q,
    rs.start,
    rs.slopeK,
    rs.terrain,
    rs.water,
    rs.orders,
    rs.disorder,
    rs.faceTime,
    rs.dressTime,
    rs.fire,
    rs.morale,
    rs.levels,
    rs.points,
    rs.melee,
    rs.sectors,
    rs.end,
  ])
  return fnv1a(new TextEncoder().encode(text))
}

// a unit type's tables
function compileType(rs: Ruleset, name: string, kinds: string[], paces: string[]): TypeTable {
  const u = rs.types[name]
  const g = u.geometry
  const C = g.companies
  const R = g.ranks
  const F = g.files
  const NB = C * g.bins
  const at = `ruleset ${rs.name}, type ${name}`
  if (!(C >= 1 && C <= MAX_COMPANIES)) throw new Error(`${at}: ${C} companies, outside 1..${MAX_COMPANIES}`)
  if (!(Number.isInteger(g.bins) && g.bins >= 1 && g.bins <= F)) {
    throw new Error(`${at}: geometry.bins must be a whole number in 1..files`)
  }
  const names = Object.keys(u.formations)
  // a pace that is not one would be read as index −1, and the first move would be NaN (#156)
  for (const n of names) {
    const d = u.formations[n]
    if (!paces.includes(d.pace)) throw new Error(`${at}: shape ${n}'s pace ${d.pace} is not one of the paces`)
    if (d.roadPace && !paces.includes(d.roadPace)) {
      throw new Error(`${at}: shape ${n}'s roadPace ${d.roadPace} is not one of the paces`)
    }
    const T = traitsOf(u, n)
    // a flank or rear under 1 would make fire from the front the worst
    if (
      T.hits &&
      !(
        (T.hits.front ?? 1) > 0 &&
        (T.hits.front ?? 1) < Infinity &&
        (T.hits.flank ?? 1) >= 1 &&
        (T.hits.rear ?? 1) >= 1 &&
        (T.hits.flank ?? 1) + (T.hits.rear ?? 1) < Infinity
      )
    ) {
      throw new Error(`${at}: shape ${n}'s hits must be finite, the front above 0, the flank and rear ≥ 1`)
    }
    if (T.melee !== undefined && !(T.melee > 0 && T.melee < Infinity)) {
      throw new Error(`${at}: shape ${n}'s melee must be finite and above 0`)
    }
    const b = braceSides(T.brace)
    if (!b.every(v => v >= 0 && v <= 1)) throw new Error(`${at}: shape ${n}'s brace must be in 0..1 on every side`)
    // a shape proof against a charge from every side has no flank; one with no flank has no flank's or rear's hits,
    // and is braced alike on every side
    if (b.every(v => v === 1) && !d.allRound) throw new Error(`${at}: shape ${n} is fully braced but not allRound`)
    if (d.allRound && (T.hits?.flank !== undefined || T.hits?.rear !== undefined)) {
      throw new Error(`${at}: shape ${n} is allRound: it has no flank's or rear's hits`)
    }
    if (d.allRound && !(b[0] === b[1] && b[1] === b[2])) {
      throw new Error(`${at}: shape ${n} is allRound: it is braced alike on every side`)
    }
    // a shape may fire none (the column of route), never less
    if (T.fire !== undefined && !nonNegative(T.fire)) throw new Error(`${at}: shape ${n}'s fire must be finite and ≥ 0`)
    for (const [k, v] of [
      ['shock', T.shock],
      ['flankShock', T.flankShock],
    ] as const) {
      if (v !== undefined && !(v > 0 && v < Infinity)) {
        throw new Error(`${at}: shape ${n}'s ${k} must be finite and above 0`)
      }
    }
    if (T.flankFrom !== undefined) {
      const t = blendAt(T.flankFrom)
      const H = rs.sectors.blend.H
      if (!(T.flankFrom > 0 && T.flankFrom < PI / 2 && t - H > 0 && t + H < 1)) {
        throw new Error(`${at}: shape ${n}'s flankFrom must lie in 0..π/2, its blend inside the angle measure's 0..1`)
      }
    }
  }
  // a change time naming a shape it has not would be ignored, and the default taken in silence (#156)
  for (const [k, v] of Object.entries(u.changeTime)) {
    const ab = k.split('>')
    if (ab.length !== 2 || !names.includes(ab[0]) || !names.includes(ab[1])) {
      throw new Error(`${at}: change time ${k} does not name two of its shapes (from>to)`)
    }
    if (!nonNegative(v)) throw new Error(`${at}: change time ${k} is ${v}, not a finite number ≥ 0`)
  }
  if (!nonNegative(u.defaultChangeTime)) {
    throw new Error(`${at}: defaultChangeTime is ${u.defaultChangeTime}, not a finite number ≥ 0`)
  }
  const shapes: ShapeLayout[] = names.map(n => layout(g, u.formations, n, kinds, paces))
  const S = names.length
  if (u.formations[u.start] && traitsOf(u, u.start).moves === false) {
    throw new Error(`${at}: its start shape ${u.start} cannot move`)
  }
  const traits = compileTraits(u, names, rs.sectors.blend.T)
  const changeTime = new Float64Array(S * S)
  for (let a = 0; a < S; a++) {
    for (let b = 0; b < S; b++) changeTime[a * S + b] = u.changeTime[names[a] + '>' + names[b]] ?? u.defaultChangeTime
  }
  const start = names.indexOf(u.start)
  if (start < 0) throw new Error(`${at}: start shape ${u.start} is not one of its shapes`)
  // a unit's set of shapes is a bit per shape in an int32
  if (S > MAX_SHAPES) throw new Error(`${at}: ${S} shapes, more than ${MAX_SHAPES}`)
  let enabled = 0
  for (const n of u.enabled ?? names) {
    const s = names.indexOf(n)
    if (s < 0) throw new Error(`${at}: enabled shape ${n} is not one of its shapes`)
    enabled |= 1 << s
  }
  if (!(enabled & (1 << start))) throw new Error(`${at}: its start shape ${u.start} is not enabled`)
  const slots = C * R * F
  const slotC = new Int32Array(slots)
  const slotLX = new Float64Array(slots)
  const slotLZ = new Float64Array(slots)
  for (let c = 0; c < C; c++) {
    for (let r = 0; r < R; r++) {
      for (let f = 0; f < F; f++) {
        const s = slotIndex(g, c, r, f)
        const [lx, lz] = blockLocal(g, f, r)
        slotC[s] = c
        slotLX[s] = lx
        slotLZ[s] = lz
      }
    }
  }
  let slotReach = 0
  for (let s = 0; s < slots; s++) {
    slotReach = Math.max(slotReach, Math.sqrt(slotLX[s] * slotLX[s] + slotLZ[s] * slotLZ[s]))
  }
  // at least 1: a pace with no q table hurries at 1 (groundQAt)
  let charge: TypeTable['charge'] = null
  if (u.charge) {
    const ch = u.charge
    const from = new Uint8Array(S)
    const approach = paces.indexOf(ch.approach)
    const pace = paces.indexOf(ch.pace)
    for (const n of ch.shapes) {
      const k = names.indexOf(n)
      if (k < 0) throw new Error(`${at}: it charges from ${n}, not one of its shapes`)
      if (u.formations[n].trail) throw new Error(`${at}: it charges from ${n}, a trail shape`)
      if (traitsOf(u, n).moves === false) throw new Error(`${at}: it charges from ${n}, a shape that cannot move`)
      from[k] = 1
    }
    if (approach < 0 || pace < 0) throw new Error(`${at}: a charge pace is not one of the paces`)
    if (!(ch.gallopAt >= ch.test && ch.test > rs.melee.contact && ch.build > 0)) {
      throw new Error(`${at}: the charge needs gallopAt ≥ test > melee.contact and build > 0`)
    }
    charge = { from, approach, pace }
  }
  const refuge = u.refuge === undefined ? -1 : names.indexOf(u.refuge)
  if (u.refuge !== undefined && (refuge < 0 || braceSides(traitsOf(u, u.refuge).brace).some(v => v < 1))) {
    throw new Error(`${at}: its refuge ${u.refuge} is not one of its braced shapes`)
  }
  let artillery: TypeTable['artillery'] = null
  if (u.artillery) {
    if (!(u.artillery.min >= 0 && u.artillery.min < Infinity)) {
      throw new Error(`${at}: artillery.min must be finite and ≥ 0`)
    }
    const A = u.artillery
    const from = new Uint8Array(S)
    for (const n of A.shapes) {
      const k = names.indexOf(n)
      if (k < 0) throw new Error(`${at}: it fires from ${n}, not one of its shapes`)
      from[k] = 1
    }
    if (u.fires) {
      throw new Error(`${at}: a type fires musketry or artillery, not both (they share a company's reload and target)`)
    }
    const R = A.ray
    const ok =
      A.cone.range < R.range &&
      R.speed > 0 &&
      A.crew > 0 &&
      A.crewSlow >= 1 &&
      A.arc > 0 &&
      A.arc <= PI &&
      R.step > 0 &&
      R.energy > 0 &&
      R.height > 0 &&
      R.width > 0 &&
      A.cone.hits.length > 0 &&
      A.cone.hits.every((p, k) => k === 0 || p[0] > A.cone.hits[k - 1][0])
    if (!ok) {
      throw new Error(
        `${at}: artillery needs cone.range < ray.range; speed, crew, step, energy, height and width > 0; crewSlow ≥ 1; arc in (0, π]; and cone.hits not empty, its ranges increasing`,
      )
    }
    artillery = { from, cosArc: cos(A.arc), drop: 9.81 / (A.ray.speed * A.ray.speed) }
  }
  const own = [...shapes.flatMap(L => [L.pace, L.roadPace]), ...(charge ? [charge.approach, charge.pace] : [])]
  let qMax = 1
  for (const p of own) if (p >= 0) for (const v of Object.values(rs.q[paces[p]] ?? {})) qMax = Math.max(qMax, v)
  return {
    name,
    def: u,
    geo: g,
    C,
    NB,
    slots,
    qMax,
    slotC,
    slotLX,
    slotLZ,
    slotReach,
    shapes,
    shapeIndex: n => names.indexOf(n),
    changeTime,
    traits,
    start,
    enabled,
    charge,
    refuge,
    artillery,
  }
}

export function compileRuleset(rs: Ruleset): Compiled {
  const kinds = Object.keys(Object.values(rs.terrain)[0].g)
  const at = `ruleset ${rs.name}`
  const paces = Object.keys(rs.pace)
  for (const p of paces) {
    if (!(rs.pace[p] > 0 && rs.pace[p] < Infinity)) throw new Error(`${at}: pace ${p} is ${rs.pace[p]}, not > 0`)
  }
  // every terrain class gives every kind any class names a speed: a missing one would be NaN in classG (#156)
  const classes = Object.keys(rs.terrain)
  const allKinds = unique(classes.flatMap(c => Object.keys(rs.terrain[c].g)))
  for (const k of allKinds) {
    const by = classes.find(c => Object.hasOwn(rs.terrain[c].g, k))
    for (const c of classes) {
      const v = rs.terrain[c].g[k]
      if (!(typeof v === 'number' && nonNegative(v))) {
        throw new Error(`${at}: terrain class ${c} gives kind ${k} (named by class ${by}) no speed`)
      }
    }
  }
  // the q tables: by pace, a factor (> 0) by ground; a pace with one must give every class's ground a factor (one
  // left out would read as 1 in silence: a typo in one pace's table)
  for (const [p, table] of Object.entries(rs.q)) {
    if (!paces.includes(p)) throw new Error(`${at}: q names ${p}, not a pace`)
    for (const [g, v] of Object.entries(table)) {
      if (!(v > 0 && v < Infinity)) throw new Error(`${at}: q.${p}.${g} is ${v}, not > 0`)
    }
    for (const c of classes) {
      if (!Object.hasOwn(table, rs.terrain[c].q)) {
        throw new Error(`${at}: q.${p} gives ground ${rs.terrain[c].q} (terrain class ${c}) no factor`)
      }
    }
  }
  // by class or by kind, each a finite number ≥ 0 naming one there is
  const byName = (what: string, table: Record<string, number>, names: string[], of: string) => {
    for (const [k, v] of Object.entries(table)) {
      if (!names.includes(k)) throw new Error(`${at}: ${what} names ${k}, not ${of}`)
      if (!nonNegative(v)) throw new Error(`${at}: ${what}.${k} is ${v}, not a finite number ≥ 0`)
    }
  }
  byName('fire.sight', rs.fire.sight, classes, 'a terrain class')
  byName('disorder.scale', rs.disorder.scale, kinds, 'a kind of the terrain table')
  const paceSpeed = new Float64Array(paces.map(p => rs.pace[p]))
  const typeNames = Object.keys(rs.types)
  if (!typeNames.length) throw new Error(`ruleset ${rs.name}: no unit types`)
  // before the types: a shape's flankFrom is checked against the blend
  const SC = rs.sectors
  if (!(SC.blend.H > 0 && SC.blend.T - SC.blend.H > 0 && SC.blend.T + SC.blend.H < 1)) {
    throw new Error(`ruleset ${rs.name}: sectors.blend must lie inside the angle measure's 0..1 (0 < T − H, T + H < 1)`)
  }
  const types = typeNames.map(t => compileType(rs, t, kinds, paces))
  const presets = Object.keys(rs.orders)
  // Tobler's hiking curve capped at the drill pace, over rise/run −1..1 in 400 steps, from exact operations
  const slope = new Float64Array(401)
  for (let i = 0; i <= 400; i++) {
    const sl = i / 200 - 1
    const a = sl + 0.05 < 0 ? -(sl + 0.05) : sl + 0.05
    slope[i] = Math.min(1, rs.slopeK * expNeg(3.5 * (a - 0.05)))
  }
  const sightByClass = new Float64Array(Object.keys(rs.terrain).map(c => rs.fire.sight[c] ?? Infinity))
  for (const s of FIRING_STATES) {
    if (!(s in rs.fire.state)) throw new Error(`ruleset ${rs.name}: fire.state has no ${s}`)
  }
  if (rs.fire.pRange.some((p, k) => k > 0 && p[0] <= rs.fire.pRange[k - 1][0])) {
    throw new Error(`ruleset ${rs.name}: fire.pRange ranges must increase`)
  }
  for (const k of Object.keys(rs.water.limitByKind ?? {})) {
    if (!kinds.includes(k)) {
      throw new Error(`ruleset ${rs.name}: a wading limit names ${k}, not a kind of the terrain table`)
    }
  }
  const M = rs.morale
  const L = rs.levels
  if (!(
    L.length === 6 &&
    L[0].points === 0 &&
    L.every((l, k) => k === 0 || (l.points > L[k - 1].points && l.bar > L[k - 1].bar)) &&
    L.every(l => l.bar > 0 && [l.toughness, l.reload, l.precision, l.drill, l.react, l.pursue].every(v => v > 0))
  )) {
    throw new Error(
      `ruleset ${rs.name}: levels must be six, their points rising from 0, their bars rising and above 0, their factors above 0`,
    )
  }
  const P = rs.points
  if (!([P.man, P.fire, P.repulse, P.broke].every(v => v >= 0) && P.window > 0)) {
    throw new Error(`ruleset ${rs.name}: points' credits must be 0 or more, their window above 0`)
  }
  if (!(Number.isInteger(M.level) && M.level >= 1 && M.level <= 6)) {
    throw new Error(`ruleset ${rs.name}: morale.level must be a level, 1..6`)
  }
  // one shock must not rout a steady battalion of level 2 on its own (s1c-plan-review L2;
  // docs/proposals/morale-bar-model.md § 9): contagion and a second enemy's charge. A charge's own threat and impact
  // are left out: a charge into a flank is meant to break a line. Each as the shape that takes it worst does: its
  // shock, and a flank's by its flank shock
  const most = 0.6 * L[1].bar
  let shock = 0
  let flankShock = 0
  for (const U of types) {
    for (let o = 0; o < U.traits.length; o += T_LEN) {
      shock = Math.max(shock, U.traits[o + T_SHOCK])
      flankShock = Math.max(flankShock, U.traits[o + T_SHOCK] * U.traits[o + T_FLANK_SHOCK])
    }
  }
  if (M.contagion.shock * shock > most) {
    throw new Error(`ruleset ${rs.name}: morale.contagion.shock, by the shapes' shock, over 0.6 of level 2's bar`)
  }
  // nor a second enemy's charge (decision 0080)
  const sec = rs.melee.second
  if (!(sec.flank >= 0 && sec.rear >= 0 && Math.max(sec.flank * flankShock, sec.rear * shock) <= most)) {
    throw new Error(
      `ruleset ${rs.name}: melee.second must be ≥ 0 and, by the shapes' shock, at most 0.6 of level 2's bar`,
    )
  }
  if (!(
    M.wavering[0] > 0 &&
    M.wavering[0] < M.wavering[1] &&
    M.wavering[1] <= M.shaken[0] &&
    M.shaken[0] < M.shaken[1] &&
    M.shaken[1] <= 1
  )) {
    throw new Error(
      `ruleset ${rs.name}: morale needs 0 < wavering.enter < wavering.back ≤ shaken.enter < shaken.back ≤ 1`,
    )
  }
  if (!(M.scar >= 0 && M.scar <= 1 && M.regen >= 0 && M.loss > 0)) {
    throw new Error(`ruleset ${rs.name}: morale needs scar in 0..1, regen ≥ 0 and loss > 0`)
  }
  // a rallied formation is never wavering at once
  if (!(M.rally.share > M.wavering[1] && M.rally.share <= 1 && M.rally.cut >= 0 && M.rally.cut < 1)) {
    throw new Error(`ruleset ${rs.name}: morale.rally needs share above wavering's way back and at most 1, cut in 0..1`)
  }
  if (!(SC.corner > 0 && Number.isInteger(SC.slices) && SC.slices >= 1 && SC.reach > 0 && SC.reach < Infinity)) {
    throw new Error(`ruleset ${rs.name}: sectors needs corner > 0, a whole number of slices ≥ 1 and a finite reach > 0`)
  }
  if (!(M.drain.flank >= 0 && M.drain.rear >= 0 && M.drain.flank + M.drain.rear < Infinity)) {
    throw new Error(`ruleset ${rs.name}: morale.drain must be finite and ≥ 0`)
  }
  if (!(M.rally.max >= 0 && M.rally.max < 255)) {
    throw new Error(`ruleset ${rs.name}: morale.rally.max must be 0..254 (the break count is a byte)`)
  }
  if (!(M.support.arc > 0 && M.support.arc <= PI / 2)) {
    throw new Error(
      `ruleset ${rs.name}: morale.support.arc must be in (0, π/2]: wider, a friend ahead would count as a flank`,
    )
  }
  let maxC = 0
  let maxNB = 0
  let maxSlots = 0
  for (const t of types) {
    maxC = Math.max(maxC, t.C)
    maxNB = Math.max(maxNB, t.NB)
    maxSlots = Math.max(maxSlots, t.slots)
  }
  return {
    rs,
    hash: rulesetHash(rs),
    types,
    typeIndex: n => typeNames.indexOf(n),
    maxC,
    maxNB,
    maxSlots,
    trail: trailRing(rs, types),
    kinds,
    paces,
    paceSpeed,
    presets,
    slope,
    sightByClass,
    cosArc: cos(rs.fire.arc),
    stateFactor: new Float64Array(FIRING_STATES.map(s => rs.fire.state[s])),
    supportCos: cos(rs.morale.support.arc),
    presetIndex: n => presets.indexOf(n),
  }
}
const expNeg = (x: number): number => exp(-x)
/** Each shape's traits as a flat row (src/sim/traits.ts's fields), neutral where the ruleset says nothing; `blend`:
 * the sector blend's centre for a shape that names no flankFrom. */
function compileTraits(u: UnitType, names: string[], blend: number): Float64Array {
  const out = new Float64Array(names.length * T_LEN)
  names.forEach((n, s) => {
    const t = traitsOf(u, n)
    const o = s * T_LEN
    out[o + T_HITS] = t.hits?.front ?? 1
    out[o + T_FLANK] = t.hits?.flank ?? 1
    out[o + T_REAR] = t.hits?.rear ?? 1
    out[o + T_SIDED] = t.hits?.flank !== undefined || t.hits?.rear !== undefined ? 1 : 0
    out[o + T_MELEE] = t.melee ?? 1
    const b = braceSides(t.brace)
    out[o + T_BRACE] = b[0]
    out[o + T_BRACE_FLANK] = b[1]
    out[o + T_BRACE_REAR] = b[2]
    out[o + T_ROUND] = u.formations[n].allRound ? 1 : 0
    out[o + T_FIRE] = t.fire ?? 1
    out[o + T_SHOCK] = t.shock ?? 1
    out[o + T_FLANK_SHOCK] = t.flankShock ?? 1
    out[o + T_BLEND] = t.flankFrom === undefined ? blend : blendAt(t.flankFrom)
    out[o + T_MOVES] = t.moves === false ? 0 : 1
  })
  return out
}
/** Shape n of type u's traits: its own, field by field over its type's (`UnitType.traits`). */
function traitsOf(u: UnitType, n: string): TraitsDef {
  const a = u.traits ?? {}
  const b = u.formations[n].traits ?? {}
  return {
    hits: a.hits || b.hits ? { ...a.hits, ...b.hits } : undefined,
    melee: b.melee ?? a.melee,
    brace: a.brace === undefined && b.brace === undefined ? undefined : { ...asSides(a.brace), ...asSides(b.brace) },
    fire: b.fire ?? a.fire,
    shock: b.shock ?? a.shock,
    flankShock: b.flankShock ?? a.flankShock,
    flankFrom: b.flankFrom ?? a.flankFrom,
    moves: b.moves ?? a.moves,
  }
}
const asSides = (b: BraceDef | undefined) => (typeof b === 'number' ? { front: b, flank: b, rear: b } : (b ?? {}))
/** Bracing as [front, flank, rear], 0 where it names none. */
function braceSides(b: BraceDef | undefined): [number, number, number] {
  const s = asSides(b)
  return [s.front ?? 0, s.flank ?? 0, s.rear ?? 0]
}
// the sector blend's centre on the angle measure t = o / (d + o) for a flank beginning a radians off straight ahead
// (docs/proposals/sectors-model.md § 3: o = sin, d = cos of the angle; 45° gives 0.5)
const blendAt = (a: number): number => sin(a) / (sin(a) + cos(a))
const nonNegative = (v: number): boolean => v >= 0 && v < Infinity
// the names in first-seen order, each once (the sim keeps no Set: index-ordered arrays only)
const unique = (a: string[]): string[] => a.filter((v, i) => a.indexOf(v) === i)
// a trail shape's trail, and the one Face about rebuilds, must fit the ring (0.25 m points): the ring is
// the smallest multiple of 64 points that holds the deepest, at least TRAIL_MIN; one size for every slot, so the
// hash and saves carry the deepest type's ring for all (issue #38)
function trailRing(rs: Ruleset, types: TypeTable[]): number {
  let lmax = 0
  for (const p of Object.values(rs.orders)) lmax = Math.max(lmax, p.Lmax)
  let need = 0
  for (const t of types) {
    for (const s of t.shapes) {
      if (s.def.trail) {
        need = Math.max(need, Math.max(s.trailLimit, 15 + (s.turn ? -2 * s.turn.cz : s.depth) + lmax) / 0.25 + 16)
      }
    }
  }
  const n = Math.max(TRAIL_MIN, Math.ceil(need / 64) * 64)
  if (n > TRAIL_MAX) throw new Error(`ruleset ${rs.name}: a trail of ${n} points does not fit ${TRAIL_MAX}`)
  return n
}

function layout(
  g: Geometry,
  formations: Record<string, FormationDef>,
  name: string,
  kinds: string[],
  paces: string[],
): ShapeLayout {
  const C = g.companies
  const R = g.ranks
  const F = g.files
  const B = g.bins
  const def = formations[name]
  const place = def.place(g)
  if (def.step && !def.trail) {
    throw new Error(`shape ${name}: a step needs a trail shape (a straight shape's places are the block's)`)
  }
  // the spacing of its places
  const gs: Geometry = def.step ? { ...g, fileSpacing: def.step.file, rankSpacing: def.step.rank } : g
  if (place.length !== C) throw new Error(`shape ${name}: ${place.length} placements for ${C} companies`)
  const n = C * R * F
  const of = new Int32Array(n)
  const posX = new Float64Array(n)
  const posZ = new Float64Array(n)
  const box: { j: number; x0: number; x1: number; z0: number; z1: number }[] = []
  for (let c = 0; c < C; c++) {
    const ca = cos(place[c].rot)
    const sa = sin(place[c].rot)
    let lo = Infinity
    let hi = -Infinity
    for (let r = 0; r < R; r++) {
      for (let f = 0; f < F; f++) {
        const [lx, lz] = blockLocal(gs, f, r)
        const s = slotIndex(g, c, r, f)
        posX[s] = place[c].x + lx * ca - lz * sa
        posZ[s] = place[c].z + lx * sa + lz * ca
        lo = Math.min(lo, posX[s])
        hi = Math.max(hi, posX[s])
      }
    }
    for (let k = 0; k < B; k++) box.push({ j: c * B + k, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity })
    for (let r = 0; r < R; r++) {
      for (let f = 0; f < F; f++) {
        const s = slotIndex(g, c, r, f)
        const k = Math.min(B - 1, Math.floor(((posX[s] - lo) / Math.max(1e-6, hi - lo)) * B))
        const bx = box[c * B + k]
        of[s] = k
        bx.x0 = Math.min(bx.x0, posX[s])
        bx.x1 = Math.max(bx.x1, posX[s])
        bx.z0 = Math.min(bx.z0, posZ[s])
        bx.z1 = Math.max(bx.z1, posZ[s])
      }
    }
  }
  // accordion: a bin wholly behind another, with men less than the gap apart across travel; rear-most last
  const pairs: number[][] = []
  for (const rb of [...box].sort((p, q) => q.z1 - p.z1 || p.j - q.j)) {
    for (const ab of box) {
      if (
        Math.floor(ab.j / B) !== Math.floor(rb.j / B) &&
        ab.z0 > rb.z1 &&
        ab.x0 < rb.x1 + g.accordionGap &&
        rb.x0 < ab.x1 + g.accordionGap
      ) {
        pairs.push([ab.j, rb.j, ab.z0 - rb.z1 - g.accordionGap])
      }
    }
  }
  let half = 0
  for (let s = 0; s < n; s++) half = Math.max(half, Math.abs(posX[s]))
  // half-turn symmetry: the slot at the point reflection through the layout's centre
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let s = 0; s < n; s++) {
    x0 = Math.min(x0, posX[s])
    x1 = Math.max(x1, posX[s])
    z0 = Math.min(z0, posZ[s])
    z1 = Math.max(z1, posZ[s])
  }
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const m = new Int32Array(n).fill(-1)
  for (let s = 0; s < n; s++) {
    for (let q = 0; q < n; q++) {
      if (Math.abs(posX[q] - (2 * cx - posX[s])) < 1e-6 && Math.abs(posZ[q] - (2 * cz - posZ[s])) < 1e-6) {
        m[s] = q
        break
      }
    }
  }
  let turn: ShapeLayout['turn'] = null
  if (m.every(q => q >= 0)) {
    const bin = new Int32Array(C * B)
    for (let s = 0; s < n; s++) {
      const c = Math.floor(s / (R * F))
      const c2 = Math.floor(m[s] / (R * F))
      bin[c * B + of[s]] = c2 * B + of[m[s]]
    }
    turn = { cx, cz, m, bin, flipsFiles: F > 1 && m[0] % F === F - 1 }
  }
  const kind = kinds.indexOf(def.kind)
  if (kind < 0) throw new Error(`shape ${name}: kind ${def.kind} not in the terrain table`)
  let depth = 0
  for (const p of place) depth = Math.max(depth, -p.z)
  const extent = new Float64Array(C * 3)
  for (let c = 0; c < C; c++) {
    extent[c * 3] = Infinity
    extent[c * 3 + 1] = -Infinity
    for (let s = c * R * F; s < (c + 1) * R * F; s++) {
      extent[c * 3] = Math.min(extent[c * 3], -posZ[s])
      extent[c * 3 + 1] = Math.max(extent[c * 3 + 1], -posZ[s])
      extent[c * 3 + 2] = Math.max(extent[c * 3 + 2], Math.abs(posX[s]))
    }
  }
  let far = 0
  for (let c = 0; c < C; c++) far = Math.max(far, extent[c * 3 + 1])
  const trailLimit = Math.max(depth + 2 * g.files * g.fileSpacing + 12, far + 24)
  return {
    name,
    def,
    kind,
    place,
    of,
    posX,
    posZ,
    pairs,
    half,
    turn,
    pace: paces.indexOf(def.pace),
    roadPace: def.roadPace ? paces.indexOf(def.roadPace) : -1,
    fileStep: gs.fileSpacing,
    kx: gs.fileSpacing / g.fileSpacing,
    kz: gs.rankSpacing / g.rankSpacing,
    spread: Math.max(1, gs.fileSpacing / g.fileSpacing, gs.rankSpacing / g.rankSpacing),
    trailLimit,
    depth,
    extent,
  }
}

export const HALF_PI = PI / 2
