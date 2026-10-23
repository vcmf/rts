// The meadow near the camera (docs/plans/done/l5c-meadow.md): clumps of the owner's pack grass (Grass_Large and
// Grass_Small, data/meadow-grass.json) on three round rings around the camera's focus, cells of 0.5, 1 and 2 m. Each
// ring is an instanced mesh with one static slot attribute (forcedInstanceCount: no matrices); the vertex shader (shaders/meadow.vert) snaps the
// ring to its cell, places a clump from its world cell's hash, reads the meadow map (the ground's height and the
// growth, baked here once) and the clump field (shaders/meadow.glsl), and fades each clump out across its ring's
// band of distance, so the rings hand over without an edge. Where nothing grows, or beyond the outer ring, the
// ground's own pattern (groundAt, MEADOW) carries the meadow.
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
import {
  CLUMP_REACH,
  grassDefinesForClumps,
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
const MAP_N = Math.round(TILE_W) // the meadow map: 1 m texels over the tile

// a ring: its cell (m), its slots a side (of the square it is cut from), the clumps' spread (their footprint grows
// with the cell, their height does not: a clump is never taller than HEIGHT_MAX), its band of distance from the focus
// (m: in from band[0] to band[1], out from band[2] to band[3]; the next ring fades in where this one fades out), and
// its clump
// the camera's radius over which the inner rings give way to the outer one (m): the default view is 125, the widest 260
const WIDE: [number, number] = [150, 200] // (buildMeadow's wide: false, ?nowide, keeps the rings as before: the A/B)
// a crop's clump (docs/plans/done/crop-depth.md): CROP_WIDE times the grass clump's spread at the root, its fan undone:
// the grass clumps' blades spread about 1 + CROP_FAN aV up their height (measured from data/meadow-grass.json: Large
// 0.31, 0.43, 0.58 at aV 0, 0.4, 0.8; Small 0.25, 0.34, 0.50), so the stalks stand parallel
const CROP_FAN = 1.15
const CROP_WIDE = 1.5
export interface Ring {
  cell: number
  n: number
  spread: number
  band: [number, number, number, number]
  clump: 'Grass_Large' | 'Grass_Small'
}
export const RINGS: Ring[] = [
  { cell: 0.5, n: 104, spread: 1.6, band: [0, 0, 18, 25], clump: 'Grass_Large' }, // band[1] 0: no fade in
  { cell: 1.0, n: 104, spread: 2.85, band: [18, 25, 38, 50], clump: 'Grass_Small' },
  { cell: 2.0, n: 104, spread: 4.2, band: [38, 50, 80, 100], clump: 'Grass_Small' },
]

// a ring's chunk: its slots' range on the ring's square, and its slots (the hole's apart: drawn only zoomed out)
interface Chunk {
  i0: number
  i1: number
  j0: number
  j1: number
  slots: Float32Array
  hole: Float32Array
}
const CHUNKS = 8
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

// the meadow map (buildMeadowMap): R the ground's height, G the grass's growth, B its height factor, A the crops' growth
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
  bakeMs: number
  // the ground's dark under-layer (shore.glsl, MEADOW_UNDER) on these materials: the meadow map, and each frame its
  // reach and strength (off while the meadow is off or hidden: underOn)
  under(ms: ShaderMaterial[]): void
  underOn(on: boolean): void
  reach: number // how far a grass clump reaches from its root, m (the checks: tools/river-check.js)
  growingCells: number // texels of the meadow map where grass grows
  growthAt(x: number, z: number): number // the growth at a point as the GPU reads it (the checks: tools/river-check.js)
  groundAt(x: number, z: number): number // the ground's height the grass stands on, as the GPU reads it (tools/look-check.js)
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
  // every painted material reads it under ?grass=flow (groundAt, src/look/shaders/macro.glsl): the comb only where grass
  // grows (the ground's under-layer, below, binds it to the terrain and the water too)
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

// mm: the meadow map (buildMeadowMap); reach: the grass clumps' (CLUMP_REACH, or the combed meadow's), for the chunks' cull
export function buildMeadow(
  scene: Scene,
  mats: Materials,
  camera: ArcRotateCamera,
  mm: MeadowMap,
  wide = true,
  reach = CLUMP_REACH,
): Meadow {
  const t0 = performance.now()
  const { map, growingCells, growthAt, cropAt, groundAt: groundAtMap } = mm

  // the clumps, indexed (the export is a triangle list): the large near, the small (fewer vertices) farther
  const src = JSON.parse(GRASS) as Record<string, { pos: number[]; nrm: number[]; v: number[] }>
  const indexed = (c: { pos: number[]; nrm: number[]; v: number[] }) => {
    const pos: number[] = []
    const nrm: number[] = []
    const vv: number[] = []
    const idx: number[] = []
    const seen = new Map<string, number>()
    let top = 0
    for (let t = 1; t < c.pos.length; t += 3) top = Math.max(top, c.pos[t])
    for (let t = 0; t < c.v.length; t++) {
      // normalised to a height of 1 (the shader scales it to HEIGHT)
      const p = [c.pos[t * 3] / top, c.pos[t * 3 + 1] / top, c.pos[t * 3 + 2] / top]
      const key = [...p, c.nrm[t * 3], c.nrm[t * 3 + 1], c.nrm[t * 3 + 2], c.v[t]].join(',')
      let k = seen.get(key)
      if (k === undefined) {
        k = vv.length
        seen.set(key, k)
        pos.push(...p)
        nrm.push(c.nrm[t * 3], c.nrm[t * 3 + 1], c.nrm[t * 3 + 2])
        vv.push(c.v[t])
      }
      idx.push(k)
    }
    return { pos, nrm, vv, idx, top }
  }
  const clumps = { Grass_Large: indexed(src.Grass_Large), Grass_Small: indexed(src.Grass_Small) }

  const meshes: Mesh[] = []
  const ringMats: ShaderMaterial[] = []
  const chunks: Chunk[][] = []
  const slotBufs: Float32Array[] = []
  const slotVBs: VertexBuffer[] = []
  const drawn: number[][] = RINGS.map(() => [-1])
  const keep: number[] = []
  RINGS.forEach((r, ri) => {
    const m = mats.make(
      `meadow${ri}`,
      MEADOW_VS.replace('#include<meadow>', () => MEADOW_GLSL),
      MEADOW_FS,
      {
        attributes: ['position', 'normal', 'aV', 'aSlot'],
        uniforms: ['uOrigin', 'uCentre', 'uCentreY', 'uCell', 'uSpread', 'uHeight', 'uBand'],
        samplers: ['uMeadow', 'uGB'],
        defines: [
          ...grassDefinesForClumps(),
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
    const c = clumps[r.clump]
    m.backFaceCulling = false
    m.setTexture('uMeadow', map)
    m.setFloat('uCell', r.cell)
    // the footprint by the ring (its spread, against the clump's own proportions), the height the same on every ring
    m.setFloat('uSpread', (r.spread * c.top) / HEIGHT)
    m.setFloat('uHeight', HEIGHT)
    const mesh = new Mesh(`meadowGrass${ri}`, scene) // the name keeps it out of the sun's shadow pass (src/look/bakes.ts)
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
    const outer = ri === RINGS.length - 1
    const ch: Chunk[] = []
    for (let cj = 0; cj < CHUNKS; cj++) {
      for (let ci = 0; ci < CHUNKS; ci++) {
        const i0 = Math.floor((ci * r.n) / CHUNKS)
        const i1 = Math.floor(((ci + 1) * r.n) / CHUNKS)
        const j0 = Math.floor((cj * r.n) / CHUNKS)
        const j1 = Math.floor(((cj + 1) * r.n) / CHUNKS)
        const sl: number[] = []
        const hole: number[] = []
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const d = Math.hypot((i + 0.5 - r.n / 2) * r.cell, (j + 0.5 - r.n / 2) * r.cell)
            if (d > r.band[3] + 2.2 * r.cell) continue
            if (r.band[1] <= 0 || d >= r.band[0] - 2.2 * r.cell) sl.push(i, j)
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
    const buf = new Float32Array(ch.reduce((a, c) => a + c.slots.length + c.hole.length, 0))
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
  const origins = RINGS.map(() => new Vector2())
  const centre = new Vector2()
  RINGS.forEach((_, ri) => {
    ringMats[ri].setVector2('uOrigin', origins[ri])
    ringMats[ri].setVector2('uCentre', centre)
  })
  // zoomed out (docs/plans/done/wide-perf.md): from WIDE[0] to WIDE[1] m of the camera's radius the inner rings'
  // bands shrink to the focus and the outer ring's grows in to it, so at the widest zoom only the outer ring (2 m
  // cells, larger clumps: a clump is a few pixels there) is drawn; the clumps fade as the bands move (no pop)
  const under = new Vector3(0, 0, 0)
  const outer = RINGS[RINGS.length - 1].band
  let underOn = true
  let meadowOn = true
  const bands = RINGS.map(r => new Vector4(...r.band))
  RINGS.forEach((_, ri) => ringMats[ri].setVector4('uBand', bands[ri]))
  scene.onBeforeRenderObservable.add(() => {
    const t = wide ? Math.min(1, Math.max(0, (camera.radius - WIDE[0]) / (WIDE[1] - WIDE[0]))) : 0
    const k = 1 - t * t * (3 - 2 * t)
    under.z = underOn && meadowOn ? k : 0
    RINGS.forEach((r, ri) => {
      const outer = ri === RINGS.length - 1
      const b = bands[ri]
      b.set(r.band[0] * k, r.band[1] * k, outer ? r.band[2] : r.band[2] * k, outer ? r.band[3] : r.band[3] * k)
      meshes[ri].isVisible = b.w > 0 // (visibility: the page's own switches set enabled)
    })
    const f = camera.target
    const y = heightAt(f.x, f.z)
    centre.set(f.x, f.z)
    RINGS.forEach((r, ri) => {
      origins[ri].set((Math.floor(f.x / r.cell) - r.n / 2) * r.cell, (Math.floor(f.z / r.cell) - r.n / 2) * r.cell)
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
    RINGS.forEach((r, ri) => {
      if (!meshes[ri].isVisible) return
      cullRing(r, chunks[ri], origins[ri], centre, focusY, bands[ri], vp, holes, reach, keep)
      // (none in view: not drawn, a forced count of 0 would draw one clump without instances, in another shader variant)
      meshes[ri].isVisible = keep.length > 0
      if (sameList(keep, drawn[ri])) return
      drawn[ri] = keep.slice()
      const buf = slotBufs[ri]
      let n = 0
      for (const k of keep) {
        const c = chunks[ri][k >> 1]
        const part = k & 1 ? c.hole : c.slots
        buf.set(part, n)
        n += part.length
      }
      slotVBs[ri].updateDirectly(buf, 0)
      meshes[ri].forcedInstanceCount = n / 2 // (the whole buffer: Babylon keeps what it is given to rebuild a lost context)
    })
  })
  // the under-layer's reach: the outer ring's band; its strength: the inner rings' (k, set with them below: zoomed out,
  // where only the outer ring's sparse clumps stand, the field reads as it did)
  under.set(outer[2], outer[3], 1)
  // (under() sets the reach on the given materials; the map itself, uMeadow, is bound on every painted material above)
  return {
    meshes,
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
