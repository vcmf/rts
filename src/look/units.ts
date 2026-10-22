// The armies on the look page (docs/plans/active/armies-demo.md): battalions of figures drawn as thin instances, one
// host per battalion per LOD, skinned in src/look/shaders/units.vert from the baked animation (tools/bake-figure.py),
// stepped at the bake's 12 fps, painted by the world's painter on the units' light (KEEP_HUE) and casting their own
// shadows on the ground through a shadow map fitted to the view each frame (decision 0047). Ported from the crowd
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
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { SUN, type Materials } from './materials.ts'
import { D } from './spec.ts'
import UNITS_VS from './shaders/units.vert?raw'
import UNITS_FS from './shaders/units.frag?raw'
import FLAG_VS from './shaders/flag.vert?raw'
import FLAG_FS from './shaders/flag.frag?raw'
import DEPTH_FS from './shaders/depth.frag?raw'
import { groundAt } from './heightfield.ts'
import { mulberry } from './noise.ts'
import { TRACE, tr, trNow } from './trace.ts'
import { posedMesh, posedVertices, shadowProxy, type UnitData } from './units-data.ts'
import { CYCLE, farPalette, farRule, manAt, phaseAt, slots, type Battalion, type Drill, type ManState, type Phase, type Uniform } from './world/armies.ts'

const ROLES = ['halt', 'march', 'run', 'fire'] as const
const RESERVE = { phase: 'halt', start: 0, deployEnd: 0 } as const   // a reserve's phase: halted in column, always

interface Host {
  b: Battalion; lod: Mesh[]; near: boolean;   // lod: the near LOD, the far LOD, the shadow proxy (casts only)
  matrices: Float32Array; settings: Float32Array; jitter: Float32Array
  cx: number; cz: number; lo: Vector3; hi: Vector3
  step: number            // the 1/fps step its matrices were written for (a moving battalion moves once a step)
  phase: Phase | null     // the script's phase its men were last written in (a halted one is written once a phase)
  stale: boolean[]        // per LOD: its GPU copy of the matrices is older than the matrices
  staleSet: boolean[]     // per LOD: its GPU copy of the men's clip settings is older
  cycle: number           // the cycle its settings were written in (each cycle's clips start afresh)
}

const SM_SIZE = 2048   // the figures' shadow map, fitted to the ground in view each frame
const SM_REACH = 900   // m: a view ray that meets no ground is cut here (the widest zoom looks far)
const SM_STEP = 16     // m: the map's half-size is a multiple of this, so its texel size changes only in steps
const SM_BIAS = 0.02   // m along the sun: no receiver is drawn into the map, so it only absorbs float rounding
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1]   // the view's corners in clip space
const FIGURE = 1.8     // m: a figure's height, for the LOD's pixel test
const SM_HOLD = 6      // m: lazy, the held sun box must cover the view by this much
const FLAG_W = 1.4, FLAG_H = 1.1, FLAG_TOP = 3.0, FLAG_WIND = 0.6, FLAG_MIN_PX = 12  // m; rad; the cloth's least height on screen
const TR_N = 256, TR_EVERY = 0.25   // the trodden ground's mask: texels a side; s between its redraws while men move
const TR_TRAIL = [[0.8, 0.9], [1.6, 0.8], [2.6, 0.6], [3.8, 0.4]] as const   // m behind a man, weight
const TR_WEIGHT = 1 + TR_TRAIL.reduce((a, [, w]) => a + w, 0)
const FAR_SCALE_XZ = 1.35, FAR_SCALE_Y = 1.15   // the far figure's growth at a quarter of the LOD switch's height
const SHADOW_H = 2.6    // m: the highest point of a figure (his bayonet up), whose shadow reaches farthest
const SM_STEP_FINE = 2  // m: fine, the box's half-size steps
const SM_HOLD_SHARE = 0.1   // the held box's slack, a share of the view's half-size (the shadow fix: SM_HOLD at least)
const SM_COARSE = 1.3  // and be at most this many times the size the view needs (its texels no coarser)

export class Units {
  readonly data: UnitData
  private hosts: Host[] = []
  private lods: Mesh[] = []
  // one material a uniform the battalions wear (shared by its battalions), and one for its far LOD (the far rule)
  private readonly mats = new Map<string, ShaderMaterial>()
  private readonly farMats = new Map<string, ShaderMaterial>()
  private readonly uniforms: Readonly<Record<string, Uniform>>
  private depthMat: ShaderMaterial
  private depthVatMat: ShaderMaterial   // the far LOD's casters, posed (VAT_POS)
  private depthProxyMat!: ShaderMaterial   // the shadow proxy's, posed
  private posed = false
  private depthRT = false               // the shadow map is the depth-only target
  /** the shadow map as depth only, read by the hardware's comparison (?udepth=0: the float colour, manual taps) */
  depthCompare = true
  /** the casters culled to those whose shadow can reach the view (?ucull=0: all in the sun's box) */
  tightCull = true
  private camPlanes = Frustum.GetPlanes(Matrix.Identity())
  private sun: FreeCamera
  private shadowRT: RenderTargetTexture
  private shadows = false
  private culled: Mesh[] = []
  private planes = Frustum.GetPlanes(Matrix.Identity())
  private scratch = { inv: new Matrix(), vp: new Matrix(), a: new Vector3(), b: new Vector3(), d: new Vector3(), v: new Vector3(), c: new Vector3(), pts: Array.from({ length: 9 }, () => new Vector3()) }
  private readonly slot: ReturnType<typeof slots>
  private readonly speed: { march: number; run: number }
  private readonly man: ManState = { x: 0, z: 0, face: 0, role: 'halt', since: 0, moving: false }
  /** the figure height in pixels below which a battalion draws its far LOD (±10%, so it does not flicker) */
  lodPx = 48
  /** the shadow map redrawn only when it would change (?ushadowrate=0: every frame): the poses step at the bake's fps,
   *  so a frame between two steps, with the sun's box and the men where they were, would draw the same map */
  lazyShadows = true
  /** the casters at the LOD the camera sees (?ushadowlod=1), else always at the far LOD (its shadow is a few texels) */
  casterNear = false
  /** the receivers that read the figures' shadow once a blade at its root (the meadow's: UNIT_SHADOWS_VS, ?ushadowvs=1;
   *  by default none, each pixel reads it) */
  rootReceivers: ShaderMaterial[] = []
  readonly meshes: Mesh[] = []
  private farK = new Vector2()
  /** the shadow proxy's size (the report's, the tests') */
  proxyStats = { vertices: 0, triangles: 0 }
  private flag: Mesh | null = null
  private flagK = new Vector2()   // (its own: a material keeps the vector it is given)
  private flagMat: ShaderMaterial | null = null
  private flagM: Float32Array | null = null
  private flagStale = false
  private readonly bearer: number    // the colour bearer: the line's centre file, second rank
  private readonly mats0: Materials
  private trampleOn = false
  private trTex: RawTexture | null = null
  private readonly trBuf = new Uint8Array(TR_N * TR_N)
  private readonly trAcc = new Float32Array(TR_N * TR_N)
  private readonly trBox = { x0: 0, z0: 0, size: 64, set: false }
  private readonly trV = new Vector4()
  private trAt = -1   // the clock when the mask was last drawn
  private quad = new Float64Array(8)
  /** the shadow's quality (?ushadowq=0: batch A's): the box fitted to the ground in view, the soft lookup */
  fineShadows = true
  /** the held sun box's slack in proportion to it (?smhold=fixed: batch B's, none) */
  holdShare = true
  /** the casters: the shadow proxy (shadowProxy, src/look/units-data.ts; ?shadowlod=far: the far LOD) */
  proxyCasters = true
  private smStep = -1                       // the step the map was last drawn at
  private smVP = new Float32Array(16)       // the sun's view-projection it was drawn with
  private smList: Mesh[] = []               // and its casters
  private smBox = { ex: 0, ey: 0, V: new Matrix(), c: new Vector3(), set: false, margin: SM_HOLD }   // the sun's box held while it covers the view (lazy only)
  /** the shadow map's draws so far (the captures count them: a still frame draws none) */
  smDraws = 0

