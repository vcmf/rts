// The lit map view (docs/plans/active/m6-lit-view.md, M6a; decisions 0055, 0058): a compiled map drawn as the lit
// map on its own canvas with Babylon, as one flat plane over the map's extent seen through a camera that leans a
// little off straight down. The light (the sun's soft shadow, the sky; decision 0090) and the water come from the bakes
// (./bake.ts), the slope's light and the contours from the node heights; no woods are drawn for now (G2). It draws on
// demand (render), and projects world points to the screen and back for what the page draws over it.
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { Scene } from '@babylonjs/core/scene.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import type { Season } from '../../map/schema.ts'
import { BUILDING_BZ, INK_RANGE, SUN, sunXZ, type LightBake, type Sun } from './bake.ts'
import { paperCanvas } from './paper.ts'
import { bridged, shadowQuads, triangulate, type Standing } from './houses.ts'
import LIT_VS from './shaders/lit.vert?raw'
import LIT_FS from './shaders/lit.frag?raw'
import LIGHT from './shaders/light.glsl?raw'
import HOUSES_VS from './shaders/houses.vert?raw'
import HOUSES_FS from './shaders/houses.frag?raw'
import SHADOWS_FS from './shaders/shadows.frag?raw'

const FOV = 0.52 // rad, vertical (the prototype's)
// the overlays' near limit, as a share of the camera's distance to the centre: a ground point nearer the camera's
// plane is not drawn (it would project to huge or mirrored coordinates)
const NEAR_SHARE = 0.05
export const TILT = 20 // degrees off straight down (decision 0055)
// the light and the print (decision 0090, after Track K's campaign map, its prototype on #262): the print multiplied
// by a warm sun (KEY) on the slope, in its baked shadow, and a cool sky (SKY) in its baked share, the sky SKY_K of the
// light; the light a little stronger on the sun's side of the map (LAMP); never darker than the floor
// (0 by default: the readability bound, #141, is checked when the armies are on the map)
const KEY = [1.3, 0.98, 0.66]
const SKY = [0.82, 0.88, 1.08]
const SKY_K = 0.25
const LAMP = 0.55
// the paper by season, a cold white (Track K's), a touch cooler in winter: summer, early autumn, late autumn, winter
const PAPER = ['#eceef1', '#eceef1', '#ebecee', '#eef0f3']
// the water by its depth, a pale shallow blue to a deep blue, in steps (Track K's stepped basins, flat here)
const SHALLOW = '#a9d0ec'
const DEEP = '#2b67b0'
// the contours: the minor lines a muted grey, the index lines orange (Track K's)
const CONTOUR_MINOR = '#a9a7ae'
const CONTOUR_INDEX = '#d08450'
const LINE = ['#2b2824', '#2b2824', '#2b2824', '#363c45']
const BARRIER = '#3a4528' // hedges and walls, a dark olive
// the buildings' tone, a share of the paper's colour: the ground's paper with its grain is about 0.93 of it, so a
// house is a little darker (the owner, G2b: "cold white, maybe a tiny bit darker"), a church a little more
const HOUSE_TONE = 0.88
const SHADOW_Y = 0.05 // m: the buildings' shadows over the paper
const CHURCH_TONE = 0.83
const SEASON_AT: Record<Season, number> = { spring: 0, summer: 0, autumn: 1.5, winter: 3 }

/** What the view draws: a compiled map's grids and bakes. */
export interface LitMap {
  x0: number
  z0: number
  cell: number
  nx: number // cells
  nz: number
  datum: number // m above sea level of the map's zero
  season: Season
  sun: Sun // the sun the light was baked for
  z: number // the heights' exaggeration it was baked with (the slope's light takes the same)
  height: Float64Array // (nx + 1) × (nz + 1) node heights, m above the datum, the south row first
  light: LightBake // RGBA on every step-th node (bakeLight)
  masks: Uint8Array // RGBA on the cells (bakeMasks)
  ink: Uint8Array // RGBA on the cells (bakeInk)
  flat: { w: number; h: number; rgba: Uint8Array } // the draft raster, the north row first
}

