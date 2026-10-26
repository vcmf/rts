// The battle's published frame (docs/plans/active/battle-threads.md, PR 3): what the battle worker hands the page,
// in three slots of shared memory, and the page's read-only views of a slot. A slot holds the world's columns (every
// typed array of its state: src/sim/columns.ts), the men as the page reads them (src/render/men.ts), the battalions'
// men, and a header (the clock for the anchors' alpha, the worker's costs). The page's `World` and `SoldierLayer` read
// a slot in place: `map.ts`, the HUD, `formationHandle`, picking and box select work on them unchanged.
import { makeWorld, columns, MAX_FORMATIONS, DT, type World, type Compiled, type SimData } from '../sim/index.ts'
import type { Scene } from '../render/scene.ts'
import { SoldierLayer, type Unit } from '../render/soldiers.ts'
import { Men } from '../render/men.ts'
import type { Battle } from './battle.ts'

// the header, Float64: the leftover game time (s), the speed, the publish time (ms since the time origin both
// threads share), the men, the battalions, and the worker's costs (ms, smoothed) and sub-steps late
export const H_ACC = 0
export const H_SPEED = 1
export const H_TIME = 2
export const H_MEN = 3
export const H_UNITS = 4
export const H_TICK_MS = 5
export const H_STEP_MS = 6
export const H_PUB_MS = 7
export const H_SEQ = 8
const H_LEN = 16
// a battalion's row: its formation index, its group, where its men's indices start in `ids`, how many
const U_ROW = 4

type Typed = Uint8Array | Int8Array | Uint16Array | Int32Array | Uint32Array | Float64Array
type TypedCtor = new (buf: ArrayBufferLike, off: number, len: number) => Typed

/** One column of the world: where it lives in a world (its table and key) and in a slot. */
interface ColumnAt {
  table: (w: World) => Record<string, Typed>
  key: string
  off: number
  bytes: number
  ctor: TypedCtor
}

/** Where everything sits in a slot, for a world of this ruleset and `cap` men. */
export interface Layout {
  cap: number
  bytes: number
  cols: ColumnAt[]
  head: number
  units: number
  ids: number
  x: number
  z: number
  vx: number
  vz: number
  s: number
  flags: number
}

// the world's own state columns (meta, rng, the free list) and its tables' columns, in a fixed order
const TABLES: [string, (w: World) => Record<string, Typed>][] = [
  ['', w => w as unknown as Record<string, Typed>],
  ['f', w => w.f as unknown as Record<string, Typed>],
  ['sides', w => w.sides as unknown as Record<string, Typed>],
  ['ord', w => w.ord as unknown as Record<string, Typed>],
]
const OWN = ['free', 'meta', 'rng']

/** The layout of a slot for world `w`'s ruleset, with room for `cap` men. */
export function layoutFor(w: World, cap: number): Layout {
  let o = 0
  const at = (bytes: number): number => {
    const a = o
    o += Math.ceil(bytes / 8) * 8
    return a
  }
  const head = at(H_LEN * 8)
  const cols: ColumnAt[] = []
  for (const [name, table] of TABLES) {
    const t = table(w)
    const keys = name ? Object.keys(t).sort() : OWN
    for (const key of keys) {
      const c = t[key]
      cols.push({ table, key, off: at(c.byteLength), bytes: c.byteLength, ctor: c.constructor as TypedCtor })
    }
  }
  // the columns are every typed array the save covers (src/sim/serialize.ts sections), so none is left behind
  if (cols.length !== OWN.length + columns(w.f).length + columns(w.sides).length + columns(w.ord).length) {
    throw new Error('battle frame: the world has columns the frame does not know')
  }
  const units = at(MAX_FORMATIONS * U_ROW * 4)
  const ids = at(cap * 4)
  const x = at(cap * 8)
  const z = at(cap * 8)
  const vx = at(cap * 8)
  const vz = at(cap * 8)
  const s = at(cap * 4)
  const flags = at(cap)
  return { cap, bytes: o, cols, head, units, ids, x, z, vx, vz, s, flags }
}

/** Copies the battle's state into slot `buf` (laid out by `L`, with room for its men); `stats` fills the header's
 * costs. Returns false, writing nothing, when the men outgrew the slot. */
export function writeFrame(
  b: Battle,
  buf: ArrayBufferLike,
  L: Layout,
  stats: { tickMs: number; stepMs: number; pubMs: number; seq: number },
): boolean {
  const M = b.layer.men
  if (M.n > L.cap) return false
  const u8 = new Uint8Array(buf)
  for (const c of L.cols) {
    const a = c.table(b.w)[c.key]
    u8.set(new Uint8Array(a.buffer, a.byteOffset, c.bytes), c.off)
  }
  new Float64Array(buf, L.x, M.n).set(M.x.subarray(0, M.n))
  new Float64Array(buf, L.z, M.n).set(M.z.subarray(0, M.n))
  new Float64Array(buf, L.vx, M.n).set(M.vx.subarray(0, M.n))
  new Float64Array(buf, L.vz, M.n).set(M.vz.subarray(0, M.n))
  new Int32Array(buf, L.s, M.n).set(M.s.subarray(0, M.n))
  u8.set(M.flags.subarray(0, M.n), L.flags)
  const rows = new Int32Array(buf, L.units, MAX_FORMATIONS * U_ROW)
  const ids = new Int32Array(buf, L.ids, L.cap)
  let nu = 0
  let o = 0
  for (const u of b.layer.units.values()) {
    const r = nu++ * U_ROW
    rows[r] = u.i
    rows[r + 1] = u.group
    rows[r + 2] = o
    rows[r + 3] = u.n
    ids.set(u.ids.subarray(0, u.n), o)
    o += u.n
  }
  const h = new Float64Array(buf, L.head, H_LEN)
  h[H_ACC] = b.acc
  h[H_SPEED] = b.speed
  h[H_TIME] = performance.timeOrigin + performance.now()
  h[H_MEN] = M.n
  h[H_UNITS] = nu
  h[H_TICK_MS] = stats.tickMs
  h[H_STEP_MS] = stats.stepMs
  h[H_PUB_MS] = stats.pubMs
  h[H_SEQ] = stats.seq
  return true
}

