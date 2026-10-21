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
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Frustum } from '@babylonjs/core/Maths/math.frustum.js'
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { SUN, type Materials } from './materials.ts'
import { D } from './spec.ts'
import UNITS_VS from './shaders/units.vert?raw'
import UNITS_FS from './shaders/units.frag?raw'
import DEPTH_FS from './shaders/depth.frag?raw'
import { groundAt } from './heightfield.ts'
import { mulberry } from './noise.ts'
import type { UnitData } from './units-data.ts'
import { CYCLE, SIDES, manAt, phaseAt, slots, type Battalion, type Drill, type ManState, type Phase } from './world/armies.ts'

const ROLES = ['halt', 'march', 'run', 'fire'] as const

interface Host {
  b: Battalion; lod: Mesh[]; near: boolean; matrices: Float32Array; settings: Float32Array; jitter: Float32Array
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
const SM_COARSE = 1.3  // and be at most this many times the size the view needs (its texels no coarser)

export class Units {
  readonly data: UnitData
  private hosts: Host[] = []
  private lods: Mesh[] = []
  private readonly mats: ShaderMaterial[] = []   // one a side: its palette
  private depthMat: ShaderMaterial
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
  casterNear = true
  readonly meshes: Mesh[] = []
  private smStep = -1                       // the step the map was last drawn at
  private smVP = new Float32Array(16)       // the sun's view-projection it was drawn with
  private smList: Mesh[] = []               // and its casters
  private smBox = { ex: 0, ey: 0, V: new Matrix(), c: new Vector3(), set: false }   // the sun's box held while it covers the view (lazy only)
  /** the shadow map's draws so far (the captures count them: a still frame draws none) */
  smDraws = 0

  /** receivers: the painted materials the figures' shadows fall on (the ground and the grass); the page's clock */
  private readonly scene: Scene; private readonly camera: ArcRotateCamera; private readonly receivers: ShaderMaterial[]
  private readonly drill: Drill; private readonly clock: () => number
  constructor(scene: Scene, camera: ArcRotateCamera, mats: Materials, receivers: ShaderMaterial[], data: UnitData, drill: Drill, battalions: Battalion[], clock: () => number) {
    this.scene = scene; this.camera = camera; this.receivers = receivers; this.drill = drill; this.clock = clock
    this.data = data
    if (data.lods.length !== 2) throw new Error(`units: drawn with two LODs, the data has ${data.lods.length}`)
    for (const r of ROLES) if (!data.ranges[r]) throw new Error(`units: the figure has no clips for the role ${r} (tools/bake-figure.py)`)
    this.slot = slots(drill)
    this.speed = { march: data.ranges.march.speed, run: data.ranges.run.speed }
    if (!(this.speed.march > 0 && this.speed.run > 0)) throw new Error('units: the march and run roles have no root speed')
    const vat = RawTexture.CreateRGBATexture(data.vat.data, data.vat.width, data.vat.height, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_HALF_FLOAT)
    vat.name = 'figureVAT'
    const attributes = ['position', 'normal', 'aRole', 'aBones', 'aWeights', 'aVAT'], n = data.palette.length
    for (const side of SIDES) {
      const m = mats.make(`units_${side.name}`, UNITS_VS, UNITS_FS, { attributes, uniforms: ['uVATTime', 'uPal'], samplers: ['uVAT'], defines: ['#define NOSNOW', '#define KEEP_HUE', '#define BOUNCE', `#define PAL_N ${n}`] })
      m.setTexture('uVAT', vat)
      // the side's colour for each of the bake's roles (a role the side does not name: a loud failure)
      m.setColor3Array('uPal', data.palette.map(r => { const hex = side.palette[r]; if (!hex) throw new Error(`units: ${side.name} has no colour for the role ${r}`); return Color3.FromHexString(hex) }))
      this.mats.push(m)
    }
    // the shadow pass: the same skinning, depth only, from an orthographic camera along the sun
    this.depthMat = new ShaderMaterial('unitsDepth', scene, { vertexSource: UNITS_VS, fragmentSource: DEPTH_FS }, { attributes, uniforms: ['world', 'viewProjection', 'uVATTime'], samplers: ['uVAT'], defines: ['#define DEPTH'] })
    this.depthMat.setTexture('uVAT', vat)
    this.sun = new FreeCamera('unitSun', SUN.scale(500), scene); this.sun.mode = Camera.ORTHOGRAPHIC_CAMERA; this.sun.minZ = 1; this.sun.maxZ = 1200
    this.shadowRT = new RenderTargetTexture('unitSM', { width: SM_SIZE, height: SM_SIZE }, scene, false, true, Constants.TEXTURETYPE_FLOAT, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE, true, false, false, Constants.TEXTUREFORMAT_R)
    this.shadowRT.activeCamera = this.sun; this.shadowRT.clearColor = new Color4(1, 1, 1, 1)
    this.shadowRT.renderList = this.meshes; this.shadowRT.getCustomRenderList = () => this.culled
    // a far LOD caster of a battalion drawn near is hidden from the view: shown to the map alone, while it draws
    const shown: Mesh[] = []
    this.shadowRT.onBeforeRenderObservable.add(() => { this.smDraws++; for (const m of this.culled) if (!m.isVisible) { m.isVisible = true; shown.push(m) } })
    this.shadowRT.onAfterRenderObservable.add(() => { for (const m of shown) m.isVisible = false; shown.length = 0 })
    for (const m of receivers) {
      m.setTexture('uUnitSM', this.shadowRT); m.setVector2('uUnitTexel', new Vector2(1 / SM_SIZE, 1 / SM_SIZE))
      m.setFloat('uUnitBias', SM_BIAS / (this.sun.maxZ - this.sun.minZ)); m.setMatrix('uUnitVP', Matrix.Identity())
    }
    for (const l of data.lods) {
      const m = data.mesh[l.name], mesh = new Mesh(`figure_${l.name}`, scene)
      mesh.setVerticesData('position', m.positions, false, 3); mesh.setVerticesData('normal', m.normals, false, 3)
      mesh.setVerticesData('aRole', Float32Array.from(m.roles), false, 1)
      mesh.setVerticesData('aBones', Float32Array.from(m.boneIndices), false, 4); mesh.setVerticesData('aWeights', m.boneWeights, false, 4)
      // (the battalions' hosts are its clones; it is never drawn, but a mesh without a material makes Babylon reach for
      // its default StandardMaterial, which the page does not import: the readiness of the bench and the tools threw)
      mesh.material = this.mats[0]
      mesh.setIndices(m.indices); mesh.setEnabled(false); this.lods.push(mesh)
    }
    for (const b of battalions) this.add(b)
    scene.onBeforeRenderObservable.add(() => this.frame())
  }

