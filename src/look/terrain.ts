// The ground: the detailed tile, the far ring and the apron that stitches them (docs/plans/done/w1-river-shape.md),
// ported from prototypes/painted-cinematic.html. Two grids meet exactly: the tile (1.79 m) and the far ring
// (14.3 m) both have lines on the tile edge, and one far cell spans exactly 8 tile cells. The far ring drops every
// triangle inside the band one far cell beyond the tile; the apron fills that band, joining the tile's edge
// vertices to the far ring's vertices one for one.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import type { GroundMesh } from '@babylonjs/core/Meshes/groundMesh.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { SubMesh } from '@babylonjs/core/Meshes/subMesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { HF } from './heightfield.ts'
import { RIVER, bandOf, riverQuery } from './river.ts'
import { sstep } from './noise.ts'
import { D, rectOf, type Rect } from './spec.ts'
import type { Grid } from './heightfield.ts'
import type { LightGrid, SpanGrid } from './world/data.ts'
import { COVER, WEAR_STEP, type CoverGrid } from './world/cover.ts'
import { YARD_ALL, paveDefines } from './world/buildings.ts'
import { spanTexture } from './span-texture.ts'
import { PAPER as STAFF_PAPER } from '../render/lit/view.ts'
import TER_VS from './shaders/terrain.vert?raw'
import TER_FS from './shaders/terrain.frag?raw'

export interface Terrain {
  terrainMat: ShaderMaterial
  terrainRoadsMat: ShaderMaterial
  terrainBakedMat: ShaderMaterial
  terrainSplitMat: MultiMaterial
  tileMats: ShaderMaterial[]
  farTerrainMat: ShaderMaterial
  hillMat: ShaderMaterial
  bankN: RawTexture
  riverMask: DynamicTexture
  riverMaskCanvas: HTMLCanvasElement
  tileGround: GroundMesh
  farGround: GroundMesh
  apron: Mesh
}

const TILE_W = D.spec.tile
const TILE_SUB = D.spec.tileSub
const FAR_CELL = D.farCell
const BAND = D.band
const MASK_N = D.spec.sizes.riverMask

// the staff map's paper (src/render/lit/view.ts) in its summer tone, past a map world's edge (G3a; the paper by the
// season, as the staff map's, with the zoom handover: G4)
const PAPER = [1, 3, 5].map(k => parseInt(STAFF_PAPER[0].slice(k, k + 2), 16) / 255)
const glsl = (v: number) => v.toFixed(3)

/**
 * The far ring's own defines on a map world (G3a, docs/plans/active/g3a-the-whole-map-far.md): the map's coarse light
 * off the tile (COARSE_LIGHT: its texture's corner and size, a node at a texel's centre) and the paper past the map's
 * edge (MAP_EDGE); none on the demo.
 */
export function farRingDefines(light: LightGrid | null, edge: Rect | null): string[] {
  const out: string[] = []
  if (light) {
    out.push(
      '#define COARSE_LIGHT',
      `#define COARSE_O vec2(${glsl(light.x0 - light.cell / 2)},${glsl(light.z0 - light.cell / 2)})`,
      `#define COARSE_W vec2(${glsl(light.nx * light.cell)},${glsl(light.nz * light.cell)})`,
    )
  }
  if (edge) {
    out.push(
      '#define MAP_EDGE',
      `#define EDGE_LO vec2(${glsl(edge.x0)},${glsl(edge.z0)})`,
      `#define EDGE_HI vec2(${glsl(edge.x1)},${glsl(edge.z1)})`,
      `#define PAPER vec3(${PAPER.map(glsl).join(',')})`,
    )
  }
  return out
}

