precision highp float;
// The campaign map's patch near the camera (src/render/campaign/patch.ts, docs/plans/active/k2c-stream.md): vertices
// 100 m apart, on the close level's nodes, raised by its 100 m shape where its tiles are in the detail area, by the far
// mesh's own height elsewhere. Within uPatchBand of its edge the patch lies on the far mesh's surface exactly (the far
// mesh is drawn there too, the same fragments), then rises to the detail over 2 km. Positions in km.
attribute vec3 position;      // from the patch's south-west corner
uniform mat4 worldViewProjection;
uniform sampler2D uShape;     // the far level's shape, m, nearest
uniform vec2 uHalf, uTexel;
uniform float uCellKm;
uniform vec4 uPatchRect;      // the patch's corners, km: x0, z0, x1, z1
uniform float uPatchBand;     // km
#include<detail>
#include<farmesh>
varying vec2 vW;
void main() {
  vec2 w = uPatchRect.xy + position.xz;
  vW = w;
  float edge = min(min(w.x - uPatchRect.x, uPatchRect.z - w.x), min(w.y - uPatchRect.y, uPatchRect.w - w.y));
  float ramp = smoothstep(uPatchBand, uPatchBand + 2.0, edge);
  float far = farMeshHeight(w + uHalf);
  float dk = detailK(w);
  float near = dk > 0.0 ? texture2D(uDetailS, detailUv(w)).r : far;
  float h = mix(far, mix(far, near, dk), ramp);
  gl_Position = worldViewProjection * vec4(w.x, h / 1000.0, w.y, 1.0);
}
