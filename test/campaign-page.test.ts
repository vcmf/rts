// The campaign page's pure parts (src/render/campaign/level.ts, src/render/campaign/camera.ts): the manifest checked,
// a level put together from its tiles, the fields' planes for the GPU, the camera.
import { describe, it, expect } from 'vitest'
import {
  assembleLevel,
  bilinear,
  blitTile,
  halved,
  interleave,
  readManifest,
  tilePath,
  tilesOf,
} from '../src/render/campaign/level.ts'
import {
  cameraPosition,
  clampView,
  DIST_MAX,
  DIST_MIN,
  groundHit,
  rayGround,
  tiltFor,
  TILT_FAR,
  TILT_NEAR,
} from '../src/render/campaign/camera.ts'
import type { Plane } from '../src/render/campaign/fields.ts'
import { MANIFEST_FORMAT, type Level, type Manifest, type Tile } from '../src/render/campaign/tiles.ts'

// a level of 5 × 3 nodes cut into tiles of 4: 2 × 1 tiles, the frame 400 × 200 m
const level: Level = {
  cell: 100,
  nx: 5,
  nz: 3,
  size: 4,
  tilesX: 2,
  tilesZ: 1,
  scale: 0.5,
  base: -70,
  zoom: 10,
  path: 'b-1-2/l0/t-{i}-{j}.bin',
}

/** A tile of `level` whose node values follow their place in the level (shape steps 10 × node, the light from it). */
function tile(column: number, row: number): Tile {
  const n = level.size * level.size
  const at = (k: number) => {
    const i = column * level.size + (k % level.size)
    const j = row * level.size + Math.floor(k / level.size)
    return j * 10 + i
  }
  return {
    level: 0,
    column,
    row,
    size: level.size,
    shape: Uint16Array.from({ length: n }, (_, k) => 10 * at(k)),
    sun: Uint8Array.from({ length: n }, (_, k) => at(k)),
    sky: Uint8Array.from({ length: n }, (_, k) => 100 + at(k)),
    forest: Uint8Array.from({ length: n }, (_, k) => 200 + at(k)),
  }
}

const manifest = (): Manifest => ({
  format: MANIFEST_FORMAT,
  build: 'b-1-2',
  frame: { lat0: 48, lon0: 12, halfX: 200, halfZ: 100 },
  params: { sunEl: 20, sunAz: 55, lineReach: 6 },
  levels: [level],
  fields: { level: 0, path: 'b-1-2/fields.bin' },
  credit: 'test',
})

describe('the manifest', () => {
  it('is read when its format, levels and fields hold', () => {
    expect(readManifest(manifest()).build).toBe('b-1-2')
  })

  it('is refused in another format, with a level off the frame, or fields on no level', () => {
    expect(() => readManifest({ ...manifest(), format: 3 })).toThrow(/format is 3, this page reads 4/)
    expect(() => readManifest({ ...manifest(), levels: [{ ...level, nx: 6 }] })).toThrow(/level 0 does not span/)
    expect(() => readManifest({ ...manifest(), fields: { level: 1, path: 'x' } })).toThrow(/fields lie on level 1/)
    expect(() => readManifest(null)).toThrow(/not an object/)
  })

  it('names each tile by its column and row, row by row', () => {
    expect(tilePath(level, 1, 0)).toBe('b-1-2/l0/t-1-0.bin')
    expect(tilesOf(level)).toEqual([
      [0, 0],
      [1, 0],
    ])
  })
})

describe('a level from its tiles', () => {
  it('holds every node of the grid: the shape in metres, the light and forest, the padding left out', () => {
    const data = assembleLevel(level, [tile(0, 0), tile(1, 0)])
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 5; i++) {
        const k = j * 5 + i
        const v = j * 10 + i
        expect(data.shape[k], `node ${i}, ${j}`).toBe(-70 + 10 * v * 0.5)
        expect([...data.light.subarray(k * 4, k * 4 + 4)]).toEqual([v, 100 + v, 200 + v, 255])
      }
    }
  })

  it('refuses a level short of tiles', () => {
    expect(() => assembleLevel(level, [tile(0, 0)])).toThrow(/1 tiles for a level of 2 × 1/)
  })

  it('copies a tile into a window of the level, the nodes past the window left out', () => {
    // a window of 3 × 2 nodes from node (3, 1): node 3 is the first tile's, so left as it was; nodes 4 and 5 (the
    // second tile's first two columns, node 5 past the level's grid but inside the tile) copied
    const into = { shape: new Float32Array(6), light: new Uint8Array(24), n: 3, m: 2, ox: 3, oz: 1 }
    blitTile(tile(1, 0), level, into)
    expect([...into.light.filter((_, k) => k % 4 === 0)]).toEqual([0, 14, 15, 0, 24, 25])
  })
})

