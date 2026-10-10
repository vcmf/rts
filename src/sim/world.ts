// The world: all simulation state, in typed arrays (structure of arrays, docs/architecture.md §3), so
// the hash and saves cover every byte. One table, formations, with their trails (a ring per formation)
// and an order pool. Only the commands stamped for the next tick live outside typed arrays; the
// serializer writes them too. The build-time data, the compiled ruleset and the terrain derived from them
// are attached but are not state: their versions are (meta).
import type { SimData } from './data.ts'
import { type RngState, seedRng } from './rng.ts'
import type { Stamped } from './commands.ts'
import type { Compiled } from './ruleset.ts'
import type { Terrain } from './terrain.ts'
import { buildTerrain } from './terrain.ts'
import { type Handle, KIND_FORMATION, handleKind, handleIndex, handleGen, makeHandle } from './handle.ts'
import type { Places, Arc } from './formation.ts'
import type { FireGeo } from './fire.ts'

export const MAX_FORMATIONS = 128
export const TRAIL = 256          // trail points per formation (a ring)
export const MAX_ORDERS = 2048
export const SIDES = 2

// meta words
export const M_TICK = 0, M_FREE = 1, M_DATA = 2, M_SEQ = 3, M_RULES = 4, M_SEED = 5, M_LEN = 6   // M_SEED: keys the keyed draws (rng.ts)

export interface Formations {
  alive: Uint8Array; gen: Int32Array; side: Uint8Array
  shape: Int32Array; style: Int32Array; status: Int32Array; onRoad: Uint8Array; drill: Float64Array
  lean: Uint8Array                                                 // which way a company's files centre when it cannot be exact (Face about flips it)
  faces: Int32Array                                                // Face abouts done (the renderer relabels its men through the half-turn)
  x: Float64Array; z: Float64Array; heading: Float64Array          // the anchor: front centre; heading 0 = +z, clockwise toward +x
  px: Float64Array; pz: Float64Array; ph: Float64Array             // last tick's anchor (for the renderer's interpolation)
  vx: Float64Array; vz: Float64Array; omega: Float64Array
  disorder: Float64Array; blockedFor: Float64Array
  men: Int32Array                                                  // [i·C + c]
  // a shape change in progress
  trans: Uint8Array; tShape: Int32Array; tStart: Float64Array; tDur: Float64Array
  tDelay: Float64Array                                             // [i·C + c]
  tFrom: Float64Array; tTo: Float64Array                           // [(i·C + c)·4 + x|z|rot|face]
  // the lag model, per bin
  lags: Float64Array; lagRate: Float64Array; binG: Float64Array; binQ: Float64Array; binN: Int32Array   // [i·NB + j]
  // the march trail: a ring of points, oldest first
  trailX: Float64Array; trailZ: Float64Array                       // [i·TRAIL + k]
  trailStart: Int32Array; trailCount: Int32Array; trailVer: Int32Array; trailLen: Float64Array
  // orders: a list in the order pool
  ordHead: Int32Array; ordTail: Int32Array
  // fire, per company [i·C + c]: seconds to loaded, the tick of the last volley, the target (a handle, 0 none),
  // and the men hit and not yet removed (step 11)
  reload: Float64Array; volleyTick: Int32Array; target: Int32Array; owed: Int32Array
  // fire, per battalion: mode (FIRE_AT_WILL, FIRE_HOLD) and the preferred target (a handle, 0 none)
  fireMode: Uint8Array; prefer: Int32Array
  // morale: quality, morale, the state (MS_*), the strength at spawn and the recent losses (decaying)
  quality: Float64Array; morale: Float64Array; mstate: Uint8Array; startMen: Int32Array; recent: Float64Array
  // the rout (morale.ts): its direction, fixed at the break; its phase (RP_*); the runs made so far
  routX: Float64Array; routZ: Float64Array; routPhase: Uint8Array; runs: Uint8Array
  // the rest of the machine (S1c-2): the men the losses term counts from (the spawn strength until a rally),
  // the ticks it last broke, last lost a man and started rallying, the ticks in a row its morale has fallen,
  // whether it has fallen back in this wavering spell, and how many times it has broken
  baseMen: Int32Array; brokeTick: Int32Array; lastLoss: Int32Array; since: Int32Array; falling: Int32Array; fellBack: Uint8Array; routs: Uint8Array
  pressed: Int32Array                                              // losses that could only fall onto impassable ground (the re-packing gate)
}
// per side: the direction of its rear (a unit vector; 0, 0 until a scenario sets it)
export interface Sides { rearX: Float64Array; rearZ: Float64Array }
export const FIRE_AT_WILL = 0, FIRE_HOLD = 1
export const MS_STEADY = 0, MS_SHAKEN = 1, MS_WAVERING = 2, MS_ROUTING = 3, MS_RALLYING = 4, MS_SHATTERED = 5
export const MORALE_STATES = ['steady', 'shaken', 'wavering', 'routing', 'rallying', 'shattered']
// out of the fight (routing or later): does not fire, threatens no one, supports no one
export const outOfFight = (s: number): boolean => s >= MS_ROUTING
// running from the field: routing or shattered (the rout pace, the run and its fan)
export const fleeing = (s: number): boolean => s === MS_ROUTING || s === MS_SHATTERED
export const RP_NONE = 0, RP_RUNNING = 1, RP_HALTED = 2, RP_FLED = 3
export interface Orders {
  type: Int32Array; shape: Int32Array; finish: Uint8Array; left: Int8Array; resolved: Uint8Array
  optional: Uint8Array   // an order that, failing, is skipped rather than dropping the rest (a router's Face about)
  x: Float64Array; z: Float64Array; a: Float64Array; t0: Float64Array; px: Float64Array; pz: Float64Array; done: Float64Array
  next: Int32Array
  meta: Int32Array   // [free head, in use]
}
export const O_MOVE = 1, O_FORM = 2, O_WHEEL = 3, O_FACE = 4, O_DRESS = 5