// heights come from the look data: the tile from the heightfield (decision 0012), the far ring from its own nodes (a
// map world's: the whole map, ringFor in src/look/spec.ts), lit off the tile by the map's coarse light (`light`) and
// paper past its `edge`
export function buildTerrain(
  scene: Scene,
  mats: Materials,
  far: Grid,
  bank: SpanGrid,
  water: RawTexture,
  light: LightGrid | null = null,
  edge: Rect | null = null,
): Terrain {
  const ring = rectOf(far)
  const FAR_W = ring.x1 - ring.x0
  const FAR_SUB = far.n - 1
  // the ring's centre: its mesh is built about the origin and moved there
  const fcx = (ring.x0 + ring.x1) / 2
  const fcz = (ring.z0 + ring.z1) / 2
  // DETAIL: the detail layer (src/look/shaders/painter.glsl), on the terrain and the water. BANKN: the tile shades the
  // river's banks with the fine bank normals (docs/plans/done/w2-river-banks.md). WATERDATA: the water data (W3), for
  // the shore band the tile paints near the water as the water does (docs/plans/done/w4-water-surface.md)
  // two: with the live roads (ROADS, WebGL2) and without, where the macro bake holds them far out (src/look/main.ts
  // swaps them by zoom: docs/plans/done/roads.md). On WebGL1 one, without
  const make = (name: string, roads: boolean, paving = false) =>
    mats.make(name, TER_VS, TER_FS, {
      attributes: ['position', 'normal', 'aRiver'],
      uniforms: ['uWaterView', 'uStones', 'uUnder', 'uRoadOn', 'uRoadSegN', 'uRoadFar', 'uPaveA', 'uPaveB', 'uPaveN'],
      samplers: ['uBankN', 'uWater', 'uGB', 'uMeadow', 'uRoadSegs', 'uRoadGrid', 'uRoadGrit'],
      defines: [
        '#define DETAIL',
        '#define BANKN',
        '#define WATERDATA',
        '#define GROUND_BOUNCE',
        '#define MEADOW_UNDER',
        ...(roads ? ['#define ROADS'] : []),
        ...(paving ? ['#define PAVING', ...paveDefines()] : []),
      ],
    })
  // three tile materials: the live roads and the buildings' paving (terrainMat: on the yards' ground; the whole tile
  // under ?split=0, the debug views), the live roads alone (terrainRoadsMat: on the ground near a road), and neither
  // (the baked: far out, and the rest of the ground near). splitGround gives each its triangles. On WebGL1 one, without
  const terrainMat = make('terrain', !mats.webgl1, !mats.webgl1)
  const terrainRoadsMat = mats.webgl1 ? terrainMat : make('terrainRoads', true)
  const terrainBakedMat = mats.webgl1 ? terrainMat : make('terrainBaked', false)
  const tileMats = [...new Set([terrainMat, terrainRoadsMat, terrainBakedMat])]
  // the tile ground's three materials by triangle (splitGround: the paving only near a yard, the live roads only near a
  // road), made here so the ground keeps its place in the opaque draws (Babylon sorts them by the mesh's material's
  // creation: after the trees the ground cost more, docs/plans/done/trees-perf-trunks.md)
  const terrainSplitMat = new MultiMaterial('terrainSplit', scene)
  terrainSplitMat.subMaterials = [terrainMat, terrainRoadsMat, terrainBakedMat]
  // the bank normals: x, z of the normal, the weight; the uncovered texels a level normal of no weight (the vertex
  // normals hold there)
  const bankN = spanTexture(scene, bank, [128, 128, 0, 0], 'bankN')
  for (const m of tileMats) {
    m.setTexture('uWater', water)
    m.setTexture('uBankN', bankN)
  }
  // the bank colours turn symmetric over the bank normals' edge fade, to meet the far ring's painted river (stroked
  // at the river's width) at the tile's edge
  const edgeK = (x: number, z: number) =>
    1 - sstep(TILE_W / 2 - D.spec.bank.edge, TILE_W / 2, Math.max(Math.abs(x), Math.abs(z)))
  // the lab's test hill: the terrain's material without the ground's bank normals (they would shade its faces)
  const hillMat = mats.make('hill', TER_VS, TER_FS, {
    attributes: ['position', 'normal', 'aRiver'],
    samplers: ['uGB'],
    defines: ['#define DETAIL', '#define GROUND_BOUNCE'],
  })
  // far ring: the river painted from a mask (the samples stroked at their widths), since 15 m vertices can't hold it
  const riverMaskCanvas = document.createElement('canvas')
  riverMaskCanvas.width = riverMaskCanvas.height = MASK_N
  // one path per run of equal (half-pixel) width: a canvas filter or a stroke per sample
  // loses the GL context in SwiftShader
  {
    const g = riverMaskCanvas.getContext('2d')!
    const C = RIVER
    const k = MASK_N / FAR_W
    const X = (i: number) => (C.px[i] - ring.x0) * k
    const Z = (i: number) => (C.pz[i] - ring.z0) * k
    const w = (i: number) => Math.round(C.W[i] * k * 2) / 2
    g.fillStyle = '#000'
    g.fillRect(0, 0, MASK_N, MASK_N)
    g.strokeStyle = '#fff'
    g.lineCap = g.lineJoin = 'round'
    for (let i = 0; i < C.n - 1;) {
      const lw = w(i)
      g.lineWidth = lw
      g.beginPath()
      g.moveTo(X(i), Z(i))
      let j = i + 1
      for (; j < C.n - 1 && w(j) === lw; j++) g.lineTo(X(j), Z(j))
      g.lineTo(X(j), Z(j))
      g.stroke()
      i = j
    }
  }
  const riverMask = new DynamicTexture('riverMask', riverMaskCanvas, scene, true, Texture.BILINEAR_SAMPLINGMODE)
  riverMask.wrapU = riverMask.wrapV = Texture.CLAMP_ADDRESSMODE
  riverMask.update(false)
  const farTerrainMat = mats.make('farTerrain', TER_VS, TER_FS, {
    attributes: ['position', 'normal', 'aRiver'],
    samplers: ['uRiverMask', ...(light ? ['uCoarse'] : [])],
    defines: ['#define FARRING', '#define DETAIL', ...farRingDefines(light, edge)],
  })
  farTerrainMat.setTexture('uRiverMask', riverMask)
  if (light) {
    // R the sun's soft shadow, G the open sky (bilinear, its nodes at the texels' centres)
    const rgba = new Uint8Array(light.nx * light.nz * 4)
    for (let k = 0; k < light.nx * light.nz; k++) {
      rgba[k * 4] = light.rg[k * 2]
      rgba[k * 4 + 1] = light.rg[k * 2 + 1]
      rgba[k * 4 + 3] = 255
    }
    const t = RawTexture.CreateRGBATexture(rgba, light.nx, light.nz, scene, false, false, Texture.BILINEAR_SAMPLINGMODE)
    t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE
    farTerrainMat.setTexture('uCoarse', t)
  }

  function ground(size: number, sub: number, cx = 0, cz = 0): GroundMesh {
    const g = CreateGround('t', { width: size, height: size, subdivisions: sub, updatable: true }, scene)
    g.position.set(cx, 0, cz)
    const p = g.getVerticesData(VertexBuffer.PositionKind)!
    const coarse = size > TILE_W
    const rv = new Float32Array(p.length / 3)
    // far ring: valley trough only, no channel and no water; the river is a painted line there (FARRING). rv=8 (no bank
    // colours): on a 14 m grid they would bead along the line. Vertex (row, col) is node (col, sub − row) of its grid.
    const m = D.hfMargin
    for (let row = 0, k = 0; row <= sub; row++) {
      for (let col = 0; col <= sub; col++, k++) {
        if (coarse) {
          p[k * 3 + 1] = far.h[(sub - row) * far.n + col]
          rv[k] = 8
        } else {
          p[k * 3 + 1] = HF.h[(sub - row + m) * HF.n + col + m]
          rv[k] = bandOf(riverQuery(p[k * 3], p[k * 3 + 2]), edgeK(p[k * 3], p[k * 3 + 2]))
        }
      }
    }
    g.updateVerticesData(VertexBuffer.PositionKind, p)
    g.updateCoordinateHeights()
    if (coarse) {
      const ix = g.getIndices()!
      const keep: number[] = []
      for (let t = 0; t < ix.length; t += 3) {
        const tx = cx + (p[ix[t] * 3] + p[ix[t + 1] * 3] + p[ix[t + 2] * 3]) / 3
        const tz = cz + (p[ix[t] * 3 + 2] + p[ix[t + 1] * 3 + 2] + p[ix[t + 2] * 3 + 2]) / 3
        if (Math.max(Math.abs(tx), Math.abs(tz)) > BAND) keep.push(ix[t], ix[t + 1], ix[t + 2])
      }
      g.setIndices(keep)
    }
    const n: number[] = []
    VertexData.ComputeNormals(p, g.getIndices(), n)
    g.updateVerticesData(VertexBuffer.NormalKind, n)
    g.setVerticesData('aRiver', rv, false, 1)
    g.material = coarse ? farTerrainMat : terrainMat
    return g
  }
  const tileGround = ground(TILE_W, TILE_SUB)
  const farGround = ground(FAR_W, FAR_SUB, fcx, fcz)

  // vertex index of grid point (x,z) in a CreateGround mesh (rows run from +z to -z)
  const gridV = (size: number, sub: number, x: number, z: number) => {
    const c = size / sub
    const col = Math.round((x + size / 2) / c)
    const row = sub - Math.round((z + size / 2) / c)
    return row * (sub + 1) + col
  }
  const tp = tileGround.getVerticesData(VertexBuffer.PositionKind)!
  const tn = tileGround.getVerticesData(VertexBuffer.NormalKind)!
  const tr = tileGround.getVerticesData('aRiver')!
  const fp = farGround.getVerticesData(VertexBuffer.PositionKind)!
  const fn = farGround.getVerticesData(VertexBuffer.NormalKind)!
  const pos: number[] = []
  const nor: number[] = []
  const rv: number[] = []
  const idx: number[] = []
  const E2 = TILE_W / 2
  // 8 tile cells per far cell
  const R = Math.round((TILE_SUB * FAR_CELL) / TILE_W)
  // each apron vertex is a copy of a tile or far vertex (position, normal, bank value; a far vertex moved by its mesh's
  // place, ox, oz), so the seams are exact
  const add = (
    src: ArrayLike<number>,
    sn: ArrayLike<number>,
    k: number,
    r: number,
    x: number,
    z: number,
    ox = 0,
    oz = 0,
  ) => {
    if (Math.abs(src[k * 3] + ox - x) > 1e-3 || Math.abs(src[k * 3 + 2] + oz - z) > 1e-3) {
      throw Error(`apron: no grid vertex at ${x},${z}`)
    }
    pos.push(src[k * 3] + ox, src[k * 3 + 1], src[k * 3 + 2] + oz)
    nor.push(sn[k * 3], sn[k * 3 + 1], sn[k * 3 + 2])
    rv.push(r)
    return pos.length / 3 - 1
  }
  const T = (x: number, z: number) => {
    const k = gridV(TILE_W, TILE_SUB, x, z)
    return add(tp, tn, k, tr[k], x, z)
  }
  const Fv = (x: number, z: number) => add(fp, fn, gridV(FAR_W, FAR_SUB, x - fcx, z - fcz), 8, x, z, fcx, fcz)
  // same winding as the ground meshes (their face normals point up)
  const ti = tileGround.getIndices()!
  const up = (a: number, b: number, c: number, P: ArrayLike<number>) => {
    const ax = P[b * 3] - P[a * 3]
    const az = P[b * 3 + 2] - P[a * 3 + 2]
    const bx = P[c * 3] - P[a * 3]
    const bz = P[c * 3 + 2] - P[a * 3 + 2]
    return az * bx - ax * bz
  }
  const sgn = Math.sign(up(ti[0], ti[1], ti[2], tp))
  const tri = (a: number, b: number, c: number) => {
    if (Math.sign(up(a, b, c, pos)) === sgn) idx.push(a, b, c)
    else idx.push(a, c, b)
  }
  for (const [ux, uz, ox, oz] of [
    [1, 0, 0, -1],
    [0, 1, 1, 0],
    [-1, 0, 0, 1],
    [0, -1, -1, 0],
  ]) {
    // edge direction, outward normal
    for (let s = 0; s < Math.round(TILE_W / FAR_CELL); s++) {
      // one far cell along the edge
      const at = (t: number, o: number): [number, number] => [
        -ux * E2 + ox * E2 + ux * t + ox * o,
        -uz * E2 + oz * E2 + uz * t + oz * o,
      ]
      const cell = TILE_W / TILE_SUB
      const I: number[] = []
      for (let k = 0; k <= R; k++) I.push(T(...at((s * R + k) * cell, 0)))
      const O0 = Fv(...at(s * FAR_CELL, FAR_CELL))
      const O1 = Fv(...at((s + 1) * FAR_CELL, FAR_CELL))
      for (let k = 0; k < R; k++) tri(I[k], I[k + 1], k < R / 2 ? O0 : O1)
      tri(I[R / 2], O1, O0)
    }
    // corner square beyond the end of this edge: tile corner + three far vertices
    const c = [ux * E2 + ox * E2, uz * E2 + oz * E2]
    const a = T(c[0], c[1])
    const b = Fv(c[0] + ox * FAR_CELL, c[1] + oz * FAR_CELL)
    const d = Fv(c[0] + ox * FAR_CELL + ux * FAR_CELL, c[1] + oz * FAR_CELL + uz * FAR_CELL)
    const e = Fv(c[0] + ux * FAR_CELL, c[1] + uz * FAR_CELL)
    tri(a, b, d)
    tri(a, d, e)
  }
  const apron = new Mesh('apron', scene)
  const vd = new VertexData()
  vd.positions = pos
  vd.normals = nor
  vd.indices = idx
  vd.applyToMesh(apron)
  apron.setVerticesData('aRiver', new Float32Array(rv), false, 1)
  apron.material = farTerrainMat
  return {
    terrainMat,
    terrainRoadsMat,
    terrainBakedMat,
    terrainSplitMat,
    tileMats,
    farTerrainMat,
    hillMat,
    bankN,
    riverMask,
    riverMaskCanvas,
    tileGround,
    farGround,
    apron,
  }
}