/** The men a frame's ids lists can hold for `n` men now: room to grow before new buffers are needed. */
export const capFor = (n: number): number => Math.max(4096, 2 ** Math.ceil(Math.log2(Math.max(1, n) * 1.5)))

/** A slot read in place: a `World` whose columns are views on it, and a `SoldierLayer` on that world, never
 * stepped, whose men and battalions are the slot's. */
export class FrameView {
  readonly w: World
  readonly layer: SoldierLayer
  readonly head: Float64Array
  private readonly rows: Int32Array
  private readonly ids: Int32Array
  // the battalions read before, reused (formation index → unit)
  private readonly cache = new Map<number, Unit & { off: number }>()

  constructor(data: SimData, cr: Compiled, scene: Scene, buf: ArrayBufferLike, L: Layout) {
    const w = makeWorld(data, cr, 0, false)
    for (const c of L.cols) c.table(w)[c.key] = new c.ctor(buf, c.off, c.bytes / bytesPer(c.ctor))
    this.w = w
    this.layer = new SoldierLayer(w, scene)
    this.head = new Float64Array(buf, L.head, H_LEN)
    this.rows = new Int32Array(buf, L.units, MAX_FORMATIONS * U_ROW)
    this.ids = new Int32Array(buf, L.ids, L.cap)
    const M = new Men(0)
    M.x = new Float64Array(buf, L.x, L.cap)
    M.z = new Float64Array(buf, L.z, L.cap)
    M.vx = new Float64Array(buf, L.vx, L.cap)
    M.vz = new Float64Array(buf, L.vz, L.cap)
    M.s = new Int32Array(buf, L.s, L.cap)
    M.flags = new Uint8Array(buf, L.flags, L.cap)
    this.layer.men = M
  }

  /** Takes the slot's men and battalions (call once the slot is held), and the anchors' alpha at `now` (ms since
   * the shared time origin): the game time since the frame was published, at its speed. */
  read(now: number): void {
    const h = this.head
    const layer = this.layer
    layer.men.n = h[H_MEN]
    layer.units.clear()
    const f = this.w.f
    for (let k = 0, n = h[H_UNITS]; k < n; k++) {
      const r = k * U_ROW
      const i = this.rows[r]
      const off = this.rows[r + 2]
      const len = this.rows[r + 3]
      let u = this.cache.get(i)
      if (!u || u.gen !== f.gen[i]) {
        const U = this.layer.w.cr.types[f.type[i]]
        u = {
          i,
          group: 0,
          gen: f.gen[i],
          side: f.side[i],
          type: U.name,
          figure: U.def.figure,
          ids: this.ids.subarray(off, off + len),
          n: len,
          faces: 0,
          sway: 0,
          sig: new Int32Array(0),
          pose: new Float64Array(0),
          off,
        }
        this.cache.set(i, u)
      } else if (u.off !== off || u.n !== len) {
        u.ids = this.ids.subarray(off, off + len)
        u.n = len
        u.off = off
      }
      u.group = this.rows[r + 1]
      layer.units.set(i, u)
    }
    const ahead = ((now - h[H_TIME]) / 1000) * h[H_SPEED]
    layer.alphaNow = Math.min(1, Math.max(0, (h[H_ACC] + Math.max(0, ahead)) / DT))
  }
}

const bytesPer = (c: TypedCtor): number => (c as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT

// the slot protocol's words (docs/proposals/battle-threads.md §5): the newest complete slot (−1: none yet), the slot
// the reader holds (−1: none)
const LATEST = 0
const HELD = 1

/** Three slots and who may touch which: the writer fills the one that is neither the newest nor held, the reader
 * holds the newest. Neither waits. `ctl` is two Int32 words in shared memory. */
export class Slots {
  readonly ctl: Int32Array
  constructor(ctl: Int32Array) {
    this.ctl = ctl
  }
  /** A fresh control block, nothing published, nothing held. */
  static make(shared: boolean): Slots {
    const buf = shared ? new SharedArrayBuffer(8) : new ArrayBuffer(8)
    const ctl = new Int32Array(buf)
    ctl.fill(-1)
    return new Slots(ctl)
  }
  /** The writer: the slot to fill next. */
  free(): number {
    const latest = Atomics.load(this.ctl, LATEST)
    const held = Atomics.load(this.ctl, HELD)
    for (let s = 0; s < 3; s++) if (s !== latest && s !== held) return s
    throw new Error('battle frame: no free slot')
  }
  /** The writer: slot `s` is complete. */
  publish(s: number): void {
    Atomics.store(this.ctl, LATEST, s)
  }
  /** The reader: holds the newest complete slot and returns it (−1: none published yet). The writer may publish
   * between the load and the hold, and then may already be filling that slot: so hold, and check it is still the
   * newest, again until it is. */
  hold(): number {
    for (;;) {
      const s = Atomics.load(this.ctl, LATEST)
      Atomics.store(this.ctl, HELD, s)
      if (Atomics.load(this.ctl, LATEST) === s) return s
    }
  }
}
