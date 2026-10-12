// Water (docs/art-bible.md §6c, docs/plans/done/w4-water-surface.md): painted, top-down. An opaque ribbon wide
// enough that it dives under the banks; what it paints comes from the water data (depth, shore distance, flow), and
// near the shore it paints the shore band, as the terrain does there (src/look/shaders/shore.glsl), so the shoreline
// is the data's, not the triangles'.
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import type { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { H } from './heightfield.ts'
import { RIVER, lerpA, riverQuery, wetEdgeAt, wetEdges } from './river.ts'
import { D } from './spec.ts'
import WAT_VS from './shaders/water.vert?raw'
import WAT_FS from './shaders/water.frag?raw'

export interface Water {
  mesh: Mesh; waterMat: ShaderMaterial
  groundMat: ShaderMaterial   // the water's shader on the tile's ground (the seam check draws the ground with it)
  reflAdd(x: number, z: number, r: number): void   // a crown that may reflect: kept if within 20 m of the water
  finish(scene: Scene): DynamicTexture              // draws the kept crowns into the reflection mask, once the scatter is known
}

const TILE_W = D.spec.tile, REFL_N = D.spec.sizes.reflMask

// A Gaussian blur of a grey mask, in JS: a canvas filter is the pattern that lost the WebGL context in SwiftShader
// (docs/proposals/engine-design.md §6, bake rules). sigma in texels; separable, clamped at the edges.
export function blurMask(g: CanvasRenderingContext2D, N: number, sigma: number, box: [number, number, number, number]): void {
  const R = Math.ceil(3 * sigma), w = new Float32Array(2 * R + 1); let sum = 0
  for (let k = -R; k <= R; k++) sum += w[k + R] = Math.exp(-k * k / (2 * sigma * sigma))
  for (let k = 0; k < w.length; k++) w[k] /= sum
  // only the box around what was drawn, padded by the kernel: outside it the mask is black before and after
  const [bx0, by0, bx1, by1] = box, X0 = Math.max(0, Math.floor(bx0) - R), Y0 = Math.max(0, Math.floor(by0) - R), X1 = Math.min(N, Math.ceil(bx1) + R + 1), Y1 = Math.min(N, Math.ceil(by1) + R + 1)
  if (X1 <= X0 || Y1 <= Y0) return
  const W = X1 - X0, Hh = Y1 - Y0, img = g.getImageData(X0, Y0, W, Hh), d = img.data, a = new Float32Array(W * Hh), b = new Float32Array(W * Hh)
  // edge pixels repeat at the mask's border; the canvas filter it replaces read transparent there and blurred each crown
  // before compositing, so reflections near the tile edge and where crowns overlap differ slightly (an intended change)
  const at = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  for (let i = 0; i < W * Hh; i++) a[i] = d[i * 4]
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -R; k <= R; k++) { const xx = at(X0 + x + k, 0, N - 1) - X0; s += w[k + R] * (xx >= 0 && xx < W ? a[y * W + xx] : 0) } b[y * W + x] = s }
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -R; k <= R; k++) { const yy = at(Y0 + y + k, 0, N - 1) - Y0; s += w[k + R] * (yy >= 0 && yy < Hh ? b[yy * W + x] : 0) } a[y * W + x] = s }
  for (let i = 0; i < W * Hh; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = a[i]; d[i * 4 + 3] = 255 }
  g.putImageData(img, X0, Y0)
}

// the water's shader with the ground's attributes: no ribbon coordinates (the upper layers' strokes stand still; the
// seam check compares the band only, where they have no weight)
const GROUND_VS = 'precision highp float;attribute vec3 position;uniform mat4 world,viewProjection;varying vec3 vW;varying float vAcross,vTau,vRiffle;void main(){vec4 w=world*vec4(position,1.0);vW=w.xyz;vAcross=0.0;vTau=0.0;vRiffle=0.0;gl_Position=viewProjection*w;}'

