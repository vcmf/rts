// The bench's timeline (docs/plans/active/c0-bench.md): going back to a tick, playing on from there with the orders
// the log holds after it, and branching when a new order is given there. Pure functions over the sim, so the page's
// glue stays thin and Node tests them (test/timeline.test.ts). Its rules:
// - after every tick, however it was reached (played, stepped, gone to), the world holds every logged order stamped
//   for its next tick, so the same tick is the same world;
// - a tick played again must give the hash it gave the first time, or the timeline throws;
// - an order given at tick t drops the log, the saves, the hash points and the marks past t: a branch;
// - the saves stand at a whole number of `every` ticks; past MAX_SNAPS, `every` doubles and only the saves on it stay,
//   so going back replays at most `every` ticks.
import {
  type World,
  type Stamped,
  type HashPoint,
  type Dropped,
  serialize,
  issue,
  advanceTick,
  M_TICK,
} from '../sim/index.ts'

/** The first interval between saves, in ticks (20 s). */
export const SNAP_EVERY = 400
/** At most this many saves (one of 40 battalions is about 2.5 MB). */
export const MAX_SNAPS = 24

/** A moment the player marked (docs/plans/active/s1e3-playtest.md). */
export interface Mark {
  tick: number
  note: string
}

/** The page's timeline: the log of the player's orders, how far the world has taken them, saves and marks. */
export interface Timeline {
  log: Stamped[]
  next: number // the log's first entry the world has not been handed yet
  every: number // ticks between saves
  snaps: { tick: number; next: number; bytes: Uint8Array }[] // next: how much of the log the save holds
  hashes: HashPoint[]
  marks: Mark[]
  reached: number // the furthest tick played: going to a time may come back to it
}

export const mkTimeline = (): Timeline => ({
  log: [],
  next: 0,
  every: SNAP_EVERY,
  snaps: [],
  hashes: [],
  marks: [],
  reached: 0,
})

/** A new order from the player at the world's tick: drops what the timeline held past it (a branch), then logs it. */
export function order(tl: Timeline, w: World, cmd: Parameters<typeof issue>[1]): Stamped {
  const t = w.meta[M_TICK]
  tl.log.length = tl.next
  while (tl.snaps.length && tl.snaps[tl.snaps.length - 1].tick > t) tl.snaps.pop()
  while (tl.hashes.length && tl.hashes[tl.hashes.length - 1].tick > t) tl.hashes.pop()
  tl.marks = tl.marks.filter(m => m.tick <= t)
  tl.reached = t
  const s = issue(w, cmd, tl.log)
  tl.next = tl.log.length
  return s
}

/** A moment marked at the world's tick. */
export function mark(tl: Timeline, w: World, note: string): void {
  tl.marks.push({ tick: w.meta[M_TICK], note })
}

/**
 * Hands the world the logged orders stamped for its next tick, issued again as a replay issues them (`play` in
 * src/sim/replay.ts): one that does not take the sequence number it was logged with is a timeline gone wrong.
 */
function feed(tl: Timeline, w: World): void {
  while (tl.next < tl.log.length && tl.log[tl.next].tick === w.meta[M_TICK] + 1) {
    const want = tl.log[tl.next++]
    const got = issue(w, want.cmd)
    if (got.seq !== want.seq) {
      throw new Error(`timeline: the order logged as ${want.seq} at tick ${want.tick} was issued again as ${got.seq}`)
    }
  }
}

/** One tick of the page's world: the tick, its hash point (checked if it was taken before), the next tick's orders,
 * and a save on the save ticks. */
export function step(tl: Timeline, w: World): ReturnType<typeof advanceTick> {
  const r = advanceTick(w)
  tl.reached = Math.max(tl.reached, r.tick)
  if (r.hash !== null) {
    const H = tl.hashes
    let k = H.length - 1
    while (k >= 0 && H[k].tick > r.tick) k--
    if (k >= 0 && H[k].tick === r.tick) {
      if (H[k].hash !== r.hash) throw new Error(`timeline: tick ${r.tick} played again gave another world`)
    } else H.splice(k + 1, 0, { tick: r.tick, hash: r.hash, sections: [] })
  }
  feed(tl, w)
  if (r.tick % tl.every === 0 && !tl.snaps.some(s => s.tick === r.tick)) {
    const k = tl.snaps.findIndex(s => s.tick > r.tick)
    tl.snaps.splice(k < 0 ? tl.snaps.length : k, 0, { tick: r.tick, next: tl.next, bytes: serialize(w) })
    while (tl.snaps.length > MAX_SNAPS) {
      tl.every *= 2
      tl.snaps = tl.snaps.filter(s => s.tick % tl.every === 0)
    }
  }
  return r
}

/** A fresh world for the scenario, handed the orders logged for its first tick. */
export function begin(tl: Timeline, w: World): World {
  tl.next = 0
  feed(tl, w)
  return w
}

/**
 * The world at tick `T` and the orders it dropped on the way: the last save at or before `T` (`load`, with the
 * scenario attached) or a fresh world, played on as the first pass was. It works on a copy of the timeline and
 * changes `tl` only once the world is reached, so a failure leaves the page where it was.
 */
export function goTo(
  tl: Timeline,
  T: number,
  fresh: () => World,
  load: (bytes: Uint8Array) => World,
): { w: World; dropped: Dropped[] } {
  const c: Timeline = { ...tl, snaps: [...tl.snaps], hashes: [...tl.hashes] }
  let k = c.snaps.length - 1
  while (k >= 0 && c.snaps[k].tick > T) k--
  let w: World
  if (k >= 0) {
    w = load(c.snaps[k].bytes)
    // the save holds the log as far as it had been handed when it was taken; orders given later in that tick (on
    // the first pass, after the save) are handed now
    c.next = c.snaps[k].next
    feed(c, w)
  } else w = begin(c, fresh())
  const dropped: Dropped[] = []
  while (w.meta[M_TICK] < T) dropped.push(...step(c, w).dropped)
  Object.assign(tl, c)
  return { w, dropped }
}
