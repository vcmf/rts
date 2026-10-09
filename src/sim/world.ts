// The world: all simulation state, in typed arrays (structure of arrays, docs/architecture.md §3), so
// the hash and saves cover every byte. S0 holds one table, formations (moving blocks), and one pool,
// waypoints. Only the commands stamped for the next tick live outside typed arrays; the serializer
// writes them too.
import { makePool, type Pool } from './pool.ts'
import { type SimData } from './data.ts'
import { type RngState, seedRng } from './rng.ts'
import { type Stamped } from './commands.ts'

export const MAX_FORMATIONS = 128
export const MAX_WAYPOINTS = 1024
export const SIDES = 2

// meta words
export const M_TICK = 0, M_FREE = 1, M_DATA = 2, M_SEQ = 3, M_LEN = 4

export interface Formations {
  alive: Uint8Array
  gen: Int32Array
  side: Uint8Array
  men: Int32Array
  x: Float64Array
  z: Float64Array
  facing: Float64Array    // heading, radians, 0 = +z, clockwise toward +x
  speed: Float64Array     // m/s this tick
  wpHead: Int32Array      // first waypoint node, −1 none
  wpTail: Int32Array
}
export interface World {
  meta: Int32Array        // tick, free slots, data version, command sequence
  rng: RngState
  f: Formations
  free: Int32Array        // stack of free formation slots (top at meta[M_FREE] − 1)
  wp: Pool
  pending: Stamped[]      // commands stamped for the next tick, in arrival order
  data: SimData           // build-time data (not state: its version is)
  debug: boolean          // assert finite state every tick
}

export function makeWorld(data: SimData, seed: number, debug = true): World {
  const N = MAX_FORMATIONS
  const f: Formations = {
    alive: new Uint8Array(N), gen: new Int32Array(N), side: new Uint8Array(N), men: new Int32Array(N),
    x: new Float64Array(N), z: new Float64Array(N), facing: new Float64Array(N), speed: new Float64Array(N),
    wpHead: new Int32Array(N).fill(-1), wpTail: new Int32Array(N).fill(-1),
  }
  const free = new Int32Array(N)
  for (let i = 0; i < N; i++) free[i] = N - 1 - i   // slot 0 is handed out first
  const w: World = { meta: new Int32Array(M_LEN), rng: new Uint32Array(4), f, free, wp: makePool(MAX_WAYPOINTS), pending: [], data, debug }
  w.meta[M_FREE] = N
  w.meta[M_DATA] = data.version | 0
  seedRng(w.rng, seed)
  return w
}

export const tickOf = (w: World): number => w.meta[M_TICK]
