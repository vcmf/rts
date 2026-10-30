// G2's light (decision 0090), shared by the lit map's plane (lit.frag), its buildings (houses.frag) and their shadows
// on the ground (shadows.frag), each of which declares the uniforms it reads.

// the height at a point, bilinear between the four nodes round it (m above sea level)
float heightAt(vec2 xz) {
  vec2 u = (xz - uX0Z0) / uCell;
  vec2 i = clamp(floor(u), vec2(0.0), uNodes - 2.0);
  vec2 f = clamp(u - i, 0.0, 1.0);
  ivec2 a = ivec2(i);
  float h00 = texelFetch(uHeight, a, 0).r, h10 = texelFetch(uHeight, a + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeight, a + ivec2(0, 1), 0).r, h11 = texelFetch(uHeight, a + ivec2(1, 1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) + uDatum;
}

// the ground's normal (not normalised) from the node heights raised uZ times, as the bake's: the differences one-sided
// within a cell of the map's edge (the heights past it are held, which would halve the slope there); flat past it
vec3 groundNormal(vec2 xz, float inside) {
  float gx = 0.0, gz = 0.0;
  if (inside > 0.0) {   /* past the map's edge the ground is flat: no height to read */
    vec2 lo = uX0Z0, hi = uX0Z0 + (uNodes - 1.0) * uCell;
    vec2 p0 = clamp(xz - uCell, lo, hi), p1 = clamp(xz + uCell, lo, hi);
    gx = (heightAt(vec2(p1.x, xz.y)) - heightAt(vec2(p0.x, xz.y))) / max(p1.x - p0.x, 1e-3) * uZ;
    gz = (heightAt(vec2(xz.x, p1.y)) - heightAt(vec2(xz.x, p0.y))) / max(p1.y - p0.y, 1e-3) * uZ;
  }
  return vec3(-gx, 1.0, -gz);
}

// the bake's light at a point: R the sun's soft shadow, G the open sky; all of both past the map's edge
vec2 bakedAt(vec2 xz, float inside) {
  vec2 ln = (xz - uX0Z0) / (uCell * uLightStep);   /* light node i at the centre of texel i */
  return mix(vec2(1.0), texture2D(uLight, (ln + 0.5) / uLightNodes).rg, inside);
}

// the warm sun on a face of normal n (x east, y up, z north), in the baked share of the sun `sunB`, a little stronger
// on the sun's side of the map (a lamp beside the table); the cool sky in its baked share `skyB`, less on a steep
// face. Divided by what flat open ground gets, so that comes out in the paper's own tone.
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
