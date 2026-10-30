precision highp float;
// The buildings' shadows on the ground (G2b, decision 0090): their swept walls drawn over the plane, multiplying the
// frame by how much the ground's light falls when the sun's share is taken from it (the sky's alone left), so a
// building's shadow is the hills' shade on the same ground, with the plane's own edges. The stencil lets each pixel be
// darkened once, however many shadows overlap there. Read on the paper's colour: the floor and the shoulder bend the
// light by the colour, which the plane's own ink and water would bend a little otherwise.
varying vec3 vW;
uniform sampler2D uHeight, uLight;
uniform sampler2D uMask;     // B the water, on the cells
uniform vec2 uX0Z0, uSize, uNodes, uLightNodes;
uniform float uCell, uDatum, uZ, uLightStep, uSkyK, uLamp, uFloor;
uniform vec3 uSun, uPaper, uKey, uSkyC;

#include <light>

void main() {
  vec2 uv = (vW.xz - uX0Z0) / uSize;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  /* the water's face lies flat, as the plane's (there from the ink's field, here from the water's cells) */
  float water = texture2D(uMask, clamp(uv, 0.0, 1.0)).b * inside;
  vec3 n = normalize(mix(groundNormal(vW.xz, inside), vec3(0.0, 1.0, 0.0), water));
  vec2 B = bakedAt(vW.xz, inside);
  vec3 lit = litBy(uPaper, lightOf(n, vW.xz, B.r, B.g));
  vec3 shade = litBy(uPaper, lightOf(n, vW.xz, 0.0, B.g));
  gl_FragColor = vec4(shade / max(lit, vec3(1e-3)), 1.0);
}
