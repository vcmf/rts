// The meadow near the camera (docs/plans/done/l5c-meadow.md): clumps of the owner's pack grass (Grass_Large and
// Grass_Small, data/meadow-grass.json) on three round rings around the camera's focus, cells of 0.5, 1 and 2 m. Each
// ring is an instanced mesh with one static slot attribute (forcedInstanceCount: no matrices); the vertex shader
// (shaders/meadow.vert) snaps the ring to its cell, places a clump from its world cell's hash, reads the meadow map
// (the ground's height and the growth, baked here once) and the clump field (shaders/meadow.glsl), and fades each clump
// out across its ring's band of distance, so the rings hand over without an edge. Where nothing grows, or beyond the
// outer ring, the ground's own pattern (groundAt, MEADOW) carries the meadow.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { FromHalfFloat, ToHalfFloat } from '@babylonjs/core/Misc/textureTools.js'
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { heightAt } from './heightfield.ts'
import { D } from './spec.ts'
import { MEADOW_LOOK, type MeadowLook } from './meadow-look.ts'
import { type DetailRing, type GrassDetail, ringBands, ringBandsOf, ringsFor, slotBand } from './grass-detail.ts'
import { type ClumpSource, clumpRadius, indexClump, thinClump } from './meadow-clump.ts'
import {
  CLUMP_REACH,
  CROP_WIDE,
  grassDefinesForClumps,
  RINGS,
  type Ring,
  GREEN_HEIGHT,
  HEIGHT,
  HEIGHT_MAX,
  MEADOW_SINK,
  STUBBLE_HEIGHT,
  WHEAT_HEIGHT_MAX,
} from './meadow-spec.ts'
export { HEIGHT, HEIGHT_MAX }
import GRASS from '../../data/meadow-grass.json?raw'
import MEADOW_VS from './shaders/meadow.vert?raw'
import MEADOW_FS from './shaders/meadow.frag?raw'
import MEADOW_GLSL from './shaders/meadow.glsl?raw'

const TILE_W = D.spec.tile
// the meadow map: 1 m texels over the tile
const MAP_N = Math.round(TILE_W)

// the camera's radius over which the inner rings give way to the outer one (m): the default view is 125, the widest 260
const WIDE: [number, number] = [150, 200] // (buildMeadow's wide: false, ?nowide, keeps the rings as before: the A/B)
// a crop's clump (docs/plans/done/crop-depth.md): CROP_WIDE (src/look/meadow-spec.ts) times the grass clump's spread at
// the root, its fan undone: the grass clumps' blades spread about 1 + CROP_FAN aV up their height (measured from
// data/meadow-grass.json: Large 0.31, 0.43, 0.58 at aV 0, 0.4, 0.8; Small 0.25, 0.34, 0.50), so the stalks stand
// parallel (the upright grass undoes part of it too: GrassUp.fanUndo)
const CROP_FAN = 1.15
export { RINGS, type Ring }

