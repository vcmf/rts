// The detailed tile's place in the world (G3b, docs/plans/done/g3b-the-detail-follows.md): its centre, m, on
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
 * The tile the focus wants (G3b-3: src/look/main.ts's follower), axis by axis: on an axis where the focus lies more
 * than `half` − `edgeM` m from the tile's centre, the centre on the `step` grid nearest it, kept within `bounds` (the
 * centres a whole tile can have: inside the map and the far ring); on the other the centre now. Null when that is the
 * tile now. So a focus held against the map's edge, its centre's axis kept there, moves the tile only along the other
 * axis, and only past the rule there: no flip back and forth (after a move the focus lies within half a step of the
 * centre on a moved axis, and step / 2 < half − edgeM: followRuleOk)
 */
export function tileWanted(
  x: number,
  z: number,
  bounds: { x0: number; z0: number; x1: number; z1: number },
  step: number,
  half: number,
  edgeM: number,
): [number, number] | null {
  const axis = (v: number, o: number, lo: number, hi: number) =>
    Math.abs(v - o) <= half - edgeM ? o : Math.max(lo, Math.min(hi, Math.round(v / step) * step))
  const at: [number, number] = [axis(x, TILE_O.x, bounds.x0, bounds.x1), axis(z, TILE_O.y, bounds.z0, bounds.z1)]
  return at[0] === TILE_O.x && at[1] === TILE_O.y ? null : at
}

/** The centres a whole tile (side 2·`half`) can have on the `step` grid inside a rectangle (the map's edge, the far
 *  ring shrunk by a far cell: the apron's) */
export function tileBounds(
  r: { x0: number; z0: number; x1: number; z1: number },
  step: number,
  half: number,
): { x0: number; z0: number; x1: number; z1: number } {
  const lo = (v: number) => Math.ceil((v + half) / step - 1e-9) * step
  const hi = (v: number) => Math.floor((v - half) / step + 1e-9) * step
  return { x0: lo(r.x0), z0: lo(r.z0), x1: hi(r.x1), z1: hi(r.z1) }
}

/** Whether the follow rule cannot flip back after a move: half a grid step inside the rule's distance */
export const followRuleOk = (step: number, half: number, edgeM: number): boolean => step / 2 < half - edgeM

/**
 * The follower's choices (G3b-3, src/look/main.ts): a tile is asked for when the focus wants one that has not just
 * failed (built or moved: asked again only once the focus wants another, not each frame); a tile that comes is swapped
 * in if it holds the focus (a fast pan still gets detail under it, the next tile asked for after)
 */
export class TileFollow {
  private failed = ''
  /** whether to ask for the tile the focus wants now (null: none) */
  ask(wanted: readonly [number, number] | null): boolean {
    return !!wanted && wanted.join(',') !== this.failed
  }
  /** whether a tile come from the worker is swapped in: the one the focus wants now (`wanted`; near the map's edge it
   *  may not reach the focus), or one that holds the focus (x, z) within `half` m of its centre, even if the focus
   *  wants another by now (a fast pan: the next frame asks for that); else, and when none is wanted, it is dropped */
  accept(
    came: readonly [number, number],
    wanted: readonly [number, number] | null,
    x: number,
    z: number,
    half: number,
  ): boolean {
    // (none wanted: the tile now holds the focus, a tile come would only be swapped back)
    if (!wanted) return false
    const isWanted = wanted[0] === came[0] && wanted[1] === came[1]
    return isWanted || (Math.abs(x - came[0]) <= half && Math.abs(z - came[1]) <= half)
  }
  /** a tile that failed (null: a failure that names none, the last kept) */
  failedAt(at: readonly [number, number] | null): void {
    if (at) this.failed = at.join(',')
  }
  /** a tile moved to: any tile may be asked for again */
  moved(): void {
    this.failed = ''
  }
}
