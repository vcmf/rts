// The buildings' static light, baked once (docs/plans/active/building-light.md): what building.frag read per pixel and
// does not change with the view or the clock, at each texel of an atlas of one TILE² tile an instance, in the models'
// light UVs (aUV2, tools/building-to-js.py): R the sun's cast shadow on the surface (shadowAtRaw: 0 lit, 1 shadowed),
// G the light map's sky occlusion, B its mist mask, A its sun (shaders/building-bake.frag). Each face covers a texel
// however thin (its corners drawn as points and its edges as lines under it: the timber, the frames, the sails' sides
// are thinner than a texel), then DILATE texels round every island filled from the nearest written one (no seam where
// a read straddles an island's edge) and every texel left a neutral light. Baked after the light map, and again
// whenever it is (it rebakes after the sun's shadow map: a season's release, the leaves' drop) or the grain changes,
// once the light map holds for a frame (the start's chain of bakes makes one) and the buildings are drawn
// (__look.terrainOnly hides them: a bake then would be empty). And the light the ground bounces onto each building, at
// its root (bounceAt: the ground's class, its season and snow, the light map's sun there): one texel an instance of an
// N × 1 target, rebaked with the ground's bounce map (the season, the shadows, the grain); the runtime fades it with
// the height. WebGL2 only (the reads are GLSL ES 3's: textureLod, texelFetch): WebGL1 takes the runtime's taps (main.ts)
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { EffectRenderer, EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js'
import { Material } from '@babylonjs/core/Materials/material.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
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
// coarser than MAX_LOD: a read at level L reaches REACH texels past the texel it is in, and the islands' texels are at
// least MIN_GAP apart (the export fails otherwise: tools/building-to-js.py), so the dilation's nearest-island fill
// never brings a neighbour's light in (level 2 would need 9: the islands, 550 to 760 a model, cannot keep that apart).
// At the widest zoom, 720p, 93 to 98 % of a building's pixels want a level under 2, 65 to 89 % level 0 (measured): the
// clamp under-filters the rest. (A clamp in the shader, not the texture's TEXTURE_MAX_LEVEL: Babylon sets that only on
// cube maps, and set by hand on its texture it would be lost on a context's restore.) A tile's side divides by its
// level-MAX_LOD blocks and its islands keep INSET texels (one block) from its edge, so no read reaches a neighbour's
// tile; DILATE covers the reach, and past it every texel is a neutral light (sunlit, open sky, no mist), so nothing
// unwritten ever darkens an edge
export const TILE = 256, COLS = 4, MAX_LOD = 1, INSET = 1 << MAX_LOD, DILATE = 4
export const REACH = 1 << MAX_LOD, MIN_GAP = 2 * REACH + 1
// the neutral light (R no cast shadow, G open sky, B no mist, A full sun)
const NEUTRAL = new Color4(0, 1, 0, 1)
// the atlas for n instances: COLS tiles a row; inner: a tile's islands' square, in the atlas's UVs (BLD_TILE)
export function atlasLayout(n: number): { cols: number; rows: number; width: number; height: number; inner: [number, number] } {
  const rows = Math.ceil(n / COLS), width = COLS * TILE, height = rows * TILE
  return { cols: COLS, rows, width, height, inner: [(TILE - 2 * INSET) / width, (TILE - 2 * INSET) / height] }
}
// the bounce's layer: only its own camera sees its quads; the bake's outlines': no camera sees them
const BOUNCE_LAYER = 0x10000000, OUTLINE_LAYER = 0x20000000

// each instance: the mesh it is a thin instance of, its root (x, y, z); its place in the list its tile (tileOf) and its
// bounce texel (the mesh's thin instances in the list's order)
export interface LitInstance { mesh: Mesh; root: [number, number, number] }
export interface BuildingLight { atlas: RenderTargetTexture; raw: RenderTargetTexture; bounce: RenderTargetTexture | null; ms: () => number | null; baked: () => number; bytes: number }

// the tile of instance i in the atlas, as the shaders take it (aTile: offset x, y and size x, y, in the atlas's UVs)
export function tileOf(i: number, n: number): [number, number, number, number] {
  const { width: w, height: h } = atlasLayout(n), cx = i % COLS, cy = Math.floor(i / COLS)
  return [(cx * TILE + INSET) / w, (cy * TILE + INSET) / h, (TILE - 2 * INSET) / w, (TILE - 2 * INSET) / h]
}

// clear a target to a colour once (its mips made as it unbinds, if it has them)
function clearTo(scene: Scene, t: RenderTargetTexture, c: Color4): void {
  const engine = scene.getEngine(), rt = t.renderTarget
  if (!rt) throw new Error(`${t.name} has no render target`)
  engine.bindFramebuffer(rt); engine.clear(c, true, false, false); engine.unBindFramebuffer(rt)
}

// a bake run by hand: armed by what it reads, run before a frame once that held for a frame (no new arming: a chain of
// bakes makes one) and what it draws is on and ready; first drawn (on its first run) by joining the scene's targets
function scheduled(scene: Scene, t: RenderTargetTexture, ready: () => boolean): { arm: () => void } {
  let due = 0
  scene.onBeforeRenderObservable.add(() => {
    if (!due || --due) return
    if (!ready()) { due = 1; return }
    if (scene.customRenderTargets.includes(t)) t.resetRefreshCounter(); else scene.customRenderTargets.push(t)
  })
  return { arm: () => { due = 2 } }
}

// a model's faces as points and lines, for the bake: its corners and edges (a face thinner than a texel covers none of
// its centres: these cover one), drawn under its faces, only by the bake (their layer no camera sees)
function bakeOutlines(scene: Scene, m: Mesh, tiles: Float32Array, mats: { points: ShaderMaterial; lines: ShaderMaterial }): Mesh[] {
  const idx = m.getIndices(), pos = m.getVerticesData(VertexBuffer.PositionKind), nrm = m.getVerticesData(VertexBuffer.NormalKind), uv2 = m.getVerticesData('aUV2')
  if (!idx || !pos || !nrm || !uv2) throw new Error(`${m.name} lacks the bake's vertex data`)
  const edges = new Set<number>(), nv = pos.length / 3
  for (let f = 0; f < idx.length; f += 3) for (let k = 0; k < 3; k++) { const a = idx[f + k], b = idx[f + (k + 1) % 3]; edges.add(Math.min(a, b) * nv + Math.max(a, b)) }
  const lineIdx: number[] = []; for (const e of edges) lineIdx.push(Math.floor(e / nv), e % nv)
  return ([['points', Array.from(idx)], ['lines', lineIdx]] as const).map(([kind, ix]) => {
    const o = new Mesh(`${m.name}_bake_${kind}`, scene)
    o.setVerticesData(VertexBuffer.PositionKind, pos); o.setVerticesData(VertexBuffer.NormalKind, nrm); o.setVerticesData('aUV2', uv2, false, 2); o.setIndices(ix)
    o.material = mats[kind]; o.layerMask = OUTLINE_LAYER; o.alwaysSelectAsActiveMesh = true
    o.thinInstanceSetBuffer('matrix', new Float32Array(m.thinInstanceGetWorldMatrices().flatMap(w => Array.from(w.asArray()))), 16, true); o.thinInstanceSetBuffer('aTile', tiles, 3, true)
    return o
  })
}

// bounce: the ground's bounce on the walls (?bldbounce=0 without: no target, no quad); timed: each bake's time, read
// back (it waits for the GPU: the bench and the checks only)
export function buildBuildingLight(scene: Scene, mats: Materials, bakes: Bakes, meshes: Mesh[], instances: LitInstance[], { bounce: withBounce = true, timed = false } = {}): BuildingLight {
  if (mats.webgl1) throw new Error('the buildings\' light bake needs WebGL2 (main.ts takes the runtime\'s taps on WebGL1)')
  const engine = scene.getEngine(), n = instances.length, lay = atlasLayout(n), { width, height } = lay
  // the atlas: its texels as baked (nearest: the dilation reads them whole), and the dilated one the buildings read,
  // mipmapped (its chain made as the dilation's pass unbinds it: the engine's, for a target made with mips), a neutral
  // light until the first bake
  const opts = { generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: Texture.NEAREST_SAMPLINGMODE }
  const size = { width, height }
  const raw = new RenderTargetTexture('bldLightRaw', size, scene, opts)
  const atlas = new RenderTargetTexture('bldLight', size, scene, { ...opts, generateMipMaps: true, samplingMode: Texture.TRILINEAR_SAMPLINGMODE })
  for (const t of [raw, atlas]) t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
  clearTo(scene, atlas, NEUTRAL)
  raw.clearColor = new Color4(0, 0, 0, 0); raw.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  const tileDef = `#define BLD_TILE vec2(${lay.inner[0].toFixed(8)},${lay.inner[1].toFixed(8)})`
  const bakeMat = (name: string, fillMode: number) => {
    const b = mats.make(name, BAKE_VS, BAKE_FS, { attributes: ['position', 'normal', 'aUV2', 'aTile'], defines: [tileDef] })
    b.backFaceCulling = false; b.fillMode = fillMode; return b
  }
  const bake = bakeMat('bldBake', Material.TriangleFillMode), outlineMats = { points: bakeMat('bldBakePoints', Material.PointListDrawMode), lines: bakeMat('bldBakeLines', Material.LineListDrawMode) }
  for (const m of meshes) raw.setMaterialForRendering(m, bake)
  // the outlines under the faces: drawn first (the list's order; no depth: the faces' texels then the faces' own)
  const outlines = meshes.flatMap(m => {
    const tiles = new Float32Array(instances.flatMap((it, i) => it.mesh === m ? [...tileOf(i, n).slice(0, 2), i] : []))
    return bakeOutlines(scene, m, tiles, outlineMats)
  })
  raw.renderList = [...outlines, ...meshes]
  const order = new Map(raw.renderList.map((m, i) => [m, i]))
  raw.setRenderingOrder(0, (a, b) => (order.get(a.getMesh() as Mesh) ?? 0) - (order.get(b.getMesh() as Mesh) ?? 0))
  // the dilation: each unwritten texel (A 0) the nearest written one within DILATE texels, or the neutral light
  const dilate = new EffectWrapper({ engine, name: 'bldLightDilate', fragmentShader: `precision highp float;varying vec2 vUV;uniform sampler2D uSrc;uniform vec2 uTexel;
void main(){vec4 c=texture2D(uSrc,vUV);if(c.a>0.0){gl_FragColor=c;return;}
  vec4 best=vec4(${NEUTRAL.r.toFixed(1)},${NEUTRAL.g.toFixed(1)},${NEUTRAL.b.toFixed(1)},${NEUTRAL.a.toFixed(1)});float bd=1e9;
  for(int y=-${DILATE};y<=${DILATE};y++)for(int x=-${DILATE};x<=${DILATE};x++){vec4 t=texture2D(uSrc,vUV+vec2(float(x),float(y))*uTexel);float d=float(x*x+y*y);if(t.a>0.0&&d<bd){bd=d;best=t;}}
  gl_FragColor=best;}`, uniformNames: ['uTexel'], samplerNames: ['uSrc'] })
  const renderer = new EffectRenderer(engine)
  dilate.onApplyObservable.add(() => { dilate.effect.setTexture('uSrc', raw); dilate.effect.setFloat2('uTexel', 1 / width, 1 / height) })
  let t0 = 0, ms: number | null = null, grain = mats.grain.uniqueId, count = 0
  const drawn = [...meshes, ...outlines]
  const light = scheduled(scene, raw, () => drawn.every(m => m.isEnabled() && m.isReady(true)) && meshes.every(m => bake.isReady(m, true)) && dilate.effect.isReady())
  raw.onBeforeRenderObservable.add(() => { t0 = performance.now(); grain = mats.grain.uniqueId })
  raw.onAfterRenderObservable.add(() => {
    renderer.render(dilate, atlas); count++
    if (!timed) return
    // (a texel read back waits for the GPU: the bake's time includes its work)
    const gl = (engine as unknown as { _gl: WebGL2RenderingContext })._gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    ms = performance.now() - t0
  })
  bakes.lightMap.onAfterRenderObservable.add(light.arm)
  // (the grain jitters the shadow's taps: a new one, a new bake)
  scene.onBeforeRenderObservable.add(() => { if (mats.grain.uniqueId !== grain) { grain = mats.grain.uniqueId; light.arm() } })
  const bytes = Math.round(width * height * 4 * (1 + 4 / 3))   // (raw, the atlas with its mips)
  if (!withBounce) return { atlas, raw, bounce: null, ms: () => ms, baked: () => count, bytes }
  // the bounce: a quad an instance on its texel, seen only by its own camera; none until the ground's is baked
  const bounce = new RenderTargetTexture('bldBounce', { width: n, height: 1 }, scene, { ...opts, type: Constants.TEXTURETYPE_HALF_FLOAT })
  clearTo(scene, bounce, new Color4(0, 0, 0, 1))
  const quad = CreatePlane('bldBounceQuad', { size: 2 }, scene); quad.layerMask = BOUNCE_LAYER; quad.alwaysSelectAsActiveMesh = true
  const roots = new Float32Array(n * 4); instances.forEach((it, i) => roots.set([...it.root, i], i * 4))
  const ident = new Float32Array(n * 16); for (let i = 0; i < n; i++) ident.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16)
  quad.thinInstanceSetBuffer('matrix', ident, 16, true); quad.thinInstanceSetBuffer('aRoot', roots, 4, true)
  const bm = mats.make('bldBounce', BOUNCE_VS, BOUNCE_FS, { attributes: ['position', 'aRoot'], uniforms: ['uN'] }); bm.backFaceCulling = false; bm.setFloat('uN', n)
  quad.material = bm
  const cam = new FreeCamera('bldBounceCam', new Vector3(0, 10, 0), scene); cam.layerMask = BOUNCE_LAYER; cam.mode = Camera.ORTHOGRAPHIC_CAMERA
  bounce.activeCamera = cam; bounce.renderList = [quad]; bounce.clearColor = new Color4(0, 0, 0, 1); bounce.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  bakes.groundBounce.onAfterRenderObservable.add(scheduled(scene, bounce, () => quad.isEnabled() && quad.isReady(true)).arm)
  return { atlas, raw, bounce, ms: () => ms, baked: () => count, bytes: bytes + n * 8 }   // (and the bounce)
}
