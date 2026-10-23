// The heightfield, the one answer to "how high is the ground here" for the look world (decision 0012): nodes on the
// tile's grid, built offline and shipped in the look data. The tile mesh is built from it vertex for vertex, and
// heightAt interpolates it on the mesh's own triangles, so the ground drawn and the ground used are equal by
// construction. It extends beyond the tile (SPEC.aoMargin) for the occlusion bake.

export interface Grid {
  n: number
  cell: number
  x0: number
  z0: number
  h: Float32Array
} // node (i, j) at x0 + i·cell, z0 + j·cell
export interface Heightfield extends Grid {
  min: number
  max: number
}

export let HF: Heightfield
let FAR: Grid
let TILE_HALF = 0

// the far ring's nodes come with it: placement beyond the tile reads the ground drawn there
export function setHeightfield(hf: Heightfield, far: Grid, tileHalf: number): void {
  HF = hf
  FAR = far
  TILE_HALF = tileHalf
}

// Babylon's ground (CreateGround) splits each cell along the diagonal from (x1, z0) to (x0, z1): with fu, fv the
// position in the cell from its (x0, z0) corner, the triangle is (00, 10, 01) when fu + fv ≤ 1, else (10, 11, 01).
function sample(f: Grid, x: number, z: number): number {
  // clamped to the field; the last row and column of nodes belong to the cell before them
  const u = Math.min(f.n - 1, Math.max(0, (x - f.x0) / f.cell))
  const v = Math.min(f.n - 1, Math.max(0, (z - f.z0) / f.cell))
  const i = Math.min(f.n - 2, Math.floor(u))
  const j = Math.min(f.n - 2, Math.floor(v))
  const fu = u - i
  const fv = v - j
  const k = j * f.n + i
  const h00 = f.h[k]
  const h10 = f.h[k + 1]
  const h01 = f.h[k + f.n]
  const h11 = f.h[k + f.n + 1]
  return fu + fv <= 1
    ? h00 + (h10 - h00) * fu + (h01 - h00) * fv
    : h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv)
}

export const heightAt = (x: number, z: number): number => sample(HF, x, z)

// the ground anywhere: the heightfield on the tile, the far ring's nodes beyond it (the far ring is drawn from
// them on the same split; only the 14 m apron between the two is approximated by the far grid)
export const groundAt = (x: number, z: number): number =>
  Math.abs(x) <= TILE_HALF && Math.abs(z) <= TILE_HALF ? sample(HF, x, z) : sample(FAR, x, z)

// the prototype's name: every caller that asked H(x, z) reads the drawn ground
export const H = groundAt
