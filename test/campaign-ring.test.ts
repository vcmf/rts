// The close zoom's ring of tiles (src/render/campaign/ring.ts, docs/plans/done/k2c-stream.md): a tile's slot, the
// area's place and tiles, a move's slots, the tiles to load, the slots' table, the uploads waiting.
import { describe, it, expect } from 'vitest'
import {
  areaOrigin,
  areaTiles,
  assignSlots,
  retryWait,
  tilesToLoad,
  EMPTY,
  nearestFirst,
  slotOf,
  SlotTable,
  Uploads,
  type TileAt,
} from '../src/render/campaign/ring.ts'
import type { Level } from '../src/render/campaign/tiles.ts'

// the theatre's close level: 32 × 20 tiles of 256 nodes
const level: Level = {
  cell: 100,
  nx: 8001,
  nz: 5001,
  size: 256,
  tilesX: 32,
  tilesZ: 20,
  scale: 0.5,
  base: -70,
  zoom: 10,
  path: 'l1/t-{i}-{j}.bin',
}

describe('a tile slot', () => {
  it('is the tile modulo the area, so each tile in an area has a slot of its own', () => {
    expect(slotOf(0, 0, 12)).toBe(0)
    expect(slotOf(13, 2, 12)).toBe(2 * 12 + 1)
    const slots = areaTiles(level, 12, { ox: 7, oz: 5 }).map(([i, j]) => slotOf(i, j, 12))
    expect(new Set(slots).size).toBe(144)
  })

  it('stays the same for a tile wherever the area moves', () => {
    const at = (origin: { ox: number; oz: number }) =>
      new Map(areaTiles(level, 12, origin).map(([i, j]) => [`${i},${j}`, slotOf(i, j, 12)]))
    const before = at({ ox: 4, oz: 2 })
    const after = at({ ox: 5, oz: 3 })
    for (const [key, slot] of after) if (before.has(key)) expect(slot).toBe(before.get(key))
  })
})

describe('the area', () => {
  it('centres on the tile under the target, kept on the level', () => {
    expect(areaOrigin(level, 12, 16, 10, null, 1)).toEqual({ ox: 10, oz: 4 })
    expect(areaOrigin(level, 12, 1, 19, null, 1)).toEqual({ ox: 0, oz: 8 })
  })

  it('stays where it is for a move within the slack, and moves for more', () => {
    const now = { ox: 10, oz: 4 }
    expect(areaOrigin(level, 12, 17, 11, now, 1)).toBe(now)
    expect(areaOrigin(level, 12, 18, 10, now, 1)).toEqual({ ox: 12, oz: 4 })
  })

  it('at the level edge, stays put however far the target moves along it', () => {
    const now = areaOrigin(level, 12, 31, 10, null, 1)
    expect(areaOrigin(level, 12, 26, 10, now, 1)).toBe(now)
  })

  it('holds the level tiles in it, fewer when the level is smaller than the area', () => {
    expect(areaTiles(level, 12, { ox: 0, oz: 0 })).toHaveLength(144)
    const small: Level = { ...level, tilesX: 3, tilesZ: 2 }
    expect(areaTiles(small, 12, areaOrigin(small, 12, 1, 1, null, 1))).toHaveLength(6)
  })

  it('loads the nearest tiles first', () => {
    const tiles: TileAt[] = [
      [0, 0],
      [5, 5],
      [3, 4],
    ]
    expect(nearestFirst(tiles, 5, 5)).toEqual([
      [5, 5],
      [3, 4],
      [0, 0],
    ])
  })
})

describe('the slots table', () => {
  it('starts empty and holds a tile column and row as 16 bits each', () => {
    const t = new SlotTable(2)
    expect(t.get(3)).toBeNull()
    expect([...t.bytes.subarray(0, 4)]).toEqual([255, 255, 255, 255])
    t.set(3, [300, 7])
    expect(t.get(3)).toEqual([300, 7])
    expect([...t.bytes.subarray(12, 16)]).toEqual([1, 44, 0, 7])
    t.set(3, null)
    expect(t.get(3)).toBeNull()
  })

  it('refuses a tile it cannot hold', () => {
    expect(() => new SlotTable(1).set(0, [EMPTY, 0])).toThrow(/past 65534/)
  })
})

describe('the uploads waiting', () => {
  it('keeps one a slot, the later replacing the earlier, and hands out the oldest within the budget', () => {
    const u = new Uploads<string>()
    u.set(4, 'old')
    u.set(7, 'b')
    u.set(4, 'a')
    u.set(9, 'c')
    u.set(2, 'gone')
    u.drop(2)
    expect(u.size).toBe(3)
    // slot 4 was set again after 7: it waits behind 7 now
    expect(u.take(2)).toEqual([
      [7, 'b'],
      [4, 'a'],
    ])
    expect(u.take(2)).toEqual([[9, 'c']])
    expect(u.size).toBe(0)
  })
})

describe('a move of the area', () => {
  it('gives the slots of the tiles that left to those that came in, and keeps the others', () => {
    const before = assignSlots(new Array<string | null>(144).fill(null), areaTiles(level, 12, { ox: 4, oz: 2 }), 12)
    // the first area: every slot changes hands
    expect(before.changed).toHaveLength(144)
    const after = assignSlots(before.given, areaTiles(level, 12, { ox: 5, oz: 2 }), 12)
    // one column came in (x = 16), into the slots of the column that left (x = 4)
    expect(after.changed.map(([, t]) => t[0])).toEqual(new Array<number>(12).fill(16))
    expect(after.changed.map(([s]) => s % 12)).toEqual(new Array<number>(12).fill(4))
    expect(after.given.filter(key => key?.startsWith('4,'))).toEqual([])
    // the input is left as it was
    expect(before.given.filter(key => key?.startsWith('4,'))).toHaveLength(12)
  })
})

describe('the tiles to load', () => {
  const tiles: TileAt[] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ]
  const have = { present: (key: string) => key === '1,0', loading: (key: string) => key === '2,0' }
  const wait = (tries: number) => retryWait(tries, 5000, 60000)

  it('are those neither present nor loading, the nearest first', () => {
    expect(tilesToLoad(tiles, 3, 0, have, new Map(), 0, wait)).toEqual([
      [3, 0],
      [0, 0],
    ])
  })

  it('leave out a tile that failed until its wait has passed, the wait doubling with each failure', () => {
    const failed = new Map([['3,0', { at: 1000, tries: 1 }]])
    expect(tilesToLoad(tiles, 3, 0, have, failed, 5999, wait)).toEqual([[0, 0]])
    expect(tilesToLoad(tiles, 3, 0, have, failed, 6000, wait)).toHaveLength(2)
    failed.set('3,0', { at: 1000, tries: 2 })
    expect(tilesToLoad(tiles, 3, 0, have, failed, 6000, wait)).toEqual([[0, 0]])
    expect([1, 2, 3, 5, 9].map(wait)).toEqual([5000, 10000, 20000, 60000, 60000])
  })
})
