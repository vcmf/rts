// The bench's timeline (docs/plans/active/c0-bench.md): going back to a tick, playing on from there with the orders
// the log holds after it, and branching the log when a new order is given there. Pure functions over the sim, so the
// page's glue stays thin and Node tests them (test/timeline.test.ts).
import { type World, type Stamped, type HashPoint, serialize, issue, advanceTick, M_TICK } from '../sim/index.ts'

/** A save of the world every this many ticks, so going back replays at most that many. */
export const SNAP_EVERY = 400
/** At most this many saves (one of 40 battalions is about 2.5 MB): past it, every other one of the older half goes. */
export const MAX_SNAPS = 24

/** The page's timeline: the log of the player's orders, how far the world has taken them, and saves along the way. */
export interface Timeline {
  log: Stamped[]
  next: number // the log's first entry not yet in the world's pending commands
  snaps: { tick: number; bytes: Uint8Array }[]
  hashes: HashPoint[]
  reached: number // the furthest tick played: going to a time may come back to it
}

export const mkTimeline = (): Timeline => ({ log: [], next: 0, snaps: [], hashes: [], reached: 0 })

/** A new order from the player: forgets what the log held after the world's tick (a branch), then logs it. */
export function order(tl: Timeline, w: World, cmd: Parameters<typeof issue>[1]): Stamped {
  const t = w.meta[M_TICK]
  // the entries the world has not taken yet are a future that did not happen: an order now replaces it
  tl.log.length = tl.next
  while (tl.snaps.length && tl.snaps[tl.snaps.length - 1].tick > t) tl.snaps.pop()
  while (tl.hashes.length && tl.hashes[tl.hashes.length - 1].tick > t) tl.hashes.pop()
  tl.reached = t
  const s = issue(w, cmd, tl.log)
  tl.next = tl.log.length
  return s
}

/**
 * Hands the world the logged orders stamped for its next tick that it does not have yet, issued again as a replay
 * issues them (`play` in src/sim/replay.ts): one that does not take the sequence number it was logged with is a
 * timeline gone wrong, and says so.
 */
export function feed(tl: Timeline, w: World): void {
  while (tl.next < tl.log.length && tl.log[tl.next].tick === w.meta[M_TICK] + 1) {
    const want = tl.log[tl.next++]
    const got = issue(w, want.cmd)
    if (got.seq !== want.seq) {
      throw new Error(`timeline: the order logged as ${want.seq} at tick ${want.tick} was issued again as ${got.seq}`)
    }
  }
}

/** One tick of the page's world: the log's due orders, the tick, its hash point, and a save on the save ticks. */
export function step(tl: Timeline, w: World): ReturnType<typeof advanceTick> {
  feed(tl, w)
  const r = advanceTick(w)
  tl.reached = Math.max(tl.reached, r.tick)
  // a tick played again after going back is the one first played: its hash point and its save are there already
  const H = tl.hashes
  if (r.hash !== null && (!H.length || H[H.length - 1].tick < r.tick)) {
    H.push({ tick: r.tick, hash: r.hash, sections: [] })
  }
  const S = tl.snaps
  if (r.tick % SNAP_EVERY === 0 && (!S.length || S[S.length - 1].tick < r.tick)) {
    S.push({ tick: r.tick, bytes: serialize(w) })
    // the saves thin out going back in time: every other one of the older half is let go
    if (S.length > MAX_SNAPS) tl.snaps = S.filter((_, k) => k >= S.length / 2 || k % 2 === 0)
  }
  return r
}

/**
 * The world at tick `T`: the last save at or before it (`load`, with the scenario attached), or a fresh one, played
 * on as the first pass was (the log's orders at their ticks, the hash points and saves). The log is kept: its orders
 * after `T` are fed in as the world reaches their ticks, so going back and playing on gives the world the first pass
 * gave.
 */
export function goTo(tl: Timeline, T: number, fresh: () => World, load: (bytes: Uint8Array) => World): World {
  let k = tl.snaps.length - 1
  while (k >= 0 && tl.snaps[k].tick > T) k--
  const w = k >= 0 ? load(tl.snaps[k].bytes) : fresh()
  // the log's first entry the world at its tick has not taken: those stamped for later ticks
  tl.next = tl.log.findIndex(s => s.tick > w.meta[M_TICK])
  if (tl.next < 0) tl.next = tl.log.length
  while (w.meta[M_TICK] < T) step(tl, w)
  // the orders stamped for the next tick were pending at T the first time: the world has them again
  feed(tl, w)
  return w
}
