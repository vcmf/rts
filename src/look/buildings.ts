// The buildings (docs/plans/done/buildings.md): the models of prototypes/buildings.data.js (tools/building-to-js.py),
// one instanced mesh a model, where src/look/world/buildings.ts places them; painted by role from the palette
// (shaders/building.frag), static: their shadows go into the sun's bake with the scene's other meshes
// (src/look/bakes.ts), the sky they hide into the light map's occlusion as a blob at their foot (canopy)
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import '../../prototypes/buildings.data.js'
import type { Materials } from './materials.ts'
import type { Nature } from './nature.ts'
import { H } from './heightfield.ts'
import { BUILDINGS, FOOT, toWorld, type Building } from './world/buildings.ts'
import { atlasLayout, MAX_LOD, tileOf, type LitInstance } from './building-light.ts'
import BUILDING_VS from './shaders/building.vert?raw'
import BUILDING_FS from './shaders/building.frag?raw'
import WINDMILL_DETAIL from '../../data/buildings/windmill-detail.png?url'
import HOUSE_DETAIL from '../../data/buildings/house-detail.png?url'

interface BuildingModel {
  pos: number[]
  nrm: number[]
  uv: number[]
  uv2: number[]
  role: number[]
  idx: number[]
  min: number[]
  max: number[]
}
declare global {
  interface Window {
    BUILDINGS?: Record<string, BuildingModel>
  }
}

// each model's palette, by role (wall, roof, timber, opening, accent: building.frag), and its detail texture. Muted
// against the armies (readable first: the guard): the windmill's warm ochre stone and red cap, the cottages' pale
// limestone and blue-grey slate, timber a dark brown, the openings near black, the chimney pots terracotta, the
// windmill's sail blades a pale canvas (its accent: tools/building-to-js.py, sails)
const PALETTE: Record<
  Building['model'],
  { wall: string; roof: string; timber: string; opening: string; accent: string; detail: string }
> = {
  windmill: {
    wall: '#bd8247',
    roof: '#9a4a32',
    timber: '#5e4330',
    opening: '#1f1a17',
    accent: '#bfae8c',
    detail: WINDMILL_DETAIL,
  },
  house: {
    wall: '#cbbfa6',
    roof: '#5d636b',
    timber: '#64472f',
    opening: '#1c1c1e',
    accent: '#a5643f',
    detail: HOUSE_DETAIL,
  },
}
const DETAIL_AMT = 0.35 // how much of the texture's value shows (the paint's grain is on top)

