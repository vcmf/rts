// The campaign map's patch near the camera (docs/plans/active/k2c-stream.md, K2c2): a mesh of vertices 100 m apart that
// follows the camera's target up close, raised by the 100 m shape, on top of the far mesh (a vertex every 500 m),
// whose vertices inside it drop away. At its edge the patch takes the far mesh's own height, so the two meet without a
// crack. Pure: where the patch lies, and the far mesh's height the edge must match; the shaders (./shaders/patch.vert,
// ./shaders/print.vert) do the same per vertex.

/**
 * Where the patch starts on one axis (km from the frame's centre): `size` km long, centred on `target`, its start on
 * the far mesh's grid (`step` km apart from the frame's edge at -`half`, so it never swims as the target moves) and
 * kept a step inside the frame (the far mesh's last quad may be narrower); null when the frame cannot hold it so.
 */
export function patchStart(target: number, half: number, step: number, size: number): number | null {
  const most = Math.floor((2 * half - size) / step) - 1
  if (most < 1) return null
  const steps = Math.round((target - size / 2 + half) / step)
  return -half + Math.min(Math.max(1, steps), most) * step
}

/**
 * The far mesh's own height at a point (km from the frame's corner, x east and z north): its vertices `step` nodes
 * apart on a grid of `nx` × `nz` nodes `cell` km apart (the last column and row on the grid's edge), each quad cut in
 * two triangles from its south-east corner to its north-west one (the mesh's indices), the height linear on each.
 */
export function farMeshHeight(
  shape: ArrayLike<number>,
  nx: number,
  nz: number,
  cell: number,
  step: number,
  x: number,
  z: number,
): number {
  const lastI = Math.ceil((nx - 1) / step) - 1
  const lastJ = Math.ceil((nz - 1) / step) - 1
  const gi = x / cell / step
  const gj = z / cell / step
  const i = Math.min(lastI, Math.max(0, Math.floor(gi)))
  const j = Math.min(lastJ, Math.max(0, Math.floor(gj)))
  const node = (a: number, b: number) => shape[Math.min(nz - 1, b * step) * nx + Math.min(nx - 1, a * step)]
  // the quad's own size in nodes, the last ones narrower
  const wi = Math.min(nx - 1, (i + 1) * step) - i * step
  const wj = Math.min(nz - 1, (j + 1) * step) - j * step
  const u = (x / cell - i * step) / wi
  const v = (z / cell - j * step) / wj
  const h00 = node(i, j)
  const h10 = node(i + 1, j)
  const h01 = node(i, j + 1)
  const h11 = node(i + 1, j + 1)
  return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11)
}
