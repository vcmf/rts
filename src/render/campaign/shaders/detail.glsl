// The campaign map's detail area (src/render/campaign/ring.ts, docs/plans/active/k2c-stream.md), shared by the print
// (./print.frag) and the patch near the camera (./patch.vert), which name it as an include, detail: the 100 m tiles in
// a ring of slots around the camera, its textures wrapping (node k of the close level at k modulo the area), and a
// table of the tile each slot holds. Needs uHalf (the frame's half size, km).
uniform sampler2D uDetailS;   // the shape, m, nearest
uniform sampler2D uDetailL;   // the light: R sun, G sky, B tree cover
uniform sampler2D uDetailT;   // the slots' table: column in RG and row in BA, high byte first, 0xffff when none
uniform vec4 uDetailRect;     // the area's first and last nodes, km: x0, z0, x1, z1
uniform vec2 uDetailTexel;
uniform float uDetailCellKm, uDetailSize, uDetailArea, uDetailK;

// the detail area (the 100 m tiles around the camera, in a ring of slots): a point's node in the close level, and
// its uv in the area's textures (they wrap: node k of the level lies at k modulo the area)
vec2 detailNode(vec2 w) {
  return (w + uHalf) / uDetailCellKm;
}
vec2 detailUv(vec2 w) {
  return (detailNode(w) + 0.5) * uDetailTexel;
}
// whether the slot of the tile node k lies in holds that tile, written
bool slotHolds(vec2 k) {
  vec2 tile = floor(k / uDetailSize);
  vec2 slot = mod(tile, uDetailArea);
  vec4 t = texture2D(uDetailT, (slot + 0.5) / uDetailArea) * 255.0;
  vec2 held = vec2(t.r * 256.0 + t.g, t.b * 256.0 + t.a);
  return all(lessThan(abs(held - tile), vec2(0.5)));
}
// whether every tile the detail reads at a point is in its slot: the reads reach two nodes either way (the
// Catmull-Rom pass from one before to two after); inside a tile, its own slot alone, near its edge the corners of
// that box, which between them touch every tile it does (a tile is far wider than the box)
bool detailHeld(vec2 w) {
  vec2 k = floor(detailNode(w));
  vec2 local = k - floor(k / uDetailSize) * uDetailSize;
  if (all(greaterThanEqual(local, vec2(2.0))) && all(lessThanEqual(local, vec2(uDetailSize - 4.0)))) {
    return slotHolds(k);
  }
  return slotHolds(k + vec2(-2.0, -2.0)) && slotHolds(k + vec2(3.0, -2.0)) &&
         slotHolds(k + vec2(-2.0, 3.0)) && slotHolds(k + vec2(3.0, 3.0));
}
// how much of the detail to use at a point: the zoom's share, faded over 8 km to the area's edge, and only where the
// tiles it reads are in their slots
float detailK(vec2 w) {
  if (uDetailK <= 0.0) return 0.0;
  float edge = min(min(w.x - uDetailRect.x, uDetailRect.z - w.x), min(w.y - uDetailRect.y, uDetailRect.w - w.y));
  if (edge <= 0.0 || !detailHeld(w)) return 0.0;
  return uDetailK * smoothstep(0.0, 8.0, edge);
}
