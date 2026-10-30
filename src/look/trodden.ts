// The trodden ground under the armies (?trample=0: none; docs/plans/active/armies-demo.md): one mask for the page, fed
// by every arm's men (decision 0075: the page-wide parts owned in one place, not by an arm), read by the ground and
// the grass (TRAMPLE). Moved from src/look/units.ts as it was; drawn after every arm has placed its men this frame
// (main.ts registers it after them). Also the view's corner rays the units' sun box reads (castView)
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Matrix, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { groundAt } from './heightfield.ts'
import { behind, isHidden } from './pose.ts'
import { D } from './spec.ts'
import { TR, TRACE, tr, trNow } from './trace.ts'

// the mask's texels a side; s between its redraws while men move
const TR_N = 256
/** s: the least time between two of the mask's redraws while men move (a box that moves redraws at once) */
export const TR_EVERY = 0.25
// m behind a man, weight
const TR_TRAIL = [
  [0.8, 0.9],
  [1.6, 0.8],
  [2.6, 0.6],
  [3.8, 0.4],
] as const
const TR_WEIGHT = 1 + TR_TRAIL.reduce((a, [, w]) => a + w, 0)
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1] // the view's corners in clip space
/** m: a view ray that meets no ground is cut here (the widest zoom looks far) */
export const VIEW_REACH = 900

/** An arm's men as the mask reads them: their weight (a man's tread: 1 a soldier), whether they moved since the mask
 *  last took them (trod: set by the arm, cleared by the mask when it draws), whether they show, and each unit's men's
 *  poses (x, y, z, his turn: src/look/pose.ts) with their bounds */
export interface TreadSource {
  readonly tread: number
  trod: boolean
  readonly isShown: boolean
  treadUnits(): Iterable<{ pose: Float32Array; lo: Vector3; hi: Vector3 }>
}

/** Whether the mask is drawn this frame, its box held (not refitted): only when some arm's men moved since it was last
 *  drawn (pending: the arms' trod flags, kept until a draw takes them, so a column that halts between two draws is
 *  trodden where it halted) and TR_EVERY s have passed since (at, the clock when last drawn; −1: never, drawn now) */
export function treadDue(pending: boolean, T: number, at: number): boolean {
  return at < 0 || (pending && T - at >= TR_EVERY)
}
/** Whether the mask is drawn at T, its box held, the mask last drawn at `at` (treadDue): the arms' trod flags read and,
 *  only when it is drawn, cleared (a flag cleared undrawn lost a halting column's last steps) */
export function takeSteps(sources: readonly { trod: boolean }[], T: number, at: number): boolean {
  if (
    !treadDue(
      sources.some(s => s.trod),
      T,
      at,
    )
  ) {
    return false
  }
  for (const s of sources) s.trod = false
  return true
}

/** The view's corner rays (origin and direction, rays: 4 × 6) and where they meet the ground at the focus's height
 *  (quad: 4 × (x, z)), the focus's ground above the eye replaced by a plane the camera's clearance under it (the
 *  closest zooms over a slope); a ray that meets no ground is cut at VIEW_REACH m */
export function castView(
  cam: ArcRotateCamera,
  rays: Float64Array,
  quad: Float64Array,
  k: { inv: Matrix; a: Vector3; b: Vector3; d: Vector3 },
): void {
  const y0 = groundAt(cam.target.x, cam.target.z)
  cam.getTransformationMatrix().invertToRef(k.inv)
  for (let j = 0; j < 4; j++) {
    Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 0, k.inv, k.a)
    Vector3.TransformCoordinatesFromFloatsToRef(CORNERS[j * 2], CORNERS[j * 2 + 1], 1, k.inv, k.b)
    k.b.subtractToRef(k.a, k.d).normalize()
    // (the focus's ground above the eye, looking up a slope at the closest zooms: a plane the clearance under the eye
    // instead, so the quad stays ahead of the camera, not collapsed to it or behind it)
    const yp = Math.min(y0, k.a.y - D.spec.camera.clearance)
    const o = j * 6
    const r = k.d.y < -1e-3 ? Math.max(0, Math.min((yp - k.a.y) / k.d.y, VIEW_REACH)) : VIEW_REACH
    rays[o] = k.a.x
    rays[o + 1] = k.a.y
    rays[o + 2] = k.a.z
    rays[o + 3] = k.d.x
    rays[o + 4] = k.d.y
    rays[o + 5] = k.d.z
    quad[j * 2] = k.a.x + k.d.x * r
    quad[j * 2 + 1] = k.a.z + k.d.z * r
  }
}

/** The view's corner rays and their ground quad (castView), cast once a frame for every reader (the trodden mask, the
 *  figures' sun box): made before them, so its observer runs first */
export class ViewRays {
  /** 4 × (origin, direction) */
  readonly rays = new Float64Array(24)
  /** 4 × (x, z) where they meet the ground at the focus's height */
  readonly quad = new Float64Array(8)
  private readonly k = { inv: new Matrix(), a: new Vector3(), b: new Vector3(), d: new Vector3() }
  constructor(scene: Scene, camera: ArcRotateCamera) {
    scene.onBeforeRenderObservable.add(() => castView(camera, this.rays, this.quad, this.k))
  }
}

