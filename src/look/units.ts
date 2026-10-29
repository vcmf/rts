// The armies on the look page (docs/plans/active/armies-demo.md): battalions of figures drawn as thin instances, one
// host per battalion per LOD, skinned in src/look/shaders/units.vert from the baked animation (tools/bake-figure.py),
// stepped at the bake's 12 fps, painted by the world's painter on the units' light (KEEP_HUE) and casting their own
// shadows on the ground: one baked shape a man, each drawn on the ground in the main pass (decision 0049), at every
// zoom, softer, lighter and shorter up close (decision 0062); the shadow map fitted to the view (decision 0047) only
// behind its switches (?ushadowclose=map up close, ?ushadowfar=map everywhere). Ported from the crowd
// bench (look/l1a-crowd-bench, L1a/L1b); moved by the demo's script (src/look/world/armies.ts), not by the sim yet.
// The figure names its clips by role (halt, march, run, fire: decision 0015)
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Camera } from '@babylonjs/core/Cameras/camera.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Frustum } from '@babylonjs/core/Maths/math.frustum.js'
import { Matrix, Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import type { Plane } from '@babylonjs/core/Maths/math.plane.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
import '@babylonjs/core/Engines/Extensions/engine.alphaToCoverage.js'
import { MSAA } from './post.ts'
import type { ThinEngine } from '@babylonjs/core/Engines/thinEngine.js'
import { D } from './spec.ts'
import type { Scene } from '@babylonjs/core/scene.js'
import { SUN, type Materials } from './materials.ts'
import UNITS_VS from './shaders/units.vert?raw'
import UNITS_FS from './shaders/units.frag?raw'
import FLAG_VS from './shaders/flag.vert?raw'
import FLAG_FS from './shaders/flag.frag?raw'
import DEPTH_FS from './shaders/depth.frag?raw'
import DECAL_VS from './shaders/unitdecal.vert?raw'
import DECAL_FS from './shaders/unitdecal.frag?raw'
import { groundAt } from './heightfield.ts'
import { mulberry } from './noise.ts'
import {
  CONTACT_FLOOR,
  FOOT_SHARP,
  STEP_SHADOW,
  SHADOW_LOOK,
  SHADOW_LOOK_BAND,
  contactReachOf,
  contactUniform,
  NEAR_BAND,
  nearOn,
  nearWeight,
  ovalWeight,
  decalDefinesChanged,
  decalStep,
  decalStrip,
  farShare,
  footUniform,
  lookBetween,
  type DecalPoll,
  type DecalSide,
  type ShadowContact,
  type ShadowLook,
  type ShapeBox,
  type StepShadow,
} from './shadow-look.ts'
import { TR, TRACE, tr, trNow } from './trace.ts'
import { FOOT_FLOATS } from './world/smoke.ts'
import {
  FADE_WIDTH,
  FAR_FROM,
  NEAR_FADE,
  TINY_FADE,
  battalionLods,
  boxPxRange,
  lodCount,
  nextLodBuffers,
  splitLists,
  type BattalionAt,
  type Lods,
} from './lod-fade.ts'
import {
  TINY_ROLES,
  farWidthScale,
  contactOvals,
  posedMesh,
  posedVertices,
  shadowProxy,
  shadowShape,
  AtlasTooLarge,
  tinyMesh,
  type UnitData,
} from './units-data.ts'
import {
  CYCLE,
  farPalette,
  farRule,
  fireStart,
  manAt,
  phaseAt,
  scriptClock,
  slots,
  type Battalion,
  type Drill,
  type ManState,
  type Phase,
  type Uniform,
} from './world/armies.ts'

const ROLES = ['halt', 'march', 'run', 'fire'] as const
const RESERVE = { phase: 'halt', start: 0, deployEnd: 0 } as const // a reserve's phase: halted in column, always

interface Host {
  b: Battalion
  // lod: the figure's LODs nearest first (the data's), the shadow proxy (casts only), the simple shadow (drawn on the
  // ground), the tiny LOD (when on)
  lod: Mesh[]
  near: boolean
  tiny: boolean
  matrices: Float32Array
  settings: Float32Array
  man: Float32Array // each man's index (aMan: the LOD cross-fade's hash), in the battalion's order
  jitter: Float32Array
  // the nearest LOD (a figure with three LODs, its men tall on screen: setSplit, share): each man drawn at the nearest
  // LOD or the next by his own size on screen. split: the battalion's men are shared out; sel: a man at the nearest
  // (1); nearM/nearS/nearN its men's matrices, clips and moves, restM/restS/restN the others' (the next LOD's buffers
  // while split); resplit: the lists are older than the matrices
  split: boolean
  sel: Uint8Array
  nearM: Float32Array
  nearS: Float32Array
  nearN: Float32Array
  restM: Float32Array
  restS: Float32Array
  restN: Float32Array
  nearI: Float32Array // (and their indices, aMan)
  restI: Float32Array
  resplit: boolean
  lods: Lods // the LODs drawn this frame (battalionLods)
  fading: boolean // more than one of them: its figure meshes fade each man (uLodFade)
  next: Float32Array // each man's move to his next step's place (x, y, z): the places between two steps (aNext)
  moving: boolean // re-placed at every step (its phase moves its men)
  cx: number
  cz: number
  lo: Vector3
  hi: Vector3
  foot: Float32Array // its men's roots in its own frame as placed: [x0, z0, x1, z1] m (footprints)
  step: number // the 1/fps step its matrices were written for (a moving battalion moves once a step)
  phase: Phase | null // the script's phase its men were last written in (a halted one is written once a phase)
  stale: boolean[] // per LOD: its GPU copy of the matrices is older than the matrices
  staleSet: boolean[] // per LOD: its GPU copy of the men's clip settings is older
  staleNext: boolean[] // per LOD: its GPU copy of the men's moves is older
  cycle: number // the cycle its settings were written in (each cycle's clips start afresh)
  index: number // its place in hosts (its flag's instance)
}

const SM_SIZE = 2048 // the figures' shadow map, fitted to the ground in view each frame
const SM_REACH = 900 // m: a view ray that meets no ground is cut here (the widest zoom looks far)
const SM_BIAS = 0.02 // m along the sun: no receiver is drawn into the map, so it only absorbs float rounding
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1] // the view's corners in clip space
const FIGURE = 1.8 // m: a figure's height, for the LOD's pixel test
// m: a man's bounding sphere round his middle (his musket at the present), for the nearest LOD's view test
const MAN_R = 1.6
const SM_HOLD = 6 // m: lazy, the held sun box must cover the view by this much
// m; rad; the cloth's least height on screen
const FLAG_W = 1.4
const FLAG_H = 1.1
const FLAG_TOP = 3.0
/** the wind's way, rad from +x toward +z: the flags fly and the smoke drifts toward (cos, sin) of it */
export const FLAG_WIND = 0.6
const FLAG_MIN_PX = 12
// the trodden ground's mask: texels a side; s between its redraws while men move
const TR_N = 256
const TR_EVERY = 0.25
// m behind a man, weight
const TR_TRAIL = [
  [0.8, 0.9],
  [1.6, 0.8],
  [2.6, 0.6],
  [3.8, 0.4],
] as const
const TR_WEIGHT = 1 + TR_TRAIL.reduce((a, [, w]) => a + w, 0)
// the far figure's growth at a quarter of the LOD switch's height
const FAR_SCALE_XZ = 1.35
const FAR_SCALE_Y = 1.15
const SHADOW_H = 2.6 // m: the highest point of a figure (his bayonet up), whose shadow reaches farthest
const SM_STEP_FINE = 2 // m: the box's half-size steps
const SM_HOLD_SHARE = 0.1 // the held box's slack, a share of the view's half-size (the shadow fix: SM_HOLD at least)
const SM_COARSE = 1.3 // and be at most this many times the size the view needs (its texels no coarser)
// the simple shadow's grid (cells along and across it): it lies on the ground, 2 m a cell (8 vertices: the widest view
// is bound by its vertices)
const DECAL_ALONG = 3 // (four rows, placed by decalStrip, src/look/shadow-look.ts: it must stay 3)
const DECAL_ACROSS = 1
// m along the shadow from his feet over which its lift grows (unitdecal.vert: not over his own shins)
const LIFT_RAMP = 1.5
// (the blend's factors, WebGL's own: no Babylon mode is dst · src with the alpha kept)
const GL_ZERO = 0
const GL_ONE = 1
const GL_SRC_COLOR = 0x0300
const GROUND_N = 512 // the simple shadows' own ground heights without the meadow map: texels a side over the tile
const SHAPE_MIPS = 3 // the shape's mips read at most: a cell's 8-texel border holds to the fourth (unitdecal.frag)
const SHAPE_FACINGS = 16 // the simple shadow's facings (shadowShape)
// frames the shadows' idle material is asked to compile before the page gives up on it (useDecalFor): 10 s at 60 fps
const IDLE_POLLS = 600
/** the cross-fade's band (decision 0049): the camera's distance to its focus (m) where the map gives way to the simple
 *  shadows, from the map alone to the simple shadows alone (?ushadowswitch=<r0>,<r1>); near the LOD switch (48 px at
 *  1080 lines: 63 m) */
export const SHADOW_SWITCH: readonly [number, number] = [60, 85]
/** m: a man's shadow from his soles to its tip at the shape's length (his height over the sun's tangent), where the
 *  look's gradient ends */
const SHADOW_TIP = (FIGURE * Math.hypot(SUN.x, SUN.z)) / SUN.y
const SOFT_BLUR = 0.12 // m: the soft bake's sigma (shadowShape's soft)
// the LOD cross-fade's uniforms (units.vert: the bands, and a draw's men in order, set by bindFade)
const FADE_UNIFORMS = ['uLodBand', 'uLodFade']

/** The LOD cross-fade's defines for a figure material (decision 0066): its LOD (slot: 0 near, 1 far, 2 tiny), a man's
 *  own fade (FADE_WIDTH), and the fade on (setLodFade turns it off) */
function fadeDefines(slot: 0 | 1 | 2): string[] {
  return [`#define LOD_SLOT ${slot}`, `#define LOD_FADE_W ${FADE_WIDTH.toFixed(4)}`, ...FADE_ON]
}
// the defines the cross-fade turns on (setLodFade): the fade, and the far ramps' start at the near band's foot
const FADE_ON = ['#define LODFADE', `#define FAR_FROM ${FAR_FROM.toFixed(4)}`]

