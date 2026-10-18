// The shared painter and the material factory (prototypes/painted-cinematic.html, docs/art-bible.md §4): one paint
// function for everything (hue-shifted light, banded values broken by a world-anchored grain, graphic rim, cloud
// shadows), inlined into every fragment shader where it says #include<painter>.
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import type { Scene } from '@babylonjs/core/scene.js'
import PAINTER from './shaders/painter.glsl?raw'
import WATERDATA from './shaders/waterdata.glsl?raw'
import SHORE from './shaders/shore.glsl?raw'
import MACRO from './shaders/macro.glsl?raw'
import MEADOW from './shaders/meadow.glsl?raw'
import type { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { lockMood, MOOD, type Mood } from './mood.ts'
import { D } from './spec.ts'

// the panel's state; t is the clock (cloud drift, water flow)
export const S = { grain: 1, gamt: 0.9, edges: 1, clouds: 1, shadows: 1, ao: 1, mist: 1, shafts: 1, back: 1, grade: 1, bloom: 1, dof: 1, dofAmt: 1, res: 0, season: 0, t: 0 }
export type LookState = typeof S

export const SUN = new Vector3(-0.70, 0.45, 0.55).normalize()   // low side-back light, ~27° elevation

const MARK = '#include<painter>'
// every painted fragment shader includes the painter, and may include the water data's reads (#include<waterdata>)
// and the shore band with the bank normals (#include<shore>, after both; it includes the ground's macro colour,
// #include<macro>); a replacer function keeps `$` in the GLSL
export const withPainter = (src: string): string => {
  if (!src.includes(MARK)) throw new Error(`a painted shader without ${MARK}`)
  return src.replace(MARK, () => PAINTER).replace('#include<waterdata>', () => WATERDATA).replace('#include<shore>', () => SHORE).replace('#include<macro>', () => MEADOW + MACRO)   // the meadow's clump field before the macro colour, whose groundAt reads it (MEADOW)
}

// the ground's macro colour (src/look/shaders/macro.glsl): the cover grid and the bakes, on every painted material
const MACRO_SAMPLERS = ['uCover', 'uMacro', 'uMacroFar', 'uMeadowBrush', 'uDirt', 'uMeadow', 'uFlow', 'uComb', 'uCombNear']   // uMeadowBrush: the meadow's brush tile (MEADOW, src/look/meadow.ts); uMeadow: the meadow map (the ground under the grass, the combed meadow); uFlow, uComb: the flow's textures (src/look/flow.ts)
// the mood's colours each material takes (src/look/mood.ts), by uniform: one table gives both the uniform names and
// their values, so none is left unset (an unset vec3 reads black). The shadow's turn is divided by its luma here
// (shadowOf works on hue at the same value), not per pixel
const luma = (c: Color3) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b
const MOOD_COLOURS: Record<string, (m: Mood) => Color3> = {
  uSunCol: m => m.sun, uShadowCol: m => m.shadow, uShadowTurn: m => m.shadowTurn.scale(1 / luma(m.shadowTurn)), uShadowLift: m => m.shadowLift,
  uMidCool: m => m.midCool, uLitLift: m => m.litLift, uRimCol: m => m.rim, uBackCol: m => m.back, uMistShade: m => m.mistShade, uMistLit: m => m.mistLit,
  uHazeCool: m => m.hazeCool, uHazeWarm: m => m.hazeWarm, uWaterSky: m => m.waterSky, uGlint: m => m.glint, uFarRiver: m => m.farRiver,
  uGreenTint: m => m.grade.greenTint, uSplitLo: m => m.grade.splitLo, uSplitHi: m => m.grade.splitHi, uLift: m => m.grade.lift, uTopHaze: m => m.grade.topHaze,
  uEarthTint: m => m.earth.tint,
}
const MOOD_FLOATS: Record<string, (m: Mood) => number> = {
  uGreenChroma: m => m.grade.greenChroma, uGreenAmt: m => m.grade.greenAmt, uGradeSat: m => m.grade.sat, uTopAmt: m => m.grade.topAmt,
  uEarthChroma: m => m.earth.chroma, uEarthAmt: m => m.earth.amt, uBounce: m => m.bounce, uGroundBounce: m => m.groundBounce,
  uUnitTint: m => m.units.tint, uUnitMist: m => m.units.mist, uUnitGrade: m => m.units.grade, uUnitBounce: m => m.units.bounce,
}
const COMMON = [...Object.keys(MOOD_COLOURS), ...Object.keys(MOOD_FLOATS), 'uGrade', 'uViewH', 'uLMVP', 'uAO', 'uMist', 'uShafts', 'uBack', 'uSeason', 'uLightVP', 'uSMTexel', 'uSMFade', 'uShadowsOn', 'uSunDir', 'uCamPos', 'uFocus', 'uTime', 'uGrainAmt', 'uEdges', 'uClouds', 'uGrainMean', 'uPixA', 'uDirtOn', 'uCombNearRect', 'uFocusZ', 'uCamFwd']

// perFrame: false keeps a material out of `all` (no per-frame uniforms, no light map: the light-map bake draws into it)
export interface MatOptions { attributes?: string[]; uniforms?: string[]; samplers?: string[]; alpha?: boolean; defines?: string[]; perFrame?: boolean }

// every painted material, so per-frame uniforms and a new grain reach all of them
export class Materials {
  readonly all: ShaderMaterial[] = []
  private readonly every: ShaderMaterial[] = []   // all, and the ones kept out of it (the bake's)
  private readonly scene: Scene
  private readonly binders: ((m: ShaderMaterial) => void)[] = []
  grain: BaseTexture; grainMean: [number, number]   // the means of its R and G channels
  readonly webgl1: boolean   // the detail layer's materials keep the L0 grain (DETAIL_L0) whatever is asked
  private readonly defines: string[]   // on every painted material (the page's switches: SKY_IN_SHADOW)
  constructor(scene: Scene, grain: BaseTexture, grainMean: [number, number], defines: string[] = []) { this.scene = scene; this.grain = grain; this.grainMean = grainMean; this.defines = defines; this.webgl1 = scene.getEngine().version < 2; lockMood() }
  make(name: string, vs: string, fs: string, { attributes = ['position', 'normal'], uniforms = [], samplers = [], alpha = false, defines = [], perFrame = true }: MatOptions = {}): ShaderMaterial {
    // the detail layer needs GLSL ES 3.00 (textureGrad): on WebGL1 its materials keep the L0 grain
    if (defines.includes('#define DETAIL') && this.webgl1) defines = [...defines, '#define DETAIL_L0']
    const m = new ShaderMaterial(name, this.scene, { vertexSource: vs, fragmentSource: withPainter(fs) },
      { attributes, uniforms: ['world', 'viewProjection', ...COMMON, ...uniforms], samplers: ['uGrain', 'uShadowMap', 'uLM', ...MACRO_SAMPLERS, ...samplers.filter(x => x !== 'uShadowMap' && x !== 'uLM' && !MACRO_SAMPLERS.includes(x))], needAlphaBlending: alpha, defines: [...D.defines, ...this.defines, ...defines] })
    for (const [u, f] of Object.entries(MOOD_COLOURS)) m.setColor3(u, f(MOOD))   // the light's colours (src/look/mood.ts)
    for (const [u, f] of Object.entries(MOOD_FLOATS)) m.setFloat(u, f(MOOD))
    m.setVector3('uSunDir', SUN); m.setTexture('uGrain', this.grain); m.setVector2('uGrainMean', new Vector2(...this.grainMean))
    this.every.push(m)
    if (perFrame) { this.all.push(m); for (const b of this.binders) b(m) }
    return m
  }
  // a new grain texture for every painted material, the bake's too; mean: its R and G channels' (the detail layer
  // renormalises about them)
  setGrain(grain: BaseTexture, mean: [number, number]): void {
    const changed = grain !== this.grain
    this.grain = grain; this.grainMean = mean
    for (const m of this.every) { m.setTexture('uGrain', grain); m.setVector2('uGrainMean', new Vector2(...mean)) }
    if (changed) for (const f of this.grainUsers) f()
  }
  // what else reads the grain and must follow a new one (the macro colour's bake: src/look/macro.ts)
  private readonly grainUsers: (() => void)[] = []
  onGrain(f: () => void): void { this.grainUsers.push(f) }
  // bindings for every painted material, now and made later (the bakes' textures and matrices)
  bindAll(b: (m: ShaderMaterial) => void): void { this.binders.push(b); for (const m of this.all) b(m) }
}
