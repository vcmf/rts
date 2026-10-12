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

// the arms (macro.glsl): flat, shader, bake
export const MACRO_ARMS = ['flat', 'shader', 'bake'] as const
export type MacroArm = typeof MACRO_ARMS[number]
const ARM_DEFINE: Record<MacroArm, string> = { flat: 'MACRO_FLAT', shader: 'MACRO_SHADER', bake: 'MACRO_BAKE' }
// the checks' variants (tools/macro-check.mjs): the class view, and the sabotages (every class the meadow's colour; the
// stripes not faded with the footprint)
export const MACRO_CHECK_DEFINES = ['MACRO_DEBUG', 'MACRO_SAB_ONECLASS', 'MACRO_SAB_STEP'] as const

const BAKE_VS = 'precision highp float;attribute vec2 position;varying vec2 vUV;void main(){vUV=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}'
// uRect: the world rectangle (x0, z0, x1, z1) of the draw; uTexel: the bake's texel, m (the stripes' footprint)
const BAKE_FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;varying vec2 vUV;uniform vec4 uRect;uniform float uTexel;
#include<painter>
#include<shore>
void main(){gl_FragColor=macro(mix(uRect.xy,uRect.zw,vUV),1.0,uTexel);}`

export interface BakeStats { ms: number; texels: number; draws: number; mb: number; lost: boolean }
export interface Macro {
  cover: RawTexture; tile: RenderTargetTexture; far: RenderTargetTexture
  setArm(arm: MacroArm): void; arm(): MacroArm
  // the checks' variants on every painted material and the bake (rebaked)
  setCheck(on: string[]): Promise<BakeStats>
  bake(): Promise<BakeStats>
  // the full-size run (the track plan's measurement): a side² target over side · texel m, then freed
  bakeBench(side: number): Promise<BakeStats>
  hash(which: 'tile' | 'far'): Promise<string>
}

export function buildMacro(scene: Scene, mats: Materials, cover: CoverGrid): Macro {
  const engine = scene.getEngine() as AbstractEngine, s = D.spec.macro
  const coverTex = RawTexture.CreateRGBATexture(cover.tex, cover.n, cover.n, scene, false, false, Texture.NEAREST_SAMPLINGMODE)
  coverTex.wrapU = coverTex.wrapV = Texture.CLAMP_ADDRESSMODE
  const target = (name: string, n: number) => {
    const t = new RenderTargetTexture(name, n, scene, { generateMipMaps: true, generateDepthBuffer: false, generateStencilBuffer: false, type: Constants.TEXTURETYPE_UNSIGNED_BYTE, samplingMode: Texture.TRILINEAR_SAMPLINGMODE, format: Constants.TEXTUREFORMAT_RGBA })
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = 4; return t
  }
  const tile = target('macroTile', D.macroN), far = target('macroFar', D.macroFarN)
  mats.bindAll(m => { m.setTexture('uCover', coverTex); m.setTexture('uMacro', tile); m.setTexture('uMacroFar', far) })

  const UNIFORMS = ['uRect', 'uTexel', 'uSeason'], SAMPLERS = ['uGrain', 'uCover']
  const wrapper = new EffectWrapper({ engine, name: 'macroBake', vertexShader: BAKE_VS, fragmentShader: withPainter(BAKE_FS), attributeNames: ['position'], uniformNames: UNIFORMS, samplerNames: SAMPLERS, defines: D.defines })
  const renderer = new EffectRenderer(engine)
  let lost = false
  engine.onContextLostObservable.add(() => { lost = true })
  const ready = () => new Promise<void>((res, rej) => { const t0 = performance.now(); const poll = () => wrapper.effect.isReady() ? res() : performance.now() - t0 > 30000 ? rej(new Error(`macro bake: the shader did not compile: ${wrapper.effect.getCompilationError()}`)) : setTimeout(poll, 16); poll() })
  // gl.readPixels of one texel waits for the GPU: the bake's time includes its work, not only its submission
  const gl = (engine as unknown as { _gl: WebGLRenderingContext })._gl
  // one target over the world square centred on 0 of side `world` m
  const draw = async (t: RenderTargetTexture, n: number, world: number): Promise<BakeStats> => {
    await ready()
    const t0 = performance.now(), k = s.bakeTile, rt = t.renderTarget!
    let draws = 0
    renderer.saveStates(); engine.bindFramebuffer(rt, undefined, undefined, undefined, true)
    for (let j = 0; j < n; j += k) for (let i = 0; i < n; i += k) {
      const w = Math.min(k, n - i), h = Math.min(k, n - j)
      renderer.setViewport(new Viewport(i / n, j / n, w / n, h / n)); renderer.applyEffectWrapper(wrapper)
      const e = wrapper.effect, x0 = -world / 2
      e.setFloat4('uRect', x0 + i / n * world, x0 + j / n * world, x0 + (i + w) / n * world, x0 + (j + h) / n * world)
      e.setFloat('uTexel', world / n); e.setFloat('uSeason', 0); e.setTexture('uGrain', mats.grain); e.setTexture('uCover', coverTex)
      renderer.draw(); draws++
    }
    const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    engine.unBindFramebuffer(rt, false); renderer.restoreStates()   // makes the mips
    return { ms: performance.now() - t0, texels: n * n, draws, mb: bakeMB(n, n) * 4 / 3, lost }
  }
  let arm: MacroArm = 'bake'
  const setArm = (a: MacroArm) => {
    if (!MACRO_ARMS.includes(a)) throw new Error(`unknown macro arm ${a}`)
    arm = a; for (const m of mats.all) for (const k of MACRO_ARMS) m.setDefine(`#define ${ARM_DEFINE[k]}`, k === a)
  }
  const bake = async () => {
    const a = await draw(tile, D.macroN, D.spec.tile), b = await draw(far, D.macroFarN, D.spec.far)
    return { ms: a.ms + b.ms, texels: a.texels + b.texels, draws: a.draws + b.draws, mb: a.mb + b.mb, lost: a.lost || b.lost }
  }
  mats.onGrain(() => void bake())
  const setCheck = async (on: string[]) => {
    for (const d of on) if (!(MACRO_CHECK_DEFINES as readonly string[]).includes(d)) throw new Error(`unknown macro check define ${d}`)
    for (const m of mats.all) for (const d of MACRO_CHECK_DEFINES) m.setDefine(`#define ${d}`, on.includes(d))
    wrapper.updateEffect([...D.defines, ...on.filter(d => d !== 'MACRO_DEBUG').map(d => `#define ${d}`)].join('\n'), UNIFORMS, SAMPLERS)
    return bake()
  }
  return {
    cover: coverTex, tile, far, setArm, arm: () => arm, bake, setCheck,
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