describe('the fields for the GPU', () => {
  it('halves a mask by the mean of 2 × 2, an odd edge kept', () => {
    const p: Plane = {
      name: 'lakes',
      kind: 'bytes',
      w: 3,
      h: 2,
      channels: 1,
      values: Uint8Array.of(0, 255, 9, 255, 255, 9),
    }
    expect(halved(p)).toMatchObject({ w: 2, h: 1, values: Uint8Array.of(191, 9) })
  })

  it('interleaves two line planes as RGBA, and one with 0 and 255', () => {
    const a: Plane = { name: 'high', kind: 'bytes', w: 1, h: 1, channels: 2, values: Uint8Array.of(1, 2) }
    const b: Plane = { name: 'country', kind: 'bytes', w: 1, h: 1, channels: 2, values: Uint8Array.of(3, 4) }
    expect([...interleave(a, b)]).toEqual([1, 2, 3, 4])
    expect([...interleave(a, null)]).toEqual([1, 2, 0, 255])
  })
})

describe('the camera', () => {
  const degrees = (rad: number) => (rad * 180) / Math.PI

  it('tilts from the far tilt out to the near one at the closest zoom', () => {
    expect(degrees(tiltFor(DIST_MAX))).toBeCloseTo(TILT_FAR, 6)
    expect(degrees(tiltFor(DIST_MIN))).toBeCloseTo(TILT_NEAR, 6)
    expect(degrees(tiltFor(150))).toBeGreaterThan(TILT_FAR)
    expect(degrees(tiltFor(150))).toBeLessThan(TILT_NEAR)
  })

  it('keeps the view on the map, within its distances, and above the ground under it', () => {
    expect(clampView({ x: 900, z: -900, dist: 5 }, 400, 250, 0)).toEqual({ x: 400, z: -250, dist: DIST_MIN })
    expect(clampView({ x: 0, z: 0, dist: 9000 }, 400, 250, 0).dist).toBe(DIST_MAX)
    // 20 km of raised ground under the target at the closest zoom: the camera stands 15 km above it
    const high = clampView({ x: 0, z: 0, dist: DIST_MIN }, 400, 250, 20)
    expect(high.dist * Math.cos(tiltFor(DIST_MIN))).toBeCloseTo(35, 6)
  })

  it('stands south of its target by the tilt, and a ray down its axis meets the target', () => {
    const view = { x: 10, z: 20, dist: 100 }
    const p = cameraPosition(view)
    expect(p[0]).toBe(10)
    expect(p[2]).toBeLessThan(20)
    const hit = groundHit(p, [view.x - p[0], -p[1], view.z - p[2]])!
    expect(hit[0]).toBeCloseTo(10, 9)
    expect(hit[1]).toBeCloseTo(20, 9)
    expect(groundHit(p, [0, 0.1, 1])).toBeNull()
  })
})

describe('the ground under a ray', () => {
  it('reads a grid bilinearly, held at its edge', () => {
    const at = (i: number, j: number) => i * 10 + j
    expect(bilinear(at, 1.5, 2.25, 4, 4)).toBeCloseTo(17.25, 9)
    expect(bilinear(at, -3, 0, 4, 4)).toBe(0)
    expect(bilinear(at, 9, 0, 4, 4)).toBeCloseTo(29.99, 9)
  })

  it('finds the first crossing of a steep wall, where a fixed point oscillates', () => {
    // a ray down at 45° along x; the ground a step of 1 km up at x = 10 (steeper than the ray)
    const rise = (x: number) => (x >= 10 ? 1 : 0)
    const hit = rayGround([0, 5, 0], [Math.SQRT1_2, -Math.SQRT1_2, 0], rise, 2, -0.1)!
    // from 5 km up it reaches the flat ground (0) at x = 5, before the wall
    expect(hit[0]).toBeCloseTo(5, 3)
    // a ray that is still 1 km up when it comes to the wall meets the wall's face there, not the ground behind it
    const over = rayGround([5, 5.5, 0], [Math.SQRT1_2, -Math.SQRT1_2, 0], rise, 2, -0.1)!
    expect(over[0]).toBeCloseTo(10, 2)
  })

  it('is none for a ray that does not go down, or that starts under the ground', () => {
    expect(rayGround([0, 5, 0], [1, 0, 0], () => 0, 2, -0.1)).toBeNull()
    expect(rayGround([0, 0.5, 0], [Math.SQRT1_2, -Math.SQRT1_2, 0], () => 1, 2, -0.1)).toBeNull()
  })
})