// a ring's chunk: its slots' range on the ring's square, and its slots (the hole's apart: drawn only zoomed out)
interface Chunk {
  i0: number
  i1: number
  j0: number
  j1: number
  slots: Float32Array
  hole: Float32Array
  key?: number // (a world ring's chunk: its key in the world's grid)
}
const CHUNKS = 8
// (the near ring's: 2 m chunks, so at the grass detail's Balanced its cull stops near the cut, not 6.5 m past it)
const CHUNKS_NEAR = 26
// a world ring's chunks (the grass detail's cut and crop rings, src/look/grass-detail.ts): WORLD_CHUNK cells a side,
// keyed by their place in the world's grid (WORLD_KEYS a row, the grid offset by half of it)
const WORLD_CHUNK = 4
const WORLD_KEYS = 1 << 14
/** A world ring: its slots the world's cells where its kind grows, not a square around the focus */
const isWorld = (r: DetailRing) => r.kind === 'cut' || r.kind === 'crop'
// the chunks of a ring to draw (index × 2, + 1 for its hole slots): their square on the ground (the slots' cells, the
// roots' jitter and a clump's reach) against the band (b: in from x to y, out from z to w) and the view (vp, the
// view-projection's column-major array: this frame's), the ground from 20 m under to 20 m over the focus height y, as
// the vertex shader's own cull tests each clump, with its 1.15 margin; into keep (reused: nothing allocated a frame)
function cullRing(
  r: Ring,
  ch: Chunk[],
  o: Vector2,
  c: Vector2,
  y: number,
  b: Vector4,
  vp: ArrayLike<number>,
  holes: boolean,
  reach: number,
  keep: number[],
): void {
  keep.length = 0
  const pad = r.cell * 2.2 + reach
  for (let idx = 0; idx < ch.length; idx++) {
    const k = ch[idx]
    const x0 = o.x + k.i0 * r.cell - pad
    const x1 = o.x + k.i1 * r.cell + pad
    const z0 = o.y + k.j0 * r.cell - pad
    const z1 = o.y + k.j1 * r.cell + pad
    // the nearest and farthest distance from the focus to the square, against the band
    const near = Math.hypot(Math.max(x0 - c.x, 0, c.x - x1), Math.max(z0 - c.y, 0, c.y - z1))
    const far = Math.hypot(
      Math.max(Math.abs(x0 - c.x), Math.abs(x1 - c.x)),
      Math.max(Math.abs(z0 - c.y), Math.abs(z1 - c.y)),
    )
    if (near > b.w || (b.y > 0 && far < b.x)) continue
    // all eight corners past one edge of the frame: out of view
    let ox = 0
    let oX = 0
    let oy = 0
    let oY = 0
    let ow = 0
    for (let q = 0; q < 8; q++) {
      const px = q & 1 ? x1 : x0
      const pz = q & 2 ? z1 : z0
      const py = q & 4 ? y + 20 : y - 20
      const cx = vp[0] * px + vp[4] * py + vp[8] * pz + vp[12]
      const cy = vp[1] * px + vp[5] * py + vp[9] * pz + vp[13]
      const cw = vp[3] * px + vp[7] * py + vp[11] * pz + vp[15]
      if (cx > cw * 1.15) ox++
      if (cx < -cw * 1.15) oX++
      if (cy > cw * 1.15) oy++
      if (cy < -cw * 1.15) oY++
      if (cw < 0) ow++
    }
    if (ox === 8 || oX === 8 || oy === 8 || oY === 8 || ow === 8) continue
    if (k.slots.length) keep.push(idx * 2)
    if (holes && k.hole.length) keep.push(idx * 2 + 1)
  }
}
// two lists of chunks the same
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])

// the meadow map (buildMeadowMap): R the ground's height, G the grass's growth, B its
// height factor, A the crops' growth
export interface MeadowMap {
  map: RawTexture
  growingCells: number
  croppingCells: number
  ms: number
  growthAt(x: number, z: number): number
  cropAt(x: number, z: number): number
  groundAt(x: number, z: number): number
}
export interface Meadow {
  meshes: Mesh[]
  setOn(on: boolean): void
  /** the player's grass detail (src/look/grass-detail.ts), applied from the next frame: the rings of both levels are
   * built, a level only sets what each draws */
  setDetail(level: GrassDetail): void
  bakeMs: number
  // the ground's dark under-layer (shore.glsl, MEADOW_UNDER) on these materials: the meadow map, and each frame its
  // reach and strength (off while the meadow is off or hidden: underOn)
  under(ms: ShaderMaterial[]): void
  underOn(on: boolean): void
  reach: number // how far a grass clump reaches from its root, m (the checks: tools/river-check.js)
  growingCells: number // texels of the meadow map where grass grows
  growthAt(x: number, z: number): number // the growth at a point as the GPU reads it (the checks: tools/river-check.js)
  // the ground's height the grass stands on, as the GPU reads it (tools/look-check.js)
  groundAt(x: number, z: number): number
  cropAt(x: number, z: number): number // the crops' growth at a point as the GPU reads it (the checks)
  croppingCells: number // texels where a crop grows
}

