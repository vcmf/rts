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
import { lightXZ, RELIEF, type LightDir } from './bake.ts'
import { paperCanvas } from './paper.ts'
import LIT_VS from './shaders/lit.vert?raw'
import LIT_FS from './shaders/lit.frag?raw'

const FOV = 0.52 // rad, vertical (the prototype's)
// the overlays' near limit, as a share of the camera's distance to the centre: a ground point nearer the camera's
// plane is not drawn (it would project to huge or mirrored coordinates)
const NEAR_SHARE = 0.05
export const TILT = 20 // degrees off straight down (decision 0055)
// the relief's tone on the paper: never darker than SHADE_FLOOR (with its warm hue, 0.62 of the paper), never lighter
// than SHADE_TOP (the prototype's)
const SHADE_FLOOR = 0.72
const SHADE_TOP = 1.15
// the paper and the water's wash by season, the prototype's lit palette: summer, early autumn, late autumn, winter
const PAPER = ['#e3d1a2', '#e1cb98', '#d9c18f', '#e4d9bf']
const WATER = ['#9fbcc2', '#9fbcc2', '#a3b8bb', '#d3e0e8']
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
  light: LightDir
  height: Float64Array // (nx + 1) × (nz + 1) node heights, m above the datum, the south row first
  relief: Uint8Array // RGBA on the nodes (bakeRelief)
  masks: Uint8Array // RGBA on the cells (bakeMasks)
  flat: { w: number; h: number; rgba: Uint8Array } // the draft raster, the north row first
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
  private plane: Mesh | null = null
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
      { preserveDrawingBuffer: true, stencil: false, doNotHandleContextLost: true },
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
          'uLightXZ',
          'uLambert',
          'uCell',
          'uDatum',
          'uFlat',
          'uShadeFloor',
          'uShadeTop',
          'uPaper',
          'uWaterW',
        ],
        samplers: ['uHeight', 'uRelief', 'uMask', 'uPaperT', 'uFlatT'],
      },
    )
    this.material.backFaceCulling = false
    const paper = paperCanvas()
    const t = this.rgba(paper, Texture.TRILINEAR_SAMPLINGMODE, true)
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE
    this.material.setTexture('uPaperT', t)
    this.material.setVector2('uLambert', new Vector2(RELIEF.lambert[0], RELIEF.lambert[1]))
    this.material.setFloat('uShadeFloor', SHADE_FLOOR)
    this.material.setFloat('uShadeTop', SHADE_TOP)
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
    this.material.setTexture('uRelief', tex(m.relief, m.nx + 1, m.nz + 1, rgba, linear))
    this.material.setTexture('uMask', tex(m.masks, m.nx, m.nz, rgba, linear))
    this.material.setTexture('uFlatT', tex(m.flat.rgba, m.flat.w, m.flat.h, rgba, Texture.NEAREST_SAMPLINGMODE))
    this.material.setVector2('uX0Z0', new Vector2(m.x0, m.z0))
    this.material.setVector2('uSize', new Vector2(W, H))
    this.material.setVector2('uNodes', new Vector2(m.nx + 1, m.nz + 1))
    this.material.setVector2('uCells', new Vector2(m.nx, m.nz))
    this.material.setFloat('uCell', m.cell)
    this.material.setFloat('uDatum', m.datum)
    const [lx, lz] = lightXZ(m.light)
    this.material.setVector2('uLightXZ', new Vector2(lx, lz))
    const s = SEASON_AT[m.season]
    this.material.setColor3('uPaper', seasonColour(PAPER, s))
    this.material.setColor3('uWaterW', seasonColour(WATER, s))
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

  /** Clears the view: no map drawn until the next setMap. */
  clear(): void {
    for (const t of this.textures) t.dispose()
    this.textures = []
    this.plane?.dispose()
    this.plane = null
    this.scene.render()
  }

  /** Calls `fn` when the WebGL context is lost (the view cannot draw again until the page reloads). */
  onLost(fn: () => void): void {
    this.engine.onContextLostObservable.add(fn)
  }

  /** Shows the flat draft's colours instead of the lit map (a debug setting). */
  setFlat(on: boolean): void {
    this.flat = on ? 1 : 0
    this.material.setFloat('uFlat', this.flat)
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