// tex: the water data (docs/plans/done/w3-water-data.md) and the bank normals (the shore band lights the edge with them);
// dive: false keeps every column at the water's level, the band check's sabotage (the ribbon then shows over dry ground)
export function buildWater(scene: Scene, mats: Materials, tex: { water: RawTexture; bankN: RawTexture }, dive = true): Water {
  // reflection mask: crown discs of trees near the stream
  const reflCanvas = document.createElement('canvas'); reflCanvas.width = reflCanvas.height = REFL_N
  const reflG = reflCanvas.getContext('2d', { willReadFrequently: true })!; reflG.fillStyle = '#000'; reflG.fillRect(0, 0, REFL_N, REFL_N)
  const reflTrees: [number, number, number][] = []
  const reflAdd = (x: number, z: number, r: number) => { const q = riverQuery(x, z); if (q && q.dist < lerpA(RIVER.W, q) / 2 + 20) reflTrees.push([x, z, r]) }   // crowns within 20 m of the water

  // samples whose ribbon (1.35 half-widths) reaches the tile; vertices clamped onto it
  const pos: number[] = [], across: number[] = [], tau: number[] = [], rif: number[] = [], idx: number[] = [], C = RIVER, COLS = 12, E2 = TILE_W / 2 - 0.01, lim = TILE_W / 2 + 1.35 * RIVER.WMAX / 2 + 0.5; let k = 0
  for (let i = 0, join = false; i < C.n; i++) {
    if (Math.abs(C.px[i]) > lim || Math.abs(C.pz[i]) > lim) { join = false; continue }   // the water lives in the detailed tile only; a re-entry starts a new strip
    const hw = C.W[i] / 2, nx = -C.tz[i], nz = C.tx[i], y = C.zw[i], [ep, en] = wetEdges(hw, C.A[i])   // left normal of the flow; water is flat at zw
    for (let c = 0; c <= COLS; c++) {
      const a = (c / COLS * 2 - 1) * hw * 1.35
      let x = C.px[i] + nx * a, zz = C.pz[i] + nz * a
      const cx = Math.max(-E2, Math.min(E2, x)), cz = Math.max(-E2, Math.min(E2, zz)), moved = cx !== x || cz !== zz; x = cx; zz = cz   // the ribbon ends exactly on the tile edge, where the painted line starts
      // columns past this side's water's edge dive under the bank (W2: the inner bar is dry sooner); a column the clamp
      // moved decides from where it landed (it may now be mid-channel)
      let under = a >= 0 ? a > ep : -a > en
      if (moved) { const q = riverQuery(x, zz); under = !q || q.dist > wetEdgeAt(q) }
      const h = H(x, zz), yy = under && dive ? Math.min(y, h - 0.35) : y
      pos.push(x, yy, zz); across.push(a); tau.push(C.tau[i]); rif.push(C.riffle[i])
    }
    if (join) for (let c = 0; c < COLS; c++) { const a = (k - 1) * (COLS + 1) + c, b = k * (COLS + 1) + c; idx.push(a, b, a + 1, a + 1, b, b + 1) }
    k++; join = true
  }
  const mesh = new Mesh('water', scene), vd = new VertexData(); vd.positions = pos; vd.indices = idx
  const n: number[] = []; VertexData.ComputeNormals(pos, idx, n); vd.normals = n; vd.applyToMesh(mesh)
  mesh.setVerticesData('aAcross', new Float32Array(across), false, 1); mesh.setVerticesData('aTau', new Float32Array(tau), false, 1); mesh.setVerticesData('aRiffle', new Float32Array(rif), false, 1)
  // DETAIL: the same paint() (and grain) as the terrain's, so the shore band is one function on both; WATER_SURFACE:
  // the debug views' surface view shows the water white
  const opts = { uniforms: ['uWaterView', 'uStones'], samplers: ['uRefl', 'uWater', 'uBankN'], defines: ['#define DETAIL', '#define BANKN', '#define WATERDATA', '#define WATER_SURFACE'] }
  const waterMat = mats.make('water', WAT_VS, WAT_FS, { ...opts, attributes: ['position', 'aAcross', 'aTau', 'aRiffle'] }); mesh.material = waterMat; waterMat.backFaceCulling = false
  const groundMat = mats.make('waterOnGround', GROUND_VS, WAT_FS, { ...opts, attributes: ['position'] })
  for (const m of [waterMat, groundMat]) { m.setTexture('uWater', tex.water); m.setTexture('uBankN', tex.bankN) }

  const finish = (sc: Scene) => {
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, z, r] of reflTrees) {
      const px = (x + TILE_W / 2) / TILE_W * REFL_N, pz = (z + TILE_W / 2) / TILE_W * REFL_N, pr = Math.max(2, r / TILE_W * REFL_N)
      reflG.fillStyle = '#fff'; reflG.beginPath(); reflG.ellipse(px, pz, pr, pr * 0.9, 0, 0, 7); reflG.fill()
      box[0] = Math.min(box[0], px - pr); box[1] = Math.min(box[1], pz - pr); box[2] = Math.max(box[2], px + pr); box[3] = Math.max(box[3], pz + pr)
    }
    blurMask(reflG, REFL_N, 3, box)
    const reflTex = new DynamicTexture('refl', reflCanvas, sc, true, Texture.BILINEAR_SAMPLINGMODE); reflTex.wrapU = reflTex.wrapV = Texture.CLAMP_ADDRESSMODE; reflTex.update(false)
    waterMat.setTexture('uRefl', reflTex); groundMat.setTexture('uRefl', reflTex)
    return reflTex
  }
  return { mesh, waterMat, groundMat, reflAdd, finish }
}
