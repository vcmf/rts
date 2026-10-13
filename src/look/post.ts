// The camera and the finishing passes (prototypes/painted-cinematic.html, docs/research/cheap-painterly-postfx.md):
// [depth of field, one pass, a player option per decision 0020] → one fused pass (grade, bloom, vignette,
// paper, dither). Materials write view distance into alpha, so depth of field needs no second scene render.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js'
import { Effect } from '@babylonjs/core/Materials/effect.js'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js'
// the passes' vertex shader, loaded up front: PostProcess imports it lazily, but in the built page that load never
// completed and the grade pass stayed not-ready (observed in L0c; the CDN build has it registered from the start)
import '@babylonjs/core/Shaders/postprocess.vertex.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { LookState } from './materials.ts'
import { D } from './spec.ts'
import DOF_FS from './shaders/dof.frag?raw'
import UBER_FS from './shaders/uber.frag?raw'

// the view the page opens on (the bench measures it as its default zoom)
export const START = { beta: 0.80, radius: 125, x: -10, z: 2 }
// the gameplay depth of field (decision 0020): the sharp band (|1 - focus/d| below it is sharp), the gain past it, the
// largest blur in pixels at 1080 lines, and the share of it left at the widest zoom
export const DOF = { band: 0.06, k: 4, px: 10, wide: 0.4 }

// the top-down RTS view only (decision 0002); our own controller replaces Babylon's at prototype exit
export function buildCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  const c = D.spec.camera, PLAY = D.spec.play
  const camera = new ArcRotateCamera('cam', c.yaw0, START.beta, START.radius, new Vector3(START.x, c.focusY, START.z), scene)
  scene.activeCamera = camera; camera.attachControl(canvas, true)
  // locked down (decision 0010): yaw ± the spec's range around the default, pitch and zoom inside the checked limits
  camera.lowerAlphaLimit = c.yaw0 - c.yawRange; camera.upperAlphaLimit = c.yaw0 + c.yawRange
  camera.lowerRadiusLimit = c.rMin
  // pan in the ground plane (Babylon pans in the view plane by default, which lifts the target); the focus stays in the play area
  camera.mapPanning = true; scene.onBeforeRenderObservable.add(() => { const t = camera.target; t.x = Math.max(-PLAY, Math.min(PLAY, t.x)); t.z = Math.max(-PLAY, Math.min(PLAY, t.z)) })
  camera.upperRadiusLimit = c.rMax; camera.lowerBetaLimit = c.betaMin; camera.upperBetaLimit = c.betaMax
  camera.wheelDeltaPercentage = 0.01
  camera.panningSensibility = 30; camera.minZ = 0.5; camera.maxZ = 5000; camera.fov = c.fov; camera.inertia = 0.88
  // the SPEC checked frames up to aspectMax: a wider screen keeps that frame's horizontal field of view and sees
  // less vertically, never more of the world than was checked
  const fit = () => {
    const wide = scene.getEngine().getAspectRatio(camera) > c.aspectMax
    camera.fovMode = wide ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED
    camera.fov = wide ? 2 * Math.atan(Math.tan(c.fov / 2) * c.aspectMax) : c.fov
  }
  fit(); scene.getEngine().onResizeObservable.add(fit)
  return camera
}

Effect.ShadersStore.dofFragmentShader = DOF_FS
Effect.ShadersStore.uberFragmentShader = UBER_FS

export class Post {
  private posts: PostProcess[] = []
  private readonly camera: ArcRotateCamera; private readonly engine: AbstractEngine; private readonly S: LookState; private readonly grain: () => BaseTexture
  private readonly ground: (x: number, z: number) => number
  // ground: the terrain's height, for the depth of field's focus
  constructor(camera: ArcRotateCamera, engine: AbstractEngine, S: LookState, grain: () => BaseTexture, ground: (x: number, z: number) => number) { this.camera = camera; this.engine = engine; this.S = S; this.grain = grain; this.ground = ground }
  get passes(): PostProcess[] { return this.posts }
  // no finishing passes: the scene draws straight to the canvas (the detail check's debug view)
  clear(): void { this.posts.forEach(p => p.dispose(this.camera)); this.posts = [] }
  build(): void {
    const { camera, engine, S } = this
    this.posts.forEach(p => p.dispose(camera)); this.posts = []
    const HF = Constants.TEXTURETYPE_HALF_FLOAT
    const pp = (name: string, uni: string[], smp: string[], type: number) => { const p = new PostProcess(name, name, uni, smp, 1.0, camera, Texture.BILINEAR_SAMPLINGMODE, engine, false, null, type); if (!this.posts.length) p.samples = 4; this.posts.push(p); return p }
    if (S.dof) {
      // the miniature field (decision 0020): focused on the ground under the camera's target (the target itself sits
      // at a fixed height, inside a hill or above a valley), at its depth along the view axis; a sharp band of
      // DOF.band around it; the largest blur DOF.px at 1080 lines, strongest at the closest zoom and DOF.wide of it
      // at the widest
      const p = pp('dof', ['uTexel', 'uTan', 'uFocus', 'uBand', 'uK', 'uMaxPx'], [], HF), c = D.spec.camera
      p.onApply = e => {
        const t = camera.target, g = new Vector3(t.x, this.ground(t.x, t.z), t.z), fwd = t.subtract(camera.position).normalize()
        const focus = Math.max(1, Vector3.Dot(g.subtract(camera.position), fwd))
        const aspect = p.width / p.height, tf = Math.tan(camera.fov / 2), vert = camera.fovMode === Camera.FOVMODE_VERTICAL_FIXED
        const z = Math.min(1, Math.max(0, (camera.radius - c.rMin) / (c.rMax - c.rMin))), px = DOF.px * S.dofAmt * p.height / 1080 * (1 + (DOF.wide - 1) * z)
        e.setFloat2('uTexel', 1 / p.width, 1 / p.height); e.setFloat2('uTan', vert ? tf * aspect : tf, vert ? tf : tf / aspect)
        e.setFloat('uFocus', focus); e.setFloat('uBand', DOF.band); e.setFloat('uK', DOF.k); e.setFloat('uMaxPx', px)
      }
    }
    const u = pp('uber', ['uRes', 'uGrade', 'uGrainOn', 'uBloom'], ['uGrain'], HF)
    u.onApply = e => { e.setFloat2('uRes', u.width, u.height); e.setFloat('uGrade', S.grade); e.setFloat('uGrainOn', S.grain); e.setFloat('uBloom', S.bloom); e.setTexture('uGrain', this.grain()) }
  }
}
