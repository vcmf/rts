#extension GL_OES_standard_derivatives : enable
precision highp float;
// The campaign map's print (docs/systems/campaign-map.md; the look: decision 0093), the prototype's
// (prototypes/campaign-map.html): the paper, then what is printed on it before the light (the forests, the contours,
// the water in its sunk steps, the rivers and roads), then the light of the relief model per pixel (a warm sun in its
// baked soft shadow, the cool sky in its baked occlusion, drifting cloud shadows, a lamp beside the table), haze
// toward the top as the camera tilts. Outside the frame, the table and the plate's shadow. Every input is baked
// offline (tools/campaign-tiles.ts): the far level's tiles and fields, and up close the 100 m tiles of the detail
// area. Positions in km, x east and z north; every texture runs south row first.
varying vec2 vW;
uniform sampler2D uShape;     // the far level's shape, m, a float a node, nearest (read at its texel centres)
uniform sampler2D uShapeL;    // the same, bilinear: the slope far out
uniform sampler2D uLight;     // the far level's light and forests: R the sun (0 shadow, 1 lit), G the open sky, B the
                              // tree cover, a node
uniform sampler2D uLines;     // the offsets to the high roads (RG) and country roads (BA), a texel a cell
uniform sampler2D uRivers;    // the offsets to the rivers (RG), a texel a cell
uniform sampler2D uLakes;     // the lakes' coverage, its texels tiling the frame
uniform sampler2D uLakeD;     // the signed distance to the shore, km (positive in the water), a node
uniform sampler2D uContourH;  // the heights smoothed for the contours, m, a node
uniform sampler2D uPaperT, uClouds;
uniform vec2 uHalf, uTexel, uLightTexel, uLakeTexel;
uniform vec3 uSun, uPaper, uTable, uKey, uSky, uRoad, uRoad2, uRiver, uContourInk, uContourMinor;
uniform vec3 uShallow, uDeep, uWood;
uniform float uCellKm, uSkyK, uLamp, uContour, uContourIndex, uContourK, uTime, uCloudK;
uniform float uHaze, uScreenH, uWoodK, uWoodFrom;
// the water's steps: one of uStep m every uStepKm from the shore, at most uBands of them; the lines' reach in km
uniform float uStepKm, uStep, uBands, uLineReachKm;

#include<campaignDetail>

// a screen pixel's size in km: set first thing in main, read by the water's steps
float gPx = 1.0;

// the lake floor's steps below the sunk surface, in m of the shape, at a distance d (km) from the shore: one step
// every uStepKm, each edge a crisp bank about a pixel wide
float waterSteps(float d) {
  if (d <= 0.0) return 0.0;
  float b = d / uStepKm;
  float soft = clamp(gPx / uStepKm * 1.2, 0.02, 1.0);
  float steps = floor(b) + smoothstep(1.0 - soft, 1.0, fract(b));
  return min(steps, uBands) * uStep;
}

float rectDist(vec2 p, vec2 extent) {
  vec2 d = abs(p) - extent;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// the frame grid: node i at the centre of texel i
vec2 gridUv(vec2 w) {
  return ((w + uHalf) / uCellKm + 0.5) * uTexel;
}

// a smooth cubic B-spline read of all four channels, from four bilinear taps
vec4 bicubic4(sampler2D t, vec2 uv, vec2 texel) {
  vec2 p = uv / texel - 0.5;
  vec2 f = fract(p);
  p = floor(p);
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (3.0 * f * f * f - 6.0 * f * f + 4.0) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 w2 = 1.0 - w0 - w1 - w3;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 a = (p - 1.0 + w1 / g0 + 0.5) * texel;
  vec2 b = (p + 1.0 + w3 / g1 + 0.5) * texel;
  return g0.y * (g0.x * texture2D(t, vec2(a.x, a.y)) + g1.x * texture2D(t, vec2(b.x, a.y)))
       + g1.y * (g0.x * texture2D(t, vec2(a.x, b.y)) + g1.x * texture2D(t, vec2(b.x, b.y)));
}

// a Catmull-Rom read with its slope: (value, d/du, d/dv) per texel, from the same sixteen taps
vec3 catmullRomGrad(sampler2D t, vec2 uv, vec2 texel) {
  vec2 p = uv / texel - 0.5;
  vec2 f = fract(p);
  vec2 base = (floor(p) + 0.5) * texel;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec4 wx = vec4(-0.5 * f3.x + f2.x - 0.5 * f.x, 1.5 * f3.x - 2.5 * f2.x + 1.0,
                 -1.5 * f3.x + 2.0 * f2.x + 0.5 * f.x, 0.5 * f3.x - 0.5 * f2.x);
  vec4 wy = vec4(-0.5 * f3.y + f2.y - 0.5 * f.y, 1.5 * f3.y - 2.5 * f2.y + 1.0,
                 -1.5 * f3.y + 2.0 * f2.y + 0.5 * f.y, 0.5 * f3.y - 0.5 * f2.y);
  vec4 dx = vec4(-1.5 * f2.x + 2.0 * f.x - 0.5, 4.5 * f2.x - 5.0 * f.x,
                 -4.5 * f2.x + 4.0 * f.x + 0.5, 1.5 * f2.x - f.x);
  vec4 dy = vec4(-1.5 * f2.y + 2.0 * f.y - 0.5, 4.5 * f2.y - 5.0 * f.y,
                 -4.5 * f2.y + 4.0 * f.y + 0.5, 1.5 * f2.y - f.y);
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    float y = base.y + float(j - 1) * texel.y;
    vec4 row = vec4(texture2D(t, vec2(base.x - texel.x, y)).r, texture2D(t, vec2(base.x, y)).r,
                    texture2D(t, vec2(base.x + texel.x, y)).r, texture2D(t, vec2(base.x + 2.0 * texel.x, y)).r);
    float a = j == 0 ? wy.x : j == 1 ? wy.y : j == 2 ? wy.z : wy.w;
    float b = j == 0 ? dy.x : j == 1 ? dy.y : j == 2 ? dy.z : dy.w;
    sum += vec3(a * dot(wx, row), a * dot(dx, row), b * dot(wx, row));
  }
  return sum;
}

