// One serializer for saves, hashes and debug dumps (docs/proposals/sim-design.md §15): the world as
// named sections of little-endian bytes, in a fixed order. The state hash is FNV-1a over all of them,
// so it covers exactly what a save covers: tables, pools with their free lists, the RNG and the commands
// stamped for the next tick. Per-section hashes name the first table that differs.
import { type World, makeWorld, MAX_FORMATIONS } from './world.ts'
import { type Stamped, type Command } from './commands.ts'
import { DataVersionMismatch, type SimData, hex } from './data.ts'
import { fnv1a } from './hash.ts'

const SAVE_MAGIC = 0x57535452   // 'RTSW'
const SAVE_FORMAT = 1

class Writer {
  buf = new Uint8Array(1024); view = new DataView(this.buf.buffer); o = 0
  private room(n: number) {
    if (this.o + n <= this.buf.length) return
    let size = this.buf.length * 2; while (size < this.o + n) size *= 2
    const b = new Uint8Array(size); b.set(this.buf); this.buf = b; this.view = new DataView(b.buffer)
  }
  u8(v: number) { this.room(1); this.view.setUint8(this.o, v); this.o += 1 }
  i32(v: number) { this.room(4); this.view.setInt32(this.o, v, true); this.o += 4 }
  u32(v: number) { this.room(4); this.view.setUint32(this.o, v, true); this.o += 4 }
  f64(v: number) { this.room(8); this.view.setFloat64(this.o, v, true); this.o += 8 }
  bytes(): Uint8Array { return this.buf.slice(0, this.o) }
}
class Reader {
  view: DataView; o = 0; b: Uint8Array
  constructor(b: Uint8Array) { this.b = b; this.view = new DataView(b.buffer, b.byteOffset, b.byteLength) }
  u8() { const v = this.view.getUint8(this.o); this.o += 1; return v }
  i32() { const v = this.view.getInt32(this.o, true); this.o += 4; return v }
  u32() { const v = this.view.getUint32(this.o, true); this.o += 4; return v }
  f64() { const v = this.view.getFloat64(this.o, true); this.o += 8; return v }
}

type Arr = Uint8Array | Int32Array | Uint32Array | Float64Array
const writeArr = (w: Writer, a: Arr) => {
  w.u32(a.length)
  if (a instanceof Float64Array) for (let i = 0; i < a.length; i++) w.f64(a[i])
  else if (a instanceof Uint8Array) for (let i = 0; i < a.length; i++) w.u8(a[i])
  else if (a instanceof Uint32Array) for (let i = 0; i < a.length; i++) w.u32(a[i])
  else for (let i = 0; i < a.length; i++) w.i32(a[i])
}
const readArr = (r: Reader, a: Arr) => {
  if (r.u32() !== a.length) throw new Error('save does not match this sim version (array length)')
  if (a instanceof Float64Array) for (let i = 0; i < a.length; i++) a[i] = r.f64()
  else if (a instanceof Uint8Array) for (let i = 0; i < a.length; i++) a[i] = r.u8()
  else if (a instanceof Uint32Array) for (let i = 0; i < a.length; i++) a[i] = r.u32()
  else for (let i = 0; i < a.length; i++) a[i] = r.i32()
}

const CMD = { move: 1, halt: 2, 'debug-spawn': 3, 'debug-kill': 4 } as const
function writeCommand(w: Writer, s: Stamped) {
  w.i32(s.tick); w.i32(s.seq); const c = s.cmd; w.u8(CMD[c.type])
  switch (c.type) {
    case 'move': w.i32(c.id); w.u8(c.append ? 1 : 0); w.u32(c.points.length); for (const [x, z] of c.points) { w.f64(x); w.f64(z) } break
    case 'halt': w.i32(c.id); break
    case 'debug-spawn': w.u8(c.side); w.i32(c.men); w.f64(c.x); w.f64(c.z); w.f64(c.facing); break
    case 'debug-kill': w.i32(c.id); w.i32(c.men); break
  }
}
function readCommand(r: Reader): Stamped {
  const tick = r.i32(), seq = r.i32(), t = r.u8()
  let cmd: Command
  if (t === 1) { const id = r.i32(), append = r.u8() === 1, n = r.u32(), points: [number, number][] = []; for (let k = 0; k < n; k++) points.push([r.f64(), r.f64()]); cmd = { type: 'move', id, points, append } }
  else if (t === 2) cmd = { type: 'halt', id: r.i32() }
  else if (t === 3) cmd = { type: 'debug-spawn', side: r.u8(), men: r.i32(), x: r.f64(), z: r.f64(), facing: r.f64() }
  else if (t === 4) cmd = { type: 'debug-kill', id: r.i32(), men: r.i32() }
  else throw new Error(`unknown command type ${t} in save`)
  return { tick, seq, cmd }
}

// the world's sections, in the fixed order; each is self-describing (lengths included)
export function sections(w: World): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = []
  const sec = (name: string, fill: (wr: Writer) => void) => { const wr = new Writer(); fill(wr); out.push([name, wr.bytes()]) }
  sec('meta', wr => writeArr(wr, w.meta))
  sec('rng', wr => writeArr(wr, w.rng))
  const f = w.f
  sec('formations', wr => { for (const a of [f.alive, f.gen, f.side, f.men, f.x, f.z, f.facing, f.speed, f.wpHead, f.wpTail]) writeArr(wr, a) })
  sec('formation free list', wr => writeArr(wr, w.free))
  sec('waypoint pool', wr => { writeArr(wr, w.wp.x); writeArr(wr, w.wp.z); writeArr(wr, w.wp.next); writeArr(wr, w.wp.meta) })
  sec('pending commands', wr => { wr.u32(w.pending.length); for (const s of w.pending) writeCommand(wr, s) })
  return out
}

export function serialize(w: World): Uint8Array {
  const head = new Writer(); head.u32(SAVE_MAGIC); head.u32(SAVE_FORMAT)
  const parts = [head.bytes(), ...sections(w).map(s => s[1])]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export const hashWorld = (w: World): number => fnv1a(serialize(w))
export const sectionHashes = (w: World): [string, number][] => sections(w).map(([n, b]) => [n, fnv1a(b)])

// a world from a save; the data must be the version the save was made with
export function deserialize(bytes: Uint8Array, data: SimData, debug = true): World {
  const r = new Reader(bytes)
  if (r.u32() !== SAVE_MAGIC || r.u32() !== SAVE_FORMAT) throw new Error('not a save of this format')
  const w = makeWorld(data, 0, debug)
  readArr(r, w.meta)
  if ((w.meta[2] >>> 0) !== (data.version >>> 0)) throw new DataVersionMismatch(`save made with data ${hex(w.meta[2])}, loaded with ${hex(data.version)}`)
  readArr(r, w.rng)
  const f = w.f
  for (const a of [f.alive, f.gen, f.side, f.men, f.x, f.z, f.facing, f.speed, f.wpHead, f.wpTail]) readArr(r, a)
  readArr(r, w.free)
  readArr(r, w.wp.x); readArr(r, w.wp.z); readArr(r, w.wp.next); readArr(r, w.wp.meta)
  const n = r.u32(); for (let k = 0; k < n; k++) w.pending.push(readCommand(r))
  if (r.o !== bytes.length) throw new Error('save has trailing bytes')
  if (f.alive.length !== MAX_FORMATIONS) throw new Error('save does not match this sim version')
  return w
}
