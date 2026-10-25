// The bench's timeline (docs/plans/active/c0-bench.md): going back to a tick, playing on from there with the orders
// the log holds after it, and branching when a new order is given there. Pure functions over the sim, so the page's
// glue stays thin and Node tests them (test/timeline.test.ts). Its rules:
// - after every tick, however it was reached (played, stepped, gone to), the world holds every logged order stamped
//   for its next tick, so the same tick is the same world;
// - a tick played again should give the hash it gave the first time. If it does not (a sim that is not
//   deterministic, which the bench's tests forbid), the timeline says so in `warning` and takes the new pass as the
//   truth from that tick on: the hash points, saves and dropped orders past it are the new pass's. It never refuses to
//   go on;
// - an order given at tick t drops the log, the saves, the hash points, the marks and the dropped orders past t: a
//   branch;
// - saves stand at a whole number of `every` ticks; past MAX_SNAPS, `every` doubles and only the saves on it stay. A
//   branch halves `every` again while the saves left allow, though the saves before the branch keep their spacing.
//   The last RECENT hash ticks' worlds are kept too (the tick serializes the world to hash it anyway), so a tick back
//   replays at most one hash interval;
// - the page reads the timeline's arrays through `tl` each time: going to a time replaces them.
import {
  type World,
  type Stamped,
  type HashPoint,
  type Dropped,
  issue,
  advanceTick,
  reissue,
  M_TICK,
  HASH_EVERY,
} from '../sim/index.ts'

/** The first interval between saves, in ticks (20 s). */
export const SNAP_EVERY = 400
/** At most this many saves (one of 40 battalions is about 2.5 MB). */
export const MAX_SNAPS = 24
/** The worlds of the last this many hash ticks, kept for going back a little. */
export const RECENT = 10

/** A moment the player marked (docs/plans/active/s1e3-playtest.md). */
export interface Mark {
  tick: number
  note: string
}
/** A world kept to go back to: its tick, how much of the log it holds, its bytes. */
interface Save {
  tick: number
  next: number
  bytes: Uint8Array
}

/** The page's timeline: the log of the player's orders, how far the world has taken them, saves and what was seen. */
export interface Timeline {
  log: Stamped[]
  next: number // the log's first entry the world has not been handed yet
  every: number // ticks between saves
  snaps: Save[]
  recent: Save[]
  hashes: HashPoint[]
  dropped: Dropped[] // the orders the sim dropped, by tick, up to `reached`
  marks: Mark[]
  reached: number // the furthest tick played
  warning: string // the last tick played again that gave another world ('' if none)
}

export const mkTimeline = (): Timeline => ({
  log: [],
  next: 0,
  every: SNAP_EVERY,
  snaps: [],
  recent: [],
  hashes: [],
  dropped: [],
  marks: [],
  reached: 0,
  warning: '',
})

// keeps what the timeline holds up to tick t and forgets the rest
function cut(tl: Timeline, t: number): void {
  tl.snaps = tl.snaps.filter(s => s.tick <= t)
  tl.recent = tl.recent.filter(s => s.tick <= t)
  tl.hashes = tl.hashes.filter(h => h.tick <= t)
  tl.dropped = tl.dropped.filter(d => d.tick <= t)
  tl.reached = t
}

/** A new order from the player at the world's tick: drops what the timeline held past it (a branch), then logs it. */
export function order(tl: Timeline, w: World, cmd: Parameters<typeof issue>[1]): Stamped {
  const t = w.meta[M_TICK]
  tl.log.length = tl.next
  cut(tl, t)
  tl.marks = tl.marks.filter(m => m.tick <= t)
  // the interval halves again while the saves left, at half of it, would still fit
  while (tl.every > SNAP_EVERY && Math.floor(t / (tl.every / 2)) <= MAX_SNAPS) tl.every /= 2
  const s = issue(w, cmd, tl.log)
  tl.next = tl.log.length
  return s
}

/** A moment marked at the world's tick. */
export function mark(tl: Timeline, w: World, note: string): void {
  tl.marks.push({ tick: w.meta[M_TICK], note })
}

