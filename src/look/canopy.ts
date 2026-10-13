// Tree crowns as leaf cards (docs/plans/active/l7a-canopy-cards.md): the crown of a pack model becomes a cloud of
// quads on its surface, each expanded in view space to face the camera and alpha-tested against the leaf atlas
// (src/look/leaves.ts). The technique is Pontus Karlsson's "quadmesh to billboards", the one Tiny Glade ships.
// The cards stand where the model's crown triangles are, so composition and placement match the default arm.
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import '@babylonjs/core/Meshes/thinInstanceMesh.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Materials } from './materials.ts'
import type { NatureModel } from './nature.ts'
import { mulberry } from './noise.ts'
import { CELL } from './leaves.ts'
import CANOPY_VS from './shaders/canopy.vert?raw'
import CANOPY_FS from './shaders/canopy.frag?raw'
import CARDS from './shaders/cards.glsl?raw'

// the card expansion and atlas cell (src/look/shaders/cards.glsl) where a shader says #include<cards>
export const withCards = (src: string): string => src.replace('#include<cards>', () => CARDS)

export interface CardOptions {
  size: number      // a card's half-size, as a fraction of the crown's radius
  cover: number     // how many times the cards cover the crown's surface
  sink: number      // how far a card's centre sits inside the surface, in card half-sizes (keeps the outline's size)
  volume: boolean   // the crown lit as a volume (docs/plans/active/l7b-crown-volume.md); off: L7a's light, card by card
}
export const CARD_DEFAULTS: CardOptions = { size: 0.32, cover: 2.6, sink: 0.8, volume: true }

// one card mesh per model: four vertices per card (centre, corner, card data: half-size, rotation, atlas cell, the
// sink in half-sizes; the role of the crown triangle it stands on) and the crown's sphere normals
export function cardMesh(scene: Scene, name: string, d: NatureModel, o: CardOptions, seed: number): Mesh {
  const P = d.pos, I = d.idx, crown = (v: number) => d.role[v] <= 1
  let cx = 0, cy = 0, cz = 0, n = 0
  for (let v = 0; v < d.role.length; v++) if (crown(v)) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; n++ }
  if (!n) throw new Error(`${name} has no crown to turn into cards`)
  cx /= n; cy /= n; cz /= n
  // the crown's triangles, their areas, and its radius (the farthest crown vertex from its centre)
  const tris: number[] = [], areas: number[] = []
  let total = 0, rad = 0
  for (let v = 0; v < d.role.length; v++) if (crown(v)) rad = Math.max(rad, Math.hypot(P[v * 3] - cx, P[v * 3 + 1] - cy, P[v * 3 + 2] - cz))
  // the crown's ellipsoid (L7b): its bounding box's centre, its horizontal and vertical half-extents
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < d.role.length; v++) if (crown(v)) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], P[v * 3 + j]); hi[j] = Math.max(hi[j], P[v * 3 + j]) }
  const ec = [0, 1, 2].map(j => (lo[j] + hi[j]) / 2), er = [Math.max(hi[0] - lo[0], hi[2] - lo[2]) / 2, (hi[1] - lo[1]) / 2]
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]]; if (!crown(a) || !crown(b) || !crown(c)) continue
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2]
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]
    const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    tris.push(a, b, c); total += ar; areas.push(total)
  }
  if (!(total > 0)) throw new Error(`${name} has crown vertices but no crown triangle to turn into cards`)
  const r = o.size * rad, N = Math.max(12, Math.min(400, Math.ceil(o.cover * total / (4 * r * r))))
  const R = mulberry(seed), pos: number[] = [], nrm: number[] = [], corner: number[] = [], card: number[] = [], cen: number[] = [], role: number[] = [], ellC: number[] = [], ellR: number[] = [], idx: number[] = []
  for (let k = 0; k < N; k++) {
    // an area-weighted point on the crown's surface
    const pick = R() * total; let lo = 0, hi = areas.length - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (areas[m] < pick) lo = m + 1; else hi = m }
    let u = R(), v = R(); if (u + v > 1) { u = 1 - u; v = 1 - v }
    const [a, b, c] = [tris[lo * 3], tris[lo * 3 + 1], tris[lo * 3 + 2]], q = [0, 1, 2].map(j => P[a * 3 + j] + (P[b * 3 + j] - P[a * 3 + j]) * u + (P[c * 3 + j] - P[a * 3 + j]) * v)
    // the sphere normal: the crown shades as one mass, as the default arm's soft crowns do
    let nx = q[0] - cx, ny = q[1] - cy, nz = q[2] - cz; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
    const px = q[0] - nx * r * o.sink, py = q[1] - ny * r * o.sink, pz = q[2] - nz * r * o.sink
    const rot = R() * Math.PI * 2, cell = Math.floor(R() * 4), s = r * (0.8 + R() * 0.4)
    for (const [ex, ey] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(px, py, pz); nrm.push(nx, ny, nz); corner.push(ex, ey); card.push(s, rot, cell, o.sink * r / s); cen.push(cx, cy, cz); role.push(d.role[a]); ellC.push(...ec); ellR.push(...er)
    }
    const b0 = k * 4; idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3)
  }
  const m = new Mesh(name, scene)
  m.setVerticesData(VertexBuffer.PositionKind, pos); m.setVerticesData(VertexBuffer.NormalKind, nrm); m.setIndices(idx)
  m.setVerticesData('aCorner', new Float32Array(corner), false, 2); m.setVerticesData('aCard', new Float32Array(card), false, 4)
  m.setVerticesData('aCrown', new Float32Array(cen), false, 3); m.setVerticesData('aRole', new Float32Array(role), false, 1)
  m.setVerticesData('aEllC', new Float32Array(ellC), false, 3); m.setVerticesData('aEllR', new Float32Array(ellR), false, 2)
  return m
}

// the card material: the default crowns' palette, rim and backlight, the leaf atlas's value and coverage
// volume: the crown lit as a volume (L7b: a normal per pixel from its ellipsoid, the light through it, the soft ramp)
export function cardMaterial(mats: Materials, name: string, folA: string, folB: string, rim: number, leaf: BaseTexture, volume: boolean): ShaderMaterial {
  const m = mats.make(name, withCards(CANOPY_VS), CANOPY_FS, { attributes: ['position', 'normal', 'aCorner', 'aCard', 'aCrown', 'aRole', 'aTint', 'aEllC', 'aEllR'], uniforms: ['view', 'uFolA', 'uFolB', 'uRim', 'uKind', 'uLeafSize'], samplers: ['uLeaf'], defines: volume ? ['#define VOLUME', '#define SOFT_RAMP'] : [] })
  m.setColor3('uFolA', Color3.FromHexString(folA)); m.setColor3('uFolB', Color3.FromHexString(folB)); m.setFloat('uRim', rim); m.setFloat('uKind', 0)
  m.setTexture('uLeaf', leaf); m.setFloat('uLeafSize', CELL * 2); m.backFaceCulling = false
  return m
}

// the card meshes beside a model's thin instances: the same matrices and tints
export function placeCards(m: Mesh, material: ShaderMaterial, matrices: Float32Array, tints: Float32Array): void {
  m.material = material; m.alwaysSelectAsActiveMesh = true
  m.thinInstanceSetBuffer('matrix', matrices, 16, true); m.thinInstanceSetBuffer('aTint', tints, 1, true)
}
