// Static light, baked once (docs/art-bible.md §6b, docs/proposals/engine-design.md §6), ported from
// prototypes/painted-cinematic.html: a sun shadow depth pass, a CPU occlusion and valley-mist mask, and a top-down
// light map (R sun visibility, G occlusion, B valley mask, A the contact under trees) the materials read. Trees keep a
// small runtime lookup of the shadow map for self-shadowing.
import { TILE_O } from './tile.ts'
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
import { Mesh as MeshCtor } from '@babylonjs/core/Meshes/mesh.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import { SUN, type Materials } from './materials.ts'
import { heightAt } from './heightfield.ts'
import { D, shadowMapSize, type RingBakes } from './spec.ts'
import type { Nature } from './nature.ts'
import TER_VS from './shaders/terrain.vert?raw'
import DEPTH_VS from './shaders/depth.vert?raw'
import DEPTH_FS from './shaders/depth.frag?raw'
import BAKE_FS from './shaders/bake.frag?raw'
import GB_FS from './shaders/gbounce.frag?raw'
import SHADE_FS from './shaders/unitshade.frag?raw'
import TRUNK_VS from './shaders/trunkshadow.vert?raw'
import TRUNK_FS from './shaders/trunkshadow.frag?raw'
import CARD_DEPTH_VS from './shaders/canopy-depth.vert?raw'
import CARD_DEPTH_FS from './shaders/canopy-depth.frag?raw'
import { withCards } from './canopy.ts'

// sky: the sky's occlusion's time on load and the occlusion's range after it (null with the soft shadows off)
// groundBounce: the bounce map (LC5), rebaked after the light map and when the season is released (src/look/main.ts)
// unitShade: the simple shadows' shade (decision 0049), made when first asked for (the
// armies), rebaked after the bounce map
export interface Bakes {
  lightCam: FreeCamera
  shadowRT: RenderTargetTexture
  lightMap: RenderTargetTexture
  groundBounce: RenderTargetTexture
  bakeMat: ShaderMaterial
  lightVP: Matrix
  smTexel: Vector2
  sky: SkyBake | null
  unitShade(desat?: number): RenderTargetTexture
}
export interface SkyBake {
  ms: number
  min: number
  mean: number
}

const TILE_W = D.spec.tile
const AO_N = D.spec.sizes.aoTex
const LM_N = D.spec.sizes.lightMap
const LZ0 = D.spec.depth.near
const LZ1 = D.spec.depth.far
const SM_FADE_M = D.spec.shadowFade

// soft shadows (docs/plans/done/soft-shadows.md): on, the sun's penumbra grows with the distance to
// the caster (penumbra: metres of edge radius per metre, an exaggerated sun) and the sky's occlusion
// comes from each crown's sphere
export interface SoftOptions {
  on: boolean
  penumbra: number
}
export const SOFT_DEFAULTS: SoftOptions = { on: true, penumbra: 0.06 }
export const PENUMBRA_MAX = 0.2 // past it the search's 16 taps spread too thin and leave the shadow map's margin
// the painted materials' defines the soft shadows need (Materials), from the same options as the bakes
export const softDefines = (soft: SoftOptions): string[] => (soft.on ? ['#define SKY_IN_SHADOW'] : [])
const SKY_REACH = 25 // m: a sphere farther than this hides too little sky to count
const INSIDE = 0.42 // the most sky one sphere hides, times its opacity (0.29 for a crown: the old disc was 0.42)
// the bounce map (LC5): texels a side over the tile (1.6 m), and its gather's tap spacing and Gaussian sigma, m
const GB_N = 512
const GB_STEP = 2.7
const GB_SIGMA = 4.5
// the trunks' baked shadows: how dark at full strength (times the sun), and a layer no camera of the game sees
const TRUNK_DARK = 0.85
const LM_ONLY = 0x10000000
// m along the light: the farthest caster the penumbra search reaches (a 18 m crown top at the sun's 27°)
const FAR_MAX = 40

