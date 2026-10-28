// The ticks from the sim worker to the men worker (docs/plans/active/battle-threads.md, PR 5): after every tick the
// sim worker writes the world's columns into one of RING slots of shared memory, stamped with the tick; the
// formations that left the field into a log of departures, which a reader that falls behind still reads whole; and
// the game clock, stamped with its tick, into a header. The men worker takes the ticks in order, each copied into its
// own world for the soldier layer's sync; fallen behind the ring, it takes the oldest it has not seen. Neither waits:
// the writer skips the slot the reader holds, and the reader checks the stamp around its hold. A world that does not
// follow the last (going to a time: PR 7, decision 0081) is a jump: written with the ring's jump count raised, each
// slot and departure tagged with the count it was written under, so the reader takes it whatever its tick, and
// nothing from before it after it.
import { M_TICK, DT, type World } from '../sim/index.ts'
import { layoutFor, Slots, type Layout } from './battle-frame.ts'

export const RING = 8
// departures kept for a reader behind: far more than the formations there can be; each (jump, tick, handle, men)
const LOG = 1024
const D_LEN = 4
// the stamp of a slot being written, and of one never written
const WRITING = -2
const EMPTY = -1
// the control words: the slot the reader holds (−1: none), the jumps so far, a stamp per slot, then per slot the jump
// count it was written under
const HELD = 0
const JUMPS = 1
const STAMP = 2
const JUMP_OF = STAMP + RING
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
  // the departures: how many were ever written, then (jump, tick, handle, men) for the last LOG of them
  log: SharedArrayBuffer
  slots: SharedArrayBuffer[]
}

/** A ring's shared memory for worlds of `w`'s ruleset; every slot empty, none held. */
export function makeRing(w: World): RingBuffers {
  const ctl = new SharedArrayBuffer((STAMP + 2 * RING) * 4)
  const c = new Int32Array(ctl)
  c[HELD] = -1
  c.fill(EMPTY, STAMP, JUMP_OF)
  return {
    ctl,
    clock: new SharedArrayBuffer(3 * C_LEN * 8),
    clockCtl: Slots.make(true).ctl.buffer as SharedArrayBuffer,
    log: new SharedArrayBuffer((1 + D_LEN * LOG) * 4),
    slots: Array.from({ length: RING }, () => new SharedArrayBuffer(layoutFor(w, 0).bytes)),
  }
}

/** Both ends' views of a ring. */
class RingEnd {
  protected readonly ctl: Int32Array
  protected readonly clock: Float64Array
  protected readonly clockSlots: Slots
  protected readonly log: Int32Array
  // per slot, each column as bytes in the world and in the slot: built once a world (its arrays and the slots stay)
  protected pairs: [Uint8Array, Uint8Array][][] = []
  private readonly slots: SharedArrayBuffer[]
  constructor(w: World, b: RingBuffers) {
    this.ctl = new Int32Array(b.ctl)
    this.clock = new Float64Array(b.clock)
    this.clockSlots = new Slots(new Int32Array(b.clockCtl))
    this.log = new Int32Array(b.log)
    this.slots = b.slots
    this.bind(w)
  }
  /** Copies to and from world `w` from now on (a new world of the same ruleset: going to a time builds one). */
  protected bind(w: World): void {
    const L: Layout = layoutFor(w, 0)
    this.pairs = this.slots.map(buf =>
      L.cols.map(c => {
        const a = c.table(w)[c.key]
        return [new Uint8Array(a.buffer, a.byteOffset, c.bytes), new Uint8Array(buf, c.off, c.bytes)]
      }),
    )
  }
}

/** The sim worker's end: writes each tick, its departures and the clock. */
export class RingWriter extends RingEnd {
  private jumps = 0

  /** The world after going to a time (`w`: the battle's new world, which every later tick is written from): a jump,
   * written whatever its tick, and the reader lays its men out again on it. */
  jump(w: World): void {
    this.bind(w)
    this.jumps++
    Atomics.store(this.ctl, JUMPS, this.jumps)
    this.write(w, [])
  }

