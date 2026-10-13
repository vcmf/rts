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
import { Vector2, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { heightAt } from './heightfield.ts'
import { D } from './spec.ts'
import { HEIGHT, HEIGHT_MAX, MEADOW_SINK, WHEAT_HEIGHT_MAX } from './meadow-spec.ts'
export { HEIGHT, HEIGHT_MAX }
import GRASS from '../../data/meadow-grass.json?raw'
import MEADOW_VS from './shaders/meadow.vert?raw'
import MEADOW_FS from './shaders/meadow.frag?raw'
import MEADOW_GLSL from './shaders/meadow.glsl?raw'

const TILE_W = D.spec.tile, MAP_N = Math.round(TILE_W)   // the meadow map: 1 m texels over the tile

// a ring: its cell (m), its slots a side (of the square it is cut from), the clumps' spread (their footprint grows
// with the cell, their height does not: a clump is never taller than HEIGHT_MAX), its band of distance from the focus
// (m: in from band[0] to band[1], out from band[2] to band[3]; the next ring fades in where this one fades out), and
// its clump
export interface Ring { cell: number; n: number; spread: number; band: [number, number, number, number]; clump: 'Grass_Large' | 'Grass_Small' }
export const RINGS: Ring[] = [
  { cell: 0.5, n: 104, spread: 1.6, band: [0, 0, 18, 25], clump: 'Grass_Large' },   // band[1] 0: no fade in
  { cell: 1.0, n: 104, spread: 2.85, band: [18, 25, 38, 50], clump: 'Grass_Small' },
  { cell: 2.0, n: 104, spread: 4.2, band: [38, 50, 80, 100], clump: 'Grass_Small' },
]

export interface Meadow {
  meshes: Mesh[]; setOn(on: boolean): void; bakeMs: number
  growingCells: number                                // texels of the meadow map where grass grows
  growthAt(x: number, z: number): number              // the growth at a point as the GPU reads it (the checks: tools/river-check.js)
  groundAt(x: number, z: number): number              // the ground's height the grass stands on, as the GPU reads it (tools/look-check.js)
  cropAt(x: number, z: number): number                // the crops' growth at a point as the GPU reads it (the checks)
  croppingCells: number                               // texels where a crop grows
}

// growth(x, z): how much grass grows at a point (0..1, by the cover and its edges) and its height factor; allowed(x,
// z): the placement rule's hard edges at any point; crop(x, z): a sown field there, 0 or 1 (src/look/nature.ts)
export function buildMeadow(scene: Scene, mats: Materials, camera: ArcRotateCamera, growth: (x: number, z: number) => [number, number], allowed: (x: number, z: number) => boolean, crop: (x: number, z: number) => number): Meadow {
  const t0 = performance.now()
  // the meadow map: R the ground's height, G the growth, B the height factor (half floats, filtered by the GPU). The
  // cover's growth on its 2 m grid, each texel interpolating the cells round it (the edge follows no grid); then the
  // rules at the texel itself (the cover's edge, the formation zones, the banks) zero it; then the growing area
  // shrinks by a texel, so the GPU's bilinear read, which blends a texel with its neighbours, never carries grass
  // across a rule (between the last growing texel and a zero one it stays inside the allowed ground)
  const G = MAP_N / 2
  const cellGrid = (f: (x: number, z: number) => number) => { const a = new Float32Array(G * G); for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) a[j * G + i] = f((i + 0.5) * 2 - TILE_W / 2, (j + 0.5) * 2 - TILE_W / 2); return a }
  const atCell = (a: Float32Array | Uint8Array, i: number, j: number) => a[Math.min(G - 1, Math.max(0, j)) * G + Math.min(G - 1, Math.max(0, i))]
  // the hard rules at the 2 m cells' centres too: a texel whose four cells agree takes their answer, and only a texel
  // near a rule's edge (its cells disagree) is tested itself (a few in a hundred: the bake's time)
  const okCell = new Uint8Array(cellGrid(allowed as unknown as (x: number, z: number) => number).map(v => v ? 1 : 0))
  const hCell = cellGrid((x, z) => growth(x, z)[1])
  // one growth channel (the grass's by growth(), the crops' by crop()), each texel interpolating its cells, zeroed by
  // the cover's edge and the rules at the texel, then shrunk a texel against the GPU's blend
  const channel = (cover: (x: number, z: number) => number): { g: Float32Array; count: number } => {
    const cell = cellGrid(cover), raw = new Float32Array(MAP_N * MAP_N)
    for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) {
      const x = i + 0.5 - TILE_W / 2, z = j + 0.5 - TILE_W / 2, k = j * MAP_N + i
      const gu = (i + 0.5) / 2 - 0.5, gv = (j + 0.5) / 2 - 0.5, i0 = Math.floor(gu), j0 = Math.floor(gv), fu = gu - i0, fv = gv - j0
      const c00 = atCell(cell, i0, j0), c10 = atCell(cell, i0 + 1, j0), c01 = atCell(cell, i0, j0 + 1), c11 = atCell(cell, i0 + 1, j0 + 1)
      const d = (c00 * (1 - fu) + c10 * fu) * (1 - fv) + (c01 * (1 - fu) + c11 * fu) * fv
      if (d <= 0) continue
      const ok = atCell(okCell, i0, j0) + atCell(okCell, i0 + 1, j0) + atCell(okCell, i0, j0 + 1) + atCell(okCell, i0 + 1, j0 + 1)
      const coverOk = (c00 > 0 && c10 > 0 && c01 > 0 && c11 > 0) || cover(x, z) > 0, ruleOk = ok === 4 ? true : ok === 0 ? false : allowed(x, z)
      raw[k] = coverOk && ruleOk ? d : 0
    }
    const g = new Float32Array(MAP_N * MAP_N); let count = 0
    for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) {
      const k = j * MAP_N + i; let d = raw[k]
      for (let dj = -1; dj <= 1 && d > 0; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj
        if (a >= 0 && b >= 0 && a < MAP_N && b < MAP_N && raw[b * MAP_N + a] <= 0) { d = 0; break }
      }
      g[k] = d; if (d > 0) count++
    }
    return { g, count }
  }
  const grass = channel((x, z) => growth(x, z)[0]), crops = channel(crop), g = grass.g, growingCells = grass.count
  // the meadow map: R the ground's height, G the grass's growth, B the grass's height factor, A the crops' growth
  // (half floats, filtered by the GPU)
  const data = new Uint16Array(MAP_N * MAP_N * 4)
  for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) {
    const k = j * MAP_N + i, gu = (i + 0.5) / 2 - 0.5, gv = (j + 0.5) / 2 - 0.5, i0 = Math.floor(gu), j0 = Math.floor(gv), fu = gu - i0, fv = gv - j0
    const hf = (atCell(hCell, i0, j0) * (1 - fu) + atCell(hCell, i0 + 1, j0) * fu) * (1 - fv) + (atCell(hCell, i0, j0 + 1) * (1 - fu) + atCell(hCell, i0 + 1, j0 + 1) * fu) * fv
    data[k * 4] = ToHalfFloat(heightAt(i + 0.5 - TILE_W / 2, j + 0.5 - TILE_W / 2)); data[k * 4 + 1] = ToHalfFloat(g[k]); data[k * 4 + 2] = ToHalfFloat(hf); data[k * 4 + 3] = ToHalfFloat(crops.g[k])
  }
  const map = new RawTexture(data, MAP_N, MAP_N, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT)
  map.wrapU = map.wrapV = Texture.CLAMP_ADDRESSMODE
  // the growth as the GPU reads it (bilinear over the texel centres), for the checks: anything it gives above 0 is
  // grass, or a crop, the shader may grow
  const bilinear = (a: Float32Array) => (x: number, z: number) => {
    const at = (i: number, j: number) => i < 0 || j < 0 || i >= MAP_N || j >= MAP_N ? 0 : a[j * MAP_N + i]
    const u = x + TILE_W / 2 - 0.5, v = z + TILE_W / 2 - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv
  }
  const growthAt = bilinear(g), cropAt = bilinear(crops.g)
  const hAt = (i: number, j: number) => heightAt(Math.min(MAP_N - 1, Math.max(0, i)) + 0.5 - TILE_W / 2, Math.min(MAP_N - 1, Math.max(0, j)) + 0.5 - TILE_W / 2)
  const groundAtMap = (x: number, z: number) => {   // the half floats' rounding included
    const u = x + TILE_W / 2 - 0.5, v = z + TILE_W / 2 - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
    const h = (a: number, b: number) => FromHalfFloat(ToHalfFloat(hAt(a, b)))
    return (h(i, j) * (1 - fu) + h(i + 1, j) * fu) * (1 - fv) + (h(i, j + 1) * (1 - fu) + h(i + 1, j + 1) * fu) * fv
  }

  // the clumps, indexed (the export is a triangle list): the large near, the small (fewer vertices) farther
  const src = JSON.parse(GRASS) as Record<string, { pos: number[]; nrm: number[]; v: number[] }>
  const indexed = (c: { pos: number[]; nrm: number[]; v: number[] }) => {
    const pos: number[] = [], nrm: number[] = [], vv: number[] = [], idx: number[] = [], seen = new Map<string, number>()
    let top = 0; for (let t = 1; t < c.pos.length; t += 3) top = Math.max(top, c.pos[t])
    for (let t = 0; t < c.v.length; t++) {
      // normalised to a height of 1 (the shader scales it to HEIGHT)
      const p = [c.pos[t * 3] / top, c.pos[t * 3 + 1] / top, c.pos[t * 3 + 2] / top], key = [...p, c.nrm[t * 3], c.nrm[t * 3 + 1], c.nrm[t * 3 + 2], c.v[t]].join(',')
      let k = seen.get(key)
      if (k === undefined) { k = vv.length; seen.set(key, k); pos.push(...p); nrm.push(c.nrm[t * 3], c.nrm[t * 3 + 1], c.nrm[t * 3 + 2]); vv.push(c.v[t]) }
      idx.push(k)
    }
    return { pos, nrm, vv, idx, top }
  }
  const clumps = { Grass_Large: indexed(src.Grass_Large), Grass_Small: indexed(src.Grass_Small) }

  const meshes: Mesh[] = [], ringMats: ShaderMaterial[] = []
  RINGS.forEach((r, ri) => {
    const m = mats.make(`meadow${ri}`, MEADOW_VS.replace('#include<meadow>', () => MEADOW_GLSL), MEADOW_FS, {
      attributes: ['position', 'normal', 'aV', 'aSlot'], uniforms: ['uOrigin', 'uCentre', 'uCentreY', 'uCell', 'uSpread', 'uHeight', 'uBand'], samplers: ['uMeadow'],
      defines: [`#define MEADOW_N ${MAP_N.toFixed(1)}`, `#define HEIGHT_MAX ${HEIGHT_MAX.toFixed(2)}`, `#define MEADOW_SINK ${MEADOW_SINK.toFixed(3)}`, `#define WHEAT_HEIGHT_MAX ${WHEAT_HEIGHT_MAX.toFixed(2)}`],
    })
    const c = clumps[r.clump]
    m.backFaceCulling = false; m.setTexture('uMeadow', map); m.setFloat('uCell', r.cell); m.setVector4('uBand', new Vector4(...r.band))
    // the footprint by the ring (its spread, against the clump's own proportions), the height the same on every ring
    m.setFloat('uSpread', r.spread * c.top / HEIGHT); m.setFloat('uHeight', HEIGHT)
    const mesh = new Mesh(`meadowGrass${ri}`, scene)   // the name keeps it out of the sun's shadow pass (src/look/bakes.ts)
    mesh.setVerticesData(VertexBuffer.PositionKind, c.pos); mesh.setVerticesData(VertexBuffer.NormalKind, c.nrm); mesh.setVerticesData('aV', c.vv, false, 1); mesh.setIndices(c.idx)
    // the slots a round ring can reach (the ring snaps by up to a cell on each axis and the root jitters by up to a
    // cell, so 2.2 cells of margin, the diagonal's): the corners
    // of the square and the hole the inner ring fills are left out
    const sl: number[] = []
    for (let j = 0; j < r.n; j++) for (let i = 0; i < r.n; i++) {
      const d = Math.hypot((i + 0.5 - r.n / 2) * r.cell, (j + 0.5 - r.n / 2) * r.cell)
      if (d <= r.band[3] + 2.2 * r.cell && (r.band[1] <= 0 || d >= r.band[0] - 2.2 * r.cell)) sl.push(i, j)
    }
    mesh.setVerticesBuffer(new VertexBuffer(scene.getEngine(), new Float32Array(sl), 'aSlot', false, false, 2, true))
    mesh.forcedInstanceCount = sl.length / 2; mesh.alwaysSelectAsActiveMesh = true; mesh.isPickable = false; mesh.material = m
    meshes.push(mesh); ringMats.push(m)
  })
  // each frame each ring snaps to its cell around the camera's focus; a material keeps the vector it is given (not a
  // copy), so the vectors are set once and changed in place
  const origins = RINGS.map(() => new Vector2()), centre = new Vector2()
  RINGS.forEach((_, ri) => { ringMats[ri].setVector2('uOrigin', origins[ri]); ringMats[ri].setVector2('uCentre', centre) })
  scene.onBeforeRenderObservable.add(() => {
    const f = camera.target, y = heightAt(f.x, f.z); centre.set(f.x, f.z)
    RINGS.forEach((r, ri) => { origins[ri].set((Math.floor(f.x / r.cell) - r.n / 2) * r.cell, (Math.floor(f.z / r.cell) - r.n / 2) * r.cell); ringMats[ri].setFloat('uCentreY', y) })
  })
  return { meshes, setOn: on => { for (const m of meshes) m.setEnabled(on) }, bakeMs: performance.now() - t0, growingCells, growthAt, groundAt: groundAtMap, cropAt, croppingCells: crops.count }
}
