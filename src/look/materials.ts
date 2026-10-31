// The shared painter and the material factory (prototypes/painted-cinematic.html, docs/art-bible.md §4): one paint
// function for everything (hue-shifted light, banded values broken by a world-anchored grain, graphic rim, cloud
// shadows), inlined into every fragment shader where it says #include<painter>.
import { bindTile } from './tile.ts'
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
import { SUN_TOWARD } from './sun.ts'
import { lockMood, MOOD, SEASON, type Mood, type SeasonLight } from './mood.ts'
import { D } from './spec.ts'
import type { Effect } from '@babylonjs/core/Materials/effect.js'

// the panel's state; t is the clock (cloud drift, water flow)
export const S = {
  grain: 1,
  gamt: 0.9,
  edges: 1,
  clouds: 1,
  shadows: 1,
  ao: 1,
  mist: 1,
  shafts: 1,
  back: 1,
  grade: 1,
  bloom: 1,
  dof: 1,
  dofAmt: 1,
  res: 0,
  season: 0,
  t: 0,
}
export type LookState = typeof S

export const SUN = new Vector3(...SUN_TOWARD).normalize() // low side-back light, ~27° elevation (src/look/sun.ts)

const MARK = '#include<painter>'
// every painted fragment shader includes the painter, and may include the water data's reads (#include<waterdata>)
// and the shore band with the bank normals (#include<shore>, after both; it includes the ground's macro colour,
// #include<macro>); a replacer function keeps `$` in the GLSL
export const withPainter = (src: string): string => {
  if (!src.includes(MARK)) throw new Error(`a painted shader without ${MARK}`)
  // the mood's warm autumn as a constant (AUTUMN_WARM: the mood is fixed for the page), so the compiler folds it away;
  // the switches defined only when on (Babylon's preprocessor reads `#if X` as `defined X`: tested with #ifdef)
  return (
    src
      .replace(
        MARK,
        () =>
          `#define AUTUMN_WARM ${MOOD.autumn.toFixed(3)}\n${MOOD.autumn > 0 ? '#define AUTUMN_ON\n' : ''}${MOOD.grade.greenHue > 0 ? '#define MOOD_GRADE\n' : ''}` +
          PAINTER,
      )
      .replace('#include<waterdata>', () => WATERDATA)
      .replace('#include<shore>', () => SHORE)
      // the meadow's clump field before the macro colour, whose groundAt reads it (MEADOW)
      .replace('#include<macro>', () => MEADOW + MACRO)
  )
}

