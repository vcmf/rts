// The musket smoke on the look page (docs/plans/active/smoke-bank.md, decision 0080): soft translucent cards, one
// thin-instanced quad a puff (src/look/shaders/smoke.vert, smoke.frag), facing the camera, born at the muzzles as
// plumes and grown into one bank along the front that rolls ahead, rises and thins into holes; blended over the scene
// after everything opaque, no depth written, the lens term of what lies behind kept; its opacity capped where it lies
// over a formation (the formations' mask). The puffs are written when the scripted battalions' ranks go off
// (src/look/world/smoke.ts); between shots the CPU does nothing a puff. The look's variants and knobs are the page's
// switches (smokeLook)
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import type { ThinEngine } from '@babylonjs/core/Engines/thinEngine.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { PuffDef } from '../sim/ruleset.ts'
import { groundAt } from './heightfield.ts'
import type { Materials } from './materials.ts'
import SMOKE_VS from './shaders/smoke.vert?raw'
import SMOKE_FS from './shaders/smoke.frag?raw'
import { FLAG_WIND } from './units.ts'
import type { Battalion, Drill } from './world/armies.ts'
import {
  PUFF_FLOATS,
  PUFF_THIN,
  drawClearance,
  keepShare,
  muzzles,
  ringSize,
  shotsBetween,
  volleyPuffs,
  type FireTiming,
  type Shot,
  type SmokeLook,
} from './world/smoke.ts'

const GL_ZERO = 0
const GL_ONE = 1
const GL_SRC_ALPHA = 0x0302
const GL_ONE_MINUS_SRC_ALPHA = 0x0303
const KEEP_BAND = 0.08 // the zoom's thinning: the band of ranks a puff shrinks out over (keepScale)
const MASK_N = 512 // the formations' mask's texels a side
// m: the mask's fall-off round a formation's box (already padded by the men's reach: Units.boxes)
const MASK_MARGIN = 1.5
const MAN_MID = 0.9 // m: the height the cap follows a view ray down to (a man's middle)
const MASK_EVERY = 1 / 12 // s: the mask redrawn at most this often while formations move
const REBUILD = 1 // s: a clock jump past this rebuilds the ring from the last life's shots

/** what the smoke needs of the armies: the battalions (only those in line fire), their drill, the script's fire
 *  timing (its start, the shot's moment, the loop, the ranks, the hold), each battalion's ground box (Units.boxes) and
 *  a count that changes when any moves (Units.placeCount) */
export interface SmokeArmies {
  battalions: readonly Battalion[]
  drill: Drill
  fire: FireTiming
  boxes(out: Float32Array): number
  readonly placeCount: number
}

/** The musket smoke: the puffs' ring, their mesh and material, the formations' mask */
export class Smoke {
  private readonly scene: Scene
  private readonly camera: ArcRotateCamera
  private readonly armies: SmokeArmies
  private readonly def: PuffDef
  private readonly look: SmokeLook
  private readonly clock: () => number
  private readonly lines: number[] // the battalions that fire: their index in armies.battalions
  private readonly xs: number[] // the muzzles across a battalion's front (m, its frame)
  private readonly cap: number
  private readonly buf: Float32Array // the ring: 16 floats an instance (the 'matrix' buffer's first two columns used)
  private next = 0 // the ring's next slot
  private dirtyLo = Infinity // the ring's slots written since the last upload
  private dirtyHi = -1
  private readonly mesh: Mesh
  private readonly mat: ShaderMaterial
  private readonly mask = new Uint8Array(MASK_N * MASK_N)
  private readonly maskTex: RawTexture
  private readonly maskOrigin: [number, number]
  private readonly maskTexel: number
  private readonly boxBuf: Float32Array
  private maskCount = -1 // the armies' placeCount the mask was drawn at
  private maskT = -Infinity
  private last = NaN // the clock at the last frame's spawn
  private readonly shots: Shot[] = []
  private readonly puffs: number[] = []
  private readonly keepV = new Vector2(1, KEEP_BAND)
  private on = true
  /** puffs written so far (the bench's and the checks') */
  written = 0