// a bilinear blend of at(i, j) at the grid point (u, v)
const bilerp = (at: (i: number, j: number) => number, u: number, v: number) => {
  const i = Math.floor(u)
  const j = Math.floor(v)
  const fu = u - i
  const fv = v - j
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv
}

// growth(x, z): how much grass grows at a point (0..1, by the cover and its edges) and its height factor; allowed(x,
// z): the placement rule's hard edges at any point; crop(x, z): a sown field there, 0 or 1 (src/look/nature.ts)
// allowedCrop: the crops' rule (the grass's by default: a combed clump reaches farther than a crop's, which neither
// widens nor leans). Built before the ground's bake: the combed meadow's bake reads it (src/look/macro.ts)
export function buildMeadowMap(
  scene: Scene,
  mats: Materials,
  growth: (x: number, z: number) => [number, number],
  allowed: (x: number, z: number) => boolean,
  crop: (x: number, z: number) => number,
  allowedCrop = allowed,
): MeadowMap {
  const t0 = performance.now()
  // the meadow map: R the ground's height, G the growth, B the height factor (half floats, filtered by the GPU). The
  // cover's growth on its 2 m grid, each texel interpolating the cells round it (the edge follows no grid); then the
  // rules at the texel itself (the cover's edge, the formation zones, the banks) zero it; then the growing area
  // shrinks by a texel, so the GPU's bilinear read, which blends a texel with its neighbours, never carries grass
  // across a rule (between the last growing texel and a zero one it stays inside the allowed ground)
  const G = MAP_N / 2
  // the 2 m cells: f at each cell's centre
  const cellGrid = (f: (x: number, z: number) => number) => {
    const a = new Float32Array(G * G)
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) a[j * G + i] = f((i + 0.5) * 2 - TILE_W / 2, (j + 0.5) * 2 - TILE_W / 2)
    }
    return a
  }
  const atCell = (a: Float32Array, i: number, j: number) =>
    a[Math.min(G - 1, Math.max(0, j)) * G + Math.min(G - 1, Math.max(0, i))]
  const sampler = (a: Float32Array) => (i: number, j: number) => atCell(a, i, j)
  // the hard rules at the 2 m cells' centres too: a texel whose four cells agree takes their answer, and only a texel
  // near a rule's edge (its cells disagree) is tested itself (a few in a hundred: the bake's time)
  const okGrass = cellGrid((x, z) => (allowed(x, z) ? 1 : 0))
  const okCrop = allowedCrop === allowed ? okGrass : cellGrid((x, z) => (allowedCrop(x, z) ? 1 : 0))
  // the grass's growth and height factor from one growth() call a cell
  const gCell = new Float32Array(G * G)
  const hCell = new Float32Array(G * G)
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      ;[gCell[j * G + i], hCell[j * G + i]] = growth((i + 0.5) * 2 - TILE_W / 2, (j + 0.5) * 2 - TILE_W / 2)
    }
  }
  const cCell = cellGrid((x, z) => crop(x, z))
  // one growth channel (the grass's by growth(), the crops' by crop()), each texel interpolating its cells, zeroed by
  // the cover's edge and the rules at the texel, then shrunk a texel against the GPU's blend
  const channel = (
    cell: Float32Array,
    cover: (x: number, z: number) => number,
    okCell: Float32Array,
    ruleAt: (x: number, z: number) => boolean,
  ): { g: Float32Array; count: number } => {
    const raw = new Float32Array(MAP_N * MAP_N)
    const at = sampler(cell)
    for (let j = 0; j < MAP_N; j++) {
      for (let i = 0; i < MAP_N; i++) {
        const x = i + 0.5 - TILE_W / 2
        const z = j + 0.5 - TILE_W / 2
        const k = j * MAP_N + i
        const gu = (i + 0.5) / 2 - 0.5
        const gv = (j + 0.5) / 2 - 0.5
        const i0 = Math.floor(gu)
        const j0 = Math.floor(gv)
        const d = bilerp(at, gu, gv)
        if (d <= 0) continue
        const c00 = atCell(cell, i0, j0)
        const c10 = atCell(cell, i0 + 1, j0)
        const c01 = atCell(cell, i0, j0 + 1)
        const c11 = atCell(cell, i0 + 1, j0 + 1)
        const ok =
          atCell(okCell, i0, j0) +
          atCell(okCell, i0 + 1, j0) +
          atCell(okCell, i0, j0 + 1) +
          atCell(okCell, i0 + 1, j0 + 1)
        const coverOk = (c00 > 0 && c10 > 0 && c01 > 0 && c11 > 0) || cover(x, z) > 0
        const ruleOk = ok === 4 ? true : ok === 0 ? false : ruleAt(x, z)
        raw[k] = coverOk && ruleOk ? d : 0
      }
    }
    const g = new Float32Array(MAP_N * MAP_N)
    let count = 0
    for (let j = 0; j < MAP_N; j++) {
      for (let i = 0; i < MAP_N; i++) {
        const k = j * MAP_N + i
        let d = raw[k]
        for (let dj = -1; dj <= 1 && d > 0; dj++) {
          for (let di = -1; di <= 1; di++) {
            const a = i + di
            const b = j + dj
            if (a >= 0 && b >= 0 && a < MAP_N && b < MAP_N && raw[b * MAP_N + a] <= 0) {
              d = 0
              break
            }
          }
        }
        g[k] = d
        if (d > 0) count++
      }
    }
    return { g, count }
  }
  const grass = channel(gCell, (x, z) => growth(x, z)[0], okGrass, allowed)
  const crops = channel(cCell, crop, okCrop, allowedCrop)
  const g = grass.g
  const growingCells = grass.count
  // the meadow map: R the ground's height, G the grass's growth, B the grass's height factor, A the crops' growth
  // (half floats, filtered by the GPU)
  const data = new Uint16Array(MAP_N * MAP_N * 4)
  const hAtCell = sampler(hCell)
  for (let j = 0; j < MAP_N; j++) {
    for (let i = 0; i < MAP_N; i++) {
      const k = j * MAP_N + i
      const hf = bilerp(hAtCell, (i + 0.5) / 2 - 0.5, (j + 0.5) / 2 - 0.5)
      data[k * 4] = ToHalfFloat(heightAt(i + 0.5 - TILE_W / 2, j + 0.5 - TILE_W / 2))
      data[k * 4 + 1] = ToHalfFloat(g[k])
      data[k * 4 + 2] = ToHalfFloat(hf)
      data[k * 4 + 3] = ToHalfFloat(crops.g[k])
    }
  }
  const map = new RawTexture(
    data,
    MAP_N,
    MAP_N,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_HALF_FLOAT,
  )
  map.wrapU = map.wrapV = Texture.CLAMP_ADDRESSMODE
  // every painted material reads it under ?grass=flow (groundAt, src/look/shaders/macro.glsl): the comb only where
  // grass grows (the ground's under-layer, below, binds it to the terrain and the water too)
  mats.bindAll(m => m.setTexture('uMeadow', map))
  // the growth as the GPU reads it (bilinear over the texel centres), for the checks: anything it gives above 0 is
  // grass, or a crop, the shader may grow
  const bilinear = (a: Float32Array) => (x: number, z: number) => {
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= MAP_N || j >= MAP_N ? 0 : a[j * MAP_N + i])
    return bilerp(at, x + TILE_W / 2 - 0.5, z + TILE_W / 2 - 0.5)
  }
  const growthAt = bilinear(g)
  const cropAt = bilinear(crops.g)
  const hAt = (i: number, j: number) =>
    heightAt(
      Math.min(MAP_N - 1, Math.max(0, i)) + 0.5 - TILE_W / 2,
      Math.min(MAP_N - 1, Math.max(0, j)) + 0.5 - TILE_W / 2,
    )
  // the half floats' rounding included
  const groundAtMap = (x: number, z: number) =>
    bilerp((a, b) => FromHalfFloat(ToHalfFloat(hAt(a, b))), x + TILE_W / 2 - 0.5, z + TILE_W / 2 - 0.5)
  return {
    map,
    growingCells,
    growthAt,
    cropAt,
    croppingCells: crops.count,
    groundAt: groundAtMap,
    ms: performance.now() - t0,
  }
}