export function buildBakes(
  scene: Scene,
  mats: Materials,
  water: BaseTexture,
  tileGround: Mesh,
  canopy: Nature['canopy'],
  cardCasters: Nature['cardCasters'] | undefined,
  soft: SoftOptions,
  trunks: Nature['trunks'] = [],
  farCull: Nature['farCull'] = null,
  ring: RingBakes | null = null,
): Bakes {
  /* ---------- shadow pass: an orthographic camera at the sun, depth of every caster, rendered ONCE ---------- */
  // (about the tile's centre: src/look/tile.ts)
  const T = new Vector3(TILE_O.x, 0, TILE_O.y)
  const lightCam = new FreeCamera('lightCam', SUN.scale(700).addInPlace(T), scene)
  lightCam.setTarget(T)
  let smTexel: Vector2
  let smFade: Vector2
  let sm: { w: number; h: number }
  let smGround: Vector2
  // fit the ortho box to the tile: project its corners (lowest ground to 60 m above the highest,
  // above any caster) into light space
  {
    const tp = tileGround.getVerticesData(VertexBuffer.PositionKind)!
    let lo = Infinity
    let hi = -Infinity
    for (let k = 1; k < tp.length; k += 3) {
      lo = Math.min(lo, tp[k])
      hi = Math.max(hi, tp[k])
    }
    const V = lightCam.getViewMatrix(true)
    const h = TILE_W / 2
    let ex = 0
    let ey = 0
    let z0 = Infinity
    let z1 = -Infinity
    for (const x of [T.x - h, T.x + h]) {
      for (const z of [T.z - h, T.z + h]) {
        for (const y of [lo, hi + 60]) {
          const v = Vector3.TransformCoordinates(new Vector3(x, y, z), V)
          ex = Math.max(ex, Math.abs(v.x))
          ey = Math.max(ey, Math.abs(v.y))
          z0 = Math.min(z0, v.z)
          z1 = Math.max(z1, v.z)
        }
      }
    }
    // SBIAS is derived from LZ0/LZ1
    if (z0 < LZ0 + 5 || z1 > LZ1 - 5) {
      throw Error(`shadow depth range ${LZ0}..${LZ1} misses the tile (${z0.toFixed(0)}..${z1.toFixed(0)})`)
    }
    // the fade band (shadowAt) lies outside the tile
    ex += SM_FADE_M + 8
    ey += SM_FADE_M + 8
    // the spec's texel target, on the ground (docs/proposals/engine-design.md §6)
    sm = shadowMapSize(D, 2 * ex, 2 * ey, SUN.y, ring)
    smTexel = new Vector2(1 / sm.w, 1 / sm.h)
    // a shadow texel on the ground, m (about square)
    smGround = new Vector2((2 * ex) / sm.w, (2 * ey) / (sm.h * SUN.y))
    smFade = new Vector2(SM_FADE_M / (2 * ex), SM_FADE_M / (2 * ey))
    Object.assign(lightCam, {
      mode: Camera.ORTHOGRAPHIC_CAMERA,
      orthoLeft: -ex,
      orthoRight: ex,
      orthoTop: ey,
      orthoBottom: -ey,
      minZ: LZ0,
      maxZ: LZ1,
    })
  }
  const depthMat = new ShaderMaterial(
    'depth',
    scene,
    { vertexSource: DEPTH_VS, fragmentSource: DEPTH_FS },
    { attributes: ['position'], uniforms: ['world', 'viewProjection'] },
  )
  // render BACK faces into the depth map: kills self-shadow acne on lit faces
  depthMat.backFaceCulling = true
  depthMat.sideOrientation = Material.CounterClockWiseSideOrientation
  const shadowRT = new RenderTargetTexture(
    'shadowRT',
    { width: sm.w, height: sm.h },
    scene,
    false,
    true,
    Constants.TEXTURETYPE_FLOAT,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    true,
    false,
    false,
    Constants.TEXTUREFORMAT_R,
  )
  shadowRT.activeCamera = lightCam
  shadowRT.clearColor = new Color4(1, 1, 1, 1)
  const terrains = scene.meshes.filter(m => m.name === 't')
  // terrain is NOT a shadow caster: it self-shadowed into diagonal 'acne' stripes; slopes
  // facing away are already dark via N·L
  // small plants don't cast either: thousands of tuft shadows streaked the ground along the sun direction.
  // Under cards (docs/plans/done/l7a-canopy-cards.md) the carded pack models cast nothing; their
  // trunk meshes cast with the rest, and the crowns cast through their cards, turned to face the sun and cut by the
  // leaf atlas (below). Known issue #63: their leafy shadow costs a dark coat its separation in the guard
  shadowRT.renderList = scene.meshes.filter(
    m =>
      m.name !== 'water' &&
      m.name !== 'apron' &&
      (m.name !== 't' || m === terrains[0]) &&
      !/Grass|Flowers|Plant|Wheat|^cards_/.test(m.name) &&
      !cardCasters?.packs.includes(m as Mesh),
  )
  for (const m of shadowRT.renderList) shadowRT.setMaterialForRendering(m, depthMat)
  if (cardCasters) {
    const cardDepth = new ShaderMaterial(
      'depthCards',
      scene,
      { vertexSource: withCards(CARD_DEPTH_VS), fragmentSource: withCards(CARD_DEPTH_FS) },
      {
        attributes: ['position', 'aCorner', 'aCard'],
        uniforms: ['world', 'viewProjection', 'view'],
        samplers: ['uLeaf'],
      },
    )
    cardDepth.backFaceCulling = false
    cardDepth.setTexture('uLeaf', cardCasters.leaf)
    // crowns that thin with the season (generated deciduous trees, docs/plans/done/tree-generator.md) cast through
    // the same cut, at the season the bake runs in
    const lossDepth = cardCasters.lossCards.length
      ? new ShaderMaterial(
          'depthCardsLoss',
          scene,
          { vertexSource: withCards(CARD_DEPTH_VS), fragmentSource: withCards(CARD_DEPTH_FS) },
          {
            attributes: ['position', 'aCorner', 'aCard'],
            uniforms: ['world', 'viewProjection', 'view', 'uSeason'],
            samplers: ['uLeaf'],
            defines: ['#define LEAF_LOSS'],
          },
        )
      : null
    // stored on the material: thin instances draw with an effect of their own
    if (lossDepth) {
      lossDepth.backFaceCulling = false
      lossDepth.setTexture('uLeaf', cardCasters.leaf)
      shadowRT.onBeforeRenderObservable.add(() => lossDepth.setFloat('uSeason', cardCasters.season()))
    }
    for (const cards of cardCasters.cards) {
      shadowRT.renderList.push(cards)
      shadowRT.setMaterialForRendering(
        cards,
        lossDepth && cardCasters.lossCards.includes(cards) ? lossDepth : cardDepth,
      )
    }
  }
  shadowRT.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  shadowRT.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
  // the far trees are culled to the view per instance (src/look/nature.ts, farCuller): every one casts while it bakes
  if (farCull) shadowRT.onBeforeRenderObservable.add(() => farCull.all(true)) // undone by the game camera's next draw
  scene.customRenderTargets.push(shadowRT)
  lightCam.computeWorldMatrix()
  const lightVP = lightCam.getViewMatrix(true).multiply(lightCam.getProjectionMatrix(true))
  mats.bindAll(m => {
    m.setTexture('uShadowMap', shadowRT)
    m.setMatrix('uLightVP', lightVP)
    m.setVector2('uSMTexel', smTexel)
    m.setVector2('uSMFade', smFade)
  })

  let sky: SkyBake | null = null
  /* ---------- occlusion + valley-mist mask (CPU, once) ---------- */
  const aoCanvas = document.createElement('canvas')
  aoCanvas.width = aoCanvas.height = AO_N
  const aog = aoCanvas.getContext('2d')!
  {
    // ~2.7 m cells: finer than the narrowest (4 m) channel
    const N = Math.round(TILE_W / D.spec.sizes.aoCell)
    const tmp = document.createElement('canvas')
    tmp.width = tmp.height = N
    const tg = tmp.getContext('2d')!
    const img = tg.createImageData(N, N)
    const d = img.data
    // the rings read the heightfield, which reaches SPEC.aoMargin beyond the tile: cells at the edge see real ground
    const ring = (x: number, z: number, r: number) => {
      let s = 0
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 6.283
        s += heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)
      }
      return s / 6
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = T.x + ((i + 0.5) / N) * TILE_W - TILE_W / 2
        const z = T.z + ((j + 0.5) / N) * TILE_W - TILE_W / 2
        const h = heightAt(x, z)
        const near = ring(x, z, 7)
        const far = ring(x, z, D.spec.aoRing)
        const ao = 1 - Math.min(0.35, Math.max(0, (near - h) * 0.1)) // hollows and stream banks
        const valley = Math.min(1, Math.max(0, (far - h) / 3.2)) // low ground relative to 40 m around
        const k = (j * N + i) * 4
        d[k] = 255
        d[k + 1] = ao * 255
        d[k + 2] = valley * valley * (3 - 2 * valley) * 255
        d[k + 3] = 255
      }
    }
    tg.putImageData(img, 0, 0)
    aog.imageSmoothingEnabled = true
    aog.drawImage(tmp, 0, 0, AO_N, AO_N)
    aog.globalCompositeOperation = 'multiply'
    // every crown and blob darkens its footprint (G); each tree adds a dark core (docs/plans/done/shadow-look.md),
    // 0.45 crown radii and at least 1.5 texels (about 1.6 m), in R, which the light map carries in its alpha to the
    // ground alone (the crowns read G: the core would darken their tops)
    const disc = (x: number, z: number, r: number, inner: string) => {
      const px = ((x - T.x + TILE_W / 2) / TILE_W) * AO_N
      const pz = ((z - T.z + TILE_W / 2) / TILE_W) * AO_N
      const pr = Math.max(1.5, (r / TILE_W) * AO_N)
      const gr = aog.createRadialGradient(px, pz, 0, px, pz, pr)
      gr.addColorStop(0, inner)
      gr.addColorStop(1, 'rgb(255,255,255)')
      aog.fillStyle = gr
      aog.beginPath()
      aog.arc(px, pz, pr, 0, 7)
      aog.fill()
    }
    for (const [x, z, r, a, tree] of canopy) {
      // soft: the sky's occlusion below instead
      if (!soft.on) disc(x, z, r, `rgb(255,${Math.round(255 * (1 - a))},255)`)
      // the core as strong as the crown is whole (a/0.42: 1 for every tree but a generated one losing its leaves)
      if (tree) disc(x, z, r * 0.45, `rgb(${Math.round(255 - 89 * Math.min(1, a / 0.42))},255,255)`)
    }
    if (soft.on) sky = skyOcclusion(aog, canopy)
  }
  const aoTex = new DynamicTexture('ao', aoCanvas, scene, true, Texture.BILINEAR_SAMPLINGMODE)
  aoTex.wrapU = aoTex.wrapV = Texture.CLAMP_ADDRESSMODE
  aoTex.update(false)

  /* ---------- light-map bake: a top-down ortho render of the terrain, once ---------- */
  // never bind uLM (its own target) or update it per frame
  const bakeMat = mats.make('bake', TER_VS, BAKE_FS, {
    attributes: ['position', 'normal', 'aRiver'],
    uniforms: ['uPenumbra', 'uSMGround'],
    samplers: ['uAOTex', 'uWater'],
    perFrame: false,
    defines: [
      '#define WATERDATA',
      ...(soft.on
        ? ['#define SOFT', `#define DEPTH_M ${(LZ1 - LZ0).toFixed(1)}`, `#define FAR_MAX ${FAR_MAX.toFixed(1)}`]
        : []),
    ],
  })
  bakeMat.setFloat('uPenumbra', soft.penumbra)
  bakeMat.setVector2('uSMGround', smGround)
  bakeMat.setTexture('uAOTex', aoTex)
  bakeMat.setTexture('uWater', water)
  bakeMat.setTexture('uShadowMap', shadowRT)
  bakeMat.setMatrix('uLightVP', lightVP)
  bakeMat.setVector2('uSMTexel', smTexel)
  const lmCam = new FreeCamera('lmCam', new Vector3(T.x, 500, T.z), scene)
  lmCam.setTarget(new Vector3(T.x, 0, T.z + 0.01))
  lmCam.mode = Camera.ORTHOGRAPHIC_CAMERA
  Object.assign(lmCam, {
    orthoLeft: -TILE_W / 2,
    orthoRight: TILE_W / 2,
    orthoTop: TILE_W / 2,
    orthoBottom: -TILE_W / 2,
    minZ: 1,
    maxZ: 1000,
  })
  const lightMap = new RenderTargetTexture(
    'lightmap',
    LM_N,
    scene,
    false,
    true,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  lightMap.activeCamera = lmCam
  lightMap.clearColor = new Color4(1, 1, 0, 1)
  lightMap.renderList = [terrains[0]]
  lightMap.setMaterialForRendering(terrains[0], bakeMat)
  lightMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  scene.customRenderTargets.push(lightMap)
  // the trunks' shadows (docs/plans/done/trees-perf-trunks.md): a trunk is thinner than two of the shadow map's
  // texels and the soft filter washed it out, so each is drawn into the light map's sun after the terrain, as a quad
  // on the ground from its root away from the sun to where its crown's shadow starts, multiplied in
  const trunkMesh = trunkShadows(scene, trunks)
  if (trunkMesh) {
    const tm = new ShaderMaterial(
      'trunkShadow',
      scene,
      { vertexSource: TRUNK_VS, fragmentSource: TRUNK_FS },
      {
        attributes: ['position', 'aUV'],
        uniforms: ['viewProjection'],
        needAlphaBlending: true,
        defines: [`#define TRUNK_DARK ${TRUNK_DARK.toFixed(2)}`],
      },
    )
    tm.alphaMode = Constants.ALPHA_MULTIPLY
    tm.disableDepthWrite = true
    tm.depthFunction = Constants.ALWAYS
    tm.backFaceCulling = false
    trunkMesh.material = tm
    trunkMesh.renderingGroupId = 1
    // hidden from the game camera; the light map draws its render list whatever the mask
    trunkMesh.layerMask = LM_ONLY
    lightMap.renderList.push(trunkMesh)
  }
  // the bake must see a COMPLETE shadow map: re-bake every time the shadow pass actually renders
  shadowRT.onAfterRenderObservable.add(() => lightMap.resetRefreshCounter())
  lmCam.computeWorldMatrix()
  const lmVP = lmCam.getViewMatrix(true).multiply(lmCam.getProjectionMatrix(true))
  mats.bindAll(m => {
    m.setTexture('uLM', lightMap)
    m.setMatrix('uLMVP', lmVP)
  })

  /* ---------- the bounce map (LC5, docs/plans/done/lc5-ground-bounce.md): the light the ground around each point
     sends back, top-down over the tile with the light map's camera, after it (it reads the light map) ---------- */
  const gbMat = mats.make('gbounce', TER_VS, GB_FS, {
    attributes: ['position', 'normal', 'aRiver'],
    defines: [`#define GB_STEP ${GB_STEP.toFixed(2)}`, `#define GB_SIGMA ${GB_SIGMA.toFixed(2)}`],
  })
  const groundBounce = new RenderTargetTexture(
    'groundBounce',
    GB_N,
    scene,
    false,
    true,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  groundBounce.activeCamera = lmCam
  groundBounce.clearColor = new Color4(0, 0, 0, 1)
  groundBounce.renderList = [terrains[0]]
  groundBounce.setMaterialForRendering(terrains[0], gbMat)
  groundBounce.wrapU = groundBounce.wrapV = Texture.CLAMP_ADDRESSMODE
  groundBounce.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
  scene.customRenderTargets.push(groundBounce)
  lightMap.onAfterRenderObservable.add(() => groundBounce.resetRefreshCounter())
  // read where GROUND_BOUNCE is defined (the ground, the water's shore band, the meadow)
  mats.bindAll(m => m.setTexture('uGB', groundBounce))

  /* ---------- the simple shadows' shade (decision 0049, shaders/unitshade.frag): the ratio of the ground painted in a
     full cast shadow to it painted as it is, top-down over the tile with the light map's camera, after the bounce map
     (it reads it); made only when the armies ask for it. desat (0: none): its hue toward its own grey by that share,
     its luminance kept (decision 0071: a tree's painted shadow on the grass is less blue) ---------- */
  let shade: RenderTargetTexture | null = null
  const unitShade = (desat = 0) => {
    if (shade) return shade
    const m = mats.make('unitShade', TER_VS, SHADE_FS, {
      attributes: ['position', 'normal', 'aRiver'],
      defines: ['#define GROUND_BOUNCE', ...(desat > 0 ? [`#define SH_DESAT ${desat.toFixed(4)}`] : [])],
    })
    const t = (shade = new RenderTargetTexture(
      'unitShade',
      LM_N,
      scene,
      false,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    ))
    t.activeCamera = lmCam
    t.clearColor = new Color4(1, 1, 1, 1)
    t.renderList = [terrains[0]]
    t.setMaterialForRendering(terrains[0], m)
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    t.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    scene.customRenderTargets.push(t)
    groundBounce.onAfterRenderObservable.add(() => t.resetRefreshCounter())
    return t
  }
  return { lightCam, shadowRT, lightMap, groundBounce, bakeMat, lightVP, smTexel, sky, unitShade }
}

// The sky's occlusion (docs/plans/done/soft-shadows.md, B): the ground at each texel of the occlusion texture sees
// each crown or bush as a sphere, which hides the cosine-weighted fraction cos θ · (r/d)² of its sky (the analytic
// sphere occlusion), at most INSIDE (inside the sphere too: the crown or bush reads this texel and its own leaves
// would darken it to black), times its leaves' opacity; the fractions multiply. Each sphere is splatted over the
// texels within SKY_REACH of it; into G, over the terrain's ring test.
function skyOcclusion(g: CanvasRenderingContext2D, canopy: Nature['canopy']): SkyBake {
  const t0 = performance.now()
  const px = TILE_W / AO_N
  // (the occlusion's grid over the tile, from its corner: src/look/tile.ts)
  const X0 = TILE_O.x - TILE_W / 2
  const Z0 = TILE_O.y - TILE_W / 2
  const vis = new Float32Array(AO_N * AO_N).fill(1)
  const ground = new Float32Array(AO_N * AO_N).fill(NaN)
  for (const [x, z, , , , h, r, op] of canopy) {
    const sy = heightAt(x, z) + h
    const i0 = Math.max(0, Math.floor((x - SKY_REACH - X0) / px))
    const i1 = Math.min(AO_N - 1, Math.floor((x + SKY_REACH - X0) / px))
    const j0 = Math.max(0, Math.floor((z - SKY_REACH - Z0) / px))
    const j1 = Math.min(AO_N - 1, Math.floor((z + SKY_REACH - Z0) / px))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const tx = X0 + (i + 0.5) * px
        const tz = Z0 + (j + 0.5) * px
        const dx = x - tx
        const dz = z - tz
        const h2 = dx * dx + dz * dz
        if (h2 > SKY_REACH * SKY_REACH) continue
        const k = j * AO_N + i
        if (isNaN(ground[k])) ground[k] = heightAt(tx, tz)
        const dy = sy - ground[k]
        const dd = h2 + dy * dy
        const occ = dd <= r * r ? INSIDE : dy <= 0 ? 0 : Math.min(INSIDE, ((dy / Math.sqrt(dd)) * r * r) / dd)
        vis[k] *= 1 - op * occ
      }
    }
  }
  const img = g.getImageData(0, 0, AO_N, AO_N)
  const d = img.data
  let lo = 1
  let sum = 0
  for (let k = 0; k < vis.length; k++) {
    d[k * 4 + 1] = Math.round(d[k * 4 + 1] * vis[k])
    lo = Math.min(lo, d[k * 4 + 1] / 255)
    sum += d[k * 4 + 1] / 255
  }
  g.putImageData(img, 0, 0)
  return { ms: performance.now() - t0, min: lo, mean: sum / vis.length }
}

// the trunks' shadow quads (on the ground, a little above it: the light map's camera looks straight down), one mesh
function trunkShadows(scene: Scene, trunks: Nature['trunks']): Mesh | null {
  if (!trunks.length) return null
  const g = Math.hypot(SUN.x, SUN.z)
  const dx = -SUN.x / g
  const dz = -SUN.z / g
  const px = -dz
  const pz = dx
  const along = g / SUN.y
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (const [x, z, r, base] of trunks) {
    const L = base * along
    const y = heightAt(x, z) + 0.5
    const i = pos.length / 3
    for (const [u, v] of [
      [-1, 0],
      [1, 0],
      [1, 1],
      [-1, 1],
    ]) {
      pos.push(x + px * r * u + dx * (L * v - r * (1 - v)), y, z + pz * r * u + dz * (L * v - r * (1 - v)))
      uv.push(u, v)
    }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  const m = new MeshCtor('trunkShadows', scene)
  m.setVerticesData(VertexBuffer.PositionKind, pos)
  m.setVerticesData('aUV', uv, false, 2)
  m.setIndices(idx)
  m.isPickable = false
  m.alwaysSelectAsActiveMesh = true
  return m
}
