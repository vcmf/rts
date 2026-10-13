// The camera and the finishing passes (prototypes/painted-cinematic.html, docs/research/cheap-painterly-postfx.md):
// [the depth of field, a player option per decision 0024: the scene at half resolution, its blur] → one fused pass (its composite, grade, bloom, vignette, paper, dither). Materials write view distance into alpha, so depth of field needs no second scene render.
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
import DOFCOC from './shaders/dofcoc.glsl?raw'
import DOF_FS from './shaders/dof.frag?raw'
import DOFDOWN_FS from './shaders/dofdown.frag?raw'
import UBER_FS from './shaders/uber.frag?raw'

// the view the page opens on (the bench measures it as its default zoom)
export const START = { beta: 0.80, radius: 125, x: -10, z: 2 }
// the gameplay depth of field (decision 0024), a band at the top of the screen: past a sharp band beyond the focus
// (1 - focus/z below it is sharp, z the depth along the view axis; nothing nearer than the focus blurs), the gain past
// it, the largest blur in pixels at 1080 lines, and the share of it left at the widest zoom (window.__look.dof tunes
// them live); FOCUS_S the focus's easing time (s)
export const DOF = { band: 0.2, k: 4, px: 7, wide: 0.4 }
const FOCUS_S = 0.25
const TAPS = [16, 24, 32, 48, 64]

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

// the lens (#include<dofcoc>) inlined as the materials inline theirs (a replacer function keeps `$` in the GLSL)
const withLens = (src: string) => src.replace('#include<dofcoc>', () => DOFCOC)
Effect.ShadersStore.dofdownFragmentShader = DOFDOWN_FS
Effect.ShadersStore.dofFragmentShader = withLens(DOF_FS)
Effect.ShadersStore.uberFragmentShader = withLens(UBER_FS)

