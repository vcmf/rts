// The meadow near the camera (docs/plans/active/l5c-meadow.md): clumps of the owner's pack grass (Grass_Large and
// Grass_Small, data/meadow-grass.json) on three round rings around the camera's focus, cells of 0.5, 1 and 2 m. Each
// ring is an instanced mesh with one static slot attribute (forcedInstanceCount: no matrices); the vertex shader (shaders/meadow.vert) snaps the
// ring to its cell, places a clump from its world cell's hash, reads the meadow map (the ground's height and the
// growth, baked here once) and the clump field (shaders/meadow.glsl), and fades each clump out across its ring's
// band of distance, so the rings hand over without an edge. Where nothing grows, or beyond the outer ring, the
// ground's own pattern (groundAt, MEADOW) carries the meadow.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { ToHalfFloat } from '@babylonjs/core/Misc/textureTools.js'
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
// the grass's height, m: typical, and the most any clump reaches (well under a soldier's knee to hip: a formation
// standing in the meadow is never hidden, docs/art-bible.md pillar 1)
export const HEIGHT = 0.62, HEIGHT_MAX = 0.85

export interface Meadow {
  meshes: Mesh[]; setOn(on: boolean): void; bakeMs: number
  growingCells: number                                // texels of the meadow map where grass grows
  growthAt(x: number, z: number): number              // the baked growth at a point (the checks: tools/river-check.js)
}

// growth(x, z): how much grass grows at a 2 m cell's centre (0..1) and its height factor, by the cover;
// allowed(x, z): the placement rule's hard edges at any point (src/look/nature.ts)
export function buildMeadow(scene: Scene, mats: Materials, camera: ArcRotateCamera, growth: (x: number, z: number) => [number, number], allowed: (x: number, z: number) => boolean): Meadow {
  const t0 = performance.now()
  // the meadow map: R the ground's height, G the growth, B the height factor (half floats). The cover's growth on its
  // 2 m grid, each texel interpolating the cells round it (the edge follows no grid), then the hard edges at the
  // texel itself (no grass carried into a formation zone or onto a bank)
  const G = MAP_N / 2, grow = new Float32Array(G * G * 2)
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const [d, h] = growth((i + 0.5) * 2 - TILE_W / 2, (j + 0.5) * 2 - TILE_W / 2); grow[(j * G + i) * 2] = d; grow[(j * G + i) * 2 + 1] = h
  }
  const cellAt = (i: number, j: number, c: number) => grow[(Math.min(G - 1, Math.max(0, j)) * G + Math.min(G - 1, Math.max(0, i))) * 2 + c]
  const g = new Float32Array(MAP_N * MAP_N), data = new Uint16Array(MAP_N * MAP_N * 4), one = ToHalfFloat(1)
  let growingCells = 0
  for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) {
    const x = i + 0.5 - TILE_W / 2, z = j + 0.5 - TILE_W / 2, k = j * MAP_N + i
    const gu = (i + 0.5) / 2 - 0.5, gv = (j + 0.5) / 2 - 0.5, i0 = Math.floor(gu), j0 = Math.floor(gv), fu = gu - i0, fv = gv - j0
    const bil = (c: number) => (cellAt(i0, j0, c) * (1 - fu) + cellAt(i0 + 1, j0, c) * fu) * (1 - fv) + (cellAt(i0, j0 + 1, c) * (1 - fu) + cellAt(i0 + 1, j0 + 1, c) * fu) * fv
    let d = bil(0); if (d > 0 && !allowed(x, z)) d = 0
    g[k] = d; if (d > 0) growingCells++
    data[k * 4] = ToHalfFloat(heightAt(x, z)); data[k * 4 + 1] = ToHalfFloat(d); data[k * 4 + 2] = ToHalfFloat(bil(1)); data[k * 4 + 3] = one
  }
  const map = new RawTexture(data, MAP_N, MAP_N, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT)
  map.wrapU = map.wrapV = Texture.CLAMP_ADDRESSMODE
  const growthAt = (x: number, z: number) => { const i = Math.floor(x + TILE_W / 2), j = Math.floor(z + TILE_W / 2); return i < 0 || j < 0 || i >= MAP_N || j >= MAP_N ? 0 : g[j * MAP_N + i] }

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

  // the brush tile (src/look/macro.ts binds it to every painted material): the grass takes its shade from it
  const meshes: Mesh[] = [], ringMats: ShaderMaterial[] = []
  RINGS.forEach((r, ri) => {
    const m = mats.make(`meadow${ri}`, MEADOW_VS.replace('#include<meadow>', () => MEADOW_GLSL), MEADOW_FS, {
      attributes: ['position', 'normal', 'aV', 'aSlot'], uniforms: ['uOrigin', 'uCentre', 'uCentreY', 'uCell', 'uSpread', 'uHeight', 'uBand'], samplers: ['uMeadow'],
      defines: [`#define MEADOW_N ${MAP_N.toFixed(1)}`, `#define HEIGHT_MAX ${HEIGHT_MAX.toFixed(2)}`],
    })
    const c = clumps[r.clump]
    m.backFaceCulling = false; m.setTexture('uMeadow', map); m.setFloat('uCell', r.cell); m.setVector4('uBand', new Vector4(...r.band))
    // the footprint by the ring (its spread, against the clump's own proportions), the height the same on every ring
    m.setFloat('uSpread', r.spread * c.top / HEIGHT); m.setFloat('uHeight', HEIGHT)
    const mesh = new Mesh(`meadowGrass${ri}`, scene)   // the name keeps it out of the sun's shadow pass (src/look/bakes.ts)
    mesh.setVerticesData(VertexBuffer.PositionKind, c.pos); mesh.setVerticesData(VertexBuffer.NormalKind, c.nrm); mesh.setVerticesData('aV', c.vv, false, 1); mesh.setIndices(c.idx)
    // the slots a round ring can reach (the ring snaps by up to a cell, so a cell and a half of margin): the corners
    // of the square and the hole the inner ring fills are left out
    const sl: number[] = []
    for (let j = 0; j < r.n; j++) for (let i = 0; i < r.n; i++) {
      const d = Math.hypot((i + 0.5 - r.n / 2) * r.cell, (j + 0.5 - r.n / 2) * r.cell)
      if (d <= r.band[3] + 1.5 * r.cell && (r.band[1] <= 0 || d >= r.band[0] - 1.5 * r.cell)) sl.push(i, j)
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
  return { meshes, setOn: on => { for (const m of meshes) m.setEnabled(on) }, bakeMs: performance.now() - t0, growingCells, growthAt }
}
