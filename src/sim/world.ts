// The world: all simulation state, in typed arrays (structure of arrays, docs/architecture.md §3), so
// the hash and saves cover every byte. One table, formations, with their trails (a ring per formation)
// and an order pool. Only the commands stamped for the next tick live outside typed arrays; the
// serializer writes them too. The build-time data, the compiled ruleset and the terrain derived from them
// are attached but are not state: their versions are (meta).
import type { SimData } from './data.ts'
import { type RngState, seedRng } from './rng.ts'
import type { Stamped } from './commands.ts'
import type { Compiled, TypeTable } from './ruleset.ts'
import type { Terrain } from './terrain.ts'
import { buildTerrain } from './terrain.ts'
import { type Handle, KIND_FORMATION, handleKind, handleIndex, handleGen, makeHandle } from './handle.ts'
import type { Places, Arc, GateBits, Filled } from './formation.ts'
import type { FireGeo } from './fire.ts'
import type { Melee } from './melee.ts'
import type { PlanStep } from './plan.ts'
import type { Claims } from './claims.ts'
import type { Faces } from './sectors.ts'

export const MAX_FORMATIONS = 128
export const MAX_ORDERS = 2048
export const SIDES = 2

// meta words
export const M_TICK = 0
export const M_FREE = 1
export const M_DATA = 2
export const M_SEQ = 3
export const M_RULES = 4
export const M_SEED = 5
export const M_END = 6
export const M_WINNER = 7
export const M_LIMIT = 8
export const M_PLAN = 9
// M_SEED: keys the keyed draws (rng.ts); S1e-2: M_END the tick the battle ended (0: not yet), M_WINNER END_*, M_LIMIT
// the tick it ends at (0: none), M_PLAN the hash of the plan attached (plan.ts)
export const M_LEN = 10
export const END_NONE = 0
export const END_SIDE0 = 1
export const END_SIDE1 = 2
export const END_DRAW = 3
export const END_RESULTS = ['', 'side 0 wins', 'side 1 wins', 'a draw']

