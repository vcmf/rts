// One serializer for saves, hashes and debug dumps (docs/proposals/sim-design.md §15): the world as
// named sections of little-endian bytes, in a fixed order. The state hash is FNV-1a over all of them,
// so it covers exactly what a save covers: tables, pools with their free lists, the RNG and the commands
// stamped for the next tick. Per-section hashes name the first table that differs.
import { type World, makeWorld, MAX_FORMATIONS, M_DATA, M_RULES } from './world.ts'
import type { Compiled } from './ruleset.ts'
import { columnsOf, type Column } from './columns.ts'
import type { Stamped, Command } from './commands.ts'
import { DataVersionMismatch, type SimData, hex } from './data.ts'
import { fnv1a } from './hash.ts'

const SAVE_MAGIC = 0x57535452   // 'RTSW'
const SAVE_FORMAT = 8   // 3: the formations' faces column (S1b); 4: fire, morale, sides, the seed (S1c); 5: pressed (S1c-3); 6: the rest of the morale machine (S1c-2); 7: unit types (S1d-1); 8: charges, melee and the square (S1d-2)

class Writer {
  buf = new Uint8Array(1024); view = new DataView(this.buf.buffer); o = 0
  private room(n: number) {
    if (this.o + n <= this.buf.length) return
    let size = this.buf.length * 2; while (size < this.o + n) size *= 2
    const b = new Uint8Array(size); b.set(this.buf); this.buf = b; this.view = new DataView(b.buffer)
  }
  u8(v: number) { this.room(1); this.view.setUint8(this.o, v); this.o += 1 }
  i8(v: number) { this.room(1); this.view.setInt8(this.o, v); this.o += 1 }
  u16(v: number) { this.room(2); this.view.setUint16(this.o, v, true); this.o += 2 }
  str(s: string) { const b = new TextEncoder().encode(s); this.u32(b.length); for (const x of b) this.u8(x) }
  i32(v: number) { this.room(4); this.view.setInt32(this.o, v, true); this.o += 4 }
  u32(v: number) { this.room(4); this.view.setUint32(this.o, v, true); this.o += 4 }
  f64(v: number) { this.room(8); this.view.setFloat64(this.o, v, true); this.o += 8 }
  raw(b: Uint8Array) { this.room(b.length); this.buf.set(b, this.o); this.o += b.length }
  bytes(): Uint8Array { return this.buf.slice(0, this.o) }
}
class Reader {
  view: DataView; o = 0; b: Uint8Array
  constructor(b: Uint8Array) { this.b = b; this.view = new DataView(b.buffer, b.byteOffset, b.byteLength) }
  u8() { const v = this.view.getUint8(this.o); this.o += 1; return v }
  i8() { const v = this.view.getInt8(this.o); this.o += 1; return v }
  u16() { const v = this.view.getUint16(this.o, true); this.o += 2; return v }
  str() { const n = this.u32(), b = new Uint8Array(n); for (let k = 0; k < n; k++) b[k] = this.u8(); return new TextDecoder().decode(b) }
  i32() { const v = this.view.getInt32(this.o, true); this.o += 4; return v }
  u32() { const v = this.view.getUint32(this.o, true); this.o += 4; return v }
  f64() { const v = this.view.getFloat64(this.o, true); this.o += 8; return v }
  raw(out: Uint8Array) { if (this.o + out.length > this.b.length) throw new RangeError('save is truncated'); out.set(this.b.subarray(this.o, this.o + out.length)); this.o += out.length }
}

type Arr = Column
// a typed array's own bytes are its little-endian encoding on a little-endian machine (every browser and Node
// target): copied whole, the same bytes as number by number, far faster (S1c-5). A big-endian machine
// writes number by number.
const LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
const bytesOf = (a: Arr): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
const writeArr = (w: Writer, a: Arr) => {
  w.u32(a.length)
  if (LITTLE) w.raw(bytesOf(a))
  else if (a instanceof Float64Array) for (let i = 0; i < a.length; i++) w.f64(a[i])
  else if (a instanceof Uint8Array) for (let i = 0; i < a.length; i++) w.u8(a[i])
  else if (a instanceof Int8Array) for (let i = 0; i < a.length; i++) w.i8(a[i])
  else if (a instanceof Uint16Array) for (let i = 0; i < a.length; i++) w.u16(a[i])
  else if (a instanceof Uint32Array) for (let i = 0; i < a.length; i++) w.u32(a[i])
  else for (let i = 0; i < a.length; i++) w.i32(a[i])
}
const readArr = (r: Reader, a: Arr) => {
  if (r.u32() !== a.length) throw new Error('save does not match this sim version (array length)')
  if (LITTLE) r.raw(bytesOf(a))
  else if (a instanceof Float64Array) for (let i = 0; i < a.length; i++) a[i] = r.f64()
  else if (a instanceof Uint8Array) for (let i = 0; i < a.length; i++) a[i] = r.u8()
  else if (a instanceof Int8Array) for (let i = 0; i < a.length; i++) a[i] = r.i8()
  else if (a instanceof Uint16Array) for (let i = 0; i < a.length; i++) a[i] = r.u16()
  else if (a instanceof Uint32Array) for (let i = 0; i < a.length; i++) a[i] = r.u32()
  else for (let i = 0; i < a.length; i++) a[i] = r.i32()
}

