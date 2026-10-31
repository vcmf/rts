// The bake by blocks (docs/plans/active/europe.md, EU1): a level's blocks (src/render/campaign/tiles.ts levelBlocks),
// a block's shape against the whole level's (src/render/campaign/bake.ts buildShape), and its light reading the far
// shape past it (bakeLightRows).
import { describe, it, expect } from 'vitest'
import { bakeLightRows, buildShape, type Grid, type ShapeParams } from '../src/render/campaign/bake.ts'
import { levelBlocks } from '../src/render/campaign/tiles.ts'

describe('a level blocks', () => {
  it('hold every tile once, their own nodes inside their margins, clipped to the level', () => {
    const nx = 1100
    const nz = 700
    const blocks = levelBlocks(nx, nz, 64, 4, 40)
    const seen = new Set<string>()
    for (const b of blocks) {
      for (let r = b.tiles.r0; r < b.tiles.r1; r++) {
        for (let c = b.tiles.c0; c < b.tiles.c1; c++) {
          expect(seen.has(`${c},${r}`)).toBe(false)
          seen.add(`${c},${r}`)
        }
      }
      expect(b.baked.i0).toBe(Math.max(0, b.own.i0 - 40))
      expect(b.baked.i1).toBe(Math.min(nx, b.own.i1 + 40))
      expect(b.own.i1).toBeLessThanOrEqual(nx)
      expect(b.own.j1).toBeLessThanOrEqual(nz)
    }
    // 18 × 11 tiles of 64 nodes
    expect(seen.size).toBe(18 * 11)
  })
})

/** A grid of rolling hills with a mountain range, heights in metres, the south row first. */
function hills(nx: number, nz: number, cell: number): Float32Array {
  return Float32Array.from({ length: nx * nz }, (_, k) => {
    const x = ((k % nx) * cell) / 1000
    const z = (Math.floor(k / nx) * cell) / 1000
    return 300 + 200 * Math.sin(x / 3) * Math.cos(z / 4) + 1500 * Math.exp(-(((z - 20) / 6) ** 2))
  })
}

const shapeParams: ShapeParams = {
  bigM: 3000,
  regionM: 6000,
  fine: 0.75,
  mount: 1,
  vert: 2.5,
  mountFrom: 500,
  mountTo: 1600,
  edgeKm: 12,
  low: 0,
}

describe('a block of a level', () => {
  it('has the whole level shape on its own nodes when its margin covers the blurs', () => {
    const cell = 250
    const nx = 201
    const nz = 161
    const whole: Grid = { nx, nz, cell, x0: 0, z0: 0 }
    const h = hills(nx, nz, cell)
    const shape = buildShape(h, whole, shapeParams)
    // a block of nodes 80..120 × 60..100, with a margin of 48 nodes (12 km: the region blur reaches 10.5 km)
    const b = { i0: 32, i1: 168, j0: 12, j1: 148 }
    const bw = b.i1 - b.i0
    const bh = b.j1 - b.j0
    const sub = Float32Array.from({ length: bw * bh }, (_, k) => h[(b.j0 + Math.floor(k / bw)) * nx + b.i0 + (k % bw)])
    const grid: Grid = { nx: bw, nz: bh, cell, x0: b.i0 * cell, z0: b.j0 * cell }
    const blockShape = buildShape(sub, grid, shapeParams, { i0: b.i0, j0: b.j0, nx, nz })
    for (let j = 60; j < 100; j++) {
      for (let i = 80; i < 120; i++) {
        expect(blockShape[(j - b.j0) * bw + (i - b.i0)]).toBeCloseTo(shape[j * nx + i], 2)
      }
    }
  })

  it('reads the far shape past its span: a ridge beyond the block shadows its nodes', () => {
    // a small block, flat, and a far shape with a high ridge 10 km toward the sun (north, 20 deg high)
    const block: Grid = { nx: 21, nz: 21, cell: 100, x0: 0, z0: 0 }
    const flat = new Float32Array(21 * 21)
    const far: Grid = { nx: 41, nz: 41, cell: 1000, x0: -10000, z0: -10000 }
    const farShape = Float32Array.from({ length: 41 * 41 }, (_, k) => (Math.floor(k / 41) === 22 ? 8000 : 0))
    const sun = { el: 20, az: 0, size: 2.5 }
    const alone = new Uint8Array(21 * 21 * 2)
    const withFar = new Uint8Array(21 * 21 * 2)
    bakeLightRows(flat, block, sun, alone, 10, 11)
    bakeLightRows(flat, block, sun, withFar, 10, 11, { shape: farShape, g: far })
    const k = 10 * 21 + 10
    // alone, the block sees only its own flat ground: full sun; with the far shape, the ridge's shadow
    expect(alone[k * 2]).toBe(255)
    expect(withFar[k * 2]).toBe(0)
  })
})

describe('a block light near the map edge', () => {
  // the far shape spans the map, 0 to 20 km, flat; an inner block from 4 to 6 km, its own edge a high wall
  const far: Grid = { nx: 21, nz: 21, cell: 1000, x0: 0, z0: 0 }
  const farShape = new Float32Array(21 * 21)
  const block: Grid = { nx: 21, nz: 21, cell: 100, x0: 4000, z0: 14000 }
  // the block's shape: flat but for its last three rows (z = 15.8 to 16 km), 3 km high: a wall the whole level does not
  // have there (three rows, so the sun's growing steps do not pass over it)
  const shape = Float32Array.from({ length: 21 * 21 }, (_, k) => (Math.floor(k / 21) >= 18 ? 3000 : 0))
  const sun = { el: 20, az: 0, size: 2.5 }

  it('holds a ray past the map edge at the map edge, not at the block edge', () => {
    const out = new Uint8Array(21 * 21 * 2)
    // the block's exact zone: its first ten rows only; past it, and past the map's north edge (20 km), the far shape
    const near = { x0: 4000, z0: 14000, x1: 6000, z1: 15000 }
    bakeLightRows(shape, block, sun, out, 5, 6, { shape: farShape, g: far }, 0, 21, near)
    // the wall in the block's margin is not read (past its exact zone), nor held past the map's edge: full sun
    expect(out[(5 * 21 + 10) * 2]).toBe(255)
  })

  it('reads the block where its shape is exact', () => {
    const out = new Uint8Array(21 * 21 * 2)
    const near = { x0: 4000, z0: 14000, x1: 6000, z1: 16000 }
    bakeLightRows(shape, block, sun, out, 5, 6, { shape: farShape, g: far }, 0, 21, near)
    // the wall 1.3 km north, 3 km high: the node in its shadow
    expect(out[(5 * 21 + 10) * 2]).toBe(0)
  })
})
