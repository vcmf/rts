// The far mesh's own height (src/render/campaign/patch.ts farMeshHeight, the same steps), shared by the patch
// (./patch.vert, as the include campaignFarMesh): its vertices uMeshStep nodes apart on the far level's grid (the last column and
// row on the grid's edge), each quad cut from its south-east corner to its north-west one, the height linear on each
// triangle. Needs uShape (nearest), uTexel (one over the nodes) and uCellKm.
uniform float uMeshStep;
uniform vec2 uNodes;          // the far level's nodes, x and z (exact, not one over uTexel)

// a node's height, m
float farNode(vec2 ij) {
  vec2 last = uNodes - 1.0;
  return texture2D(uShape, (min(ij, last) + 0.5) * uTexel).r;
}

// the far mesh's height at p (km from the frame's corner), m
float farMeshHeight(vec2 p) {
  vec2 last = uNodes - 1.0;
  vec2 lastQuad = ceil(last / uMeshStep) - 1.0;
  vec2 g = p / uCellKm / uMeshStep;
  vec2 q = clamp(floor(g), vec2(0.0), lastQuad);
  vec2 a = q * uMeshStep;
  vec2 b = min((q + 1.0) * uMeshStep, last);
  vec2 uv = (p / uCellKm - a) / (b - a);
  float h00 = farNode(a);
  float h10 = farNode(vec2(b.x, a.y));
  float h01 = farNode(vec2(a.x, b.y));
  float h11 = farNode(b);
  if (uv.x + uv.y <= 1.0) return h00 + uv.x * (h10 - h00) + uv.y * (h01 - h00);
  return h11 + (1.0 - uv.x) * (h01 - h11) + (1.0 - uv.y) * (h10 - h11);
}