export interface Formations {
  alive: Uint8Array
  gen: Int32Array
  side: Uint8Array
  // the unit type (cr.types); the per-company and per-bin rows below are strided by the most of any type
  type: Uint8Array
  shape: Int32Array
  style: Int32Array
  status: Int32Array
  onRoad: Uint8Array
  drill: Float64Array
  lean: Uint8Array // which way a company's files centre when it cannot be exact (Face about flips it)
  faces: Int32Array // Face abouts done (the renderer relabels its men through the half-turn)
  // the anchor: front centre; heading 0 = +z, clockwise toward +x
  x: Float64Array
  z: Float64Array
  heading: Float64Array
  // last tick's anchor (for the renderer's interpolation)
  px: Float64Array
  pz: Float64Array
  ph: Float64Array
  vx: Float64Array
  vz: Float64Array
  omega: Float64Array
  disorder: Float64Array
  blockedFor: Float64Array
  men: Int32Array // [i·C + c], C = cr.maxC
  // a shape change in progress
  trans: Uint8Array
  tShape: Int32Array
  tStart: Float64Array
  tDur: Float64Array
  tDelay: Float64Array // [i·C + c]
  // [(i·C + c)·4 + x|z|rot|face]
  tFrom: Float64Array
  tTo: Float64Array
  tK: Float64Array // [(i·C + c)·2 + kx|kz]: the spacing of its places as the change began
  // the lag model, per bin
  // [i·NB + j], NB = cr.maxNB
  lags: Float64Array
  lagRate: Float64Array
  binG: Float64Array
  binQ: Float64Array
  binN: Int32Array
  // the march trail: a ring of points, oldest first
  // [i·T + k], T = cr.trail
  trailX: Float64Array
  trailZ: Float64Array
  trailStart: Int32Array
  trailCount: Int32Array
  trailVer: Int32Array
  trailLen: Float64Array
  // orders: a list in the order pool
  ordHead: Int32Array
  ordTail: Int32Array
  // fire, per company [i·C + c]: seconds to loaded, the tick of the last volley, the target (a handle, 0 none),
  // and the men hit and not yet removed (step 11)
  reload: Float64Array
  volleyTick: Int32Array
  target: Int32Array
  owed: Int32Array
  // fire, per battalion: mode (FIRE_AT_WILL, FIRE_HOLD) and the preferred target (a handle, 0 none)
  fireMode: Uint8Array
  prefer: Int32Array
  // a battery's pieces (S1d-3, artillery.ts), per company: the last shot's kind (SHOT_*), and where its ball
  // stopped (a ray) or its aim point (a cone), for the renderer
  shotKind: Uint8Array
  shotX: Float64Array
  shotZ: Float64Array
  // morale (docs/proposals/morale-bar-model.md): the level (1..6), its points, whether it gained a level this battle;
  // the bar, its maximum and the cost of the losses since the last write-off (points); the state (MS_*), the strength
  // at spawn
  level: Uint8Array
  pts: Float64Array
  up: Uint8Array
  bar: Float64Array
  barMax: Float64Array
  cost: Float64Array
  mstate: Uint8Array
  startMen: Int32Array
  // the rout (morale.ts): its direction, fixed at the break; its phase (RP_*); the runs made so far
  routX: Float64Array
  routZ: Float64Array
  routPhase: Uint8Array
  runs: Uint8Array
  // the rest of the machine (S1c-2): the ticks it last broke, last lost a man and started rallying, and how many times
  // it has broken
  brokeTick: Int32Array
  lastLoss: Int32Array
  since: Int32Array
  routs: Uint8Array
  pressed: Int32Array // losses that could only fall onto impassable ground (the re-packing gate)
  // the charge (S1d-2, melee.ts): its target (a handle), its phase (CH_*), the metres galloped, the gap to the
  // target at the last melee step, the tick its pursuit ends, and the tick until which it is blown
  chTarget: Int32Array
  chPhase: Uint8Array
  chRun: Float64Array
  chGap: Float64Array
  chUntil: Int32Array
  blownUntil: Int32Array
  foe: Int32Array // melee: the formation it fights (a handle, 0 none)
  shockIn: Float64Array // morale shocks owed to it this tick (the melee step's; morale takes them)
  // the square against cavalry (melee.ts): the tick a threat was last seen and the tick its unbroken run began (0
  // none), the shape it formed square from (+1, 0 none: it forms back into it), and a player's order given in this
  // spell (it stands down). Whether it shelters in the square is derived from these (formation.ts, sheltering)
  alertAt: Int32Array
  alertSince: Int32Array
  autoFrom: Int32Array
  refugeOff: Uint8Array
}
// per side: the direction of its rear (a unit vector; 0, 0 until a scenario sets it), the men of its shattered
// formations that left the field at the map's edge (S1e-1), and the men it spawned (S1e-2: the end condition)
export interface Sides {
  rearX: Float64Array
  rearZ: Float64Array
  left: Int32Array
  spawned: Int32Array
}
export const FIRE_AT_WILL = 0
export const FIRE_HOLD = 1
export const SHOT_NONE = 0
export const SHOT_RAY = 1
export const SHOT_CONE = 2
export const MS_STEADY = 0
export const MS_SHAKEN = 1
export const MS_WAVERING = 2
export const MS_ROUTING = 3
export const MS_RALLYING = 4
export const MS_SHATTERED = 5
export const MORALE_STATES = ['steady', 'shaken', 'wavering', 'routing', 'rallying', 'shattered']
// out of the fight (routing or later): does not fire, threatens no one, supports no one
export const outOfFight = (s: number): boolean => s >= MS_ROUTING
// running from the field: routing or shattered (the rout pace, the run and its fan)
export const fleeing = (s: number): boolean => s === MS_ROUTING || s === MS_SHATTERED
export const RP_NONE = 0
export const RP_RUNNING = 1
export const RP_HALTED = 2
export const RP_FLED = 3
// the charge's phases: none; closing before the test; closing after it; pursuing a broken foe
export const CH_NONE = 0
export const CH_CLOSING = 1
export const CH_TESTED = 2
export const CH_PURSUIT = 3
export const CHARGE_PHASES = ['', 'charging', 'charging', 'pursuing']
export interface Orders {
  type: Int32Array
  shape: Int32Array
  finish: Uint8Array
  left: Int8Array
  resolved: Uint8Array
  optional: Uint8Array // an order that, failing, is skipped rather than dropping the rest (a router's Face about)
  x: Float64Array
  z: Float64Array
  a: Float64Array
  t0: Float64Array
  px: Float64Array
  pz: Float64Array
  done: Float64Array
  next: Int32Array
  meta: Int32Array // [free head, in use]
}
export const O_MOVE = 1
export const O_FORM = 2
export const O_WHEEL = 3
export const O_FACE = 4
export const O_DRESS = 5
export const O_CHARGE = 6

