// The camera and the finishing passes (prototypes/painted-cinematic.html, docs/research/cheap-painterly-postfx.md):
// [the depth of field, a player option per decision 0024: the scene at half resolution, its blur] → one fused pass (its composite, bloom, vignette, paper, dither; the grade is the materials': gradeOf, src/look/shaders/painter.glsl). Materials write view distance into alpha, so depth of field needs no second scene render.
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
// FSR 1's edge-adaptive upscale (EASU, AMD), as Babylon ships it: its source, our grain after it (easu, below)
import '@babylonjs/core/Shaders/fsr1Upscale.fragment.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { LookState } from './materials.ts'
import { D } from './spec.ts'
import DOFCOC from './shaders/dofcoc.glsl?raw'
import DOF_FS from './shaders/dof.frag?raw'
import DOFDOWN_FS from './shaders/dofdown.frag?raw'
import UBER_FS from './shaders/uber.frag?raw'
import { MOOD, SEASON } from './mood.ts'

// the view the page opens on (the bench measures it as its default zoom)
export const START = { beta: 0.80, radius: 125, x: -10, z: 2 }
// the gameplay depth of field (decision 0024), a band at the top of the screen: past a sharp band beyond the focus
// (1 - focus/z below it is sharp, z the depth along the view axis; nothing nearer than the focus blurs), the gain past
// it, the largest blur in pixels at 1080 lines, and the share of it left at the widest zoom (window.__look.dof tunes
// them live); FOCUS_S the focus's easing time (s)
export const DOF = { band: 0.2, k: 4, px: 7, wide: 0.4 }
// the near blur (docs/plans/done/dof-v2.md): its sharp band nearer than the focus (in 1 - focus/z), its gain, its
// largest blur in pixels at 1080 lines (eased by the zoom as the far one) and the share of the frame from the bottom it
// reaches (the formations in the middle never take it)
export const DOF_NEAR = { band: 0.04, k: 4, px: 8, screen: 0.3 }
// the blur's painted look (docs/plans/done/dof-v2.md): the far blur's colour toward the haze (lighter, greyer) by its
// size, the near layer darker and cooler by its coverage (uber.frag)
export const DOF_PAINT = { far: 0.5, near: 0.7 }
// the scene's MSAA samples (4; ?msaa=1 for the frame-rate A/Bs, src/look/main.ts)
// byte: the scene's MSAA target 8 bits a channel, not half floats (docs/plans/done/wide-perf.md: the same frame, 0.4 to
// 0.8 ms less at the widest zoom); not under the depth of field, whose distance in alpha needs the half floats; ?rt16
// for the A/B
export const MSAA = { samples: 4, byte: true }
// ?nanmark: a pixel that is not a number shows magenta instead of its neighbours' mean (docs/plans/done/nan-guard.md)
export const DEBUG = { nanmark: false }
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
  rtsControls(scene, camera, canvas)
  // pan in the ground plane (Babylon pans in the view plane by default, which lifts the target); the focus stays in the play area
  camera.mapPanning = true; scene.onBeforeRenderObservable.add(() => { const t = camera.target; t.x = Math.max(-PLAY, Math.min(PLAY, t.x)); t.z = Math.max(-PLAY, Math.min(PLAY, t.z)) })
  camera.upperRadiusLimit = c.rMax; camera.lowerBetaLimit = c.betaMin; camera.upperBetaLimit = c.betaMax
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

// where a key types (a text field) or picks (a list), not where it moves the camera; sliders and buttons keep the keys
// for the camera
export const typingIn = (t: EventTarget | null): boolean => t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['range', 'checkbox', 'button', 'radio'].includes(t.type))

