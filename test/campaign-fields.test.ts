// The campaign map's far fields (src/render/campaign/bake.ts lakeMask and lineOffsets, src/render/campaign/fields.ts):
// the lakes' mask, the lines' offsets against the slow way, the file packed and unpacked.
import { describe, it, expect } from 'vitest'
import { lakeMask, lineOffsets, type Grid } from '../src/render/campaign/bake.ts'
import { numbers, packFields, quantise, unpackFields, type Plane } from '../src/render/campaign/fields.ts'
import type { Pt } from '../src/map/schema.ts'

/** A rectangle's ring, from (x0, z0) to (x1, z1). */
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

describe('the lakes mask', () => {
  // 5 × 5 nodes 100 m apart: two texels a cell, 8 × 8 texels of 50 m
  const grid: Grid = { nx: 5, nz: 5, cell: 100, x0: 0, z0: 0 }

  it('is full inside a lake and empty outside it, the texels tiling the frame', () => {
    const mask = lakeMask([rect(100, 100, 300, 300)], grid, 2)
    expect([mask.w, mask.h]).toEqual([8, 8])
    // texels 2 to 5 cover x and z from 100 to 300
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const inside = i >= 2 && i <= 5 && j >= 2 && j <= 5
        expect(mask.data[j * 8 + i], `texel ${i}, ${j}`).toBe(inside ? 255 : 0)
      }
    }
  })

  it('covers a texel the shore crosses by the share of it in the water', () => {
    // the west shore at x = 125: texel 2 (100 to 150) half in the water
    const mask = lakeMask([rect(125, 100, 300, 300)], grid, 2)
    expect(mask.data[3 * 8 + 2]).toBe(128)
    expect(mask.data[3 * 8 + 3]).toBe(255)
  })

  it('counts two lakes sharing an edge as one water, with no seam between them', () => {
    // the shared edge at x = 175, inside texel 3 (150 to 200)
    const mask = lakeMask([rect(100, 100, 175, 300), rect(175, 100, 300, 300)], grid, 2)
    expect(mask.data[3 * 8 + 3]).toBe(255)
  })

  it('leaves a lake off the frame out', () => {
    const mask = lakeMask([rect(1000, 1000, 1200, 1200)], grid, 2)
    expect(mask.data.every(v => v === 0)).toBe(true)
  })
})

describe('the lines offsets', () => {
  const grid: Grid = { nx: 13, nz: 11, cell: 100, x0: -600, z0: -500 }
  const reach = 3
  const lines = [
    [-550, -450, 120, 80, 400, -300],
    [-200, 400, 300, 450],
  ]

  /** The vector from a texel's centre to the nearest point of any line, in cells, by every segment. */
  function slow(i: number, j: number): [number, number, number] {
    let best: [number, number, number] = [Infinity, 0, 0]
    const px = i + 0.5
    const pz = j + 0.5
    for (const p of lines) {
      for (let k = 2; k < p.length; k += 2) {
        const ax = (p[k - 2] - grid.x0) / 100
        const az = (p[k - 1] - grid.z0) / 100
        const bx = (p[k] - grid.x0) / 100
        const bz = (p[k + 1] - grid.z0) / 100
        const dx = bx - ax
        const dz = bz - az
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
        const v: [number, number] = [ax + t * dx - px, az + t * dz - pz]
        const d = Math.hypot(...v)
        if (d < best[0]) best = [d, ...v]
      }
    }
    return best
  }

  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, (v / reach) * 0.5 + 0.5)) * 255)

  it('holds the vector to the nearest line, as the slow way finds it, within reach', () => {
    const out = lineOffsets(lines, grid, reach)
    const w = grid.nx - 1
    let near = 0
    for (let j = 0; j < grid.nz - 1; j++) {
      for (let i = 0; i < w; i++) {
        const [d, vx, vz] = slow(i, j)
        if (d > reach) continue
        near++
        expect([out[(j * w + i) * 2], out[(j * w + i) * 2 + 1]], `texel ${i}, ${j}`).toEqual([byte(vx), byte(vz)])
      }
    }
    expect(near).toBeGreaterThan(40)
  })

  it('holds the far corner where no line is within reach', () => {
    const out = lineOffsets([[-600, -500, -590, -500]], grid, reach)
    const w = grid.nx - 1
    expect([out[(9 * w + 11) * 2], out[(9 * w + 11) * 2 + 1]]).toEqual([255, 255])
  })
})

