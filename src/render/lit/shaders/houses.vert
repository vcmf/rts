precision highp float;
// the lit map's buildings (G2b): boxes on the flat plane, in world metres (x east, z north), each face's normal and
// its tone (a share of the paper's colour) for houses.frag
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
uniform mat4 world, viewProjection;
varying vec3 vW, vN;
varying float vTone;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vW = w.xyz;
  vN = normal;
  vTone = color.r;
  gl_Position = viewProjection * w;
}