export interface World {
  meta: Int32Array
  rng: RngState
  f: Formations
  sides: Sides
  free: Int32Array // stack of free formation slots (top at meta[M_FREE] − 1)
  ord: Orders
  pending: Stamped[]
  data: SimData
  cr: Compiled
  terrain: Terrain
  // a scenario's plan for the side it scripts (S1e-2, plan.ts): attached like the terrain, not state (the steps are
  // the scenario's, and which have run follows from the tick); its hash is state (M_PLAN), so a save loaded without
  // the plan it was made with fails at once
  // plan: its steps sorted by the tick they fall due on (planDue)
  plan: PlanStep[]
  planHash: number
  planDue: number[]
  debug: boolean
  // the claim grid's prototype (src/sim/claims.ts): on where the scenario asks for it, attached like the plan
  claims: boolean
  // per-world working buffers, not state (reverse: a test switch, the fire step and the morale pass; reverseMoves:
  // one for the formation step)
  scratch: {
    places?: Places
    arc?: Arc
    gateBits?: GateBits
    filled?: Filled
    fireGeo?: FireGeo
    fireSight?: Int32Array
    fireEpoch?: number
    claims?: Claims
    faces?: Faces // the formations' faces this tick (src/sim/sectors.ts)
    fireCrossed?: Float64Array
    reverse?: boolean
    reverseMoves?: boolean
    lost?: Int32Array
    mstateBefore?: Uint8Array
    menNow?: Int32Array
    melee?: Melee
    fireGeoTick?: number
    drain?: Float64Array // each battalion's drain this tick, the back exposed (morale.ts, threatPass)
  }
}