// the lake floor's steps at a point (m below the sunk surface)
float stepsH(vec2 w) {
  return waterSteps(texture2D(uLakeD, gridUv(w)).r);
}

// the slope of the shape the light falls on, in m per km (x east, y north): the shape's own, up close from one
// Catmull-Rom pass and its derivative, further out (a cell under a pixel) by differences of four bilinear reads
// across the pixel, which average what the pixel covers; in the detail area, the 100 m shape's slope by the same
// Catmull-Rom pass instead; then the water's steps, by differences, only where they are
vec2 slopeAt(vec2 w, float px, float dk) {
  float far = smoothstep(0.8, 1.4, px / uCellKm);
  vec2 g = vec2(0.0);
  if (far < 1.0) g = catmullRomGrad(uShape, gridUv(w), uTexel).yz / uCellKm * (1.0 - far);
  if (far > 0.0) {
    vec2 ex = vec2(px, 0.0);
    vec2 ez = vec2(0.0, px);
    float hx = texture2D(uShapeL, gridUv(w + ex)).r - texture2D(uShapeL, gridUv(w - ex)).r;
    float hz = texture2D(uShapeL, gridUv(w + ez)).r - texture2D(uShapeL, gridUv(w - ez)).r;
    g += vec2(hx, hz) / (2.0 * px) * far;
  }
  if (dk > 0.0) g = mix(g, catmullRomGrad(uDetailS, detailUv(w), uDetailTexel).yz / uDetailCellKm, dk);
  float e = max(px, 0.5 * uCellKm);
  vec2 ex = vec2(e, 0.0);
  vec2 ez = vec2(0.0, e);
  if (texture2D(uLakeD, gridUv(w)).r > -0.2) {
    g -= vec2(stepsH(w + ex) - stepsH(w - ex), stepsH(w + ez) - stepsH(w - ez)) / (2.0 * e);
  }
  return g;
}

// a line of a line texture (two channels: the offset to the nearest point of the line), drawn crisp: its half width
// in km
float lineMask(vec2 offset, float halfKm, float pxKm) {
  float d = length(offset * 2.0 - 1.0) * uLineReachKm;
  return 1.0 - smoothstep(halfKm - 0.6 * pxKm, halfKm + 0.6 * pxKm, d);
}

