// The lit map view (docs/plans/active/m6-lit-view.md, M6a; decisions 0055, 0058): a compiled map drawn as the lit
// map on its own canvas with Babylon, as one flat plane over the map's extent seen through a camera that leans a
// little off straight down. The relief, the woods and the water come from the bakes (./bake.ts), the contours from the
// node heights. It draws on demand (render), and projects world points to the screen and back for what the page draws
// over it.
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
import { INK_RANGE, sunXZ, type LightBake, type Sun } from './bake.ts'
import { paperCanvas } from './paper.ts'
import type { Pt } from '../../map/schema.ts'
import { bridged, triangulate, type Standing } from './houses.ts'
import LIT_VS from './shaders/lit.vert?raw'
import LIT_FS from './shaders/lit.frag?raw'

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
const SKY_K = 0.62
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
// the houses (the prototype's bakeHouses): dark warm roofs, a church darker, the faces away from the sun at 0.62 of
// the roof, the faces toward it at 0.85; a soft shadow away from the sun, as long as the sun's height casts the wall
const HOUSE = [0.36, 0.29, 0.23]
const CHURCH = [0.27, 0.22, 0.19]
const SHADOW_ALPHA = 0.32
const SHADOW_Y = 0.05 // m above the paper
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
  private plane: Mesh | null = null
  private houses: Mesh[] = []
  private overlay: RawTexture | null = null
  private readonly noOverlay: RawTexture
  private grid: { nx: number; nz: number } | null = null
  private sun: Sun | null = null
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
      { vertexSource: LIT_VS, fragmentSource: LIT_FS },
      {
        attributes: ['position'],
        uniforms: [
          'world',
          'viewProjection',
          'uX0Z0',
          'uSize',
          'uNodes',
          'uCells',
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
    this.houseMaterial = new ShaderMaterial(
      'houses',
      this.scene,
      { vertexSource: FLAT_VS, fragmentSource: FLAT_FS },
      { attributes: ['position', 'color'], uniforms: ['world', 'viewProjection'] },
    )
    this.houseMaterial.backFaceCulling = false
    this.shadowMaterial = new ShaderMaterial(
      'house-shadows',
      this.scene,
      { vertexSource: SHADOW_VS, fragmentSource: SHADOW_FS },
      { attributes: ['position'], uniforms: ['world', 'viewProjection', 'uAlpha'], needAlphaBlending: true },
    )
    this.shadowMaterial.setFloat('uAlpha', SHADOW_ALPHA)
    // each pixel of the shadows blends once, however many shadows overlap there: the first marks the stencil, the
    // others fail it
    this.shadowMaterial.disableDepthWrite = true
    this.shadowMaterial.stencil.enabled = true
    this.shadowMaterial.stencil.func = Constants.NOTEQUAL
    this.shadowMaterial.stencil.funcRef = 1
    this.shadowMaterial.stencil.opStencilDepthPass = Constants.REPLACE
    this.shadowMaterial.backFaceCulling = false
    const paper = paperCanvas()
    const t = this.rgba(paper, Texture.TRILINEAR_SAMPLINGMODE, true)
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE
    this.material.setTexture('uPaperT', t)
    this.material.setColor3('uKey', Color3.FromArray(KEY))
    this.material.setColor3('uSkyC', Color3.FromArray(SKY))
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
    this.material.setFloat('uSkyK', t.sky ?? SKY_K)
    this.material.setFloat('uLamp', t.lamp ?? LAMP)
    this.material.setFloat('uFloor', t.floor ?? 0)
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
    this.material.setTexture('uHeight', height)
    this.material.setTexture('uLight', tex(m.light.data, m.light.nx, m.light.nz, rgba, linear))
    this.material.setVector2('uLightNodes', new Vector2(m.light.nx, m.light.nz))
    this.material.setFloat('uLightStep', m.light.step)
    // neither the mask nor the ink's fields mipmapped: averaged, a brook or a hedge two cells wide would vanish from
    // the far view, and the water's depth would part from its fill (docs/plans/active/m6-lit-view.md, open: a
    // min-filtered mip chain for the far view)
    this.material.setTexture('uMask', tex(m.masks, m.nx, m.nz, rgba, linear))
    this.material.setTexture('uInk', tex(m.ink, m.nx, m.nz, rgba, linear))
    this.material.setFloat('uInkRange', INK_RANGE)
    this.material.setTexture('uFlatT', tex(m.flat.rgba, m.flat.w, m.flat.h, rgba, Texture.NEAREST_SAMPLINGMODE))
    this.material.setVector2('uX0Z0', new Vector2(m.x0, m.z0))
    this.material.setVector2('uSize', new Vector2(W, H))
    this.material.setVector2('uNodes', new Vector2(m.nx + 1, m.nz + 1))
    this.material.setVector2('uCells', new Vector2(m.nx, m.nz))
    this.grid = { nx: m.nx, nz: m.nz }
    this.setOverlay(null) // the last map's overlay is not this one's
    this.material.setFloat('uCell', m.cell)
    this.material.setFloat('uDatum', m.datum)
    // toward the sun, x east, y up, z north
    const [sx, sz] = sunXZ(m.sun)
    const el = (m.sun.el * Math.PI) / 180
    this.material.setVector3('uSun', new Vector3(sx * Math.cos(el), Math.sin(el), sz * Math.cos(el)))
    this.material.setFloat('uZ', m.z)
    const s = SEASON_AT[m.season]
    this.material.setColor3('uPaper', seasonColour(PAPER, s))
    this.material.setColor3('uLine', seasonColour(LINE, s))
    this.material.setColor3('uBarrier', Color3.FromHexString(BARRIER))
    this.sun = m.sun
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
   * Resolves once the plane's shader and textures are ready to draw (the first frame after setMap may not be); rejects
   * after `ms` with the shader's compile error, if any.
   */
  ready(ms = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = performance.now()
      const poll = () => {
        if (this.scene.isReady()) resolve()
        else if (performance.now() - t0 > ms) {
          const e = this.material.getEffect()?.getCompilationError()
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
   * its roof flat, its faces lit by the map's light, and a soft shadow away from the light, as the prototype's bake.
   */
  setHouses(houses: Standing[]): void {
    for (const h of this.houses) h.dispose()
    this.houses = []
    if (!houses.length) return
    const [lx, lz] = this.sun ? sunXZ(this.sun) : [-Math.SQRT1_2, Math.SQRT1_2]
    // a wall's shadow is its height over the tangent of the sun's height
    const cast = 1 / Math.tan((Math.max(5, this.sun?.el ?? 45) * Math.PI) / 180)
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const shade: number[] = []
    const shadeIdx: number[] = []
    for (const h of houses) {
      const base = h.church ? CHURCH : HOUSE
      // the footprint less its courtyards as one ring, triangulated once: the roof and the shadow's copy share it
      const outline = bridged(h.rings)
      const tris = triangulate(outline)
      // the roof, flat at the wall's height; a roofless house (a ruin, burnt) is its walls alone
      const top = pos.length / 3
      for (const [x, z] of outline) {
        pos.push(x, h.height, z)
        col.push(base[0], base[1], base[2], 1)
      }
      if (h.roof) for (const [a, b, c] of tris) idx.push(top + a, top + c, top + b)
      // the walls of every ring (a courtyard's face inward: its ring is counter-clockwise too, so its normal is
      // flipped for the light), a quad an edge, lit by how much it faces the light
      h.rings.forEach((ring, r) => {
        const n = ring.length
        for (let k = 0; k < n; k++) {
          const [ax, az] = ring[k]
          const [bx, bz] = ring[(k + 1) % n]
          const ex = bx - ax
          const ez = bz - az
          const el = Math.sqrt(ex * ex + ez * ez) || 1
          // the outward normal of a counter-clockwise ring, (ez, -ex), against the light (inward for a courtyard)
          const facing = ((ez / el) * lx - (ex / el) * lz) * (r === 0 ? 1 : -1)
          const f = facing > 0 ? 0.62 + 0.23 * facing : 0.62
          const v = pos.length / 3
          pos.push(ax, 0, az, bx, 0, bz, bx, h.height, bz, ax, h.height, az)
          for (let q = 0; q < 4; q++) col.push(base[0] * f, base[1] * f, base[2] * f, 1)
          idx.push(v, v + 2, v + 1, v, v + 3, v + 2)
        }
      })
      // the shadow: the footprint swept away from the sun, as long as the sun's height casts the wall: its copy there
      // and a quad an edge of every ring between them (their union; the stencil keeps any overlap from darkening twice)
      const reach = h.height * cast
      const shift = ([x, z]: Pt): Pt => [x - lx * reach, z - lz * reach]
      const s0 = shade.length / 3
      for (const [x, z] of outline.map(shift)) shade.push(x, SHADOW_Y, z)
      for (const [a, b, c] of tris) shadeIdx.push(s0 + a, s0 + c, s0 + b)
      for (const ring of h.rings) {
        const q0 = shade.length / 3
        const n = ring.length
        for (const [x, z] of [...ring, ...ring.map(shift)]) shade.push(x, SHADOW_Y, z)
        for (let k = 0; k < n; k++) {
          const k2 = (k + 1) % n
          shadeIdx.push(q0 + k, q0 + k2, q0 + n + k2, q0 + k, q0 + n + k2, q0 + n + k)
        }
      }
    }
    const shadow = new Mesh('house-shadows', this.scene)
    const sd = new VertexData()
    sd.positions = shade
    sd.indices = shadeIdx
    sd.applyToMesh(shadow)
    shadow.material = this.shadowMaterial
    shadow.renderingGroupId = 1 // over the paper, with no depth against it
    const boxes = new Mesh('houses', this.scene)
    const bd = new VertexData()
    bd.positions = pos
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

// the houses' shaders: a colour a vertex; the shadow one colour at an alpha
const FLAT_VS = `precision highp float;
attribute vec3 position; attribute vec4 color; uniform mat4 world, viewProjection; varying vec3 vC;
void main() { vC = color.rgb; gl_Position = viewProjection * world * vec4(position, 1.0); }`
const FLAT_FS = `precision highp float; varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }`
const SHADOW_VS = `precision highp float;
attribute vec3 position; uniform mat4 world, viewProjection;
void main() { gl_Position = viewProjection * world * vec4(position, 1.0); }`
const SHADOW_FS = `precision highp float; uniform float uAlpha;
void main() { gl_FragColor = vec4(0.204, 0.149, 0.071, uAlpha); }`
