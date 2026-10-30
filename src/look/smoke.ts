// The musket smoke on the look page (docs/plans/active/smoke-bank.md, decision 0083): soft translucent cards, one
// thin-instanced quad a puff (src/look/shaders/smoke.vert, smoke.frag), across the front, born at the muzzles as
// plumes and grown into one bank along the front that rolls ahead, rises and thins into holes; blended over the scene
// after everything opaque, no depth written, the lens term of what lies behind kept; its opacity capped where it lies
// over a formation (the formations' mask). The puffs are written when the scripted battalions' ranks go off
// (src/look/world/smoke.ts); between shots the CPU does nothing a puff. The look's variants and knobs are the page's
// switches (smokeLook). A second source, the guns' (docs/plans/active/artillery-smoke.md): a string of bigger puffs
// along each piece's jet when its fire clip's shot comes; the same cards, its own ring, mesh and material (the era's
// values are uniforms: one more draw), the one formations' mask shared
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
  FOOT_FLOATS,
  PUFF_FLOATS,
  depthOrder,
  PUFF_THIN,
  drawClearance,
  validateSmoke,
  keepShare,
  muzzles,
  pieceRingSize,
  pieceShotsBetween,
  piecePuffs,
  ringSize,
  shotsBetween,
  volleyPuffs,
  type FireTiming,
  type PieceShot,
  type ServeTiming,
  type Shot,
  type SmokeLook,
} from './world/smoke.ts'

const GL_ZERO = 0
const GL_ONE = 1
const GL_SRC_ALPHA = 0x0302
const GL_ONE_MINUS_SRC_ALPHA = 0x0303
const KEEP_BAND = 0.08 // the zoom's thinning: the band of ranks a puff shrinks out over (keepScale)
const MASK_N = 512 // the formations' mask's texels a side
// m: the mask's fall-off round a formation's footprint (its men's roots: Units.footprints): about one texel (0.93 m),
// so the cap's edge is the bilinear read's soft step across the outer men's half width and a little past it, not a
// wider band before the line (a wider one thinned the jets at the muzzles)
const MASK_MARGIN = 1.0
// (after the soldiers' simple shadows, alphaIndex 1000, src/look/units.ts: the smoke lies over them)
const SMOKE_ALPHA_INDEX = 2000
const MASK_EVERY = 1 / 12 // s: the mask redrawn at most this often while formations move
const REBUILD = 1 // s: a clock jump past this rebuilds the ring from the last life's shots

/** what the musket smoke needs of the armies: the battalions (only those in line fire), their drill, the script's fire
 *  timing (its start, the shot's moment, the loop, the ranks, the hold) */
export interface SmokeArmies {
  battalions: readonly Battalion[]
  drill: Drill
  fire: FireTiming
}
/** what the guns' smoke needs of a unit of pieces: its units (a side's battery each), each piece's place in its
 *  unit's frame (m), and the fire's timing: the script's cycle and hold, the loop and its shot, and each unit's
 *  pieces' work starts (ServeTiming's starts, a unit each) */
export interface SmokePieces {
  units: readonly Battalion[]
  places: readonly (readonly [number, number])[]
  fire: Omit<ServeTiming, 'starts'>
  starts: readonly (readonly number[])[]
}
/** what the formations' mask reads: every arm's footprints (Units.footprints) and a count that changes when any of
 *  them moves (Units.placeCount) */
export interface SmokeFeet {
  readonly count: number
  footprints(out: Float32Array): number
}

/** A source of puffs (a Smoke's): its ring's size, the most a puff is born past its shot's clock (s), whether its
 *  cards are big, and the puffs of
 *  the shots with clocks in (t0, t1], pushed onto out (PUFF_FLOATS each) */
export interface PuffSource {
  readonly capacity: number
  readonly slack: number
  /** its cards big (the guns'): lifted clear of the ground along their way (cardLift, pathGround), far out painted
   *  as a few soft masses (smoke.frag: their grain in each card's own frame, thinning by fading, not holes), and
   *  given a body (smoke.frag: a dense core lit as a volume; drawn back to front, depthOrder); the muskets' small
   *  cards as approved, none of these */
  readonly big: boolean
  spawn(t0: number, t1: number, out: number[]): void
}

/** the musket smoke's source: the line battalions' volleys (shotsBetween, volleyPuffs) */
export function volleySource(armies: SmokeArmies, def: PuffDef): PuffSource {
  validateSmoke(def, armies.fire)
  const bs = armies.battalions
  const lines = bs.flatMap((b, i) => (b.reserve ? [] : [i]))
  const xs = muzzles(armies.drill, def.files)
  const shots: Shot[] = []
  return {
    capacity: ringSize(lines.length, xs.length, armies.fire, def),
    slack: def.jitter + def.stagger / 2,
    big: false,
    spawn(t0, t1, out) {
      for (const i of lines) {
        for (const s of shotsBetween(t0, t1, bs[i].offset, armies.fire, shots)) {
          volleyPuffs(bs[i], i, s, xs, def, groundAt, out)
        }
      }
    },
  }
}
/** the guns' smoke's source: each unit's pieces' shots (pieceShotsBetween, piecePuffs) */
export function pieceSource(p: SmokePieces, def: PuffDef): PuffSource {
  validateSmoke(def, p.fire)
  const shots: PieceShot[] = []
  const timings = p.units.map((_, u) => ({ ...p.fire, starts: p.starts[u] }))
  return {
    capacity: pieceRingSize(p.units.length * p.places.length, timings[0] ?? { ...p.fire, starts: [] }, def),
    slack: def.jitter,
    big: true,
    spawn(t0, t1, out) {
      p.units.forEach((b, u) => {
        for (const s of pieceShotsBetween(t0, t1, b.offset, timings[u], shots)) {
          piecePuffs(b, u, s, p.places[s.piece], def, groundAt, out)
        }
      })
    },
  }
}

