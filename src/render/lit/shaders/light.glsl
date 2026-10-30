// G2's light (decision 0090), shared by the lit map's plane (lit.frag) and its buildings (houses.frag), each of which
// declares the uniforms it reads: the warm sun on a face of normal n (x east, y up, z north), in the baked share of the
// sun `sunB`, a little stronger on the sun's side of the map (a lamp beside the table); the cool sky in its baked share
// `skyB`, less on a steep face. Divided by what flat open ground gets, so that comes out in the paper's own tone.
vec3 lightOf(vec3 n, vec2 xz, float sunB, float skyB) {
  float key = min(max(0.0, dot(n, uSun)) / uSun.y, 3.0);   /* a face lit three times flat ground at most: a low ?sun= */
  float sky = skyB * (0.55 + 0.45 * n.y);
  vec2 toSun = normalize(uSun.xz + vec2(1e-6, 0.0));
  float side = clamp(dot((xz - uX0Z0) / uSize * 2.0 - 1.0, toSun) * 0.5, -0.5, 0.5);
  vec3 keyC = uKey * mix(vec3(1.0), vec3(1.06, 0.96, 0.84), side * 2.0 * uLamp);
  vec3 light = keyC * key * sunB * (1.0 + uLamp * side) * (1.0 - uSkyK) + uSkyC * sky * uSkyK;
  return light / (uKey * (1.0 - uSkyK) + uSkyC * uSkyK);
}
// a colour under that light, no darker than the floor, the brightest faces glowing toward white instead of clipping
vec3 litBy(vec3 c, vec3 light) {
  vec3 lit = c * max(light, vec3(uFloor));
  return min(lit / (1.0 + 0.18 * max(lit - 1.0, 0.0)), vec3(1.0));
}
