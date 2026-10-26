// The ticks from the sim worker to the men worker (docs/plans/active/battle-threads.md, PR 5): after every tick the
// sim worker writes the world's columns into one of RING slots of shared memory, stamped with the tick; the
// formations that left the field into a log of departures, which a reader that falls behind still reads whole; and
// the game clock, stamped with its tick, into a header. The men worker takes the ticks in order, each copied into its
// own world for the soldier layer's sync; fallen behind the ring, it takes the oldest it has not seen. Neither waits:
// the writer skips the slot the reader holds, and the reader checks the stamp around its hold.
import { M_TICK, DT, type World } from '../sim/index.ts'
import { layoutFor, copyColumns, readColumns, Slots, type Layout } from './battle-frame.ts'

export const RING = 8
// departures kept for a reader behind: far more than the formations there can be
const LOG = 1024
// the stamp of a slot being written, and of one never written
const WRITING = -2
const EMPTY = -1
// the control words: the slot the reader holds (−1: none), then a stamp per slot
const HELD = 0
const STAMP = 1
// the clock, in three slots of these five (the frames' protocol, `Slots`: the reader holds a whole one, the writer
// fills another; a sequence count around plain Float64 writes would not keep a reader on another core from mixing
// two): the tick it was taken at, the sim's leftover game time then (s), its speed, when (ms since the time origin
// the threads share), and the sim's tick time (ms, smoothed, the ring's copy left out)
const C_TICK = 0
const C_ACC = 1
const C_SPEED = 2
const C_TIME = 3
const C_TICK_MS = 4
const C_LEN = 5

/** The shared memory of a ring, made by the page and sent to both workers. */
export interface RingBuffers {
  ctl: SharedArrayBuffer
  clock: SharedArrayBuffer
  clockCtl: SharedArrayBuffer
  // the departures: how many were ever written, then (tick, handle, men) for the last LOG of them
  log: SharedArrayBuffer
  slots: SharedArrayBuffer[]
}

/** A ring's shared memory for worlds of `w`'s ruleset; every slot empty, none held. */
export function makeRing(w: World): RingBuffers {
  const ctl = new SharedArrayBuffer((STAMP + RING) * 4)
  const c = new Int32Array(ctl)
  c[HELD] = -1
  c.fill(EMPTY, STAMP)
  return {
    ctl,
    clock: new SharedArrayBuffer(3 * C_LEN * 8),
    clockCtl: Slots.make(true).ctl.buffer as SharedArrayBuffer,
    log: new SharedArrayBuffer((1 + 3 * LOG) * 4),
    slots: Array.from({ length: RING }, () => new SharedArrayBuffer(layoutFor(w, 0).bytes)),
  }
}

/** Both ends' views of a ring. */
class RingEnd {
  protected readonly ctl: Int32Array
  protected readonly clock: Float64Array
  protected readonly clockSlots: Slots
  protected readonly log: Int32Array
  protected readonly L: Layout
  protected readonly slots: SharedArrayBuffer[]
  constructor(w: World, b: RingBuffers) {
    this.ctl = new Int32Array(b.ctl)
    this.clock = new Float64Array(b.clock)
    this.clockSlots = new Slots(new Int32Array(b.clockCtl))
    this.log = new Int32Array(b.log)
    this.L = layoutFor(w, 0)
    this.slots = b.slots
  }
}

/** The sim worker's end: writes each tick, its departures and the clock. */
export class RingWriter extends RingEnd {
  /** Writes the world as it stands after its tick into the slot holding the oldest tick the reader does not hold,
   * and the formations that left the field in that tick into the log. */
  write(w: World, departed: readonly { id: number; men: number }[]): void {
    const tick = w.meta[M_TICK]
    const g = this.log
    let n = g[0]
    for (const d of departed) {
      const k = 1 + 3 * (n % LOG)
      g[k] = tick
      g[k + 1] = d.id
      g[k + 2] = d.men
      n++
    }
    // the entries, then the count that shows them
    Atomics.store(g, 0, n)
    const c = this.ctl
    for (;;) {
      let s = -1
      let oldest = Infinity
      const held = Atomics.load(c, HELD)
      for (let k = 0; k < RING; k++) {
        const t = Atomics.load(c, STAMP + k)
        if (k !== held && t < oldest) {
          oldest = t
          s = k
        }
      }
      // claim it, then make sure the reader did not take hold of it meanwhile: it holds a slot only while its stamp
      // reads the same after the hold, which this store now prevents
      Atomics.store(c, STAMP + s, WRITING)
      if (Atomics.load(c, HELD) === s) {
        Atomics.store(c, STAMP + s, oldest)
        continue
      }
      copyColumns(w, this.slots[s], this.L)
      Atomics.store(c, STAMP + s, tick)
      return
    }
  }

