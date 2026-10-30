// The campaign map's tiles (src/render/campaign/tiles.ts, decision 0094): a tile packed and unpacked, cut from a
// level's bake, deflated by Node and inflated by the platform's stream.
import zlib from 'node:zlib'
import { describe, it, expect } from 'vitest'
import type { Grid } from '../src/render/campaign/bake.ts'
import { cutTile, inflate, packTile, unpackTile, type LevelBake, type Tile } from '../src/render/campaign/tiles.ts'

/** A tile of `size` nodes whose values follow its node index. */
function tileOf(size: number, shape: (k: number) => number): Tile {
  const n = size * size
  return {
    level: 1,
    column: 7,
    row: 300,
    size,
    shape: Uint16Array.from({ length: n }, (_, k) => shape(k)),
    sun: Uint8Array.from({ length: n }, (_, k) => k % 256),
    sky: Uint8Array.from({ length: n }, (_, k) => (k * 7) % 256),
    forest: Uint8Array.from({ length: n }, (_, k) => (k * 13) % 256),
  }
}

describe('a campaign tile', () => {
  it('unpacks to what was packed', () => {
    const tile = tileOf(16, k => 1000 + ((k * 37) % 500))
    expect(unpackTile(packTile(tile))).toEqual(tile)
  })

  it('keeps the shape whole across the Uint16 range: a row from 0 to 65535 and back', () => {
    const tile = tileOf(4, k => [0, 65535, 1, 65534][k % 4])
    expect(unpackTile(packTile(tile)).shape).toEqual(tile.shape)
  })

  it('stores a smooth row as small differences', () => {
    const tile = tileOf(4, k => 30000 + k)
    const bytes = packTile(tile)
    const view = new DataView(bytes.buffer)
    // the second row: its first node as is, then steps of one
    expect([0, 1, 2, 3].map(i => view.getUint16(16 + (4 + i) * 2, true))).toEqual([30004, 1, 1, 1])
  })

  it('refuses another format, another version and a cut tile', () => {
    const bytes = packTile(tileOf(4, k => k))
    const other = bytes.slice()
    other[0] = 'X'.charCodeAt(0)
    expect(() => unpackTile(other)).toThrow(/not a campaign tile/)
    const newer = bytes.slice()
    newer[4] = 2
    expect(() => unpackTile(newer)).toThrow(/version 2/)
    expect(() => unpackTile(bytes.subarray(0, bytes.length - 1))).toThrow(/bytes for a tile of 4 nodes/)
    expect(() => unpackTile(bytes.subarray(0, 8))).toThrow(/shorter than the header/)
  })

  it('refuses to pack planes of the wrong length', () => {
    const tile = { ...tileOf(4, k => k), sky: new Uint8Array(3) }
    expect(() => packTile(tile)).toThrow(/3 sky values for 16 nodes/)
  })

  it('inflates in the platform stream what Node deflated', async () => {
    const bytes = packTile(tileOf(32, k => 2000 + (k % 32)))
    expect(await inflate(zlib.deflateSync(bytes, { level: 9 }))).toEqual(bytes)
  })
})

describe('a tile cut from a level', () => {
  // a level of 5 × 3 nodes: the shape in metres the node index, the light and the forest from it
  const grid: Grid = { nx: 5, nz: 3, cell: 100, x0: 0, z0: 0 }
  const bake: LevelBake = {
    grid,
    shape: Float32Array.from({ length: 15 }, (_, k) => k),
    light: Uint8Array.from({ length: 30 }, (_, k) => k),
    forest: Uint8Array.from({ length: 15 }, (_, k) => 100 + k),
  }

  it('reads its nodes from the grid, the shape in the scale steps', () => {
    const tile = cutTile(bake, 0, 0, 0, 2, 0.5)
    // nodes (0, 0), (1, 0), (0, 1), (1, 1): grid indexes 0, 1, 5, 6
    expect([...tile.shape]).toEqual([0, 2, 10, 12])
    expect([...tile.sun]).toEqual([0, 2, 10, 12])
    expect([...tile.sky]).toEqual([1, 3, 11, 13])
    expect([...tile.forest]).toEqual([100, 101, 105, 106])
  })

  it('repeats the grid edge past it', () => {
    // the tile at column 1, row 0 of 4-node tiles: x from node 4 (the east edge) to 7, z from 0 to 3 (past row 2)
    const tile = cutTile(bake, 0, 1, 0, 4, 1)
    // its first row: x = 4, 5, 6, 7, all node 4 of row 0
    expect([...tile.shape.subarray(0, 4)]).toEqual([4, 4, 4, 4])
    // its last row: z = 3, held at row 2, the north edge
    expect([...tile.shape.subarray(12, 16)]).toEqual([14, 14, 14, 14])
  })

  it('holds a shape below zero at zero, and refuses one past the Uint16 range', () => {
    const low = { ...bake, shape: new Float32Array(15).fill(-3) }
    expect([...cutTile(low, 0, 0, 0, 1, 0.5).shape]).toEqual([0])
    const high = { ...bake, shape: new Float32Array(15).fill(40000) }
    expect(() => cutTile(high, 0, 0, 0, 1, 0.5)).toThrow(/past 32767.5 m/)
  })
})