describe('the fields file', () => {
  const planes: Plane[] = [
    { name: 'lakes', kind: 'bytes', w: 3, h: 2, channels: 1, values: Uint8Array.of(0, 1, 2, 253, 254, 255) },
    { name: 'high', kind: 'bytes', w: 2, h: 1, channels: 2, values: Uint8Array.of(9, 8, 7, 6) },
    quantise('contour', 2, 2, [-1000, 0.1, 812.37, 15383.75], 0.25, -1000),
  ]

  it('unpacks to what was packed, the numbers within half their step', () => {
    const back = unpackFields(packFields(planes))
    expect([...back.keys()]).toEqual(['lakes', 'high', 'contour'])
    expect(back.get('lakes')).toEqual(planes[0])
    expect(back.get('high')).toEqual(planes[1])
    const contour = back.get('contour')!
    expect(contour.kind).toBe('uint16')
    if (contour.kind !== 'uint16') return
    const read = numbers(contour)
    ;[-1000, 0.1, 812.37, 15383.75].forEach((v, k) => expect(Math.abs(read[k] - v)).toBeLessThanOrEqual(0.125))
  })

  it('stores a number plane by rows as differences, and reads it back across the Uint16 range', () => {
    const plane = quantise('d', 3, 2, [0, 15383.75, -1000, 5, 5.25, 4.75], 0.25, -1000)
    const bytes = packFields([plane])
    const view = new DataView(bytes.buffer)
    // after the header (8) and the plane's (28): the first row 4000, 65535 - 4000, 0 - 65535 (mod 2^16)
    expect([0, 1, 2].map(k => view.getUint16(36 + k * 2, true))).toEqual([4000, 61535, 1])
    expect(unpackFields(bytes).get('d')).toEqual(plane)
  })

  it('refuses a number past its range or not a number', () => {
    expect(() => quantise('lakeD', 1, 1, [16000], 0.25, -1000)).toThrow(/lakeD's 16000 at 0, past -1000 to 15383.75/)
    expect(() => quantise('lakeD', 1, 1, [NaN], 0.25, -1000)).toThrow(/NaN/)
  })

  it('refuses another format, another version, a cut file and bytes past the last plane', () => {
    const bytes = packFields(planes)
    const other = bytes.slice()
    other[0] = 'X'.charCodeAt(0)
    expect(() => unpackFields(other)).toThrow(/not the campaign map's fields/)
    const newer = bytes.slice()
    newer[4] = 2
    expect(() => unpackFields(newer)).toThrow(/version 2/)
    expect(() => unpackFields(bytes.subarray(0, bytes.length - 1))).toThrow(/contour: cut/)
    expect(() => unpackFields(Uint8Array.of(...bytes, 0))).toThrow(/1 bytes past the last plane/)
  })

  it('refuses two planes of one name, a plane of part channels and a channel count past a byte', () => {
    expect(() => packFields([planes[0], planes[0]])).toThrow(/two planes named lakes/)
    expect(() => quantise('x', 2, 1, [1, 2, 3], 1, 0)).toThrow(/x: 3 values for 2 × 1 texels/)
    const wide: Plane = { name: 'wide', kind: 'bytes', w: 1, h: 1, channels: 256, values: new Uint8Array(256) }
    expect(() => packFields([wide])).toThrow(/wide: a channels of 256, past 1 to 255/)
    // the same name twice in a file is refused on reading too
    const bytes = packFields([planes[0], { ...planes[0], name: 'other' }])
    bytes.set(
      [...'lakes\0\0\0'].map(c => c.charCodeAt(0)),
      8 + 28 + 6,
    )
    expect(() => unpackFields(bytes)).toThrow(/two planes named lakes/)
  })

  it('refuses to pack a long name or values of the wrong length', () => {
    expect(() => packFields([{ ...planes[0], name: 'ninechars' }])).toThrow(/a plane named "ninechars"/)
    const high: Plane = { name: 'high', kind: 'bytes', w: 2, h: 1, channels: 2, values: new Uint8Array(3) }
    expect(() => packFields([high])).toThrow(/high: 3 values for 2 × 1 × 2/)
  })
})
