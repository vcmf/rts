// The tick (docs/proposals/sim-design.md §16, the determinism contract). S0 runs the steps the spine
// needs; the others are named and empty until S1 fills them. Every loop runs in index order; the fight
// reads the start-of-step strengths, so the order of formations never favours a side.
import { type World, M_TICK, M_FREE } from './world.ts'
import { applyCommands, type Dropped } from './commands.ts'
import { DT, HASH_EVERY } from './time.ts'
import { atan2, assertFinite } from './num.ts'
import { freeList, freeNode } from './pool.ts'
import { speedFactorAt } from './data.ts'
import { sampleCount } from './rng.ts'
import { hashWorld } from './serialize.ts'
import { MAX_FORMATIONS } from './world.ts'

// metering is injected: the sim never reads a clock itself
export interface Meter { now(): number; add(step: string, ms: number): void }

export const S0 = {
  baseSpeed: 1.0,        // m/s on open ground (stand-in for the ruleset's paces)
  contact: 40,           // m: opposing blocks this close fight
  lossRate: 0.03,        // men lost per tick per 100 enemies in contact
}
const kills = new Int32Array(MAX_FORMATIONS)

export interface TickResult { tick: number; hash: number | null; dropped: Dropped[] }

export function advanceTick(w: World, meter?: Meter): TickResult {
  const t = w.meta[M_TICK] + 1
  const step = (name: string, fn: () => void) => { if (!meter) return fn(); const t0 = meter.now(); fn(); meter.add(name, meter.now() - t0) }
  let dropped: Dropped[] = []
  step('1 commands', () => { dropped = applyCommands(w, t) })
  // 2 commanders · 3 enemy AI · 4 standing behaviour · 5 orders → formation state: S1
  step('6 movement', () => movement(w))
  // 7 vision: S2
  step('8 fire (S0 stand-in fight)', () => fight(w))
  // 9 roundshot · 10 melee: S1
  step('11 casualties', () => casualties(w))
  // 12 morale and cohesion · 13 smoke: S1, S2
  step('14 reap', () => reap(w))
  w.meta[M_TICK] = t
  if (w.debug) for (const [name, a] of [['x', w.f.x], ['z', w.f.z], ['facing', w.f.facing], ['speed', w.f.speed], ['wp.x', w.wp.x], ['wp.z', w.wp.z]] as const) assertFinite(name, a)
  let hash: number | null = null
  step('15 hash', () => { if (t % HASH_EVERY === 0) hash = hashWorld(w) })
  return { tick: t, hash, dropped }
}

// blocks walk their waypoints at the base speed times the cost grid's factor where they stand
function movement(w: World) {
  const f = w.f, p = w.wp
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    const n = f.wpHead[i]
    if (n < 0) { f.speed[i] = 0; continue }
    const dx = p.x[n] - f.x[i], dz = p.z[n] - f.z[i], d = Math.sqrt(dx * dx + dz * dz)
    const v = S0.baseSpeed * speedFactorAt(w.data, f.x[i], f.z[i]), s = v * DT
    f.speed[i] = v
    if (d > 0) f.facing[i] = atan2(dx, dz)
    if (d <= s) {   // reached: on to the next waypoint
      f.x[i] = p.x[n]; f.z[i] = p.z[n]
      f.wpHead[i] = p.next[n]; if (f.wpHead[i] < 0) f.wpTail[i] = -1
      freeNode(p, n)
    } else if (s > 0) { f.x[i] += dx / d * s; f.z[i] += dz / d * s }
  }
}

// stand-in for fire and melee: each pair of opposing blocks in contact loses men by RNG draws, from the
// start-of-step strengths, pairs in index order
function fight(w: World) {
  const f = w.f, r2 = S0.contact * S0.contact
  kills.fill(0)
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i]) continue
    for (let j = i + 1; j < MAX_FORMATIONS; j++) {
      if (!f.alive[j] || f.side[j] === f.side[i]) continue
      const dx = f.x[j] - f.x[i], dz = f.z[j] - f.z[i]
      if (dx * dx + dz * dz > r2) continue
      kills[i] += sampleCount(w.rng, S0.lossRate * f.men[j] / 100)
      kills[j] += sampleCount(w.rng, S0.lossRate * f.men[i] / 100)
    }
  }
}
function casualties(w: World) {
  const f = w.f
  for (let i = 0; i < MAX_FORMATIONS; i++) if (f.alive[i] && kills[i]) f.men[i] = Math.max(0, f.men[i] - kills[i])
}
// empty formations free their slot (the generation moves on, so old handles go stale) and waypoints
function reap(w: World) {
  const f = w.f
  for (let i = 0; i < MAX_FORMATIONS; i++) {
    if (!f.alive[i] || f.men[i] > 0) continue
    freeList(w.wp, f.wpHead[i])
    f.alive[i] = 0; f.gen[i] = (f.gen[i] + 1) & ((1 << 19) - 1)
    f.side[i] = 0; f.men[i] = 0; f.x[i] = 0; f.z[i] = 0; f.facing[i] = 0; f.speed[i] = 0; f.wpHead[i] = -1; f.wpTail[i] = -1
    w.free[w.meta[M_FREE]++] = i
  }
}
