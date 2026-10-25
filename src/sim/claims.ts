// The claim grid, a prototype (docs/plans/active/c1-claims.md): other formations' cells are impassable ground for the
// formation that moves, so the footprint gate, the lag model and the change's path check keep formations apart as
// they keep men off water. On only where a scenario asks for it (`ScenarioRules.claims`); rebuilt from the positions
// at every formation step, so it is not state and no hash covers it.
import { type World, MAX_FORMATIONS, M_TICK, M_SEED, outOfFight, typeOf, formationHandle as handleOf } from './world.ts'
import { DT } from './time.ts'
import { mkPlaces, placesCtx, placeAtSlot, filledSlots, type Places } from './formation.ts'
import { keyedStream, nextU32 } from './rng.ts'

// the margin round a formation's own cells, in cells (a cell is the terrain's: 2 m on the bench field)
const MARGIN = 1
const K_ORDER = 0x434c // the keyed draw that orders the formations in a tick

/** Per terrain cell, up to two claims (owner slot + 1, times 2, plus 1 for its core) and a mark for more. */
export interface Claims {
  a: Int16Array
  b: Int16Array
  more: Uint8Array
  // per formation, the box of the cells it claims this tick: x0, z0, x1, z1 (empty: x0 > x1)
  box: Float64Array
  ctx: Places
}

const ks = new Uint32Array(4)
const pt = [0, 0, 0]

function claimsOf(w: World): Claims {
  const n = w.terrain.n * w.terrain.n
  const c = w.scratch.claims
  if (c && c.a.length === n) return c
  return (w.scratch.claims = {
    a: new Int16Array(n),
    b: new Int16Array(n),
    more: new Uint8Array(n),
    box: new Float64Array(MAX_FORMATIONS * 4),
    ctx: mkPlaces(w),
  })
}

// claims cell k for formation i, its core or its halo (a core claim upgrades a halo one)
function claim(C: Claims, k: number, i: number, core: number): void {
  const e = (i + 1) * 2 + core
  for (const arr of [C.a, C.b]) {
    if (arr[k] === 0) {
      arr[k] = e
      return
    }
    if (arr[k] >> 1 === i + 1) {
      arr[k] |= core
      return
    }
  }
  C.more[k] = 1
}

/** Claims the cells of formation i's places as it stands: their cells as its core, and a margin round them. */
export function claimFormation(w: World, i: number): void {
  const C = claimsOf(w)
  const T = w.terrain
  const f = w.f
  const U = typeOf(w, i)
  const CS = w.cr.maxC
  const F = filledSlots(w, i)
  placesCtx(C.ctx, i, f.x[i], f.z[i], f.heading[i], w.meta[M_TICK] * DT, 0)
  const B = C.box
  for (let k = F.at[i * (CS + 1)]; k < F.at[i * (CS + 1) + U.C]; k++) {
    placeAtSlot(C.ctx, F.s[k], pt)
    B[i * 4] = Math.min(B[i * 4], pt[0])
    B[i * 4 + 1] = Math.min(B[i * 4 + 1], pt[1])
    B[i * 4 + 2] = Math.max(B[i * 4 + 2], pt[0])
    B[i * 4 + 3] = Math.max(B[i * 4 + 3], pt[1])
    const gx = Math.round((pt[0] - T.x0) / T.cell)
    const gz = Math.round((pt[1] - T.z0) / T.cell)
    for (let dz = -MARGIN; dz <= MARGIN; dz++) {
      for (let dx = -MARGIN; dx <= MARGIN; dx++) {
        const x = gx + dx
        const z = gz + dz
        if (x < 0 || z < 0 || x >= T.n || z >= T.n) continue
        claim(C, z * T.n + x, i, dx === 0 && dz === 0 ? 1 : 0)
      }
    }
  }
}

/** Clears the grid and claims every live formation's cells, at the start of the formation step. */
export function buildClaims(w: World): void {
  const C = claimsOf(w)
  C.a.fill(0)
  C.b.fill(0)
  C.more.fill(0)
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    C.box.set([Infinity, Infinity, -Infinity, -Infinity], i * 4)
    if (w.f.alive[i]) claimFormation(w, i)
  }
}

// whether formation o's claim (its core or its halo) blocks formation i
function blocks(w: World, i: number, o: number, core: boolean): boolean {
  const f = w.f
  const enemy = f.side[i] !== f.side[o]
  // loose bodies (out of the fight) pass through friends, and friends through them
  if (!enemy && (outOfFight(f.mstate[i]) || outOfFight(f.mstate[o]))) return false
  // a melee pair stands in contact
  if (enemy && (f.foe[i] === handleOf(w, o) || f.foe[o] === handleOf(w, i))) return false
  // a charge reaches its enemy's core
  if (enemy && f.chPhase[i] !== 0) return core
  return true
}

/** Whether the cell at (x, z) is claimed by a formation that blocks formation i there. */
export function claimedAt(w: World, i: number, x: number, z: number): boolean {
  const C = w.scratch.claims
  if (!C) return false
  const T = w.terrain
  const gx = Math.round((x - T.x0) / T.cell)
  const gz = Math.round((z - T.z0) / T.cell)
  if (gx < 0 || gz < 0 || gx >= T.n || gz >= T.n) return false
  const k = gz * T.n + gx
  const a = C.a[k]
  const b = C.b[k]
  if (a !== 0 && (a >> 1) - 1 !== i && blocks(w, i, (a >> 1) - 1, (a & 1) === 1)) return true
  if (b !== 0 && (b >> 1) - 1 !== i && blocks(w, i, (b >> 1) - 1, (b & 1) === 1)) return true
  return C.more[k] === 1
}

// how far a formation's places may reach past its claimed box within a tick (its margin, a cell, its motion)
const SLACK = 6

/** Whether another formation's claims come near i's (the gate's quick rejects then wait): their boxes, grown, meet */
export function claimsNear(w: World, i: number): boolean {
  const C = w.scratch.claims
  if (!C) return false
  const B = C.box
  for (let j = 0; j < MAX_FORMATIONS; j++) {
    if (j === i || !w.f.alive[j] || B[j * 4] > B[j * 4 + 2]) continue
    if (
      B[j * 4] - SLACK <= B[i * 4 + 2] + SLACK &&
      B[i * 4] - SLACK <= B[j * 4 + 2] + SLACK &&
      B[j * 4 + 1] - SLACK <= B[i * 4 + 3] + SLACK &&
      B[i * 4 + 1] - SLACK <= B[j * 4 + 3] + SLACK
    ) {
      return true
    }
  }
  return false
}

/** The live formations in the order of a tick with claims: by a keyed draw on the tick, ties by slot. */
export function claimOrder(w: World): number[] {
  const order: number[] = []
  const key: number[] = []
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!w.f.alive[i]) continue
    order.push(i)
    key[i] = nextU32(keyedStream(ks, w.meta[M_SEED], w.meta[M_TICK], handleOf(w, i), 0, K_ORDER))
  }
  return order.sort((p, q) => key[p] - key[q] || p - q)
}