// the ground's macro colour (src/look/shaders/macro.glsl): the cover grid and the bakes, on every painted material
// uMeadowBrush: the meadow's brush tile (MEADOW, src/look/meadow.ts); uSurf: the dirt and the earth, packed
// (src/look/macro.ts); uMeadow: the meadow map (the ground under the grass, the combed meadow); uFlow, uComb: the
// flow's textures (src/look/flow.ts)
const MACRO_SAMPLERS = [
  'uRelief',
  'uCover',
  'uMacro',
  'uMacroFar',
  'uMeadowBrush',
  'uSurf',
  'uMeadow',
  'uFlow',
  'uComb',
  'uCombNear',
]
// the mood's colours each material takes (src/look/mood.ts), by uniform: one table gives both the uniform names and
// their values, so none is left unset (an unset vec3 reads black). The shadow band's colour and turn follow the season:
// SEASON_UNIFORMS below
const MOOD_COLOURS: Record<string, (m: Mood) => Color3> = {
  uSunCol: m => m.sun,
  uUnitShadow: m => m.shadow,
  uShadowLift: m => m.shadowLift,
  uCloudSnow: m => m.cloudSnow,
  uMidCool: m => m.midCool,
  uLitLift: m => m.litLift,
  uRimCol: m => m.rim,
  uBackCol: m => m.back,
  uMistShade: m => m.mistShade,
  uMistLit: m => m.mistLit,
  uHazeCool: m => m.hazeCool,
  uHazeWarm: m => m.hazeWarm,
  uWaterSky: m => m.waterSky,
  uGlint: m => m.glint,
  uFarRiver: m => m.farRiver,
  uGreenTint: m => m.grade.greenTint,
  uSplitLo: m => m.grade.splitLo,
  uSplitHi: m => m.grade.splitHi,
  uLift: m => m.grade.lift,
  uTopHaze: m => m.grade.topHaze,
  uEarthTint: m => m.earth.tint,
}
const MOOD_FLOATS: Record<string, (m: Mood) => number> = {
  uGreenChroma: m => m.grade.greenChroma,
  uGreenAmt: m => m.grade.greenAmt,
  uTopAmt: m => m.grade.topAmt,
  uEarthChroma: m => m.earth.chroma,
  uEarthAmt: m => m.earth.amt,
  uBounce: m => m.bounce,
  uGroundBounce: m => m.groundBounce,
  uMoodMist: m => m.mist,
  uAutumnWarm: m => m.autumn,
  uUnitTint: m => m.units.tint,
  uUnitMist: m => m.units.mist,
  uUnitGrade: m => m.units.grade,
  uUnitBounce: m => m.units.bounce,
}
// the season's light (seasonLight, src/look/mood.ts) as uniforms: one table gives the names (COMMON) and how each is
// set from a snapshot of SEASON, so none is left unset (an unset vec3 reads black)
const SEASON_UNIFORMS: Record<string, (m: ShaderMaterial, s: SeasonLight) => void> = {
  uShadowCol: (m, s) => m.setColor3('uShadowCol', s.shadow),
  uShadowTurn: (m, s) => m.setColor3('uShadowTurn', s.turn),
  uGradeSat: (m, s) => m.setFloat('uGradeSat', s.sat),
  uGreenK: (m, s) => m.setFloat('uGreenK', s.greenK),
  uGreenRot: (m, s) => m.setMatrix3x3('uGreenRot', s.greenRot),
  uSeasonGround: (m, s) => m.setFloat('uSeasonGround', s.ground),
  uTipTint: (m, s) => m.setColor3('uTipTint', s.tip),
  uTipWarm: (m, s) => m.setFloat('uTipWarm', s.tipWarm),
}
// a copy of SEASON (a material keeps the objects it is given: Babylon stores colours and matrices by reference)
export const seasonSnapshot = (): SeasonLight => ({
  ...SEASON,
  shadow: SEASON.shadow.clone(),
  turn: SEASON.turn.clone(),
  greenRot: SEASON.greenRot.slice(),
  tip: SEASON.tip.clone(),
})
export function setSeasonUniforms(m: ShaderMaterial, s: SeasonLight = seasonSnapshot()): void {
  for (const f of Object.values(SEASON_UNIFORMS)) f(m, s)
}
// (uUnit*: the figures' cast shadows on the materials they fall on, UNIT_SHADOWS: src/look/units.ts)
const COMMON = [
  'uReliefK',
  ...Object.keys(MOOD_COLOURS),
  ...Object.keys(MOOD_FLOATS),
  'uUnitVP',
  'uUnitTexel',
  'uUnitBias',
  'uUnitFar',
  'uTrampleBox',
  'uGrade',
  'uViewH',
  'uLMVP',
  'uAO',
  'uMist',
  'uShafts',
  'uBack',
  'uSeason',
  'uLightVP',
  'uSMTexel',
  'uSMFade',
  'uShadowsOn',
  'uSunDir',
  'uCamPos',
  'uFocus',
  'uTime',
  'uGrainAmt',
  'uEdges',
  'uClouds',
  'uGrainMean',
  'uPixA',
  'uDirtOn',
  ...Object.keys(SEASON_UNIFORMS),
  'uEarthOn',
  'uCombNearRect',
  'uCoverBox',
  'uTileO',
  'uFocusZ',
  'uCamFwd',
]

// perFrame: false keeps a material out of `all` (no per-frame uniforms, no light map: the light-map bake draws into it)
export interface MatOptions {
  attributes?: string[]
  uniforms?: string[]
  samplers?: string[]
  alpha?: boolean
  defines?: string[]
  perFrame?: boolean
}

