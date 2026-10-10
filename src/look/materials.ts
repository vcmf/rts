// The shared painter and the material factory (prototypes/painted-cinematic.html, docs/art-bible.md §4): one paint
// function for everything (hue-shifted light, banded values broken by a world-anchored grain, graphic rim, cloud
// shadows), inlined into every fragment shader where it says #include<painter>.
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import type { Scene } from '@babylonjs/core/scene.js'
import PAINTER from './shaders/painter.glsl?raw'
import { SHADER_DEFINES } from './spec.ts'

// the panel's state; t is the clock (cloud drift, water flow)
export const S = { grain: 1, gamt: 0.9, edges: 1, clouds: 1, shadows: 1, ao: 1, mist: 1, shafts: 1, back: 1, grade: 1, bloom: 1, dof: 0, dofAmt: 1, res: 1, season: 0, t: 0 }
export type LookState = typeof S

export const SUN = new Vector3(-0.70, 0.45, 0.55).normalize()   // low side-back light, ~27° elevation
export const PAL = { sun: new Color3(1.00, 0.84, 0.60), shadow: new Color3(0.45, 0.57, 0.76), hazeCool: new Color3(0.60, 0.69, 0.78), hazeWarm: new Color3(0.95, 0.80, 0.58) }
export const CLEAR = new Color4(PAL.hazeCool.r, PAL.hazeCool.g, PAL.hazeCool.b, 1)

export const withPainter = (src: string): string => src.replace('#include<painter>', PAINTER)

const COMMON = ['uLMVP', 'uAO', 'uMist', 'uShafts', 'uBack', 'uSeason', 'uLightVP', 'uSMTexel', 'uSMFade', 'uShadowsOn', 'uSunDir', 'uSunCol', 'uShadowCol', 'uHazeCool', 'uHazeWarm', 'uCamPos', 'uFocus', 'uTime', 'uGrainAmt', 'uEdges', 'uClouds']

export interface MatOptions { attributes?: string[]; uniforms?: string[]; samplers?: string[]; alpha?: boolean; defines?: string[] }

// every painted material, so per-frame uniforms and a new grain reach all of them
export class Materials {
  readonly all: ShaderMaterial[] = []
  private readonly scene: Scene
  grain: BaseTexture
  constructor(scene: Scene, grain: BaseTexture) { this.scene = scene; this.grain = grain }
  make(name: string, vs: string, fs: string, { attributes = ['position', 'normal'], uniforms = [], samplers = [], alpha = false, defines = [] }: MatOptions = {}): ShaderMaterial {
    const m = new ShaderMaterial(name, this.scene, { vertexSource: vs, fragmentSource: withPainter(fs) },
      { attributes, uniforms: ['world', 'viewProjection', ...COMMON, ...uniforms], samplers: ['uGrain', 'uShadowMap', 'uLM', ...samplers.filter(x => x !== 'uShadowMap' && x !== 'uLM')], needAlphaBlending: alpha, defines: [...SHADER_DEFINES, ...defines] })
    m.setVector3('uSunDir', SUN); m.setColor3('uSunCol', PAL.sun); m.setColor3('uShadowCol', PAL.shadow)
    m.setColor3('uHazeCool', PAL.hazeCool); m.setColor3('uHazeWarm', PAL.hazeWarm); m.setTexture('uGrain', this.grain)
    this.all.push(m); return m
  }
}