  /** The game clock now, at tick `tick`: the leftover game time, the speed, the tick's cost. */
  setClock(tick: number, acc: number, speed: number, tickMs: number): void {
    const s = this.clockSlots.free()
    const k = this.clock
    const o = s * C_LEN
    k[o + C_TICK] = tick
    k[o + C_ACC] = acc
    k[o + C_SPEED] = speed
    k[o + C_TIME] = performance.timeOrigin + performance.now()
    k[o + C_TICK_MS] = tickMs
    this.clockSlots.publish(s)
  }
}

/** A tick taken from the ring: its number, the formations that left the field since the last taken, and the ticks
 * passed over to reach it (gone from the ring). */
export interface Taken {
  tick: number
  departed: { id: number; men: number }[]
  skipped: number
}

/** The game clock as the sim last set it. */
export interface Clock {
  tick: number
  acc: number
  speed: number
  time: number
  tickMs: number
}

/** The men worker's end: takes the ticks in order into its own world, and reads the clock. */
export class RingReader extends RingEnd {
  // the departures read so far
  private read = 0
  private readonly now: Clock = { tick: 0, acc: 0, speed: 0, time: 0, tickMs: 0 }

  /**
   * Copies into `w` the tick after `last` (−1: none taken yet), or the oldest after it the ring still holds; null
   * when there is none. With it, the departures of every tick up to it since `last`. `between` (tests) runs between
   * finding the slot and holding it.
   */
  take(w: World, last: number, between?: () => void): Taken | null {
    const c = this.ctl
    for (;;) {
      let s = -1
      let tick = Infinity
      for (let k = 0; k < RING; k++) {
        const t = Atomics.load(c, STAMP + k)
        if (t > last && t < tick) {
          tick = t
          s = k
        }
      }
      if (s < 0) return null
      between?.()
      Atomics.store(c, HELD, s)
      if (Atomics.load(c, STAMP + s) !== tick) {
        // rewritten (or being) since it was found: look again
        Atomics.store(c, HELD, -1)
        continue
      }
      readColumns(w, this.slots[s], this.L)
      Atomics.store(c, HELD, -1)
      return { tick, departed: this.departures(tick), skipped: tick - last - 1 }
    }
  }

  /** The departures logged in ticks up to `tick` not read yet (in tick order, as they were written). */
  private departures(tick: number): { id: number; men: number }[] {
    const g = this.log
    const n = Atomics.load(g, 0)
    const out: { id: number; men: number }[] = []
    // more than the log behind (est. never: at most 128 formations): the oldest are lost
    if (n - this.read > LOG) this.read = n - LOG
    while (this.read < n) {
      const k = 1 + 3 * (this.read % LOG)
      if (g[k] > tick) break
      out.push({ id: g[k + 1], men: g[k + 2] })
      this.read++
    }
    return out
  }

  /** The clock as last set (all zero before), read whole: one snapshot for a turn's every use. */
  clockNow(): Clock {
    const s = this.clockSlots.hold()
    const o = this.now
    if (s < 0) return o
    const k = this.clock
    const at = s * C_LEN
    o.tick = k[at + C_TICK]
    o.acc = k[at + C_ACC]
    o.speed = k[at + C_SPEED]
    o.time = k[at + C_TIME]
    o.tickMs = k[at + C_TICK_MS]
    return o
  }
}

/** The game time since tick `tick` (the men's world's) at `now` (ms since the shared time origin) by clock `k`, at
 * most a tick: the sim's leftover game time at its own tick, the ticks between, and the time since at its speed. */
export function accSince(k: Clock, tick: number, now: number): number {
  const acc = (k.tick - tick) * DT + k.acc + (Math.max(0, now - k.time) / 1000) * k.speed
  return Math.min(DT, Math.max(0, acc))
}