// RTS controls: the arrows or WASD pan in the ground plane and Q and E turn, at a speed that grows with the zoom; a
// trackpad's two-finger swipe pans (the ground follows the fingers) and its pinch zooms; a mouse wheel zooms. They
// replace Babylon's keyboard (which turned the camera) and wheel (which only zoomed); dragging still turns and pans
const PAN_PER_S = 0.9, TURN_PER_S = 1.2, SWIPE = 0.0016, PINCH = 0.01, WHEEL = 0.0012
function rtsControls(scene: Scene, camera: ArcRotateCamera, canvas: HTMLCanvasElement): void {
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput'); camera.inputs.removeByType('ArcRotateCameraMouseWheelInput')
  // the ground's forward (away from the camera) and right, from the camera's yaw
  const pan = (right: number, fwd: number) => {
    const fx = -Math.cos(camera.alpha), fz = -Math.sin(camera.alpha)
    camera.target.x += fz * right + fx * fwd; camera.target.z += -fx * right + fz * fwd
  }
  const held = new Set<string>()
  const typing = (e: KeyboardEvent) => typingIn(e.target)
  addEventListener('keydown', e => { if (!typing(e) && !e.metaKey && !e.ctrlKey) { held.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault() } })
  // (macOS sends no keyup for a key let go while Cmd is down: Cmd's own release clears them all)
  addEventListener('keyup', e => { held.delete(e.code); if (e.key === 'Meta') held.clear() })
  addEventListener('blur', () => held.clear())
  const on = (...codes: string[]) => codes.some(c => held.has(c)) ? 1 : 0
  scene.onBeforeRenderObservable.add(() => {
    if (!held.size) return
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000), step = camera.radius * PAN_PER_S * dt
    pan((on('ArrowRight', 'KeyD') - on('ArrowLeft', 'KeyA')) * step, (on('ArrowUp', 'KeyW') - on('ArrowDown', 'KeyS')) * step)
    camera.alpha += (on('KeyE') - on('KeyQ')) * TURN_PER_S * dt
  })
  // a trackpad: Chrome reports its wheelDeltaY as 3 × deltaY; a mouse wheel: wheelDeltaY in steps of 120 (whatever the
  // page's zoom does to deltaY), or lines elsewhere. A trackpad's swipe moves the ground with the fingers (natural
  // scrolling: fingers up, deltaY > 0). Not measured on a real mouse yet: synthetic events carry no wheelDeltaY
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    const wy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
    const pad = wy !== undefined && Math.abs(Math.abs(wy) - 3 * Math.abs(e.deltaY)) < 1.5
    const mouse = e.deltaMode === 1 || (!pad && e.deltaX === 0 && (wy ? wy % 120 === 0 : Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY)))
    if (e.ctrlKey || mouse) {
      const lo = camera.lowerRadiusLimit ?? 1, hi = camera.upperRadiusLimit ?? 1e4
      // a pinch's steps are small (a few pixels); a wheel's notch, with or without Ctrl, a hundred (or a few lines)
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      camera.radius = Math.min(hi, Math.max(lo, camera.radius * Math.exp(dy * (e.ctrlKey && Math.abs(dy) < 50 ? PINCH : WHEEL))))
    } else { const k = camera.radius * SWIPE; pan(e.deltaX * k, -e.deltaY * k) }
  }, { passive: false })
}

// the lens (#include<dofcoc>) inlined as the materials inline theirs (a replacer function keeps `$` in the GLSL)
const withLens = (src: string) => src.replace('#include<dofcoc>', () => DOFCOC)
Effect.ShadersStore.dofdownFragmentShader = withLens(DOFDOWN_FS)
Effect.ShadersStore.dofFragmentShader = withLens(DOF_FS)
Effect.ShadersStore.uberFragmentShader = withLens(UBER_FS)
// the upscale (the render scale under 1, docs/plans/active/render-scale.md): FSR 1's EASU from the scene's pixels to
// the screen's, then the paper grain the finishing pass leaves to it (uber.frag, UPSCALED), at the screen's pixels:
// the paper is not stretched (the dither stays in the finishing pass: it must come before its 8-bit target). The shader is Babylon's, its main replaced
{
  const src = Effect.ShadersStore.fsr1UpscalePixelShader, at = src.lastIndexOf('void main()')
  if (at < 0) throw new Error('post: FSR 1 upscale shader without its main')
  Effect.ShadersStore.easuFragmentShader = src.slice(0, at) + `uniform sampler2D uGrain;uniform float uGrainOn;
void main(){vec3 c=FsrEasuF(ivec2(gl_FragCoord.xy),con0,con1,con2,con3);
  c*=1.0+(texture2D(uGrain,gl_FragCoord.xy/512.0).r-0.5)*0.06*uGrainOn;
  gl_FragColor=vec4(c,1.0);}`
}

