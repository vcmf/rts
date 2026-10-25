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
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import type { Season } from '../../map/schema.ts'
import { lightXZ, RELIEF, type LightDir } from './bake.ts'
import { paperCanvas } from './paper.ts'
import LIT_VS from './shaders/lit.vert?raw'
import LIT_FS from './shaders/lit.frag?raw'

const FOV = 0.52 // rad, vertical (the prototype's)
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
  private flat = 0
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false)
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
    // the plane reaches well past the map, so the paper fills the screen at any tilt
    const pad = Math.max(W, H) * 2
    const plane = new Mesh('plane', this.scene)
    const vd = new VertexData()
    const [a, b, c, d] = [m.x0 - pad, m.z0 - pad, m.x0 + W + pad, m.z0 + H + pad]
    vd.positions = [a, 0, b, c, 0, b, a, 0, d, c, 0, d]
    vd.indices = [0, 2, 1, 1, 2, 3]
    vd.applyToMesh(plane)
    plane.material = this.material
    this.plane = plane
  }

  /** Shows the flat draft's colours instead of the lit map (a debug setting). */
  setFlat(on: boolean): void {
    this.flat = on ? 1 : 0
    this.material.setFloat('uFlat', this.flat)
  }

  /** Places the camera: it looks north, leaning `tilt` degrees off straight down, `ppm` px a metre at the centre. */
  setCamera(v: LitCamera): void {
    const r = this.canvas.getBoundingClientRect()
    const pitch = Math.PI / 2 - (Math.min(45, Math.max(0, v.tilt)) * Math.PI) / 180
    const dist = r.height / (2 * Math.tan(FOV / 2) * v.ppm)
    const fwd = new Vector3(0, -Math.sin(pitch), Math.cos(pitch))
    this.camera.position = new Vector3(v.cx, 0, v.cz).subtract(fwd.scale(dist))
    this.camera.rotation.set(pitch, 0, 0)
    this.camera.minZ = Math.max(0.5, dist * 0.05)
    this.camera.maxZ = dist * 20
    this.engine.resize()
    this.viewProj = this.camera.getViewMatrix(true).multiply(this.camera.getProjectionMatrix(true))
  }

  /** A ground point to CSS pixels on the canvas. */
  project(x: number, z: number): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    const p = Vector3.Project(
      new Vector3(x, 0, z),
      Matrix.IdentityReadOnly,
      this.viewProj,
      new Viewport(0, 0, r.width, r.height),
    )
    return [p.x, p.y]
  }

  /** CSS pixels on the canvas to the ground point under them, or null above the horizon. */
  unproject(sx: number, sy: number): [number, number] | null {
    const r = this.canvas.getBoundingClientRect()
    const near = Vector3.Unproject(
      new Vector3(sx, sy, 0),
      r.width,
      r.height,
      Matrix.IdentityReadOnly,
      this.camera.getViewMatrix(),
      this.camera.getProjectionMatrix(),
    )
    const far = Vector3.Unproject(
      new Vector3(sx, sy, 1),
      r.width,
      r.height,
      Matrix.IdentityReadOnly,
      this.camera.getViewMatrix(),
      this.camera.getProjectionMatrix(),
    )
    const dy = far.y - near.y
    if (dy > -1e-9) return null
    const t = -near.y / dy
    return [near.x + (far.x - near.x) * t, near.z + (far.z - near.z) * t]
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
