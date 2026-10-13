// The meadow near the camera (docs/plans/active/l5c-meadow.md): clumps of the owner's pack grass (Grass_Large,
// data/meadow-grass.json) on three square rings around the camera's focus, cells of 0.5, 1 and 2 m. Each ring is a
// static instanced mesh (one slot attribute, never rewritten); the vertex shader (shaders/meadow.vert) snaps the
// ring to its cell, places a clump from its world cell's hash, reads the meadow map (the ground's height and the
// growth, baked here once) and the clump field (shaders/meadow.glsl), and fades each clump out across its ring's
// band of distance, so the rings hand over without an edge. Where nothing grows, or beyond the outer ring, the
// ground's own pattern (groundAt, MEADOW) carries the meadow.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
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

// a ring: its cell (m), its slots a side, the clumps' scale, and its band of distance from the focus (m): in from
// band[0] to band[1], out from band[2] to band[3] (the next ring fades in where this one fades out)
export interface Ring { cell: number; n: number; scale: number; band: [number, number, number, number]; clump: 'Grass_Large' | 'Grass_Small' }
export const RINGS: Ring[] = [
  { cell: 0.5, n: 104, scale: 1.6, band: [0, 0, 18, 25], clump: 'Grass_Large' },   // band[1] 0: no fade in
  { cell: 1.0, n: 104, scale: 2.3 * 1.24, band: [18, 25, 38, 50], clump: 'Grass_Small' },   // Grass_Small: 0.39 m tall to the large 0.48
  { cell: 2.0, n: 104, scale: 3.4 * 1.24, band: [38, 50, 80, 100], clump: 'Grass_Small' },
]

export interface Meadow { meshes: Mesh[]; setOn(on: boolean): void; bakeMs: number }

