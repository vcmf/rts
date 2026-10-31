// A map's window as look data (docs/plans/active/look-austerlitz-a1.md; the whole map's far ring, G3a; a moved tile,
// G3b): built by the compiler in Node (tools/build-look-data.ts) and, from G3b-3, by the look page's tile worker
// (src/look/tile-worker.ts) from the same map's layers. No file system here: the browser and Node both run it.
import { D, ROAD_SLOTS, footprintOf, macroFarNOf, ringFor, type Rect, type WorldGround } from '../spec.ts'
import { bakeLight, SUN } from '../../render/lit/bake.ts'
import {
  checkTileAt,
  encodeLook,
  moveLook,
  ROAD_SEG,
  type LightGrid,
  type LookData,
  type RoadGrid,
  type SpanGrid,
  type TileAt,
} from './data.ts'
import { COVER, LINES, segD, type CoverClass } from './cover.ts'
import type { Layers } from '../../map/apply.ts'
import { heightOf } from '../../map/apply.ts'
import type { MapFile } from '../../map/schema.ts'
import { noRiver } from '../river.ts'
import {
  boxCover,
  checkWindowInside,
  fineAreas,
  MAP_COVER_CELL,
  mapCover,
  mapRects,
  mapTrees,
  packTrees,
  wayLines,
  windowHeights,
} from './from-map.ts'
import type { LookWindow } from './windows.ts'
import { mapBuildings } from './map-buildings.ts'
import { standing, type Standing } from '../../render/lit/houses.ts'

type Pt = readonly [number, number]

// The roads (docs/plans/done/roads.md): every segment of every line, and a grid over the tile listing, per cell, the
// segments that reach within their half width and SPEC.road.reach m of it (the shader finds the nearest exactly, with
// no filtering: no ghost where two lines or two sides meet). Throws if a cell needs more than ROAD_SLOTS
/** The roads' segments and grid over the tile, of `lines` (the demo's LINES, or a window's ways). */
export function roadGrid(
  lines: readonly { pts: readonly Pt[]; w: number; cls: CoverClass; dusty?: boolean }[] = LINES,
): RoadGrid {
  const g = D.spec.road
  const n = D.roadN
  const cell = g.cell
  const x0 = -D.spec.tile / 2
  const z0 = x0
  const segs: number[] = []
  // the mitre tangents (the mean of the two segments' directions at a bend, the segment's own at a free end): the
  // shader reads the distance along between them, so it is continuous round a bend (no step at the bisector)
  lines.forEach((l, li) => {
    const p = l.pts
    const last = p.length - 2
    const dir = (k: number): Pt => {
      const dx = p[k + 1][0] - p[k][0]
      const dz = p[k + 1][1] - p[k][1]
      const m = Math.hypot(dx, dz)
      return [dx / m, dz / m]
    }
    const mitre = (u: Pt, v: Pt): Pt => {
      const m = Math.hypot(u[0] + v[0], u[1] + v[1])
      return [(u[0] + v[0]) / m, (u[1] + v[1]) / m]
    }
    let along = 0
    for (let k = 0; k <= last; k++) {
      const a = p[k]
      const b = p[k + 1]
      const u = dir(k)
      const m0 = k > 0 ? mitre(dir(k - 1), u) : u
      const m1 = k < last ? mitre(u, dir(k + 1)) : u
      segs.push(
        a[0],
        a[1],
        b[0],
        b[1],
        along,
        l.w / 2,
        li,
        (k === 0 ? 1 : 0) + (k === last ? 2 : 0) + (l.cls === COVER.track ? 4 : 0) + (l.dusty ? 8 : 0),
        m0[0],
        m0[1],
        m1[0],
        m1[1],
      )
      along += Math.hypot(b[0] - a[0], b[1] - a[1])
    }
  })
  const ids = new Float32Array(n * n * ROAD_SLOTS).fill(-1)
  const used = new Uint8Array(n * n)
  for (let s = 0; s < segs.length / ROAD_SEG; s++) {
    const [ax, az, bx, bz, , hw] = segs.slice(s * ROAD_SEG, s * ROAD_SEG + 6)
    const r = hw + g.reach + cell * 0.71
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - x0) / cell))
    const i1 = Math.min(n - 1, Math.floor((Math.max(ax, bx) + r - x0) / cell))
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - z0) / cell))
    const j1 = Math.min(n - 1, Math.floor((Math.max(az, bz) + r - z0) / cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * cell
        const cz = z0 + (j + 0.5) * cell
        if (segD(cx, cz, [ax, az], [bx, bz]) > r) continue
        const o = j * n + i
        if (used[o] >= ROAD_SLOTS) {
          throw new Error(
            `roads: the cell at ${cx}, ${cz} needs more than ${ROAD_SLOTS} segments (raise ROAD_SLOTS, or shrink the cell)`,
          )
        }
        ids[o * ROAD_SLOTS + used[o]++] = s
      }
    }
  }
  // only the segments a cell lists (the lines run far past the tile), renumbered
  const keep = [...new Set(Array.from(ids).filter(v => v >= 0))].sort((a, b) => a - b)
  const map = new Map(keep.map((v, k) => [v, k]))
  for (let k = 0; k < ids.length; k++) if (ids[k] >= 0) ids[k] = map.get(ids[k])!
  const out = new Float32Array(keep.length * ROAD_SEG)
  keep.forEach((v, k) => out.set(segs.slice(v * ROAD_SEG, (v + 1) * ROAD_SEG), k * ROAD_SEG))
  if ((keep.length * ROAD_SEG) / 4 > D.spec.minSpec.maxTexture) {
    throw new Error(
      `roads: ${keep.length} segments on the tile, over the min-spec's ${(D.spec.minSpec.maxTexture * 4) / ROAD_SEG}`,
    )
  }
  return { segs: out, n, cell, x0, z0, ids }
}

