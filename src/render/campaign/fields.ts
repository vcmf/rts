// The campaign map's fields (docs/systems/campaign-map.md, decision 0094): what the page needs of the far level besides
// its tiles, baked offline with them (src/render/campaign/bake.ts) so the page bakes nothing: the lakes' mask and
// their distance to the shore, the lines of the roads and rivers, the contours' heights. One file a build, deflated
// (the caller's, as the tiles'); tools/campaign-tiles.ts writes it, the campaign page reads it.
//
// The file, little-endian (src/render/campaign/rows.ts, the row differences):
//   0  'CMPF'   4  version (1)   5  planes   6  two bytes, 0
//   then each plane: its name (8 bytes, ASCII, padded with 0), its kind (1 bytes, 2 Uint16), its channels, two bytes
//   0, its width and height in texels (u32 each), the scale and offset that read a Uint16 back as a number (f32 each:
//   offset + value × scale; bytes are read as they are), then its values, width × height × channels, the south row
//   first; a Uint16 plane's rows as differences from the value a texel before (modulo 2^16; the row's first as is),
//   as the tiles' shape: smooth fields, small numbers that deflate well.

import { rowDeltas, rowSums } from './rows.ts'

export const FIELDS_MAGIC = 'CMPF'
export const FIELDS_VERSION = 1
const HEADER = 8
const PLANE_HEADER = 28
const NAME = 8

/** One plane of bytes. */
export interface BytePlane {
  name: string
  kind: 'bytes'
  w: number
  h: number
  channels: number
  values: Uint8Array
}

/** One plane of numbers, stored as Uint16 at `scale` above `offset`. */
export interface NumberPlane {
  name: string
  kind: 'uint16'
  w: number
  h: number
  channels: number
  scale: number
  offset: number
  // as stored; numbers() reads them back
  values: Uint16Array
}

export type Plane = BytePlane | NumberPlane

/**
 * Numbers as a plane of Uint16 at `scale` above `offset`, each rounded to the nearest step. Throws on a number that is
 * not finite or falls outside the range the steps reach.
 */
export function quantise(
  name: string,
  w: number,
  h: number,
  values: ArrayLike<number>,
  scale: number,
  offset: number,
): NumberPlane {
  if (!Number.isInteger(values.length / (w * h))) {
    throw new RangeError(`quantise: ${name}: ${values.length} values for ${w} × ${h} texels`)
  }
  const stored = new Uint16Array(values.length)
  for (let k = 0; k < values.length; k++) {
    const steps = Math.round((values[k] - offset) / scale)
    if (!(steps >= 0 && steps <= 0xffff)) {
      throw new RangeError(`quantise: ${name}'s ${values[k]} at ${k}, past ${offset} to ${offset + 0xffff * scale}`)
    }
    stored[k] = steps
  }
  return { name, kind: 'uint16', w, h, channels: values.length / (w * h), scale, offset, values: stored }
}

/** A number plane's values read back as numbers. */
export function numbers(plane: NumberPlane): Float32Array {
  return Float32Array.from(plane.values, v => plane.offset + v * plane.scale)
}

/** The bytes a plane takes in the file, its header included. */
function planeBytes(p: Plane): number {
  return PLANE_HEADER + p.values.length * (p.kind === 'bytes' ? 1 : 2)
}

