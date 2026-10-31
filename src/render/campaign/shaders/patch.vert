precision highp float;
// The campaign map's patch near the camera (src/render/campaign/patch.ts, docs/plans/active/k2c-stream.md): vertices
// 100 m apart, on the close level's nodes, raised by its 100 m shape where its tiles are drawn (./detail.glsl), by the
// far mesh's own height elsewhere. The detail eases out from uPatchInner to uPatchOuter km from the camera's target
// (a square, moving with the target, so the heights there change smoothly as the camera pans); beyond, out to its
// edge, the patch lies on the far mesh's surface exactly, where the far mesh is drawn too with the same fragments.
// Positions in km.
attribute vec3 position;      // from the patch's south-west corner
uniform mat4 worldViewProjection;
uniform sampler2D uShape;     // the far level's shape, m, nearest
uniform vec2 uHalf, uTexel;
uniform float uCellKm;
uniform vec4 uPatchRect;      // the patch's corners, km: x0, z0, x1, z1
uniform vec2 uPatchCentre;    // the camera's target, km
uniform float uPatchInner, uPatchOuter;  // km from the target
#include<campaignDetail>
#include<campaignFarMesh>
varying vec2 vW;
void main() {
  vec2 w = uPatchRect.xy + position.xz;
  vW = w;
  vec2 off = abs(w - uPatchCentre);
  float ramp = 1.0 - smoothstep(uPatchInner, uPatchOuter, max(off.x, off.y));
  float far = farMeshHeight(w + uHalf);
  float dk = detailK(w);
  float near = dk > 0.0 ? texture2D(uDetailS, detailUv(w)).r : far;
  float h = mix(far, mix(far, near, dk), ramp);
  gl_Position = worldViewProjection * vec4(w.x, h / 1000.0, w.y, 1.0);
}
