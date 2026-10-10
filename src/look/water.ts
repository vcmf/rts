// Water (docs/art-bible.md §6c), ported from prototypes/painted-cinematic.html: painted, top-down. An opaque ribbon
// wide enough that the TERRAIN cuts the real shoreline; per-vertex depth drives shallow turquoise to deep teal, foam
// at the shore, flow strokes, baked tree reflections, sun glitter, tree and cloud shadows.
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { H, RIVER, lerpA, riverQuery } from './river.ts'
import { REFL_N, TILE_W } from './spec.ts'
import WAT_VS from './shaders/water.vert?raw'
import WAT_FS from './shaders/water.frag?raw'

export interface Water {
  mesh: Mesh; waterMat: ShaderMaterial
  reflAdd(x: number, z: number, r: number): void   // a crown that may reflect: kept if within 20 m of the water
  finish(scene: Scene): DynamicTexture              // draws the kept crowns into the reflection mask, once the scatter is known
}

export function buildWater(scene: Scene, mats: Materials): Water {
  // reflection mask: crown discs of trees near the stream
  const reflCanvas = document.createElement('canvas'); reflCanvas.width = reflCanvas.height = REFL_N
  const reflG = reflCanvas.getContext('2d')!; reflG.fillStyle = '#000'; reflG.fillRect(0, 0, REFL_N, REFL_N); reflG.filter = 'blur(3px)'
  const reflTrees: [number, number, number][] = []
  const reflAdd = (x: number, z: number, r: number) => { const q = riverQuery(x, z); if (q && q.dist < lerpA(RIVER.W, q) / 2 + 20) reflTrees.push([x, z, r]) }   // crowns within 20 m of the water

  // samples whose ribbon (1.35 half-widths) reaches the tile; vertices clamped onto it
  const pos: number[] = [], uv: number[] = [], dep: number[] = [], idx: number[] = [], C = RIVER, COLS = 12, E2 = TILE_W / 2 - 0.01, lim = TILE_W / 2 + 1.35 * RIVER.WMAX / 2 + 0.5; let k = 0
  for (let i = 0, join = false; i < C.n; i++) {
    if (Math.abs(C.px[i]) > lim || Math.abs(C.pz[i]) > lim) { join = false; continue }   // the water lives in the detailed tile only; a re-entry starts a new strip
    const hw = C.W[i] / 2, nx = -C.tz[i], nz = C.tx[i], y = C.zw[i]                         // left normal of the flow; water is flat at zw
    for (let c = 0; c <= COLS; c++) {
      const a = (c / COLS * 2 - 1) * hw * 1.35; let x = C.px[i] + nx * a, zz = C.pz[i] + nz * a
      const cx = Math.max(-E2, Math.min(E2, x)), cz = Math.max(-E2, Math.min(E2, zz)), moved = cx !== x || cz !== zz; x = cx; zz = cz   // the ribbon ends exactly on the tile edge, where the painted line starts
      // outer columns dive under the carved bank; a column the clamp moved decides from where it landed (it may now be mid-channel)
      let dive = Math.abs(a) > hw; if (moved) { const q = riverQuery(x, zz); dive = !(q && q.dist < lerpA(C.W, q) / 2) }
      const h = H(x, zz), yy = dive ? Math.min(y, h - 0.35) : y
      pos.push(x, yy, zz); uv.push(a, C.s[i]); dep.push(y - h)
    }
    if (join) for (let c = 0; c < COLS; c++) { const a = (k - 1) * (COLS + 1) + c, b = k * (COLS + 1) + c; idx.push(a, b, a + 1, a + 1, b, b + 1) }
    k++; join = true
  }
  const mesh = new Mesh('water', scene), vd = new VertexData(); vd.positions = pos; vd.uvs = uv; vd.indices = idx
  const n: number[] = []; VertexData.ComputeNormals(pos, idx, n); vd.normals = n; vd.applyToMesh(mesh)
  mesh.setVerticesData('aDepth', new Float32Array(dep), false, 1)
  const waterMat = mats.make('water', WAT_VS, WAT_FS, { attributes: ['position', 'uv', 'aDepth'], samplers: ['uRefl'] }); mesh.material = waterMat; waterMat.backFaceCulling = false

  const finish = (sc: Scene) => {
    for (const [x, z, r] of reflTrees) {
      const px = (x + TILE_W / 2) / TILE_W * REFL_N, pz = (z + TILE_W / 2) / TILE_W * REFL_N, pr = Math.max(2, r / TILE_W * REFL_N)
      reflG.fillStyle = '#fff'; reflG.beginPath(); reflG.ellipse(px, pz, pr, pr * 0.9, 0, 0, 7); reflG.fill()
    }
    const reflTex = new DynamicTexture('refl', reflCanvas, sc, true, Texture.BILINEAR_SAMPLINGMODE); reflTex.wrapU = reflTex.wrapV = Texture.CLAMP_ADDRESSMODE; reflTex.update(false)
    waterMat.setTexture('uRefl', reflTex)
    return reflTex
  }
  return { mesh, waterMat, reflAdd, finish }
}
