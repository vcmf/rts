precision highp float;
// the lit map view's plane (docs/plans/active/m6-lit-view.md): flat at the map's zoom, in world metres (x east, z north)
attribute vec3 position;
uniform mat4 world, viewProjection;
varying vec3 vW;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = viewProjection * w;
}
