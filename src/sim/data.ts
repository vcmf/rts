// Build-time simulation data (docs/proposals/sim-design.md §2, decision 0012): the sim heightfield and
// the cost grid, built once in Node by tools/build-sim-data.ts and loaded here as bytes. The data version
// is the hash of those bytes; a world records it and refuses data with another version.
import { fnv1a } from './hash.ts'

export const DATA_MAGIC = 0x44535452 // 'RTSD' little-endian
export const DATA_FORMAT = 2

export interface Grid {
  cell: number
  nx: number
  nz: number
  x0: number
  z0: number
}
export interface SimData {
  version: number // fnv1a of the file bytes
  height: Grid & { h: Float64Array } // metres, nodes at x0 + i·cell
  cost: Grid & { g: Uint8Array } // speed factor ×255 per cell (0: impassable), cells from x0 + i·cell
  fine: Grid & { cls: Uint8Array; depth: Uint16Array } // per 1 m node: terrain class index, water depth (mm)
  classes: string[] // terrain class names, in index order
}

export class DataVersionMismatch extends Error {}

export function loadSimData(bytes: Uint8Array, expectedVersion?: number): SimData {
  const version = fnv1a(bytes)
  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new DataVersionMismatch(`sim data version ${hex(version)}, expected ${hex(expectedVersion)}`)
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let o = 0
  const u32 = () => {
    const r = v.getUint32(o, true)
    o += 4
    return r
  }
  const f64 = () => {
    const r = v.getFloat64(o, true)
    o += 8
    return r
  }
  if (u32() !== DATA_MAGIC || u32() !== DATA_FORMAT) throw new Error('not a sim data file of this format')
  const hg = { cell: f64(), nx: u32(), nz: u32(), x0: f64(), z0: f64() }
  const h = new Float64Array(hg.nx * hg.nz)
  for (let i = 0; i < h.length; i++) h[i] = f64()
  const cg = { cell: f64(), nx: u32(), nz: u32(), x0: f64(), z0: f64() }
  const g = bytes.slice(o, o + cg.nx * cg.nz)
  o += g.length
  if (g.length !== cg.nx * cg.nz) throw new Error('sim data file is truncated')
  const nClasses = u32()
  const classes: string[] = []
  for (let k = 0; k < nClasses; k++) {
    const n = u32()
    let s = ''
    for (let q = 0; q < n; q++) s += String.fromCharCode(v.getUint8(o++))
    classes.push(s)
  }
  const fg = { cell: f64(), nx: u32(), nz: u32(), x0: f64(), z0: f64() }
  const cls = bytes.slice(o, o + fg.nx * fg.nz)
  o += cls.length
  if (cls.length !== fg.nx * fg.nz) throw new Error('sim data file is truncated')
  const depth = new Uint16Array(fg.nx * fg.nz)
  for (let k = 0; k < depth.length; k++) {
    depth[k] = v.getUint16(o, true)
    o += 2
  }
  if (o !== bytes.length) throw new Error('sim data file has trailing bytes')
  return { version, height: { ...hg, h }, cost: { ...cg, g }, fine: { ...fg, cls, depth }, classes }
}

// the cost grid's speed factor (0..1) at a point; outside the grid: impassable
export function speedFactorAt(d: SimData, x: number, z: number): number {
  const c = d.cost
  const i = Math.floor((x - c.x0) / c.cell)
  const j = Math.floor((z - c.z0) / c.cell)
  if (i < 0 || j < 0 || i >= c.nx || j >= c.nz) return 0
  return c.g[j * c.nx + i] / 255
}

export const hex = (n: number): string => '0x' + (n >>> 0).toString(16).padStart(8, '0')
