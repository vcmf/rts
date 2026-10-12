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
import type { Scene } from '@babylonjs/core/scene.js'
import { withPainter, type Materials } from './materials.ts'
import { D, bakeMB } from './spec.ts'
import type { CoverGrid } from './world/cover.ts'

// the arms (macro.glsl): flat, shader, bake, and L5b's experiments, strokes (arm 4) and kuwahara (arm 5): bakes of
// their own, read as the bake is
export const MACRO_ARMS = ['flat', 'shader', 'bake', 'strokes', 'kuwahara'] as const
export type MacroArm = typeof MACRO_ARMS[number]
const MATERIAL_DEFINES = ['MACRO_FLAT', 'MACRO_SHADER', 'MACRO_BAKE'] as const
const ARM_DEFINE: Record<MacroArm, typeof MATERIAL_DEFINES[number]> = { flat: 'MACRO_FLAT', shader: 'MACRO_SHADER', bake: 'MACRO_BAKE', strokes: 'MACRO_BAKE', kuwahara: 'MACRO_BAKE' }
const isBaked = (a: MacroArm): boolean => ARM_DEFINE[a] === 'MACRO_BAKE'
// the checks' variants (tools/macro-check.mjs): the class view, and the sabotages (every class the meadow's colour; the
// stripes not faded with the footprint)
export const MACRO_CHECK_DEFINES = ['MACRO_DEBUG', 'MACRO_SAB_ONECLASS', 'MACRO_SAB_STEP'] as const