export function makeWorld(data: SimData, cr: Compiled, seed: number, debug = true, terrain?: Terrain): World {
  const N = MAX_FORMATIONS
  const C = cr.maxC
  const NB = cr.maxNB
  const f64 = (n: number) => new Float64Array(n)
  const i32 = (n: number) => new Int32Array(n)
  const u8 = (n: number) => new Uint8Array(n)
  const f: Formations = {
    alive: u8(N),
    gen: i32(N),
    side: u8(N),
    type: u8(N),
    shape: i32(N),
    style: i32(N),
    status: i32(N),
    onRoad: u8(N),
    drill: f64(N),
    lean: u8(N),
    faces: i32(N),
    x: f64(N),
    z: f64(N),
    heading: f64(N),
    px: f64(N),
    pz: f64(N),
    ph: f64(N),
    vx: f64(N),
    vz: f64(N),
    omega: f64(N),
    disorder: f64(N),
    blockedFor: f64(N),
    men: i32(N * C),
    trans: u8(N),
    tShape: i32(N),
    tStart: f64(N),
    tDur: f64(N),
    tDelay: f64(N * C),
    tFrom: f64(N * C * 4),
    tTo: f64(N * C * 4),
    tK: f64(N * C * 2),
    lags: f64(N * NB),
    lagRate: f64(N * NB),
    binG: f64(N * NB),
    binQ: f64(N * NB),
    binN: i32(N * NB),
    trailX: f64(N * cr.trail),
    trailZ: f64(N * cr.trail),
    trailStart: i32(N),
    trailCount: i32(N),
    trailVer: i32(N),
    trailLen: f64(N),
    ordHead: i32(N).fill(-1),
    ordTail: i32(N).fill(-1),
    reload: f64(N * C),
    volleyTick: i32(N * C),
    target: i32(N * C),
    owed: i32(N * C),
    fireMode: u8(N),
    prefer: i32(N),
    shotKind: u8(N * C),
    shotX: f64(N * C),
    shotZ: f64(N * C),
    level: u8(N),
    pts: f64(N),
    up: u8(N),
    bar: f64(N),
    barMax: f64(N),
    cost: f64(N),
    mstate: u8(N),
    startMen: i32(N),
    routX: f64(N),
    routZ: f64(N),
    routPhase: u8(N),
    runs: u8(N),
    pressed: i32(N),
    brokeTick: i32(N),
    lastLoss: i32(N),
    since: i32(N),
    routs: u8(N),
    chTarget: i32(N),
    chPhase: u8(N),
    chRun: f64(N),
    chGap: f64(N),
    chUntil: i32(N),
    blownUntil: i32(N),
    foe: i32(N),
    shockIn: f64(N),
    alertAt: i32(N),
    alertSince: i32(N),
    autoFrom: i32(N),
    refugeOff: u8(N),
  }
  const M = MAX_ORDERS
  const ord: Orders = {
    type: i32(M),
    shape: i32(M),
    finish: u8(M),
    left: new Int8Array(M),
    resolved: u8(M),
    optional: u8(M),
    x: f64(M),
    z: f64(M),
    a: f64(M),
    t0: f64(M),
    px: f64(M),
    pz: f64(M),
    done: f64(M),
    next: i32(M),
    meta: i32(2),
  }
  for (let k = 0; k < M; k++) ord.next[k] = k + 1 < M ? k + 1 : -1
  const free = new Int32Array(N)
  for (let i = 0; i < N; i++) free[i] = N - 1 - i // slot 0 is handed out first
  const w: World = {
    meta: new Int32Array(M_LEN),
    rng: new Uint32Array(4),
    f,
    sides: { rearX: f64(SIDES), rearZ: f64(SIDES), left: i32(SIDES), spawned: i32(SIDES) },
    free,
    ord,
    pending: [],
    data,
    cr,
    terrain: terrain ?? buildTerrain(data, cr),
    plan: [],
    planHash: 0,
    planDue: [],
    debug,
    claims: false,
    scratch: {},
  }
  w.meta[M_FREE] = N
  w.meta[M_DATA] = data.version | 0
  w.meta[M_RULES] = cr.hash | 0
  w.meta[M_SEED] = seed | 0
  seedRng(w.rng, seed)
  return w
}

export const tickOf = (w: World): number => w.meta[M_TICK]

// the slot of a live formation handle, or −1 (0 and negative values are never handles: the kind tag is 1)
export function formationSlot(w: World, h: Handle): number {
  if (h <= 0 || handleKind(h) !== KIND_FORMATION) return -1
  const i = handleIndex(h)
  return i < w.f.alive.length && w.f.alive[i] && w.f.gen[i] === handleGen(h) ? i : -1
}
// formation i's unit type
export const typeOf = (w: World, i: number): TypeTable => w.cr.types[w.f.type[i]]
export const formationHandle = (w: World, i: number): Handle => makeHandle(KIND_FORMATION, i, w.f.gen[i])
