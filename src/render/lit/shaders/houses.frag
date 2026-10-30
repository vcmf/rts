precision highp float;
// The lit map's buildings (G2b, decision 0090): part of the landscape, in the paper's tone a little darker, lit by the
// ground's light (light.glsl): the sun on each face, in the hills' baked shadow and sky where the building stands (a
// wall's, the ground's a cell out from its foot). Other buildings' shadows are drawn on the ground, not on them.
varying vec3 vW, vN;
varying float vTone;
uniform sampler2D uHeight, uLight;
uniform vec2 uX0Z0, uSize, uNodes, uLightNodes;
uniform float uCell, uDatum, uZ, uLightStep, uSkyK, uLamp, uFloor;
uniform vec3 uSun, uPaper, uKey, uSkyC, uEye;   // uEye: the camera's place

#include <light>

void main() {
  vec3 n = normalize(vN);
  if (dot(n, uEye - vW) < 0.0) n = -n;   /* a wall's inner face (a ruin's, seen over its top) faces the other way */
  vec2 B = bakedAt(vW.xz + n.xz * uCell, 1.0);
  gl_FragColor = vec4(litBy(uPaper * vTone, lightOf(n, vW.xz, B.r, B.g)), 1.0);
}