// hands the world the logged orders stamped for its next tick, as a replay does (`reissue`, src/sim/replay.ts). An
// order the world numbers otherwise than the log did takes the world's number in the log, and the timeline says so
function feed(tl: Timeline, w: World): void {
  while (true) {
    const k = reissue(w, tl.log, tl.next)
    if (typeof k === 'number') {
      tl.next = k
      return
    }
    tl.warning = `timeline: at tick ${k.tick} the world numbered a logged order ${k.got}, the log ${k.expected}`
    const s = w.pending[w.pending.length - 1]
    tl.log[tl.next] = s
    tl.next++
  }
}

// keeps the world as it stood at tick t (its bytes, as the tick hashed it, before the next tick's orders were handed:
// `next` is how much of the log they hold) among the saves and the recent ones
function keep(tl: Timeline, t: number, bytes: Uint8Array, next: number): void {
  const save = { tick: t, next, bytes }
  if (t % tl.every === 0 && !tl.snaps.some(s => s.tick === t)) {
    const k = tl.snaps.findIndex(s => s.tick > t)
    tl.snaps.splice(k < 0 ? tl.snaps.length : k, 0, save)
    while (tl.snaps.length > MAX_SNAPS) {
      tl.every *= 2
      tl.snaps = tl.snaps.filter(s => s.tick % tl.every === 0)
    }
  }
  tl.recent = tl.recent.filter(s => s.tick !== t && s.tick > t - RECENT * HASH_EVERY)
  tl.recent.push(save)
  tl.recent.sort((a, b) => a.tick - b.tick)
}

/**
 * One tick of the page's world: the tick, its hash point (checked if it was taken before), its dropped orders, the
 * next tick's logged orders, and the world kept on hash ticks.
 */
export function step(tl: Timeline, w: World): ReturnType<typeof advanceTick> {
  const r = advanceTick(w)
  if (r.hash !== null) {
    const H = tl.hashes
    let k = H.length - 1
    while (k >= 0 && H[k].tick > r.tick) k--
    if (k >= 0 && H[k].tick === r.tick && H[k].hash !== r.hash) {
      // the first pass and this one part here: this one is the truth from here on
      tl.warning = `timeline: tick ${r.tick} played again gave another world; the timeline follows it from here`
      cut(tl, r.tick - 1)
      k = tl.hashes.length - 1
    }
    if (!(k >= 0 && tl.hashes[k].tick === r.tick))
      {tl.hashes.splice(k + 1, 0, { tick: r.tick, hash: r.hash, sections: [] })}
  }
  if (r.tick > tl.reached) tl.dropped.push(...r.dropped)
  tl.reached = Math.max(tl.reached, r.tick)
  const held = tl.next
  feed(tl, w)
  if (r.bytes) keep(tl, r.tick, r.bytes, held)
  return r
}

/** A fresh world for the scenario, handed the orders logged for its first tick. */
export function begin(tl: Timeline, w: World): World {
  tl.next = 0
  feed(tl, w)
  return w
}

/**
 * The world at tick `T`, played on as the first pass was: `now` itself when it stands at `T`; else from the latest of
 * `now`, a recent world and a save that stands at or before `T` (`load` makes a world of a save, the scenario
 * attached), or a fresh one. It works on a copy of the timeline and changes `tl` only once the world is reached, so a
 * failure leaves the page where it was.
 */
export function goTo(
  tl: Timeline,
  T: number,
  fresh: () => World,
  load: (bytes: Uint8Array) => World,
  now?: World,
): World {
  if (now && now.meta[M_TICK] === T) return now
  const c: Timeline = {
    ...tl,
    snaps: [...tl.snaps],
    recent: [...tl.recent],
    hashes: [...tl.hashes],
    dropped: [...tl.dropped],
  }
  const saved = [...c.snaps, ...c.recent].filter(s => s.tick <= T).sort((a, b) => b.tick - a.tick)[0]
  let w: World
  if (now && now.meta[M_TICK] < T && (!saved || now.meta[M_TICK] >= saved.tick)) w = now
  else if (saved) {
    w = load(saved.bytes)
    // the save holds the log as far as it had been handed when the tick hashed the world: the orders for the next
    // tick, logged then or later in that tick, are handed now
    c.next = saved.next
    feed(c, w)
  } else w = begin(c, fresh())
  while (w.meta[M_TICK] < T) step(c, w)
  Object.assign(tl, c)
  return w
}
