// The tick (docs/proposals/sim-design.md §16, the determinism contract). Every loop runs in slot order.
// S1a fills steps 1, 5–6 (orders → formation state and movement, one call per formation) and 14; S1c fills
// 8 (fire), 11 (casualties) and 12 (morale; the rout is its standing behaviour). The others are named and
// empty until later parts of S1.
import { type World, M_TICK, MAX_FORMATIONS } from './world.ts'
import { applyCommands, reapFormation, type Dropped } from './commands.ts'
import { HASH_EVERY } from './time.ts'
import { assertFinite } from './num.ts'
import { formationTick, menOf } from './formation.ts'
import { hashWorld } from './serialize.ts'
import { fireStep, casualtiesStep } from './fire.ts'
import { moraleStep } from './morale.ts'
import { columnsOf } from './columns.ts'

// metering is injected: the sim never reads a clock itself
export interface Meter { now(): number; add(step: string, ms: number): void }
export interface TickResult { tick: number; hash: number | null; dropped: Dropped[] }

export function advanceTick(w: World, meter?: Meter): TickResult {
  const t = w.meta[M_TICK] + 1
  const step = (name: string, fn: () => void) => { if (!meter) return fn(); const t0 = meter.now(); fn(); meter.add(name, meter.now() - t0) }
  let dropped: Dropped[] = []
  step('1 commands', () => { dropped = applyCommands(w, t) })
  // 2 commanders · 3 enemy AI · 4 standing behaviour: S1c+
  step('5–6 formations: orders, changes, movement', () => { for (let i = 0; i < MAX_FORMATIONS; i++) if (w.f.alive[i]) formationTick(w, i) })
  // 7 vision: S2
  step('8 fire', () => { fireStep(w) })
  // 9 roundshot · 10 melee: S1d
  // each battalion's casualties and morale read only its own state: any order gives the same result
  step('11–12 casualties and morale', () => { for (let i = 0; i < MAX_FORMATIONS; i++) if (w.f.alive[i]) moraleStep(w, i, casualtiesStep(w, i)) })
  // 13 smoke: S2
  step('14 reap', () => { for (let i = 0; i < MAX_FORMATIONS; i++) if (w.f.alive[i] && menOf(w, i) === 0) reapFormation(w, i) })
  w.meta[M_TICK] = t
  if (w.debug) for (const a of columnsOf(w.f)) if (a instanceof Float64Array) assertFinite('formation state', a)
  let hash: number | null = null
  step('15 hash', () => { if (t % HASH_EVERY === 0) hash = hashWorld(w) })
  return { tick: t, hash, dropped }
}