/** The formations' mask (the smoke's opacity cap over the men: drawClearance), one for every smoke source: drawn
 *  again when a formation moved, at most every MASK_EVERY s, before the smokes' frame */
export class SmokeMask {
  readonly tex: RawTexture
  readonly origin: [number, number]
  readonly texel: number
  private readonly mask = new Uint8Array(MASK_N * MASK_N)
  private readonly feet: SmokeFeet
  private readonly cap: number
  private readonly boxBuf: Float32Array
  private count = -1 // the feet's count the mask was drawn at
  private t = -Infinity
  on = true

  /** play: the half-side of the ground the formations stand on (m: the mask covers it, and a margin); units: how many
   *  footprints at most; cap: the look's (1: no mask drawn) */
  constructor(scene: Scene, feet: SmokeFeet, units: number, play: number, cap: number, clock: () => number) {
    this.feet = feet
    this.cap = cap
    const half = play + 2 * MASK_MARGIN
    this.origin = [-half, -half]
    this.texel = (2 * half) / MASK_N
    this.boxBuf = new Float32Array(units * FOOT_FLOATS)
    this.tex = new RawTexture(
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
    this.tex.name = 'smokeCover'
    this.tex.wrapU = this.tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    // (made before the smokes: their frames read it drawn)
    scene.onBeforeRenderObservable.add(() => this.draw(clock()))
  }

  /** the mask's uniform (uClear): its origin, 1 / its side in m, and a man's body height (m) */
  uniform(body: number): Vector4 {
    return new Vector4(this.origin[0], this.origin[1], 1 / (MASK_N * this.texel), body)
  }

  private draw(T: number): void {
    if (!this.on || this.cap >= 1) return
    const count = this.feet.count
    if (count === this.count || (Math.abs(T - this.t) < MASK_EVERY && this.count >= 0)) return
    this.count = count
    this.t = T
    const n = this.feet.footprints(this.boxBuf)
    drawClearance(this.boxBuf, n, this.mask, MASK_N, this.origin, this.texel, MASK_MARGIN)
    this.tex.update(this.mask)
  }
}

/** A smoke: one source's puffs, their ring, their mesh and material; the formations' mask read from the shared one */
export class Smoke {
  private readonly scene: Scene
  private readonly camera: ArcRotateCamera
  private readonly source: PuffSource
  private readonly def: PuffDef
  private readonly look: SmokeLook
  private readonly clock: () => number
  private readonly mask: SmokeMask
  private readonly cap: number
  private readonly ring: Float32Array // the ring: 16 floats an instance (14 of the 'matrix' buffer's used)
  // the instances drawn: the ring itself, or for big cards its live puffs back to front (depthOrder)
  private readonly buf: Float32Array
  private readonly order: Uint32Array
  private readonly keys: Float32Array
  private readonly drawn: Uint32Array // the order last uploaded, and how many
  private drawnN = -1
  private readonly eye: [number, number, number] = [0, 0, 0]
  private readonly wind: [number, number, number]
  private next = 0 // the ring's next slot
  private dirtyLo = Infinity // the ring's slots written since the last upload
  private dirtyHi = -1
  private readonly mesh: Mesh
  private readonly mat: ShaderMaterial
  private last = NaN // the clock at the last frame's spawn
  private readonly puffs: number[] = []
  private readonly keepV = new Vector2(1, KEEP_BAND)
  private on = true
  /** puffs written so far (the bench's and the checks') */
  written = 0