// an axis-aligned box wholly outside one of the planes (its corner most along the plane's normal behind it)
function boxOutside(planes: Plane[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  return planes.some(
    p =>
      p.normal.x * (p.normal.x > 0 ? x1 : x0) +
        p.normal.y * (p.normal.y > 0 ? y1 : y0) +
        p.normal.z * (p.normal.z > 0 ? z1 : z0) +
        p.d <
      0,
  )
}

export class Units {
  readonly data: UnitData
  private hosts: Host[] = []
  private lods: Mesh[] = []
  // one material a uniform the battalions wear (shared by its battalions), and one for its far LOD (the far rule)
  private readonly mats = new Map<string, ShaderMaterial>()
  private readonly farMats = new Map<string, ShaderMaterial>()
  private readonly tinyMats = new Map<string, ShaderMaterial>() // the tiny LOD's: the far LOD's own, on its mesh
  private readonly uniforms: Readonly<Record<string, Uniform>>
  private depthMat: ShaderMaterial
  private depthVatMat: ShaderMaterial // the far LOD's casters, posed (VAT_POS)
  private depthProxyMat!: ShaderMaterial // the shadow proxy's, posed
  // the far LOD posed (the simple shadow's shape is made from it)
  private posedFar: ReturnType<typeof posedVertices> | null = null
  private posed = false
  /** the casters culled to those whose shadow can reach the view (?ucull=0: all in the sun's box) */
  tightCull = true
  private camPlanes = Frustum.GetPlanes(Matrix.Identity())
  private sun: FreeCamera
  private shadowRT: RenderTargetTexture | null = null // the map's (useMap: only when a switch asks for it)
  private shadows = false
  private culled: Mesh[] = []
  private planes = Frustum.GetPlanes(Matrix.Identity())
  private scratch = {
    inv: new Matrix(),
    vp: new Matrix(),
    a: new Vector3(),
    b: new Vector3(),
    d: new Vector3(),
    v: new Vector3(),
    c: new Vector3(),
    pts: Array.from({ length: 9 }, () => new Vector3()),
  }
  private readonly slot: ReturnType<typeof slots>
  private readonly speed: { march: number; run: number }
  private readonly man: ManState = { x: 0, z: 0, face: 0, role: 'halt', since: 0, moving: false }
  private readonly clockAt = { cycle: 0, local: 0 } // (scratch: scriptClock)
  /** the script held in its fire phase (?firehold=1: every battalion in line firing, for the bench and the smoke's
   *  stills; scriptClock), set before the first frame */
  holdFire = false
  private placed = 0 // battalions placed so far (placeCount)
  /** the far LOD's switch by default (main.ts checks ?tinypx under it) */
  static readonly LOD_PX = 48
  /** the figure height in pixels below which a battalion draws its far LOD (±10%, so it does not flicker) */
  lodPx = Units.LOD_PX
  /** the figure height in pixels below which a battalion far off draws the tiny LOD (±10 %;
   *  docs/plans/active/armies-32k.md, step 3; the constructor's opts.tinyPx); 0 (?tinylod=0): none built */
  readonly tinyPx: number
  /** the tiny LOD's size (the report's, the tests') */
  tinyStats = { vertices: 0, triangles: 0 }
  /** the figure height in pixels from which a man is drawn at the nearest LOD, when the figure has one (±10 %; the
   *  battalions whose bounds are out of the view or whose nearest point is under 90 % of it never look:
   *  ?nearestpx=<px>, 0 for none) */
  nearestPx = 100
  /** the LOD cross-fade (decision 0066; ?lodfade=0: the hard switch, a battalion at one LOD): setLodFade */
  private fade = true
  // the bands this frame, px (NEAR_FADE, TINY_FADE of lodPx, tinyPx), and as the materials' uniform
  private readonly nearBand: [number, number] = [0, 0]
  private readonly tinyBandV: [number, number] = [0, 0]
  private readonly bandV = new Vector4()
  // the figure meshes of the battalions that draw more than one LOD (h.fading): each man faded (uLodFade 1); the
  // others draw every man
  private readonly fadingMeshes = new Set<Mesh>()
  private readonly pxRange: [number, number] = [0, 0] // (scratch: boxPxRange)
  private readonly at: BattalionAt = { pLo: 0, pHi: 0, px: 0, split: false, wasNear: false, wasTiny: false }
  // the LODs' places in a host's meshes: the far LOD (the data's last), the near one before it, then the shadow proxy
  // and the simple shadow; the nearest LOD is the first when the figure has three (the data says which it has)
  private readonly farLod: number
  private readonly nextLod: number
  private readonly proxyLod: number
  private readonly decalLod: number
  private readonly tinyLod: number // after the simple shadow, when the tiny LOD is on; else -1
  private readonly hasNearest: boolean
  /** the shadow map redrawn only when it would change (?ushadowrate=0: every frame): the poses step at the bake's fps,
   *  so a frame between two steps, with the sun's box and the men where they were, would draw the same map */
  lazyShadows = true
  /** the casters at the near LOD where the camera draws it (?ushadowlod=1), else as casterOf says (the shadow proxy
   *  by default, main.ts) */
  casterNear = false
  /** the receivers that read the figures' shadow once a blade at its root (UNIT_SHADOWS_VS): main.ts gives the meadow's
   *  by default (?ushadowvs=0: none, each pixel reads it) */
  rootReceivers: ShaderMaterial[] = []
  readonly meshes: Mesh[] = []
  private farK = new Vector2()
  private footV = new Vector4() // the decal's gradient (setDecalLook; its own: a material keeps the vector it is given)
  private sidePad = 2 // m: a battalion's bounds beyond its men's roots (the constructor's, from the baked poses)
  /** the shadow proxy's size (the report's, the tests') */
  proxyStats = { vertices: 0, triangles: 0 }
  private flag: Mesh | null = null
  private flagsOn = false
  private shown = true
  private flagK = new Vector2() // (its own: a material keeps the vector it is given)
  private flagMat: ShaderMaterial | null = null
  private flagM: Float32Array | null = null
  private flagN: Float32Array | null = null // the bearer's move to his next step's place (aNext)
  private flagStale = false
  private readonly bearer: number // the colour bearer: the line's centre file, second rank
  private readonly mats0: Materials
  private trampleOn = false
  private trTex: RawTexture | null = null
  private readonly trBuf = new Uint8Array(TR_N * TR_N)
  private readonly trAcc = new Float32Array(TR_N * TR_N)
  private readonly trBox = { x0: 0, z0: 0, size: 64, set: false }
  private readonly trV = new Vector4()
  private trAt = -1 // the clock when the mask was last drawn
  private trWall = -Infinity // the wall's clock (ms) when its box was last fitted
  private quad = new Float64Array(8) // castView: the corner rays' ground points at the focus's height (x, z)
  private rays = new Float64Array(24) // and the rays (origin, direction)
  /** the held sun box's slack in proportion to it (?smhold=fixed: batch B's, none) */
  holdShare = true
  /** the casters: the shadow proxy (shadowProxy, src/look/units-data.ts; ?shadowlod=far: the far LOD) */
  proxyCasters = true
  private smStep = -1 // the step the map was last drawn at
  private smEmpty = false // it was last drawn with no casters (clear)
  private smVP = new Float32Array(16) // the sun's view-projection it was drawn with
  private smList: Mesh[] = [] // and its casters
  // the sun's box held while it covers the view (lazy only)
  private smBox = { ex: 0, ey: 0, V: new Matrix(), c: new Vector3(), set: false, margin: SM_HOLD }
  /** the shadow map's draws so far (the captures count them: a still frame draws none) */
  smDraws = 0
  /** the simple shadows past close zoom (decision 0049; ?ushadowfar=map: the map at every zoom, false) */
  simpleFar = true
  /** and up close (decision 0062; ?ushadowclose=map: the map up close, cross-faded to them over band, false) */
  simpleClose = true
  /** the simple shadows' look up close and far (SHADOW_LOOK), turned from one to the other over lookBand; up close
   *  only with simpleClose (else the far look at every zoom, as before) */
  look: { close: ShadowLook; far: ShadowLook } = { close: { ...SHADOW_LOOK.close }, far: { ...SHADOW_LOOK.far } }
  lookBand: [number, number] = [...SHADOW_LOOK_BAND]
  /** the contact shadow under each man's feet (decision 0071; ?ushcontact: applyContactParams), or null: none (the
   *  default since decision 0074). Read once, when the shadows' material is made */
  contact: ShadowContact | null = null
  /** the shape baked per animation step for the near material (decision 0074; ?ushstep: applyStepParams), or null:
   *  the shape averaged over each clip at every zoom. Read once, when the shadows' material is made */
  stepShadow: StepShadow | null = { ...STEP_SHADOW }
  /** a ?ushstep given on the page: a per-step atlas this GPU cannot hold is then an error at load, not a fallback to
   *  the averaged shape (useDecals) */
  stepExplicit = false
  /** the per-step shape's foot sharpening ([boost, reach m]: footSharpen, ?ushfootk; FOOT_SHARP), [1, 0]: none */
  footSharp: [number, number] = [FOOT_SHARP[0], FOOT_SHARP[1]]
  private contactReach = 0 // m: how far the contact reaches from a man's root (the strip holds it: decalStrip)
  private contactW = 0 // the contact oval's weight this frame (ovalWeight, by the camera's distance)
  private nearW = 0 // the near material's weight this frame (nearWeight: the oval's or the per-step band's)
  /** the per-step shape's band (m from the camera's focus: NEAR_BAND, ?ushnearband) */
  stepBand: [number, number] = [NEAR_BAND[0], NEAR_BAND[1]]
  /** the per-step atlas did not fit this GPU's texture size: the averaged shape at every zoom (useDecals) */
  stepFallback = false
  private contactWSet = NaN // and the one last given to the material (setDecalLook)
  private readonly contactV = new Vector4()
  // the look this frame (lookAt), given to the decal's material (setDecalLook)
  private readonly lookNow: ShadowLook = { ...SHADOW_LOOK.far }
  // the look last given to the decal's material (setDecalLook: only when it changes)
  private readonly lookSet: ShadowLook = { soft: NaN, dark: NaN, foot: NaN, core: NaN, len: NaN, gain: NaN }
  private lookT = 1 // the far look's share this frame (lookAt), the strip's too (setDecalLook)
  private lookTSet = NaN
  // the shape's boxes (useDecals): what it alone fills (the far strip's), with the soft bake's reach (the close one's)
  private readonly shapeBoxes = new Map<ShaderMaterial, { base: ShapeBox; full: ShapeBox }>()
  private softPad = 0 // m: the soft bake's reach past the shape's own (the decal's bounds)
  private readonly stripV = new Vector4()
  private readonly rowsV = new Vector4()
  /** the cross-fade's band, m (SHADOW_SWITCH) */
  band: [number, number] = [...SHADOW_SWITCH]
  /** the figures, their flags and the map's casters moved every frame between two steps (?smoothmove=1), not at the
   *  steps (?smoothmove=0; the poses stay stepped either way); the simple shadows always are */
  smooth = true
  /** the map's share given to the simple shadows this frame (0: the map alone; 1: the simple shadows alone) */
  far = 0
  private lift = 0.6
  /** m: how high over the ground the simple shadows cover in depth (the grass, the legs of the men in them:
   *  ?udecallift=<m>) */
  get decalLift(): number {
    return this.lift
  }
  set decalLift(v: number) {
    this.lift = v
    for (const m of [this.decalFar, this.decalNear]) m?.setFloat('uDecalLift', v)
  }
  /** the simple shadows' ground height from the meadow map (main.ts: when there is one), else from the heightfield,
   *  sampled when they are made (setShadows): load-time only */
  groundMap = false
  /** the ground's shade the simple shadows darken it to (src/look/bakes.ts unitShade): main.ts, before setShadows */
  shade: BaseTexture | null = null
  private decal: ShaderMaterial | null = null // the simple shadows' material drawn now (useDecals, useDecalFor)
  private decalFar: ShaderMaterial | null = null // without the contact's oval (past its band; without a contact)
  private decalNear: ShaderMaterial | null = null // with it (within its band), null without a contact
  // the background compile (useDecalFor, decalStep): afresh after every switch and every change of the defines
  private decalPoll: DecalPoll = decalDefinesChanged()
  /** their share of the samples (their soft edge and their gradient: decalFragment, src/look/shadow-look.ts) as
   *  alpha to coverage, with the scene's 4 samples: order-independent; with fewer (?msaa=1|2: two samples would make
   *  the gradient one hard step on drivers that do not dither it) their share darkens the pixel instead, the first
   *  shadow there winning (the stencil), so where they overlap the result depends on their order there */
  private get coverage(): boolean {
    return MSAA.samples >= 4
  }
  private mapOn = false // the map drawn this frame
  private stepFrac = 0
  private culledMoving = false // a caster in the map has its men moving (cull)
  private smT = NaN // the clock when the map was last drawn (a frozen clock draws it no more)
  private farScaleOn = false
  private farScaleV = new Vector2(1, 1)
  /** ms the simple shadow's shapes took to bake (shadowShape, at load: today's, and the per-step one) */
  shapeMs = 0

  /** receivers: the painted materials the figures' shadows fall on (the ground and the grass); the page's clock */
  private readonly scene: Scene
  private readonly camera: ArcRotateCamera
  private readonly receivers: ShaderMaterial[]
  private readonly drill: Drill
  private readonly clock: () => number
  /** uniforms: the era's, by id (each battalion names one) */
  constructor(
    scene: Scene,
    camera: ArcRotateCamera,
    mats: Materials,
    receivers: ShaderMaterial[],
    data: UnitData,
    drill: Drill,
    battalions: Battalion[],
    uniforms: Readonly<Record<string, Uniform>>,
    clock: () => number,
    opts: { tinyPx?: number } = {},
  ) {
    this.scene = scene
    this.camera = camera
    this.receivers = receivers
    this.drill = drill
    this.clock = clock
    this.uniforms = uniforms
    this.data = data
    if (data.lods.length !== 2 && data.lods.length !== 3) {
      throw new Error(`units: drawn with two or three LODs, the data has ${data.lods.length}`)
    }
    this.farLod = data.lods.length - 1
    this.nextLod = this.farLod - 1
    this.proxyLod = this.farLod + 1
    this.decalLod = this.farLod + 2
    this.hasNearest = data.lods.length > 2
    let tinyPx = opts.tinyPx ?? 12
    if (tinyPx > 0 && data.palette.length > TINY_ROLES) {
      console.warn(
        `units: the figure has ${data.palette.length} colour roles, the tiny LOD mixes at most ${TINY_ROLES}: drawn without it`,
      )
      tinyPx = 0
    }
    this.tinyPx = tinyPx
    this.tinyLod = tinyPx > 0 ? this.farLod + 3 : -1
    for (const r of ROLES) {
      if (!data.ranges[r]) throw new Error(`units: the figure has no clips for the role ${r} (tools/bake-figure.py)`)
    }
    this.slot = slots(drill)
    this.mats0 = mats
    let best = Infinity
    let bi = 0
    this.slot.line.forEach(([x, z], i) => {
      const d = Math.hypot(x, z + drill.rankSpacing)
      if (d < best) {
        best = d
        bi = i
      }
    })
    this.bearer = bi
    this.speed = { march: data.ranges.march.speed, run: data.ranges.run.speed }
    if (!(this.speed.march > 0 && this.speed.run > 0)) {
      throw new Error('units: the march and run roles have no root speed')
    }
    const vat = RawTexture.CreateRGBATexture(
      data.vat.data,
      data.vat.width,
      data.vat.height,
      scene,
      false,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_HALF_FLOAT,
    )
    vat.name = 'figureVAT'
    const attributes = ['position', 'normal', 'aRole', 'aBones', 'aWeights', 'aVAT', 'aVid', 'aNext', 'aMan']
    const n = data.palette.length
    // the far figure's growth (setFarScale): across up to FAR_SCALE_XZ, but never wider than 95 % of a file
    // (farWidthScale), and FAR_SCALE_Y tall
    const fm = data.mesh[data.lods[this.farLod].name]
    const farScale = new Vector2(farWidthScale(fm.positions, drill.fileSpacing, FAR_SCALE_XZ), FAR_SCALE_Y)
    this.farScaleV = farScale
    // 1: the battalions' bounds' side pad, from the baked poses: the far LOD's farthest reach from a man's root across
    // every step (his musket at the present), as wide as the far figures grow, a little to spare
    const pv = posedVertices(data, data.lods[this.farLod].name)
    let reach = 0
    for (let i = 0; i < pv.data.length; i += 8) reach = Math.max(reach, Math.hypot(pv.data[i], pv.data[i + 2]))
    this.sidePad = reach * farScale.x + 0.2
    for (const id of new Set(battalions.map(b => b.uniform))) {
      const u = uniforms[id]
      if (!u) throw new Error(`units: no uniform ${id} (a battalion names it)`)
      // its colour for each of the bake's roles (a role the uniform does not name: a loud failure)
      const pal = data.palette.map(r => {
        const hex = u.colours[r]
        if (!hex) throw new Error(`units: the uniform ${id} has no colour for the role ${r}`)
        return Color3.FromHexString(hex)
      })
      const m = mats.make(`units_${id}`, UNITS_VS, UNITS_FS, {
        attributes,
        uniforms: ['uVATStep', 'uStepFrac', 'uPal', 'uMask', 'uCoatRole', 'uFarK', ...FADE_UNIFORMS],
        samplers: ['uVAT'],
        defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE', `#define PAL_N ${n}`, ...fadeDefines(0)],
      })
      m.setTexture('uVAT', vat)
      m.setColor3Array('uPal', pal)
      m.setFloat('uMask', -1)
      m.setFloat('uCoatRole', data.palette.indexOf('coat'))
      this.mats.set(id, m)
      this.bindFade(m)
      // the far LOD's: its far palette and its lift crossfaded in below the LOD switch under its far rule (FAR,
      // setFarRule; units.vert, units.frag), its vertices posed (VAT_POS, setPosed)
      const f = mats.make(`units_${id}_far`, UNITS_VS, UNITS_FS, {
        attributes,
        uniforms: [
          'uVATStep',
          'uStepFrac',
          'uPal',
          'uPalFar',
          'uFarK',
          'uFarScale',
          'uMask',
          'uCoatRole',
          ...FADE_UNIFORMS,
        ],
        samplers: ['uVAT', 'uVATP'],
        defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE', `#define PAL_N ${n}`, ...fadeDefines(1)],
      })
      const far = farPalette(u.colours)
      f.setTexture('uVAT', vat)
      f.setColor3Array('uPal', pal)
      f.setColor3Array(
        'uPalFar',
        data.palette.map(r => Color3.FromHexString(far[r])),
      )
      f.setFloat('uMask', -1)
      f.setFloat('uCoatRole', data.palette.indexOf('coat'))
      f.setVector2('uFarScale', farScale)
      this.farMats.set(id, f)
      this.bindFade(f)
      // the tiny LOD's: the far LOD's material on the tiny mesh (its own posed vertices: uVATP below)
      if (!tinyPx) continue
      const t = mats.make(`units_${id}_tiny`, UNITS_VS, UNITS_FS, {
        attributes: [...attributes, 'aRW0', 'aRW1', 'aRW2'],
        uniforms: [
          'uVATStep',
          'uStepFrac',
          'uPal',
          'uPalFar',
          'uFarK',
          'uFarScale',
          'uMask',
          'uCoatRole',
          ...FADE_UNIFORMS,
        ],
        samplers: ['uVAT', 'uVATP'],
        defines: [
          '#define NOSNOW',
          '#define KEEP_HUE',
          '#define BOUNCE',
          `#define PAL_N ${n}`,
          '#define TINY',
          ...fadeDefines(2),
        ],
      })
      t.setTexture('uVAT', vat)
      t.setColor3Array('uPal', pal)
      t.setColor3Array(
        'uPalFar',
        data.palette.map(r => Color3.FromHexString(far[r])),
      )
      t.setFloat('uMask', -1)
      t.setFloat('uCoatRole', data.palette.indexOf('coat'))
      t.setVector2('uFarScale', farScale)
      this.tinyMats.set(id, t)
      this.bindFade(t)
    }
    // the shadow pass: the same skinning, depth only, from an orthographic camera along the sun
    this.depthMat = new ShaderMaterial(
      'unitsDepth',
      scene,
      { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS },
      {
        attributes,
        uniforms: ['world', 'viewProjection', 'uVATStep', 'uStepFrac'],
        samplers: ['uVAT'],
        defines: ['#define DEPTH'],
      },
    )
    this.depthMat.setTexture('uVAT', vat)
    // the far LOD posed at every step (batch B, ?uvat): its materials and its shadow casters read it under VAT_POS
    const posed = pv
    const vatp = RawTexture.CreateRGBATexture(
      posed.data,
      posed.width,
      posed.height,
      scene,
      false,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    )
    vatp.name = 'figurePosed'
    for (const m of this.farMats.values()) m.setTexture('uVATP', vatp)
    this.depthVatMat = new ShaderMaterial(
      'unitsDepthPosed',
      scene,
      { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS },
      {
        attributes,
        uniforms: ['world', 'viewProjection', 'uVATStep', 'uStepFrac'],
        samplers: ['uVAT', 'uVATP'],
        defines: ['#define DEPTH', '#define VAT_POS'],
      },
    )
    this.depthVatMat.setTexture('uVAT', vat)
    this.depthVatMat.setTexture('uVATP', vatp)
    this.sun = new FreeCamera('unitSun', SUN.scale(500), scene)
    this.sun.mode = Camera.ORTHOGRAPHIC_CAMERA
    this.sun.minZ = 1
    this.sun.maxZ = 1200
    for (const l of data.lods) {
      const m = data.mesh[l.name]
      const mesh = new Mesh(`figure_${l.name}`, scene)
      mesh.setVerticesData('position', m.positions, false, 3)
      mesh.setVerticesData('normal', m.normals, false, 3)
      mesh.setVerticesData('aRole', Float32Array.from(m.roles), false, 1)
      mesh.setVerticesData(
        'aVid',
        Float32Array.from(m.roles, (_, i) => i),
        false,
        1,
      )
      mesh.setVerticesData('aBones', Float32Array.from(m.boneIndices), false, 4)
      mesh.setVerticesData('aWeights', m.boneWeights, false, 4)
      // (the battalions' hosts are its clones; it is never drawn, but a mesh without a material makes Babylon reach for
      // its default StandardMaterial, which the page does not import: the readiness of the bench and the tools threw)
      mesh.material = this.mats.values().next().value ?? null
      mesh.setIndices(m.indices)
      mesh.setEnabled(false)
      this.lods.push(mesh)
    }
    // the shadow proxy (shadowProxy, src/look/units-data.ts): a third mesh a battalion, never drawn in the view, cast
    // from its posed vertices (VAT_POS), both sides of its quads
    const px = shadowProxy(data, data.lods[this.farLod].name)
    const pp = posedMesh(data, px)
    const pn = px.positions.length / 3
    const vatx = RawTexture.CreateRGBATexture(
      pp.data,
      pp.width,
      pp.height,
      scene,
      false,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    )
    vatx.name = 'figureShadowPosed'
    this.depthProxyMat = new ShaderMaterial(
      'unitsDepthProxy',
      scene,
      { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS },
      {
        attributes,
        uniforms: ['world', 'viewProjection', 'uVATStep', 'uStepFrac'],
        samplers: ['uVAT', 'uVATP'],
        defines: ['#define DEPTH', '#define VAT_POS'],
      },
    )
    this.depthProxyMat.setTexture('uVAT', vat)
    this.depthProxyMat.setTexture('uVATP', vatx)
    this.depthProxyMat.backFaceCulling = false
    const pm = new Mesh('figure_shadow', scene)
    pm.setVerticesData('position', px.positions, false, 3)
    pm.setVerticesData('normal', px.normals, false, 3)
    pm.setVerticesData('aRole', new Float32Array(pn), false, 1)
    pm.setVerticesData(
      'aVid',
      Float32Array.from({ length: pn }, (_, i) => i),
      false,
      1,
    )
    pm.setVerticesData('aBones', Float32Array.from(px.boneIndices), false, 4)
    pm.setVerticesData('aWeights', px.boneWeights, false, 4)
    pm.material = this.depthProxyMat
    pm.setIndices(px.indices)
    pm.setEnabled(false)
    this.lods.push(pm)
    this.proxyStats = { vertices: pn, triangles: px.indices.length / 3 }
    // the simple shadow (decision 0049): a grid a man (0 to 1 across and along the shadow's frame), each vertex set on
    // the ground (unitdecal.vert); its material and shape made when first asked for (useDecals)
    const gp: number[] = []
    const gi: number[] = []
    for (let j = 0; j <= DECAL_ALONG; j++) {
      for (let i = 0; i <= DECAL_ACROSS; i++) gp.push(i / DECAL_ACROSS, 0, j / DECAL_ALONG)
    }
    for (let j = 0; j < DECAL_ALONG; j++) {
      for (let i = 0; i < DECAL_ACROSS; i++) {
        const a = j * (DECAL_ACROSS + 1) + i
        const b = a + DECAL_ACROSS + 1
        gi.push(a, a + 1, b + 1, a, b + 1, b)
      }
    }
    const qm = new Mesh('figure_shadow2D', scene)
    qm.setVerticesData('position', gp, false, 3)
    qm.setIndices(gi)
    qm.material = this.depthProxyMat
    qm.setEnabled(false)
    this.lods.push(qm)
    if (tinyPx) {
      // the tiny LOD (tinyMesh, src/look/units-data.ts): the far LOD's parts as boxes,
      // posed at every step as the far LOD
      const tm = tinyMesh(data, data.lods[this.farLod].name)
      const tp = posedMesh(data, tm)
      const tn = tm.positions.length / 3
      const vatt = RawTexture.CreateRGBATexture(
        tp.data,
        tp.width,
        tp.height,
        scene,
        false,
        false,
        Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        Constants.TEXTURETYPE_FLOAT,
      )
      vatt.name = 'figureTinyPosed'
      for (const m of this.tinyMats.values()) m.setTexture('uVATP', vatt)
      const tmesh = new Mesh('figure_tiny', scene)
      tmesh.setVerticesData('position', tm.positions, false, 3)
      tmesh.setVerticesData('normal', tm.normals, false, 3)
      tmesh.setVerticesData('aRole', Float32Array.from(tm.roles), false, 1)
      tmesh.setVerticesData(
        'aVid',
        Float32Array.from({ length: tn }, (_, i) => i),
        false,
        1,
      )
      tmesh.setVerticesData('aBones', Float32Array.from(tm.boneIndices), false, 4)
      tmesh.setVerticesData('aWeights', tm.boneWeights, false, 4)
      for (let a = 0; a < 3; a++) {
        tmesh.setVerticesData(
          `aRW${a}`,
          Float32Array.from({ length: tn * 4 }, (_, i) => tm.weights[Math.floor(i / 4) * TINY_ROLES + a * 4 + (i % 4)]),
          false,
          4,
        )
      }
      tmesh.material = this.tinyMats.values().next().value ?? null
      tmesh.setIndices(tm.indices)
      tmesh.setEnabled(false)
      this.lods.push(tmesh)
      this.tinyStats = { vertices: tn, triangles: tm.indices.length / 3 }
    }
    this.posedFar = pv
    for (const b of battalions) this.add(b)
    scene.onBeforeRenderObservable.add(() => this.frame())
  }

  /** A battalion's mesh for a LOD (li: its place in h.lod): a clone of the LOD's, its own geometry (thin-instance
   *  matrices are vertex buffers on the geometry, and clones share it: without its own every battalion would draw with
   *  the last one's men), its material, drawn into the shadow map (when there is one) with the depth material */
  private hostMesh(li: number, b: Battalion, index: number): Mesh {
    const src = this.lods[li]
    const host = src.clone(`${src.name}_${index}`)
    host.makeGeometryUnique()
    // (the far LOD's own: the far palette, posed)
    host.material =
      li === this.decalLod
        ? (this.decal ?? this.depthProxyMat)
        : li === this.proxyLod
          ? this.depthProxyMat
          : ((li === this.tinyLod ? this.tinyMats : li === this.farLod ? this.farMats : this.mats).get(b.uniform) ??
            null)
    // (the proxy: shown to the map alone; the simple shadows and the tiny LOD: shown by frame())
    if (li >= this.proxyLod) host.isVisible = false
    if (li === this.decalLod) host.alphaIndex = 1000 // (after everything else)
    // (a clone of a disabled source is disabled: enabled while the figures show; the nearest LOD's by setSplit)
    host.isPickable = false
    host.alwaysSelectAsActiveMesh = false
    host.setEnabled(this.shown && (li !== 0 || !this.hasNearest))
    this.meshes.push(host)
    this.shadowRT?.setMaterialForRendering(
      host,
      li === this.proxyLod ? this.depthProxyMat : li === this.farLod && this.posed ? this.depthVatMat : this.depthMat,
    )
    return host
  }

  private add(b: Battalion): void {
    const men = this.slot.line.length
    // the nearest LOD's mesh is made at the battalion's first split (setSplit): until then its place holds the LOD's
    // own mesh, disabled and never drawn (a battalion never split costs no copy of the full figure: about 1 MB each)
    const lod = this.lods.map((src, li) =>
      this.hasNearest && li === 0 ? src : this.hostMesh(li, b, this.hosts.length),
    )
    const rnd = mulberry(1 + this.hosts.length * 7919)
    // ±3 cm, ±4°, a man's own lag: no two alike
    const jitter = new Float32Array(men * 4)
    for (let i = 0; i < men; i++) {
      jitter[i * 4] = (rnd() - 0.5) * 0.06
      jitter[i * 4 + 1] = (rnd() - 0.5) * 0.06
      jitter[i * 4 + 2] = (rnd() - 0.5) * 0.14
      jitter[i * 4 + 3] = rnd() * 2 - 1
    }
    const matrices = new Float32Array(men * 16)
    const settings = new Float32Array(men * 3)
    const next = new Float32Array(men * 3)
    const man = Float32Array.from({ length: men }, (_, i) => i)
    // (the nearest LOD's buffers its own, made at the first split; the next LOD's swapped to the rest's while split)
    lod.forEach((m, li) => {
      if (this.hasNearest && li === 0) return
      m.thinInstanceSetBuffer('matrix', matrices, 16, false)
      m.thinInstanceSetBuffer('aVAT', settings, 3, false)
      m.thinInstanceSetBuffer('aNext', next, 3, false)
      m.thinInstanceSetBuffer('aMan', man, 1, true)
      m.doNotSyncBoundingInfo = true // (its bounds are place()'s: a buffer swapped in must not refit them)
    })
    const all = () => lod.map(() => true)
    const none = () => new Float32Array(0)
    this.hosts.push({
      b,
      lod,
      near: false,
      tiny: false,
      matrices,
      settings,
      man,
      jitter,
      next,
      moving: false,
      cx: b.x,
      cz: b.z,
      lo: new Vector3(),
      hi: new Vector3(),
      foot: new Float32Array(4),
      step: -1,
      phase: null,
      stale: all(),
      staleSet: all(),
      staleNext: all(),
      cycle: -1,
      index: this.hosts.length,
      split: false,
      sel: new Uint8Array(0),
      nearM: none(),
      nearS: none(),
      nearN: none(),
      restM: none(),
      restS: none(),
      restN: none(),
      nearI: none(),
      restI: none(),
      resplit: true,
      lods: { near: false, far: false, tiny: false },
      fading: false,
    })
  }

  // every man's matrix and clip at the battalion's local time: his place and facing from the script, set on the ground;
  // his clip's range, and its phase so its step 0 falls when his role began (the clock's steps less his start's). A
  // moving battalion (moving: its phase moves its men, re-placed at every step) is placed as it stands at the step's
  // own time (back: s from it to the clock) and each man's move to his next step's place is written (next: the places
  // between two steps, aNext); a halted one where it stands, not moving. reuse: placed at the step before in the same
  // phase, so each man's ground height here is the one his move was written with (one groundAt a man a step, not two)
  private place(h: Host, local: number, cycleStart: number, moving: boolean, back: number, reuse: boolean): void {
    const { b, matrices, settings, jitter, next } = h
    const c = Math.cos(b.heading)
    const s = Math.sin(b.heading)
    const fps = this.data.fps
    const man = this.man
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    let fx0 = Infinity
    let fz0 = Infinity
    let fx1 = -Infinity
    let fz1 = -Infinity
    let changed = false
    const ls = moving ? Math.max(0, local - back) : local
    const ln = ls + 1 / fps
    // (a reserve stands in column)
    const p = h.b.reserve ? RESERVE : phaseAt(this.drill, ls, this.speed.march, this.speed.run)
    // (the next step's phase; none past the cycle's end, where the script starts afresh)
    const pn = moving && !h.b.reserve && ln < CYCLE ? phaseAt(this.drill, ln, this.speed.march, this.speed.run) : null
    for (let i = 0; i < this.slot.line.length; i++) {
      let nx = 0
      let nz = 0
      if (pn) {
        manAt(this.drill, this.slot, i, ln, pn, this.speed.run, this.speed.march, jitter[i * 4 + 3], man)
        nx = man.x
        nz = man.z
      }
      manAt(this.drill, this.slot, i, ls, p, this.speed.run, this.speed.march, jitter[i * 4 + 3], man)
      const lx = man.x + jitter[i * 4]
      const lz = man.z + jitter[i * 4 + 1]
      fx0 = Math.min(fx0, lx)
      fx1 = Math.max(fx1, lx)
      fz0 = Math.min(fz0, lz)
      fz1 = Math.max(fz1, lz)
      const x = b.x + c * lx + s * lz
      const z = b.z - s * lx + c * lz
      const y = reuse ? matrices[i * 16 + 13] + next[i * 3 + 1] : groundAt(x, z)
      // the figure faces -z in its own frame: turned by the battalion's heading and his own way (and a little jitter)
      const a = b.heading + man.face + Math.PI + jitter[i * 4 + 2]
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const o = i * 16
      matrices[o] = ca
      matrices[o + 1] = 0
      matrices[o + 2] = -sa
      matrices[o + 3] = 0
      matrices[o + 4] = 0
      matrices[o + 5] = 1
      matrices[o + 6] = 0
      matrices[o + 7] = 0
      matrices[o + 8] = sa
      matrices[o + 9] = 0
      matrices[o + 10] = ca
      matrices[o + 11] = 0
      matrices[o + 12] = x
      matrices[o + 13] = y
      matrices[o + 14] = z
      matrices[o + 15] = 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
      let dx = 0
      let dy = 0
      let dz = 0
      if (pn) {
        const kx = nx + jitter[i * 4]
        const kz = nz + jitter[i * 4 + 1]
        const wx = b.x + c * kx + s * kz
        const wz = b.z - s * kx + c * kz
        dx = wx - x
        dz = wz - z
        dy = groundAt(wx, wz) - y
        if (wx < minX) minX = wx
        if (wx > maxX) maxX = wx
        if (wz < minZ) minZ = wz
        if (wz > maxZ) maxZ = wz
        if (y + dy > maxY) maxY = y + dy
        if (y + dy < minY) minY = y + dy
      }
      next[i * 3] = dx
      next[i * 3 + 1] = dy
      next[i * 3 + 2] = dz
      // the clip: the role's range; its phase in steps puts its first step at his start (global time)
      const r = this.data.ranges[man.role]
      const steps = r.end - r.start
      const start = cycleStart + man.since
      const ph = ((-Math.floor(start * fps) % steps) + steps) % steps
      const k = i * 3
      if (settings[k] !== r.start || settings[k + 1] !== steps || settings[k + 2] !== ph) {
        settings[k] = r.start
        settings[k + 1] = steps
        settings[k + 2] = ph
        changed = true
      }
    }
    h.cx = (minX + maxX) / 2
    h.cz = (minZ + maxZ) / 2
    h.foot[0] = fx0
    h.foot[1] = fz0
    h.foot[2] = fx1
    h.foot[3] = fz1
    // thin-instance bounds do not follow the animation: padded by a figure's height (his bayonet up,
    // SHADOW_H, as tall as the far figures grow, FAR_SCALE_Y) and his reach (sidePad: from the baked
    // poses); cull() stretches the same box
    const top = SHADOW_H * FAR_SCALE_Y + 0.2
    const pad = this.sidePad
    h.lo.set(minX - pad, minY - 0.3, minZ - pad)
    h.hi.set(maxX + pad, maxY + top, maxZ + pad)
    this.placed++
    for (const m of h.lod) m.getBoundingInfo().reConstruct(h.lo, h.hi)
    // (the simple shadow's bounds: stretched away from the sun by the longest shadow, as tall as the far figures grow)
    const k = this.scratch
    shadowBox(h, top * Math.max(1, this.look.close.len, this.look.far.len), k.a, k.b)
    // (and the soft bake's reach sideways and behind, or the contact's past the men's own: the outermost men's fringe)
    const fringe = Math.max(this.softPad, this.contactReach * this.farScaleV.x - this.sidePad)
    k.a.x -= fringe
    k.a.z -= fringe
    k.b.x += fringe
    k.b.z += fringe
    h.lod[this.decalLod].getBoundingInfo().reConstruct(k.a, k.b)
    h.stale.fill(true)
    h.staleNext.fill(true)
    h.resplit = true
    this.placeFlag(h)
    if (changed) h.staleSet.fill(true)
  }

  // the mesh a battalion casts its shadow with (its index in h.lod): the near LOD where drawn near if casterNear
  // (?ushadowlod=1; split, its men at the nearest LOD cast with it too: cull), else the shadow proxy (proxyCasters),
  // else the far LOD (?shadowlod=far)
  private casterOf(h: Host): number {
    return this.casterNear && h.near ? this.nextLod : this.proxyCasters ? this.proxyLod : this.farLod
  }

  // a battalion's men shared out between the nearest LOD and the next (on), or all at the next (off): the next LOD's
  // buffers swapped to the rest's lists (share writes them) or back to the battalion's own
  private setSplit(h: Host, on: boolean): void {
    h.split = on
    const men = h.settings.length / 3
    if (on && h.sel.length !== men) {
      // (the mesh and the lists made at the battalion's first split: no memory for one never split)
      h.sel = new Uint8Array(men)
      h.nearM = new Float32Array(men * 16)
      h.nearS = new Float32Array(men * 3)
      h.nearN = new Float32Array(men * 3)
      h.restM = new Float32Array(men * 16)
      h.restS = new Float32Array(men * 3)
      h.restN = new Float32Array(men * 3)
      h.nearI = new Float32Array(men)
      h.restI = new Float32Array(men)
      const m = this.hostMesh(0, h.b, h.index)
      m.thinInstanceSetBuffer('matrix', h.nearM, 16, false)
      m.thinInstanceSetBuffer('aVAT', h.nearS, 3, false)
      m.thinInstanceSetBuffer('aNext', h.nearN, 3, false)
      m.thinInstanceSetBuffer('aMan', h.nearI, 1, false)
      m.doNotSyncBoundingInfo = true
      m.getBoundingInfo().reConstruct(h.lo, h.hi)
      h.lod[0] = m
      if (h.fading) this.fadingMeshes.add(m) // (made while its battalion fades: faded with the rest)
    }
    const l = h.lod[this.nextLod]
    const own = { m: h.matrices, s: h.settings, n: h.next, i: h.man }
    const buf = nextLodBuffers(on, own, { m: h.restM, s: h.restS, n: h.restN, i: h.restI })
    l.thinInstanceSetBuffer('matrix', buf.m, 16, false)
    l.thinInstanceSetBuffer('aVAT', buf.s, 3, false)
    l.thinInstanceSetBuffer('aNext', buf.n, 3, false)
    l.thinInstanceSetBuffer('aMan', buf.i, 1, !on)
    h.lod[0].setEnabled(on && this.shown)
    if (on) {
      h.sel.fill(0)
      h.resplit = true
    }
    h.stale[this.nextLod] = h.staleSet[this.nextLod] = h.staleNext[this.nextLod] = true
  }

  // Each man of a split battalion at the nearest LOD while he is in the view (his sphere inside the camera's planes)
  // and tall on screen (nearestPx, ±10 %: a man at the switch does not flicker), else at the next; the two lists
  // written again when a man changes LOD or the men were placed. Whether a man changed LOD
  private share(h: Host, cam: Vector3, pxPerM: number): boolean {
    const m = h.matrices
    const s = h.settings
    const n = h.next
    const sel = h.sel
    const on = this.nearestPx * 1.1
    const off = this.nearestPx * 0.9
    const k = FIGURE * pxPerM
    let changed = false
    for (let i = 0; i < sel.length; i++) {
      const o = i * 16
      const x = m[o + 12]
      const y = m[o + 13] + FIGURE / 2
      const z = m[o + 14]
      let want = k / Math.max(1, Math.hypot(cam.x - x, cam.y - y, cam.z - z)) >= (sel[i] ? off : on) ? 1 : 0
      if (want) {
        for (const p of this.camPlanes) {
          if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.d <= -MAN_R) {
            want = 0
            break
          }
        }
      }
      if (want !== sel[i]) {
        sel[i] = want
        changed = true
      }
    }
    if (!changed && !h.resplit) return false
    h.resplit = false
    const [a, b] = splitLists(
      sel,
      { m, s, n },
      { m: h.nearM, s: h.nearS, n: h.nearN, i: h.nearI },
      { m: h.restM, s: h.restS, n: h.restN, i: h.restI },
    )
    h.lod[0].thinInstanceCount = a
    h.lod[this.nextLod].thinInstanceCount = b
    h.stale[0] =
      h.staleSet[0] =
      h.staleNext[0] =
      h.stale[this.nextLod] =
      h.staleSet[this.nextLod] =
      h.staleNext[this.nextLod] =
        true
    return changed
  }

  // a thin-instance buffer sent to the GPU (n floats), counted for the bench's trace
  private upload(m: Mesh, kind: string, n: number): void {
    if (!TRACE.on) {
      m.thinInstanceBufferUpdated(kind)
      return
    }
    const t = performance.now()
    m.thinInstanceBufferUpdated(kind)
    TRACE.c[TR.tiUploads]++
    TRACE.c[TR.tiKB] += (n * 4) / 1024
    TRACE.c[TR.tiMs] += performance.now() - t
  }
  private frame(): void {
    const t0 = trNow()
    this.frameBody()
    if (TRACE.on) tr(TR.unitsMs, performance.now() - t0)
  }
  /** The simple shadows' share of the figures' shadow this frame (0: the map alone, 1: the simple shadows alone; 0
   *  without them), kept in far and given to the map's receivers: 1 at every zoom by default (decision 0062), else by
   *  the camera's distance to its focus over band (decision 0049's cross-fade) */
  private decalShare(decals: boolean): number {
    const f = decals ? (this.simpleClose ? 1 : farShare(this.camera.radius, this.band)) : 0
    if (f !== this.far) {
      this.far = f
      if (this.shadowRT) for (const m of this.receivers) m.setFloat('uUnitFar', f)
    }
    return f
  }
  /** The simple shadows' look this frame (decision 0062), written into lookNow and returned: the close look turned
   *  into the far one over lookBand by the camera's distance to its focus; the far one alone with the map
   *  (?ushadowclose=map, ?ushadowfar=map) */
  private lookAt(): ShadowLook {
    this.lookT = this.simpleClose && this.simpleFar ? farShare(this.camera.radius, this.lookBand) : 1
    return lookBetween(this.look.close, this.look.far, this.lookT, this.lookNow)
  }
  private frameBody(): void {
    const T = this.clock()
    const fps = this.data.fps
    const step = Math.floor(T * fps)
    // the share of the step gone, in double precision as the step: the places between two steps (aNext)
    this.stepFrac = T * fps - step
    const decals = this.shadows && this.simpleFar && this.decal !== null
    const f = this.decalShare(decals)
    const mapOn = this.shadows && f < 1 && this.shadowRT !== null
    const decalOn = decals && f > 0
    const ln = this.lookAt()
    this.contactAt()
    this.useDecalFor()
    // (back from the simple shadows alone: fitted and drawn afresh)
    if (mapOn && !this.mapOn) {
      this.smBox.set = false
      this.smStep = -1
      this.smEmpty = false
    }
    if (this.shadowRT) this.target(this.shadowRT, mapOn)
    this.mapOn = mapOn
    if (mapOn || this.trampleOn) this.castView() // (only the sun's box and the trodden mask read it)
    // the clock's step, counted here in double precision (the same floor the men's phases and the shadow map's redraws
    // use), not by the shader from a float32 time: the figures and their shadows never disagree on a step
    for (const m of this.mats.values()) m.setFloat('uVATStep', step)
    for (const m of this.farMats.values()) m.setFloat('uVATStep', step)
    for (const m of this.tinyMats.values()) m.setFloat('uVATStep', step)
    this.depthMat.setFloat('uVATStep', step)
    this.depthVatMat.setFloat('uVATStep', step)
    this.depthProxyMat.setFloat('uVATStep', step)
    if (this.decal === this.decalNear) this.decal?.setFloat('uVATStep', step)
    // (stepped with the figures under ?smoothmove=0)
    if (decalOn) {
      this.decal?.setFloat('uStepFrac', this.smooth ? this.stepFrac : 0)
      this.decal?.setFloat('uUnitFar', f)
      this.setDecalLook(ln)
    }
    if (this.smooth) {
      for (const m of [
        ...this.mats.values(),
        ...this.farMats.values(),
        ...this.tinyMats.values(),
        this.depthMat,
        this.depthVatMat,
        this.depthProxyMat,
      ]) {
        m.setFloat('uStepFrac', this.stepFrac)
      }
      this.flagMat?.setFloat('uStepFrac', this.stepFrac)
    }
    const cam = this.camera
    const engine = this.scene.getEngine()
    // pixels per metre at unit distance, from the projection itself
    const pxPerM = (cam.getProjectionMatrix().m[5] * engine.getRenderHeight()) / 2
    const camPos = cam.globalPosition
    this.farK.set(FIGURE * pxPerM, this.lodPx)
    this.nearBand[0] = this.lodPx * NEAR_FADE[0]
    this.nearBand[1] = this.lodPx * NEAR_FADE[1]
    this.tinyBandV[0] = this.tinyPx * TINY_FADE[0]
    this.tinyBandV[1] = this.tinyPx * TINY_FADE[1]
    const tinyBand = this.tinyLod >= 0 ? this.tinyBandV : null
    this.bandV.set(this.nearBand[0], this.nearBand[1], tinyBand ? tinyBand[0] : 0, tinyBand ? tinyBand[1] : 0)
    for (const map of [this.mats, this.farMats, this.tinyMats]) {
      for (const m of map.values()) {
        m.setVector2('uFarK', this.farK)
        m.setVector4('uLodBand', this.bandV)
      }
    }
    let moved = step !== this.smStep // (the map changes with the poses' step, the men's places, the casters' LOD)
    let anyMoved = false // (a battalion's men written this frame: the trodden ground follows)
    // the camera's planes, once a frame: the nearest LOD's tests and the shadow casters' cull (cull) read them
    if ((this.hasNearest && this.nearestPx > 0) || (mapOn && this.tightCull)) {
      Frustum.GetPlanesToRef(cam.getTransformationMatrix(), this.camPlanes)
    }
    const hold = this.holdFire ? fireStart(this.drill, this.speed.march, this.speed.run) : null
    for (const h of this.hosts) {
      if (!this.shown) continue
      // (a reserve stands in column whatever the hold)
      const { cycle, local } = scriptClock(T, h.b.offset, h.b.reserve ? null : hold, this.clockAt)
      const cycleStart = T - local
      const p = h.b.reserve ? RESERVE.phase : phaseAt(this.drill, local, this.speed.march, this.speed.run).phase
      // a battalion's men are written when they move (a marching or deploying one once a step), else once a phase
      const moving = p === 'column' || p === 'deploy'
      if (h.step < 0 || h.cycle !== cycle || h.phase !== p || (moving && step !== h.step)) {
        const tp = trNow()
        this.place(
          h,
          local,
          cycleStart,
          moving,
          this.stepFrac / fps,
          moving && h.moving && h.step === step - 1 && h.cycle === cycle && h.phase === p,
        )
        h.step = step
        h.phase = p
        h.cycle = cycle
        moved = true
        anyMoved = true
        if (TRACE.on) {
          tr(TR.placed)
          tr(TR.placeMs, performance.now() - tp)
        }
      }
      h.moving = moving
      const px =
        (FIGURE * pxPerM) / Math.max(1, Math.hypot(camPos.x - h.cx, camPos.y - groundAt(h.cx, h.cz), camPos.z - h.cz))
      // the nearest LOD: looked at only when the battalion's nearest point (its bounds) is within 90 % of its switch
      // and its bounds are in the view
      let split = false
      if (this.hasNearest && this.nearestPx > 0) {
        const lo = h.lo
        const hi = h.hi
        const dx = Math.max(lo.x - camPos.x, 0, camPos.x - hi.x)
        const dy = Math.max(lo.y - camPos.y, 0, camPos.y - hi.y)
        const dz = Math.max(lo.z - camPos.z, 0, camPos.z - hi.z)
        split = (FIGURE * pxPerM) / Math.max(1, Math.hypot(dx, dy, dz)) >= this.nearestPx * (h.split ? 0.8 : 0.9)
        if (split) split = !boxOutside(this.camPlanes, lo.x, lo.y, lo.z, hi.x, hi.y, hi.z)
      }
      const d = this.drawsAt(h, px, split, camPos, FIGURE * pxPerM, tinyBand)
      const near = d.near
      if (near !== h.near && this.casterNear) moved = true
      if (split !== h.split) {
        this.setSplit(h, split)
        if (this.casterNear) moved = true
      }
      if (split && this.share(h, camPos, pxPerM) && this.casterNear) moved = true
      const tiny = d.tiny
      h.near = near
      h.tiny = tiny
      h.lod[this.nextLod].isVisible = near && (!split || h.lod[this.nextLod].thinInstanceCount > 0)
      h.lod[this.farLod].isVisible = d.far
      h.lod[this.decalLod].isVisible = decalOn
      if (this.tinyLod >= 0) h.lod[this.tinyLod].isVisible = tiny
      if (h.sel.length) h.lod[0].isVisible = split && h.lod[0].thinInstanceCount > 0 // (made at the first split)
      this.setFading(h, this.fade && lodCount(d) > 1)
      // the LODs drawn, the one that casts for the battalion, the simple shadows while they show; a hidden one is
      // updated when drawn again
      const kc = this.casterOf(h)
      for (let k = 0; k < h.lod.length; k++) {
        const drawn =
          (k === this.nextLod && near) ||
          (split && k === 0) ||
          (k === this.farLod && d.far) ||
          (k === this.tinyLod && tiny)
        if (
          !drawn &&
          !(mapOn && (k === kc || (split && k === 0 && kc === this.nextLod))) &&
          !(decalOn && k === this.decalLod)
        ) {
          continue
        }
        if (h.stale[k]) {
          this.upload(h.lod[k], 'matrix', h.matrices.length)
          h.stale[k] = false
        }
        if (h.staleSet[k]) {
          this.upload(h.lod[k], 'aVAT', h.settings.length)
          // (a split battalion's lists: their men's indices with their clips)
          if (split && (k === 0 || k === this.nextLod)) this.upload(h.lod[k], 'aMan', h.man.length)
          h.staleSet[k] = false
        }
        if (h.staleNext[k] && (k === this.decalLod || this.smooth)) {
          this.upload(h.lod[k], 'aNext', h.next.length)
          h.staleNext[k] = false
        }
      }
    }
    if (this.trampleOn) this.trample(T, anyMoved)
    if (this.flag?.isEnabled()) {
      this.flagMat?.setFloat('uFlagT', T)
      this.flagMat?.setVector2('uFlagK', this.flagK.set(pxPerM, FLAG_MIN_PX))
      if (this.flagStale) {
        this.upload(this.flag, 'matrix', this.flagM?.length ?? 0)
        if (this.smooth) this.upload(this.flag, 'aNext', this.flagN?.length ?? 0)
        this.flagStale = false
        tr(TR.flag)
      }
    }
    if (decalOn) this.decal?.setVector2('uFarK', this.farK)
    if (!mapOn) return
    const refit = this.fitSun()
    if (refit) tr(TR.sunRefit)
    if (!this.lazyShadows) return
    // smooth (?smoothmove=1): the casters move every frame while their men do, so the map is drawn every frame then
    if (this.smooth && this.culledMoving && T !== this.smT) moved = true
    // (no casters: an empty map is clear for any box; drawn once, then kept until a caster comes into it)
    if (moved || refit) {
      if (!(this.culled.length === 0 && this.smEmpty)) {
        this.shadowRT?.resetRefreshCounter()
        this.smEmpty = this.culled.length === 0
      }
      this.smStep = step
      this.smT = T
    }
  }

  // a render target drawn this frame or not (the scene's list of them)
  private target(rt: RenderTargetTexture, on: boolean): void {
    const list = this.scene.customRenderTargets
    const i = list.indexOf(rt)
    if (on && i < 0) list.push(rt)
    if (!on && i >= 0) list.splice(i, 1)
  }

  // the shadow map's target: depth only, a 24-bit depth texture with a comparison sampler, read by the hardware's
  // bilinear compare (batch B)
  private makeRT(): RenderTargetTexture {
    const rt = new RenderTargetTexture('unitSMDepth', { width: SM_SIZE, height: SM_SIZE }, this.scene, {
      generateMipMaps: false,
      generateDepthBuffer: true,
      noColorAttachment: true,
    })
    rt.createDepthStencilTexture(Constants.LEQUAL, true, false, 1, Constants.TEXTUREFORMAT_DEPTH24)
    rt.activeCamera = this.sun
    rt.clearColor = new Color4(1, 1, 1, 1)
    rt.renderList = this.meshes
    rt.getCustomRenderList = () => this.culled
    // a far LOD caster of a battalion drawn near is hidden from the view: shown to the map alone, while it draws
    const shown: Mesh[] = []
    rt.onBeforeRenderObservable.add(() => {
      this.smDraws++
      for (const m of this.culled) {
        if (!m.isVisible) {
          m.isVisible = true
          shown.push(m)
        }
      }
      if (TRACE.on) {
        tr(TR.sm)
        tr(TR.smCasters, this.culled.length)
        for (const m of this.culled) tr(TR.smTris, (m.thinInstanceCount * m.getTotalIndices()) / 3)
      }
    })
    rt.onAfterRenderObservable.add(() => {
      for (const m of shown) m.isVisible = false
      shown.length = 0
    })
    for (const h of this.hosts) {
      h.lod.forEach((l, li) =>
        rt.setMaterialForRendering(
          l,
          li === this.proxyLod
            ? this.depthProxyMat
            : li === this.farLod && this.posed
              ? this.depthVatMat
              : this.depthMat,
        ),
      )
    }
    return rt
  }

  // The sun's orthographic box around the ground in view: where the view's corner rays meet the ground in view's own
  // range of heights (viewGround: the tile's 25 m seen along a low sun stretched it), padded for a figure's height and
  // centred on what it holds, so the map's texels go where the camera looks. Its centre snaps to whole texels along the
  // sun's fixed view axes and its size moves in SM_STEP_FINE steps, so the texel grid stays put under still figures.
  // Lazy (lazyShadows), it is held while the view stays inside it (its slack: SM_HOLD_SHARE of its size, holdShare) and
  // it is at most SM_COARSE times the size the view needs, so a pan draws no new map until it leaves it. Returns
  // whether the map's view or casters changed
  private fitSun(): boolean {
    const cam = this.camera
    const k = this.scratch
    const g = this.viewGround()
    const R = this.rays
    let n = 0
    k.pts[n++].copyFrom(cam.target)
    for (let j = 0; j < 4; j++) {
      const o = j * 6
      for (let e = 0; e < 2; e++) {
        // (a plane above the eye, the closest zooms over a hill: the ray never meets it ahead, so the eye's own point)
        const gy = e ? g.hi : g.lo
        const r = R[o + 4] < -1e-3 ? Math.max(0, Math.min((gy - R[o + 1]) / R[o + 4], SM_REACH)) : SM_REACH
        k.pts[n++].set(R[o] + R[o + 3] * r, R[o + 1] + R[o + 4] * r, R[o + 2] + R[o + 5] * r)
      }
    }
    k.c.setAll(0)
    for (let i = 0; i < n; i++) k.c.addInPlace(k.pts[i])
    k.c.scaleInPlace(1 / n)
    // before the view's first frame its matrix does not invert: a NaN set on the sun stayed there for good (the map
    // drew nothing: the first armies' build cast no shadow). Fitted from the next frame instead
    if (!(Number.isFinite(k.c.x) && Number.isFinite(k.c.y) && Number.isFinite(k.c.z))) return false
    this.sun.position.copyFrom(k.c).addInPlace(SUN.scale(500))
    this.sun.setTarget(k.c)
    this.sun.computeWorldMatrix()
    let V = this.sun.getViewMatrix(true)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = 0; i < n; i++) {
      for (let e = 0; e < 2; e++) {
        k.v.copyFrom(k.pts[i])
        k.v.y += e ? 3 : -2
        Vector3.TransformCoordinatesToRef(k.v, V, k.v)
        x0 = Math.min(x0, k.v.x)
        x1 = Math.max(x1, k.v.x)
        y0 = Math.min(y0, k.v.y)
        y1 = Math.max(y1, k.v.y)
      }
    }
    // the centre moved to the middle of what the box holds (along the sun's view axes: the texel grid's snap follows)
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    const vm = V.m
    k.c.x += vm[0] * mx + vm[1] * my
    k.c.y += vm[4] * mx + vm[5] * my
    k.c.z += vm[8] * mx + vm[9] * my
    this.sun.position.copyFrom(k.c).addInPlace(SUN.scale(500))
    this.sun.setTarget(k.c)
    this.sun.computeWorldMatrix()
    V = this.sun.getViewMatrix(true)
    // the slack the box is held by (holdShare, the shadow fix): a share of its size, so a pan at the widest zoom refits
    // every SM_HOLD_SHARE of the view, not every frame; fixed (?smhold=fixed): none, held only within SM_HOLD of a
    // box fitted 2 m round the view (the batch B box, which a pan refit at nearly every frame)
    const slack = this.holdShare ? Math.max(SM_HOLD, (SM_HOLD_SHARE * Math.max(x1 - x0, y1 - y0)) / 2) : 0
    const ex = Math.ceil(((x1 - x0) / 2 + 2 + slack) / SM_STEP_FINE) * SM_STEP_FINE
    const ey = Math.ceil(((y1 - y0) / 2 + 2 + slack) / SM_STEP_FINE) * SM_STEP_FINE
    this.smBox.margin = this.holdShare ? 1 : SM_HOLD
    const box = this.smBox
    if (this.lazyShadows && box.set && box.ex <= ex * SM_COARSE && box.ey <= ey * SM_COARSE && this.covers(n)) {
      // held: the sun back on the held box's centre (it was moved to the view's above), the map's view unchanged
      this.sun.position.copyFrom(box.c).addInPlace(SUN.scale(500))
      this.sun.setTarget(box.c)
      this.sun.computeWorldMatrix()
      return this.cull()
    }
    const m = V.m
    const tx = (2 * ex) / SM_SIZE
    const ty = (2 * ey) / SM_SIZE
    const px = k.c.x * m[0] + k.c.y * m[4] + k.c.z * m[8]
    const py = k.c.x * m[1] + k.c.y * m[5] + k.c.z * m[9]
    const sx = Math.round(px / tx) * tx - px
    const sy = Math.round(py / ty) * ty - py
    k.c.x += m[0] * sx + m[1] * sy
    k.c.y += m[4] * sx + m[5] * sy
    k.c.z += m[8] * sx + m[9] * sy
    this.sun.position.copyFrom(k.c).addInPlace(SUN.scale(500))
    this.sun.setTarget(k.c)
    this.sun.computeWorldMatrix()
    V = this.sun.getViewMatrix(true)
    this.sun.orthoLeft = -ex
    this.sun.orthoRight = ex
    this.sun.orthoTop = ey
    this.sun.orthoBottom = -ey
    box.ex = ex
    box.ey = ey
    box.V.copyFrom(V)
    box.c.copyFrom(k.c)
    box.set = true
    // the sun's near and far planes fitted along the sun to what the box holds (24 bits over tens of metres, not
    // 1,200), a figure and some to spare either way
    let z0 = Infinity
    let z1 = -Infinity
    for (let i = 0; i < n; i++) {
      for (let e = 0; e < 2; e++) {
        k.v.copyFrom(k.pts[i])
        k.v.y += e ? 3 : -2
        Vector3.TransformCoordinatesToRef(k.v, V, k.v)
        z0 = Math.min(z0, k.v.z)
        z1 = Math.max(z1, k.v.z)
      }
    }
    this.sun.minZ = Math.max(0.5, Math.floor(z0 - 12))
    this.sun.maxZ = Math.ceil(z1 + 12)
    for (const r of this.receivers) r.setFloat('uUnitBias', SM_BIAS / (this.sun.maxZ - this.sun.minZ))
    const vp = k.vp
    V.multiplyToRef(this.sun.getProjectionMatrix(true), vp)
    for (const r of this.receivers) r.setMatrix('uUnitVP', vp)
    Frustum.GetPlanesToRef(vp, this.planes)
    let changed = false
    for (let i = 0; i < 16; i++) {
      if (vp.m[i] !== this.smVP[i]) {
        changed = true
        this.smVP[i] = vp.m[i]
      }
    }
    return this.cull() || changed
  }

  // The view's corner rays (origin and direction, rays) and where they meet the ground at the focus's height (quad):
  // once a frame, shared by the sun's box (fitSun, viewGround) and the trodden mask's (trample)
  private castView(): void {
    const cam = this.camera
    const k = this.scratch
    const inv = k.inv
    const y0 = groundAt(cam.target.x, cam.target.z)
    const R = this.rays
    const q = this.quad
    cam.getTransformationMatrix().invertToRef(inv)
    for (let j = 0; j < 4; j++) {
      Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 0, inv, k.a)
      Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 1, inv, k.b)
      k.b.subtractToRef(k.a, k.d).normalize()
      // (the focus's ground above the eye, looking up a slope at the closest zooms: a plane the clearance under the eye
      // instead, so the quad stays ahead of the camera, not collapsed to it or behind it)
      const yp = Math.min(y0, k.a.y - D.spec.camera.clearance)
      const o = j * 6
      const r = k.d.y < -1e-3 ? Math.max(0, Math.min((yp - k.a.y) / k.d.y, SM_REACH)) : SM_REACH
      R[o] = k.a.x
      R[o + 1] = k.a.y
      R[o + 2] = k.a.z
      R[o + 3] = k.d.x
      R[o + 4] = k.d.y
      R[o + 5] = k.d.z
      q[j * 2] = k.a.x + k.d.x * r
      q[j * 2 + 1] = k.a.z + k.d.z * r
    }
  }

  // the ground's range of heights in view: sampled on a 5 x 5 grid over where the corner rays meet the ground at the
  // focus's height (castView's quad), a metre to spare (the casters' own height is padded in fitSun)
  private viewGround(): { lo: number; hi: number } {
    const q = this.quad
    let lo = Infinity
    let hi = -Infinity
    for (let u = 0; u <= 4; u++) {
      for (let v = 0; v <= 4; v++) {
        const a = u / 4
        const b = v / 4
        const w0 = (1 - a) * (1 - b)
        const w1 = a * (1 - b)
        const w2 = a * b
        const w3 = (1 - a) * b
        const h = groundAt(w0 * q[0] + w1 * q[2] + w2 * q[4] + w3 * q[6], w0 * q[1] + w1 * q[3] + w2 * q[5] + w3 * q[7])
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
    }
    return { lo: lo - 1, hi: hi + 1 }
  }

  // the held box covers the view's points (fitSun's, the figures' height above them) with its margin to spare
  private covers(n: number): boolean {
    const k = this.scratch
    const b = this.smBox
    for (let i = 0; i < n; i++) {
      for (let e = 0; e < 2; e++) {
        k.v.copyFrom(k.pts[i])
        k.v.y += e ? 3 : -2
        Vector3.TransformCoordinatesToRef(k.v, b.V, k.v)
        if (Math.abs(k.v.x) > b.ex - b.margin || Math.abs(k.v.y) > b.ey - b.margin) return false
      }
    }
    return true
  }

  // only the battalions inside the sun's box are drawn into the map (a render target does not cull its
  // list), each at the caster's LOD; tight (?ucull), only those whose shadow can reach the view
  // (shadowInView). Whether the list changed
  private cull(): boolean {
    const was = this.smList
    was.length = 0
    for (const m of this.culled) was.push(m)
    this.culled.length = 0
    this.culledMoving = false
    // (the camera's planes: frameBody's, this frame's)
    for (const h of this.hosts) {
      const l = h.lod[this.casterOf(h)]
      if (!this.shown || !l.isInFrustum(this.planes)) continue
      if (this.tightCull && !this.shadowInView(h)) continue
      // (a split battalion's lists may be empty: a mesh of no instances would draw its one figure at the origin)
      if (l.thinInstanceCount > 0) this.culled.push(l)
      if (h.split && l === h.lod[this.nextLod] && h.lod[0].thinInstanceCount > 0) this.culled.push(h.lod[0])
      if (h.moving) this.culledMoving = true
    }
    return was.length !== this.culled.length || was.some((m, i) => m !== this.culled[i])
  }

  // whether a battalion's shadow can reach the view: its bounds stretched away from the sun by the longest shadow (a
  // figure's height, top, down to the ground) cross the camera's frustum (camPlanes, set by the caller)
  private shadowInView(h: Host): boolean {
    const k = this.scratch
    shadowBox(h, SHADOW_H, k.a, k.b)
    return !boxOutside(this.camPlanes, k.a.x, k.a.y, k.a.z, k.b.x, k.b.y, k.b.z)
  }

  /** The simple shadows' shape (its two bakes, decision 0062) and material, made once when first asked for (decision
   *  0049; unitdecal.*). Each covered sample is darkened once whatever overlaps it: alpha to coverage gives the shape's
   *  soft edge as samples, the stencil lets only the first shadow at a sample through (it marks it), and the blend is
   *  dst · src with the alpha kept (the lens codes): (ZERO, SRC_COLOR) and (ZERO, ONE), set at each bind over the mode
   *  it is drawn with, then put back */
  private useDecals(): void {
    if (this.decal) return
    const shade = this.shade
    if (!shade) {
      throw new Error("units: the simple shadows need the ground's shade (Units.shade, src/look/bakes.ts unitShade)")
    }
    const d = this.data
    let ss = this.stepShadow
    // today's shape (averaged over each clip) for the far material; with ?ushstep a second, per step, for the near one
    // (within the per-step band, stepBand: decision 0074). shapeMs: the bakes alone (shadowShape), as main timed it
    let bakeMs = 0
    const bake = (steps: number, facings: number) => {
      const tb = performance.now()
      const shape = shadowShape(d, d.lods[this.farLod].name, [SUN.x, SUN.y, SUN.z], ROLES, {
        facings,
        soft: SOFT_BLUR,
        posed: this.posedFar,
        steps,
        maxSize: Math.min(4096, this.scene.getEngine().getCaps().maxTextureSize),
      })
      bakeMs += performance.now() - tb
      const tex = new RawTexture(
        shape.data,
        shape.width,
        shape.height,
        Constants.TEXTUREFORMAT_RG,
        this.scene,
        true,
        false,
        Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      )
      tex.name = steps > 0 ? 'figureShadowShapeSteps' : 'figureShadowShape'
      tex.wrapU = tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
      return { shape, tex }
    }
    const farBake = bake(0, SHAPE_FACINGS)
    let nearBake: ReturnType<typeof bake> | null = null
    try {
      nearBake = ss ? bake(ss.steps, ss.facings) : null
    } catch (e) {
      // (a per-step atlas over this GPU's texture size: the averaged shape at every zoom, today's look, unless the
      // page asked for it by ?ushstep)
      if (!(e instanceof AtlasTooLarge) || this.stepExplicit) {
        farBake.tex.dispose()
        throw e
      }
      console.warn(`units: ${e.message}: the soldiers' shadows fall back to the clip-averaged shape`)
      ss = this.stepShadow = null
      this.stepFallback = true
    }
    this.shapeMs = bakeMs
    // the ground's height under each vertex: the meadow map's (bound to every painted material, src/look/meadow.ts), or
    // without one the heightfield's, sampled here over the tile (GROUND_N² texels)
    let ht: RawTexture | null = null
    if (!this.groundMap) {
      const n = GROUND_N
      const w = D.spec.tile
      const hd = new Float32Array(n * n)
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) hd[j * n + i] = groundAt(((i + 0.5) / n) * w - w / 2, ((j + 0.5) / n) * w - w / 2)
      }
      ht = new RawTexture(
        hd,
        n,
        n,
        Constants.TEXTUREFORMAT_R,
        this.scene,
        false,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_FLOAT,
      )
      ht.name = 'figureShadowGround'
      ht.wrapU = ht.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    }
    const make = (oval: boolean, steps: boolean): ShaderMaterial => {
      const { shape, tex } = steps && nearBake ? nearBake : farBake
      const name = `unitShadow2D${oval ? 'Contact' : ''}${steps ? 'Steps' : ''}`
      const m = this.mats0.make(name, DECAL_VS, DECAL_FS, {
        attributes: ['position', 'aVAT', 'aNext'],
        uniforms: [
          'uRoleStart',
          'uShapeAt',
          'uShapeCell',
          'uShapeTexel',
          'uShapeSize',
          'uShDir',
          'uStepFrac',
          'uFarK',
          'uFarScale',
          'uDecalLift',
          'uShSoft',
          'uShGain',
          'uShLen',
          'uShFoot',
          'uStrip',
          'uRows',
          'uShContact',
          'uVATStep',
          'uStepBins',
          'uStepRow',
          'uStepRPB',
          'uShFootK',
        ],
        samplers: ['uShapeTex', 'uUnitShade', 'uContactTex'],
        alpha: true,
        defines: [
          `#define FACINGS ${shape.facings.toFixed(1)}`,
          ...(steps && ss ? ['#define SH_STEPS', ...(ss.blend ? ['#define SH_STEP_BLEND'] : [])] : []),
          `#define DECAL_ALONG ${DECAL_ALONG.toFixed(1)}`,
          `#define LIFT_RAMP ${LIFT_RAMP.toFixed(2)}`,
          `#define SHAPE_MIPS ${SHAPE_MIPS.toFixed(1)}`,
          ...(this.coverage ? ['#define COVERAGE'] : []),
          ...(this.farScaleOn ? ['#define FAR_SCALE'] : []),
          ...(this.fade ? [FADE_ON[1]] : []),
          ...(oval
            ? [
                '#define SH_CONTACT',
                `#define CONTACT_ROWS ${d.vat.height.toFixed(1)}`,
                `#define CONTACT_FLOOR ${CONTACT_FLOOR.toFixed(3)}`,
              ]
            : []),
        ],
      })
      if (this.contact) this.useContact(m, this.contact, oval)
      m.backFaceCulling = false
      m.disableDepthWrite = true
      m.setTexture('uShapeTex', tex)
      m.setTexture('uUnitShade', shade)
      if (ht) m.setTexture('uMeadow', ht)
      m.setVector4('uRoleStart', new Vector4(...ROLES.map(r => d.ranges[r].start)))
      // the atlas's anchor: where a cell's first texel lies from a man's root (m; the strip moves, this does not)
      m.setVector2('uShapeAt', new Vector2(shape.across[0], shape.along[0]))
      m.setVector4('uShapeCell', new Vector4(shape.cellW, shape.cellH, 1 / shape.width, 1 / shape.height))
      m.setVector2('uShapeSize', new Vector2(shape.width, shape.height))
      m.setVector2('uShapeTexel', new Vector2(1 / shape.texel, shape.margin))
      m.setVector2('uShDir', new Vector2(...shape.dir))
      if (steps && ss) {
        m.setVector4('uStepBins', new Vector4(...shape.bins))
        m.setVector4('uStepRow', new Vector4(...shape.binRow))
        m.setFloat('uStepRPB', shape.rowsPerBlock)
        m.setFloat('uVATStep', 0)
        m.setVector2('uShFootK', new Vector2(...this.footSharp))
      }
      this.shapeBoxes.set(m, { base: shape.base, full: { across: shape.across, along: shape.along } })
      // (the soft bake's reach past the shape's own, on the decal's bounds: place)
      this.softPad = Math.max(this.softPad, shape.base.across[0] - shape.across[0])
      m.setFloat('uStepFrac', 0)
      m.setVector2('uFarScale', this.farScaleV)
      m.setFloat('uDecalLift', this.lift)
      // (a mode nothing else draws with: its blend is replaced at each bind, below)
      m.alphaMode = Constants.ALPHA_EXCLUSION
      const st = m.stencil
      st.enabled = true
      st.func = Constants.NOTEQUAL
      st.funcRef = 1
      st.funcMask = 0xff
      st.mask = 0xff
      st.opStencilFail = Constants.KEEP
      st.opDepthFail = Constants.KEEP
      st.opStencilDepthPass = Constants.REPLACE
      const engine = this.scene.getEngine() as ThinEngine
      const a2c = this.coverage
      m.onBindObservable.add(() => {
        engine.alphaState.setAlphaBlendFunctionParameters(GL_ZERO, GL_SRC_COLOR, GL_ZERO, GL_ONE, 0)
        if (a2c) engine.setAlphaToCoverage(true)
      })
      if (a2c) m.onUnBindObservable.add(() => engine.setAlphaToCoverage(false))
      return m
    }
    // within the contact's zoom band the material with the oval; past it, and without a contact, decision 0062's own
    // (no oval's read, varying or cell test: main's cost). The one not drawn is compiled in the background
    // (useDecalFor), so the switch at the band's edge never waits on a shader
    // (with ?ushstep the near material reads the per-step shape, with the oval or without)
    const c = this.contact
    const oval = c !== null && c.dark > 0
    const far = make(false, false)
    const near = oval || ss ? make(oval, nearBake !== null) : null
    this.decalFar = far
    this.decalNear = near
    this.decal = near ?? far
    this.decalPoll = decalDefinesChanged()
    this.setDecalLook(this.lookNow)
    for (const h of this.hosts) h.lod[this.decalLod].material = this.decal
  }
  /** a battalion's simple-shadow mesh (its thin instances: the defines its material compiles with), or null with no
   *  battalion yet */
  private decalMesh(): Mesh | null {
    return this.hosts[0]?.lod[this.decalLod] ?? null
  }
  /** The decal's material by the contact's weight this frame: with the oval within its band, without past it (no
   *  oval's read, varying or texture: decision 0062's). Switched only when it changes, once the one wanted is compiled
   *  (the one not drawn is compiled in the background here); the look is given to it afresh (setDecalLook) */
  private useDecalFor(): void {
    const near = this.decalNear
    const far = this.decalFar
    const mesh = this.decalMesh()
    if (!near || !far || !mesh) return
    // (the one not drawn compiled in the background until ready, after every change of the defines and every switch:
    // never a hitch at the band's edge; the switch itself waits for the wanted one: a material not ready draws
    // nothing; decalStep)
    const mat = (side: DecalSide) => (side === 'near' ? near : far)
    const step = decalStep(
      nearOn(this.contact, this.stepShadow !== null, this.nearW) ? 'near' : 'far',
      this.decal === near ? 'near' : 'far',
      this.decalPoll,
      side => mat(side).isReady(mesh, true),
      IDLE_POLLS,
    )
    this.decalPoll = step.poll
    // (a shader that never compiles: stop asking, say so once, and stay on the one drawn)
    if (step.gaveUp) console.warn(`units: the simple shadows' other material not ready after ${IDLE_POLLS} frames`)
    if (!step.switchTo) return
    const m = mat(step.switchTo)
    this.decal = m
    for (const h of this.hosts) h.lod[this.decalLod].material = m
    this.lookSet.soft = NaN
  }

  /** The contact shadow's ovals (contactOvals, a texel a baked step) and its uniform on the shadows' material m, and
   *  how far it reaches from a man's root (the strip grown to hold it: decalStrip) */
  private useContact(m: ShaderMaterial, c: ShadowContact, oval: boolean): void {
    m.setVector4('uShContact', new Vector4(c.pad, 0, c.soft, 0))
    if (!oval) return
    const pv = this.posedFar ?? posedVertices(this.data, this.data.lods[this.farLod].name)
    const ov = contactOvals(this.data, pv, c.mode)
    const rows = ov.length / 4
    const tex = new RawTexture(
      ov,
      rows,
      1,
      Constants.TEXTUREFORMAT_RGBA,
      this.scene,
      false,
      false,
      Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    )
    tex.name = 'figureContactOvals'
    tex.wrapU = tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    m.setTexture('uContactTex', tex)
    m.setFloat('uVATStep', 0)
    this.contactReach = c.dark > 0 ? contactReachOf(ov, c.pad, c.soft) : 0
  }
  /** The contact oval's weight by the camera's distance (ovalWeight), kept for setDecalLook, and the near
   *  material's (nearWeight), for useDecalFor */
  private contactAt(): void {
    const r = this.camera.radius
    this.contactW = ovalWeight(this.contact, r)
    this.nearW = nearWeight(this.contact, this.stepShadow !== null, r, this.stepBand)
  }

  /** the figures' cast shadows on or off: off, the receivers compile without them (the bench's baseline arm). On, the
   *  simple shadows at every zoom (decision 0062); with ?ushadowclose=map the map up close and the simple shadows
   *  beyond (decision 0049); with ?ushadowfar=map the map at every zoom (frame() draws each while it shows). The map,
   *  its target and its receivers' reads exist only when one of those asks for it (useMap) */
  setShadows(on: boolean): void {
    if (on === this.shadows) return
    this.shadows = on
    const map = on && (!this.simpleFar || !this.simpleClose)
    if (map) this.useMap()
    if (!on && this.shadowRT) {
      this.target(this.shadowRT, false)
      this.mapOn = false
    }
    // (fitted by the next frame)
    if (on) {
      this.smBox.set = false
      this.smStep = -1
      this.smEmpty = false
    }
    if (on && this.simpleFar) this.useDecals()
    this.far = 0
    for (const m of this.receivers) {
      m.setDefine('#define UNIT_SHADOWS', map)
      if (this.shadowRT) m.setFloat('uUnitFar', 0)
    }
    for (const m of this.rootReceivers) m.setDefine('#define UNIT_SHADOWS_VS', map)
  }
  /** The simple shadows' look (decision 0062) given to their material when it changed: the soft bake's share at the
   *  tip, the gain (uShGain), the length, the gradient from the soles (uShFoot, footUniform) and the strip by the far
   *  look's share (uStrip, uRows: decalStrip) */
  private setDecalLook(l: ShadowLook): void {
    const m = this.decal
    const b = m && this.shapeBoxes.get(m)
    const p = this.lookSet
    const same =
      l.soft === p.soft &&
      l.dark === p.dark &&
      l.foot === p.foot &&
      l.core === p.core &&
      l.len === p.len &&
      l.gain === p.gain
    if (!m || !b || (same && this.lookT === this.lookTSet && this.contactW === this.contactWSet)) return
    Object.assign(p, l)
    this.lookTSet = this.lookT
    this.contactWSet = this.contactW
    // (the contact's darkness by its weight, and its reach on the strip only while the material with the oval draws)
    const u = contactUniform(this.contact, this.contactW, this.contactReach, m === this.decalNear)
    if (u.uniform) m.setVector4('uShContact', this.contactV.set(...u.uniform))
    m.setFloat('uShSoft', l.soft)
    m.setFloat('uShGain', l.gain)
    m.setFloat('uShLen', l.len)
    m.setVector4('uShFoot', this.footV.set(...footUniform(l, SHADOW_TIP)))
    const strip = decalStrip(b.base, b.full, this.lookT, l.len, LIFT_RAMP, u.reach)
    m.setVector4('uStrip', this.stripV.set(...strip.box))
    m.setVector4('uRows', this.rowsV.set(...strip.rows))
  }
  /** The figures' shadow map (decision 0047), made when a switch first asks for it (decision 0062): its target, lazy
   *  unless lazyShadows is off, and the receivers' bindings of it */
  private useMap(): void {
    if (this.shadowRT) return
    const rt = (this.shadowRT = this.makeRT())
    // lazy: drawn once, then again only when frame() resets it (a still view between two steps draws nothing)
    rt.refreshRate = this.lazyShadows ? 0 : 1
    const smTex = new BaseTexture(this.scene, rt.depthStencilTexture)
    smTex.name = 'unitSMDepthTex'
    for (const m of this.receivers) {
      m.setTexture('uUnitSM', smTex)
      m.setVector2('uUnitTexel', new Vector2(1 / SM_SIZE, 1 / SM_SIZE))
      m.setFloat('uUnitBias', SM_BIAS / (this.sun.maxZ - this.sun.minZ))
      m.setMatrix('uUnitVP', Matrix.Identity())
    }
  }
  /** the figures, their flags and the map's casters moved every frame between two steps (?smoothmove=1), or at the
   *  steps (the poses stay stepped at the bake's fps either way) */
  setSmooth(on: boolean): void {
    this.smooth = on
    for (const m of [
      ...this.mats.values(),
      ...this.farMats.values(),
      ...this.tinyMats.values(),
      this.depthMat,
      this.depthVatMat,
      this.depthProxyMat,
    ]) {
      m.setDefine('#define SMOOTH', on)
      m.setFloat('uStepFrac', 0)
    }
    this.flagMat?.setDefine('#define SMOOTH', on)
    for (const h of this.hosts) h.staleNext.fill(true)
    this.flagStale = true
    this.smStep = -1
  }

  /** the guard's masks (tools/guard.mjs --figures): 'off' painted; 'white', 'black' every figure flat; 'side' the
   *  uniforms side 0's battalions wear white, the others black; 'coat' white where a coat shows */
  setMask(mode: 'off' | 'white' | 'black' | 'side' | 'coat'): void {
    const first = new Set(this.hosts.filter(h => h.b.side === 0).map(h => h.b.uniform))
    const v = (id: string) =>
      mode === 'off' ? -1 : mode === 'white' ? 1 : mode === 'black' ? 0 : mode === 'coat' ? 2 : first.has(id) ? 1 : 0
    for (const map of [this.mats, this.farMats, this.tinyMats]) for (const [id, m] of map) m.setFloat('uMask', v(id))
  }
  /** each uniform's far LOD under its far rule (farRule: 'coat', the far palette and its lift; 'own', as near), or
   *  every uniform's forced (?farpal=0|1: the A/B) */
  setFarRule(force: boolean | null): void {
    for (const map of [this.farMats, this.tinyMats]) {
      for (const [id, m] of map) m.setDefine('#define FAR', force ?? farRule(this.uniforms[id]) === 'coat')
    }
  }
  /** The LOD cross-fade on (decision 0066: each man at his own LOD in a band round each switch) or off (?lodfade=0:
   *  the hard switch, a battalion wholly at one LOD by its centre's height on screen, ±10 %) */
  setLodFade(on: boolean): void {
    this.fade = on
    for (const map of [this.mats, this.farMats, this.tinyMats]) {
      for (const m of map.values()) {
        m.setDefine('#define LODFADE', on)
        m.setDefine('#define FAR_FROM', on ? FAR_FROM.toFixed(4) : false)
      }
    }
    // (their shadows grow with them)
    for (const m of [this.decalFar, this.decalNear]) m?.setDefine('#define FAR_FROM', on ? FAR_FROM.toFixed(4) : false)
    this.decalPoll = decalDefinesChanged()
  }
  /** A figure material's draws told whether their battalion fades each man (uLodFade, set as each mesh binds it: the
   *  material is shared by the battalions of a uniform; one drawing a single LOD draws every man, no per-man work) */
  private bindFade(m: ShaderMaterial): void {
    m.onBindObservable.add(mesh => m.getEffect()?.setFloat('uLodFade', this.fadingMeshes.has(mesh as Mesh) ? 1 : 0))
  }
  /** A battalion's figure meshes (the nearest's list, the near, far and tiny LODs) faded or not (fadingMeshes) */
  private setFading(h: Host, on: boolean): void {
    if (on === h.fading) return
    h.fading = on
    for (const k of [0, this.nextLod, this.farLod, this.tinyLod]) {
      // (none for the tiny LOD off; nor the nearest's place before its first split: the shared source mesh holds it)
      if (k < 0 || (k === 0 && this.hasNearest && h.sel.length === 0)) continue
      if (on) this.fadingMeshes.add(h.lod[k])
      else this.fadingMeshes.delete(h.lod[k])
    }
  }
  /** The LODs a battalion draws this frame (battalionLods, src/look/lod-fade.ts, into h.lods): by its bounds' heights
   *  on screen (k, a figure's height in pixels at 1 m) with the cross-fade, else by its centre's (px) */
  private drawsAt(h: Host, px: number, split: boolean, cam: Vector3, k: number, tiny: [number, number] | null): Lods {
    const [lo, hi] = boxPxRange(h.lo, h.hi, cam, k, this.pxRange)
    const at = this.at
    at.pLo = lo
    at.pHi = hi
    at.px = px
    at.split = split
    at.wasNear = h.near
    at.wasTiny = h.tiny
    const tinyPx = this.tinyLod >= 0 ? this.tinyPx : 0
    return battalionLods(at, this.fade, this.lodPx, tinyPx, this.nearBand, tiny, h.lods)
  }
  /** the far figures drawn larger as they shrink on screen (?farscale=0: their own size) */
  setFarScale(on: boolean): void {
    this.farScaleOn = on
    for (const m of [...this.farMats.values(), ...this.tinyMats.values()]) m.setDefine('#define FAR_SCALE', on)
    for (const m of [this.decalFar, this.decalNear]) m?.setDefine('#define FAR_SCALE', on) // (their simple shadows too)
    this.decalPoll = decalDefinesChanged()
  }
  /** each side's uniforms' coat colours (the guard's ΔE to the coat) */
  coats(): string[][] {
    return [0, 1].map(s => [
      ...new Set(this.hosts.filter(h => h.b.side === s).map(h => this.uniforms[h.b.uniform].colours.coat)),
    ])
  }
  /** the far LOD and its shadow casters posed from the posed vertices (?uvat, VAT_POS), or skinned */
  setPosed(on: boolean): void {
    this.posed = on
    for (const m of [...this.farMats.values(), ...this.tinyMats.values()]) m.setDefine('#define VAT_POS', on)
    for (const h of this.hosts) {
      this.shadowRT?.setMaterialForRendering(h.lod[this.farLod], on ? this.depthVatMat : this.depthMat)
    }
    this.smStep = -1
  }
  /** the ground trodden under the formations (?trample=0: none): the ground and the grass read a mask of where the men
   *  stand and just behind them (TRAMPLE) */
  setTrample(on: boolean): void {
    this.trampleOn = on
    if (on && !this.trTex) {
      this.trTex = new RawTexture(
        this.trBuf,
        TR_N,
        TR_N,
        Constants.TEXTUREFORMAT_R,
        this.scene,
        false,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      )
      this.trTex.name = 'trampleMask'
      this.trTex.wrapU = this.trTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    }
    for (const m of this.receivers) {
      m.setDefine('#define TRAMPLE', on)
      if (this.trTex) m.setTexture('uTrample', this.trTex)
    }
    this.trBox.set = false
  }

  // The trodden ground's mask: TR_N² over an axis-aligned world box round the ground in view (where its corner rays
  // meet the ground at the focus's height), a power of two metres wide (64 to 1,024), held while it covers the view and
  // is under twice the size the view needs. Drawn again when the box moves, or at most TR_EVERY s apart while men move:
  // each man splats where he stands and, fainter, up to five steps behind him (the ground just behind the ranks),
  // normalised by how many men a texel holds in a formation, then blurred once (no texel edge on the ground)
  private trample(T: number, moved: boolean): void {
    const b = this.trBox
    const q = this.quad
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (let j = 0; j < 4; j++) {
      x0 = Math.min(x0, q[j * 2])
      x1 = Math.max(x1, q[j * 2])
      z0 = Math.min(z0, q[j * 2 + 1])
      z1 = Math.max(z1, q[j * 2 + 1])
    }
    if (!Number.isFinite(x0 + x1 + z0 + z1)) return
    const need = Math.max(x1 - x0, z1 - z0) + 20
    // a view that leaves the box refits it at once (whatever the clocks: a held one, ?frozen, the guard's renders, get
    // a current box); a box over twice the size the view needs refits at most every TR_EVERY s of the wall's clock
    // (a pan out from a close view: the shadow fix; ?smhold=fixed, at once), the old box drawn till then
    const contains = b.set && x0 > b.x0 + 5 && z0 > b.z0 + 5 && x1 < b.x0 + b.size - 5 && z1 < b.z0 + b.size - 5
    const fits = contains && b.size < 2 * need
    const wall = performance.now()
    const refit = !contains || (!fits && !(this.holdShare && wall - this.trWall < TR_EVERY * 1000))
    if (refit) {
      const size = Math.min(1024, Math.max(64, 2 ** Math.ceil(Math.log2(need))))
      const tx = size / TR_N
      b.size = size
      b.x0 = Math.floor(((x0 + x1) / 2 - size / 2) / tx) * tx
      b.z0 = Math.floor(((z0 + z1) / 2 - size / 2) / tx) * tx
      b.set = true
      this.trV.set(b.x0, b.z0, 1 / size, 0)
      for (const m of this.receivers) m.setVector4('uTrampleBox', this.trV)
      this.trWall = wall
    } else if (!(moved && T - this.trAt >= TR_EVERY) && this.trAt >= 0) return
    this.trAt = T
    const t0 = trNow()
    const acc = this.trAcc
    const out = this.trBuf
    const tx = b.size / TR_N
    acc.fill(0)
    const splat = (x: number, z: number, w: number) => {
      const i = Math.floor((x - b.x0) / tx)
      const j = Math.floor((z - b.z0) / tx)
      if (i >= 0 && j >= 0 && i < TR_N && j < TR_N) acc[j * TR_N + i] += w
    }
    for (const h of this.hosts) {
      if (!this.shown || h.hi.x < b.x0 || h.lo.x > b.x0 + b.size || h.hi.z < b.z0 || h.lo.z > b.z0 + b.size) continue
      const m = h.matrices
      for (let o = 0; o < m.length; o += 16) {
        const x = m[o + 12]
        const z = m[o + 14]
        // (+z in the figure's frame: behind him)
        const bx = m[o + 8]
        const bz = m[o + 10]
        splat(x, z, 1)
        for (const [d, w] of TR_TRAIL) splat(x + bx * d, z + bz * d, w)
      }
    }
    // a formation's density: a man to 0.55 m² (0.65 m files, 0.85 m ranks), his splats' weight
    const full = Math.max(1, ((tx * tx) / 0.55) * TR_WEIGHT * 0.6)
    for (let j = 0; j < TR_N; j++) {
      for (let i = 0; i < TR_N; i++) {
        let s = 0
        let n = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const a = i + di
            const c = j + dj
            if (a >= 0 && c >= 0 && a < TR_N && c < TR_N) {
              s += Math.min(1, acc[c * TR_N + a] / full) * (di || dj ? 1 : 2)
              n += di || dj ? 1 : 2
            }
          }
        }
        out[j * TR_N + i] = Math.round((255 * s) / n)
      }
    }
    this.trTex?.update(out)
    if (TRACE.on) {
      tr(TR.trample)
      tr(TR.trampleMs, performance.now() - t0)
    }
  }

  /** the battalions' colours (?flags=0: none): one flag a battalion, in its uniform's flag colours, carried by the man
   *  at the line's centre in its second rank (the colour party), its cloth flying downwind; a thin instance each */
  setFlags(on: boolean): void {
    this.flagsOn = on
    if (on && !this.flag) this.makeFlags()
    this.flag?.setEnabled(on && this.shown)
  }
  private makeFlags(): void {
    const W = FLAG_W
    const H = FLAG_H
    const NX = 8
    const NY = 4
    const pos: number[] = []
    const part: number[] = []
    const idx: number[] = []
    // the cloth: a grid from the staff out, its foot FLAG_TOP - H up the staff
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        pos.push((i / NX) * W, FLAG_TOP - H + (j / NY) * H, 0)
        part.push(0)
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i
        idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1)
      }
    }
    // the staff: two crossed strips from the ground to its top
    for (const [dx, dz] of [
      [0.03, 0],
      [0, 0.03],
    ]) {
      const b = pos.length / 3
      pos.push(-dx, 0, -dz, dx, 0, dz, dx, FLAG_TOP + 0.15, dz, -dx, FLAG_TOP + 0.15, -dz)
      part.push(1, 1, 1, 1)
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
    const mesh = new Mesh('flags', this.scene)
    mesh.setVerticesData('position', pos, false, 3)
    mesh.setVerticesData('aPart', part, false, 1)
    mesh.setIndices(idx)
    const m = this.mats0.make('flags', FLAG_VS, FLAG_FS, {
      attributes: ['position', 'aPart', 'aC0', 'aC1', 'aC2', 'aPh', 'aNext'],
      uniforms: ['uFlagT', 'uFlagK', 'uStepFrac'],
      defines: [
        '#define NOSNOW',
        '#define KEEP_HUE',
        '#define BOUNCE',
        `#define FLAG_W ${W.toFixed(2)}`,
        `#define FLAG_H ${H.toFixed(2)}`,
        ...(this.smooth ? ['#define SMOOTH'] : []),
      ],
    })
    m.backFaceCulling = false
    mesh.material = m
    mesh.isPickable = false
    mesh.alwaysSelectAsActiveMesh = true
    const n = this.hosts.length
    const cols = [new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 3)]
    const ph = new Float32Array(n)
    this.hosts.forEach((h, k) => {
      const f = this.uniforms[h.b.uniform].flag
      const c = (i: number) => Color3.FromHexString(f[Math.min(f.length - 1, Math.floor((i * f.length) / 3))])
      for (let i = 0; i < 3; i++) c(i).toArray(cols[i], k * 3)
      ph[k] = ((k * 0.618) % 1) * 3
    })
    this.flagM = new Float32Array(n * 16)
    this.flagN = new Float32Array(n * 3)
    mesh.thinInstanceSetBuffer('matrix', this.flagM, 16, false)
    mesh.thinInstanceSetBuffer('aNext', this.flagN, 3, false)
    cols.forEach((a, i) => mesh.thinInstanceSetBuffer(`aC${i}`, a, 3, true))
    mesh.thinInstanceSetBuffer('aPh', ph, 1, true)
    this.flag = mesh
    this.flagMat = m
    for (const h of this.hosts) this.placeFlag(h)
  }
  // the flag at its bearer: his place, the cloth turned to fly downwind (FLAG_WIND, rad from +x toward +z)
  private placeFlag(h: Host): void {
    if (!this.flagM) return
    const o = h.index * 16
    const mo = this.bearer * 16
    const c = Math.cos(FLAG_WIND)
    const s = Math.sin(FLAG_WIND)
    const m = this.flagM
    m[o] = c
    m[o + 1] = 0
    m[o + 2] = s
    m[o + 3] = 0
    m[o + 4] = 0
    m[o + 5] = 1
    m[o + 6] = 0
    m[o + 7] = 0
    m[o + 8] = -s
    m[o + 9] = 0
    m[o + 10] = c
    m[o + 11] = 0
    m[o + 12] = h.matrices[mo + 12]
    m[o + 13] = h.matrices[mo + 13]
    m[o + 14] = h.matrices[mo + 14]
    m[o + 15] = 1
    if (this.flagN) for (let k = 0; k < 3; k++) this.flagN[h.index * 3 + k] = h.next[this.bearer * 3 + k]
    this.flagStale = true
  }

  /** the figures shown or not (the guard's ground alone), their shadows with them */
  show(on: boolean): void {
    this.shown = on
    for (const h of this.hosts) h.lod.forEach((m, li) => m.setEnabled(on && (!this.hasNearest || li !== 0 || h.split)))
    this.flag?.setEnabled(on && this.flagsOn) // (the flags with them)
    this.smStep = -1
  }

  /** figures drawn last frame, by LOD (the data's names, and tiny): battalions shown at that LOD and in the camera's
   *  view */
  drawn(): Record<string, number> {
    const out: Record<string, number> = {}
    const planes = this.scene.frustumPlanes
    this.data.lods.forEach((l, j) => {
      out[l.name] = this.hosts.reduce((a, h) => {
        const m = h.lod[j]
        return a + (m.isEnabled() && m.isVisible && m.isInFrustum(planes) ? m.thinInstanceCount : 0)
      }, 0)
    })
    if (this.tinyLod >= 0) {
      out.tiny = this.hosts.reduce((a, h) => {
        const m = h.lod[this.tinyLod]
        return a + (m.isEnabled() && m.isVisible && m.isInFrustum(planes) ? m.thinInstanceCount : 0)
      }, 0)
    }
    return out
  }
  get figures(): number {
    return this.hosts.length * this.slot.line.length
  }
  /** the battalions as placed (the tools aim their cameras at them) */
  /** how many times a battalion's men have been placed: it changes whenever a formation's ground does (the smoke's
   *  clearance mask, src/look/smoke.ts) */
  get placeCount(): number {
    return this.placed
  }
  /** each battalion's footprint as it stands, in its own frame (the smoke's cap over the men, src/look/smoke.ts): its
   *  place and heading and its men's roots' bounds there, [x, z, heading, x0, z0, x1, z1] (FOOT_FLOATS a battalion)
   *  into out (at least FOOT_FLOATS × battalions); returns how many. A line askew to the world's axes keeps its own
   *  narrow box (a world box round it would take in the ground before it) */
  footprints(out: Float32Array): number {
    let n = 0
    for (const h of this.hosts) {
      if (h.step < 0) continue // (not placed yet)
      const o = n * FOOT_FLOATS
      out[o] = h.b.x
      out[o + 1] = h.b.z
      out[o + 2] = h.b.heading
      out.set(h.foot, o + 3)
      n++
    }
    return n
  }
  get battalions(): Battalion[] {
    return this.hosts.map(h => h.b)
  }
}

// a battalion's bounds stretched away from the sun by the shadow of a figure top m tall, and down by it (into lo, hi)
function shadowBox(h: Host, top: number, lo: Vector3, hi: Vector3): void {
  const sx = (-SUN.x / SUN.y) * top
  const sz = (-SUN.z / SUN.y) * top
  lo.set(Math.min(h.lo.x, h.lo.x + sx), h.lo.y - top, Math.min(h.lo.z, h.lo.z + sz))
  hi.set(Math.max(h.hi.x, h.hi.x + sx), h.hi.y, Math.max(h.hi.z, h.hi.z + sz))
}
