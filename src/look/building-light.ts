// The buildings' static light, baked once (docs/plans/active/building-light.md): what building.frag read per pixel and
// does not change with the view or the clock, at each texel of an atlas of one TILE² tile an instance, in the models'
// light UVs (aUV2, tools/building-to-js.py): R the sun's visibility off the surface, G the light map's sky occlusion,
// B its mist mask, A its sun (shaders/building-bake.frag); then DILATE texels round every island filled from the nearest
// written one (no seam where a read straddles an island's edge) and every texel left a neutral light. Baked after the
// light map, and again whenever it is (it rebakes after the sun's shadow map: a season's release, the leaves' drop, a
// new grain: bakes.ts), once the buildings are drawn (__look.terrainOnly hides them: a bake then would be empty). And the light
// the ground bounces onto each building, at its root (bounceAt: the ground's class, its season and snow, the light
// map's sun there): one texel an instance of an N × 1 target, rebaked with the ground's bounce map (the season, the
// shadows, the grain); the runtime fades it with the height. WebGL2 only (the reads are GLSL ES 3's: textureLod,
// texelFetch): WebGL1 takes the runtime's taps (main.ts)
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

// a tile's side, texels (the light UVs' islands cover about a fifth of it: about 17 cm a texel on a house, 21 on the
// windmill, measured, the sun's shadow map's on the ground about 20), the atlas's columns. Mipmapped (minified without
// mips, at the default zoom, its reads missed the texture cache: 1.1 ms over the runtime's taps, measured), read no
// coarser than MAX_LOD: a level-1 read reaches 2 texels past an island's edge, and the islands are at least 5 apart
// (tools/building-to-js.py, LIGHT_MARGIN), so the dilation's nearest-island fill never brings a neighbour's light in
// (level 2 would reach 5: the islands, 550 to 760 a model, cannot keep 12 apart). At the widest zoom, 720p, 93 to 98 %
// of a building's pixels want a level under 2, 65 to 89 % level 0 (measured): the clamp under-filters the rest. A tile's
// side divides by its level-MAX_LOD blocks and its islands keep INSET texels (one block) from its edge, so no read
// reaches a neighbour's tile; DILATE covers the reach, and past it every texel is a neutral light (sunlit, open sky, no
// mist), so nothing unwritten ever darkens an edge
export const TILE = 256, COLS = 4, MAX_LOD = 1, INSET = 1 << MAX_LOD, DILATE = 4
// the atlas for n instances: COLS tiles a row
export function atlasLayout(n: number): { cols: number; rows: number; width: number; height: number } {
  const rows = Math.ceil(n / COLS)
  return { cols: COLS, rows, width: COLS * TILE, height: rows * TILE }
}
// the bounce's layer: only its own camera sees its quads
const BOUNCE_LAYER = 0x10000000

// each instance: the mesh it is a thin instance of, its root (x, y, z); its place in the list its tile (tileOf) and its
// bounce texel
export interface LitInstance { mesh: Mesh; root: [number, number, number] }
export interface BuildingLight { atlas: RenderTargetTexture; bounce: RenderTargetTexture | null; ms: () => number | null; bytes: number }

// the tile of instance i in the atlas, as the shaders take it (aTile: offset x, y and size x, y, in the atlas's UVs)
export function tileOf(i: number, n: number): [number, number, number, number] {
  const { width: w, height: h } = atlasLayout(n), cx = i % COLS, cy = Math.floor(i / COLS)
  return [(cx * TILE + INSET) / w, (cy * TILE + INSET) / h, (TILE - 2 * INSET) / w, (TILE - 2 * INSET) / h]
}

