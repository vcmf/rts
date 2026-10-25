// The bench's timeline (docs/plans/active/c0-bench.md): going back to a tick, playing on from there with the orders
// the log holds after it, and branching the log when a new order is given there. Pure functions over the sim, so the
// page's glue stays thin and Node tests them (test/timeline.test.ts).
import { type World, type Stamped, type HashPoint, serialize, issue, advanceTick, M_TICK, M_SEQ } from '../sim/index.ts'

/** A save of the world every this many ticks, so going back replays at most that many. */
export const SNAP_EVERY = 400

/** The page's timeline: the log of the player's orders, how far the world has taken them, and saves along the way. */
export interface Timeline {
  log: Stamped[]
  next: number // the log's first entry not yet in the world's pending commands
  snaps: { tick: number; bytes: Uint8Array }[]
  hashes: HashPoint[]
}

export const mkTimeline = (): Timeline => ({ log: [], next: 0, snaps: [], hashes: [] })

/** A new order from the player: forgets what the log held after the world's tick (a branch), then logs it. */
export function order(tl: Timeline, w: World, cmd: Parameters<typeof issue>[1]): Stamped {
  const t = w.meta[M_TICK]
  // the entries the world has not taken yet are a future that did not happen: an order now replaces it
  tl.log.length = tl.next
  while (tl.snaps.length && tl.snaps[tl.snaps.length - 1].tick > t) tl.snaps.pop()
  while (tl.hashes.length && tl.hashes[tl.hashes.length - 1].tick > t) tl.hashes.pop()
  const s = issue(w, cmd, tl.log)
  tl.next = tl.log.length
  return s
}

/** Hands the world the logged orders stamped for its next tick that it does not have yet, as they were stamped. */
export function feed(tl: Timeline, w: World): void {
  while (tl.next < tl.log.length && tl.log[tl.next].tick === w.meta[M_TICK] + 1) {
    const s = tl.log[tl.next++]
    w.pending.push(s)
    w.meta[M_SEQ] = s.seq + 1
  }
}

/** One tick of the page's world: the log's due orders, the tick, its hash point, and a save on the save ticks. */
export function step(tl: Timeline, w: World): ReturnType<typeof advanceTick> {
  feed(tl, w)
  const r = advanceTick(w)
  if (r.hash !== null && !tl.hashes.some(h => h.tick === r.tick)) {
    tl.hashes.push({ tick: r.tick, hash: r.hash, sections: [] })
  }
  if (r.tick % SNAP_EVERY === 0 && !tl.snaps.some(s => s.tick === r.tick)) {
    tl.snaps.push({ tick: r.tick, bytes: serialize(w) })
  }
  return r
}

/**
 * The world at tick `T`: the last save at or before it (`load`, with the scenario attached), or a fresh one, played
 * on with the log's orders at their ticks. The log is kept: the orders after `T` are fed in as the world reaches
 * their ticks, so going back and playing on gives the world the first pass gave.
 */
export function goTo(tl: Timeline, T: number, fresh: () => World, load: (bytes: Uint8Array) => World): World {
  const snap = [...tl.snaps].reverse().find(s => s.tick <= T)
  const w = snap ? load(snap.bytes) : fresh()
  // the log's first entry the world at its tick has not taken: those stamped for later ticks
  tl.next = tl.log.findIndex(s => s.tick > w.meta[M_TICK])
  if (tl.next < 0) tl.next = tl.log.length
  while (w.meta[M_TICK] < T) {
    feed(tl, w)
    advanceTick(w)
  }
  // the orders stamped for the next tick were pending at T the first time: the world has them again
  feed(tl, w)
  return w
}
