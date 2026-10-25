// Real relief (docs/plans/active/m5-relief.md): the `.rdem` heightfield file, its checks against the map's `dem`
// sources, and its heights read between the source's nodes. Exact maths only (decision 0006): + − × / and integer
// bit operations, so a map with real relief gives the same bytes in Node and in the page.
//
// The file, little-endian: a 24-byte header (the magic "RDEM", version u16, 0 u16, nx u32, nz u32, the cell in mm
// u32, the base height in cm i32), then nx × nz heights as u16 cm above the base, the south row first, west to east.
// Its own frame is centred: node (i, j) lies at ((i − (nx − 1)/2)·cell, (j − (nz − 1)/2)·cell), x east, z north.
import type { Feature, MapFile } from './schema.ts'
import type { Issue } from './catalogue.ts'

export const RDEM_MAGIC = 'RDEM'
export const RDEM_VERSION = 1
const HEADER = 24

// the map's files, by the path its sources give
export type MapFiles = Map<string, Uint8Array>

export interface Dem {
  nx: number
  nz: number
  cell: number // m
  base: number // m above sea level
  cm: Uint16Array // heights, cm above the base, nx × nz, the south row first
}

/** Reads an `.rdem` file; throws with what is wrong. */
export function decodeRdem(bytes: Uint8Array): Dem {
  if (bytes.length < HEADER) throw new Error('too short for an .rdem header')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== RDEM_MAGIC) throw new Error('not an .rdem file (no RDEM magic)')
  const version = v.getUint16(4, true)
  if (version !== RDEM_VERSION) throw new Error(`.rdem version ${version}, expected ${RDEM_VERSION}`)
  const nx = v.getUint32(8, true)
  const nz = v.getUint32(12, true)
  const cellMm = v.getUint32(16, true)
  const baseCm = v.getInt32(20, true)
  if (nx < 4 || nz < 4 || cellMm === 0) throw new Error(`.rdem grid ${nx}×${nz} at ${cellMm} mm is too small`)
  if (bytes.length !== HEADER + nx * nz * 2) {
    throw new Error(`.rdem holds ${bytes.length} bytes, its ${nx}×${nz} grid needs ${HEADER + nx * nz * 2}`)
  }
  const cm = new Uint16Array(nx * nz)
  for (let k = 0; k < cm.length; k++) cm[k] = v.getUint16(HEADER + 2 * k, true)
  return { nx, nz, cell: cellMm / 1000, base: baseCm / 100, cm }
}

/** Writes an `.rdem` file (the importer's and the tests'). */
export function encodeRdem(d: { nx: number; nz: number; cellMm: number; baseCm: number; cm: Uint16Array }): Uint8Array {
  const out = new Uint8Array(HEADER + d.nx * d.nz * 2)
  const v = new DataView(out.buffer)
  for (let k = 0; k < 4; k++) out[k] = RDEM_MAGIC.charCodeAt(k)
  v.setUint16(4, RDEM_VERSION, true)
  v.setUint32(8, d.nx, true)
  v.setUint32(12, d.nz, true)
  v.setUint32(16, d.cellMm, true)
  v.setInt32(20, d.baseCm, true)
  for (let k = 0; k < d.cm.length; k++) v.setUint16(HEADER + 2 * k, d.cm[k], true)
  return out
}

/** The file's half-size, m: its nodes span ±(n − 1)·cell / 2 about its centre. */
export const demHalf = (d: Dem): { x: number; z: number } => ({
  x: ((d.nx - 1) * d.cell) / 2,
  z: ((d.nz - 1) * d.cell) / 2,
})

// Catmull-Rom weights for the four nodes around t in [0, 1): a cubic through the nodes, with matching slopes, so a
// 2 m grid read from 5 m nodes shows no lattice (bilinear would leave a crease at every node line)
function cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
}

/**
 * The height (m above sea level) at a point of the file's own frame, by bicubic (Catmull-Rom) interpolation
 * between its nodes; the nodes beyond its edges repeat the edge, so a point on the border reads the border.
 */
export function demHeight(d: Dem, x: number, z: number): number {
  const h = demHalf(d)
  const u = (x + h.x) / d.cell
  const w = (z + h.z) / d.cell
  const i = Math.min(d.nx - 2, Math.max(0, Math.floor(u)))
  const j = Math.min(d.nz - 2, Math.max(0, Math.floor(w)))
  const tu = Math.min(1, Math.max(0, u - i))
  const tw = Math.min(1, Math.max(0, w - j))
  const at = (a: number, b: number) =>
    d.cm[Math.min(d.nz - 1, Math.max(0, b)) * d.nx + Math.min(d.nx - 1, Math.max(0, a))]
  const row = (b: number) => cubic(tu, at(i - 1, b), at(i, b), at(i + 1, b), at(i + 2, b))
  return d.base + cubic(tw, row(j - 1), row(j), row(j + 1), row(j + 2)) / 100
}

