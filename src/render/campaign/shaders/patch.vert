precision highp float;
// The campaign map's patch near the camera (src/render/campaign/patch.ts, docs/plans/active/k2c-stream.md): vertices
// 100 m apart, on the close level's nodes, raised by its 100 m shape where its tiles are drawn (./detail.glsl), by the
// far mesh's own height elsewhere. The detail eases out from uPatchInner to uPatchOuter km from the camera's target
// (a square, moving with the target, so the heights there change smoothly as the camera pans); within uPatchBand of
// its edge (and easing in over 2 km inside it, wherever the patch lies, near the frame's edge too) it lies on the far
// mesh's surface exactly, where the far mesh is drawn too with the same fragments.
// Positions in km.
attribute vec3 position;      // from the patch's south-west corner
uniform mat4 worldViewProjection;
uniform sampler2D uShape;     // the far level's shape, m, nearest
uniform vec2 uHalf, uTexel;
uniform float uCellKm;
uniform vec4 uPatchRect;      // the patch's corners, km: x0, z0, x1, z1
uniform vec2 uPatchCentre;    // the camera's target, km
uniform float uPatchInner, uPatchOuter;  // km from the target
uniform float uPatchBand;     // km from the patch's edge, where it lies on the far mesh
#include<campaignDetail>
#include<campaignFarMesh>
varying vec2 vW;
void main() {
  vec2 w = uPatchRect.xy + position.xz;
  vW = w;
  // src/render/campaign/patch.ts patchRamp: none within the band of the patch's own edge, wherever the patch lies
  vec2 off = abs(w - uPatchCentre);
  float edge = min(min(w.x - uPatchRect.x, uPatchRect.z - w.x), min(w.y - uPatchRect.y, uPatchRect.w - w.y));
  float ramp = (1.0 - smoothstep(uPatchInner, uPatchOuter, max(off.x, off.y))) *
               smoothstep(uPatchBand, uPatchBand + 2.0, edge);
  float h = farMeshHeight(w + uHalf);
  if (ramp > 0.0) {
    float dk = detailK(w) * ramp;
    if (dk > 0.0) h = mix(h, texture2D(uDetailS, detailUv(w)).r, dk);
  }
  gl_Position = worldViewProjection * vec4(w.x, h / 1000.0, w.y, 1.0);
}
