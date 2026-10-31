// The campaign map's view (docs/systems/campaign-map.md; the look: decision 0093), the prototype's
// (prototypes/campaign-map.html) on Babylon: the map raised by the far level's shape on a mesh, on a plate with its
// sides, on a table; the print shader (./shaders/print.frag) lights it from the light baked offline; up close, the
// 100 m tiles in a detail area around the camera. Every input comes from tools/campaign-tiles.ts: this view bakes
// nothing. It renders every frame (the cloud shadows drift), projects screen points to the map, and upscales with
// FSR 1 above 1080p.
import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Constants } from '@babylonjs/core/Engines/constants.js'
import { Scene } from '@babylonjs/core/scene.js'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js'
// the scene's createPickingRay (groundAt)
import '@babylonjs/core/Culling/ray.js'
import { FSR1RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/fsr1RenderingPipeline.js'
import { blitTile, halved, interleave, type LevelData } from './level.ts'
import {
  areaOrigin,
  areaTiles,
  assignSlots,
  nearestFirst,
  retryWait,
  slotOf,
  SlotTable,
  tileKey,
  tilesToLoad,
  Uploads,
  type Failure,
  type TileAt,
} from './ring.ts'
import { numbers, type Plane } from './fields.ts'
import type { Level, Manifest, Tile } from './tiles.ts'
import {
  cameraPosition,
  clampView,
  groundHit,
  sstep,
  TILT_FAR,
  TILT_NEAR,
  tiltFor,
  type CampaignView,
} from './camera.ts'
import { cloudCanvas, paperCanvas } from './paper.ts'
import PRINT_VS from './shaders/print.vert?raw'
import PRINT_FS from './shaders/print.frag?raw'
import SIDE_VS from './shaders/side.vert?raw'
import SIDE_FS from './shaders/side.frag?raw'

// the look's settings, the prototype's defaults (its URL parameters in brackets): the sky's share of the light (sky),
// the light's fall-off across the map from the sun's side (lamp), the contour interval in m and every how many an
// index line (contour), how much of the sun the cloud shadows take (clouds), the forests' green and the tree cover
// from which a forest is printed (woods, woodfrom), the water's steps: STEP m every STEP_KM from the shore, at most
// BANDS (stepkm, steps)
const SKY = 0.62
const LAMP = 0.55
const CONTOUR = 200
const CONTOUR_INDEX = 5
const CLOUDS = 0.15
const WOODS = 0.8
const WOOD_FROM = 0.6
const STEP = 45
const STEP_KM = 0.7
const BANDS = 6
// the plate's thickness and how far the table runs past the map, km; the mesh, a vertex every MESH_STEP nodes
const THICK = 8
const TABLE = 900
const MESH_STEP = 2
// the colours: cold white paper, a warm sun and a cool sky (the owner's Valdez print), the K1 palette
const PAPER = '#eceef1'
const TABLE_COLOUR = '#cbc9cf'
const SIDE_PAPER = '#e2e3e7'
const COLOURS: Record<string, string> = {
  uShallow: '#a9d0ec',
  uDeep: '#2b67b0',
  uWood: '#97c158',
  uRoad: '#a3412c',
  uRoad2: '#b8705a',
  uRiver: '#2f6aa3',
  uContourInk: '#d08450',
  uContourMinor: '#a9a7ae',
}
// the sun warm, the sky cool; with the sky's share, flat open ground in the sun comes to about 1
const KEY: [number, number, number] = [1.3, 0.98, 0.66]
const SKY_COLOUR: [number, number, number] = [0.82, 0.88, 1.08]
// the detail area (K2c1, ./ring.ts): AREA × AREA tile slots around the camera's target, moved when the target is
// more than SLACK tiles off its middle; the tiles decoded kept in a cache of TILE_CACHE (the oldest dropped), LOADS of
// them loading at once; at most UPLOADS slots written to the GPU a frame (each about 0.5 MB)
const AREA = 12
const SLACK = 1
const TILE_CACHE = 320
const LOADS = 6
const UPLOADS = 2
// a tile that failed to load is tried again RETRY_MS after, then twice as long after each failure, RETRY_MOST_MS
// at most
const RETRY_MS = 5000
const RETRY_MOST_MS = 60000
// the upscale (decisions 0045, 0059): FSR 1 when the canvas holds more than UPSCALE_FROM pixels, at a factor that
// brings it back to about that many, 1.3 to 2
const UPSCALE_FROM = 1920 * 1080 * 1.15
const FOV = 0.5
// the rounds groundAt takes to meet the raised surface
const GROUND_ROUNDS = 4

/** How the page asked to upscale: by the screen ('auto'), never ('off'), or by a factor. */
export type Upscale = 'auto' | 'off' | number

/** A tile loader: the tile of the detail level at (column, row). */
export type TileLoader = (column: number, row: number) => Promise<Tile>

// one float's bits, shared by every call of toHalf
const HALF_F32 = new Float32Array(1)
const HALF_U32 = new Uint32Array(HALF_F32.buffer)

/** A number as the bits of a half float (IEEE 754 binary16), rounded to nearest. */
function toHalf(v: number): number {
  HALF_F32[0] = v
  const x = HALF_U32[0]
  const sign = (x >>> 16) & 0x8000
  const exp = ((x >>> 23) & 0xff) - 127 + 15
  const mant = x & 0x7fffff
  if (exp <= 0) return sign
  if (exp >= 31) return sign | 0x7c00
  // added, not or-ed: a mantissa rounding up to 1024 carries into the exponent
  return sign | ((exp << 10) + ((mant + 0x1000) >> 13))
}

/** '#rrggbb' as a Color3. */
const colour = (hex: string) => Color3.FromHexString(hex)

/** The detail area's state: its level, its place, its textures and slots' table, its tiles. */
interface Detail {
  level: Level
  load: TileLoader
  origin: { ox: number; oz: number } | null
  // the textures' side in nodes (AREA tiles)
  n: number
  texS: RawTexture
  texL: RawTexture
  table: SlotTable
  texT: RawTexture
  tableChanged: boolean
  // a slot's worth of shape and light, reused for every upload
  scratch: { shape: Float32Array; half: Uint16Array; light: Uint8Array }
  // the tile each slot is given to (loaded or not), by slot
  given: (string | null)[]
  cache: Map<string, Tile>
  loading: Set<string>
  // the tiles that failed, when last and how many times in a row (tried again after retryWait)
  failed: Map<string, Failure>
  queue: TileAt[]
  uploads: Uploads<Tile>
  // the tile under the target when the area last moved
  target: TileAt
}

/**
 * The campaign map on a canvas: setMap with the far level and its fields, setDetail with the close level, setView to
 * move the camera, start to draw every frame.
 */
export class CampaignMapView {
  private readonly engine: Engine
  private readonly scene: Scene
  private readonly camera: FreeCamera
  private readonly material: ShaderMaterial
  private readonly sideMaterial: ShaderMaterial
  private readonly full: boolean
  private fsr: FSR1RenderingPipeline | null = null
  private upscale: Upscale = 'auto'
  private half = { x: 1, z: 1 }
  private far: { level: Level; data: LevelData } | null = null
  private detail: Detail | null = null
  private sun: [number, number, number] = [0, 1, 0]
  private viewNow: CampaignView = { x: 0, z: 0, dist: 1150 }
  private dirty = true
  private running = false
  // the render loop's one function, so stop can name it
  private readonly frameLoop = () => this.frame()
  /** Called after each frame with its CPU time in ms (the page's fps meter). */
  onFrame: ((cpuMs: number) => void) | null = null
  /** Called in the frame after the view changed, with the screen pixels a km at the screen's centre. */
  onViewChanged: ((pxPerKm: number) => void) | null = null

  /** Throws when the browser has no WebGL2. */
  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false)
    if (this.engine.webGLVersion < 2) {
      this.engine.dispose()
      throw new Error('the campaign map needs WebGL2')
    }
    this.engine.setHardwareScalingLevel(1 / Math.min(2, devicePixelRatio || 1))
    this.full = this.engine.getCaps().textureFloatLinearFiltering
    this.scene = new Scene(this.engine)
    this.scene.clearColor = new Color4(0.8, 0.79, 0.81, 1)
    this.scene.skipPointerMovePicking = true
    this.camera = new FreeCamera('campaign', new Vector3(0, 1000, 0), this.scene)
    this.camera.inputs.clear()
    this.camera.fov = FOV
    this.camera.minZ = 1
    this.camera.maxZ = 20000
    this.material = this.printMaterial()
    this.sideMaterial = new ShaderMaterial(
      'side',
      this.scene,
      { vertexSource: SIDE_VS, fragmentSource: SIDE_FS },
      { attributes: ['position', 'normal'], uniforms: ['worldViewProjection', 'uPaper', 'uLightXZ', 'uThick'] },
    )
  }

  /** The print material, its textures blank until setMap. */
  private printMaterial(): ShaderMaterial {
    const m = new ShaderMaterial(
      'print',
      this.scene,
      { vertexSource: PRINT_VS, fragmentSource: PRINT_FS },
      {
        attributes: ['position'],
        uniforms: [
          'worldViewProjection',
          ...['uHalf', 'uTexel', 'uLightTexel', 'uLakeTexel', 'uDetailTexel', 'uDetailRect'],
          ...['uSun', 'uPaper', 'uTable', 'uKey', 'uSky', ...Object.keys(COLOURS)],
          ...[
            'uCellKm',
            'uDetailCellKm',
            'uDetailSize',
            'uDetailArea',
            'uDetailK',
            'uSkyK',
            'uLamp',
            'uContour',
            'uContourIndex',
            'uContourK',
          ],
          ...['uTime', 'uCloudK', 'uHaze', 'uScreenH', 'uWoodK', 'uWoodFrom', 'uStepKm', 'uStep', 'uBands'],
          'uLineReachKm',
        ],
        samplers: [
          ...['uShape', 'uShapeL', 'uLight', 'uLines', 'uRivers', 'uLakes', 'uLakeD', 'uContourH'],
          ...['uDetailS', 'uDetailL', 'uDetailT', 'uPaperT', 'uClouds'],
        ],
      },
    )
    for (const [name, hex] of Object.entries(COLOURS)) m.setColor3(name, colour(hex))
    m.setColor3('uPaper', colour(PAPER))
    m.setColor3('uTable', colour(TABLE_COLOUR))
    m.setColor3('uKey', Color3.FromArray(KEY))
    m.setColor3('uSky', Color3.FromArray(SKY_COLOUR))
    m.setFloat('uSkyK', SKY)
    m.setFloat('uLamp', LAMP)
    m.setFloat('uContour', CONTOUR)
    m.setFloat('uContourIndex', CONTOUR_INDEX)
    m.setFloat('uContourK', 0)
    m.setFloat('uCloudK', CLOUDS)
    m.setFloat('uWoodK', WOODS)
    m.setFloat('uWoodFrom', WOOD_FROM)
    m.setFloat('uStep', STEP)
    m.setFloat('uStepKm', STEP_KM)
    m.setFloat('uBands', BANDS)
    m.setFloat('uHaze', 0)
    m.setFloat('uTime', 0)
    m.setFloat('uDetailK', 0)
    m.setFloat('uScreenH', this.engine.getRenderHeight())
    m.setTexture('uPaperT', this.noiseTexture('paper', paperCanvas()))
    m.setTexture('uClouds', this.noiseTexture('clouds', cloudCanvas()))
    // the detail area blank, its rectangle off the map, until setDetail
    m.setTexture('uDetailS', this.floatTexture(new Float32Array(1), 1, 1))
    m.setTexture('uDetailL', this.byteTexture(new Uint8Array(4), 1, 1, Constants.TEXTUREFORMAT_RGBA))
    m.setVector4('uDetailRect', new Vector4(1e6, 1e6, 1e6 + 1, 1e6 + 1))
    m.setTexture('uDetailT', this.byteTexture(new SlotTable(1).bytes, 1, 1, Constants.TEXTUREFORMAT_RGBA))
    m.setVector2('uDetailTexel', new Vector2(1, 1))
    m.setFloat('uDetailCellKm', 0.1)
    m.setFloat('uDetailSize', 1)
    m.setFloat('uDetailArea', 1)
    return m
  }

  /** A tileable noise canvas as a wrapping texture. */
  private noiseTexture(name: string, canvas: HTMLCanvasElement): DynamicTexture {
    const t = new DynamicTexture(name, canvas, this.scene, true)
    t.update()
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE
    return t
  }

  /**
   * Numbers as a float single-channel texture: 32-bit where the GPU filters them (the raised shape reaches about
   * 10 km, where a half float steps every 8 m and the light draws the steps as rows of dots), else half floats.
   * Bilinear, clamped, no mips.
   */
  private floatTexture(values: Float32Array, w: number, h: number): RawTexture {
    const type = this.full ? Constants.TEXTURETYPE_FLOAT : Constants.TEXTURETYPE_HALF_FLOAT
    const data = this.full ? values : Uint16Array.from(values, toHalf)
    const t = RawTexture.CreateRTexture(data, w, h, this.scene, false, false, Texture.BILINEAR_SAMPLINGMODE, type)
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    return t
  }

  /** A raw byte texture, clamped, bilinear; mipmapped (trilinear) when `mips`. */
  private byteTexture(data: Uint8Array, w: number, h: number, format: number, mips = false): RawTexture {
    const mode = mips ? Texture.TRILINEAR_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE
    const t = new RawTexture(data, w, h, format, this.scene, mips, false, mode)
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    return t
  }

  /**
   * The map: the far level's arrays and the fields from the manifest's build. Builds the textures, the mesh, the
   * plate and the table.
   */
  setMap(manifest: Manifest, far: LevelData, fields: Map<string, Plane>) {
    const level = manifest.levels[manifest.fields.level]
    const { halfX, halfZ } = manifest.frame
    this.half = { x: halfX / 1000, z: halfZ / 1000 }
    this.far = { level, data: far }
    const el = (manifest.params.sunEl * Math.PI) / 180
    const az = (manifest.params.sunAz * Math.PI) / 180
    this.sun = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
    const m = this.material
    const { nx, nz } = far
    const nearest = this.floatTexture(far.shape, nx, nz)
    // read only at its texel centres (by the Catmull-Rom pass): the GPU's bilinear filter rounds the coordinates and
    // mixed in a little of a neighbour, which the light drew as specks on steep ground
    nearest.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
    m.setTexture('uShape', nearest)
    m.setTexture('uShapeL', this.floatTexture(far.shape, nx, nz))
    m.setTexture('uLight', this.byteTexture(far.light, nx, nz, Constants.TEXTUREFORMAT_RGBA))
    this.setFields(fields, level, manifest.params.lineReach)
    m.setVector2('uHalf', new Vector2(this.half.x, this.half.z))
    m.setVector2('uTexel', new Vector2(1 / nx, 1 / nz))
    m.setVector2('uLightTexel', new Vector2(1 / nx, 1 / nz))
    m.setFloat('uCellKm', level.cell / 1000)
    m.setVector3('uSun', new Vector3(...this.sun))
    this.buildMeshes(far)
    this.placeCamera()
  }

  /** The fields' textures: the lakes (halved where the GPU's textures are smaller), their distance, lines, contours. */
  private setFields(fields: Map<string, Plane>, level: Level, lineReach: number) {
    const m = this.material
    const plane = (name: string) => {
      const p = fields.get(name)
      if (!p) throw new Error(`the fields have no ${name}`)
      return p
    }
    const floats = (name: string) => {
      const p = plane(name)
      if (p.kind !== 'uint16') throw new Error(`the fields' ${name} is not numbers`)
      return this.floatTexture(numbers(p), p.w, p.h)
    }
    let lakes = plane('lakes')
    while (Math.max(lakes.w, lakes.h) > this.engine.getCaps().maxTextureSize) lakes = halved(lakes)
    m.setTexture(
      'uLakes',
      this.byteTexture(lakes.values as Uint8Array, lakes.w, lakes.h, Constants.TEXTUREFORMAT_LUMINANCE, true),
    )
    m.setVector2('uLakeTexel', new Vector2(1 / lakes.w, 1 / lakes.h))
    m.setTexture('uLakeD', floats('lakeD'))
    m.setTexture('uContourH', floats('contour'))
    const high = plane('high')
    const country = plane('country')
    const rivers = plane('rivers')
    m.setTexture('uLines', this.byteTexture(interleave(high, country), high.w, high.h, Constants.TEXTUREFORMAT_RGBA))
    m.setTexture(
      'uRivers',
      this.byteTexture(interleave(rivers, null), rivers.w, rivers.h, Constants.TEXTUREFORMAT_RGBA),
    )
    m.setFloat('uLineReachKm', (lineReach * level.cell) / 1000)
  }

  /**
   * The map's mesh (raised in the vertex shader), the plate's sides and the table. The map is made first: the table
   * shares its material, and Babylon draws the meshes of one material in the order they were made, so the table's
   * fragments under the map are then hidden by the depth test, not shaded and drawn over.
   */
  private buildMeshes(far: LevelData) {
    const w = this.half.x * 2
    const h = this.half.z * 2
    const plane = this.mapMesh(far)
    plane.material = this.material
    this.sideMaterial.setColor3('uPaper', colour(SIDE_PAPER))
    this.sideMaterial.setVector2('uLightXZ', new Vector2(this.sun[0], this.sun[2]).normalize())
    this.sideMaterial.setFloat('uThick', THICK)
    // the box's top below the deepest lake (its shape at the level's base), so it never hides a low lake
    const top = Math.min(-0.02, this.far!.level.base / 1000 - 0.01)
    const sides = CreateBox('sides', { width: w, height: THICK + top, depth: h }, this.scene)
    sides.position.y = (top - THICK) / 2
    sides.material = this.sideMaterial
    const table = CreateGround('table', { width: w + 2 * TABLE, height: h + 2 * TABLE }, this.scene)
    table.position.y = -THICK
    table.material = this.material
  }

  /**
   * The map's surface: a grid of vertices MESH_STEP nodes apart, flat (the vertex shader raises it), in km; the last
   * column and row on the frame's east and north edges, however many nodes are left before them.
   */
  private mapMesh(far: LevelData): Mesh {
    const cellKm = (this.half.x * 2) / (far.nx - 1)
    const nx = Math.ceil((far.nx - 1) / MESH_STEP) + 1
    const nz = Math.ceil((far.nz - 1) / MESH_STEP) + 1
    const at = (k: number, n: number) => Math.min(k * MESH_STEP, n - 1) * cellKm
    const positions = new Float32Array(nx * nz * 3)
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const o = (j * nx + i) * 3
        positions[o] = -this.half.x + at(i, far.nx)
        positions[o + 2] = -this.half.z + at(j, far.nz)
      }
    }
    const indices = new Uint32Array((nx - 1) * (nz - 1) * 6)
    let o = 0
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i
        // wound clockwise seen from above: Babylon is left-handed, and culls the other winding as back faces
        indices.set([a, a + 1, a + nx, a + 1, a + nx + 1, a + nx], o)
        o += 6
      }
    }
    const mesh = new Mesh('print', this.scene)
    const vd = new VertexData()
    vd.positions = positions
    vd.indices = indices
    vd.applyToMesh(mesh, false)
    // raised in the shader, beyond the flat bounding box Babylon culls by
    mesh.alwaysSelectAsActiveMesh = true
    return mesh
  }

  /** The close zoom's level and how to load its tiles: from then on, the detail area follows the camera. */
  setDetail(level: Level, load: TileLoader) {
    const n = AREA * level.size
    const texS = this.floatTexture(new Float32Array(n * n), n, n)
    texS.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
    const texL = this.byteTexture(new Uint8Array(n * n * 4), n, n, Constants.TEXTUREFORMAT_RGBA)
    // the slots wrap: a node's place in the textures is its place in the level modulo the area
    for (const t of [texS, texL]) t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE
    const table = new SlotTable(AREA)
    const texT = this.byteTexture(table.bytes, AREA, AREA, Constants.TEXTUREFORMAT_RGBA)
    texT.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE)
    this.detail = {
      level,
      load,
      origin: null,
      n,
      texS,
      texL,
      table,
      texT,
      tableChanged: false,
      scratch: {
        shape: new Float32Array(level.size * level.size),
        half: new Uint16Array(level.size * level.size),
        light: new Uint8Array(level.size * level.size * 4),
      },
      given: new Array<string | null>(AREA * AREA).fill(null),
      cache: new Map(),
      loading: new Set(),
      failed: new Map(),
      queue: [],
      uploads: new Uploads<Tile>(),
      target: [0, 0],
    }
    const m = this.material
    m.setTexture('uDetailS', texS)
    m.setTexture('uDetailL', texL)
    m.setTexture('uDetailT', texT)
    m.setVector2('uDetailTexel', new Vector2(1 / n, 1 / n))
    m.setFloat('uDetailCellKm', level.cell / 1000)
    m.setFloat('uDetailSize', level.size)
    m.setFloat('uDetailArea', AREA)
    this.dirty = true
  }

  /** The detail area's state, for the fps meter and the checks. */
  detailState() {
    const d = this.detail
    if (!d) return null
    const { size: uploads } = d.uploads
    return { tiles: d.cache.size, loading: d.loading.size, queued: d.queue.length, failed: d.failed.size, uploads }
  }

  /**
   * Moves the detail area under the camera when it is close enough to use it (about 3 px a km and more) and its
   * target is more than SLACK tiles off the area's middle: the slots of the tiles that left are given to those that
   * came in (out of the slots' table at once), the cached ones sent to their slots, the others queued.
   */
  private wantDetail(ppk: number) {
    const d = this.detail
    if (!d || ppk < 3) return
    const { level } = d
    const spanKm = (level.size * level.cell) / 1000
    const ti = Math.floor((this.viewNow.x + this.half.x) / spanKm)
    const tj = Math.floor((this.viewNow.z + this.half.z) / spanKm)
    const origin = areaOrigin(level, AREA, ti, tj, d.origin, SLACK)
    if (origin === d.origin) return
    d.origin = origin
    d.target = [ti, tj]
    const x0 = -this.half.x + origin.ox * spanKm
    const z0 = -this.half.z + origin.oz * spanKm
    const lastKm = ((d.n - 1) * level.cell) / 1000
    this.material.setVector4('uDetailRect', new Vector4(x0, z0, x0 + lastKm, z0 + lastKm))
    const tiles = areaTiles(level, AREA, origin)
    const { given, changed } = assignSlots(d.given, tiles, AREA)
    d.given = given
    // the cached tiles sent nearest the target first: the uploads go out in the order they were set
    const near = new Map(
      nearestFirst(
        changed.map(([, t]) => t),
        ti,
        tj,
      ).map((t, k) => [tileKey(t), k]),
    )
    changed.sort((a, b) => near.get(tileKey(a[1]))! - near.get(tileKey(b[1]))!)
    for (const [s, tile] of changed) {
      d.table.set(s, null)
      d.tableChanged = true
      d.uploads.drop(s)
      const cached = d.cache.get(tileKey(tile))
      if (cached) d.uploads.set(s, cached)
    }
    // the failures of tiles no longer in the area forgotten
    const inArea = new Set(tiles.map(tileKey))
    for (const key of d.failed.keys()) if (!inArea.has(key)) d.failed.delete(key)
    this.queueTiles()
  }

  /** The area's tiles to load, the nearest the target first (failed ones again after RETRY_MS), then loading. */
  private queueTiles() {
    const d = this.detail
    if (!d || !d.origin) return
    // a tile is present when cached, or written in its slot (the cache may have let it go since)
    const inSlot = (key: string) => {
      const [i, j] = key.split(',').map(Number)
      const held = d.table.get(slotOf(i, j, AREA))
      return held !== null && held[0] === i && held[1] === j
    }
    const have = {
      present: (key: string) => d.cache.has(key) || inSlot(key),
      loading: (key: string) => d.loading.has(key),
    }
    const tiles = areaTiles(d.level, AREA, d.origin)
    const [ti, tj] = d.target
    const wait = (tries: number) => retryWait(tries, RETRY_MS, RETRY_MOST_MS)
    // nearest last: the queue is taken from its end
    d.queue = tilesToLoad(tiles, ti, tj, have, d.failed, performance.now(), wait).reverse()
    this.pumpTiles()
  }

  /** Starts loading the next queued tiles, up to LOADS at once. */
  private pumpTiles() {
    const d = this.detail
    if (!d) return
    while (d.loading.size < LOADS && d.queue.length) {
      const tile = d.queue.pop()!
      const key = tileKey(tile)
      if (d.loading.has(key) || d.cache.has(key)) continue
      d.loading.add(key)
      d.load(...tile)
        .then(loaded => {
          d.failed.delete(key)
          this.tileLoaded(key, loaded)
        })
        .catch((e: unknown) => {
          const tries = (d.failed.get(key)?.tries ?? 0) + 1
          d.failed.set(key, { at: performance.now(), tries })
          const wait = retryWait(tries, RETRY_MS, RETRY_MOST_MS)
          console.warn(`campaign map: tile ${key} of the close level failed (${tries}), tried again in ${wait} ms:`, e)
          // tried again if it is still in the area then; a little after, so the timer never comes before the wait ends
          setTimeout(() => this.queueTiles(), wait + 100)
        })
        .finally(() => {
          d.loading.delete(key)
          this.pumpTiles()
        })
    }
  }

  /** A loaded tile kept in the cache (the oldest dropped) and sent to its slot if the slot is still given to it. */
  private tileLoaded(key: string, tile: Tile) {
    const d = this.detail
    if (!d) return
    d.cache.set(key, tile)
    if (d.cache.size > TILE_CACHE) d.cache.delete(d.cache.keys().next().value!)
    const s = slotOf(tile.column, tile.row, AREA)
    if (d.given[s] === key) d.uploads.set(s, tile)
  }

  /**
   * Writes up to UPLOADS waiting tiles to the GPU, each into its slot's own rectangle of the two textures, and enters
   * them in the slots' table (sent when it changed).
   */
  private uploadDetail() {
    const d = this.detail
    if (!d) return
    const { size } = d.level
    for (const [s, tile] of d.uploads.take(UPLOADS)) {
      // the scratch arrays are reused: each GL call has copied them when it returns
      const { shape, half, light } = d.scratch
      blitTile(tile, d.level, { shape, light, n: size, m: size, ox: tile.column * size, oz: tile.row * size })
      const x = (s % AREA) * size
      const z = Math.floor(s / AREA) * size
      const texS = d.texS.getInternalTexture()!
      if (this.full) this.engine.updateTextureData(texS, shape, x, z, size, size)
      else {
        for (let k = 0; k < shape.length; k++) half[k] = toHalf(shape[k])
        this.engine.updateTextureData(texS, half, x, z, size, size)
      }
      this.engine.updateTextureData(d.texL.getInternalTexture()!, light, x, z, size, size)
      d.table.set(s, [tile.column, tile.row])
      d.tableChanged = true
    }
    if (d.tableChanged) {
      d.texT.update(d.table.bytes)
      d.tableChanged = false
    }
  }

  /** The view: where the camera looks. */
  get view(): CampaignView {
    return { ...this.viewNow }
  }

  /** Moves the camera (kept on the map and above its ground). */
  setView(view: CampaignView) {
    this.viewNow = view
    this.placeCamera()
  }

  /** How high the map stands at a point (km), from the far level's shape, bilinear. */
  private riseAt(xKm: number, zKm: number): number {
    if (!this.far) return 0
    const { nx, nz, shape } = this.far.data
    const cellKm = this.far.level.cell / 1000
    const fx = Math.min(nx - 1.001, Math.max(0, (xKm + this.half.x) / cellKm))
    const fz = Math.min(nz - 1.001, Math.max(0, (zKm + this.half.z) / cellKm))
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const u = fx - i
    const v = fz - j
    const k = j * nx + i
    const top = shape[k] * (1 - u) + shape[k + 1] * u
    const bottom = shape[k + nx] * (1 - u) + shape[k + nx + 1] * u
    return (top * (1 - v) + bottom * v) / 1000
  }

  /** Places the camera from the view, and the haze by its tilt. */
  private placeCamera() {
    this.viewNow = clampView(this.viewNow, this.half.x, this.half.z, this.riseAt(this.viewNow.x, this.viewNow.z))
    const [x, y, z] = cameraPosition(this.viewNow)
    this.camera.position.set(x, y, z)
    this.camera.setTarget(new Vector3(this.viewNow.x, 0, this.viewNow.z))
    const tilt = (tiltFor(this.viewNow.dist) * 180) / Math.PI
    this.material.setFloat('uHaze', 0.35 * sstep(TILT_FAR, Math.max(TILT_NEAR, TILT_FAR + 1), tilt))
    this.dirty = true
  }

  /**
   * The point of the map (km) under a screen position (CSS pixels), or null above the horizon: where the ray meets
   * the raised surface, found by meeting the level of the ground under the last guess (a few rounds converge: the
   * camera looks down at 30° or more and the shape's slopes, at the far level, are gentle against it).
   */
  groundAt(sx: number, sy: number): [number, number] | null {
    this.scene.updateTransformMatrix(true)
    const ray = this.scene.createPickingRay(sx, sy, Matrix.Identity(), this.camera)
    const d: [number, number, number] = [ray.direction.x, ray.direction.y, ray.direction.z]
    let hit = groundHit([ray.origin.x, ray.origin.y, ray.origin.z], d)
    for (let k = 0; k < GROUND_ROUNDS && hit; k++) {
      const rise = this.riseAt(hit[0], hit[1])
      hit = groundHit([ray.origin.x, ray.origin.y - rise, ray.origin.z], d)
    }
    return hit
  }

  /** A map point (km) on the screen, at the height of the ground there, in CSS pixels, or null behind the camera. */
  private toScreen(x: number, z: number): [number, number] | null {
    const m = this.scene.getTransformMatrix()
    const c = Vector4.TransformCoordinates(new Vector3(x, this.riseAt(x, z), z), m)
    if (c.w <= 1e-6) return null
    const canvas = this.engine.getRenderingCanvasClientRect()
    if (!canvas) return null
    return [((c.x / c.w + 1) / 2) * canvas.width, ((1 - c.y / c.w) / 2) * canvas.height]
  }

  /** Screen pixels per km at the screen's centre. */
  pxPerKm(): number {
    const rect = this.engine.getRenderingCanvasClientRect()
    const c = (rect && this.groundAt(rect.width / 2, rect.height / 2)) || [this.viewNow.x, this.viewNow.z]
    const a = this.toScreen(c[0], c[1])
    const b = this.toScreen(c[0] + 1, c[1])
    return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 1
  }

  /** How to upscale; applied now and on every resize. */
  setUpscale(upscale: Upscale) {
    this.upscale = upscale
    this.applyUpscale()
  }

  /** The upscale's factor now (1: none). */
  upscaleFactor(): number {
    return this.fsr ? this.fsr.scaleFactor : 1
  }

  /**
   * Applies the upscale: the factor that brings the canvas back to about UPSCALE_FROM pixels (or the one asked for),
   * none below 1.15, else 1.3 to 2; FSR 1 made on first use, and left off where the GPU cannot run it. The haze's
   * screen height follows the height the scene is drawn at.
   */
  private applyUpscale() {
    const pixels = this.engine.getRenderWidth(true) * this.engine.getRenderHeight(true)
    let factor = this.upscale === 'off' ? 1 : this.upscale === 'auto' ? Math.sqrt(pixels / UPSCALE_FROM) : this.upscale
    factor = factor < 1.15 ? 1 : Math.min(2, Math.max(1.3, factor))
    if (factor > 1 && !this.fsr) {
      this.fsr = new FSR1RenderingPipeline('fsr', this.scene, [this.camera])
      if (!this.fsr.isSupported) {
        this.fsr.dispose()
        this.fsr = null
      }
    }
    if (this.fsr) this.fsr.scaleFactor = factor
    // the scene is drawn at the screen's height over the factor, and gl_FragCoord counts its pixels
    this.material.setFloat('uScreenH', this.engine.getRenderHeight() / this.upscaleFactor())
  }

  /** The canvas resized: the engine, the upscale and the haze's screen height follow. */
  resize() {
    this.engine.resize()
    this.applyUpscale()
    this.dirty = true
  }

  /** One frame: the clouds' time, the zoom's settings when the view changed, the detail area's upload, the render. */
  private frame() {
    const t = performance.now()
    this.material.setFloat('uTime', t / 1000)
    if (this.dirty) {
      this.dirty = false
      const ppk = this.pxPerKm()
      // by the zoom (screen pixels per km): the ordinary contours from about 1.2, the 100 m tiles from about 4 (a
      // tile node 0.4 px), fully from 9
      this.material.setFloat('uContourK', sstep(1.2, 3, ppk))
      this.material.setFloat('uDetailK', this.detail ? sstep(4, 9, ppk) : 0)
      this.wantDetail(ppk)
      this.onViewChanged?.(ppk)
    }
    this.uploadDetail()
    this.scene.render()
    this.onFrame?.(performance.now() - t)
  }

  /** Starts drawing every frame (once: a second call while it draws does nothing). */
  start() {
    if (this.running) return
    this.running = true
    this.engine.runRenderLoop(this.frameLoop)
  }

  /** Stops drawing every frame (the checks then draw each frame themselves, with bench). */
  stop() {
    this.running = false
    this.engine.stopRenderLoop(this.frameLoop)
  }

  /** Renders n frames back to back, waiting for the GPU after each; returns the mean in ms. */
  bench(n = 60): number {
    const gl = (this.engine as unknown as { _gl: WebGL2RenderingContext })._gl
    const px = new Uint8Array(4)
    const start = performance.now()
    for (let k = 0; k < n; k++) {
      this.frame()
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    }
    return (performance.now() - start) / n
  }
}