const BAKE_VS = 'precision highp float;attribute vec2 position;varying vec2 vUV;void main(){vUV=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}'
// uRect: the world rectangle (x0, z0, x1, z1) of the draw; uTexel: the bake's texel, m (the stripes' footprint)
const BAKE_FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec2 vUV;uniform vec4 uRect;uniform float uTexel;
#include<painter>
#include<shore>
void main(){vec2 xz=mix(uRect.xy,uRect.zw,vUV);macroDerivs(xz);gl_FragColor=bakeTexel(xz,uTexel);}`
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

export interface BakeStats { ms: number; texels: number; draws: number; mb: number; lost: boolean }
export interface Macro {
  cover: RawTexture; tile: RenderTargetTexture; far: RenderTargetTexture
  // a baked arm other than the one the bakes hold rebakes them (the stats of that rebake, else zeros)
  setArm(arm: MacroArm): Promise<BakeStats>; arm(): MacroArm
  // the checks' variants on every painted material and the bake (rebaked)
  setCheck(on: string[]): Promise<BakeStats>
  bake(): Promise<BakeStats>
  // the full-size run (the track plan's measurement): a side² target over side · texel m, then freed
  bakeBench(side: number): Promise<BakeStats>
  hash(which: 'tile' | 'far'): Promise<string>
  // the last bake started (by a new grain, a restored context, a check), settled
  settled(): Promise<unknown>
}

export function buildMacro(scene: Scene, mats: Materials, cover: CoverGrid): Macro {
  const engine = scene.getEngine() as AbstractEngine, s = D.spec.macro
  const coverTex = RawTexture.CreateRGBATexture(cover.tex, cover.n, cover.n, scene, false, false, Texture.NEAREST_SAMPLINGMODE)
  coverTex.wrapU = coverTex.wrapV = Texture.CLAMP_ADDRESSMODE
  // mipmapped on WebGL2; WebGL1 cannot mipmap a texture whose sides are not powers of two (1600², 650²), so there the
  // bakes are read bilinear, without mips (an incomplete mipmapped texture would read black)
  const mips = !mats.webgl1
  const target = (name: string, n: number) => {
    const t = new RenderTargetTexture(name, n, scene, { generateMipMaps: mips, generateDepthBuffer: false, generateStencilBuffer: false, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: mips ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE, format: Constants.TEXTUREFORMAT_RGBA })
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = mips ? 4 : 1; return t
  }
  const tile = target('macroTile', D.macroN), far = target('macroFar', D.macroFarN)
  // arm 5's scratch: the bake before its filter, read texel by texel (made for a bake, then freed)
  const scratch = (n: number) => {
    const t = new RenderTargetTexture('macroScratch', n, scene, { generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: Texture.NEAREST_SAMPLINGMODE, format: Constants.TEXTUREFORMAT_RGBA })
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE; return t
  }
  mats.bindAll(m => { m.setTexture('uCover', coverTex); m.setTexture('uMacro', tile); m.setTexture('uMacroFar', far) })

  const UNIFORMS = ['uRect', 'uTexel', 'uSeason'], SAMPLERS = ['uGrain', 'uCover']
  const wrapper = new EffectWrapper({ engine, name: 'macroBake', vertexShader: BAKE_VS, fragmentShader: withPainter(BAKE_FS), attributeNames: ['position'], uniformNames: UNIFORMS, samplerNames: SAMPLERS, defines: D.defines })
  const kuwahara = new EffectWrapper({ engine, name: 'macroKuwahara', vertexShader: BAKE_VS, fragmentShader: KUWAHARA_FS, attributeNames: ['position'], uniformNames: ['uN', 'uR', 'uPx'], samplerNames: ['uSrc'] })
  const renderer = new EffectRenderer(engine)
  // a lost context empties the targets: a bake that saw a loss reports it, and a restored context bakes again
  let losses = 0
  engine.onContextLostObservable.add(() => { losses++ })
  engine.onContextRestoredObservable.add(() => { rebake() })
  const ready = (w: EffectWrapper) => new Promise<void>((res, rej) => { const t0 = performance.now(); const poll = () => w.effect.isReady() ? res() : performance.now() - t0 > 30000 ? rej(new Error(`macro bake: the shader ${w.name} did not compile: ${w.effect.getCompilationError()}`)) : setTimeout(poll, 16); poll() })
  const gl = (engine as unknown as { _gl: WebGLRenderingContext })._gl
  // one pass of a shader over all of a target's n² texels, bakeTile² at a time; `set` sets the draw's uniforms from
  // its texels (i, j, w, h)
  const pass = (t: RenderTargetTexture, n: number, w: EffectWrapper, set: (e: EffectWrapper['effect'], i: number, j: number, w: number, h: number) => void): number => {
    const k = s.bakeTile, rt = t.renderTarget!
    let draws = 0
    renderer.saveStates(); engine.bindFramebuffer(rt, undefined, undefined, undefined, true)
    for (let j = 0; j < n; j += k) for (let i = 0; i < n; i += k) {
      const dw = Math.min(k, n - i), dh = Math.min(k, n - j)
      // in whole texels (a fraction of n multiplied back can land under a whole number, and gl.viewport truncates it)
      engine.setViewport(new Viewport(i, j, dw, dh), 1, 1); renderer.applyEffectWrapper(w)
      set(w.effect, i, j, dw, dh); renderer.draw(); draws++
    }
    // gl.readPixels of one texel waits for the GPU: the bake's time includes its work, not only its submission
    const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    engine.unBindFramebuffer(rt, false); renderer.restoreStates()   // makes the mips, on a mipmapped target
    return draws
  }
  // one bake over the world square centred on 0 of side `world` m: the macro colour, then on arm 5 its filter
  const draw = async (t: RenderTargetTexture, n: number, world: number): Promise<BakeStats> => {
    await ready(wrapper); if (bakeArm === 'kuwahara') await ready(kuwahara)
    const lost0 = losses, t0 = performance.now(), x0 = -world / 2
    const src = bakeArm === 'kuwahara' ? scratch(n) : t
    try {
      let draws = pass(src, n, wrapper, (e, i, j, w, h) => {
        e.setFloat4('uRect', x0 + i / n * world, x0 + j / n * world, x0 + (i + w) / n * world, x0 + (j + h) / n * world)
        e.setFloat('uTexel', world / n); e.setFloat('uSeason', 0); e.setTexture('uGrain', mats.grain); e.setTexture('uCover', coverTex)
      })
      if (src !== t) draws += pass(t, n, kuwahara, (e, i, j, w, h) => {
        e.setTexture('uSrc', src); e.setFloat('uN', n); e.setFloat4('uPx', i, j, i + w, j + h)
        // 2 m on the tile, a texel on the far ring
        e.setFloat('uR', Math.max(1, Math.min(KUWAHARA_MAX, Math.round(s.kuwahara / (world / n)))))
      })
      return { ms: performance.now() - t0, texels: n * n, draws, mb: bakeMB(n, n) * (mips ? 4 / 3 : 1), lost: losses > lost0 }
    } finally { if (src !== t) src.dispose() }
  }
  // the arm the page shows, and the one the bakes hold (bake, strokes or kuwahara: the last baked one)
  let arm: MacroArm = 'bake', bakeArm: MacroArm = 'bake'
  const bake = async () => {
    const a = await draw(tile, D.macroN, D.spec.tile), b = await draw(far, D.macroFarN, D.spec.far)
    return { ms: a.ms + b.ms, texels: a.texels + b.texels, draws: a.draws + b.draws, mb: a.mb + b.mb, lost: a.lost || b.lost }
  }
  // a rebake no one awaits (a new grain, a restored context): its failure is reported, and settled() waits for it
  let last: Promise<unknown> = Promise.resolve()
  const rebake = () => { last = bake().catch((e: unknown) => { console.error('macro rebake failed:', e) }) }
  mats.onGrain(rebake)
  // the bake's shader's defines: the checks' (all but the class view, which the bake ignores) and arm 4's strokes. The
  // bake is redone only when they, or the arm the bakes hold, change
  let checks: string[] = [], bakeKey = 'bake'
  const NOTHING: BakeStats = { ms: 0, texels: 0, draws: 0, mb: 0, lost: false }
  const rebakeIfChanged = async (): Promise<BakeStats> => {
    const defs = [...checks.filter(d => d !== 'MACRO_DEBUG'), ...(bakeArm === 'strokes' ? ['MACRO_STROKES'] : [])].sort()
    const key = [bakeArm, ...defs].join(' ')
    if (key === bakeKey) return NOTHING
    bakeKey = key
    wrapper.updateEffect([...D.defines, ...defs.map(d => `#define ${d}`)].join('\n'), UNIFORMS, SAMPLERS)
    return bake()
  }
  const setCheck = async (on: string[]) => {
    for (const d of on) if (!(MACRO_CHECK_DEFINES as readonly string[]).includes(d)) throw new Error(`unknown macro check define ${d}`)
    for (const m of mats.all) for (const d of MACRO_CHECK_DEFINES) m.setDefine(`#define ${d}`, on.includes(d))
    checks = [...on]; return rebakeIfChanged()
  }
  // a baked arm other than the one the bakes hold rebakes them
  const setArm = async (a: MacroArm): Promise<BakeStats> => {
    if (!MACRO_ARMS.includes(a)) throw new Error(`unknown macro arm ${a}`)
    arm = a; for (const m of mats.all) for (const d of MATERIAL_DEFINES) m.setDefine(`#define ${d}`, ARM_DEFINE[a] === d)
    if (!isBaked(a)) return NOTHING
    bakeArm = a; return rebakeIfChanged()
  }
  return {
    cover: coverTex, tile, far, setArm, arm: () => arm, bake, setCheck, settled: () => last,
    async bakeBench(side) {
      if (!(Number.isInteger(side) && side >= 64 && side <= D.spec.minSpec.maxTexture)) throw new Error(`?macroBench must be a whole number of texels, 64–${D.spec.minSpec.maxTexture}`)
      const t = target('macroBench', side)
      try { return await draw(t, side, side * s.texel) } finally { t.dispose() }
    },
    async hash(which) {
      const t = which === 'tile' ? tile : far, data = await t.readPixels() as Uint8Array
      let h = 0x811c9dc5; for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193) }
      return (h >>> 0).toString(16).padStart(8, '0')
    },
  }
}
