precision highp float;
// The plate's sides under the campaign map (docs/systems/campaign-map.md).
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
varying vec3 vN;
varying float vY;
void main() {
  vN = normal;
  vY = position.y;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
