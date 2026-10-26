// The sim page's small rules, out of the page's glue so they are tested (test/page-rules.test.ts).
import type { Formations } from '../sim/index.ts'

/** Drops from `selected` the formations gone since they were chosen: dead, or their slot reused by another (its
 * generation no longer the one `chosen` recorded). The page sees the battle a frame at a time, not each tick, so a
 * formation can go and its slot be refilled between two frames. */
export function pruneSelection(selected: Set<number>, chosen: Map<number, number>, f: Formations): void {
  for (const i of selected) if (!f.alive[i] || f.gen[i] !== chosen.get(i)) selected.delete(i)
}

/** The speed the battle runs at: the panel's, or 0 while paused (P, the headless checks) or hidden (as the page's
 * animation frames stop, which ran the battle before it moved to a worker). */
export const runSpeed = (speed: number, paused: boolean, hidden: boolean): number => (paused || hidden ? 0 : speed)
