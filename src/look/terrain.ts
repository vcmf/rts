// The ground: the detailed tile, the far ring and the apron that stitches them (docs/plans/done/w1-river-shape.md),
// ported from prototypes/painted-cinematic.html. Two grids meet exactly: the tile (1.79 m) and the far ring
// (14.3 m) both have lines on the tile edge, and one far cell spans exactly 8 tile cells. The far ring drops every
// triangle inside the band one far cell beyond the tile; the apron fills that band, joining the tile's edge
// vertices to the far ring's vertices one for one.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js'
import type { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js'
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import type { GroundMesh } from '@babylonjs/core/Meshes/groundMesh.js'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import { HF } from './heightfield.ts'
import { RIVER, bandOf, riverQuery } from './river.ts'
import { sstep } from './noise.ts'
import { D } from './spec.ts'
import type { Grid } from './heightfield.ts'
import type { SpanGrid } from './world/data.ts'
import { spanTexture } from './span-texture.ts'
import TER_VS from './shaders/terrain.vert?raw'
import TER_FS from './shaders/terrain.frag?raw'

export interface Terrain {
  terrainMat: ShaderMaterial; terrainBakedMat: ShaderMaterial; tileMats: ShaderMaterial[]; farTerrainMat: ShaderMaterial; hillMat: ShaderMaterial; bankN: RawTexture
  riverMask: DynamicTexture; riverMaskCanvas: HTMLCanvasElement
  tileGround: GroundMesh; farGround: GroundMesh; apron: Mesh
}

const TILE_W = D.spec.tile, TILE_SUB = D.spec.tileSub, FAR_W = D.spec.far, FAR_SUB = D.spec.farSub, FAR_CELL = D.farCell, BAND = D.band, MASK_N = D.spec.sizes.riverMask

// heights come from the look data: the tile from the heightfield (decision 0012), the far ring from its own nodes
export function buildTerrain(scene: Scene, mats: Materials, far: Grid, bank: SpanGrid, water: RawTexture): Terrain {
  // DETAIL: the detail layer (src/look/shaders/painter.glsl), on the terrain and the water. BANKN: the tile shades the
  // river's banks with the fine bank normals (docs/plans/done/w2-river-banks.md). WATERDATA: the water data (W3), for
  // the shore band the tile paints near the water as the water does (docs/plans/done/w4-water-surface.md)
  // two: with the live roads (ROADS, WebGL2) and without, where the macro bake holds them far out (src/look/main.ts swaps
  // them by zoom: docs/plans/done/roads.md). On WebGL1 one, without
  const make = (name: string, roads: boolean) => mats.make(name, TER_VS, TER_FS, { attributes: ['position', 'normal', 'aRiver'], uniforms: ['uWaterView', 'uStones', 'uUnder', 'uRoadOn', 'uRoadSegN', 'uRoadFar'], samplers: ['uBankN', 'uWater', 'uGB', 'uMeadow', 'uRoadSegs', 'uRoadGrid', 'uRoadGrit'], defines: ['#define DETAIL', '#define BANKN', '#define WATERDATA', '#define GROUND_BOUNCE', '#define MEADOW_UNDER', ...(roads ? ['#define ROADS'] : [])] })
  const terrainMat = make('terrain', !mats.webgl1), terrainBakedMat = mats.webgl1 ? terrainMat : make('terrainBaked', false)
  const tileMats = [...new Set([terrainMat, terrainBakedMat])]
  // the bank normals: x, z of the normal, the weight; the uncovered texels a level normal of no weight (the vertex
  // normals hold there)
  const bankN = spanTexture(scene, bank, [128, 128, 0, 0], 'bankN')
  for (const m of tileMats) { m.setTexture('uWater', water); m.setTexture('uBankN', bankN) }
  // the bank colours turn symmetric over the bank normals' edge fade, to meet the far ring's painted river (stroked
  // at the river's width) at the tile's edge
  const edgeK = (x: number, z: number) => 1 - sstep(TILE_W / 2 - D.spec.bank.edge, TILE_W / 2, Math.max(Math.abs(x), Math.abs(z)))
  // the lab's test hill: the terrain's material without the ground's bank normals (they would shade its faces)
  const hillMat = mats.make('hill', TER_VS, TER_FS, { attributes: ['position', 'normal', 'aRiver'], samplers: ['uGB'], defines: ['#define DETAIL', '#define GROUND_BOUNCE'] })
  // far ring: the river painted from a mask (the samples stroked at their widths), since 15 m vertices can't hold it
  const riverMaskCanvas = document.createElement('canvas'); riverMaskCanvas.width = riverMaskCanvas.height = MASK_N
  // one path per run of equal (half-pixel) width: a canvas filter or a stroke per sample loses the GL context in SwiftShader
  {
    const g = riverMaskCanvas.getContext('2d')!, C = RIVER, k = MASK_N / FAR_W, X = (i: number) => (C.px[i] + FAR_W / 2) * k, Z = (i: number) => (C.pz[i] + FAR_W / 2) * k, w = (i: number) => Math.round(C.W[i] * k * 2) / 2
    g.fillStyle = '#000'; g.fillRect(0, 0, MASK_N, MASK_N); g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round'
    for (let i = 0; i < C.n - 1;) { const lw = w(i); g.lineWidth = lw; g.beginPath(); g.moveTo(X(i), Z(i)); let j = i + 1; for (; j < C.n - 1 && w(j) === lw; j++) g.lineTo(X(j), Z(j)); g.lineTo(X(j), Z(j)); g.stroke(); i = j }
  }
  const riverMask = new DynamicTexture('riverMask', riverMaskCanvas, scene, true, Texture.BILINEAR_SAMPLINGMODE); riverMask.wrapU = riverMask.wrapV = Texture.CLAMP_ADDRESSMODE; riverMask.update(false)
  const farTerrainMat = mats.make('farTerrain', TER_VS, TER_FS, { attributes: ['position', 'normal', 'aRiver'], samplers: ['uRiverMask'], defines: ['#define FARRING', '#define DETAIL'] }); farTerrainMat.setTexture('uRiverMask', riverMask)

  function ground(size: number, sub: number): GroundMesh {
    const g = CreateGround('t', { width: size, height: size, subdivisions: sub, updatable: true }, scene)
    const p = g.getVerticesData(VertexBuffer.PositionKind)!, coarse = size > TILE_W
    const rv = new Float32Array(p.length / 3)
    // far ring: valley trough only, no channel and no water; the river is a painted line there (FARRING). rv=8 (no bank
    // colours): on a 14 m grid they would bead along the line. Vertex (row, col) is node (col, sub − row) of its grid.
    const m = D.hfMargin
    for (let row = 0, k = 0; row <= sub; row++) for (let col = 0; col <= sub; col++, k++) {
      if (coarse) { p[k * 3 + 1] = far.h[(sub - row) * far.n + col]; rv[k] = 8 }
      else { p[k * 3 + 1] = HF.h[(sub - row + m) * HF.n + col + m]; rv[k] = bandOf(riverQuery(p[k * 3], p[k * 3 + 2]), edgeK(p[k * 3], p[k * 3 + 2])) }
    }
    g.updateVerticesData(VertexBuffer.PositionKind, p); g.updateCoordinateHeights()
    if (coarse) {
      const ix = g.getIndices()!, keep: number[] = []
      for (let t = 0; t < ix.length; t += 3) {
        const cx = (p[ix[t] * 3] + p[ix[t + 1] * 3] + p[ix[t + 2] * 3]) / 3, cz = (p[ix[t] * 3 + 2] + p[ix[t + 1] * 3 + 2] + p[ix[t + 2] * 3 + 2]) / 3
        if (Math.max(Math.abs(cx), Math.abs(cz)) > BAND) keep.push(ix[t], ix[t + 1], ix[t + 2])
      }
      g.setIndices(keep)
    }
    const n: number[] = []; VertexData.ComputeNormals(p, g.getIndices(), n); g.updateVerticesData(VertexBuffer.NormalKind, n)
    g.setVerticesData('aRiver', rv, false, 1)
    g.material = coarse ? farTerrainMat : terrainMat; return g
  }
  const tileGround = ground(TILE_W, TILE_SUB), farGround = ground(FAR_W, FAR_SUB)

  // vertex index of grid point (x,z) in a CreateGround mesh (rows run from +z to -z)
  const gridV = (size: number, sub: number, x: number, z: number) => { const c = size / sub, col = Math.round((x + size / 2) / c), row = sub - Math.round((z + size / 2) / c); return row * (sub + 1) + col }
  const tp = tileGround.getVerticesData(VertexBuffer.PositionKind)!, tn = tileGround.getVerticesData(VertexBuffer.NormalKind)!, tr = tileGround.getVerticesData('aRiver')!
  const fp = farGround.getVerticesData(VertexBuffer.PositionKind)!, fn = farGround.getVerticesData(VertexBuffer.NormalKind)!
  const pos: number[] = [], nor: number[] = [], rv: number[] = [], idx: number[] = [], E2 = TILE_W / 2, R = Math.round(TILE_SUB * FAR_CELL / TILE_W)   // 8 tile cells per far cell
  // each apron vertex is a copy of a tile or far vertex (position, normal, bank value), so the seams are exact
  const add = (src: ArrayLike<number>, sn: ArrayLike<number>, k: number, r: number, x: number, z: number) => {
    if (Math.abs(src[k * 3] - x) > 1e-3 || Math.abs(src[k * 3 + 2] - z) > 1e-3) throw Error(`apron: no grid vertex at ${x},${z}`)
    pos.push(src[k * 3], src[k * 3 + 1], src[k * 3 + 2]); nor.push(sn[k * 3], sn[k * 3 + 1], sn[k * 3 + 2]); rv.push(r); return pos.length / 3 - 1
  }
  const T = (x: number, z: number) => { const k = gridV(TILE_W, TILE_SUB, x, z); return add(tp, tn, k, tr[k], x, z) }, Fv = (x: number, z: number) => add(fp, fn, gridV(FAR_W, FAR_SUB, x, z), 8, x, z)
  // same winding as the ground meshes (their face normals point up)
  const ti = tileGround.getIndices()!, up = (a: number, b: number, c: number, P: ArrayLike<number>) => { const ax = P[b * 3] - P[a * 3], az = P[b * 3 + 2] - P[a * 3 + 2], bx = P[c * 3] - P[a * 3], bz = P[c * 3 + 2] - P[a * 3 + 2]; return az * bx - ax * bz }
  const sgn = Math.sign(up(ti[0], ti[1], ti[2], tp)), tri = (a: number, b: number, c: number) => { if (Math.sign(up(a, b, c, pos)) === sgn) idx.push(a, b, c); else idx.push(a, c, b) }
  for (const [ux, uz, ox, oz] of [[1, 0, 0, -1], [0, 1, 1, 0], [-1, 0, 0, 1], [0, -1, -1, 0]]) {   // edge direction, outward normal
    for (let s = 0; s < Math.round(FAR_SUB * TILE_W / FAR_W); s++) {                                // one far cell along the edge
      const at = (t: number, o: number): [number, number] => [(-ux * E2 + ox * E2) + ux * t + ox * o, (-uz * E2 + oz * E2) + uz * t + oz * o], cell = TILE_W / TILE_SUB
      const I: number[] = []; for (let k = 0; k <= R; k++) I.push(T(...at((s * R + k) * cell, 0)))
      const O0 = Fv(...at(s * FAR_CELL, FAR_CELL)), O1 = Fv(...at((s + 1) * FAR_CELL, FAR_CELL))
      for (let k = 0; k < R; k++) tri(I[k], I[k + 1], k < R / 2 ? O0 : O1)
      tri(I[R / 2], O1, O0)
    }
    // corner square beyond the end of this edge: tile corner + three far vertices
    const c = [ux * E2 + ox * E2, uz * E2 + oz * E2], a = T(c[0], c[1]), b = Fv(c[0] + ox * FAR_CELL, c[1] + oz * FAR_CELL), d = Fv(c[0] + ox * FAR_CELL + ux * FAR_CELL, c[1] + oz * FAR_CELL + uz * FAR_CELL), e = Fv(c[0] + ux * FAR_CELL, c[1] + uz * FAR_CELL)
    tri(a, b, d); tri(a, d, e)
  }
  const apron = new Mesh('apron', scene), vd = new VertexData(); vd.positions = pos; vd.normals = nor; vd.indices = idx; vd.applyToMesh(apron)
  apron.setVerticesData('aRiver', new Float32Array(rv), false, 1); apron.material = farTerrainMat
  return { terrainMat, terrainBakedMat, tileMats, farTerrainMat, hillMat, bankN, riverMask, riverMaskCanvas, tileGround, farGround, apron }
}

