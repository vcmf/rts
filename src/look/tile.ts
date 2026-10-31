// The detailed tile's place in the world (G3b, docs/plans/active/g3b-the-detail-follows.md): its centre, m, on
// SPEC.tileStep's grid (the look data's tileAt). The shaders read it as uTileO (painter.glsl's tileUV and tileEdge);
// every material Materials.make makes is given this one vector (bindTile), which Babylon keeps by reference, so a moved
// tile is set here once; a material made apart that reads the tile calls bindTile, and the bakes' effect wrappers set
// it a draw (src/look/macro.ts). The shaders' side: shaders/tile.glsl (#include<tile>, src/look/materials.ts)
import { Vector2 } from '@babylonjs/core/Maths/math.vector.js'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'

export const TILE_O = new Vector2(0, 0)

/** The tile's centre given to a material (its shaders declare uTileO) */
export const bindTile = (m: ShaderMaterial): void => {
  m.setVector2('uTileO', TILE_O)
}

/** Whether a point lies on the tile: within `half` m of its centre on both axes (a margin: a larger or smaller half) */
export const onTile = (x: number, z: number, half: number): boolean =>
  Math.abs(x - TILE_O.x) <= half && Math.abs(z - TILE_O.y) <= half

/** The larger of a point's two axis distances from the tile's centre, m (the shaders' tileEdge) */
export const tileEdge = (x: number, z: number): number => Math.max(Math.abs(x - TILE_O.x), Math.abs(z - TILE_O.y))

/**
 * The tile the focus wants (G3b-3: src/look/main.ts's follower): null while the focus lies `edgeM` m or more inside
 * the tile now; else the centre on the `step` grid nearest the focus, kept so a whole tile of side 2·`half` lies inside
 * the map's `edge` (the compiler builds no tile past it), or null when that is the tile now
 */
export function tileWanted(
  x: number,
  z: number,
  edge: { x0: number; z0: number; x1: number; z1: number },
  step: number,
  half: number,
  edgeM: number,
): [number, number] | null {
  if (tileEdge(x, z) <= half - edgeM) return null
  const lo = (v: number) => Math.ceil((v + half) / step) * step
  const hi = (v: number) => Math.floor((v - half) / step) * step
  const on = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v / step) * step))
  const at: [number, number] = [on(x, lo(edge.x0), hi(edge.x1)), on(z, lo(edge.z0), hi(edge.z1))]
  return at[0] === TILE_O.x && at[1] === TILE_O.y ? null : at
}