/** The light's settings the page may tune by eye (undefined: the view's own). */
export interface LitTuning {
  sky?: number // the sky's share of the light (SKY_K)
  lamp?: number // the light's fall-off across the map from the sun's side (LAMP)
  floor?: number // the darkest the light may make the print (0)
}

/** The camera: the world point at the screen's centre, pixels per metre there, and the tilt in degrees. */
export interface LitCamera {
  cx: number
  cz: number
  ppm: number
  tilt: number
}

const seasonColour = (table: string[], s: number): Color3 => {
  const i = Math.min(table.length - 2, Math.floor(s))
  return Color3.Lerp(Color3.FromHexString(table[i]), Color3.FromHexString(table[i + 1]), s - i)
}

export class LitView {
  private readonly engine: Engine
  private readonly scene: Scene
  private readonly camera: FreeCamera
  private readonly material: ShaderMaterial
  private readonly houseMaterial: ShaderMaterial
  private readonly shadowMaterial: ShaderMaterial
  // the materials the ground's light falls on: the plane's, the buildings' and their shadows' (G2b)
  private readonly lit: ShaderMaterial[]
  private sun: Sun = SUN // the compile's (setMap), the map's own until then: the buildings' shadows are cast by it
  private plane: Mesh | null = null
  private houses: Mesh[] = []
  private overlay: RawTexture | null = null
  private readonly noOverlay: RawTexture
  private grid: { nx: number; nz: number } | null = null
  private textures: Texture[] = []
  private viewProj = Matrix.Identity()
  private inverse = Matrix.Identity()
  private rect = { w: 1, h: 1 }
  private nearW = 1
  private flat = 0
  private readonly canvas: HTMLCanvasElement