export class Post {
  private posts: PostProcess[] = []
  // the scene's render scale under the screen (1: none), set by the page (main.ts: the zoom's Auto); under 1 the
  // chain draws at it and EASU upscales (?upscale=bilinear: the canvas drawn smaller and stretched, as before)
  scale = 1
  private readonly camera: ArcRotateCamera; private readonly engine: AbstractEngine; private readonly S: LookState; private readonly grain: () => BaseTexture
  private readonly ground: (x: number, z: number) => number
  // ground: the terrain's height, for the depth of field's focus
  constructor(camera: ArcRotateCamera, engine: AbstractEngine, S: LookState, grain: () => BaseTexture, ground: (x: number, z: number) => number) { this.camera = camera; this.engine = engine; this.S = S; this.grain = grain; this.ground = ground }
  get passes(): PostProcess[] { return this.posts }
  // no finishing passes: the scene draws straight to the canvas (the detail check's debug view)
  clear(): void { this.posts.forEach(p => p.dispose(this.camera)); this.posts = [] }
  get built(): boolean { return this.posts.length > 0 }
  // the lines of the target the scene draws into: the canvas's, or with the upscale the first pass's (Babylon floors a
  // pass's size as here)
  sceneLines(): number { const h = this.engine.getRenderHeight(); return this.built && this.scale < 1 ? (h * this.scale) | 0 : h }
  // the depth along the view axis of the ground the screen's centre shows: the centre ray marched against the
  // terrain (the target sits at a fixed height, inside a hill or above a valley, so neither it nor the ground under
  // it is what the centre shows), eased over FOCUS_S so a pan over a hillside does not jump the sharp band; a jump
  // of over a third (a new view) is taken at once
  private focus = 0
  // the marched depth, not eased (the near bake's zoom gate: src/look/main.ts)
  focusRaw = 0
  // each frame before the scene renders (src/look/main.ts): the materials encode their lens term against it. need:
  // whether anything reads it (the depth of field, the near bake); else not marched, and the next march is taken at
  // once (a depth of field turned on starts from the true focus)
  updateFocus(dt: number, need = true): number {
    if (!need) { this.focus = this.focusRaw = 0; return 1 }
    const c = this.camera, p = c.position, t = c.target
    let fx = t.x - p.x, fy = t.y - p.y, fz = t.z - p.z; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l
    const above = (d: number) => p.y + fy * d - this.ground(p.x + fx * d, p.z + fz * d)
    const N = 96, far = 3 * c.radius; let d0 = 0, d1 = far
    for (let i = 1; i <= N; i++) { const d = far * i / N; if (above(d) <= 0) { d1 = d; break } d0 = d }
    if (d1 < far) for (let i = 0; i < 12; i++) { const m = (d0 + d1) / 2; if (above(m) > 0) d0 = m; else d1 = m }
    const want = Math.max(1, d1 < far ? d1 : l); this.focusRaw = want
    this.focus = !this.focus || Math.abs(want - this.focus) > this.focus / 3 ? want : this.focus + (want - this.focus) * (1 - Math.exp(-Math.max(0, dt) / FOCUS_S))
    return this.focus
  }
  build(): void {
    const { camera, engine, S } = this
    this.posts.forEach(p => p.dispose(camera)); this.posts = []
    // the scene's target, the first pass's input: 8 bits with the depth of field too (the lens term in alpha, 8 bits:
    // painter.glsl depthA; docs/plans/done/dof-v2.md)
    const HF = Constants.TEXTURETYPE_HALF_FLOAT, sceneType = MSAA.byte ? Constants.TEXTURETYPE_UNSIGNED_BYTE : HF
    // ratio: the size of the texture this pass reads, so the pass before it draws at that size
    const pp = (name: string, uni: string[], smp: string[], type: number, ratio = 1.0, defines: string | null = null) => { const p = new PostProcess(name, name, uni, smp, ratio, camera, Texture.BILINEAR_SAMPLINGMODE, engine, false, defines, type); if (!this.posts.length) { p.samples = MSAA.samples } this.posts.push(p); return p }
    // the miniature field (decisions 0024, 0040): focused on the ground at the screen's centre (updateFocus); a sharp
    // band beyond it (DOF.band) and one nearer (DOF_NEAR.band, in the bottom DOF_NEAR.screen of the frame only); the
    // largest blurs DOF.px and DOF_NEAR.px at 1080 lines, strongest at the closest zoom and DOF.wide of it at the widest.
    // The scene at half resolution (each four pixels' colour averaged, one lens term: dofdown.frag), its blur at half
    // resolution, and the finishing pass puts the sharp scene (the first pass's input) back where the blur is under a
    // pixel and no near layer covers it
    const lens = ['uBand', 'uK', 'uMaxPx', 'uNBand', 'uNK', 'uNMaxPx', 'uNScreen'], c = D.spec.camera
    // the chain: the scene at half resolution (dofdown), the blur at half resolution (dof: far and near), the finishing
    // pass (uber). A pass draws into the next one's input, at the next one's ratio. (No tile passes: the near blur lies
    // in the bottom band of the frame only, so the band says where it can reach; two small tile passes cost about
    // 0.7 ms on the Mac, measured: docs/plans/done/dof-v2.md)
    const k = this.scale, up = k < 1
    const d = S.dof ? pp('dofdown', ['uTexel', 'uOut', ...lens], [], sceneType, k) : null
    const p = d ? pp('dof', ['uTexel', 'uHalf', 'uN', 'uNN', ...lens], [], sceneType, 0.5 * k) : null
    let px = 0, npx = 0
    const lensUniforms = (e: Effect) => { e.setFloat('uBand', DOF.band); e.setFloat('uK', DOF.k); e.setFloat('uMaxPx', px); e.setFloat('uNBand', DOF_NEAR.band); e.setFloat('uNK', DOF_NEAR.k); e.setFloat('uNMaxPx', npx); e.setFloat('uNScreen', DOF_NEAR.screen) }
    if (d && p) {   // (p is made only with d: the test narrows both)
      // the blurs by the zoom (strongest at the closest zoom, DOF.wide of it at the widest) and the frame's lines, each
      // frame before the first pass
      d.onApply = e => {
        const z = Math.min(1, Math.max(0, (camera.radius - c.rMin) / (c.rMax - c.rMin))), ease = S.dofAmt * d.height / 1080 * (1 + (DOF.wide - 1) * z)
        px = DOF.px * ease; npx = DOF_NEAR.px * ease
        e.setFloat2('uTexel', 1 / d.width, 1 / d.height); e.setFloat2('uOut', p.width, p.height); lensUniforms(e)
      }
      // the taps: 16 up to a 7 px blur (the default's largest at 1080 lines), then as many per unit of area as the
      // blur grows, in steps to 64 (past a 14 px blur, sparser; a step moves every tap, so there are few)
      p.onApply = e => {
        e.setFloat2('uTexel', 1 / d.width, 1 / d.height); e.setFloat2('uHalf', 1 / p.width, 1 / p.height)
        e.setFloat('uN', TAPS.find(n => n >= 0.32 * px * px) ?? 64)
        // the near taps: as many per unit of area of its largest blur, 8 to 24 (a near layer is soft: fewer taps do)
        e.setFloat('uNN', Math.min(24, Math.max(8, Math.ceil(0.25 * npx * npx)))); lensUniforms(e)
      }
    }
    const u = pp('uber', ['uRes', 'uRenderScale', 'uGrainOn', 'uBloom', 'uGrade', 'uVignette', 'uSplitHi', 'uGradeSat', 'uTopAmt', ...(p ? [...lens, 'uHalfUV', 'uHalfTexel', 'uDofPaint'] : [])], ['uGrain', ...(p ? ['uSharp'] : [])], sceneType, (p ? 0.5 : 1.0) * k, [p ? '#define DOF' : '', DEBUG.nanmark ? '#define NANMARK' : '', up ? '#define UPSCALED' : ''].filter(Boolean).join('\n') || null)
    // uRes: the full resolution (with the depth of field, this pass reads the half-resolution blur)
    u.onApply = e => {
      const r = d ?? u; e.setFloat2('uRes', r.width, r.height); e.setFloat('uGrainOn', S.grain); e.setFloat('uBloom', S.bloom); e.setTexture('uGrain', this.grain())
      e.setFloat('uRenderScale', S.res ? 1 : 1 / engine.getHardwareScalingLevel())   // Auto: the paper in screen pixels (the fixed scales as before)
      // the mood's vignette, and the grade's parts the bloom takes off and puts back (its grade is in the painted
      // materials: src/look/materials.ts)
      e.setColor3('uVignette', MOOD.grade.vignette); e.setColor3('uSplitHi', MOOD.grade.splitHi); e.setFloat('uGradeSat', SEASON.sat); e.setFloat('uTopAmt', MOOD.grade.topAmt); e.setFloat('uGrade', S.grade)   // (uGradeSat: the season's, as the materials')
      if (d && p) { lensUniforms(e); e.setFloat2('uHalfUV', d.width / 2 / p.width, d.height / 2 / p.height); e.setFloat2('uHalfTexel', 1 / p.width, 1 / p.height); e.setFloat2('uDofPaint', DOF_PAINT.far, DOF_PAINT.near); e.setTextureFromPostProcess('uSharp', d) }
    }
    // the upscale: the finishing pass draws into its input at the scene's scale, it draws the screen
    if (up) {
      const x = pp('easu', ['con0', 'con1', 'con2', 'con3', 'uGrainOn'], ['uGrain'], Constants.TEXTURETYPE_UNSIGNED_BYTE, k)
      x.onApply = e => {
        const iw = x.width, ih = x.height, ow = engine.getRenderWidth(), oh = engine.getRenderHeight()
        // (FsrEasuCon: the input's viewport is the whole of its texture)
        e.setFloat4('con0', iw / ow, ih / oh, 0.5 * iw / ow - 0.5, 0.5 * ih / oh - 0.5)
        e.setFloat4('con1', 1 / iw, 1 / ih, 1 / iw, -1 / ih); e.setFloat4('con2', -1 / iw, 2 / ih, 1 / iw, 2 / ih); e.setFloat4('con3', 0, 4 / ih, 0, 0)
        e.setFloat('uGrainOn', S.grain); e.setTexture('uGrain', this.grain())
      }
    }
  }
}
