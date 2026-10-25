// The bench's timeline (docs/plans/active/c0-bench.md): going back to a tick, playing on from there with the orders
// the log holds after it, and branching when a new order is given there. Pure functions over the sim, so the page's
// glue stays thin and Node tests them (test/timeline.test.ts). Its rules:
// - after every tick, however it was reached (played, stepped, gone to), the world holds every logged order stamped
//   for its next tick, so the same tick is the same world;
// - a tick played again must give the hash it gave the first time; one that does not breaks the timeline, which
//   then refuses to tick on until the page goes to a time;
// - an order given at tick t drops the log, the saves, the hash points, the marks and the dropped orders past t: a
//   branch;
// - the saves stand at a whole number of `every` ticks; past MAX_SNAPS, `every` doubles and only the saves on it stay,
//   so going back replays at most `every` ticks; a branch halves it again while the saves left allow.
// The page reads the timeline's arrays through `tl` each time: going to a time replaces them.
import {
  type World,
  type Stamped,
  type HashPoint,
  type Dropped,
  serialize,
  issue,
  advanceTick,
  reissue,
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

/** The page's timeline: the log of the player's orders, how far the world has taken them, saves and what was seen. */
export interface Timeline {
  log: Stamped[]
  next: number // the log's first entry the world has not been handed yet
  every: number // ticks between saves
  snaps: { tick: number; next: number; bytes: Uint8Array }[] // next: how much of the log the save holds
  hashes: HashPoint[]
  dropped: Dropped[] // the orders the sim dropped, by tick, up to `reached`
  marks: Mark[]
  reached: number // the furthest tick played: going to a time may come back to it
  broken: string // why the timeline refuses to tick on ('' while it is whole)
}

export const mkTimeline = (): Timeline => ({
  log: [],
  next: 0,
  every: SNAP_EVERY,
  snaps: [],
  hashes: [],
  dropped: [],
  marks: [],
  reached: 0,
  broken: '',
})

/** A new order from the player at the world's tick: drops what the timeline held past it (a branch), then logs it. */
export function order(tl: Timeline, w: World, cmd: Parameters<typeof issue>[1]): Stamped {
  const t = w.meta[M_TICK]
  tl.log.length = tl.next
  tl.snaps = tl.snaps.filter(s => s.tick <= t)
  // the interval halves again while the saves left, at half of it, would still fit
  while (tl.every > SNAP_EVERY && Math.floor(t / (tl.every / 2)) <= MAX_SNAPS) tl.every /= 2
  tl.hashes = tl.hashes.filter(h => h.tick <= t)
  tl.dropped = tl.dropped.filter(d => d.tick <= t)
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

// hands the world the logged orders stamped for its next tick, as a replay does (`reissue`, src/sim/replay.ts); an
// order that does not take its logged sequence number breaks the timeline
function feed(tl: Timeline, w: World): void {
  const k = reissue(w, tl.log, tl.next)
  if (typeof k === 'number') {
    tl.next = k
    return
  }
  tl.next = tl.log.findIndex(s => s.tick > w.meta[M_TICK] + 1)
  if (tl.next < 0) tl.next = tl.log.length
  tl.broken = `timeline: at tick ${k.tick} the order log gave ${k.got} where it logged ${k.expected}`
}

/**
 * One tick of the page's world: the tick, its hash point (checked if it was taken before), its dropped orders, the
 * next tick's logged orders, and a save on the save ticks. Throws once the timeline is broken; the world it broke on
 * has still been handed its next orders.
 */
export function step(tl: Timeline, w: World): ReturnType<typeof advanceTick> {
  if (tl.broken) throw new Error(tl.broken)
  const r = advanceTick(w)
  if (r.tick > tl.reached) tl.dropped.push(...r.dropped)
  tl.reached = Math.max(tl.reached, r.tick)
  if (r.hash !== null) {
    const H = tl.hashes
    let k = H.length - 1
    while (k >= 0 && H[k].tick > r.tick) k--
    if (k >= 0 && H[k].tick === r.tick) {
      if (H[k].hash !== r.hash) tl.broken = `timeline: tick ${r.tick} played again gave another world`
    } else H.splice(k + 1, 0, { tick: r.tick, hash: r.hash, sections: [] })
  }
  feed(tl, w)
  if (!tl.broken && r.tick % tl.every === 0 && !tl.snaps.some(s => s.tick === r.tick)) {
    const k = tl.snaps.findIndex(s => s.tick > r.tick)
    tl.snaps.splice(k < 0 ? tl.snaps.length : k, 0, { tick: r.tick, next: tl.next, bytes: serialize(w) })
    while (tl.snaps.length > MAX_SNAPS) {
      tl.every *= 2
      tl.snaps = tl.snaps.filter(s => s.tick % tl.every === 0)
    }
  }
  if (tl.broken) throw new Error(tl.broken)
  return r
}

/** A fresh world for the scenario, handed the orders logged for its first tick. */
export function begin(tl: Timeline, w: World): World {
  tl.next = 0
  feed(tl, w)
  if (tl.broken) throw new Error(tl.broken)
  return w
}

/**
 * The world at tick `T`: from `now` (the page's world) when it stands between the last save before `T` and `T`, else
 * from that save (`load`, with the scenario attached) or a fresh world, played on as the first pass was. It works on
 * a copy of the timeline and changes `tl` only once the world is reached, so a failure leaves the page where it was;
 * reaching a tick also mends a broken timeline.
 */
export function goTo(
  tl: Timeline,
  T: number,
  fresh: () => World,
  load: (bytes: Uint8Array) => World,
  now?: World,
): World {
  const c: Timeline = { ...tl, snaps: [...tl.snaps], hashes: [...tl.hashes], dropped: [...tl.dropped], broken: '' }
  let k = c.snaps.length - 1
  while (k >= 0 && c.snaps[k].tick > T) k--
  const from = k >= 0 ? c.snaps[k].tick : 0
  let w: World
  if (now && !tl.broken && now.meta[M_TICK] >= from && now.meta[M_TICK] <= T) {
    // on from where the page stands: a copy, so a failure leaves its world as it was
    w = load(serialize(now))
  } else if (k >= 0) {
    w = load(c.snaps[k].bytes)
    // the save holds the log as far as it had been handed when it was taken; orders given later in that tick (on
    // the first pass, after the save) are handed now
    c.next = c.snaps[k].next
    feed(c, w)
  } else w = begin(c, fresh())
  while (w.meta[M_TICK] < T) step(c, w)
  if (c.broken) throw new Error(c.broken)
  Object.assign(tl, c)
  return w
}
