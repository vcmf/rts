// The look data file (data/painted-world.lookdata), written by tools/build-look-data.ts and read by the look page:
// the heightfield (tile plus margin), the far ring's heights and the river's per-sample arrays.
// Layout, little-endian: "LOOK", u32 version, u32 meta length, the meta as UTF-8 JSON padded to 4 bytes, then the
// float32 arrays in the order the meta lists them.
import type { Heightfield } from '../heightfield.ts'
import { SAMPLE_KEYS, type RiverParams, type RiverSamples } from '../river.ts'

export const LOOK_VERSION = 1

export interface FarHeights { n: number; cell: number; x0: number; h: Float32Array }   // the far grid, same layout as Heightfield
export interface LookData { hf: Heightfield; far: FarHeights; river: RiverSamples }

interface Meta {
  hf: { n: number; cell: number; x0: number; z0: number; min: number; max: number }
  far: { n: number; cell: number; x0: number }
  river: { P: RiverParams; n: number }
  arrays: [string, number][]
}

export function encodeLook(d: LookData): Uint8Array {
  const arrays: [string, Float32Array][] = [['hf', d.hf.h], ['far', d.far.h], ...SAMPLE_KEYS.map(k => [k, d.river[k]] as [string, Float32Array])]
  const meta: Meta = {
    hf: { n: d.hf.n, cell: d.hf.cell, x0: d.hf.x0, z0: d.hf.z0, min: d.hf.min, max: d.hf.max },
    far: { n: d.far.n, cell: d.far.cell, x0: d.far.x0 },
    river: { P: d.river.P, n: d.river.n },
    arrays: arrays.map(([k, a]) => [k, a.length]),
  }
  const json = new TextEncoder().encode(JSON.stringify(meta)), pad = (4 - json.length % 4) % 4
  const head = 12 + json.length + pad, size = head + arrays.reduce((s, [, a]) => s + a.length * 4, 0)
  const out = new Uint8Array(size), dv = new DataView(out.buffer)
  out.set(new TextEncoder().encode('LOOK'), 0); dv.setUint32(4, LOOK_VERSION, true); dv.setUint32(8, json.length + pad, true)
  out.set(json, 12); out.fill(32, 12 + json.length, head)   // padded with spaces, still valid JSON
  let o = head
  for (const [, a] of arrays) for (let i = 0; i < a.length; i++, o += 4) dv.setFloat32(o, a[i], true)
  return out
}

export function decodeLook(buf: ArrayBuffer): LookData {
  const dv = new DataView(buf), bytes = new Uint8Array(buf)
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'LOOK') throw new Error('look data: bad magic')
  const ver = dv.getUint32(4, true); if (ver !== LOOK_VERSION) throw new Error(`look data: version ${ver}, this build reads ${LOOK_VERSION}: run node tools/build-look-data.ts`)
  const len = dv.getUint32(8, true), meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len))) as Meta
  const arr: Record<string, Float32Array> = {}
  let o = 12 + len
  for (const [k, n] of meta.arrays) { const a = new Float32Array(n); for (let i = 0; i < n; i++, o += 4) a[i] = dv.getFloat32(o, true); arr[k] = a }
  if (o !== buf.byteLength) throw new Error(`look data: ${buf.byteLength - o} bytes left over`)
  const river = { P: meta.river.P, n: meta.river.n } as RiverSamples
  for (const k of SAMPLE_KEYS) { if (!arr[k] || arr[k].length !== meta.river.n) throw new Error(`look data: river array ${k} missing or short`); river[k] = arr[k] }
  return { hf: { ...meta.hf, h: arr.hf }, far: { ...meta.far, h: arr.far }, river }
}
