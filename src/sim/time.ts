// Simulation time (docs/architecture.md §4, docs/proposals/sim-design.md §2): one tick is 50 ms of
// battle time, always. Game speed changes how many ticks run per real second, never the tick length.
// Data is authored in seconds and converted here.
export const TICK_HZ = 20
export const TICK_MS = 50
export const DT = 1 / TICK_HZ // seconds per tick (exactly 0.05 as a double)
export const HASH_EVERY = 20 // ticks between state hashes (one per battle second)

export const secondsToTicks = (seconds: number): number => Math.round(seconds * TICK_HZ)