// growth(x, z): how much grass grows there (0..1) and its height factor, by the cover and the placement rule
// (src/look/nature.ts)
export function buildMeadow(scene: Scene, mats: Materials, camera: ArcRotateCamera, growth: (x: number, z: number) => [number, number]): Meadow {
  const t0 = performance.now()
  // the meadow map: R the ground's height, G the growth, B the height factor; the growth on a 2 m grid (the cover's
  // cell), the height at every texel
  const data = new Float32Array(MAP_N * MAP_N * 4), G = MAP_N / 2, grow = new Float32Array(G * G * 2)
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const [d, h] = growth((i + 0.5) * 2 - TILE_W / 2, (j + 0.5) * 2 - TILE_W / 2); grow[(j * G + i) * 2] = d; grow[(j * G + i) * 2 + 1] = h
  }
  for (let j = 0; j < MAP_N; j++) for (let i = 0; i < MAP_N; i++) {
    const k = (j * MAP_N + i) * 4, g = ((j >> 1) * G + (i >> 1)) * 2
    data[k] = heightAt(i + 0.5 - TILE_W / 2, j + 0.5 - TILE_W / 2); data[k + 1] = grow[g]; data[k + 2] = grow[g + 1]; data[k + 3] = 1
  }
  const map = new RawTexture(data, MAP_N, MAP_N, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT)
  map.wrapU = map.wrapV = Texture.CLAMP_ADDRESSMODE

  // the clumps, indexed (the export is a triangle list): the large near, the small (fewer vertices) farther
  const src = JSON.parse(GRASS) as Record<string, { pos: number[]; nrm: number[]; v: number[] }>
  const indexed = (g: { pos: number[]; nrm: number[]; v: number[] }) => {
    const pos: number[] = [], nrm: number[] = [], vv: number[] = [], idx: number[] = [], seen = new Map<string, number>()
    for (let t = 0; t < g.v.length; t++) {
      const key = [g.pos[t * 3], g.pos[t * 3 + 1], g.pos[t * 3 + 2], g.nrm[t * 3], g.nrm[t * 3 + 1], g.nrm[t * 3 + 2], g.v[t]].join(',')
      let k = seen.get(key)
      if (k === undefined) { k = vv.length; seen.set(key, k); pos.push(g.pos[t * 3], g.pos[t * 3 + 1], g.pos[t * 3 + 2]); nrm.push(g.nrm[t * 3], g.nrm[t * 3 + 1], g.nrm[t * 3 + 2]); vv.push(g.v[t]) }
      idx.push(k)
    }
    return { pos, nrm, vv, idx }
  }
  const clumps = { Grass_Large: indexed(src.Grass_Large), Grass_Small: indexed(src.Grass_Small) }

  const meshes: Mesh[] = [], ringMats: ShaderMaterial[] = []
  RINGS.forEach((r, ri) => {
    const m = mats.make(`meadow${ri}`, MEADOW_VS.replace('#include<meadow>', () => MEADOW_GLSL), MEADOW_FS, {
      attributes: ['position', 'normal', 'aV', 'aSlot'], uniforms: ['uOrigin', 'uCentre', 'uCentreY', 'uCell', 'uScale', 'uBand'], samplers: ['uMeadow'],
      defines: [`#define MEADOW_N ${MAP_N.toFixed(1)}`],
    })
    m.backFaceCulling = false; m.setTexture('uMeadow', map); m.setFloat('uCell', r.cell); m.setFloat('uScale', r.scale); m.setVector4('uBand', new Vector4(...r.band))
    const mesh = new Mesh(`meadowGrass${ri}`, scene)   // the name keeps it out of the sun's shadow pass (src/look/bakes.ts)
    const { pos, nrm, vv, idx } = clumps[r.clump]
    mesh.setVerticesData(VertexBuffer.PositionKind, pos); mesh.setVerticesData(VertexBuffer.NormalKind, nrm); mesh.setVerticesData('aV', vv, false, 1); mesh.setIndices(idx)
    const slots = new Float32Array(r.n * r.n * 2)
    for (let j = 0; j < r.n; j++) for (let i = 0; i < r.n; i++) { slots[(j * r.n + i) * 2] = i; slots[(j * r.n + i) * 2 + 1] = j }
    // static thin instances (Babylon's instanced path wants a matrix a clump: identities, never rewritten; the
    // shader places the clump from its slot)
    const eye = new Float32Array(r.n * r.n * 16); for (let k = 0; k < r.n * r.n; k++) { eye[k * 16] = eye[k * 16 + 5] = eye[k * 16 + 10] = eye[k * 16 + 15] = 1 }
    mesh.thinInstanceSetBuffer('matrix', eye, 16, true); mesh.thinInstanceSetBuffer('aSlot', slots, 2, true)
    mesh.alwaysSelectAsActiveMesh = true; mesh.isPickable = false; mesh.material = m
    meshes.push(mesh); ringMats.push(m)
  })
  // each frame, each ring snaps to its cell around the camera's focus
  // one vector a ring: a material keeps the vector it is given, not a copy
  const origins = RINGS.map(() => new Vector2()), centre = new Vector2()
  RINGS.forEach((_, ri) => { ringMats[ri].setVector2('uOrigin', origins[ri]); ringMats[ri].setVector2('uCentre', centre) })
  scene.onBeforeRenderObservable.add(() => {
    const f = camera.target; centre.set(f.x, f.z); for (const m of ringMats) m.setFloat('uCentreY', heightAt(f.x, f.z))
    RINGS.forEach((r, ri) => { origins[ri].set((Math.floor(f.x / r.cell) - r.n / 2) * r.cell, (Math.floor(f.z / r.cell) - r.n / 2) * r.cell); ringMats[ri].setVector2('uOrigin', origins[ri]); ringMats[ri].setVector2('uCentre', centre) })
  })
  return { meshes, setOn: on => { for (const m of meshes) m.setEnabled(on) }, bakeMs: performance.now() - t0 }
}
