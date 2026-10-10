// Static light, baked once (docs/art-bible.md §6b, docs/proposals/engine-design.md §6), ported from
// prototypes/painted-cinematic.html: a sun shadow depth pass, a CPU occlusion and valley-mist mask, and a top-down
// light map (R sun visibility, G occlusion, B valley mask) the materials read. Trees keep a small runtime lookup
// of the shadow map for self-shadowing.
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { Material } from '@babylonjs/core/Materials/material.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import type { Matrix } from '@babylonjs/core/Maths/math.vector.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { SUN, type Materials } from './materials.ts'
import { heightAt } from './heightfield.ts'
import { D, shadowMapSize } from './spec.ts'
import type { Nature } from './nature.ts'
import TER_VS from './shaders/terrain.vert?raw'
import DEPTH_VS from './shaders/depth.vert?raw'
import DEPTH_FS from './shaders/depth.frag?raw'
import BAKE_FS from './shaders/bake.frag?raw'

export interface Bakes { lightCam: FreeCamera; shadowRT: RenderTargetTexture; lightMap: RenderTargetTexture; bakeMat: ShaderMaterial; lightVP: Matrix; smTexel: Vector2; smSize: { w: number; h: number } }

const TILE_W = D.spec.tile, AO_N = D.spec.sizes.aoTex, LM_N = D.spec.sizes.lightMap, LZ0 = D.spec.depth.near, LZ1 = D.spec.depth.far, SM_FADE_M = D.spec.shadowFade

