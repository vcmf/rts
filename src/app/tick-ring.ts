// The ticks from the sim worker to the men worker (docs/plans/active/battle-threads.md, PR 5): after every tick the
// sim worker writes the world's columns and the formations that left the field into one of RING slots of shared
// memory, stamped with the tick, and the game clock into a shared header. The men worker takes the ticks in order,
// each copied into its own world for the soldier layer's sync; fallen more than the ring behind, it jumps to the
// newest. Neither waits: the writer skips the slot the reader holds, and the reader checks the stamp around its hold.
import { MAX_FORMATIONS, M_TICK, type World } from '../sim/index.ts'
import { layoutFor, type Layout } from './battle-frame.ts'

export const RING = 8
// the stamp of a slot being written, and of one never written
const WRITING = -2
const EMPTY = -1
// the control words: the slot the reader holds (−1: none), then a stamp per slot
const HELD = 0
const STAMP = 1
// the clock: the sim's leftover game time (s), its speed, when it was taken (ms since the time origin the threads
// share), and the sim's tick time (ms, smoothed)
export const C_ACC = 0
export const C_SPEED = 1
export const C_TIME = 2
export const C_TICK_MS = 3

/** The shared memory of a ring, made by the page and sent to both workers. */
export interface RingBuffers {
  ctl: SharedArrayBuffer
  clock: SharedArrayBuffer
  slots: SharedArrayBuffer[]
}

/** Where a slot's world columns and departures sit (the frame's layout with no men, then the departures). */
interface RingLayout {
  world: Layout
  departed: number
  bytes: number
}

const ringLayout = (w: World): RingLayout => {
  const world = layoutFor(w, 0)
  // the departures: their count, then (handle, men) pairs
  return { world, departed: world.bytes, bytes: world.bytes + (1 + 2 * MAX_FORMATIONS) * 4 }
}

/** A ring's shared memory for worlds of `w`'s ruleset; every slot empty, none held. */
export function makeRing(w: World): RingBuffers {
  const L = ringLayout(w)
  const ctl = new SharedArrayBuffer((1 + RING) * 4)
  const c = new Int32Array(ctl)
  c[HELD] = -1
  c.fill(EMPTY, STAMP)
  return {
    ctl,
    clock: new SharedArrayBuffer(4 * 8),
    slots: Array.from({ length: RING }, () => new SharedArrayBuffer(L.bytes)),
  }
}

/** The sim worker's end: writes each tick. */
export class RingWriter {
  readonly clock: Float64Array
  private readonly ctl: Int32Array
  private readonly L: RingLayout
  private readonly slots: SharedArrayBuffer[]
  constructor(w: World, b: RingBuffers) {
    this.ctl = new Int32Array(b.ctl)
    this.clock = new Float64Array(b.clock)
    this.L = ringLayout(w)
    this.slots = b.slots
  }

  /** Writes the world as it stands after its tick, and the formations that left the field in that tick, into the
   * slot holding the oldest tick that the reader does not hold. */
  write(w: World, departed: readonly { id: number; men: number }[]): void {
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
      const buf = this.slots[s]
      const u8 = new Uint8Array(buf)
      for (const col of this.L.world.cols) {
        const a = col.table(w)[col.key]
        u8.set(new Uint8Array(a.buffer, a.byteOffset, col.bytes), col.off)
      }
      const d = new Int32Array(buf, this.L.departed, 1 + 2 * MAX_FORMATIONS)
      d[0] = departed.length
      departed.forEach((x, k) => {
        d[1 + 2 * k] = x.id
        d[2 + 2 * k] = x.men
      })
      Atomics.store(c, STAMP + s, w.meta[M_TICK])
      return
    }
  }

  /** The game clock, for the men's alpha and their steps: the leftover game time, the speed, the tick's cost. */
  setClock(acc: number, speed: number, tickMs: number): void {
    const k = this.clock
    k[C_ACC] = acc
    k[C_SPEED] = speed
    k[C_TIME] = performance.timeOrigin + performance.now()
    k[C_TICK_MS] = tickMs
  }
}

/** A tick taken from the ring: its number, and the formations that left the field in it. */
export interface Taken {
  tick: number
  departed: { id: number; men: number }[]
  // ticks passed over to reach it (the reader fell more than the ring behind)
  skipped: number
}

/** The men worker's end: takes the ticks in order into its own world. */
export class RingReader {
  readonly clock: Float64Array
  private readonly ctl: Int32Array
  private readonly L: RingLayout
  private readonly slots: SharedArrayBuffer[]
  constructor(w: World, b: RingBuffers) {
    this.ctl = new Int32Array(b.ctl)
    this.clock = new Float64Array(b.clock)
    this.L = ringLayout(w)
    this.slots = b.slots
  }

  /**
   * Copies into `w` the tick after `last` (`w`'s tick), or the newest if that one is gone from the ring; null when
   * there is none newer. `between` (tests) runs between finding the slot and holding it.
   */
  take(w: World, last: number, between?: () => void): Taken | null {
    const c = this.ctl
    for (;;) {
      let s = -1
      let newest = -1
      let next = -1
      for (let k = 0; k < RING; k++) {
        const t = Atomics.load(c, STAMP + k)
        if (t === last + 1) next = k
        if (t > newest) {
          newest = t
          s = k
        }
      }
      if (newest <= last) return null
      if (next >= 0) s = next
      const tick = next >= 0 ? last + 1 : newest
      between?.()
      Atomics.store(c, HELD, s)
      if (Atomics.load(c, STAMP + s) !== tick) {
        // rewritten (or being) since it was found: look again
        Atomics.store(c, HELD, -1)
        continue
      }
      const buf = this.slots[s]
      for (const col of this.L.world.cols) {
        col.table(w)[col.key].set(new col.ctor(buf, col.off, col.bytes / bytesOf(col)))
      }
      const d = new Int32Array(buf, this.L.departed, 1 + 2 * MAX_FORMATIONS)
      const departed = Array.from({ length: d[0] }, (_, k) => ({ id: d[1 + 2 * k], men: d[2 + 2 * k] }))
      Atomics.store(c, HELD, -1)
      return { tick, departed, skipped: tick - last - 1 }
    }
  }
}

const bytesOf = (col: Layout['cols'][number]): number =>
  (col.ctor as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT
