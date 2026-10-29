// The ground's macro colour (docs/plans/active/l5-macro.md, L5a; docs/proposals/prepainted-terrain.md): the cover
// grid as a texture, the bake of macro() (src/look/shaders/macro.glsl) into world-space textures, and the arms.
// The bake draws bakeTile² texels at a time into one render target (no single large draw: SwiftShader lost the
// context on those, docs/proposals/engine-design.md §6), then makes its mips. It holds colour only; the light, the
// banks and the seasons stay at runtime. It reads the grain, so a new grain rebakes it.
import { Constants } from '@babylonjs/core/Engines/constants.js'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js'
import { EffectRenderer, EffectWrapper } from '@babylonjs/core/Materials/effectRenderer.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { withPainter, type Materials } from './materials.ts'
import { D, bakeMB } from './spec.ts'
import type { CoverGrid } from './world/cover.ts'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import BRUSH_URL from '../../data/meadow-brush.png?url'
import type { FlowTextures } from './flow.ts'
import DIRT_URL from '../../data/ground-dirt-v1.png?url'
import EARTH_URL from '../../data/ground-earth-v1.png?url'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { paveDefines } from './world/buildings.ts'

// the arms (macro.glsl): flat, shader, bake, and L5b's experiments, strokes (arm 4) and kuwahara (arm 5): bakes of
// their own, read as the bake is
export const MACRO_ARMS = ['flat', 'shader', 'bake', 'strokes', 'kuwahara'] as const
export type MacroArm = (typeof MACRO_ARMS)[number]
const MATERIAL_DEFINES = ['MACRO_FLAT', 'MACRO_SHADER', 'MACRO_BAKE'] as const
const ARM_DEFINE: Record<MacroArm, (typeof MATERIAL_DEFINES)[number]> = {
  flat: 'MACRO_FLAT',
  shader: 'MACRO_SHADER',
  bake: 'MACRO_BAKE',
  strokes: 'MACRO_BAKE',
  kuwahara: 'MACRO_BAKE',
}
export const isBakedArm = (a: MacroArm): boolean => ARM_DEFINE[a] === 'MACRO_BAKE'
// the arms whose materials differ (the bench's): strokes and kuwahara draw with the bake's shader, and differ in their
// bakes alone (their cost: the bake's, BakeStats)
export const SHADER_ARMS: readonly MacroArm[] = ['flat', 'shader', 'bake']
// the checks' variants (tools/macro-check.mjs): the class view, and the sabotages (every class the meadow's colour; the
// stripes not faded with the footprint)
export const MACRO_CHECK_DEFINES = ['MACRO_DEBUG', 'MACRO_SAB_ONECLASS', 'MACRO_SAB_STEP'] as const

const BAKE_VS =
  'precision highp float;attribute vec2 position;varying vec2 vUV;void main(){vUV=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}'
// uRect: the world rectangle (x0, z0, x1, z1) of the draw; uTexel: the bake's texel, m (the stripes' footprint)
// the near bake (combNear, below): the strokes signed value at each texel of its square
const NEAR_FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec2 vUV;uniform vec4 uRect;uniform float uTexel;
#include<painter>
#include<shore>
void main(){vec2 xz=mix(uRect.xy,uRect.zw,vUV);macroDerivs(xz);gl_FragColor=vec4(combDv(xz,uTexel),0.0,0.0,1.0);}`
// the roads at the tile's texel (ROADS), as far out: their wheel tracks a dusting; not on the far ring's 4 m texels
// (they would alias)
const BAKE_FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec2 vUV;uniform vec4 uRect;uniform float uTexel;
#include<painter>
#include<shore>
void main(){vec2 xz=mix(uRect.xy,uRect.zw,vUV);macroDerivs(xz);gl_FragColor=bakeTexel(xz,uTexel);
  // (the relief's tone before the roads: their paint tones its own colour, as on the live ground: shore.glsl)
  #ifdef RELIEF
  gl_FragColor.rgb=reliefTone(gl_FragColor.rgb,xz);
  #endif
  if(uTexel<1.0)gl_FragColor.rgb=roadPaint(gl_FragColor.rgb,xz);
}`
// Arm 5's pass (L5b): a four-quadrant Kuwahara filter over a finished bake (uSrc, nearest, uN² texels) into the
// bake's target, uR texels a side (at most KUWAHARA_MAX). Each texel takes the mean colour of the quadrant whose
// colours vary least; the alpha (the snow's lie) stays its own, so off the fields the lie stays exactly 0 (macro.glsl).
// uPx: the draw's texels (x0, y0, x1, y1)
const KUWAHARA_MAX = 4
const KUWAHARA_FS = `precision highp float;varying vec2 vUV;uniform sampler2D uSrc;uniform float uN,uR;uniform vec4 uPx;
vec4 at(vec2 p){return texture2D(uSrc,clamp(p,0.5,uN-0.5)/uN);}
void main(){
  vec2 p=floor(mix(uPx.xy,uPx.zw,vUV))+0.5;
  vec3 best=vec3(0.0);float bestV=1e9;
  for(int q=0;q<4;q++){
    vec2 s=vec2(q==1||q==3?1.0:-1.0,q>=2?1.0:-1.0);vec3 m=vec3(0.0),m2=vec3(0.0);float k=0.0;
    for(int j=0;j<=${KUWAHARA_MAX};j++)for(int i=0;i<=${KUWAHARA_MAX};i++){
      if(float(i)>uR||float(j)>uR)continue;
      vec3 c=at(p+s*vec2(float(i),float(j))).rgb;m+=c;m2+=c*c;k+=1.0;}
    m/=k;vec3 v=m2/k-m*m;float vs=v.r+v.g+v.b;
    if(vs<bestV){bestV=vs;best=m;}}
  gl_FragColor=vec4(best,at(p).a);}`

export interface BakeStats {
  ms: number
  texels: number
  draws: number
  mb: number
  lost: boolean
}
export interface Macro {
  cover: RawTexture
  tile: RenderTargetTexture
  far: RenderTargetTexture
  // a baked arm other than the one the bakes hold rebakes them (the stats of that rebake, else zeros)
  setArm(arm: MacroArm): Promise<BakeStats>
  arm(): MacroArm
  // the checks' variants on every painted material and the bake (rebaked)
  setCheck(on: string[]): Promise<BakeStats>
  bake(): Promise<BakeStats>
  // the full-size run (the track plan's measurement): a side² target over side · texel m, then freed
  bakeBench(side: number): Promise<BakeStats>
  hash(which: 'tile' | 'far'): Promise<string>
  // the last bake started (by a new grain, a restored context, a check), settled
  settled(): Promise<unknown>
  // the earth's texture loaded (or failed: earthOn stays off), so uEarthOn holds (the bench's arms, src/look/main.ts)
  earthLoaded: Promise<void>
}