  /** receivers: the painted materials the figures' shadows fall on (the ground and the grass); the page's clock */
  private readonly scene: Scene; private readonly camera: ArcRotateCamera; private readonly receivers: ShaderMaterial[]
  private readonly drill: Drill; private readonly clock: () => number
  /** uniforms: the era's, by id (each battalion names one) */
  constructor(scene: Scene, camera: ArcRotateCamera, mats: Materials, receivers: ShaderMaterial[], data: UnitData, drill: Drill, battalions: Battalion[], uniforms: Readonly<Record<string, Uniform>>, clock: () => number) {
    this.scene = scene; this.camera = camera; this.receivers = receivers; this.drill = drill; this.clock = clock; this.uniforms = uniforms
    this.data = data
    if (data.lods.length !== 2) throw new Error(`units: drawn with two LODs, the data has ${data.lods.length}`)
    for (const r of ROLES) if (!data.ranges[r]) throw new Error(`units: the figure has no clips for the role ${r} (tools/bake-figure.py)`)
    this.slot = slots(drill); this.mats0 = mats
    let best = Infinity, bi = 0
    this.slot.line.forEach(([x, z], i) => { const d = Math.hypot(x, z + drill.rankSpacing); if (d < best) { best = d; bi = i } })
    this.bearer = bi
    this.speed = { march: data.ranges.march.speed, run: data.ranges.run.speed }
    if (!(this.speed.march > 0 && this.speed.run > 0)) throw new Error('units: the march and run roles have no root speed')
    const vat = RawTexture.CreateRGBATexture(data.vat.data, data.vat.width, data.vat.height, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT)
    vat.name = 'figureVAT'
    const attributes = ['position', 'normal', 'aRole', 'aBones', 'aWeights', 'aVAT', 'aVid'], n = data.palette.length
    // the far figure's growth (setFarScale): across up to FAR_SCALE_XZ, but never wider than 95 % of a file (the far
    // LOD's shoulders, measured between 1.2 and 1.5 m up), and FAR_SCALE_Y tall
    const fm = data.mesh[data.lods[1].name]; let x0 = Infinity, x1 = -Infinity
    for (let v = 0; v < fm.positions.length / 3; v++) { const y = fm.positions[v * 3 + 1]; if (y > 1.2 && y < 1.5) { x0 = Math.min(x0, fm.positions[v * 3]); x1 = Math.max(x1, fm.positions[v * 3]) } }
    const farScale = new Vector2(Math.min(FAR_SCALE_XZ, 0.95 * drill.fileSpacing / (x1 - x0)), FAR_SCALE_Y)
    for (const id of new Set(battalions.map(b => b.uniform))) {
      const u = uniforms[id]; if (!u) throw new Error(`units: no uniform ${id} (a battalion names it)`)
      // its colour for each of the bake's roles (a role the uniform does not name: a loud failure)
      const pal = data.palette.map(r => { const hex = u.colours[r]; if (!hex) throw new Error(`units: the uniform ${id} has no colour for the role ${r}`); return Color3.FromHexString(hex) })
      const m = mats.make(`units_${id}`, UNITS_VS, UNITS_FS, { attributes, uniforms: ['uVATTime', 'uPal', 'uMask', 'uCoatRole'], samplers: ['uVAT'], defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE', `#define PAL_N ${n}`] })
      m.setTexture('uVAT', vat); m.setColor3Array('uPal', pal); m.setFloat('uMask', -1); m.setFloat('uCoatRole', data.palette.indexOf('coat'))
      this.mats.set(id, m)
      // the far LOD's: its far palette and its lift crossfaded in below the LOD switch under its far rule (FAR, setFarRule;
      // units.vert, units.frag), its vertices posed (VAT_POS, setPosed)
      const f = mats.make(`units_${id}_far`, UNITS_VS, UNITS_FS, { attributes, uniforms: ['uVATTime', 'uPal', 'uPalFar', 'uFarK', 'uFarScale', 'uMask', 'uCoatRole'], samplers: ['uVAT', 'uVATP'], defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE', `#define PAL_N ${n}`] })
      const far = farPalette(u.colours)
      f.setTexture('uVAT', vat); f.setColor3Array('uPal', pal); f.setColor3Array('uPalFar', data.palette.map(r => Color3.FromHexString(far[r])))
      f.setFloat('uMask', -1); f.setFloat('uCoatRole', data.palette.indexOf('coat')); f.setVector2('uFarScale', farScale)
      this.farMats.set(id, f)
    }
    // the shadow pass: the same skinning, depth only, from an orthographic camera along the sun
    this.depthMat = new ShaderMaterial('unitsDepth', scene, { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS }, { attributes, uniforms: ['world', 'viewProjection', 'uVATTime'], samplers: ['uVAT'], defines: ['#define DEPTH'] })
    this.depthMat.setTexture('uVAT', vat)
    // the far LOD posed at every step (batch B, ?uvat): its materials and its shadow casters read it under VAT_POS
    const posed = posedVertices(data, data.lods[1].name)
    const vatp = RawTexture.CreateRGBATexture(posed.data, posed.width, posed.height, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT)
    vatp.name = 'figurePosed'
    for (const m of this.farMats.values()) m.setTexture('uVATP', vatp)
    this.depthVatMat = new ShaderMaterial('unitsDepthPosed', scene, { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS }, { attributes, uniforms: ['world', 'viewProjection', 'uVATTime'], samplers: ['uVAT', 'uVATP'], defines: ['#define DEPTH', '#define VAT_POS'] })
    this.depthVatMat.setTexture('uVAT', vat); this.depthVatMat.setTexture('uVATP', vatp)
    this.sun = new FreeCamera('unitSun', SUN.scale(500), scene); this.sun.mode = Camera.ORTHOGRAPHIC_CAMERA; this.sun.minZ = 1; this.sun.maxZ = 1200
    this.shadowRT = this.makeRT(false)
    for (const m of receivers) {
      m.setTexture('uUnitSM', this.shadowRT); m.setVector2('uUnitTexel', new Vector2(1 / SM_SIZE, 1 / SM_SIZE))
      m.setFloat('uUnitBias', SM_BIAS / (this.sun.maxZ - this.sun.minZ)); m.setMatrix('uUnitVP', Matrix.Identity())
    }
    for (const l of data.lods) {
      const m = data.mesh[l.name], mesh = new Mesh(`figure_${l.name}`, scene)
      mesh.setVerticesData('position', m.positions, false, 3); mesh.setVerticesData('normal', m.normals, false, 3)
      mesh.setVerticesData('aRole', Float32Array.from(m.roles), false, 1); mesh.setVerticesData('aVid', Float32Array.from(m.roles, (_, i) => i), false, 1)
      mesh.setVerticesData('aBones', Float32Array.from(m.boneIndices), false, 4); mesh.setVerticesData('aWeights', m.boneWeights, false, 4)
      // (the battalions' hosts are its clones; it is never drawn, but a mesh without a material makes Babylon reach for
      // its default StandardMaterial, which the page does not import: the readiness of the bench and the tools threw)
      mesh.material = this.mats.values().next().value ?? null
      mesh.setIndices(m.indices); mesh.setEnabled(false); this.lods.push(mesh)
    }
    // the shadow proxy (shadowProxy, src/look/units-data.ts): a third mesh a battalion, never drawn in the view, cast from
    // its posed vertices (VAT_POS), both sides of its quads
    const px = shadowProxy(data, data.lods[1].name), pp = posedMesh(data, px), pn = px.positions.length / 3
    const vatx = RawTexture.CreateRGBATexture(pp.data, pp.width, pp.height, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT)
    vatx.name = 'figureShadowPosed'
    this.depthProxyMat = new ShaderMaterial('unitsDepthProxy', scene, { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS }, { attributes, uniforms: ['world', 'viewProjection', 'uVATTime'], samplers: ['uVAT', 'uVATP'], defines: ['#define DEPTH', '#define VAT_POS'] })
    this.depthProxyMat.setTexture('uVAT', vat); this.depthProxyMat.setTexture('uVATP', vatx); this.depthProxyMat.backFaceCulling = false
    const pm = new Mesh('figure_shadow', scene)
    pm.setVerticesData('position', px.positions, false, 3); pm.setVerticesData('normal', px.normals, false, 3)
    pm.setVerticesData('aRole', new Float32Array(pn), false, 1); pm.setVerticesData('aVid', Float32Array.from({ length: pn }, (_, i) => i), false, 1)
    pm.setVerticesData('aBones', Float32Array.from(px.boneIndices), false, 4); pm.setVerticesData('aWeights', px.boneWeights, false, 4)
    pm.material = this.depthProxyMat; pm.setIndices(px.indices); pm.setEnabled(false); this.lods.push(pm)
    this.proxyStats = { vertices: pn, triangles: px.indices.length / 3 }
    for (const b of battalions) this.add(b)
    scene.onBeforeRenderObservable.add(() => this.frame())
  }

  private add(b: Battalion): void {
    const men = this.slot.line.length
    const lod = this.lods.map((src, li) => {
      const host = src.clone(`${src.name}_${this.hosts.length}`)
      // thin-instance matrices are vertex buffers on the geometry, and clones share it: without its own geometry
      // every battalion would draw with the last one's men
      host.makeGeometryUnique()
      host.material = li === 2 ? this.depthProxyMat : (li === 1 ? this.farMats : this.mats).get(b.uniform) ?? null   // (the far LOD's own: the far palette, posed)
      if (li === 2) host.isVisible = false   // (the proxy: shown to the shadow map alone)
      host.isPickable = false; host.setEnabled(true); host.alwaysSelectAsActiveMesh = false; this.meshes.push(host)
      this.shadowRT.setMaterialForRendering(host, li === 2 ? this.depthProxyMat : this.depthMat)   // (the far LOD's: setPosed)
      return host
    })
    const rnd = mulberry(1 + this.hosts.length * 7919), jitter = new Float32Array(men * 4)   // ±3 cm, ±4°, a man's own lag: no two alike
    for (let i = 0; i < men; i++) { jitter[i * 4] = (rnd() - 0.5) * 0.06; jitter[i * 4 + 1] = (rnd() - 0.5) * 0.06; jitter[i * 4 + 2] = (rnd() - 0.5) * 0.14; jitter[i * 4 + 3] = rnd() * 2 - 1 }
    const matrices = new Float32Array(men * 16), settings = new Float32Array(men * 4)
    for (const m of lod) { m.thinInstanceSetBuffer('matrix', matrices, 16, false); m.thinInstanceSetBuffer('aVAT', settings, 4, false) }
    this.hosts.push({ b, lod, near: false, matrices, settings, jitter, cx: b.x, cz: b.z, lo: new Vector3(), hi: new Vector3(), step: -1, phase: null, stale: [true, true, true], staleSet: [true, true, true], cycle: -1 })
  }

  // every man's matrix and clip at the battalion's local time: his place and facing from the script, set on the ground;
  // his clip's range, and its phase so its step 0 falls when his role began (the clock's steps less his start's)
  private place(h: Host, local: number, cycleStart: number): void {
    const { b, matrices, settings, jitter } = h, c = Math.cos(b.heading), s = Math.sin(b.heading), fps = this.data.fps, man = this.man
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, changed = false
    const p = h.b.reserve ? RESERVE : phaseAt(this.drill, local, this.speed.march, this.speed.run)   // (a reserve stands in column)
    for (let i = 0; i < this.slot.line.length; i++) {
      manAt(this.drill, this.slot, i, local, p, this.speed.run, this.speed.march, jitter[i * 4 + 3], man)
      const lx = man.x + jitter[i * 4], lz = man.z + jitter[i * 4 + 1]
      const x = b.x + c * lx + s * lz, z = b.z - s * lx + c * lz, y = groundAt(x, z)
      // the figure faces -z in its own frame: turned by the battalion's heading and his own way (and a little jitter)
      const a = b.heading + man.face + Math.PI + jitter[i * 4 + 2], ca = Math.cos(a), sa = Math.sin(a), o = i * 16
      matrices[o] = ca; matrices[o + 1] = 0; matrices[o + 2] = -sa; matrices[o + 3] = 0
      matrices[o + 4] = 0; matrices[o + 5] = 1; matrices[o + 6] = 0; matrices[o + 7] = 0
      matrices[o + 8] = sa; matrices[o + 9] = 0; matrices[o + 10] = ca; matrices[o + 11] = 0
      matrices[o + 12] = x; matrices[o + 13] = y; matrices[o + 14] = z; matrices[o + 15] = 1
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
      // the clip: the role's range; its phase in steps puts its first step at his start (global time)
      const r = this.data.ranges[man.role], steps = r.end - r.start, start = cycleStart + man.since
      const ph = ((-Math.floor(start * fps)) % steps + steps) % steps, k = i * 4
      if (settings[k] !== r.start || settings[k + 1] !== steps || settings[k + 2] !== ph) { settings[k] = r.start; settings[k + 1] = steps; settings[k + 2] = ph; settings[k + 3] = fps; changed = true }
    }
    h.cx = (minX + maxX) / 2; h.cz = (minZ + maxZ) / 2
    // thin-instance bounds do not follow the animation: padded by a figure's height and a musket's reach
    h.lo.set(minX - 1.2, minY - 0.3, minZ - 1.2); h.hi.set(maxX + 1.2, maxY + 2.4, maxZ + 1.2)
    for (const m of h.lod) m.getBoundingInfo().reConstruct(h.lo, h.hi)
    h.stale[0] = h.stale[1] = h.stale[2] = true
    this.placeFlag(h)
    if (changed) h.staleSet[0] = h.staleSet[1] = h.staleSet[2] = true
  }

  private frame(): void {
    const t0 = trNow(); this.frameBody(); if (TRACE.on) tr('unitsMs', performance.now() - t0)
  }
  private frameBody(): void {
    const T = this.clock(), step = Math.floor(T * this.data.fps)
    for (const m of this.mats.values()) m.setFloat('uVATTime', T)
    for (const m of this.farMats.values()) m.setFloat('uVATTime', T)
    this.depthMat.setFloat('uVATTime', T); this.depthVatMat.setFloat('uVATTime', T); this.depthProxyMat.setFloat('uVATTime', T)
    const cam = this.camera, engine = this.scene.getEngine()
    // pixels per metre at unit distance, from the projection itself
    const pxPerM = cam.getProjectionMatrix().m[5] * engine.getRenderHeight() / 2, camPos = cam.globalPosition
    for (const m of this.farMats.values()) m.setVector2('uFarK', this.farK.set(FIGURE * pxPerM, this.lodPx))
    let moved = step !== this.smStep   // (the map changes with the poses' step, the men's places, the casters' LOD)
    let anyMoved = false   // (a battalion's men written this frame: the trodden ground follows)
    for (const h of this.hosts) {
      if (!h.lod[0].isEnabled()) continue
      const t = T - h.b.offset, cycle = Math.floor(t / CYCLE), local = t - cycle * CYCLE, cycleStart = T - local
      const p = h.b.reserve ? RESERVE.phase : phaseAt(this.drill, local, this.speed.march, this.speed.run).phase
      // a battalion's men are written when they move (a marching or deploying one once a step), else once a phase
      const moving = p === 'column' || p === 'deploy'
      if (h.step < 0 || h.cycle !== cycle || h.phase !== p || (moving && step !== h.step)) {
        const tp = trNow(); this.place(h, local, cycleStart); h.step = step; h.phase = p; h.cycle = cycle; moved = true; anyMoved = true
        if (TRACE.on) { tr('placed'); tr('placeMs', performance.now() - tp) }
      }
      const px = FIGURE * pxPerM / Math.max(1, Math.hypot(camPos.x - h.cx, camPos.y - groundAt(h.cx, h.cz), camPos.z - h.cz))
      const near = h.near ? px >= this.lodPx * 0.9 : px >= this.lodPx * 1.1
      if (near !== h.near && this.casterNear) moved = true
      h.near = near; h.lod[0].isVisible = near; h.lod[1].isVisible = !near
      // the LOD drawn, and the far LOD when it casts for a battalion drawn near; the hidden one is updated when drawn again
      const kc = this.casterNear && near ? 0 : this.proxyCasters ? 2 : 1   // the caster's mesh
      for (let k = 0; k < 3; k++) {
        if (k !== (near ? 0 : 1) && !(this.shadows && k === kc)) continue
        if (h.stale[k]) { h.lod[k].thinInstanceBufferUpdated('matrix'); h.stale[k] = false }
        if (h.staleSet[k]) { h.lod[k].thinInstanceBufferUpdated('aVAT'); h.staleSet[k] = false }
      }
    }
    if (this.trampleOn) this.trample(T, anyMoved)
    if (this.flag?.isEnabled()) {
      this.flagMat?.setFloat('uFlagT', T); this.flagMat?.setVector2('uFlagK', this.flagK.set(pxPerM, FLAG_MIN_PX))
      if (this.flagStale) { this.flag.thinInstanceBufferUpdated('matrix'); this.flag.thinInstanceRefreshBoundingInfo(); this.flagStale = false; tr('flag') }
    }
    if (!this.shadows) return
    const refit = this.fitSun()
    if (refit) tr('sunRefit')
    if (!this.lazyShadows) return
    if (moved || refit) { this.shadowRT.resetRefreshCounter(); this.smStep = step }
  }

  // The sun's orthographic box around the ground in view: where the view's corner rays meet the lowest and the
  // highest ground (cut at SM_REACH), padded for a figure's height, so the map's texels go where the camera looks.
  // Its centre snaps to whole texels along the sun's fixed view axes and its size moves in SM_STEP steps, so the
  // texel grid stays put under still figures while the view pans or zooms (the crowd bench's L1b). Lazy (lazyShadows),
  // the box is held while it still covers the view with SM_HOLD m to spare and is at most SM_COARSE times the size the
  // view needs, so a small move of the camera draws no new map. Returns whether the map's view or casters changed
  // Fine (fineShadows, batch B): the corner rays meet the ground in view's own range of heights, not the tile's
  // (25 m of height seen along a low sun stretched the box), the box is centred on what it must hold and its size moves
  // in finer steps
  // the shadow map's target: a float colour (the casters' depth written as a colour, read by manual taps), or depth
  // only (batch B, ?udepth): a 24-bit depth texture with a comparison sampler, read by the hardware's bilinear compare
  private makeRT(depth: boolean): RenderTargetTexture {
    const rt = depth
      ? new RenderTargetTexture('unitSMDepth', { width: SM_SIZE, height: SM_SIZE }, this.scene, { generateMipMaps: false, generateDepthBuffer: true, noColorAttachment: true })
      : new RenderTargetTexture('unitSM', { width: SM_SIZE, height: SM_SIZE }, this.scene, false, true, Constants.TEXTURETYPE_FLOAT, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, true, false, false, Constants.TEXTUREFORMAT_R)
    if (depth) rt.createDepthStencilTexture(Constants.LEQUAL, true, false, 1, Constants.TEXTUREFORMAT_DEPTH24)
    rt.activeCamera = this.sun; rt.clearColor = new Color4(1, 1, 1, 1)
    rt.renderList = this.meshes; rt.getCustomRenderList = () => this.culled
    // a far LOD caster of a battalion drawn near is hidden from the view: shown to the map alone, while it draws
    const shown: Mesh[] = []
    rt.onBeforeRenderObservable.add(() => {
      this.smDraws++; for (const m of this.culled) if (!m.isVisible) { m.isVisible = true; shown.push(m) }
      if (TRACE.on) { tr('sm'); tr('smCasters', this.culled.length); for (const m of this.culled) tr('smTris', m.thinInstanceCount * m.getTotalIndices() / 3) }
    })
    rt.onAfterRenderObservable.add(() => { for (const m of shown) m.isVisible = false; shown.length = 0 })
    for (const h of this.hosts) h.lod.forEach((l, li) => rt.setMaterialForRendering(l, li === 2 ? this.depthProxyMat : li === 1 && this.posed ? this.depthVatMat : this.depthMat))
    return rt
  }

  private fitSun(): boolean {
    const cam = this.camera, k = this.scratch, inv = k.inv, g = this.fineShadows ? this.viewGround() : D.spec.ground
    cam.getTransformationMatrix().invertToRef(inv)
    let n = 0
    k.pts[n++].copyFrom(cam.target)
    for (let j = 0; j < 4; j++) {
      const x = CORNERS[j * 2], y = CORNERS[j * 2 + 1]
      Vector3.TransformCoordinatesFromFloatsToRef(x, y, 0, inv, k.a); Vector3.TransformCoordinatesFromFloatsToRef(x, y, 1, inv, k.b)
      k.b.subtractToRef(k.a, k.d).normalize()
      for (let e = 0; e < 2; e++) {
        const gy = e ? g.hi : g.lo, r = k.d.y < -1e-3 ? Math.min((gy - k.a.y) / k.d.y, SM_REACH) : SM_REACH
        k.a.addToRef(k.d.scaleToRef(r, k.v), k.pts[n++])
      }
    }
    k.c.setAll(0); for (let i = 0; i < n; i++) k.c.addInPlace(k.pts[i]); k.c.scaleInPlace(1 / n)
    // before the view's first frame its matrix does not invert: a NaN set on the sun stayed there for good (the map
    // drew nothing: the first armies' build cast no shadow). Fitted from the next frame instead
    if (!(Number.isFinite(k.c.x) && Number.isFinite(k.c.y) && Number.isFinite(k.c.z))) return false
    this.sun.position.copyFrom(k.c).addInPlace(SUN.scale(500)); this.sun.setTarget(k.c); this.sun.computeWorldMatrix()
    let V = this.sun.getViewMatrix(true), ex = 0, ey = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
      k.v.copyFrom(k.pts[i]); k.v.y += e ? 3 : -2; Vector3.TransformCoordinatesToRef(k.v, V, k.v)
      x0 = Math.min(x0, k.v.x); x1 = Math.max(x1, k.v.x); y0 = Math.min(y0, k.v.y); y1 = Math.max(y1, k.v.y)
    }
    if (this.fineShadows) {
      // the centre moved to the middle of what the box holds (along the sun's view axes: the texel grid's snap follows)
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, m = V.m
      k.c.x += m[0] * mx + m[1] * my; k.c.y += m[4] * mx + m[5] * my; k.c.z += m[8] * mx + m[9] * my
      this.sun.position.copyFrom(k.c).addInPlace(SUN.scale(500)); this.sun.setTarget(k.c); this.sun.computeWorldMatrix()
      V = this.sun.getViewMatrix(true)
      // the slack the box is held by (holdShare, the shadow fix): a share of its size, so a pan at the widest zoom refits
      // every SM_HOLD_SHARE of the view, not every frame; fixed (?smhold=fixed): none, held only within SM_HOLD of a
      // box fitted 2 m round the view (the batch B box, which a pan refit at nearly every frame)
      const slack = this.holdShare ? Math.max(SM_HOLD, SM_HOLD_SHARE * Math.max(x1 - x0, y1 - y0) / 2) : 0
      ex = Math.ceil(((x1 - x0) / 2 + 2 + slack) / SM_STEP_FINE) * SM_STEP_FINE; ey = Math.ceil(((y1 - y0) / 2 + 2 + slack) / SM_STEP_FINE) * SM_STEP_FINE
      this.smBox.margin = this.holdShare ? 1 : SM_HOLD
    } else {
      this.smBox.margin = SM_HOLD
      ex = Math.max(-x0, x1); ey = Math.max(-y0, y1)
      ex = Math.ceil((ex + 4) / SM_STEP) * SM_STEP; ey = Math.ceil((ey + 4) / SM_STEP) * SM_STEP
    }
    const box = this.smBox
    if (this.lazyShadows && box.set && box.ex <= ex * SM_COARSE && box.ey <= ey * SM_COARSE && this.covers(n)) {
      // held: the sun back on the held box's centre (it was moved to the view's above), the map's view unchanged
      this.sun.position.copyFrom(box.c).addInPlace(SUN.scale(500)); this.sun.setTarget(box.c); this.sun.computeWorldMatrix()
      return this.cull()
    }
    const m = V.m, tx = 2 * ex / SM_SIZE, ty = 2 * ey / SM_SIZE
    const px = k.c.x * m[0] + k.c.y * m[4] + k.c.z * m[8], py = k.c.x * m[1] + k.c.y * m[5] + k.c.z * m[9]
    const sx = Math.round(px / tx) * tx - px, sy = Math.round(py / ty) * ty - py
    k.c.x += m[0] * sx + m[1] * sy; k.c.y += m[4] * sx + m[5] * sy; k.c.z += m[8] * sx + m[9] * sy
    this.sun.position.copyFrom(k.c).addInPlace(SUN.scale(500)); this.sun.setTarget(k.c); this.sun.computeWorldMatrix()
    V = this.sun.getViewMatrix(true)
    this.sun.orthoLeft = -ex; this.sun.orthoRight = ex; this.sun.orthoTop = ey; this.sun.orthoBottom = -ey
    box.ex = ex; box.ey = ey; box.V.copyFrom(V); box.c.copyFrom(k.c); box.set = true
    if (this.depthRT) {
      // depth only: the sun's near and far planes fitted along the sun to what the box holds (24 bits over tens of
      // metres, not 1,200), a figure and some to spare either way
      let z0 = Infinity, z1 = -Infinity
      for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) { k.v.copyFrom(k.pts[i]); k.v.y += e ? 3 : -2; Vector3.TransformCoordinatesToRef(k.v, V, k.v); z0 = Math.min(z0, k.v.z); z1 = Math.max(z1, k.v.z) }
      this.sun.minZ = Math.max(0.5, Math.floor(z0 - 12)); this.sun.maxZ = Math.ceil(z1 + 12)
      for (const r of this.receivers) r.setFloat('uUnitBias', SM_BIAS / (this.sun.maxZ - this.sun.minZ))
    }
    const vp = k.vp; V.multiplyToRef(this.sun.getProjectionMatrix(true), vp)
    for (const r of this.receivers) r.setMatrix('uUnitVP', vp)
    Frustum.GetPlanesToRef(vp, this.planes)
    let changed = false
    for (let i = 0; i < 16; i++) if (vp.m[i] !== this.smVP[i]) { changed = true; this.smVP[i] = vp.m[i] }
    return this.cull() || changed
  }

  // the ground's range of heights in view: sampled on a 5 x 5 grid over where the corner rays meet the ground at the
  // focus's height, a metre to spare (the casters' own height is padded in fitSun)
  private viewGround(): { lo: number; hi: number } {
    const cam = this.camera, k = this.scratch, inv = k.inv, y0 = groundAt(cam.target.x, cam.target.z), q = this.quad
    cam.getTransformationMatrix().invertToRef(inv)
    for (let j = 0; j < 4; j++) {
      Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 0, inv, k.a); Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 1, inv, k.b)
      k.b.subtractToRef(k.a, k.d).normalize()
      const r = k.d.y < -1e-3 ? Math.min((y0 - k.a.y) / k.d.y, SM_REACH) : SM_REACH
      q[j * 2] = k.a.x + k.d.x * r; q[j * 2 + 1] = k.a.z + k.d.z * r
    }
    let lo = Infinity, hi = -Infinity
    for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4; v++) {
      const a = u / 4, b = v / 4, w0 = (1 - a) * (1 - b), w1 = a * (1 - b), w2 = a * b, w3 = (1 - a) * b
      const h = groundAt(w0 * q[0] + w1 * q[2] + w2 * q[4] + w3 * q[6], w0 * q[1] + w1 * q[3] + w2 * q[5] + w3 * q[7])
      lo = Math.min(lo, h); hi = Math.max(hi, h)
    }
    return { lo: lo - 1, hi: hi + 1 }
  }

  // the held box covers the view's points (fitSun's, the figures' height above them) with its margin to spare
  private covers(n: number): boolean {
    const k = this.scratch, b = this.smBox
    for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
      k.v.copyFrom(k.pts[i]); k.v.y += e ? 3 : -2; Vector3.TransformCoordinatesToRef(k.v, b.V, k.v)
      if (Math.abs(k.v.x) > b.ex - b.margin || Math.abs(k.v.y) > b.ey - b.margin) return false
    }
    return true
  }

  // only the battalions inside the sun's box are drawn into the map (a render target does not cull its list), each at
  // the caster's LOD; tight (?ucull), only those whose shadow can reach the view: their bounds stretched away from the
  // sun by the longest shadow (a figure's height down to the ground) must cross the camera's frustum. Whether the list
  // changed
  private cull(): boolean {
    const was = this.smList; was.length = 0; for (const m of this.culled) was.push(m)
    this.culled.length = 0
    if (this.tightCull) Frustum.GetPlanesToRef(this.camera.getTransformationMatrix(), this.camPlanes)
    const sx = -SUN.x / SUN.y * SHADOW_H, sz = -SUN.z / SUN.y * SHADOW_H   // the shadow's reach from a figure's top
    for (const h of this.hosts) {
      const l = h.lod[this.casterNear && h.near ? 0 : this.proxyCasters ? 2 : 1]
      if (!h.lod[0].isEnabled() || !l.isInFrustum(this.planes)) continue
      if (this.tightCull) {
        const lo = h.lo, hi = h.hi, x0 = Math.min(lo.x, lo.x + sx), x1 = Math.max(hi.x, hi.x + sx), z0 = Math.min(lo.z, lo.z + sz), z1 = Math.max(hi.z, hi.z + sz), y0 = lo.y - SHADOW_H
        // outside a plane: the box's corner most along the plane's normal is behind it
        if (this.camPlanes.some(p => p.normal.x * (p.normal.x > 0 ? x1 : x0) + p.normal.y * (p.normal.y > 0 ? hi.y : y0) + p.normal.z * (p.normal.z > 0 ? z1 : z0) + p.d < 0)) continue
      }
      this.culled.push(l)
    }
    return was.length !== this.culled.length || was.some((m, i) => m !== this.culled[i])
  }

  /** the figures' cast shadows on or off: off, the receivers compile without them (the bench's baseline arm) */
  setShadows(on: boolean): void {
    if (on === this.shadows) return
    this.shadows = on
    // depth only (?udepth, with the soft lookup only): the colour target swapped for the depth one, once
    const depth = on && this.depthCompare && this.fineShadows
    if (depth && !this.depthRT) {
      const was = this.shadowRT, i = this.scene.customRenderTargets.indexOf(was)
      if (i >= 0) this.scene.customRenderTargets.splice(i, 1)
      this.shadowRT = this.makeRT(true); was.dispose(); this.depthRT = true
      const tex = new BaseTexture(this.scene, this.shadowRT.depthStencilTexture); tex.name = 'unitSMDepthTex'
      for (const m of this.receivers) m.setTexture('uUnitSM', tex)
    }
    for (const m of this.receivers) m.setDefine('#define UNIT_SM_DEPTH', this.depthRT)
    const list = this.scene.customRenderTargets, i = list.indexOf(this.shadowRT)
    if (on && i < 0) list.push(this.shadowRT)
    if (!on && i >= 0) list.splice(i, 1)
    // lazy: drawn once, then again only when frame() resets it (a still view between two steps draws nothing)
    this.shadowRT.refreshRate = this.lazyShadows ? 0 : 1
    if (on) { this.smBox.set = false; this.smStep = -1 }   // (fitted by the next frame)
    for (const m of this.receivers) { m.setDefine('#define UNIT_SHADOWS', on); m.setDefine('#define UNIT_SHADOW_SOFT', on && this.fineShadows) }
    for (const m of this.rootReceivers) m.setDefine('#define UNIT_SHADOWS_VS', on)
  }

  /** the guard's masks (tools/guard.mjs --figures): 'off' painted; 'white', 'black' every figure flat; 'side' the
   *  uniforms side 0's battalions wear white, the others black; 'coat' white where a coat shows */
  setMask(mode: 'off' | 'white' | 'black' | 'side' | 'coat'): void {
    const first = new Set(this.hosts.filter(h => h.b.side === 0).map(h => h.b.uniform))
    const v = (id: string) => mode === 'off' ? -1 : mode === 'white' ? 1 : mode === 'black' ? 0 : mode === 'coat' ? 2 : first.has(id) ? 1 : 0
    for (const map of [this.mats, this.farMats]) for (const [id, m] of map) m.setFloat('uMask', v(id))
  }
  /** each uniform's far LOD under its far rule (farRule: 'coat', the far palette and its lift; 'own', as near), or
   *  every uniform's forced (?farpal=0|1: the A/B) */
  setFarRule(force: boolean | null): void {
    for (const [id, m] of this.farMats) m.setDefine('#define FAR', force ?? farRule(this.uniforms[id]) === 'coat')
  }
  /** the far figures drawn larger as they shrink on screen (?farscale=0: their own size) */
  setFarScale(on: boolean): void {
    for (const m of this.farMats.values()) m.setDefine('#define FAR_SCALE', on)
  }
  /** each side's uniforms' coat colours (the guard's ΔE to the coat) */
  coats(): string[][] {
    return [0, 1].map(s => [...new Set(this.hosts.filter(h => h.b.side === s).map(h => this.uniforms[h.b.uniform].colours.coat))])
  }
  /** the far LOD and its shadow casters posed from the posed vertices (?uvat, VAT_POS), or skinned */
  setPosed(on: boolean): void {
    this.posed = on
    for (const m of this.farMats.values()) m.setDefine('#define VAT_POS', on)
    for (const h of this.hosts) this.shadowRT.setMaterialForRendering(h.lod[1], on ? this.depthVatMat : this.depthMat)
    this.smStep = -1
  }
  /** the ground trodden under the formations (?trample=0: none): the ground and the grass read a mask of where the men
   *  stand and just behind them (TRAMPLE) */
  setTrample(on: boolean): void {
    this.trampleOn = on
    if (on && !this.trTex) {
      this.trTex = new RawTexture(this.trBuf, TR_N, TR_N, Constants.TEXTUREFORMAT_R, this.scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE)
      this.trTex.name = 'trampleMask'; this.trTex.wrapU = this.trTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    }
    for (const m of this.receivers) { m.setDefine('#define TRAMPLE', on); if (this.trTex) m.setTexture('uTrample', this.trTex) }
    this.trBox.set = false
  }

  // The trodden ground's mask: TR_N² over an axis-aligned world box round the ground in view (where its corner rays
  // meet the ground at the focus's height), a power of two metres wide (64 to 1,024), held while it covers the view and
  // is under twice the size the view needs. Drawn again when the box moves, or at most TR_EVERY s apart while men move:
  // each man splats where he stands and, fainter, up to five steps behind him (the ground just behind the ranks),
  // normalised by how many men a texel holds in a formation, then blurred once (no texel edge on the ground)
  private trample(T: number, moved: boolean): void {
    const cam = this.camera, k = this.scratch, inv = k.inv, y0 = groundAt(cam.target.x, cam.target.z), b = this.trBox
    cam.getTransformationMatrix().invertToRef(inv)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let j = 0; j < 4; j++) {
      Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 0, inv, k.a); Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 1, inv, k.b)
      k.b.subtractToRef(k.a, k.d).normalize()
      const r = k.d.y < -1e-3 ? Math.min((y0 - k.a.y) / k.d.y, SM_REACH) : SM_REACH, x = k.a.x + k.d.x * r, z = k.a.z + k.d.z * r
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z)
    }
    if (!Number.isFinite(x0 + x1 + z0 + z1)) return
    const need = Math.max(x1 - x0, z1 - z0) + 20
    const fits = b.set && x0 > b.x0 + 5 && z0 > b.z0 + 5 && x1 < b.x0 + b.size - 5 && z1 < b.z0 + b.size - 5 && b.size < 2 * need
    // (refit at most every TR_EVERY s too, a pan's included: the shadow fix; the view's edge may wait that long)
    if (!fits && b.set && this.trAt >= 0 && T - this.trAt < TR_EVERY && this.holdShare) return
    if (!fits) {
      const size = Math.min(1024, Math.max(64, 2 ** Math.ceil(Math.log2(need)))), tx = size / TR_N
      b.size = size; b.x0 = Math.floor(((x0 + x1) / 2 - size / 2) / tx) * tx; b.z0 = Math.floor(((z0 + z1) / 2 - size / 2) / tx) * tx; b.set = true
      this.trV.set(b.x0, b.z0, 1 / size, 0)
      for (const m of this.receivers) m.setVector4('uTrampleBox', this.trV)
    } else if (!(moved && T - this.trAt >= TR_EVERY) && this.trAt >= 0) return
    this.trAt = T
    const t0 = trNow()
    const acc = this.trAcc, out = this.trBuf, tx = b.size / TR_N
    acc.fill(0)
    const splat = (x: number, z: number, w: number) => {
      const i = Math.floor((x - b.x0) / tx), j = Math.floor((z - b.z0) / tx)
      if (i >= 0 && j >= 0 && i < TR_N && j < TR_N) acc[j * TR_N + i] += w
    }
    for (const h of this.hosts) {
      if (!h.lod[0].isEnabled() || h.hi.x < b.x0 || h.lo.x > b.x0 + b.size || h.hi.z < b.z0 || h.lo.z > b.z0 + b.size) continue
      const m = h.matrices
      for (let o = 0; o < m.length; o += 16) {
        const x = m[o + 12], z = m[o + 14], bx = m[o + 8], bz = m[o + 10]   // (+z in the figure's frame: behind him)
        splat(x, z, 1); for (const [d, w] of TR_TRAIL) splat(x + bx * d, z + bz * d, w)
      }
    }
    // a formation's density: a man to 0.55 m² (0.65 m files, 0.85 m ranks), his splats' weight
    const full = Math.max(1, tx * tx / 0.55 * TR_WEIGHT * 0.6)
    for (let j = 0; j < TR_N; j++) for (let i = 0; i < TR_N; i++) {
      let s = 0, n = 0
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, c = j + dj; if (a >= 0 && c >= 0 && a < TR_N && c < TR_N) { s += Math.min(1, acc[c * TR_N + a] / full) * (di || dj ? 1 : 2); n += di || dj ? 1 : 2 } }
      out[j * TR_N + i] = Math.round(255 * s / n)
    }
    this.trTex?.update(out)
    if (TRACE.on) { tr('trample'); tr('trampleMs', performance.now() - t0) }
  }

  /** the battalions' colours (?flags=0: none): one flag a battalion, in its uniform's flag colours, carried by the man
   *  at the line's centre in its second rank (the colour party), its cloth flying downwind; a thin instance each */
  setFlags(on: boolean): void {
    if (on && !this.flag) this.makeFlags()
    this.flag?.setEnabled(on)
  }
  private makeFlags(): void {
    const W = FLAG_W, H = FLAG_H, NX = 8, NY = 4, pos: number[] = [], part: number[] = [], idx: number[] = []
    // the cloth: a grid from the staff out, its foot FLAG_TOP - H up the staff
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { pos.push(i / NX * W, FLAG_TOP - H + j / NY * H, 0); part.push(0) }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i; idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1) }
    // the staff: two crossed strips from the ground to its top
    for (const [dx, dz] of [[0.03, 0], [0, 0.03]]) {
      const b = pos.length / 3
      pos.push(-dx, 0, -dz, dx, 0, dz, dx, FLAG_TOP + 0.15, dz, -dx, FLAG_TOP + 0.15, -dz); part.push(1, 1, 1, 1)
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
    const mesh = new Mesh('flags', this.scene)
    mesh.setVerticesData('position', pos, false, 3); mesh.setVerticesData('aPart', part, false, 1); mesh.setIndices(idx)
    const m = this.mats0.make('flags', FLAG_VS, FLAG_FS, { attributes: ['position', 'aPart', 'aC0', 'aC1', 'aC2', 'aPh'], uniforms: ['uFlagT', 'uFlagK'], defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE', `#define FLAG_W ${W.toFixed(2)}`, `#define FLAG_H ${H.toFixed(2)}`] })
    m.backFaceCulling = false; mesh.material = m; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true
    const n = this.hosts.length, cols = [new Float32Array(n * 3), new Float32Array(n * 3), new Float32Array(n * 3)], ph = new Float32Array(n)
    this.hosts.forEach((h, k) => {
      const f = this.uniforms[h.b.uniform].flag, c = (i: number) => Color3.FromHexString(f[Math.min(f.length - 1, Math.floor(i * f.length / 3))])
      for (let i = 0; i < 3; i++) c(i).toArray(cols[i], k * 3)
      ph[k] = (k * 0.618) % 1 * 3
    })
    this.flagM = new Float32Array(n * 16)
    mesh.thinInstanceSetBuffer('matrix', this.flagM, 16, false)
    cols.forEach((a, i) => mesh.thinInstanceSetBuffer(`aC${i}`, a, 3, true)); mesh.thinInstanceSetBuffer('aPh', ph, 1, true)
    this.flag = mesh; this.flagMat = m
    for (const h of this.hosts) this.placeFlag(h)
  }
  // the flag at its bearer: his place, the cloth turned to fly downwind (FLAG_WIND, rad from +x toward +z)
  private placeFlag(h: Host): void {
    if (!this.flagM) return
    const k = this.hosts.indexOf(h), o = k * 16, mo = this.bearer * 16, c = Math.cos(FLAG_WIND), s = Math.sin(FLAG_WIND), m = this.flagM
    m.set([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, h.matrices[mo + 12], h.matrices[mo + 13], h.matrices[mo + 14], 1], o)
    this.flagStale = true
  }

  /** the figures shown or not (the guard's ground alone), their shadows with them */
  show(on: boolean): void {
    for (const h of this.hosts) for (const m of h.lod) m.setEnabled(on)
    this.smStep = -1
  }

  /** figures drawn last frame, by LOD: battalions shown at that LOD and in the camera's view */
  drawn(): Record<string, number> {
    const out: Record<string, number> = {}, planes = this.scene.frustumPlanes
    this.data.lods.forEach((l, j) => {
      out[l.name] = this.hosts.reduce((a, h) => { const m = h.lod[j]; return a + (m.isEnabled() && m.isVisible && m.isInFrustum(planes) ? m.thinInstanceCount : 0) }, 0)
    })
    return out
  }
  get figures(): number { return this.hosts.length * this.slot.line.length }
  /** the battalions as placed (the tools aim their cameras at them) */
  get battalions(): Battalion[] { return this.hosts.map(h => h.b) }
}