void main() {
  vec2 uv = gridUv(vW);
  float g1 = texture2D(uPaperT, vW / 3.0).r;
  float g2 = texture2D(uPaperT, vW / 31.0 + 0.37).r;
  float g3 = texture2D(uPaperT, vW / 170.0 + 0.71).r;
  float grain = 0.95 + (g1 - 0.5) * 0.16 + (g2 - 0.5) * 0.1 + (g3 - 0.5) * 0.06;
  float haze = uHaze * smoothstep(0.45, 1.0, gl_FragCoord.y / uScreenH);

  float d = rectDist(vW, uHalf);
  if (d > 0.0) {
    // the table, and the plate's shadow thrown away from the sun
    vec2 away = -normalize(uSun.xz);
    float sd = rectDist(vW - away * 18.0, uHalf);
    float shadow = 1.0 - smoothstep(-10.0, 40.0, sd);
    vec3 table = uTable * (0.97 + (g2 - 0.5) * 0.08 + (g3 - 0.5) * 0.06);
    table *= 1.0 - 0.38 * shadow;
    gl_FragColor = vec4(mix(table, uTable, haze), 1.0);
    return;
  }

  // the paper, with a thin worn border inside the neatline
  vec3 paper = uPaper * grain;
  paper *= mix(vec3(0.88, 0.88, 0.9), vec3(1.0), smoothstep(0.6, 3.0, -d));

  // the ink printed on it, before the light: contours, rivers and roads, lakes; the light then falls on the print
  float px = max(length(fwidth(vW)), 1e-4);
  gPx = px;
  vec3 print = paper;
  // how much of the detail area to use here: read once, for the forests and the light
  float dk = detailK(vW);

  // forests: printed green on the paper, before the light, from the tree cover at 250 m, or at 100 m from the tiles
  // up close; their edges crisp at any zoom
  {
    float cover = texture2D(uLight, uv).b;
    if (dk > 0.0) cover = mix(cover, texture2D(uDetailL, detailUv(vW)).b, dk);
    float edge = max(0.04, fwidth(cover));
    float wood = smoothstep(uWoodFrom - edge, uWoodFrom + edge, cover);
    vec3 green = uWood * (0.9 + (g2 - 0.5) * 0.25 + (g1 - 0.5) * 0.12);
    print = mix(print, green, wood * uWoodK);
  }

  // contours from the smoothed heights: the ordinary lines thin and a muted grey, every uContourIndex-th (the index
  // line) thicker in orange; each fades where its lines would crowd on screen
  float hc = texture2D(uContourH, uv).r;
  float f1 = hc / uContour;
  float f5 = f1 / uContourIndex;
  float w1 = fwidth(f1);
  float w5 = fwidth(f5);
  float l1 = 1.0 - smoothstep(0.5, 1.3, abs(fract(f1 + 0.5) - 0.5) / max(w1, 1e-5));
  float l5 = 1.0 - smoothstep(0.45, 1.15, abs(fract(f5 + 0.5) - 0.5) / max(w5, 1e-5));
  l1 *= 1.0 - smoothstep(0.06, 0.16, w1);
  l5 *= 1.0 - smoothstep(0.08, 0.2, w5);
  print = mix(print, uContourMinor, 0.45 * l1 * uContourK * (1.0 - l5));
  print = mix(print, uContourInk, mix(0.4, 0.85, uContourK) * l5);

  // water: blue, shallow by the shore and deeper with each step down; the light then falls on its sunk steps
  vec2 luv = (vW + uHalf) / (2.0 * uHalf);
  float lake = smoothstep(0.15, 0.6, bicubic4(uLakes, luv, uLakeTexel).r);
  float depth = waterSteps(texture2D(uLakeD, uv).r) / max(1.0, uBands * uStep);
  print = mix(print, mix(uShallow, uDeep, sqrt(depth)), lake);

  // rivers and roads printed on the ground at every zoom
  {
    vec4 roads = texture2D(uLines, luv);
    float river = lineMask(texture2D(uRivers, luv).rg, max(0.05, 0.9 * px), px);
    float road = lineMask(roads.rg, max(0.035, 0.85 * px), px);
    float road2 = lineMask(roads.ba, max(0.025, 0.6 * px), px);
    print = mix(print, uRiver, 0.85 * river);
    print = mix(print, uRoad2, 0.8 * road2);
    print = mix(print, uRoad, 0.95 * road);
  }

  // the light, per pixel, from the shape the surface is raised by: the warm sun on the slope, in its baked shadow,
  // with cloud shadows drifting from the west; and the cool sky, in the baked share of it each point sees
  vec2 slope = slopeAt(vW, px, dk);
  vec3 n = normalize(vec3(-slope.x, 1000.0, -slope.y));
  vec4 baked = bicubic4(uLight, uv, uLightTexel);
  // up close, the shadow and the sky baked at 100 m
  if (dk > 0.0) baked.rg = mix(baked.rg, bicubic4(uDetailL, detailUv(vW), uDetailTexel).rg, dk);
  float cloud = texture2D(uClouds, vW / 310.0 + uTime * vec2(0.0005, 0.00015)).r *
                texture2D(uClouds, vW / 170.0 + vec2(0.37, 0.61) + uTime * vec2(0.0007, 0.0002)).r;
  float sunlit = baked.r * (1.0 - uCloudK * smoothstep(0.3, 0.55, cloud));
  // the lamp: the light a little stronger on the sun's side of the map, weaker on the far side, and warmer there
  float side = dot(vW / uHalf, normalize(uSun.xz)) * 0.5;
  float lamp = 1.0 + uLamp * side;
  float key = max(0.0, dot(n, uSun)) / uSun.y;
  float sky = baked.g * (0.55 + 0.45 * n.y);
  vec3 keyColour = uKey * mix(vec3(1.0), vec3(1.06, 0.96, 0.84), clamp(side * 2.0, -1.0, 1.0) * uLamp);
  // flat open ground in the sun comes out at about the paper's own tone
  vec3 light = keyColour * key * sunlit * lamp * (1.0 - uSkyK) + uSky * sky * uSkyK;
  vec3 col = print * light;
  // a soft shoulder: the brightest faces glow toward white instead of clipping
  col = col / (1.0 + 0.18 * max(col - 1.0, 0.0));
  col = min(col, vec3(1.0));

  // haze toward the top of the view, as the camera tilts up close
  gl_FragColor = vec4(mix(col, uPaper * 0.97, haze), 1.0);
}