  /** Writes the world as it stands after its tick into the slot holding the oldest tick the reader does not hold,
   * and the formations that left the field in that tick into the log; with `world` false the departures only (the
   * checks' advance, whose men are held: only its last world is read). */
  write(w: World, departed: readonly { id: number; men: number }[], world = true): void {
    const tick = w.meta[M_TICK]
    const g = this.log
    let n = g[0]
    for (const d of departed) {
      const k = 1 + D_LEN * (n % LOG)
      g[k] = this.jumps
      g[k + 1] = tick
      g[k + 2] = d.id
      g[k + 3] = d.men
      n++
    }
    // the entries, then the count that shows them
    Atomics.store(g, 0, n)
    if (!world) return
    const c = this.ctl
    for (;;) {
      let s = -1
      let oldest = Infinity
      const held = Atomics.load(c, HELD)
      for (let k = 0; k < RING; k++) {
        // a slot from before the last jump is older than any after it
        const t = Atomics.load(c, JUMP_OF + k) === this.jumps ? Atomics.load(c, STAMP + k) : -Infinity
        if (k !== held && t < oldest) {
          oldest = t
          s = k
        }
      }
      // claim it, then make sure the reader did not take hold of it meanwhile: it holds a slot only while its stamp
      // reads the same after the hold, which this store now prevents
      const stamp = Atomics.load(c, STAMP + s)
      Atomics.store(c, STAMP + s, WRITING)
      if (Atomics.load(c, HELD) === s) {
        Atomics.store(c, STAMP + s, stamp)
        continue
      }
      for (const [own, slot] of this.pairs[s]) slot.set(own)
      Atomics.store(c, JUMP_OF + s, this.jumps)
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

/** A tick taken from the ring: its number, the formations that left the field since the last taken, the ticks
 * passed over to reach it (gone from the ring), and whether it is a jump (its world does not follow the last taken:
 * lay the men out again, its departures none). */
export interface Taken {
  tick: number
  departed: { id: number; men: number }[]
  skipped: number
  jumped: boolean
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
  // the departures read so far; the jump count of the last world taken
  private read = 0
  private jumps = 0
  private readonly now: Clock = { tick: 0, acc: 0, speed: 0, time: 0, tickMs: 0 }

  /**
   * Copies into `w` the tick after `last` (−1: none taken yet), or the oldest after it the ring still holds; after a
   * jump the oldest written since it, whatever its tick; null when there is none. With it, the departures of every
   * tick up to it since `last` (none for a jump). Tests: `between` runs between finding the slot and holding it,
   * `during` while it is held, before the copy.
   */
  take(w: World, last: number, between?: () => void, during?: () => void): Taken | null {
    const c = this.ctl
    for (;;) {
      const jumps = Atomics.load(c, JUMPS)
      const jumped = jumps !== this.jumps
      let s = -1
      let tick = Infinity
      for (let k = 0; k < RING; k++) {
        const t = Atomics.load(c, STAMP + k)
        if (t >= 0 && (jumped || t > last) && t < tick && Atomics.load(c, JUMP_OF + k) === jumps) {
          tick = t
          s = k
        }
      }
      if (s < 0) return null
      between?.()
      Atomics.store(c, HELD, s)
      if (Atomics.load(c, STAMP + s) !== tick || Atomics.load(c, JUMP_OF + s) !== jumps) {
        // rewritten (or being) since it was found: look again
        Atomics.store(c, HELD, -1)
        continue
      }
      during?.()
      for (const [own, slot] of this.pairs[s]) own.set(slot)
      Atomics.store(c, HELD, -1)
      this.jumps = jumps
      const departed = this.departures(tick, jumped)
      return { tick, departed, skipped: jumped ? 0 : tick - last - 1, jumped }
    }
  }

  /** The departures logged in ticks up to `tick` (of the jump last taken) not read yet, in the order they were
   * written; those from before it passed over, and returned none of with `jumped` (its world holds them). */
  private departures(tick: number, jumped: boolean): { id: number; men: number }[] {
    const g = this.log
    const n = Atomics.load(g, 0)
    const out: { id: number; men: number }[] = []
    // more than the log behind (est. never: at most 128 formations): the oldest are lost
    if (n - this.read > LOG) this.read = n - LOG
    while (this.read < n) {
      const k = 1 + D_LEN * (this.read % LOG)
      if (g[k] === this.jumps && g[k + 1] > tick) break
      if (g[k] === this.jumps && !jumped) out.push({ id: g[k + 2], men: g[k + 3] })
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