// commands are written field by field, in a fixed order per type: numbers as float64, handles and
// counts as int32, strings with their length, points with their count
const FIELDS: Record<string, string[]> = {
  move: ['id:i', 'append:b', 'points:p'], form: ['id:i', 'shape:s'], wheel: ['id:i', 'angle:f'], face: ['id:i'], retire: ['id:i', 'metres:f'],
  halt: ['id:i'], style: ['id:i', 'preset:s'], 'debug-spawn': ['side:i', 'x:f', 'z:f', 'heading:f', 'shape:s', 'men:i', 'quality:f', 'fire:s', 'unit:s'], 'debug-kill': ['id:i', 'men:i'], 'debug-morale': ['id:i', 'quality:f'],
  fire: ['id:i', 'mode:s', 'target:i'], side: ['side:i', 'x:f', 'z:f'], charge: ['id:i', 'target:i'],
}
function writeCommand(w: Writer, s: Stamped) {
  w.i32(s.tick); w.i32(s.seq); const c = s.cmd as unknown as Record<string, unknown>
  w.str(String(c.type))
  for (const spec of FIELDS[String(c.type)] ?? []) {
    const [k, t] = spec.split(':'), v = c[k]
    if (t === 'i') w.i32(Number(v)); else if (t === 'f') w.f64(Number(v)); else if (t === 'b') w.u8(v ? 1 : 0); else if (t === 's') w.str(String(v))
    else { const pts = v as [number, number][]; w.u32(pts.length); for (const [x, z] of pts) { w.f64(x); w.f64(z) } }
  }
}
function readCommand(r: Reader): Stamped {
  const tick = r.i32(), seq = r.i32(), type = r.str(), c: Record<string, unknown> = { type }
  const fields = FIELDS[type]; if (!fields) throw new Error(`unknown command type ${type} in save`)
  for (const spec of fields) {
    const [k, t] = spec.split(':')
    if (t === 'i') c[k] = r.i32(); else if (t === 'f') c[k] = r.f64(); else if (t === 'b') c[k] = r.u8() === 1; else if (t === 's') c[k] = r.str()
    else { const n = r.u32(), pts: [number, number][] = []; for (let q = 0; q < n; q++) pts.push([r.f64(), r.f64()]); c[k] = pts }
  }
  return { tick, seq, cmd: c as unknown as Command }
}

export const columns = columnsOf

// the world's sections, in the fixed order; each is self-describing (lengths included)
export function sections(w: World): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = []
  const sec = (name: string, fill: (wr: Writer) => void) => { const wr = new Writer(); fill(wr); out.push([name, wr.bytes()]) }
  sec('meta', wr => writeArr(wr, w.meta))
  sec('rng', wr => writeArr(wr, w.rng))
  const f = w.f
  sec('formations', wr => { for (const a of columns(f)) writeArr(wr, a) })
  sec('sides', wr => { for (const a of columns(w.sides)) writeArr(wr, a) })
  sec('formation free list', wr => writeArr(wr, w.free))
  sec('order pool', wr => { for (const a of columns(w.ord)) writeArr(wr, a) })
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
export function deserialize(bytes: Uint8Array, data: SimData, cr: Compiled, debug = true, terrain?: World['terrain']): World {
  const r = new Reader(bytes)
  if (r.u32() !== SAVE_MAGIC || r.u32() !== SAVE_FORMAT) throw new Error('not a save of this format')
  const w = makeWorld(data, cr, 0, debug, terrain)
  readArr(r, w.meta)
  if ((w.meta[M_DATA] >>> 0) !== (data.version >>> 0)) throw new DataVersionMismatch(`save made with data ${hex(w.meta[M_DATA])}, loaded with ${hex(data.version)}`)
  if ((w.meta[M_RULES] >>> 0) !== (cr.hash >>> 0)) throw new DataVersionMismatch(`save made with ruleset ${hex(w.meta[M_RULES])}, loaded with ${hex(cr.hash)}`)
  readArr(r, w.rng)
  const f = w.f
  for (const a of columns(f)) readArr(r, a)
  for (const a of columns(w.sides)) readArr(r, a)
  readArr(r, w.free)
  for (const a of columns(w.ord)) readArr(r, a)
  const n = r.u32(); for (let k = 0; k < n; k++) w.pending.push(readCommand(r))
  if (r.o !== bytes.length) throw new Error('save has trailing bytes')
  if (f.alive.length !== MAX_FORMATIONS) throw new Error('save does not match this sim version')
  return w
}
