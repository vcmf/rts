precision highp float;
// The lit map's buildings (G2b, decision 0090): part of the landscape, in the paper's tone a little darker, lit by the
// ground's light (light.glsl): the sun on each face, in the hills' baked shadow and sky where the building stands; a
// wall toward the sun also in the shadows other buildings cast on the ground at its foot (the cells' mask, G). The
// roof reads no building's shadow: its own footprint is in its own.
varying vec3 vW, vN;
varying float vTone;
uniform sampler2D uLight;    // R the sun's soft shadow, G the open sky, on every uLightStep-th node
uniform sampler2D uMask;     // G the buildings' shadows' share of the sun, on the cells
uniform vec2 uX0Z0, uSize, uLightNodes;
uniform float uCell, uLightStep, uSkyK, uLamp, uFloor;
uniform vec3 uSun, uPaper, uKey, uSkyC, uEye;   // uEye: the camera's place

#include <light>

void main() {
  vec3 n = normalize(vN);
  if (dot(n, uEye - vW) < 0.0) n = -n;   /* a wall's inner face (a ruin's, seen over its top) faces the other way */
  vec2 at = vW.xz + n.xz * uCell;   /* a wall's light is the ground's a cell out from its foot; a roof's, its own place */
  vec2 B = texture2D(uLight, ((at - uX0Z0) / (uCell * uLightStep) + 0.5) / uLightNodes).rg;
  float others = n.y > 0.5 ? 0.0 : texture2D(uMask, clamp((at - uX0Z0) / uSize, 0.0, 1.0)).g;
  gl_FragColor = vec4(litBy(uPaper * vTone, lightOf(n, vW.xz, B.r * (1.0 - others), B.g)), 1.0);
}