// meadow: the meadow pattern in the macro colour (MEADOW, docs/plans/done/l5c-meadow.md), from the brush tile
// the roads' textures (src/look/main.ts): the bake paints them in (BAKE_FS, roadPaint as far out: uRoadFar 1), so far
// out the ground's bake holds the roads and the terrain's live road shader runs only nearer (docs/plans/done/roads.md)
// pave: the buildings' paved yards (shore.glsl, pavePaint): their shapes (src/look/world/buildings.ts, paveShape); the
// bake paints their far look (PAVING_FAR: no texture read; at its texels the cobbles average to their mean)
export interface RoadTextures {
  segs: BaseTexture
  grid: BaseTexture
  grit: BaseTexture
  n: number
  pave: { a: number[]; b: number[]; n: number }
}
// flow: the meadow's pattern combed (GRASS_FLOW, ?grass=flow): the materials' defines it shares (src/look/main.ts);
// flowTex: the flow's textures (src/look/flow.ts), which the bake reads too; meadowMap: the meadow map
// (src/look/meadow.ts), which the combed meadow's bake reads (the default pattern where no grass grows); near: the near
// bake's reach (the strokes' ring, m from the focus) and whether its strokes can show (the zoom)
export function buildMacro(
  scene: Scene,
  mats: Materials,
  cover: CoverGrid,
  meadow = false,
  roads?: RoadTextures,
  flow: string[] = [],
  flowTex: FlowTextures | null = null,
  meadowMap: BaseTexture | null = null,
  near: { reach: number; shows: () => boolean } = { reach: 25, shows: () => true },
  bakeCover: CoverGrid = cover,
  relief: { tex: BaseTexture; k: number } | null = null,
): Macro {
  const engine = scene.getEngine() as AbstractEngine
  const s = D.spec.macro
  // the cover's texture: the per-frame shaders read `cover` (a map world's coarsened to the spec's cells: coarsenCover,
  // src/look/world/cover.ts); the bakes read `bakeCover` (a map world's finer one), whose class edges they paint with
  // the fine warp (macro.glsl, coverWarpFine)
  const coverTexOf = (g: CoverGrid) => {
    const t = RawTexture.CreateRGBATexture(g.tex, g.n, g.n, scene, false, false, Texture.NEAREST_SAMPLINGMODE)
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    return t
  }
  const coverTex = coverTexOf(cover)
  const bakeCoverTex = bakeCover === cover ? coverTex : coverTexOf(bakeCover)
  // mipmapped on WebGL2; WebGL1 cannot mipmap a texture whose sides are not powers of two (1600², 650²), so there the
  // bakes are read bilinear, without mips (an incomplete mipmapped texture would read black)
  const mips = !mats.webgl1
  const target = (name: string, n: number) => {
    const t = new RenderTargetTexture(name, n, scene, {
      generateMipMaps: mips,
      generateDepthBuffer: false,
      generateStencilBuffer: false,
      type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
      samplingMode: mips ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE,
      format: Constants.TEXTUREFORMAT_RGBA,
    })
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    t.anisotropicFilteringLevel = mips ? 4 : 1
    return t
  }
  const tile = target('macroTile', D.macroN)
  const far = target('macroFar', D.macroFarN)
  // arm 5's scratch: the bake before its filter, read texel by texel; one a size, made on arm 5's first bake and kept
  const makeScratch = (n: number) => {
    const t = new RenderTargetTexture('macroScratch', n, scene, {
      generateMipMaps: false,
      generateDepthBuffer: false,
      generateStencilBuffer: false,
      type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
      format: Constants.TEXTUREFORMAT_RGBA,
    })
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    return t
  }
  const scratches = new Map<number, RenderTargetTexture>()
  const scratch = (n: number) => {
    let t = scratches.get(n)
    if (!t) scratches.set(n, (t = makeScratch(n)))
    return t
  }
  // the meadow's brush tile (tools/meadow-brush.py): the bake's pattern, the grass's shade (src/look/meadow.ts)
  let brushError: string | null = null
  const brush = meadow
    ? new Texture(BRUSH_URL, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE, null, (msg?: string) => {
        brushError = `the meadow's brush tile (${BRUSH_URL}) did not load: ${msg ?? 'unknown error'}`
      })
    : null
  if (brush) brush.wrapU = brush.wrapV = Texture.WRAP_ADDRESSMODE
  // the dirt surface on bare ground (dirtOn in macro.glsl, docs/plans/done/ground-surface.md): the owner's dirt
  // texture, and the bare earth's surface (earthOn in macro.glsl, docs/plans/done/bare-earth.md): the owner's cracked
  // earth. Both one channel, packed at load into one texture's R and G (uSurf: one texture unit for the two, the
  // ground's fragment stage is full, decision 0049). Each one's marks only once it has loaded (uDirtOn, uEarthOn, 0
  // until then: the empty texture reads 0 and would darken bare ground by a third); a failed load is reported, not a
  // bake's error (no bake reads them), and the ground then has none of its marks
  let earthDone = () => {}
  const earthLoaded = new Promise<void>(r => {
    earthDone = r
  })
  let surf: BaseTexture = RawTexture.CreateRGBATexture(
    new Uint8Array(4),
    1,
    1,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  // the scene is not ready until they are packed (or have failed), as it waited for each texture's own load: the tools'
  // captures (whenReadyAsync) never see the ground without its surfaces
  const pending = { surfaces: true }
  scene.addPendingData(pending)
  packSurfaces(scene, [DIRT_URL, EARTH_URL])
    .then(({ tex, ok }) => {
      const placeholder = surf
      surf = tex
      for (const m of mats.all) m.setTexture('uSurf', tex)
      if (ok[0]) mats.bindAll(m => m.setFloat('uDirtOn', 1))
      if (ok[1]) mats.bindAll(m => m.setFloat('uEarthOn', 1))
      placeholder.dispose()
    })
    .catch((e: unknown) =>
      console.error(
        `the ground's surface textures could not be packed: ${(e as Error).message} (the ground has none of their marks)`,
      ),
    )
    .finally(() => {
      scene.removePendingData(pending)
      earthDone()
    })
  mats.bindAll(m => {
    m.setTexture('uCover', coverTex)
    m.setTexture('uMacro', tile)
    m.setTexture('uMacroFar', far)
    m.setTexture('uSurf', surf)
    if (brush) m.setTexture('uMeadowBrush', brush)
  })

  const UNIFORMS = [
    'uRect',
    'uTexel',
    'uSeason',
    'uRoadOn',
    'uRoadSegN',
    'uRoadFar',
    'uPaveA',
    'uPaveB',
    'uPaveN',
    ...(relief ? ['uReliefK'] : []),
  ]
  const SAMPLERS = [
    ...(relief ? ['uRelief'] : []),
    'uGrain',
    'uCover',
    'uMeadowBrush',
    'uRoadSegs',
    'uRoadGrid',
    'uRoadGrit',
    'uFlow',
    'uComb',
    'uMeadow',
  ]
  const DEFINES = [
    ...D.defines,
    ...(meadow ? ['#define MEADOW', ...flow] : []),
    ...(meadow && meadowMap ? ['#define MEADOW_MAP'] : []),
    ...(roads ? ['#define ROADS', '#define PAVING_FAR', ...paveDefines()] : []),
    // the relief's painted tone (src/look/relief.ts; ?relief, the page)
    ...(relief ? ['#define RELIEF'] : []),
  ]
  const wrapper = new EffectWrapper({
    engine,
    name: 'macroBake',
    vertexShader: BAKE_VS,
    fragmentShader: withPainter(BAKE_FS),
    attributeNames: ['position'],
    uniformNames: UNIFORMS,
    samplerNames: SAMPLERS,
    defines: DEFINES,
  })
  // arm 5's filter, compiled on its first bake
  let kuwaharaW: EffectWrapper | null = null
  const kuwahara = () =>
    (kuwaharaW ??= new EffectWrapper({
      engine,
      name: 'macroKuwahara',
      vertexShader: BAKE_VS,
      fragmentShader: KUWAHARA_FS,
      attributeNames: ['position'],
      uniformNames: ['uN', 'uR', 'uPx'],
      samplerNames: ['uSrc'],
    }))
  const renderer = new EffectRenderer(engine)
  // a lost context empties the targets: a bake that saw a loss reports it, and a restored context bakes again
  let losses = 0
  engine.onContextLostObservable.add(() => {
    losses++
  })
  engine.onContextRestoredObservable.add(() => {
    rebake()
  })
  const ready = (w: EffectWrapper) =>
    new Promise<void>((res, rej) => {
      const t0 = performance.now()
      const poll = () =>
        brushError
          ? rej(new Error(brushError))
          : w.effect.isReady() && (!brush || brush.isReady())
            ? res()
            : performance.now() - t0 > 30000
              ? rej(new Error(`macro bake: the shader ${w.name} did not compile: ${w.effect.getCompilationError()}`))
              : setTimeout(poll, 16)
      poll()
    })
  const gl = (engine as unknown as { _gl: WebGLRenderingContext })._gl
  // one pass of a shader over all of a target's n² texels, bakeTile² at a time; `set` sets the draw's uniforms from
  // its texels (i, j, w, h)
  const pass = (
    t: RenderTargetTexture,
    n: number,
    w: EffectWrapper,
    set: (e: EffectWrapper['effect'], i: number, j: number, w: number, h: number) => void,
  ): number => {
    const k = s.bakeTile
    const rt = t.renderTarget!
    let draws = 0
    renderer.saveStates()
    engine.bindFramebuffer(rt, undefined, undefined, undefined, true)
    for (let j = 0; j < n; j += k) {
      for (let i = 0; i < n; i += k) {
        const dw = Math.min(k, n - i)
        const dh = Math.min(k, n - j)
        // in whole texels (a fraction of n multiplied back can land under a whole number, and gl.viewport truncates it)
        engine.setViewport(new Viewport(i, j, dw, dh), 1, 1)
        renderer.applyEffectWrapper(w)
        set(w.effect, i, j, dw, dh)
        renderer.draw()
        draws++
      }
    }
    // gl.readPixels of one texel waits for the GPU: the bake's time includes its work, not only its submission
    const px = new Uint8Array(4)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    // makes the mips, on a mipmapped target
    engine.unBindFramebuffer(rt, false)
    renderer.restoreStates()
    return draws
  }
  // one bake over the world square centred on 0 of side `world` m: the macro colour, then on arm 5 (kuw) its filter.
  // mb: the target with its mips, and arm 5's scratch beside it (`temp`: a scratch freed after
  // the bake, the full-size run's)
  const draw = async (
    t: RenderTargetTexture,
    n: number,
    world: number,
    kuw: boolean,
    temp = false,
  ): Promise<BakeStats> => {
    await ready(wrapper)
    if (kuw) await ready(kuwahara())
    const lost0 = losses
    const t0 = performance.now()
    const x0 = -world / 2
    const src = !kuw ? t : temp ? makeScratch(n) : scratch(n)
    try {
      let draws = pass(src, n, wrapper, (e, i, j, w, h) => {
        e.setFloat4(
          'uRect',
          x0 + (i / n) * world,
          x0 + (j / n) * world,
          x0 + ((i + w) / n) * world,
          x0 + ((j + h) / n) * world,
        )
        e.setFloat('uTexel', world / n)
        e.setFloat('uSeason', 0)
        e.setTexture('uGrain', mats.grain)
        e.setTexture('uCover', bakeCoverTex)
        if (relief) {
          e.setTexture('uRelief', relief.tex)
          e.setFloat('uReliefK', relief.k)
        }
        if (brush) e.setTexture('uMeadowBrush', brush)
        if (flowTex) {
          e.setTexture('uFlow', flowTex.flow)
          e.setTexture('uComb', flowTex.comb)
        }
        if (meadowMap) e.setTexture('uMeadow', meadowMap)
        // the roads, without the grit (its marks are finer than a texel)
        if (roads) {
          e.setTexture('uRoadSegs', roads.segs)
          e.setTexture('uRoadGrid', roads.grid)
          e.setTexture('uRoadGrit', roads.grit)
          e.setFloat('uRoadSegN', roads.n)
          e.setFloat('uRoadOn', 0)
          e.setArray4('uPaveA', roads.pave.a)
          e.setArray4('uPaveB', roads.pave.b)
          e.setFloat('uPaveN', roads.pave.n)
          e.setFloat('uRoadFar', 1)
        }
      })
      if (src !== t) {
        draws += pass(t, n, kuwahara(), (e, i, j, w, h) => {
          e.setTexture('uSrc', src)
          e.setFloat('uN', n)
          e.setFloat4('uPx', i, j, i + w, j + h)
          // 2 m on the tile, a texel on the far ring
          e.setFloat('uR', Math.max(1, Math.min(KUWAHARA_MAX, Math.round(s.kuwahara / (world / n)))))
        })
      }
      return {
        ms: performance.now() - t0,
        texels: n * n,
        draws,
        mb: bakeMB(n, n) * (mips ? 4 / 3 : 1) + (kuw ? bakeMB(n, n) : 0),
        lost: losses > lost0,
      }
    } finally {
      if (temp && src !== t) src.dispose()
    }
  }
  // the arm the page shows, and the baked arm wanted (bake, strokes or kuwahara: the last one set)
  let arm: MacroArm = 'bake'
  let bakeArm: MacroArm = 'bake'
  let checks: string[] = []
  const applyArm = (m: ShaderMaterial) => {
    for (const d of MATERIAL_DEFINES) m.setDefine(`#define ${d}`, ARM_DEFINE[arm] === d)
  }
  mats.bindAll(applyArm) // a painted material made later (the meadow's) gets the arm too
  // The bakes run one at a time, in the order asked (a new grain, a restored context, an arm, a check, a rebake): each
  // takes the arm and the checks wanted when it starts. The bake's shader's defines are the checks' (all but the class
  // view, which the bake ignores) and arm 4's strokes; `baked` is what the targets hold, set once a bake finishes
  let effectKey = ''
  let baked = ''
  const NOTHING: BakeStats = { ms: 0, texels: 0, draws: 0, mb: 0, lost: false }
  const wantedDefs = () =>
    [...checks.filter(d => d !== 'MACRO_DEBUG'), ...(bakeArm === 'strokes' ? ['MACRO_STROKES'] : [])].sort()
  const wantedKey = () => [bakeArm, ...wantedDefs()].join(' ')
  // the bake's shader set to the wanted defines
  const wanted = () => {
    // the shader's defines alone: the arm (bake or kuwahara, the same shader) is not one
    const defs = wantedDefs()
    const dk = defs.join(' ')
    if (dk !== effectKey) {
      wrapper.updateEffect([...DEFINES, ...defs.map(d => `#define ${d}`)].join('\n'), UNIFORMS, SAMPLERS)
      effectKey = dk
    }
    return { kuw: bakeArm === 'kuwahara', key: wantedKey() }
  }
  const bakeNow = async (): Promise<BakeStats> => {
    const w = wanted()
    baked = ''
    const a = await draw(tile, D.macroN, D.spec.tile, w.kuw)
    const b = await draw(far, D.macroFarN, D.spec.far, w.kuw)
    baked = w.key
    return {
      ms: a.ms + b.ms,
      texels: a.texels + b.texels,
      draws: a.draws + b.draws,
      mb: a.mb + b.mb,
      lost: a.lost || b.lost,
    }
  }
  let last: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const p = last.then(job, job)
    last = p.catch(() => undefined)
    return p
  }
  const bake = () => enqueue(bakeNow)
  // a rebake no one awaits (a new grain, a restored context): its failure is reported, and settled() waits for it
  const rebake = () => {
    bake().catch((e: unknown) => {
      console.error('macro rebake failed:', e)
    })
  }
  mats.onGrain(rebake)
  // redone only when the arm or the checks wanted differ from what the targets hold
  const rebakeIfChanged = () => enqueue(() => (wantedKey() === baked ? Promise.resolve(NOTHING) : bakeNow()))
  const setCheck = async (on: string[]) => {
    for (const d of on) {
      if (!(MACRO_CHECK_DEFINES as readonly string[]).includes(d)) throw new Error(`unknown macro check define ${d}`)
    }
    for (const m of mats.all) for (const d of MACRO_CHECK_DEFINES) m.setDefine(`#define ${d}`, on.includes(d))
    checks = [...on]
    return rebakeIfChanged()
  }
  // a baked arm other than the one the bakes hold rebakes them
  const setArm = async (a: MacroArm): Promise<BakeStats> => {
    if (!MACRO_ARMS.includes(a)) throw new Error(`unknown macro arm ${a}`)
    arm = a
    for (const m of mats.all) applyArm(m)
    if (!isBakedArm(a)) return NOTHING
    bakeArm = a
    return rebakeIfChanged()
  }
  // the combed meadow's near bake (?grass=flow, docs/plans/done/grass-flow.md): the strokes value (combDv in
  // macro.glsl) over a square round the camera's focus that holds the strokes' ring however far the focus has moved
  // since (NEAR_W m: the reach and NEAR_STEP either side), at NEAR_N texels a side, rendered again when the focus has
  // moved NEAR_STEP m, on a baked arm (the only ground that reads it) at a zoom where the strokes show; the ground
  // reads it with one fetch (nearComb). The strokes in the ground's own shader cost about 1 ms a frame on every terrain
  // pixel, the branch not taken too (measured: the plan)
  if (flowTex && meadow) {
    const NEAR_STEP = 6
    const NEAR_W = 2 * (Math.ceil(near.reach) + NEAR_STEP + 1)
    const NEAR_N = 1024
    const nearRT = new RenderTargetTexture('combNear', NEAR_N, scene, {
      generateMipMaps: false,
      generateDepthBuffer: false,
      generateStencilBuffer: false,
      type: Constants.TEXTURETYPE_HALF_FLOAT,
      samplingMode: Texture.BILINEAR_SAMPLINGMODE,
      format: Constants.TEXTUREFORMAT_RGBA,
    })
    nearRT.wrapU = nearRT.wrapV = Texture.CLAMP_ADDRESSMODE
    const nearW = new EffectWrapper({
      engine,
      name: 'combNear',
      vertexShader: BAKE_VS,
      fragmentShader: withPainter(NEAR_FS),
      attributeNames: ['position'],
      uniformNames: ['uRect', 'uTexel'],
      samplerNames: SAMPLERS,
      defines: DEFINES,
    })
    const rect = new Vector4(1e6, 1e6, NEAR_W, 0)
    const centre = { x: NaN, z: NaN }
    mats.bindAll(m => {
      m.setTexture('uCombNear', nearRT)
      m.setVector4('uCombNearRect', rect)
    })
    const nearRenderer = new EffectRenderer(engine)
    scene.onBeforeRenderObservable.add(() => {
      const cam = scene.activeCamera as { target?: { x: number; z: number } } | null
      const f = cam?.target
      if (
        !f ||
        !isBakedArm(arm) ||
        !near.shows() ||
        (Math.abs(f.x - centre.x) < NEAR_STEP && Math.abs(f.z - centre.z) < NEAR_STEP)
      ) {
        return
      }
      if (!nearW.effect.isReady() || (brush && !brush.isReady())) return
      // snapped to whole texels, so a texel always lands on the same world point
      const t = NEAR_W / NEAR_N
      const x0 = Math.round((f.x - NEAR_W / 2) / t) * t
      const z0 = Math.round((f.z - NEAR_W / 2) / t) * t
      nearRenderer.saveStates()
      engine.bindFramebuffer(nearRT.renderTarget!, undefined, undefined, undefined, true)
      // (in texels, as the bake's pass)
      engine.setViewport(new Viewport(0, 0, NEAR_N, NEAR_N), 1, 1)
      nearRenderer.applyEffectWrapper(nearW)
      const e = nearW.effect
      e.setFloat4('uRect', x0, z0, x0 + NEAR_W, z0 + NEAR_W)
      e.setFloat('uTexel', t)
      e.setTexture('uGrain', mats.grain)
      e.setTexture('uCover', bakeCoverTex)
      if (brush) e.setTexture('uMeadowBrush', brush)
      e.setTexture('uFlow', flowTex.flow)
      e.setTexture('uComb', flowTex.comb)
      if (meadowMap) e.setTexture('uMeadow', meadowMap)
      nearRenderer.draw()
      engine.unBindFramebuffer(nearRT.renderTarget!, false)
      nearRenderer.restoreStates()
      centre.x = f.x
      centre.z = f.z
      rect.set(x0, z0, NEAR_W, 0)
    })
  }
  return {
    cover: coverTex,
    tile,
    far,
    setArm,
    arm: () => arm,
    bake,
    setCheck,
    settled: () => last,
    earthLoaded,
    async bakeBench(side) {
      if (!(Number.isInteger(side) && side >= 64 && side <= D.spec.minSpec.maxTexture)) {
        throw new Error(`?macroBench must be a whole number of texels, 64–${D.spec.minSpec.maxTexture}`)
      }
      const t = target('macroBench', side)
      return enqueue(async () => {
        try {
          return await draw(t, side, side * s.texel, wanted().kuw, true)
        } finally {
          t.dispose()
        }
      })
    },
    async hash(which) {
      const t = which === 'tile' ? tile : far
      const data = (await t.readPixels()) as Uint8Array
      let h = 0x811c9dc5
      for (let i = 0; i < data.length; i++) {
        h ^= data[i]
        h = Math.imul(h, 0x01000193)
      }
      return (h >>> 0).toString(16).padStart(8, '0')
    },
  }
}