/** A span grid over the tile with nothing in it (`n`² texels of `cell` m, `ch` bytes a texel): no water, no banks. */
const emptySpans = (n: number, cell: number, ch: number): SpanGrid => ({
  n,
  cell,
  x0: -D.spec.tile / 2,
  z0: -D.spec.tile / 2,
  ch,
  spans: new Float32Array(0),
  tex: new Uint8Array(0),
})

/**
 * A map's window as look data (src/look/world/from-map.ts): its heights, cover, roads and trees from the map's layers;
 * no river, water or bank normals yet (the plan's PR c). Its far ring is the whole map (G3a,
 * docs/plans/done/g3a-the-whole-map-far.md): the play area and the camera's widest footprint past it (on the map's
 * whole range of heights, a bound), its own cover at the far bake's texels, and the map's coarse light (bakeLight on
 * its true heights, the look's sun). `map`: the expanded map; `L`: its layers. Encoded (buildWindowData), or not
 * (windowData: the tile worker derives a moved tile's per-frame cover and flow from it, G3c).
 */
export function buildWindowData(
  win: LookWindow,
  map: MapFile,
  L: Layers,
  mapLight = coarseLight(L),
  tileAt: TileAt = [0, 0],
): Uint8Array {
  return encodeLook(windowData(win, map, L, mapLight, tileAt))
}
/** A map's standing buildings (the staff map's rule: standing), in map metres: once a map (the tile worker keeps them;
 *  each tile's build takes them as `built`) */
export function standingOf(map: MapFile, L: Layers): Standing[] {
  return standing(map.features, L.table, L.built, { x0: L.x0, z0: L.z0, cell: L.cell, nx: L.nx, nz: L.nz })
}
/** A window's look data (not encoded): its tile at `tileAt` (map metres), the far ring, the light; `built`, the map's
 *  standing buildings if found already (standingOf: the worker finds them once a map) */
export function windowData(
  win: LookWindow,
  map: MapFile,
  L: Layers,
  mapLight = coarseLight(L),
  tileAt: TileAt = [0, 0],
  built?: readonly Standing[],
): LookData {
  const s = D.spec
  checkTileAt(tileAt, s.tileStep)
  // the tile's centre in map metres: the window is built about it, in its frame, then moved into the window's (G3b)
  const at = { ...win, x: win.x + tileAt[0], z: win.z + tileAt[1] }
  checkWindowInside(L, at, s.tile)
  const { play, edge } = mapRects(L, map.play, at)
  const ring = ringFor(D, play, Math.ceil(footprintOf(s, groundBound(L, play))) + D.farCell)
  const heightAt = (x: number, z: number) => heightOf(L, x, z)
  // the window's height base (its own tile's and ring's lowest node): every tile of the window keeps it
  const winBase = tileAt[0] || tileAt[1] ? windowBase(win, map, L, s) : undefined
  const { hf, far, base } = windowHeights(heightAt, at, D, ring, winBase)
  const side = (ring.n - 1) * ring.cell
  const farCover = boxCover(L, map.features, at, { x0: ring.x0, z0: ring.z0, side }, side / macroFarNOf(D, side))
  const lines = wayLines(map.features, L.table, at, s.far)
  const areas = fineAreas(L, map.features, at, s.far, MAP_COVER_CELL)
  const data: LookData = {
    hf,
    far,
    river: noRiver(),
    bank: emptySpans(D.bankN, s.bank.texel, 3),
    water: emptySpans(D.waterN, s.water.texel, 4),
    roads: roadGrid(lines),
    cover: mapCover(areas, L.table, at, lines),
    world: { kind: 'map', map: win.map, window: win.name, x: win.x, z: win.z, base, play, edge },
    trees: packTrees(mapTrees(L, areas, at)),
    // (the map's standing buildings on the tile, as the page's models: G3d)
    buildings: mapBuildings(built ?? standingOf(map, L), at, s.tile / 2, lines),
    farCover,
    light: { ...mapLight, x0: L.x0 - at.x, z0: L.z0 - at.z },
    tileAt: [0, 0],
  }
  return moveLook(data, tileAt)
}

/** The height base of a window's own build (windowHeights at its centre, over its ring): the lowest node. */
function windowBase(win: LookWindow, map: MapFile, L: Layers, s: typeof D.spec): number {
  const { play } = mapRects(L, map.play, win)
  const ring = ringFor(D, play, Math.ceil(footprintOf(s, groundBound(L, play))) + D.farCell)
  return windowHeights((x, z) => heightOf(L, x, z), win, D, ring).base
}

/** The camera's ground on a map, bounded: its whole range of heights, the focus anywhere in it (footprintOf) */
function groundBound(L: Layers, play: Rect): WorldGround {
  let lo = Infinity
  let hi = -Infinity
  for (const v of L.height) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return { lo, hi, farLo: lo, focus: [lo, hi], play, ring: play }
}

/** A map's coarse light (G3a, decision 0092): bakeLight on its true heights under the staff map's sun, at its nodes,
 *  the sun's soft shadow and the open sky (its corner the layers', in map metres; each window moves it to its own). */
export function coarseLight(L: Layers): LightGrid {
  const b = bakeLight(L.height, L.nx + 1, L.nz + 1, L.cell, SUN, 1, 1)
  const rg = new Uint8Array(b.nx * b.nz * 2)
  for (let k = 0; k < b.nx * b.nz; k++) {
    rg[k * 2] = b.data[k * 4]
    rg[k * 2 + 1] = b.data[k * 4 + 1]
  }
  return { nx: b.nx, nz: b.nz, cell: L.cell, x0: L.x0, z0: L.z0, rg }
}