// bounce: the ground's bounce on the walls (?bldbounce=0 without: no target, no quad); timed: each bake's time, read
// back (it waits for the GPU: the bench and the checks only)
export function buildBuildingLight(scene: Scene, mats: Materials, bakes: Bakes, meshes: Mesh[], instances: LitInstance[], { bounce: withBounce = true, timed = false } = {}): BuildingLight {
  if (mats.webgl1) throw new Error('the buildings\' light bake needs WebGL2 (main.ts takes the runtime\'s taps on WebGL1)')
  const engine = scene.getEngine(), n = instances.length, { width, height } = atlasLayout(n)
  // the atlas: its texels as baked (nearest: the dilation reads them whole), and the dilated one the buildings read,
  // mipmapped (its chain made as the dilation's pass unbinds it: the engine's, for a target made with mips)
  const opts = { generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: Texture.NEAREST_SAMPLINGMODE }
  const size = { width, height }
  const raw = new RenderTargetTexture('bldLightRaw', size, scene, opts)
  const atlas = new RenderTargetTexture('bldLight', size, scene, { ...opts, generateMipMaps: true, samplingMode: Texture.TRILINEAR_SAMPLINGMODE })
  for (const t of [raw, atlas]) t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
  raw.clearColor = new Color4(0, 0, 0, 0); raw.renderList = meshes; raw.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  const bake = mats.make('bldBake', BAKE_VS, BAKE_FS, { attributes: ['position', 'normal', 'aUV2', 'aTile'] })
  bake.backFaceCulling = false
  for (const m of meshes) raw.setMaterialForRendering(m, bake)
  // the dilation: each unwritten texel (A 0) the nearest written one within DILATE texels, or the neutral light
  const dilate = new EffectWrapper({ engine, name: 'bldLightDilate', fragmentShader: `precision highp float;varying vec2 vUV;uniform sampler2D uSrc;uniform vec2 uTexel;
void main(){vec4 c=texture2D(uSrc,vUV);if(c.a>0.0){gl_FragColor=c;return;}
  vec4 best=vec4(1.0,1.0,0.0,1.0);float bd=1e9;
  for(int y=-${DILATE};y<=${DILATE};y++)for(int x=-${DILATE};x<=${DILATE};x++){vec4 t=texture2D(uSrc,vUV+vec2(float(x),float(y))*uTexel);float d=float(x*x+y*y);if(t.a>0.0&&d<bd){bd=d;best=t;}}
  gl_FragColor=best;}`, uniformNames: ['uTexel'], samplerNames: ['uSrc'] })
  const renderer = new EffectRenderer(engine)
  dilate.onApplyObservable.add(() => { dilate.effect.setTexture('uSrc', raw); dilate.effect.setFloat2('uTexel', 1 / width, 1 / height) })
  let t0 = 0, ms: number | null = null
  raw.onBeforeRenderObservable.add(() => { t0 = performance.now() })
  raw.onAfterRenderObservable.add(() => {
    if (!dilate.effect.isReady()) { raw.resetRefreshCounter(); return }   // (again next frame: its shader not compiled yet)
    renderer.saveStates(); renderer.render(dilate, atlas); renderer.restoreStates()
    if (!timed) return
    // (a texel read back waits for the GPU: the bake's time includes its work)
    const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    ms = performance.now() - t0
  })
  scene.customRenderTargets.push(raw)
  // a bake armed by its source and run once what it draws is on (a bake of hidden meshes would be empty: black)
  const armed = (t: RenderTargetTexture, drawn: Mesh[]) => {
    let due = false
    scene.onBeforeRenderObservable.add(() => { if (due && drawn.every(m => m.isEnabled())) { due = false; t.resetRefreshCounter() } })
    return () => { due = true }
  }
  bakes.lightMap.onAfterRenderObservable.add(armed(raw, meshes))
  if (!withBounce) return { atlas, bounce: null, ms: () => ms, bytes: Math.round(width * height * 4 * (1 + 4 / 3)) }   // (raw, the atlas with its mips)
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
  bakes.groundBounce.onAfterRenderObservable.add(armed(bounce, [quad]))
  return { atlas, bounce, ms: () => ms, bytes: Math.round(width * height * 4 * (1 + 4 / 3)) + n * 8 }   // (raw, the atlas with its mips, the bounce)
}
