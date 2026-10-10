// The camera and the finishing passes (prototypes/painted-cinematic.html, docs/research/cheap-painterly-postfx.md):
// [depth of field H, V, presentation and video only per decision 0003] → one fused pass (grade, bloom, vignette,
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

// the top-down RTS view only (decision 0002); our own controller replaces Babylon's at prototype exit
export function buildCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  const c = D.spec.camera, PLAY = D.spec.play
  const camera = new ArcRotateCamera('cam', c.yaw0, 0.80, 125, new Vector3(-10, c.focusY, 2), scene)
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
  constructor(camera: ArcRotateCamera, engine: AbstractEngine, S: LookState, grain: () => BaseTexture) { this.camera = camera; this.engine = engine; this.S = S; this.grain = grain }
  get passes(): PostProcess[] { return this.posts }
  build(): void {
    const { camera, engine, S } = this
    this.posts.forEach(p => p.dispose(camera)); this.posts = []
    const HF = Constants.TEXTURETYPE_HALF_FLOAT
    const pp = (name: string, uni: string[], smp: string[], type: number) => { const p = new PostProcess(name, name, uni, smp, 1.0, camera, Texture.BILINEAR_SAMPLINGMODE, engine, false, null, type); if (!this.posts.length) p.samples = 4; this.posts.push(p); return p }
    if (S.dof) for (const dir of [[1, 0], [0, 1]]) {
      const p = pp('dof', ['uTexel', 'uDir', 'uFocus', 'uRange', 'uMaxPx'], [], HF)
      p.onApply = e => { const f = camera.radius / 1000; e.setFloat2('uTexel', 1 / p.width, 1 / p.height); e.setFloat2('uDir', dir[0], dir[1]); e.setFloat('uFocus', f); e.setFloat('uRange', f * 0.32 + 0.012); e.setFloat('uMaxPx', 9 * S.dofAmt * p.height / 1080) }
    }
    const u = pp('uber', ['uRes', 'uGrade', 'uGrainOn', 'uBloom'], ['uGrain'], HF)
    u.onApply = e => { e.setFloat2('uRes', u.width, u.height); e.setFloat('uGrade', S.grade); e.setFloat('uGrainOn', S.grain); e.setFloat('uBloom', S.bloom); e.setTexture('uGrain', this.grain()) }
  }
}
