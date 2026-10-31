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