// every painted material, so per-frame uniforms and a new grain reach all of them
export const MAX_SAMPLERS = 16
export class Materials {
  readonly all: ShaderMaterial[] = []
  private readonly every: ShaderMaterial[] = [] // all, and the ones kept out of it (the bake's)
  private readonly scene: Scene
  private readonly binders: ((m: ShaderMaterial) => void)[] = []
  grain: BaseTexture
  // the means of its R and G channels
  grainMean: [number, number]
  readonly webgl1: boolean // the detail layer's materials keep the L0 grain (DETAIL_L0) whatever is asked
  private readonly defines: string[] // on every painted material (the page's switches: SKY_IN_SHADOW)
  constructor(scene: Scene, grain: BaseTexture, grainMean: [number, number], defines: string[] = []) {
    this.scene = scene
    this.grain = grain
    this.grainMean = grainMean
    this.defines = defines
    this.webgl1 = scene.getEngine().version < 2
    lockMood()
  }
  make(
    name: string,
    vs: string,
    fs: string,
    {
      attributes = ['position', 'normal'],
      uniforms = [],
      samplers = [],
      alpha = false,
      defines = [],
      perFrame = true,
    }: MatOptions = {},
  ): ShaderMaterial {
    // the detail layer needs GLSL ES 3.00 (textureGrad): on WebGL1 its materials keep the L0 grain
    if (defines.includes('#define DETAIL') && this.webgl1) defines = [...defines, '#define DETAIL_L0']
    const m = new ShaderMaterial(
      name,
      this.scene,
      { vertexSource: vs, fragmentSource: withPainter(fs) },
      {
        attributes,
        uniforms: ['world', 'viewProjection', ...COMMON, ...uniforms],
        samplers: [
          'uGrain',
          'uShadowMap',
          'uLM',
          'uUnitSM',
          'uTrample',
          ...MACRO_SAMPLERS,
          ...samplers.filter(
            x =>
              x !== 'uShadowMap' && x !== 'uLM' && x !== 'uUnitSM' && x !== 'uTrample' && !MACRO_SAMPLERS.includes(x),
          ),
        ],
        needAlphaBlending: alpha,
        defines: [...D.defines, ...this.defines, ...defines],
      },
    )
    for (const [u, f] of Object.entries(MOOD_COLOURS)) m.setColor3(u, f(MOOD)) // the light's colours (src/look/mood.ts)
    for (const [u, f] of Object.entries(MOOD_FLOATS)) m.setFloat(u, f(MOOD))
    // the season's light as it is when made (src/look/main.ts sets it again on every per-frame material as the season
    // moves; a perFrame:false material keeps the values it was made with: copies, not SEASON's own objects)
    setSeasonUniforms(m)
    m.setVector3('uSunDir', SUN)
    bindTile(m)
    m.setTexture('uGrain', this.grain)
    m.setVector2('uGrainMean', new Vector2(...this.grainMean))
    this.every.push(m)
    if (perFrame) {
      this.all.push(m)
      for (const b of this.binders) b(m)
    }
    m.onCompiled = e => this.checkSamplers(name, e)
    return m
  }
  // a fragment shader may use 16 texture units on Metal (ANGLE's MAX_TEXTURE_IMAGE_UNITS there, a limit per stage;
  // SwiftShader allows more, so a material over it compiled in the checks and failed on the owner's GPU: the paving's
  // sampler on the water). Counted per compiled program, the fragment stage's alone: the program's active samplers (the
  // compiler keeps only those a stage really reads) that the final fragment source names past their declaration (a
  // vertex-only fetch, a wind or height map, counts against the vertex stage's own limit, not this one). A material
  // over it is logged at once and stops the page at its next frame (failSamplers, from main.ts's render loop:
  // Babylon catches a throw in onCompiled and keeps the effect drawing), so the tools fail it on any GPU. The counts
  // kept for the tools (window.__look.mats.samplers)
  readonly samplers: Record<string, number> = {}
  private readonly over: string[] = []
  private checkSamplers(name: string, e: Effect): void {
    const gl = (this.scene.getEngine() as unknown as { _gl?: WebGL2RenderingContext })._gl
    const prog = (e as unknown as { _pipelineContext?: { program?: WebGLProgram } })._pipelineContext?.program
    if (!gl || !prog) return
    const SAMPLER = new Set<number>([
      gl.SAMPLER_2D,
      gl.SAMPLER_3D,
      gl.SAMPLER_CUBE,
      gl.SAMPLER_2D_SHADOW,
      gl.SAMPLER_2D_ARRAY,
      gl.SAMPLER_2D_ARRAY_SHADOW,
      gl.SAMPLER_CUBE_SHADOW,
      gl.INT_SAMPLER_2D,
      gl.INT_SAMPLER_3D,
      gl.INT_SAMPLER_CUBE,
      gl.INT_SAMPLER_2D_ARRAY,
      gl.UNSIGNED_INT_SAMPLER_2D,
      gl.UNSIGNED_INT_SAMPLER_3D,
      gl.UNSIGNED_INT_SAMPLER_CUBE,
      gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
    ])
    const fs = e.fragmentSourceCode ?? ''
    const uses = (u: string) => (fs.match(new RegExp(`\\b${u}\\b`, 'g')) ?? []).length > 1
    let n = 0
    for (let i = 0, k = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number; i < k; i++) {
      const u = gl.getActiveUniform(prog, i)
      if (u && SAMPLER.has(u.type) && uses(u.name.replace(/\[0\]$/, ''))) n += u.size
    }
    this.samplers[name] = Math.max(this.samplers[name] ?? 0, n)
    if (n > MAX_SAMPLERS && !this.over.includes(name)) {
      this.over.push(name)
      console.error(
        `the material ${name} reads ${n} textures in its fragment shader, over ${MAX_SAMPLERS} (Metal's: src/look/materials.ts)`,
      )
    }
  }
  // the page stopped by a material over the units (checkSamplers): each frame, from main.ts's render loop
  failSamplers(): void {
    if (this.over.length) {
      throw new Error(
        `materials over ${MAX_SAMPLERS} fragment textures: ${this.over.join(', ')} (src/look/materials.ts)`,
      )
    }
  }
  // a new grain texture for every painted material, the bake's too; mean: its R and G channels' (the detail layer
  // renormalises about them)
  setGrain(grain: BaseTexture, mean: [number, number]): void {
    const changed = grain !== this.grain
    this.grain = grain
    this.grainMean = mean
    for (const m of this.every) {
      m.setTexture('uGrain', grain)
      m.setVector2('uGrainMean', new Vector2(...mean))
    }
    if (changed) for (const f of this.grainUsers) f()
  }
  // what else reads the grain and must follow a new one (the macro colour's bake: src/look/macro.ts)
  private readonly grainUsers: (() => void)[] = []
  onGrain(f: () => void): void {
    this.grainUsers.push(f)
  }
  // bindings for every painted material, now and made later (the bakes' textures and matrices)
  bindAll(b: (m: ShaderMaterial) => void): void {
    this.binders.push(b)
    for (const m of this.all) b(m)
  }
}