// baked: the static light read from the bake (src/look/building-light.ts; ?bldlm=0, the runtime's taps, the A/B);
// bounce: the ground's bounce on the walls (paint's BOUNCE: computed before and never added; the baked path's only: main.ts)
export function buildBuildings(
  scene: Scene,
  mats: Materials,
  canopy: Nature['canopy'],
  { baked = true, bounce = true } = {},
): { meshes: Mesh[]; instances: LitInstance[] } {
  const data = window.BUILDINGS
  if (!data) throw new Error('the buildings data is missing: run tools/building-to-js.py (its header)')
  const lay = atlasLayout(BUILDINGS.length)
  const meshes: Mesh[] = []
  const instances: LitInstance[] = []
  const _m = new Matrix()
  const _q = new Quaternion()
  const _s = new Vector3()
  const _t = new Vector3()
  for (const model of Object.keys(PALETTE) as Building['model'][]) {
    const items = BUILDINGS.filter(b => b.model === model)
    const d = data[model]
    if (!items.length) continue
    if (!d) throw new Error(`the buildings data has no ${model}: run tools/building-to-js.py`)
    const p = PALETTE[model]
    const mat = mats.make('building_' + model, BUILDING_VS, BUILDING_FS, {
      attributes: ['position', 'normal', 'uv', 'aRole', 'aUV2', 'aTile'],
      uniforms: ['uWall', 'uRoof', 'uTimber', 'uOpening', 'uAccent', 'uDetailAmt'],
      samplers: ['uDetail', 'uBldLight', 'uBldBounce'],
      defines: [
        ...(baked
          ? [
              '#define BLD_BAKED',
              `#define BLD_TILE vec2(${lay.inner[0].toFixed(8)},${lay.inner[1].toFixed(8)})`,
              `#define BLD_SIZE vec2(${lay.width.toFixed(1)},${lay.height.toFixed(1)})`,
              `#define BLD_MAXLOD ${MAX_LOD.toFixed(1)}`,
            ]
          : []),
        ...(bounce ? ['#define BOUNCE'] : []),
      ],
    })
    for (const [u, hex] of [
      ['uWall', p.wall],
      ['uRoof', p.roof],
      ['uTimber', p.timber],
      ['uOpening', p.opening],
      ['uAccent', p.accent],
    ] as const) {
      mat.setColor3(u, Color3.FromHexString(hex))
    }
    mat.setFloat('uDetailAmt', DETAIL_AMT)
    mat.setTexture(
      'uDetail',
      new Texture(p.detail, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE, null, (msg?: string) =>
        console.error(`the ${model}'s detail texture (${p.detail}): ${msg}`),
      ),
    )
    const m = new Mesh('building_' + model, scene)
    m.setVerticesData(VertexBuffer.PositionKind, d.pos)
    m.setVerticesData(VertexBuffer.NormalKind, d.nrm)
    m.setVerticesData(VertexBuffer.UVKind, d.uv)
    m.setVerticesData('aRole', new Float32Array(d.role), false, 1)
    m.setVerticesData('aUV2', d.uv2, false, 2)
    m.setIndices(d.idx)
    m.material = mat
    m.alwaysSelectAsActiveMesh = true
    // each on its footprint's lowest ground (its corners and its centre, or round its circle), sunk 0.2 m so no gap shows
    const buf = new Float32Array(items.length * 16)
    const tile = new Float32Array(items.length * 3)
    items.forEach((b, i) => {
      const f = FOOT[b.model]
      const pts: [number, number][] =
        f.r !== undefined
          ? Array.from({ length: 8 }, (_, k) => [
              Math.cos((k * Math.PI) / 4) * f.r! * b.scale,
              Math.sin((k * Math.PI) / 4) * f.r! * b.scale,
            ])
          : [
              [-f.hx!, -f.hz!],
              [f.hx!, -f.hz!],
              [f.hx!, f.hz!],
              [-f.hx!, f.hz!],
            ].map(([x, z]) => toWorld(b.yaw, x * b.scale, z * b.scale))
      const y = Math.min(H(b.x, b.z), ...pts.map(([dx, dz]) => H(b.x + dx, b.z + dz))) - 0.2
      _t.set(b.x, y, b.z)
      Quaternion.RotationYawPitchRollToRef(b.yaw, 0, 0, _q)
      _s.set(b.scale, b.scale, b.scale)
      Matrix.ComposeToRef(_s, _q, _t, _m)
      _m.copyToArray(buf, i * 16)
      // its tile in the light atlas and its bounce texel, by its place among all the buildings (BUILDINGS' order:
      // building-light.ts, tileOf)
      const at = BUILDINGS.indexOf(b)
      tile.set([...tileOf(at, BUILDINGS.length).slice(0, 2), at], i * 3)
      instances[at] = { mesh: m, root: [b.x, y, b.z] }
      // the sky it hides at its foot (the light map's occlusion, as a tree's contact: nature.ts smBlob)
      const r = (f.r ?? Math.hypot(f.hx!, f.hz!) * 0.8) * b.scale
      const h = (d.max[1] - d.min[1]) * b.scale
      canopy.push([b.x, b.z, r * 1.25, 0.35, false, h * 0.35, r, 0.8])
    })
    m.thinInstanceSetBuffer('matrix', buf, 16, true)
    m.thinInstanceSetBuffer('aTile', tile, 3, true)
    meshes.push(m)
  }
  return { meshes, instances }
}