// greyscale images packed into one texture, the first's value in R, the second's in G (wrapped, mipmapped, trilinear,
// anisotropic 4, as each was alone): the same texels the two textures held, read by one texture unit. An image that
// does not load is reported and reads 0 (ok: which loaded); one of another size than the first that loaded is resampled
// to it (reported). The main thread's share (drawing, reading back, packing, the upload) is measured as the performance
// entry 'groundSurfacesPack' (docs/plans/active/simple-soldier-shadows.md)
async function packSurfaces(scene: Scene, urls: string[]): Promise<{ tex: RawTexture; ok: boolean[] }> {
  const bmps = await Promise.all(
    urls.map(async u => {
      try {
        const r = await fetch(u)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      } catch (e) {
        console.error(`the ground's surface texture (${u}) did not load: ${(e as Error).message}`)
        return null
      }
    }),
  )
  const t0 = performance.now()
  const first = bmps.find(b => b !== null)
  const w = first?.width ?? 1
  const h = first?.height ?? 1
  const c = new OffscreenCanvas(w, h)
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error("no 2D context to pack the ground's surface textures")
  const out = new Uint8Array(w * h * 4)
  for (let k = 0; k < bmps.length; k++) {
    const b = bmps[k]
    if (!b) continue
    if (b.width !== w || b.height !== h) {
      console.warn(`the ground's surface texture ${urls[k]} is ${b.width}×${b.height}, resampled to ${w}×${h}`)
    }
    g.clearRect(0, 0, w, h)
    g.drawImage(b, 0, 0, w, h)
    const px = g.getImageData(0, 0, w, h).data
    // rows flipped: as the image loaded with invertY (the texture's first row is the image's last)
    for (let y = 0; y < h; y++) {
      for (let x = 0, o = (h - 1 - y) * w * 4 + k, s = y * w * 4; x < w; x++, o += 4, s += 4) out[o] = px[s]
    }
    b.close()
  }
  for (let o = 3; o < out.length; o += 4) out[o] = 255
  const tex = new RawTexture(
    out,
    w,
    h,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  tex.name = 'groundSurfaces'
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE
  tex.anisotropicFilteringLevel = 4
  performance.measure('groundSurfacesPack', { start: t0, end: performance.now() })
  return { tex, ok: bmps.map(b => b !== null) }
}