export class Post {
  private posts: PostProcess[] = []
  private readonly camera: ArcRotateCamera; private readonly engine: AbstractEngine; private readonly S: LookState; private readonly grain: () => BaseTexture
  private readonly ground: (x: number, z: number) => number
  // ground: the terrain's height, for the depth of field's focus
  constructor(camera: ArcRotateCamera, engine: AbstractEngine, S: LookState, grain: () => BaseTexture, ground: (x: number, z: number) => number) { this.camera = camera; this.engine = engine; this.S = S; this.grain = grain; this.ground = ground }
  get passes(): PostProcess[] { return this.posts }
  // no finishing passes: the scene draws straight to the canvas (the detail check's debug view)
  clear(): void { this.posts.forEach(p => p.dispose(this.camera)); this.posts = [] }
  // the depth along the view axis of the ground the screen's centre shows: the centre ray marched against the
  // terrain (the target sits at a fixed height, inside a hill or above a valley, so neither it nor the ground under
  // it is what the centre shows), eased over FOCUS_S so a pan over a hillside does not jump the sharp band; a jump
  // of over a third (a new view) is taken at once
  private focus = 0
  private focusDepth(dt: number): number {
    const c = this.camera, p = c.position, t = c.target
    let fx = t.x - p.x, fy = t.y - p.y, fz = t.z - p.z; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l
    const above = (d: number) => p.y + fy * d - this.ground(p.x + fx * d, p.z + fz * d)
    const N = 96, far = 3 * c.radius; let d0 = 0, d1 = far
    for (let i = 1; i <= N; i++) { const d = far * i / N; if (above(d) <= 0) { d1 = d; break } d0 = d }
    if (d1 < far) for (let i = 0; i < 12; i++) { const m = (d0 + d1) / 2; if (above(m) > 0) d0 = m; else d1 = m }
    const want = Math.max(1, d1 < far ? d1 : l)
    this.focus = !this.focus || Math.abs(want - this.focus) > this.focus / 3 ? want : this.focus + (want - this.focus) * (1 - Math.exp(-Math.max(0, dt) / FOCUS_S))
    return this.focus
  }
  build(): void {
    const { camera, engine, S } = this
    this.posts.forEach(p => p.dispose(camera)); this.posts = []
    const HF = Constants.TEXTURETYPE_HALF_FLOAT
    // ratio: the size of the texture this pass reads, so the pass before it draws at that size
    const pp = (name: string, uni: string[], smp: string[], type: number, ratio = 1.0, defines: string | null = null) => { const p = new PostProcess(name, name, uni, smp, ratio, camera, Texture.BILINEAR_SAMPLINGMODE, engine, false, defines, type); if (!this.posts.length) p.samples = 4; this.posts.push(p); return p }
    // the miniature field (decision 0024): focused on the ground at the screen's centre (focusDepth); a sharp band
    // beyond it (DOF.band; nothing nearer blurs); the largest blur DOF.px at 1080 lines, strongest at the closest
    // zoom and DOF.wide of it at the widest. The scene at half resolution (each four pixels' colour averaged, the
    // farthest of their distances), its blur at half resolution, and the finishing pass puts the sharp
    // scene (the first pass's input) back where the blur is under a pixel
    const lens = ['uTan', 'uFocus', 'uBand', 'uK', 'uMaxPx'], c = D.spec.camera
    const d = S.dof ? pp('dofdown', ['uTexel', 'uOut'], [], HF) : null
    const p = d ? pp('dof', ['uTexel', 'uHalf', 'uN', ...lens], [], HF, 0.5) : null
    let focus = 0, px = 0, tan = [0, 0]
    const lensUniforms = (e: Effect) => { e.setFloat2('uTan', tan[0], tan[1]); e.setFloat('uFocus', focus); e.setFloat('uBand', DOF.band); e.setFloat('uK', DOF.k); e.setFloat('uMaxPx', px) }
    if (d && p) {
      d.onApply = e => { e.setFloat2('uTexel', 1 / d.width, 1 / d.height); e.setFloat2('uOut', p.width, p.height) }
      // the taps: 16 up to a 7 px blur (the default's largest at 1080 lines), then as many per unit of area as the
      // blur grows, in steps to 64 (past a 14 px blur, sparser; a step moves every tap, so there are few)
      p.onApply = e => {
        focus = this.focusDepth(engine.getDeltaTime() / 1000)
        const aspect = d.width / d.height, tf = Math.tan(camera.fov / 2), vert = camera.fovMode === Camera.FOVMODE_VERTICAL_FIXED
        const z = Math.min(1, Math.max(0, (camera.radius - c.rMin) / (c.rMax - c.rMin)))
        px = DOF.px * S.dofAmt * d.height / 1080 * (1 + (DOF.wide - 1) * z); tan = vert ? [tf * aspect, tf] : [tf, tf / aspect]
        e.setFloat2('uTexel', 1 / d.width, 1 / d.height); e.setFloat2('uHalf', 1 / p.width, 1 / p.height)
        e.setFloat('uN', TAPS.find(n => n >= 0.32 * px * px) ?? 64); lensUniforms(e)
      }
    }
    const u = pp('uber', ['uRes', 'uGrade', 'uGrainOn', 'uBloom', ...(p ? [...lens, 'uHalfUV'] : [])], ['uGrain', ...(p ? ['uSharp'] : [])], HF, p ? 0.5 : 1.0, p ? '#define DOF' : null)
    // uRes: the full resolution (with the depth of field, this pass reads the half-resolution blur)
    u.onApply = e => {
      const r = d ?? u; e.setFloat2('uRes', r.width, r.height); e.setFloat('uGrade', S.grade); e.setFloat('uGrainOn', S.grain); e.setFloat('uBloom', S.bloom); e.setTexture('uGrain', this.grain())
      if (d && p) { lensUniforms(e); e.setFloat2('uHalfUV', d.width / 2 / p.width, d.height / 2 / p.height); e.setTextureFromPostProcess('uSharp', d) }
    }
  }
}