  /** name: the mesh's (smoke, the muskets'; an arm's smoke-<arm>) */
  constructor(
    scene: Scene,
    camera: ArcRotateCamera,
    mats: Materials,
    source: PuffSource,
    def: PuffDef,
    look: SmokeLook,
    clock: () => number,
    mask: SmokeMask,
    name = 'smoke',
  ) {
    this.scene = scene
    this.camera = camera
    this.source = source
    this.def = def
    this.look = look
    this.clock = clock
    this.mask = mask
    this.cap = source.capacity
    this.ring = new Float32Array(this.cap * 16)
    // (a source of small cards draws its ring as it is; a big one sorts it into its own buffer)
    this.buf = source.big ? new Float32Array(this.cap * 16) : this.ring
    this.order = new Uint32Array(source.big ? this.cap : 0)
    this.keys = new Float32Array(source.big ? this.cap : 0)
    this.drawn = new Uint32Array(source.big ? this.cap : 0)
    this.wind = [Math.cos(FLAG_WIND) * def.drift, 0, Math.sin(FLAG_WIND) * def.drift]
    this.mesh = this.cardMesh(name)
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
  private cardMesh(name: string): Mesh {
    const m = new Mesh(name, this.scene)
    m.setVerticesData('position', new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), false, 3)
    m.setIndices([0, 1, 2, 0, 2, 3])
    m.thinInstanceSetBuffer('matrix', this.buf, 16, false)
    m.isPickable = false
    m.alwaysSelectAsActiveMesh = true // (its bounds would follow the ring; the puffs sit on the battlefield)
    m.doNotSyncBoundingInfo = true
    m.alphaIndex = SMOKE_ALPHA_INDEX
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
    m.setFloat('uBig', this.source.big ? 1 : 0)
    m.setFloat('uOpacity', d.opacity)
    m.setFloat('uCap', this.look.cap)
    m.setVector2('uKeep', this.keepV)
    m.setFloat('uSmokeT', 0)
    if (clear) {
      m.setVector4('uClear', this.mask.uniform(d.body))
      m.setTexture('uClearTex', this.mask.tex)
    }
    m.setVector3('uWind', new Vector3(...this.wind))
    m.setColor3('uSmokeCol', Color3.FromHexString(d.colour))
    m.setColor3('uFlashCol', Color3.FromHexString(d.flash[0]))
    m.setFloat('uFlashT', d.flash[1])
    m.disableDepthWrite = true
    m.backFaceCulling = false
    const engine = this.scene.getEngine() as ThinEngine
    // (a mode no stock material draws with, as the soldiers' simple shadows' (src/look/units.ts): each sets its own
    // blend at its bind, so the mode only marks the material as blended)
    m.alphaMode = Constants.ALPHA_EXCLUSION
    m.onBindObservable.add(() =>
      engine.alphaState.setAlphaBlendFunctionParameters(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ZERO, GL_ONE, 0),
    )
    return m
  }

  private frame(): void {
    if (!this.on) return
    const T = this.clock()
    this.spawn(T)
    const st = this.look.step > 0 ? Math.floor(T * this.look.step) / this.look.step : T
    this.keepV.x = keepShare(this.camera.radius)
    this.mat.setFloat('uSmokeT', st)
    if (this.source.big) this.sort(st)
    else this.upload()
  }

  /** the big cards drawn back to front: the ring's live puffs at the shader's clock ordered from the eye
   *  (depthOrder) into the drawn buffer, only they drawn; uploaded when the list changes */
  private sort(T: number): void {
    const p = this.camera.position
    this.eye[0] = p.x
    this.eye[1] = p.y
    this.eye[2] = p.z
    const n = depthOrder(this.ring, this.cap, 16, T, this.def, this.wind, this.eye, this.order, this.keys)
    // (uploaded only when the drawn list changed: a puff born or gone, two swapped, the ring rebuilt. An upload every
    // frame cost about 3.5 ms of the GPU's frame on Metal, the buffer's update waiting on the frame before)
    let same = n === this.drawnN && this.dirtyHi < 0
    for (let i = 0; same && i < n; i++) same = this.order[i] === this.drawn[i]
    if (same) return
    this.drawn.set(this.order.subarray(0, n))
    this.drawnN = n
    for (let i = 0; i < n; i++) this.buf.set(this.ring.subarray(this.order[i] * 16, this.order[i] * 16 + 16), i * 16)
    this.dirtyLo = Infinity
    this.dirtyHi = -1
    // (none live: one dead slot drawn, a mesh of no thin instances drawing as a plain mesh)
    if (n === 0) this.buf.fill(0, 0, 16)
    this.mesh.thinInstanceCount = Math.max(1, n)
    this.mesh.thinInstancePartialBufferUpdate('matrix', Math.max(1, n), 0)
  }

  /** the shots since the last frame written as puffs: a clock that ran back or jumped (a load, the bench) rebuilds the
   *  ring from the shots of the longest life before it, so the smoke at a clock is the same however it was reached */
  private spawn(T: number): void {
    const j = this.source.slack // (a puff's birth past its shot's clock, at most)
    let t0 = this.last + j
    if (!(T >= this.last && T - this.last <= REBUILD)) {
      this.ring.fill(0)
      this.next = 0
      this.dirtyLo = 0
      this.dirtyHi = this.cap
      t0 = T - this.def.life[1] - j
    }
    this.last = T
    const out = this.puffs
    out.length = 0
    this.source.spawn(t0, T + j, out)
    for (let k = 0; k < out.length; k += PUFF_FLOATS) this.write(out, k)
  }

  // a puff into the ring's next slot (overwriting the oldest when full: new fire always shows)
  private write(p: number[], k: number): void {
    const o = this.next * 16
    for (let i = 0; i < PUFF_FLOATS; i++) this.ring[o + i] = p[k + i]
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
}

const UNIFORMS = [
  'uJet',
  'uGrow',
  'uPlume',
  'uRoll',
  'uThin',
  'uHeight',
  'uBig',
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