  /** Throws when the browser has no WebGL2 (the shader reads its heights with texelFetch; decision 0046). */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    // doNotHandleContextLost: Babylon would otherwise keep every texture's source bytes to restore a lost context
    // (144 MB at 6 km); a lost context is reported (onLost) and the page recompiles
    this.engine = new Engine(
      canvas,
      true,
      { preserveDrawingBuffer: true, stencil: true, doNotHandleContextLost: true },
      false,
    )
    if (this.engine.webGLVersion < 2) {
      this.engine.dispose()
      throw new Error('the lit map view needs WebGL2 (decision 0046)')
    }
    this.engine.setHardwareScalingLevel(1 / Math.min(2, devicePixelRatio || 1))
    this.scene = new Scene(this.engine)
    this.scene.skipPointerMovePicking = true
    this.scene.clearColor = new Color4(0.87, 0.84, 0.78, 1)
    this.camera = new FreeCamera('map', new Vector3(0, 1000, 0), this.scene)
    this.camera.inputs.clear()
    this.camera.fov = FOV
    this.material = new ShaderMaterial(
      'lit',
      this.scene,
      { vertexSource: LIT_VS, fragmentSource: LIT_FS.replace('#include <light>', LIGHT) },
      {
        attributes: ['position'],
        uniforms: [
          'world',
          'viewProjection',
          'uX0Z0',
          'uSize',
          'uNodes',
          'uSun',
          'uKey',
          'uSkyC',
          'uSkyK',
          'uLamp',
          'uFloor',
          'uZ',
          'uLightNodes',
          'uLightStep',
          'uCell',
          'uDatum',
          'uFlat',
          'uPaper',
          'uShallow',
          'uDeep',
          'uContourMinor',
          'uContourIndex',
          'uLine',
          'uBarrier',
          'uInkRange',
          'uOverlayOn',
        ],
        samplers: ['uHeight', 'uLight', 'uMask', 'uInk', 'uPaperT', 'uFlatT', 'uOverlay'],
      },
    )
    this.material.backFaceCulling = false
    // the buildings, lit by the ground's light, and their shadows on the ground in it (G2b): the light's uniforms and
    // textures set on all three materials (lit)
    const light = [
      'uX0Z0',
      'uSize',
      'uNodes',
      'uLightNodes',
      'uCell',
      'uDatum',
      'uZ',
      'uLightStep',
      'uSkyK',
      'uLamp',
      'uFloor',
      'uSun',
      'uPaper',
      'uKey',
      'uSkyC',
    ]
    this.houseMaterial = new ShaderMaterial(
      'houses',
      this.scene,
      { vertexSource: HOUSES_VS, fragmentSource: HOUSES_FS.replace('#include <light>', LIGHT) },
      {
        attributes: ['position', 'normal', 'color'],
        uniforms: ['world', 'viewProjection', ...light, 'uEye'],
        samplers: ['uHeight', 'uLight'],
      },
    )
    this.houseMaterial.backFaceCulling = false
    // the shadows multiply the frame (dst × src), each pixel once however many overlap there: the first marks the
    // stencil, the others fail it
    this.shadowMaterial = new ShaderMaterial(
      'house-shadows',
      this.scene,
      { vertexSource: LIT_VS, fragmentSource: SHADOWS_FS.replace('#include <light>', LIGHT) },
      {
        attributes: ['position'],
        uniforms: ['world', 'viewProjection', ...light],
        samplers: ['uHeight', 'uLight'],
        needAlphaBlending: true,
      },
    )
    this.shadowMaterial.alphaMode = Constants.ALPHA_MULTIPLY
    this.shadowMaterial.disableDepthWrite = true
    this.shadowMaterial.stencil.enabled = true
    this.shadowMaterial.stencil.func = Constants.NOTEQUAL
    this.shadowMaterial.stencil.funcRef = 1
    this.shadowMaterial.stencil.opStencilDepthPass = Constants.REPLACE
    this.shadowMaterial.backFaceCulling = false
    this.lit = [this.material, this.houseMaterial, this.shadowMaterial]
    this.houseMaterial.setVector3('uEye', this.camera.position)
    const paper = paperCanvas()
    const t = this.rgba(paper, Texture.TRILINEAR_SAMPLINGMODE, true)
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE
    this.material.setTexture('uPaperT', t)
    for (const m of this.lit) {
      m.setColor3('uKey', Color3.FromArray(KEY))
      m.setColor3('uSkyC', Color3.FromArray(SKY))
    }
    this.material.setColor3('uShallow', Color3.FromHexString(SHALLOW))
    this.material.setColor3('uDeep', Color3.FromHexString(DEEP))
    this.material.setColor3('uContourMinor', Color3.FromHexString(CONTOUR_MINOR))
    this.material.setColor3('uContourIndex', Color3.FromHexString(CONTOUR_INDEX))
    this.setTuning({})
    // no overlay: a texel of nothing, so the sampler is always bound to a live texture
    this.noOverlay = new RawTexture(
      new Uint8Array(4),
      1,
      1,
      Constants.TEXTUREFORMAT_RGBA,
      this.scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    )
    this.material.setTexture('uOverlay', this.noOverlay)
    this.material.setFloat('uOverlayOn', 0)
  }

  /** Sets the light's settings (G2: tuned by eye from the page's URL); an absent one takes the view's own. */
  setTuning(t: LitTuning): void {
    // each within 0..1: a sky's share past 1 turns the light's divisor negative
    const unit = (v: number | undefined, d: number) => Math.min(1, Math.max(0, v ?? d))
    for (const m of this.lit) {
      m.setFloat('uSkyK', unit(t.sky, SKY_K))
      m.setFloat('uLamp', unit(t.lamp, LAMP))
      m.setFloat('uFloor', unit(t.floor, 0))
    }
  }

  // a canvas's pixels as an RGBA texture (the paper's: kept for the view's life)
  private rgba(c: HTMLCanvasElement, sampling: number, mips: boolean): RawTexture {
    const data = new Uint8Array(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.buffer)
    return new RawTexture(data, c.width, c.height, Constants.TEXTUREFORMAT_RGBA, this.scene, mips, false, sampling)
  }

  /** Draws another map (or the same one recompiled): its textures and plane replace the last ones. */
  setMap(m: LitMap): void {
    for (const t of this.textures) t.dispose()
    this.textures = []
    this.plane?.dispose()
    const W = m.nx * m.cell
    const H = m.nz * m.cell
    const nodes = new Float32Array(m.height) // a float texture of the node heights, read texel by texel
    const tex = (
      data: ArrayBufferView,
      w: number,
      h: number,
      format: number,
      sampling: number,
      type = Constants.TEXTURETYPE_UNSIGNED_BYTE,
    ) => {
      const t = new RawTexture(data, w, h, format, this.scene, false, false, sampling, type)
      t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
      this.textures.push(t)
      return t
    }
    const height = tex(
      nodes,
      m.nx + 1,
      m.nz + 1,
      Constants.TEXTUREFORMAT_R,
      Texture.NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    )
    const rgba = Constants.TEXTUREFORMAT_RGBA
    const linear = Texture.BILINEAR_SAMPLINGMODE
    const light = tex(m.light.data, m.light.nx, m.light.nz, rgba, linear)
    // neither the mask nor the ink's fields mipmapped: averaged, a brook or a hedge two cells wide would vanish from
    // the far view, and the water's depth would part from its fill (docs/plans/active/m6-lit-view.md, open: a
    // min-filtered mip chain for the far view)
    this.material.setTexture('uMask', tex(m.masks, m.nx, m.nz, rgba, linear))
    this.material.setTexture('uInk', tex(m.ink, m.nx, m.nz, rgba, linear))
    this.material.setFloat('uInkRange', INK_RANGE)
    this.material.setTexture('uFlatT', tex(m.flat.rgba, m.flat.w, m.flat.h, rgba, Texture.NEAREST_SAMPLINGMODE))
    // toward the sun, x east, y up, z north
    this.sun = m.sun
    const [sx, sz] = sunXZ(m.sun)
    const el = (m.sun.el * Math.PI) / 180
    const s = SEASON_AT[m.season]
    for (const mat of this.lit) {
      mat.setTexture('uHeight', height)
      mat.setVector2('uNodes', new Vector2(m.nx + 1, m.nz + 1))
      mat.setFloat('uDatum', m.datum)
      mat.setFloat('uZ', m.z)
      mat.setTexture('uLight', light)
      mat.setVector2('uLightNodes', new Vector2(m.light.nx, m.light.nz))
      mat.setFloat('uLightStep', m.light.step)
      mat.setVector2('uX0Z0', new Vector2(m.x0, m.z0))
      mat.setVector2('uSize', new Vector2(W, H))
      mat.setFloat('uCell', m.cell)
      mat.setVector3('uSun', new Vector3(sx * Math.cos(el), Math.sin(el), sz * Math.cos(el)))
      mat.setColor3('uPaper', seasonColour(PAPER, s))
    }
    this.grid = { nx: m.nx, nz: m.nz }
    this.setOverlay(null) // the last map's overlay is not this one's
    this.material.setColor3('uLine', seasonColour(LINE, s))
    this.material.setColor3('uBarrier', Color3.FromHexString(BARRIER))
    this.material.setFloat('uFlat', this.flat)
    // the plane reaches far past the map (100 km), so the paper fills the screen at every zoom and tilt the page allows
    const pad = 100000
    const plane = new Mesh('plane', this.scene)
    const vd = new VertexData()
    const [a, b, c, d] = [m.x0 - pad, m.z0 - pad, m.x0 + W + pad, m.z0 + H + pad]
    vd.positions = [a, 0, b, c, 0, b, a, 0, d, c, 0, d]
    vd.indices = [0, 2, 1, 1, 2, 3]
    vd.applyToMesh(plane)
    plane.material = this.material
    this.plane = plane
  }

  /**
   * Resolves once the plane's and the buildings' shaders and textures are ready to draw (the first frame after setMap
   * may not be); rejects after `ms` with a shader's compile error, if any.
   */
  ready(ms = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = performance.now()
      const poll = () => {
        if (this.scene.isReady()) resolve()
        else if (performance.now() - t0 > ms) {
          // the plane's shader or the buildings' (G2b), whichever failed
          const e = this.lit.map(m => m.getEffect()?.getCompilationError()).find(Boolean)
          reject(new Error(`the lit view did not get ready${e ? `: ${e}` : ''}`))
        } else setTimeout(poll, 16)
      }
      poll()
    })
  }

  /** Whether the view can draw now (its shaders compiled, every texture it samples alive). */
  isReady(): boolean {
    return this.scene.isReady()
  }

  /** Clears the view: no map drawn until the next setMap. */
  clear(): void {
    for (const t of this.textures) t.dispose()
    this.textures = []
    this.plane?.dispose()
    this.plane = null
    this.setHouses([])
    this.scene.render()
  }

  /** Calls `fn` when the WebGL context is lost (the view cannot draw again until the page reloads). */
  onLost(fn: () => void): void {
    this.engine.onContextLostObservable.add(fn)
  }

  /**
   * Stands the map's houses on the paper (M6b, `standing`): each footprint (its rings, m) raised to its wall height,
   * its roof flat, its faces lit by the ground's light (houses.frag), its shadow on the ground in it (shadows.frag).
   */
  setHouses(houses: Standing[], bz = BUILDING_BZ): void {
    for (const h of this.houses) h.dispose()
    this.houses = []
    if (!houses.length) return
    const pos: number[] = []
    const nrm: number[] = []
    const col: number[] = []
    const idx: number[] = []
    for (const h of houses) {
      const tone = h.church ? CHURCH_TONE : HOUSE_TONE
      // the roof, flat at the wall's height, the footprint less its courtyards as one ring, triangulated; a roofless
      // house (a ruin, burnt) is its walls alone
      if (h.roof) {
        const outline = bridged(h.rings)
        const tris = triangulate(outline)
        const top = pos.length / 3
        for (const [x, z] of outline) {
          pos.push(x, h.height, z)
          nrm.push(0, 1, 0)
          col.push(tone, tone, tone, 1)
        }
        for (const [a, b, c] of tris) idx.push(top + a, top + c, top + b)
      }
      // the walls of every ring, a quad an edge, each with its outward normal (a counter-clockwise ring's, (ez, -ex);
      // a courtyard's faces inward, its ring counter-clockwise too, so its normal is flipped): the shader lights it
      h.rings.forEach((ring, r) => {
        const n = ring.length
        for (let k = 0; k < n; k++) {
          const [ax, az] = ring[k]
          const [bx, bz] = ring[(k + 1) % n]
          const ex = bx - ax
          const ez = bz - az
          const el = Math.sqrt(ex * ex + ez * ez) || 1
          const out = r === 0 ? 1 : -1
          const v = pos.length / 3
          pos.push(ax, 0, az, bx, 0, bz, bx, h.height, bz, ax, h.height, az)
          for (let q = 0; q < 4; q++) {
            nrm.push((ez / el) * out, 0, (-ex / el) * out)
            col.push(tone, tone, tone, 1)
          }
          idx.push(v, v + 2, v + 1, v, v + 3, v + 2)
        }
      })
    }
    // their shadows on the ground: the walls swept away from the sun (shadowQuads), over the paper with no depth
    // against it, in the ground's light (shaders/shadows.frag)
    const { xz, tris } = shadowQuads(houses, this.sun, bz)
    const shade: number[] = []
    for (let k = 0; k < xz.length; k += 2) shade.push(xz[k], SHADOW_Y, xz[k + 1])
    const shadow = new Mesh('house-shadows', this.scene)
    const sd = new VertexData()
    sd.positions = shade
    sd.indices = tris
    sd.applyToMesh(shadow)
    shadow.material = this.shadowMaterial
    shadow.renderingGroupId = 1
    const boxes = new Mesh('houses', this.scene)
    const bd = new VertexData()
    bd.positions = pos
    bd.normals = nrm
    bd.colors = col
    bd.indices = idx
    bd.applyToMesh(boxes)
    boxes.material = this.houseMaterial
    boxes.renderingGroupId = 2
    this.houses = [shadow, boxes]
    for (const h of this.houses) h.setEnabled(!this.flat)
  }

  /**
   * Shows a debug overlay (src/render/lit/overlays.ts: RGBA a cell, the south row first) over the map, or none. The
   * map's grid is the last setMap's.
   */
  setOverlay(rgba: Uint8Array | null): void {
    // bind the empty texel first: a disposed texture left bound would keep the material from ever being ready
    this.material.setTexture('uOverlay', this.noOverlay)
    this.overlay?.dispose()
    this.overlay = null
    if (rgba && this.grid) {
      const t = new RawTexture(
        rgba,
        this.grid.nx,
        this.grid.nz,
        Constants.TEXTUREFORMAT_RGBA,
        this.scene,
        false,
        false,
        Texture.NEAREST_SAMPLINGMODE,
      )
      t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
      this.overlay = t
      this.material.setTexture('uOverlay', t)
    }
    this.material.setFloat('uOverlayOn', this.overlay ? 1 : 0)
  }

  /** Shows the flat draft's colours instead of the lit map (a debug setting). */
  setFlat(on: boolean): void {
    this.flat = on ? 1 : 0
    this.material.setFloat('uFlat', this.flat)
    for (const h of this.houses) h.setEnabled(!on) // the flat colours show what lies under them
  }

  /** Places the camera: it looks north, leaning `tilt` degrees off straight down, `ppm` px a metre at the centre. */
  setCamera(v: LitCamera): void {
    const r = this.canvas.getBoundingClientRect()
    // a canvas with no size (a hidden tab, a collapsed layout) or no zoom keeps the last camera
    if (!(r.width > 0 && r.height > 0 && v.ppm > 0)) return
    this.rect = { w: r.width, h: r.height }
    const pitch = Math.PI / 2 - (Math.min(45, Math.max(0, v.tilt)) * Math.PI) / 180
    const dist = r.height / (2 * Math.tan(FOV / 2) * v.ppm)
    const fwd = new Vector3(0, -Math.sin(pitch), Math.cos(pitch))
    this.camera.position = new Vector3(v.cx, 0, v.cz).subtract(fwd.scale(dist))
    this.camera.rotation.set(pitch, 0, 0)
    this.houseMaterial.setVector3('uEye', this.camera.position)
    this.camera.minZ = Math.max(0.5, dist * 0.05)
    this.camera.maxZ = dist * 20
    // the overlays' near limit: a twentieth of the distance, where a point still projects to a few screens at most
    this.nearW = dist * NEAR_SHARE
    this.engine.resize()
    this.viewProj = this.camera.getViewMatrix(true).multiply(this.camera.getProjectionMatrix(true))
    this.inverse = this.viewProj.clone().invert()
  }

  /**
   * The camera's view and projection as one matrix, as a shader takes it (column-major): a ground point (x, 0, z, 1)
   * to clip space, the very map `project` divides out. For overlays the page draws on the GPU (a scan, M7e).
   */
  get viewProjection(): Float32Array {
    return Float32Array.from(this.viewProj.m)
  }

  /** How far a ground point lies in front of the camera, less the overlays' near limit: at or below 0, not drawn. */
  depth(x: number, z: number): number {
    const m = this.viewProj.m
    return x * m[3] + z * m[11] + m[15] - this.nearW
  }

  /** A ground point to CSS pixels on the canvas, or null when it lies behind the near limit (see `depth`). */
  project(x: number, z: number): [number, number] | null {
    const m = this.viewProj.m
    const w = x * m[3] + z * m[11] + m[15]
    if (w - this.nearW <= 0) return null
    const cx = (x * m[0] + z * m[8] + m[12]) / w
    const cy = (x * m[1] + z * m[9] + m[13]) / w
    return [(0.5 + 0.5 * cx) * this.rect.w, (0.5 - 0.5 * cy) * this.rect.h]
  }

  /** CSS pixels on the canvas to the ground point under them, or null at or above the horizon. */
  unproject(sx: number, sy: number): [number, number] | null {
    const xn = (2 * sx) / this.rect.w - 1
    const yn = 1 - (2 * sy) / this.rect.h
    // two points of the pixel's ray through the camera, back from clip space
    const a = Vector3.TransformCoordinates(new Vector3(xn, yn, 0), this.inverse)
    const b = Vector3.TransformCoordinates(new Vector3(xn, yn, 0.5), this.inverse)
    const c = this.camera.position
    const dy = b.y - a.y
    if (Math.abs(dy) < 1e-12) return null
    const t = -a.y / dy
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    // the ground point must lie ahead of the camera along the ray, not behind it
    const ahead = (x - c.x) * (b.x - a.x) + (0 - c.y) * (b.y - a.y) + (z - c.z) * (b.z - a.z)
    return ahead > 0 ? [x, z] : null
  }

  /** Draws a frame; returns its CPU time, ms. */
  render(): number {
    const t0 = performance.now()
    this.scene.render()
    return performance.now() - t0
  }

  dispose(): void {
    this.engine.dispose()
  }
}