export function buildBakes(scene: Scene, mats: Materials, tileGround: Mesh, canopy: Nature['canopy']): Bakes {
  /* ---------- shadow pass: an orthographic camera at the sun, depth of every caster, rendered ONCE ---------- */
  const lightCam = new FreeCamera('lightCam', SUN.scale(700), scene); lightCam.setTarget(Vector3.Zero())
  let smTexel: Vector2, smFade: Vector2, sm: { w: number; h: number }
  // fit the ortho box to the tile: project its corners (lowest ground to 60 m above the highest, above any caster) into light space
  {
    const tp = tileGround.getVerticesData(VertexBuffer.PositionKind)!; let lo = Infinity, hi = -Infinity; for (let k = 1; k < tp.length; k += 3) { lo = Math.min(lo, tp[k]); hi = Math.max(hi, tp[k]) }
    const V = lightCam.getViewMatrix(true), h = TILE_W / 2; let ex = 0, ey = 0, z0 = Infinity, z1 = -Infinity
    for (const x of [-h, h]) for (const z of [-h, h]) for (const y of [lo, hi + 60]) { const v = Vector3.TransformCoordinates(new Vector3(x, y, z), V); ex = Math.max(ex, Math.abs(v.x)); ey = Math.max(ey, Math.abs(v.y)); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z) }
    if (z0 < LZ0 + 5 || z1 > LZ1 - 5) throw Error(`shadow depth range ${LZ0}..${LZ1} misses the tile (${z0.toFixed(0)}..${z1.toFixed(0)})`)   // SBIAS is derived from LZ0/LZ1
    ex += SM_FADE_M + 8; ey += SM_FADE_M + 8   // the fade band (shadowAt) lies outside the tile
    sm = shadowMapSize(D, 2 * ex, 2 * ey, SUN.y)   // the spec's texel target, on the ground (docs/proposals/engine-design.md §6)
    smTexel = new Vector2(1 / sm.w, 1 / sm.h)
    smFade = new Vector2(SM_FADE_M / (2 * ex), SM_FADE_M / (2 * ey))
    Object.assign(lightCam, { mode: Camera.ORTHOGRAPHIC_CAMERA, orthoLeft: -ex, orthoRight: ex, orthoTop: ey, orthoBottom: -ey, minZ: LZ0, maxZ: LZ1 })
  }
  const depthMat = new ShaderMaterial('depth', scene, { vertexSource: DEPTH_VS, fragmentSource: DEPTH_FS }, { attributes: ['position'], uniforms: ['world', 'viewProjection'] })
  depthMat.backFaceCulling = true; depthMat.sideOrientation = Material.CounterClockWiseSideOrientation   // render BACK faces into the depth map: kills self-shadow acne on lit faces
  const shadowRT = new RenderTargetTexture('shadowRT', { width: sm.w, height: sm.h }, scene, false, true, Constants.TEXTURETYPE_FLOAT, false, Texture.NEAREST_SAMPLINGMODE, true, false, false, Constants.TEXTUREFORMAT_R)
  shadowRT.activeCamera = lightCam; shadowRT.clearColor = new Color4(1, 1, 1, 1)
  const terrains = scene.meshes.filter(m => m.name === 't')
  // terrain is NOT a shadow caster: it self-shadowed into diagonal 'acne' stripes; slopes facing away are already dark via N·L
  // small plants don't cast either: thousands of tuft shadows streaked the ground along the sun direction
  shadowRT.renderList = scene.meshes.filter(m => m.name !== 'water' && m.name !== 'apron' && (m.name !== 't' || m === terrains[0]) && !/Grass|Flowers|Plant|Wheat/.test(m.name))
  for (const m of shadowRT.renderList) shadowRT.setMaterialForRendering(m, depthMat)
  shadowRT.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE; shadowRT.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
  scene.customRenderTargets.push(shadowRT)
  lightCam.computeWorldMatrix()
  const lightVP = lightCam.getViewMatrix(true).multiply(lightCam.getProjectionMatrix(true))
  for (const m of mats.all) { m.setTexture('uShadowMap', shadowRT); m.setMatrix('uLightVP', lightVP); m.setVector2('uSMTexel', smTexel); m.setVector2('uSMFade', smFade) }

  /* ---------- occlusion + valley-mist mask (CPU, once) ---------- */
  const aoCanvas = document.createElement('canvas'); aoCanvas.width = aoCanvas.height = AO_N; const aog = aoCanvas.getContext('2d')!
  {
    const N = Math.round(TILE_W / D.spec.sizes.aoCell), tmp = document.createElement('canvas')   // ~2.7 m cells: finer than the narrowest (4 m) channel
    tmp.width = tmp.height = N; const tg = tmp.getContext('2d')!, img = tg.createImageData(N, N), d = img.data
    // the rings read the heightfield, which reaches SPEC.aoMargin beyond the tile: cells at the edge see real ground
    const ring = (x: number, z: number, r: number) => { let s = 0; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; s += heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) } return s / 6 }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * TILE_W - TILE_W / 2, z = (j + 0.5) / N * TILE_W - TILE_W / 2, h = heightAt(x, z)
      const near = ring(x, z, 7), far = ring(x, z, D.spec.aoRing)
      const ao = 1 - Math.min(0.35, Math.max(0, (near - h) * 0.10))   // hollows and stream banks
      const valley = Math.min(1, Math.max(0, (far - h) / 3.2))         // low ground relative to 40 m around
      const k = (j * N + i) * 4; d[k] = 255; d[k + 1] = ao * 255; d[k + 2] = valley * valley * (3 - 2 * valley) * 255; d[k + 3] = 255
    }
    tg.putImageData(img, 0, 0); aog.imageSmoothingEnabled = true; aog.drawImage(tmp, 0, 0, AO_N, AO_N)
    aog.globalCompositeOperation = 'multiply'
    for (const [x, z, r, a] of canopy) {
      const px = (x + TILE_W / 2) / TILE_W * AO_N, pz = (z + TILE_W / 2) / TILE_W * AO_N, pr = Math.max(1.5, r / TILE_W * AO_N)
      const gr = aog.createRadialGradient(px, pz, 0, px, pz, pr); gr.addColorStop(0, `rgb(255,${Math.round(255 * (1 - a))},255)`); gr.addColorStop(1, 'rgb(255,255,255)')
      aog.fillStyle = gr; aog.beginPath(); aog.arc(px, pz, pr, 0, 7); aog.fill()
    }
  }
  const aoTex = new DynamicTexture('ao', aoCanvas, scene, true, Texture.BILINEAR_SAMPLINGMODE); aoTex.wrapU = aoTex.wrapV = Texture.CLAMP_ADDRESSMODE; aoTex.update(false)

  /* ---------- light-map bake: a top-down ortho render of the terrain, once ---------- */
  const bakeMat = mats.make('bake', TER_VS, BAKE_FS, { attributes: ['position', 'normal', 'aRiver'], samplers: ['uAOTex'], perFrame: false })   // never bind uLM (its own target) or update it per frame
  bakeMat.setTexture('uAOTex', aoTex); bakeMat.setTexture('uShadowMap', shadowRT); bakeMat.setMatrix('uLightVP', lightVP); bakeMat.setVector2('uSMTexel', smTexel)
  const lmCam = new FreeCamera('lmCam', new Vector3(0, 500, 0), scene); lmCam.setTarget(new Vector3(0, 0, 0.01))
  lmCam.mode = Camera.ORTHOGRAPHIC_CAMERA; Object.assign(lmCam, { orthoLeft: -TILE_W / 2, orthoRight: TILE_W / 2, orthoTop: TILE_W / 2, orthoBottom: -TILE_W / 2, minZ: 1, maxZ: 1000 })
  const lightMap = new RenderTargetTexture('lightmap', LM_N, scene, false, true, Constants.TEXTURETYPE_UNSIGNED_BYTE, false, Texture.BILINEAR_SAMPLINGMODE)
  lightMap.activeCamera = lmCam; lightMap.clearColor = new Color4(1, 1, 0, 1); lightMap.renderList = [terrains[0]]; lightMap.setMaterialForRendering(terrains[0], bakeMat)
  lightMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE; scene.customRenderTargets.push(lightMap)
  // the bake must see a COMPLETE shadow map: re-bake every time the shadow pass actually renders
  shadowRT.onAfterRenderObservable.add(() => lightMap.resetRefreshCounter())
  lmCam.computeWorldMatrix()
  const lmVP = lmCam.getViewMatrix(true).multiply(lmCam.getProjectionMatrix(true))
  for (const m of mats.all) { m.setTexture('uLM', lightMap); m.setMatrix('uLMVP', lmVP) }
  return { lightCam, shadowRT, lightMap, bakeMat, lightVP, smTexel, smSize: sm }
}