/** The trodden ground's mask: TR_N² over an axis-aligned world box round the ground in view (where its corner rays meet
 *  the ground at the focus's height), a power of two metres wide (64 to 1,024), held while it covers the view and is
 *  under twice the size the view needs. Drawn again when the box moves, or at most TR_EVERY s apart while men move:
 *  each man splats where he stands and, fainter, up to five steps behind him (the ground just behind the ranks), by
 *  his arm's tread, normalised by how many men a texel holds in a formation, then blurred once (no texel edge) */
export class Trodden {
  private readonly sources: TreadSource[] = []
  private on = false
  private tex: RawTexture | null = null
  private readonly buf = new Uint8Array(TR_N * TR_N)
  private readonly acc = new Float32Array(TR_N * TR_N)
  private readonly box = { x0: 0, z0: 0, size: 64, set: false }
  private readonly boxV = new Vector4()
  private at = -1 // the clock when the mask was last drawn
  private wall = -Infinity // the wall's clock (ms) when its box was last fitted
  private readonly back = [0, 0] // (the way behind a man: behind)
  /** the box's slack held in proportion (?smhold=fixed: refitted at once, false) */
  holdShare = true

  private readonly scene: Scene
  private readonly view: ViewRays
  private readonly receivers: readonly ShaderMaterial[]
  private readonly clock: () => number
  /** view: the frame's corner rays (ViewRays); receivers: the painted materials that read the mask (the ground and
   *  the grass); clock: the page's. Drawn before each frame, after the observers made before it (main.ts makes it
   *  after the arms: their men placed this frame) */
  constructor(scene: Scene, view: ViewRays, receivers: readonly ShaderMaterial[], clock: () => number) {
    this.scene = scene
    this.view = view
    this.receivers = receivers
    this.clock = clock
    scene.onBeforeRenderObservable.add(() => this.frame())
  }

  /** an arm whose men tread the ground */
  add(s: TreadSource): void {
    this.sources.push(s)
  }

  /** the mask on or off (?trample=0): the receivers compile with it or without */
  setOn(on: boolean): void {
    this.on = on
    if (on && !this.tex) {
      this.tex = new RawTexture(
        this.buf,
        TR_N,
        TR_N,
        Constants.TEXTUREFORMAT_R,
        this.scene,
        false,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      )
      this.tex.name = 'trampleMask'
      this.tex.wrapU = this.tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
    }
    for (const m of this.receivers) {
      m.setDefine('#define TRAMPLE', on)
      if (this.tex) m.setTexture('uTrample', this.tex)
    }
    this.box.set = false
  }

  private frame(): void {
    if (!this.on) return
    this.draw(this.clock())
  }

  /** the box refitted to the view when it must, the mask drawn when it is due (treadDue) or refitted */
  private draw(T: number): void {
    const b = this.box
    const q = this.view.quad
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
    const refit = !contains || (!fits && !(this.holdShare && wall - this.wall < TR_EVERY * 1000))
    if (refit) {
      const size = Math.min(1024, Math.max(64, 2 ** Math.ceil(Math.log2(need))))
      const tx = size / TR_N
      b.size = size
      b.x0 = Math.floor(((x0 + x1) / 2 - size / 2) / tx) * tx
      b.z0 = Math.floor(((z0 + z1) / 2 - size / 2) / tx) * tx
      b.set = true
      this.boxV.set(b.x0, b.z0, 1 / size, 0)
      for (const m of this.receivers) m.setVector4('uTrampleBox', this.boxV)
      this.wall = wall
      for (const s of this.sources) s.trod = false
    } else if (!takeSteps(this.sources, T, this.at)) return
    this.at = T
    const t0 = trNow()
    this.splatAll()
    this.tex?.update(this.buf)
    if (TRACE.on) {
      tr(TR.trample)
      tr(TR.trampleMs, performance.now() - t0)
    }
  }

  /** every shown arm's men in the box into the mask (acc), normalised and blurred into its texels (buf) */
  private splatAll(): void {
    const b = this.box
    const acc = this.acc
    const out = this.buf
    const tx = b.size / TR_N
    acc.fill(0)
    const splat = (x: number, z: number, w: number) => {
      const i = Math.floor((x - b.x0) / tx)
      const j = Math.floor((z - b.z0) / tx)
      if (i >= 0 && j >= 0 && i < TR_N && j < TR_N) acc[j * TR_N + i] += w
    }
    for (const s of this.sources) {
      if (!s.isShown) continue
      const k = s.tread
      for (const h of s.treadUnits()) {
        if (h.hi.x < b.x0 || h.lo.x > b.x0 + b.size || h.hi.z < b.z0 || h.lo.z > b.z0 + b.size) continue
        const p = h.pose
        const back = this.back
        for (let o = 0; o < p.length; o += 4) {
          // (a man not drawn: none)
          if (isHidden(p[o + 1])) continue
          const x = p[o]
          const z = p[o + 2]
          behind(p[o + 3], back)
          splat(x, z, k)
          for (const [d, w] of TR_TRAIL) splat(x + back[0] * d, z + back[1] * d, w * k)
        }
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
  }
}
