// The close zoom's ring of tiles (docs/plans/active/k2c-stream.md, K2c1): the detail area holds `area` × `area` tile
// slots, and the tile at (i, j) of the close level always lives in slot (i mod area, j mod area), so when the camera
// moves only the tiles that come into the area are loaded, into the slots of those that left. The area's textures
// wrap; a small table says which tile each slot holds, so the shader never draws a slot's old tile in a new place.
// Pure: the view (src/render/campaign/view.ts) fetches, uploads and draws.
import type { Level } from './tiles.ts'

/** A tile of the close level: its column and row. */
export type TileAt = [column: number, row: number]

/** The slot of the area that tile (i, j) lives in, as its index (row by row). */
export function slotOf(i: number, j: number, area: number): number {
  return (j % area) * area + (i % area)
}

/**
 * Where the area should start, its first column and row: centred on the tile (ti, tj) under the camera's target, kept
 * on the level, and left where it is (`now`) unless that is more than `slack` tiles off, so a small move loads
 * nothing. Compared after the clamp, or at the level's edge the area would move at every redraw.
 */
export function areaOrigin(
  level: Level,
  area: number,
  ti: number,
  tj: number,
  now: { ox: number; oz: number } | null,
  slack: number,
): { ox: number; oz: number } {
  const clamp = (v: number, hi: number) => Math.min(Math.max(0, hi), Math.max(0, v))
  const half = Math.floor(area / 2)
  const ox = clamp(ti - half, level.tilesX - area)
  const oz = clamp(tj - half, level.tilesZ - area)
  if (now && Math.abs(ox - now.ox) <= slack && Math.abs(oz - now.oz) <= slack) return now
  return { ox, oz }
}

/** The level's tiles in the area that starts at `origin`. */
export function areaTiles(level: Level, area: number, origin: { ox: number; oz: number }): TileAt[] {
  const out: TileAt[] = []
  for (let j = origin.oz; j < Math.min(level.tilesZ, origin.oz + area); j++) {
    for (let i = origin.ox; i < Math.min(level.tilesX, origin.ox + area); i++) out.push([i, j])
  }
  return out
}

/** The tiles nearest (ti, tj) first. */
export function nearestFirst(tiles: TileAt[], ti: number, tj: number): TileAt[] {
  const d = ([i, j]: TileAt) => Math.hypot(i - ti, j - tj)
  return [...tiles].sort((a, b) => d(a) - d(b))
}

/** A tile's key, as the caches hold it. */
export const tileKey = ([i, j]: TileAt) => `${i},${j}`

/**
 * The slots given to the area's tiles after a move: `given` (the tile key each slot was given to, by slot) with each
 * tile of the area in its slot, and the slots that changed hands, which the table must stop drawing until their new
 * tile is written. A slot keeps its tile when the tile is still in the area.
 */
export function assignSlots(
  given: (string | null)[],
  tiles: TileAt[],
  area: number,
): { given: (string | null)[]; changed: [slot: number, tile: TileAt][] } {
  const next = [...given]
  const changed: [number, TileAt][] = []
  for (const tile of tiles) {
    const s = slotOf(tile[0], tile[1], area)
    const key = tileKey(tile)
    if (next[s] === key) continue
    next[s] = key
    changed.push([s, tile])
  }
  return { given: next, changed }
}

/**
 * The tiles of the area to load, the nearest (ti, tj) first: those not cached, not loading, and not failed within
 * the last `retryMs` (a failure at `failed.get(key)` ms is tried again after it).
 */
export function tilesToLoad(
  tiles: TileAt[],
  ti: number,
  tj: number,
  have: { cached: (key: string) => boolean; loading: (key: string) => boolean },
  failed: Map<string, number>,
  now: number,
  retryMs: number,
): TileAt[] {
  const wanted = tiles.filter(t => {
    const key = tileKey(t)
    const at = failed.get(key)
    return !have.cached(key) && !have.loading(key) && (at === undefined || now - at >= retryMs)
  })
  return nearestFirst(wanted, ti, tj)
}

// a slot's table entry when it holds no tile: 0xffff for the column and the row
export const EMPTY = 0xffff

/**
 * The slots' table, as the shader reads it: RGBA bytes a slot, the column in R (high byte) and G, the row in B (high
 * byte) and A; EMPTY in both when the slot holds no tile drawn yet.
 */
export class SlotTable {
  readonly bytes: Uint8Array
  readonly area: number

  constructor(area: number) {
    this.area = area
    this.bytes = new Uint8Array(area * area * 4)
    for (let s = 0; s < area * area; s++) this.set(s, null)
  }

  /** The tile slot `s` holds, or null. */
  get(s: number): TileAt | null {
    const b = this.bytes
    const column = b[s * 4] * 256 + b[s * 4 + 1]
    const row = b[s * 4 + 2] * 256 + b[s * 4 + 3]
    return column === EMPTY ? null : [column, row]
  }

  /** Slot `s` now holds `tile` (or none). Throws on a column or row the table cannot hold. */
  set(s: number, tile: TileAt | null) {
    const [column, row] = tile ?? [EMPTY, EMPTY]
    if (tile && (column >= EMPTY || row >= EMPTY || column < 0 || row < 0)) {
      throw new RangeError(`SlotTable: a tile at ${column}, ${row}, past ${EMPTY - 1}`)
    }
    const b = this.bytes
    b[s * 4] = column >> 8
    b[s * 4 + 1] = column & 0xff
    b[s * 4 + 2] = row >> 8
    b[s * 4 + 3] = row & 0xff
  }
}

/**
 * The uploads waiting for the GPU, one a slot: a tile to write into its slot. A later upload for a slot replaces the
 * one waiting; `take` hands out at most `budget` of them, the oldest first. (A slot given to a new tile is not
 * cleared: the slots' table stops the shader drawing it, and its neighbours' edges, until the new tile is written.)
 */
export class Uploads<T> {
  private readonly waiting = new Map<number, T>()

  /** Slot `s` is to be written with `item`. */
  set(s: number, item: T) {
    this.waiting.delete(s)
    this.waiting.set(s, item)
  }

  /** How many wait. */
  get size(): number {
    return this.waiting.size
  }

  /** Forgets slot `s`'s upload, if one waits (its slot was given to another tile). */
  drop(s: number) {
    this.waiting.delete(s)
  }

  /** Up to `budget` uploads, the oldest first, taken from the waiting ones. */
  take(budget: number): [slot: number, item: T][] {
    const out: [number, T][] = []
    for (const [s, item] of this.waiting) {
      if (out.length >= budget) break
      out.push([s, item])
    }
    for (const [s] of out) this.waiting.delete(s)
    return out
  }
}
