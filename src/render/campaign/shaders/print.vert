precision highp float;
// The campaign map's surface (docs/systems/campaign-map.md): the map raised by the shape, in km (x east, y up,
// z north); the table, outside the frame, stays where it is. The prototype's (prototypes/campaign-map.html).
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform sampler2D uShape;   // the far level's shape, m, one float a node, the south row first
uniform vec2 uHalf, uTexel;
uniform float uCellKm;
varying vec2 vW;
void main() {
  vW = position.xz;
  vec2 uv = ((position.xz + uHalf) / uCellKm + 0.5) * uTexel;
  bool onMap = abs(position.x) <= uHalf.x && abs(position.z) <= uHalf.y;
  float y = position.y + (onMap ? texture2D(uShape, uv).r / 1000.0 : 0.0);
  gl_Position = worldViewProjection * vec4(position.x, y, position.z, 1.0);
}