  private add(b: Battalion): void {
    const men = this.slot.line.length
    const lod = this.lods.map(src => {
      const host = src.clone(`${src.name}_${this.hosts.length}`)
      // thin-instance matrices are vertex buffers on the geometry, and clones share it: without its own geometry
      // every battalion would draw with the last one's men
      host.makeGeometryUnique()
      host.material = this.mats[b.side]
      host.isPickable = false; host.setEnabled(true); host.alwaysSelectAsActiveMesh = false; this.meshes.push(host)
      this.shadowRT.setMaterialForRendering(host, this.depthMat)
      return host
    })
    const rnd = mulberry(1 + this.hosts.length * 7919), jitter = new Float32Array(men * 4)   // ±3 cm, ±4°, a man's own lag: no two alike
    for (let i = 0; i < men; i++) { jitter[i * 4] = (rnd() - 0.5) * 0.06; jitter[i * 4 + 1] = (rnd() - 0.5) * 0.06; jitter[i * 4 + 2] = (rnd() - 0.5) * 0.14; jitter[i * 4 + 3] = rnd() * 2 - 1 }
    const matrices = new Float32Array(men * 16), settings = new Float32Array(men * 4)
    for (const m of lod) { m.thinInstanceSetBuffer('matrix', matrices, 16, false); m.thinInstanceSetBuffer('aVAT', settings, 4, false) }
    this.hosts.push({ b, lod, near: false, matrices, settings, jitter, cx: b.x, cz: b.z, lo: new Vector3(), hi: new Vector3(), step: -1, phase: null, stale: [true, true], staleSet: [true, true], cycle: -1 })
  }

  // every man's matrix and clip at the battalion's local time: his place and facing from the script, set on the ground;
  // his clip's range, and its phase so its step 0 falls when his role began (the clock's steps less his start's)
  private place(h: Host, local: number, cycleStart: number): void {
    const { b, matrices, settings, jitter } = h, c = Math.cos(b.heading), s = Math.sin(b.heading), fps = this.data.fps, man = this.man
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, changed = false
    const p = phaseAt(this.drill, local, this.speed.march, this.speed.run)
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
    h.stale[0] = h.stale[1] = true
    if (changed) h.staleSet[0] = h.staleSet[1] = true
  }