  /** play: the half-side of the ground the formations stand on (m: the mask covers it, and a margin) */
  constructor(
    scene: Scene,
    camera: ArcRotateCamera,
    mats: Materials,
    armies: SmokeArmies,
    def: PuffDef,
    look: SmokeLook,
    clock: () => number,
    play: number,
  ) {
    this.scene = scene
    this.camera = camera
    this.armies = armies
    this.def = def
    this.look = look
    this.clock = clock
    this.lines = armies.battalions.flatMap((b, i) => (b.reserve ? [] : [i]))
    this.xs = muzzles(armies.drill, def.files)
    this.cap = ringSize(this.lines.length, this.xs.length, armies.fire, def)
    this.buf = new Float32Array(this.cap * 16)
    const half = play + 2 * MASK_MARGIN
    this.maskOrigin = [-half, -half]
    this.maskTexel = (2 * half) / MASK_N
    this.boxBuf = new Float32Array(armies.battalions.length * 4)
    this.maskTex = new RawTexture(
      this.mask,
      MASK_N,
      MASK_N,
      Constants.TEXTUREFORMAT_R,
      scene,
      false,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    )
    this.maskTex.name = 'smokeCover'
    this.maskTex.wrapU = this.maskTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    this.mesh = this.cardMesh()
    this.mat = this.cardMaterial(mats)
    this.mesh.material = this.mat
    scene.onBeforeRenderObservable.add(() => this.frame())
  }

  /** the smoke drawn or not (the bench's arms): off, nothing is written or drawn */
  setOn(on: boolean): void {
    this.on = on
    this.mesh.setEnabled(on)
    this.last = NaN
  }

  /** the ring's size in puffs: memory, for the bench */
  get capacity(): number {
    return this.cap
  }

