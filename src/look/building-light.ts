// The buildings' static light, baked once (docs/plans/active/building-light.md): what building.frag read per pixel and
// does not change with the view or the clock, at each texel of an atlas of one TILE² tile an instance, in the models'
// light UVs (aUV2, tools/building-to-js.py): R the sun's visibility off the surface, G the light map's sky occlusion,
// B its mist mask, A its sun (shaders/building-bake.frag); then four texels round every island filled from the nearest
// written one (no seam where a read straddles an island's edge). Baked after the light map, and again whenever it is
// (it rebakes after the sun's shadow map: a season's release, the leaves' drop, a new grain: bakes.ts). And the light
// the ground bounces onto each building, at its root (bounceAt: the ground's class, its season and snow, the light
// map's sun there): one texel an instance of an N × 1 target, rebaked with the ground's bounce map (the season, the
// shadows, the grain); the runtime fades it with the height
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { EffectRenderer, EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import type { Bakes } from './bakes.ts'
import BAKE_VS from './shaders/building-bake.vert?raw'
import BAKE_FS from './shaders/building-bake.frag?raw'
import BOUNCE_VS from './shaders/building-bounce.vert?raw'
import BOUNCE_FS from './shaders/building-bounce.frag?raw'

// a tile's side, texels (a house's about 350 m² of walls and roof at about 60 % packing: about 9.5 cm a texel, finer
// than the sun's shadow map on the ground, about 20 cm), the atlas's columns. Mipmapped (minified without mips, at the
// default zoom, its reads missed the texture cache: 1.1 ms over the runtime's taps, measured), read no coarser than
// MAX_LOD (an 8 × 8 block a texel: about 76 cm on a house, enough for the widest zoom): a tile's side divides by its
// blocks, so no block of a level up to MAX_LOD straddles two tiles, and a tile's islands keep INSET texels (one level-
// MAX_LOD block) from its edge, so no bilinear read at those levels reaches a neighbour's; the dilation fills
// DILATE_PASSES × DILATE texels round every island (a block's side at MAX_LOD), so no unwritten texel darkens an edge
export const TILE = 256, COLS = 4, MAX_LOD = 3, INSET = 1 << MAX_LOD, DILATE = 4, DILATE_PASSES = 2
// the bounce's layer: only its own camera sees its quads
const BOUNCE_LAYER = 0x10000000

// each instance's place: its mesh, its index within the mesh's thin instances, its root (x, y, z)
export interface LitInstance { mesh: Mesh; root: [number, number, number] }
export interface BuildingLight { atlas: RenderTargetTexture; bounce: RenderTargetTexture; ms: () => number | null; bytes: number }

// the tile of instance i in the atlas, as the shaders take it (aTile: offset x, y and size x, y, in the atlas's UVs)
export function tileOf(i: number, n: number): [number, number, number, number] {
  const rows = Math.ceil(n / COLS), w = COLS * TILE, h = rows * TILE, cx = i % COLS, cy = Math.floor(i / COLS)
  return [(cx * TILE + INSET) / w, (cy * TILE + INSET) / h, (TILE - 2 * INSET) / w, (TILE - 2 * INSET) / h]
}

export function buildBuildingLight(scene: Scene, mats: Materials, bakes: Bakes, meshes: Mesh[], instances: LitInstance[]): BuildingLight {
  const engine = scene.getEngine(), n = instances.length, rows = Math.ceil(n / COLS)
  // the atlas: its texels as baked and a scratch (nearest: the dilation reads them whole), and the dilated one the
  // buildings read, mipmapped (its chain made after the dilation)
  const opts = { generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: Texture.NEAREST_SAMPLINGMODE }
  const size = { width: COLS * TILE, height: rows * TILE }
  const raw = new RenderTargetTexture('bldLightRaw', size, scene, opts), mid = new RenderTargetTexture('bldLightMid', size, scene, opts)
  const atlas = new RenderTargetTexture('bldLight', size, scene, { ...opts, generateMipMaps: true, samplingMode: Texture.TRILINEAR_SAMPLINGMODE })
  for (const t of [raw, mid, atlas]) t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
  raw.clearColor = new Color4(0, 0, 0, 0); raw.renderList = meshes; raw.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  const bake = mats.make('bldBake', BAKE_VS, BAKE_FS, { attributes: ['position', 'normal', 'aUV2', 'aTile'] })
  bake.backFaceCulling = false
  for (const m of meshes) raw.setMaterialForRendering(m, bake)
  // the dilation: each unwritten texel (A 0) the nearest written one within DILATE texels
  const dilate = new EffectWrapper({ engine, name: 'bldLightDilate', fragmentShader: `precision highp float;varying vec2 vUV;uniform sampler2D uSrc;uniform vec2 uTexel;
void main(){vec4 c=texture2D(uSrc,vUV);if(c.a>0.0){gl_FragColor=c;return;}
  vec4 best=vec4(0.0);float bd=1e9;
  for(int y=-${DILATE};y<=${DILATE};y++)for(int x=-${DILATE};x<=${DILATE};x++){vec4 t=texture2D(uSrc,vUV+vec2(float(x),float(y))*uTexel);float d=float(x*x+y*y);if(t.a>0.0&&d<bd){bd=d;best=t;}}
  gl_FragColor=best;}`, uniformNames: ['uTexel'], samplerNames: ['uSrc'] })
  const renderer = new EffectRenderer(engine)
  let src: RenderTargetTexture = raw
  dilate.onApplyObservable.add(() => { dilate.effect.setTexture('uSrc', src); dilate.effect.setFloat2('uTexel', 1 / (COLS * TILE), 1 / (rows * TILE)) })
  let t0 = 0, ms: number | null = null
  raw.onBeforeRenderObservable.add(() => { t0 = performance.now() })
  raw.onAfterRenderObservable.add(() => {
    if (!dilate.effect.isReady()) { raw.resetRefreshCounter(); return }   // (again next frame: its shader not compiled yet)
    // (DILATE_PASSES passes, raw to the scratch to the atlas: two)
    renderer.saveStates(); src = raw; renderer.render(dilate, mid); src = mid; renderer.render(dilate, atlas); renderer.restoreStates()
    const it = atlas.getInternalTexture(); if (it) engine.generateMipmaps(it)
    // (a texel read back waits for the GPU: the bake's time includes its work)
    const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    ms = performance.now() - t0
  })
  scene.customRenderTargets.push(raw)
  bakes.lightMap.onAfterRenderObservable.add(() => raw.resetRefreshCounter())
  // the bounce: a quad an instance on its texel, seen only by its own camera
  const bounce = new RenderTargetTexture('bldBounce', { width: n, height: 1 }, scene, { ...opts, type: Constants.TEXTURETYPE_HALF_FLOAT })
  const quad = CreatePlane('bldBounceQuad', { size: 2 }, scene); quad.layerMask = BOUNCE_LAYER; quad.alwaysSelectAsActiveMesh = true
  const roots = new Float32Array(n * 4); instances.forEach((it, i) => roots.set([...it.root, i], i * 4))
  const ident = new Float32Array(n * 16); for (let i = 0; i < n; i++) ident.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16)
  quad.thinInstanceSetBuffer('matrix', ident, 16, true); quad.thinInstanceSetBuffer('aRoot', roots, 4, true)
  const bm = mats.make('bldBounce', BOUNCE_VS, BOUNCE_FS, { attributes: ['position', 'aRoot'], uniforms: ['uN'] }); bm.backFaceCulling = false; bm.setFloat('uN', n)
  quad.material = bm
  const cam = new FreeCamera('bldBounceCam', new Vector3(0, 10, 0), scene); cam.layerMask = BOUNCE_LAYER; cam.mode = Camera.ORTHOGRAPHIC_CAMERA
  bounce.activeCamera = cam; bounce.renderList = [quad]; bounce.clearColor = new Color4(0, 0, 0, 1); bounce.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  scene.customRenderTargets.push(bounce)
  bakes.groundBounce.onAfterRenderObservable.add(() => bounce.resetRefreshCounter())
  return { atlas, bounce, ms: () => ms, bytes: Math.round(COLS * TILE * rows * TILE * 4 * (2 + 4 / 3)) + n * 8 }   // (raw, scratch, the atlas with its mips)
}
