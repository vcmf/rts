// The campaign map's detail area (src/render/campaign/ring.ts, docs/plans/active/k2c-stream.md), shared by the print
// (./print.frag) and the patch near the camera (./patch.vert), which name it as the include campaignDetail: the 100 m tiles in
// a ring of slots around the camera, its textures wrapping (node k of the close level at k modulo the area), and a
// table of the tile each slot holds; a tile fades in as it arrives, and toward a neighbour not yet drawn, in the light
// and the geometry alike. Needs uHalf (the frame's half size, km).
uniform sampler2D uDetailS;   // the shape, m, nearest
uniform sampler2D uDetailL;   // the light: R sun, G sky, B tree cover
uniform sampler2D uDetailT;   // the slots' table: column in RG and row in BA, high byte first, 0xffff when none
uniform sampler2D uDetailF;   // each slot's fade-in, 0 to 1, as its tile is first drawn
uniform vec4 uDetailRect;     // the area's first and last nodes, km: x0, z0, x1, z1
uniform vec2 uDetailTexel;
uniform float uDetailCellKm, uDetailSize, uDetailArea, uDetailK;
uniform float uDetailFade;    // nodes: how far from a tile's edge its detail fades toward a neighbour not drawn

// the detail area (the 100 m tiles around the camera, in a ring of slots): a point's node in the close level, and
// its uv in the area's textures (they wrap: node k of the level lies at k modulo the area)
vec2 detailNode(vec2 w) {
  return (w + uHalf) / uDetailCellKm;
}
vec2 detailUv(vec2 w) {
  return (detailNode(w) + 0.5) * uDetailTexel;
}
// how much of tile t to draw: its slot's fade-in (0 to 1 over its first frames) when the slot holds it, else 0
float tileWeight(vec2 t) {
  vec2 slot = (mod(t, uDetailArea) + 0.5) / uDetailArea;
  vec4 held = texture2D(uDetailT, slot) * 255.0;
  bool holds = all(lessThan(abs(vec2(held.r * 256.0 + held.g, held.b * 256.0 + held.a) - t), vec2(0.5)));
  return holds ? texture2D(uDetailF, slot).r : 0.0;
}

// how much of the detail to draw at a point, from its tiles: its own tile's weight, faded toward each neighbour that
// is not drawn over uDetailFade nodes from their shared edge (none within two nodes of it, where the reads reach
// across), the corner's tile the same near a corner; inside a tile, far from its edges, its own tile alone
float detailWeight(vec2 w) {
  vec2 k = detailNode(w);
  vec2 t = floor(k / uDetailSize);
  vec2 local = k - t * uDetailSize;
  float self = tileWeight(t);
  if (self <= 0.0) return 0.0;
  vec2 lo = local;
  vec2 hi = uDetailSize - local;
  if (min(min(lo.x, lo.y), min(hi.x, hi.y)) >= uDetailFade) return self;
  // across each edge: the neighbour's weight, eased in toward the edge
  float wx = lo.x < hi.x ? tileWeight(t + vec2(-1.0, 0.0)) : tileWeight(t + vec2(1.0, 0.0));
  float wz = lo.y < hi.y ? tileWeight(t + vec2(0.0, -1.0)) : tileWeight(t + vec2(0.0, 1.0));
  float dx = min(lo.x, hi.x);
  float dz = min(lo.y, hi.y);
  float sx = smoothstep(2.0, uDetailFade, dx);
  float sz = smoothstep(2.0, uDetailFade, dz);
  float weight = self * mix(wx, 1.0, sx) * mix(wz, 1.0, sz);
  if (dx < uDetailFade && dz < uDetailFade) {
    vec2 corner = vec2(lo.x < hi.x ? -1.0 : 1.0, lo.y < hi.y ? -1.0 : 1.0);
    weight *= mix(tileWeight(t + corner), 1.0, smoothstep(2.0, uDetailFade, max(dx, dz)));
  }
  return weight;
}

// how much of the detail to use at a point: the zoom's share, faded over 8 km to the area's edge, and by its tiles
float detailK(vec2 w) {
  if (uDetailK <= 0.0) return 0.0;
  float edge = min(min(w.x - uDetailRect.x, uDetailRect.z - w.x), min(w.y - uDetailRect.y, uDetailRect.w - w.y));
  if (edge <= 0.0) return 0.0;
  return uDetailK * smoothstep(0.0, 8.0, edge) * detailWeight(w);
}