  // a mesh of one quad (corners ±1, both faces drawn), its thin instances the ring (every slot: the dead ones are put
  // outside the view)
  private cardMesh(): Mesh {
    const m = new Mesh('smoke', this.scene)
    m.setVerticesData('position', new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), false, 3)
    m.setIndices([0, 1, 2, 0, 2, 3])
    m.thinInstanceSetBuffer('matrix', this.buf, 16, false)
    m.isPickable = false
    m.alwaysSelectAsActiveMesh = true // (its bounds would follow the ring; the puffs sit on the battlefield)
    m.doNotSyncBoundingInfo = true
    return m
  }

  /** the cards' material: blended over the scene after everything opaque (the colour by its opacity; the alpha, the
   *  depth of field's lens term, kept: the smoke blurs as what lies behind it, a few metres away at most, as the
   *  soldiers' simple shadows do), no depth written; the formations' mask read where the opacity is capped */
  private cardMaterial(mats: Materials): ShaderMaterial {
    const d = this.def
    const clear = this.look.cap < 1
    const m = mats.make('smoke', SMOKE_VS, SMOKE_FS, {
      attributes: ['position'],
      uniforms: UNIFORMS,
      samplers: clear ? ['uClearTex'] : [],
      alpha: true,
      defines: clear ? ['#define CLEAR'] : [],
    })
    m.setVector4('uJet', new Vector4(d.jet[0], d.jet[1], d.rise[0], d.rise[1]))
    m.setVector4('uGrow', new Vector4(d.radius[0], d.radius[1], d.grow, d.erode))
    m.setVector3('uPlume', new Vector3(d.plume[0], d.plume[1], d.bank))
    m.setFloat('uRoll', d.roll)
    m.setFloat('uThin', PUFF_THIN)
    m.setFloat('uHeight', d.height)
    m.setFloat('uOpacity', d.opacity)
    m.setFloat('uCap', this.look.cap)
    m.setVector2('uKeep', this.keepV)
    m.setFloat('uSmokeT', 0)
    if (clear) {
      m.setVector4(
        'uClear',
        new Vector4(this.maskOrigin[0], this.maskOrigin[1], 1 / (MASK_N * this.maskTexel), MAN_MID),
      )
      m.setTexture('uClearTex', this.maskTex)
    }
    m.setVector3('uWind', new Vector3(Math.cos(FLAG_WIND) * d.drift, 0, Math.sin(FLAG_WIND) * d.drift))
    m.setColor3('uSmokeCol', Color3.FromHexString(d.colour))
    m.setColor3('uFlashCol', Color3.FromHexString(d.flash[0]))
    m.setFloat('uFlashT', d.flash[1])
    m.disableDepthWrite = true
    m.backFaceCulling = false
    const engine = this.scene.getEngine() as ThinEngine
    m.alphaMode = Constants.ALPHA_EXCLUSION // (a mode nothing else draws with: its blend is replaced at each bind)
    m.onBindObservable.add(() =>
      engine.alphaState.setAlphaBlendFunctionParameters(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ZERO, GL_ONE, 0),
    )
    return m
  }

  private frame(): void {
    if (!this.on) return
    const T = this.clock()
    this.spawn(T)
    this.drawMask(T)
    const st = this.look.step > 0 ? Math.floor(T * this.look.step) / this.look.step : T
    this.keepV.x = keepShare(this.camera.radius)
    this.mat.setFloat('uSmokeT', st)
    this.upload()
  }

  /** the shots since the last frame written as puffs: a clock that ran back or jumped (a load, the bench) rebuilds the
   *  ring from the shots of the longest life before it, so the smoke at a clock is the same however it was reached */
  private spawn(T: number): void {
    const j = this.def.jitter
    let t0 = this.last + j
    if (!(T >= this.last && T - this.last <= REBUILD)) {
      this.buf.fill(0)
      this.next = 0
      this.dirtyLo = 0
      this.dirtyHi = this.cap
      t0 = T - this.def.life[1] - j
    }
    this.last = T
    const bs = this.armies.battalions
    const out = this.puffs
    out.length = 0
    for (const i of this.lines) {
      for (const s of shotsBetween(t0, T + j, bs[i].offset, this.armies.fire, this.shots)) {
        volleyPuffs(bs[i], i, s, this.xs, this.def, groundAt, out)
      }
    }
    for (let k = 0; k < out.length; k += PUFF_FLOATS) this.write(out, k)
  }

  // a puff into the ring's next slot (overwriting the oldest when full: new fire always shows)
  private write(p: number[], k: number): void {
    const o = this.next * 16
    for (let i = 0; i < PUFF_FLOATS; i++) this.buf[o + i] = p[k + i]
    this.dirtyLo = Math.min(this.dirtyLo, this.next)
    this.dirtyHi = Math.max(this.dirtyHi, this.next + 1)
    this.next = (this.next + 1) % this.cap
    this.written++
  }

  private upload(): void {
    if (this.dirtyHi < 0) return
    const n = this.dirtyHi - this.dirtyLo
    this.mesh.thinInstancePartialBufferUpdate('matrix', n, this.dirtyLo)
    this.dirtyLo = Infinity
    this.dirtyHi = -1
  }

  // the formations' mask drawn again when a formation moved, at most every MASK_EVERY s
  private drawMask(T: number): void {
    if (this.look.cap >= 1) return
    const count = this.armies.placeCount
    if (count === this.maskCount || (Math.abs(T - this.maskT) < MASK_EVERY && this.maskCount >= 0)) return
    this.maskCount = count
    this.maskT = T
    const n = this.armies.boxes(this.boxBuf)
    drawClearance(this.boxBuf, n, this.mask, MASK_N, this.maskOrigin, this.maskTexel, MASK_MARGIN)
    this.maskTex.update(this.mask)
  }
}

const UNIFORMS = [
  'uJet',
  'uGrow',
  'uPlume',
  'uRoll',
  'uThin',
  'uHeight',
  'uOpacity',
  'uCap',
  'uKeep',
  'uSmokeT',
  'uClear',
  'uWind',
  'uSmokeCol',
  'uFlashCol',
  'uFlashT',
]