/** The lowest and highest node heights (m above sea level) inside a box of the file's frame, edges included. */
export function demRange(d: Dem, box: [number, number, number, number]): [number, number] {
  const h = demHalf(d)
  const i0 = Math.max(0, Math.floor((box[0] + h.x) / d.cell))
  const i1 = Math.min(d.nx - 1, Math.ceil((box[2] + h.x) / d.cell))
  const j0 = Math.max(0, Math.floor((box[1] + h.z) / d.cell))
  const j1 = Math.min(d.nz - 1, Math.ceil((box[3] + h.z) / d.cell))
  let lo = Infinity
  let hi = -Infinity
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = d.cm[j * d.nx + i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  return [d.base + lo / 100, d.base + hi / 100]
}

// SHA-256 (FIPS 180-4), for the `hash` that pins a source's file: plain integer arithmetic, the same everywhere
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** The SHA-256 of some bytes, as "sha256:" and 64 hex digits. */
export function sha256(bytes: Uint8Array): string {
  const len = bytes.length
  const blocks = Math.floor((len + 9 + 63) / 64)
  const m = new Uint8Array(blocks * 64)
  m.set(bytes)
  m[len] = 0x80
  const bits = new DataView(m.buffer)
  bits.setUint32(m.length - 8, Math.floor(len / 0x20000000), false)
  bits.setUint32(m.length - 4, (len * 8) >>> 0, false)
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const W = new Uint32Array(64)
  for (let b = 0; b < blocks; b++) {
    for (let t = 0; t < 16; t++) W[t] = bits.getUint32(b * 64 + t * 4, false)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0
    }
    let [a, bb, c, d, e, f, g, h] = H
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = bb
      bb = a
      a = (t1 + t2) >>> 0
    }
    const add = [a, bb, c, d, e, f, g, h]
    for (let k = 0; k < 8; k++) H[k] = (H[k] + add[k]) >>> 0
  }
  return 'sha256:' + Array.from(H, x => x.toString(16).padStart(8, '0')).join('')
}

// the attributes a dem source carries, beside id, kind, ref and note
export const DEM_SOURCE_KEYS = ['file', 'hash', 'credit', 'licence'] as const

/** The `relief.dem` features' pieces: where on the map, and the shift from map to file coordinates. */
export const demShift = (f: Feature): { x: number; z: number } => {
  const s = f.shift as { x?: number; z?: number } | undefined
  return { x: s?.x ?? 0, z: s?.z ?? 0 }
}

/**
 * The checks that need the map's files: each `dem` source's file is there, decodes and matches its hash; each
 * `relief.dem` piece (its box on the map, with its edge, moved by its shift) lies inside its file, and its heights,
 * less the map's datum, stay within `min`..`max` m. Returns the decoded files by source id.
 */
export function checkDemFiles(
  map: MapFile,
  files: MapFiles,
  pieces: { f: Feature; i: number; box: [number, number, number, number] }[],
  range: { min: number; max: number },
): { issues: Issue[]; dems: Map<string, Dem> } {
  const issues: Issue[] = []
  const dems = new Map<string, Dem>()
  ;(map.sources ?? []).forEach((s, i) => {
    if (s.kind !== 'dem') return
    const src = s as typeof s & { file?: string; hash?: string }
    const path = `sources[${i}].file`
    const bytes = src.file === undefined ? undefined : files.get(src.file)
    if (!bytes) {
      issues.push({ id: null, path, message: `the file "${src.file}" was not found beside the map` })
      return
    }
    const got = sha256(bytes)
    if (got !== src.hash) {
      issues.push({ id: null, path: `sources[${i}].hash`, message: `"${src.file}" has hash ${got}, not ${src.hash}` })
      return
    }
    try {
      dems.set(s.id, decodeRdem(bytes))
    } catch (e) {
      issues.push({ id: null, path, message: `"${src.file}": ${(e as Error).message}` })
    }
  })
  const datum = map.datum ?? 0
  for (const { f, i, box: b } of pieces) {
    const d = typeof f.source === 'string' ? dems.get(f.source) : undefined
    if (!d) continue
    const sh = demShift(f)
    const box: [number, number, number, number] = [b[0] + sh.x, b[1] + sh.z, b[2] + sh.x, b[3] + sh.z]
    const h = demHalf(d)
    if (box[0] < -h.x || box[1] < -h.z || box[2] > h.x || box[3] > h.z) {
      issues.push({
        id: f.id,
        path: `features[${i}]`,
        message: `the piece reaches past its file (${(2 * h.x).toFixed(0)} × ${(2 * h.z).toFixed(0)} m, centred): move it or its shift`,
      })
      continue
    }
    const [lo, hi] = demRange(d, box)
    if (lo - datum < range.min || hi - datum > range.max) {
      issues.push({
        id: f.id,
        path: `features[${i}]`,
        message: `its heights, ${lo.toFixed(1)}–${hi.toFixed(1)} m, less the datum ${datum} m, leave ${range.min}…${range.max} m: set the map's datum near the lowest`,
      })
    }
  }
  return { issues, dems }
}