/** The fields' bytes, before compression. Throws on a name too long, or values of the wrong length. */
export function packFields(planes: Plane[]): Uint8Array {
  if (planes.length > 0xff) throw new RangeError(`packFields: ${planes.length} planes, past 255`)
  const bytes = new Uint8Array(HEADER + planes.reduce((sum, p) => sum + planeBytes(p), 0))
  const view = new DataView(bytes.buffer)
  for (let k = 0; k < 4; k++) bytes[k] = FIELDS_MAGIC.charCodeAt(k)
  bytes[4] = FIELDS_VERSION
  bytes[5] = planes.length
  let at = HEADER
  const names = new Set<string>()
  for (const p of planes) {
    if (!/^[ -~]{1,8}$/.test(p.name)) throw new RangeError(`packFields: a plane named ${JSON.stringify(p.name)}`)
    if (names.has(p.name)) throw new RangeError(`packFields: two planes named ${p.name}`)
    names.add(p.name)
    for (const [field, value, max] of [
      ['width', p.w, 0xffffffff],
      ['height', p.h, 0xffffffff],
      ['channels', p.channels, 0xff],
    ] as const) {
      if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new RangeError(`packFields: ${p.name}: a ${field} of ${value}, past 1 to ${max}`)
      }
    }
    if (p.values.length !== p.w * p.h * p.channels) {
      throw new RangeError(`packFields: ${p.name}: ${p.values.length} values for ${p.w} × ${p.h} × ${p.channels}`)
    }
    for (let k = 0; k < p.name.length; k++) bytes[at + k] = p.name.charCodeAt(k)
    bytes[at + NAME] = p.kind === 'bytes' ? 1 : 2
    bytes[at + NAME + 1] = p.channels
    view.setUint32(at + 12, p.w, true)
    view.setUint32(at + 16, p.h, true)
    view.setFloat32(at + 20, p.kind === 'uint16' ? p.scale : 1, true)
    view.setFloat32(at + 24, p.kind === 'uint16' ? p.offset : 0, true)
    at += PLANE_HEADER
    if (p.kind === 'bytes') bytes.set(p.values, at)
    else {
      const deltas = rowDeltas(p.values, p.w * p.channels, p.channels)
      for (let k = 0; k < deltas.length; k++) view.setUint16(at + k * 2, deltas[k], true)
    }
    at += planeBytes(p) - PLANE_HEADER
  }
  return bytes
}

/** The planes from the fields' bytes (inflated), by name. Throws on another format or version, or a cut file. */
export function unpackFields(bytes: Uint8Array): Map<string, Plane> {
  if (bytes.length < HEADER) throw new RangeError(`unpackFields: ${bytes.length} bytes, shorter than the header`)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== FIELDS_MAGIC) throw new Error(`unpackFields: not the campaign map's fields (${JSON.stringify(magic)})`)
  if (bytes[4] !== FIELDS_VERSION) throw new Error(`unpackFields: version ${bytes[4]}, this reads ${FIELDS_VERSION}`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const planes = new Map<string, Plane>()
  let at = HEADER
  for (let n = 0; n < bytes[5]; n++) {
    if (at + PLANE_HEADER > bytes.length) throw new RangeError(`unpackFields: cut in plane ${n}'s header`)
    const name = String.fromCharCode(...bytes.subarray(at, at + NAME)).replace(/\0+$/, '')
    const kind = bytes[at + NAME]
    const channels = bytes[at + NAME + 1]
    const w = view.getUint32(at + 12, true)
    const h = view.getUint32(at + 16, true)
    const scale = view.getFloat32(at + 20, true)
    const offset = view.getFloat32(at + 24, true)
    const count = w * h * channels
    at += PLANE_HEADER
    const size = count * (kind === 2 ? 2 : 1)
    if (kind !== 1 && kind !== 2) throw new Error(`unpackFields: ${name}: a plane of kind ${kind}`)
    if (planes.has(name)) throw new Error(`unpackFields: two planes named ${name}`)
    if (at + size > bytes.length) throw new RangeError(`unpackFields: ${name}: cut, ${bytes.length - at} of ${size}`)
    if (kind === 1) {
      planes.set(name, { name, kind: 'bytes', w, h, channels, values: bytes.slice(at, at + size) })
    } else {
      const deltas = new Uint16Array(count)
      for (let k = 0; k < count; k++) deltas[k] = view.getUint16(at + k * 2, true)
      const values = rowSums(deltas, w * channels, channels)
      planes.set(name, { name, kind: 'uint16', w, h, channels, scale, offset, values })
    }
    at += size
  }
  if (at !== bytes.length) throw new RangeError(`unpackFields: ${bytes.length - at} bytes past the last plane`)
  return planes
}