// The tile's triangles by what can paint them (docs/plans/done/headroom.md: a shader's size costs every pixel it draws,
// so each feature's code only where it can show): by its grid cell's cover texels and 1 m round them (read nearest:
// a texel of slack), a cell with a yard's texel (YARD_ALL and up in B, src/look/world/cover.ts: under it the paving can
// paint) takes the live roads with the paving (submesh 0, terrainMat); else a cell within the road gate of a line by
// the cover's wear distance (roadPaint's first test, shore.glsl: D.roadGate) the live roads alone (1, terrainRoadsMat);
// the rest the material without either (2: there roadPaint returns its colour unchanged). The same pixels as the live
// material everywhere but for a step of rounding between the programs. Each triangle takes its cell's answer (by its
// centroid: it lies inside it). Returns the tile ground's material for it, and the share of the tile's triangles each
// of the three takes (paved, roads, neither)
export function splitGround(
  t: Terrain,
  cover: CoverGrid,
): { material: MultiMaterial; share: [number, number, number] } {
  const g = t.tileGround
  const P = g.getVerticesData(VertexBuffer.PositionKind)!
  const ix = g.getIndices()!
  const C = cover
  const M = 1
  const n = TILE_SUB
  const w = TILE_W / n
  const h = TILE_W / 2
  const lim = Math.ceil(D.roadGate / WEAR_STEP) + 1
  const at = (v: number) => Math.min(C.n - 1, Math.max(0, Math.floor(v)))
  const cellOf = (v: number) => Math.min(n - 1, Math.max(0, Math.floor((v + h) / w)))
  const kind = new Uint8Array(n * n).fill(2)
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      const x0 = cx * w - h
      const z0 = cz * w - h
      // (a village texel's field id is 0: its B is the yard's mark or 0; the first yard texel settles the cell)
      scan: for (let j = at((z0 - M - C.z0) / C.cell); j <= at((z0 + w + M - C.z0) / C.cell); j++) {
        for (let i = at((x0 - M - C.x0) / C.cell); i <= at((x0 + w + M - C.x0) / C.cell); i++) {
          const o = (j * C.n + i) * 4
          if (C.tex[o] === COVER.village && C.tex[o + 2] >= YARD_ALL) {
            kind[cz * n + cx] = 0
            break scan
          }
          if (C.tex[o + 3] <= lim) kind[cz * n + cx] = 1
        }
      }
    }
  }
  // each triangle by its centroid's cell, once; then by kind, the paved first
  const tk = new Uint8Array(ix.length / 3)
  const count = [0, 0, 0]
  for (let k = 0; k < tk.length; k++) {
    let x = 0
    let z = 0
    for (let q = 0; q < 3; q++) {
      x += P[ix[k * 3 + q] * 3]
      z += P[ix[k * 3 + q] * 3 + 2]
    }
    tk[k] = kind[cellOf(z / 3) * n + cellOf(x / 3)]
    count[tk[k]] += 3
  }
  const out = new Uint32Array(ix.length)
  const at3 = [0, count[0], count[0] + count[1]]
  for (let k = 0; k < tk.length; k++) {
    const o = at3[tk[k]]
    out[o] = ix[k * 3]
    out[o + 1] = ix[k * 3 + 1]
    out[o + 2] = ix[k * 3 + 2]
    at3[tk[k]] += 3
  }
  g.setIndices(out)
  g.subMeshes = []
  const nv = P.length / 3
  new SubMesh(0, 0, nv, 0, count[0], g)
  new SubMesh(1, 0, nv, count[0], count[1], g)
  new SubMesh(2, 0, nv, count[0] + count[1], count[2], g)
  return { material: t.terrainSplitMat, share: [count[0] / ix.length, count[1] / ix.length, count[2] / ix.length] }
}
