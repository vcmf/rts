precision highp float;
// The plate's sides: paper lit by the map's sun, darker below; the top face (under the map's edge) plain paper, so it
// never shows as specks where the two meet.
varying vec3 vN;
varying float vY;
uniform vec3 uPaper;
uniform vec2 uLightXZ;
uniform float uThick;
void main() {
  float lit = 0.55 + 0.45 * max(0.0, dot(normalize(vN.xz + 1e-5), uLightXZ));
  float low = mix(0.8, 1.0, clamp(vY / uThick + 1.0, 0.0, 1.0));
  gl_FragColor = vec4(vN.y > 0.5 ? uPaper : uPaper * lit * low, 1.0);
}