export interface World {
  meta: Int32Array
  rng: RngState
  f: Formations
  sides: Sides
  free: Int32Array      // stack of free formation slots (top at meta[M_FREE] − 1)
  ord: Orders
  pending: Stamped[]
  data: SimData; cr: Compiled; terrain: Terrain
  debug: boolean
  scratch: { places?: Places; arc?: Arc; fireGeo?: FireGeo; fireSight?: Int32Array; fireEpoch?: number; fireCrossed?: Float64Array; reverse?: boolean; lost?: Int32Array; mstateBefore?: Uint8Array; menNow?: Int32Array }   // per-world working buffers, not state (reverse: a test switch, the fire step and the morale pass)
}

export function makeWorld(data: SimData, cr: Compiled, seed: number, debug = true, terrain?: Terrain): World {
  const N = MAX_FORMATIONS, C = cr.geo.companies, NB = cr.NB
  const f64 = (n: number) => new Float64Array(n), i32 = (n: number) => new Int32Array(n), u8 = (n: number) => new Uint8Array(n)
  const f: Formations = {
    alive: u8(N), gen: i32(N), side: u8(N), shape: i32(N), style: i32(N), status: i32(N), onRoad: u8(N), drill: f64(N), lean: u8(N), faces: i32(N),
    x: f64(N), z: f64(N), heading: f64(N), px: f64(N), pz: f64(N), ph: f64(N), vx: f64(N), vz: f64(N), omega: f64(N),
    disorder: f64(N), blockedFor: f64(N), men: i32(N * C),
    trans: u8(N), tShape: i32(N), tStart: f64(N), tDur: f64(N), tDelay: f64(N * C), tFrom: f64(N * C * 4), tTo: f64(N * C * 4),
    lags: f64(N * NB), lagRate: f64(N * NB), binG: f64(N * NB), binQ: f64(N * NB), binN: i32(N * NB),
    trailX: f64(N * TRAIL), trailZ: f64(N * TRAIL), trailStart: i32(N), trailCount: i32(N), trailVer: i32(N), trailLen: f64(N),
    ordHead: i32(N).fill(-1), ordTail: i32(N).fill(-1),
    reload: f64(N * C), volleyTick: i32(N * C), target: i32(N * C), owed: i32(N * C),
    fireMode: u8(N), prefer: i32(N),
    quality: f64(N), morale: f64(N), mstate: u8(N), startMen: i32(N), recent: f64(N), routX: f64(N), routZ: f64(N), routPhase: u8(N), runs: u8(N), pressed: i32(N),
    baseMen: i32(N), brokeTick: i32(N), lastLoss: i32(N), since: i32(N), falling: i32(N), fellBack: u8(N), routs: u8(N),
  }
  const M = MAX_ORDERS
  const ord: Orders = { type: i32(M), shape: i32(M), finish: u8(M), left: new Int8Array(M), resolved: u8(M), optional: u8(M),
    x: f64(M), z: f64(M), a: f64(M), t0: f64(M), px: f64(M), pz: f64(M), done: f64(M), next: i32(M), meta: i32(2) }
  for (let k = 0; k < M; k++) ord.next[k] = k + 1 < M ? k + 1 : -1
  const free = new Int32Array(N)
  for (let i = 0; i < N; i++) free[i] = N - 1 - i   // slot 0 is handed out first
  // a trail shape's trail, and the one Face about rebuilds, must fit the ring (0.25 m points)
  let lmax = 0; for (const p of Object.values(cr.rs.orders)) lmax = Math.max(lmax, p.Lmax)
  for (const s of cr.shapes) if (s.def.trail && Math.max(s.trailLimit, 15 + (s.turn ? -2 * s.turn.cz : s.depth) + lmax) / 0.25 + 16 > TRAIL)
    throw new Error(`shape ${s.name}: its trail does not fit ${TRAIL} points`)
  const w: World = { meta: new Int32Array(M_LEN), rng: new Uint32Array(4), f, sides: { rearX: f64(SIDES), rearZ: f64(SIDES) }, free, ord, pending: [], data, cr, terrain: terrain ?? buildTerrain(data, cr), debug, scratch: {} }
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
export const formationHandle = (w: World, i: number): Handle => makeHandle(KIND_FORMATION, i, w.f.gen[i])