// mm: the meadow map (buildMeadowMap); reach: the grass clumps' (CLUMP_REACH, or the combed
// meadow's), for the chunks' cull
export function buildMeadow(
  scene: Scene,
  mats: Materials,
  camera: ArcRotateCamera,
  mm: MeadowMap,
  wide = true,
  reach = CLUMP_REACH,
  look: MeadowLook = MEADOW_LOOK,
  detail: GrassDetail = 'full',
): Meadow {
  const t0 = performance.now()
  const { map, growingCells, growthAt, cropAt, groundAt: groundAtMap } = mm

  // the clumps, indexed (the export is a triangle list: src/look/meadow-clump.ts): the large near, the small (fewer
  // vertices) farther
  const src = JSON.parse(GRASS) as Record<string, ClumpSource>
  const clumps = { Grass_Large: indexClump(src.Grass_Large), Grass_Small: indexClump(src.Grass_Small) }
  // the rings of both grass detail levels (src/look/grass-detail.ts): main's, the near one cut in two, the cut ring's
  // small clump thinned (drawn at Balanced only)
  const thinSmall = thinClump(clumps.Grass_Small)
  const rings = ringsFor(clumpRadius(thinSmall))
  let level = detail

  // a world ring's reach from the focus (its band's edge, a clump's reach and the cell's margin, as cullRing pads it),
  // and the most of its chunks a side that reach can touch
  const worldReach = (r: DetailRing) => slotBand(r)[3] + reach + 2.2 * r.cell
  const worldSpan = (r: DetailRing) => Math.ceil((2 * worldReach(r)) / (WORLD_CHUNK * r.cell)) + 1
  // a world ring's chunks, made as the focus first nears them (the meadow map is static): the cells where its kind
  // grows at any corner (the GPU's bilinear read, within one texel's patch as a 0.5 m cell lies, is greatest at a
  // corner), so an empty cell costs nothing
  const worldCache = new Map<number, Map<number, Chunk>>()
  const worldCand = new Map<number, Chunk[]>()
  const worldChunk = (r: DetailRing, ci: number, cj: number, key: number): Chunk => {
    const at = r.kind === 'crop' ? cropAt : growthAt
    const sl: number[] = []
    const i0 = ci * WORLD_CHUNK
    const j0 = cj * WORLD_CHUNK
    for (let j = j0; j < j0 + WORLD_CHUNK; j++) {
      for (let i = i0; i < i0 + WORLD_CHUNK; i++) {
        const x = i * r.cell
        const z = j * r.cell
        const c = r.cell
        if (at(x, z) > 0 || at(x + c, z) > 0 || at(x, z + c) > 0 || at(x + c, z + c) > 0) sl.push(i, j)
      }
    }
    const none = new Float32Array(0)
    return { i0, i1: i0 + WORLD_CHUNK, j0, j1: j0 + WORLD_CHUNK, slots: new Float32Array(sl), hole: none, key }
  }
  // a world ring's chunks within its reach of the focus (the list reused: nothing allocated a frame once made)
  const worldChunks = (ri: number): Chunk[] => {
    const r = rings[ri]
    const cs = WORLD_CHUNK * r.cell
    const R = worldReach(r)
    let cache = worldCache.get(ri)
    if (!cache) worldCache.set(ri, (cache = new Map()))
    let out = worldCand.get(ri)
    if (!out) worldCand.set(ri, (out = []))
    out.length = 0
    for (let cj = Math.floor((centre.y - R) / cs); cj <= Math.floor((centre.y + R) / cs); cj++) {
      for (let ci = Math.floor((centre.x - R) / cs); ci <= Math.floor((centre.x + R) / cs); ci++) {
        const key = (cj + WORLD_KEYS / 2) * WORLD_KEYS + ci + WORLD_KEYS / 2
        let c = cache.get(key)
        if (!c) cache.set(key, (c = worldChunk(r, ci, cj, key)))
        out.push(c)
      }
    }
    return out
  }

  const meshes: Mesh[] = []
  const ringMats: ShaderMaterial[] = []
  const chunks: Chunk[][] = []
  const slotBufs: Float32Array[] = []
  const slotVBs: VertexBuffer[] = []
  const drawn: number[][] = rings.map(() => [-1])
  const keep: number[] = []
  rings.forEach((r, ri) => {
    const m = mats.make(
      `meadow${ri}`,
      MEADOW_VS.replace('#include<meadow>', () => MEADOW_GLSL),
      MEADOW_FS,
      {
        attributes: ['position', 'normal', 'aV', 'aSlot'],
        uniforms: ['uOrigin', 'uCentre', 'uCentreY', 'uCell', 'uSpread', 'uHeight', 'uBand', 'uBandMix', 'uRing'],
        samplers: ['uMeadow', 'uGB'],
        defines: [
          ...grassDefinesForClumps(look.up),
          '#define GROUND_BOUNCE',
          `#define MEADOW_N ${MAP_N.toFixed(1)}`,
          `#define HEIGHT_MAX ${HEIGHT_MAX.toFixed(2)}`,
          `#define MEADOW_SINK ${MEADOW_SINK.toFixed(3)}`,
          `#define WHEAT_HEIGHT_MAX ${WHEAT_HEIGHT_MAX.toFixed(2)}`,
          `#define CROP_FAN ${CROP_FAN.toFixed(2)}`,
          `#define CROP_WIDE ${CROP_WIDE.toFixed(2)}`,
          `#define STUBBLE_HEIGHT ${STUBBLE_HEIGHT.toFixed(3)}`,
          `#define GREEN_HEIGHT ${GREEN_HEIGHT.toFixed(3)}`,
        ],
      },
    )
    const c = r.kind === 'cut' ? thinSmall : clumps[r.clump]
    m.backFaceCulling = false
    m.setTexture('uMeadow', map)
    m.setFloat('uCell', r.cell)
    // the footprint by the ring (its spread, against the clump's own proportions), the height the same on every ring
    m.setFloat('uSpread', (r.spread * c.top) / HEIGHT)
    m.setFloat('uHeight', HEIGHT)
    // the name keeps it out of the sun's shadow pass (src/look/bakes.ts)
    const mesh = new Mesh(`meadowGrass${ri}`, scene)
    mesh.setVerticesData(VertexBuffer.PositionKind, c.pos)
    mesh.setVerticesData(VertexBuffer.NormalKind, c.nrm)
    mesh.setVerticesData('aV', c.vv, false, 1)
    mesh.setIndices(c.idx)
    // the slots a round ring can reach (the ring snaps by up to a cell on each axis and the root jitters by up to a
    // cell, so 2.2 cells of margin, the diagonal's): the corners
    // of the square and the hole the inner ring fills are left out (but not the outer ring's: zoomed out it covers
    // the hole, WIDE)
    // (the outer ring's hole slots last: drawn only while the hole is being covered, holeFrom on)
    // the slots by chunk (CHUNKS × CHUNKS of the ring's square), so the frame draws only the chunks in view and in the
    // band (cullRing, below): a slot culled by the vertex shader still costs its every vertex (the clump's 58 to 108)
    const outer = ri === rings.length - 1
    // (its widest band at any level and zoom: slotBand)
    const sb = slotBand(r)
    const ch: Chunk[] = []
    // (a world ring's chunks are the world's, made as the focus nears them: worldChunks, below)
    const nc = isWorld(r) ? 0 : r.kind === 'near' ? CHUNKS_NEAR : CHUNKS
    for (let cj = 0; cj < nc; cj++) {
      for (let ci = 0; ci < nc; ci++) {
        const i0 = Math.floor((ci * r.n) / nc)
        const i1 = Math.floor(((ci + 1) * r.n) / nc)
        const j0 = Math.floor((cj * r.n) / nc)
        const j1 = Math.floor(((cj + 1) * r.n) / nc)
        const sl: number[] = []
        const hole: number[] = []
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const d = Math.hypot((i + 0.5 - r.n / 2) * r.cell, (j + 0.5 - r.n / 2) * r.cell)
            if (d > sb[3] + 2.2 * r.cell) continue
            if (sb[1] <= 0 || d >= sb[0] - 2.2 * r.cell) sl.push(i, j)
            else if (outer && wide) hole.push(i, j)
          }
        }
        if (sl.length || hole.length) {
          ch.push({ i0, i1, j0, j1, slots: new Float32Array(sl), hole: new Float32Array(hole) })
        }
      }
    }
    chunks.push(ch)
    // the buffer starts with every slot of the ring (the hole's after), the frame's cull packs it from the first frame
    // (a world ring's buffer holds every cell of the chunks it can draw at once: worldSpan² of them)
    const buf = new Float32Array(
      isWorld(r)
        ? worldSpan(r) ** 2 * WORLD_CHUNK ** 2 * 2
        : ch.reduce((a, c) => a + c.slots.length + c.hole.length, 0),
    )
    slotBufs.push(buf)
    let n0 = 0
    for (const c of ch) {
      buf.set(c.slots, n0)
      n0 += c.slots.length
    }
    const vb = new VertexBuffer(scene.getEngine(), buf, 'aSlot', true, false, 2, true)
    slotVBs.push(vb)
    mesh.setVerticesBuffer(vb)
    mesh.forcedInstanceCount = n0 / 2
    mesh.alwaysSelectAsActiveMesh = true
    mesh.isPickable = false
    mesh.material = m
    meshes.push(mesh)
    ringMats.push(m)
  })
  // each frame each ring snaps to its cell around the camera's focus; a material keeps the vector it is given (not a
  // copy), so the vectors are set once and changed in place
  const origins = rings.map(() => new Vector2())
  const centre = new Vector2()
  rings.forEach((_, ri) => {
    ringMats[ri].setVector2('uOrigin', origins[ri])
    ringMats[ri].setVector2('uCentre', centre)
  })
  // zoomed out (docs/plans/done/wide-perf.md): from WIDE[0] to WIDE[1] m of the camera's radius the inner rings'
  // bands shrink to the focus and the outer ring's grows in to it, so at the widest zoom only the outer ring (2 m
  // cells, larger clumps: a clump is a few pixels there) is drawn; the clumps fade as the bands move (no pop)
  const under = new Vector3(0, 0, 0)
  const outer = rings[rings.length - 1].band
  let underOn = true
  let meadowOn = true
  // each ring's bands this frame (the grass detail's, ringBands, scaled for the zoom out) as meadow.vert reads them,
  // what it draws (uRing: grass, crops, the hash flipped), and the band its chunks are culled to
  const bands = rings.map(r => new Vector4(...r.band))
  const mixes = rings.map(() => new Vector4(0, 0, 0, 1))
  const kinds = rings.map(() => new Vector3(1, 1, 0))
  const cullBands = rings.map(() => new Vector4())
  const rb = rings.map(ringBandsOf)
  rings.forEach((_, ri) => {
    ringMats[ri].setVector4('uBand', bands[ri])
    ringMats[ri].setVector4('uBandMix', mixes[ri])
    ringMats[ri].setVector3('uRing', kinds[ri])
  })
  scene.onBeforeRenderObservable.add(() => {
    const t = wide ? Math.min(1, Math.max(0, (camera.radius - WIDE[0]) / (WIDE[1] - WIDE[0]))) : 0
    const k = 1 - t * t * (3 - 2 * t)
    under.z = underOn && meadowOn ? k : 0
    rings.forEach((r, ri) => {
      const outer = ri === rings.length - 1
      const q = rb[ri]
      ringBands(r, level, camera.radius, q)
      // (zoomed out every edge shrinks to the focus by k but the outer ring's edge out, as before)
      const ko = outer ? 1 : k
      bands[ri].set(q.band[0] * k, q.band[1] * k, q.band[2] * ko, q.band[3] * ko)
      mixes[ri].set(q.mix[0] * ko, q.mix[1] * ko, q.mix[2], q.mix[3])
      kinds[ri].set(q.grass, q.crop, q.flip)
      const cb = cullBands[ri].set(q.cull[0] * k, q.cull[1] * k, q.cull[2] * ko, q.cull[3] * ko)
      meshes[ri].isVisible = cb.w > 0 // (visibility: the page's own switches set enabled)
    })
    const f = camera.target
    const y = heightAt(f.x, f.z)
    centre.set(f.x, f.z)
    rings.forEach((r, ri) => {
      // (a world ring's slots are world cells: its origin stays at 0)
      if (!isWorld(r)) {
        origins[ri].set((Math.floor(f.x / r.cell) - r.n / 2) * r.cell, (Math.floor(f.z / r.cell) - r.n / 2) * r.cell)
      }
      ringMats[ri].setFloat('uCentreY', y)
    })
    focusY = y
    holes = t > 0
  })
  // the chunks in view and in the band, their slots packed at the buffer's start (copied only when the set changes),
  // once the camera's view-projection is this frame's (just before its render; the render targets' cameras skipped)
  let focusY = 0
  let holes = false
  scene.onBeforeCameraRenderObservable.add(cam => {
    if (cam !== camera) return
    const vp = scene.getTransformMatrix().m
    rings.forEach((r, ri) => {
      if (!meshes[ri].isVisible) return
      // (a world ring: its chunks near the focus, made as they are first needed)
      const world = isWorld(r)
      const ch = world ? worldChunks(ri) : chunks[ri]
      cullRing(r, ch, origins[ri], centre, focusY, cullBands[ri], vp, holes, reach, keep)
      // (none in view: not drawn, a forced count of 0 would draw one clump without
      // instances, in another shader variant)
      // (a world ring's drawn set by its chunks' keys in the world's grid: its candidates change with the focus)
      if (world) for (let i = 0; i < keep.length; i++) keep[i] = ch[keep[i] >> 1].key! * 2
      meshes[ri].isVisible = keep.length > 0
      if (sameList(keep, drawn[ri])) return
      drawn[ri] = keep.slice()
      const buf = slotBufs[ri]
      let n = 0
      for (const k of keep) {
        const c = world ? worldCache.get(ri)!.get(k >> 1)! : chunks[ri][k >> 1]
        const part = k & 1 ? c.hole : c.slots
        buf.set(part, n)
        n += part.length
      }
      // (the whole buffer: Babylon keeps what it is given to rebuild a lost context)
      slotVBs[ri].updateDirectly(buf, 0)
      meshes[ri].forcedInstanceCount = n / 2
    })
  })
  // the under-layer's reach: the outer ring's band; its strength: the inner rings' (k, set with them below: zoomed out,
  // where only the outer ring's sparse clumps stand, the field reads as it did)
  under.set(outer[2], outer[3], 1)
  // (under() sets the reach on the given materials; the map itself, uMeadow, is bound on every painted material above)
  return {
    meshes,
    setDetail: l => {
      level = l
    },
    setOn: on => {
      meadowOn = on
      for (const m of meshes) m.setEnabled(on)
    },
    under: ms => {
      for (const u of ms) u.setVector3('uUnder', under)
    },
    underOn: on => {
      underOn = on
    },
    bakeMs: mm.ms + performance.now() - t0,
    reach,
    growingCells,
    growthAt,
    groundAt: groundAtMap,
    cropAt,
    croppingCells: mm.croppingCells,
  }
}