  private frame(): void {
    const T = this.clock(), step = Math.floor(T * this.data.fps)
    for (const m of this.mats) m.setFloat('uVATTime', T)
    this.depthMat.setFloat('uVATTime', T)
    const cam = this.camera, engine = this.scene.getEngine()
    // pixels per metre at unit distance, from the projection itself
    const pxPerM = cam.getProjectionMatrix().m[5] * engine.getRenderHeight() / 2, camPos = cam.globalPosition
    let moved = step !== this.smStep   // (the map changes with the poses' step, the men's places, the casters' LOD)
    for (const h of this.hosts) {
      if (!h.lod[0].isEnabled()) continue
      const t = T - h.b.offset, cycle = Math.floor(t / CYCLE), local = t - cycle * CYCLE, cycleStart = T - local
      const p = phaseAt(this.drill, local, this.speed.march, this.speed.run).phase
      // a battalion's men are written when they move (a marching or deploying one once a step), else once a phase
      const moving = p === 'column' || p === 'deploy'
      if (h.step < 0 || h.cycle !== cycle || h.phase !== p || (moving && step !== h.step)) { this.place(h, local, cycleStart); h.step = step; h.phase = p; h.cycle = cycle; moved = true }
      const px = FIGURE * pxPerM / Math.max(1, Math.hypot(camPos.x - h.cx, camPos.y - groundAt(h.cx, h.cz), camPos.z - h.cz))
      const near = h.near ? px >= this.lodPx * 0.9 : px >= this.lodPx * 1.1
      if (near !== h.near && this.casterNear) moved = true
      h.near = near; h.lod[0].isVisible = near; h.lod[1].isVisible = !near
      // the LOD drawn, and the far LOD when it casts for a battalion drawn near; the hidden one is updated when drawn again
      for (let k = 0; k < 2; k++) {
        if (k !== (near ? 0 : 1) && !(k === 1 && this.shadows && !this.casterNear)) continue
        if (h.stale[k]) { h.lod[k].thinInstanceBufferUpdated('matrix'); h.stale[k] = false }
        if (h.staleSet[k]) { h.lod[k].thinInstanceBufferUpdated('aVAT'); h.staleSet[k] = false }
      }
    }
    if (!this.shadows) return
    const refit = this.fitSun()
    if (!this.lazyShadows) return
    if (moved || refit) { this.shadowRT.resetRefreshCounter(); this.smStep = step }
  }

  // The sun's orthographic box around the ground in view: where the view's corner rays meet the lowest and the
  // highest ground (cut at SM_REACH), padded for a figure's height, so the map's texels go where the camera looks.
  // Its centre snaps to whole texels along the sun's fixed view axes and its size moves in SM_STEP steps, so the
  // texel grid stays put under still figures while the view pans or zooms (the crowd bench's L1b). Lazy (lazyShadows),
  // the box is held while it still covers the view with SM_HOLD m to spare and is at most SM_COARSE times the size the
  // view needs, so a small move of the camera draws no new map. Returns whether the map's view or casters changed
  private fitSun(): boolean {
    const cam = this.camera, k = this.scratch, inv = k.inv, g = D.spec.ground
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
    let V = this.sun.getViewMatrix(true), ex = 0, ey = 0
    for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
      k.v.copyFrom(k.pts[i]); k.v.y += e ? 3 : -2; Vector3.TransformCoordinatesToRef(k.v, V, k.v)
      ex = Math.max(ex, Math.abs(k.v.x)); ey = Math.max(ey, Math.abs(k.v.y))
    }
    ex = Math.ceil((ex + 4) / SM_STEP) * SM_STEP; ey = Math.ceil((ey + 4) / SM_STEP) * SM_STEP
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
    const vp = k.vp; V.multiplyToRef(this.sun.getProjectionMatrix(true), vp)
    for (const r of this.receivers) r.setMatrix('uUnitVP', vp)
    Frustum.GetPlanesToRef(vp, this.planes)
    let changed = false
    for (let i = 0; i < 16; i++) if (vp.m[i] !== this.smVP[i]) { changed = true; this.smVP[i] = vp.m[i] }
    return this.cull() || changed
  }

  // the held box covers the view's points (fitSun's, the figures' height above them) with SM_HOLD m to spare
  private covers(n: number): boolean {
    const k = this.scratch, b = this.smBox
    for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
      k.v.copyFrom(k.pts[i]); k.v.y += e ? 3 : -2; Vector3.TransformCoordinatesToRef(k.v, b.V, k.v)
      if (Math.abs(k.v.x) > b.ex - SM_HOLD || Math.abs(k.v.y) > b.ey - SM_HOLD) return false
    }
    return true
  }

  // only the battalions inside the sun's box are drawn into the map (a render target does not cull its list), each at
  // the caster's LOD; whether the list changed
  private cull(): boolean {
    const was = this.smList; was.length = 0; for (const m of this.culled) was.push(m)
    this.culled.length = 0
    for (const h of this.hosts) { const l = h.lod[this.casterNear && h.near ? 0 : 1]; if (h.lod[0].isEnabled() && l.isInFrustum(this.planes)) this.culled.push(l) }
    return was.length !== this.culled.length || was.some((m, i) => m !== this.culled[i])
  }

  /** the figures' cast shadows on or off: off, the receivers compile without them (the bench's baseline arm) */
  setShadows(on: boolean): void {
    if (on === this.shadows) return
    this.shadows = on
    const list = this.scene.customRenderTargets, i = list.indexOf(this.shadowRT)
    if (on && i < 0) list.push(this.shadowRT)
    if (!on && i >= 0) list.splice(i, 1)
    // lazy: drawn once, then again only when frame() resets it (a still view between two steps draws nothing)
    this.shadowRT.refreshRate = this.lazyShadows ? 0 : 1
    if (on) { this.smBox.set = false; this.smStep = -1 }   // (fitted by the next frame)
    for (const m of this.receivers) m.setDefine('#define UNIT_SHADOWS', on)
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
