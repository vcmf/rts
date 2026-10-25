#extension GL_OES_standard_derivatives : enable
precision highp float;
// The lit map view (docs/plans/active/m6-lit-view.md, decision 0058), ported from the prototype's lit and shaded paths
// (prototypes/staff-map.html TER_FS): the paper and its worn border, the woods darkening it, the shaded relief in the
// paper's hues, the water as a wash sunk below its banks, contours every 5 m and 25 m, the paper's grain; or the flat
// draft's colours (a debug setting). Every texture but the paper's runs south row first: v grows with z (north).
varying vec3 vW;
uniform sampler2D uHeight;   // the node heights, m above the datum: one float a node, read by texelFetch
uniform sampler2D uRelief;   // R the slope's light, G the cast shadow (1 lit), B the exposure (0.5 even), on the nodes
uniform sampler2D uMask;     // R the water's depth (0..1), G the woods, B the water, on the cells
uniform sampler2D uPaperT, uFlatT;
uniform vec2 uX0Z0, uSize, uNodes, uCells, uLightXZ, uLambert;
uniform float uCell, uDatum, uFlat, uShadeFloor, uShadeTop;
uniform vec3 uPaper, uWaterW;

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

void main() {
  vec2 uv = (vW.xz - uX0Z0) / uSize;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  vec2 cuv = clamp(uv, 0.0, 1.0);
  vec4 M = texture2D(uMask, cuv) * inside;

  /* the paper */
  float g1 = texture2D(uPaperT, vW.xz / 95.0).r, g2 = texture2D(uPaperT, vW.xz / 900.0 + 0.37).r;
  float g3 = texture2D(uPaperT, vW.xz / 4200.0 + 0.71).r;
  float fine = texture2D(uPaperT, mat2(0.8, -0.6, 0.6, 0.8) * vW.xz / 21.3 + 0.13).r;   /* rotated: never lines up */
  vec3 paper = uPaper * (0.93 + (g1 - 0.5) * 0.22 + (g2 - 0.5) * 0.12 + (g3 - 0.5) * 0.07);
  paper *= mix(vec3(1.0), vec3(0.90, 0.845, 0.75),
               smoothstep(0.0, 0.006, edge) * (1.0 - smoothstep(0.006, 0.02, edge)) * inside);   /* a thin worn border */
  vec3 mapC = paper;
  /* woods: a dark warm grey, the paper itself darkened */
  mapC = mix(mapC, paper * vec3(0.6, 0.57, 0.52), smoothstep(0.08, 0.2, M.g) * 0.85 * inside);
  vec3 flatPaper = mapC;   /* the paper before the relief: water lies flat */

  /* the shaded relief, in the paper's hues: warm grey-brown in the shade, a touch of ochre on the lit slopes */
  {
    vec2 node = (vW.xz - uX0Z0) / uCell;   /* node i at the centre of texel i */
    vec3 R = texture2D(uRelief, (node + 0.5) / uNodes).rgb;
    float slopeLight = mix(uLambert.x, uLambert.y, R.r);
    float exposed = R.b * 2.0 - 1.0;
    float v = clamp(slopeLight * mix(0.72, 1.0, R.g) * (1.0 + 0.3 * exposed), uShadeFloor, uShadeTop);
    vec3 hue = v < 1.0 ? mix(vec3(0.93, 0.90, 0.86), vec3(1.0), (v - uShadeFloor) / (1.0 - uShadeFloor))
                       : mix(vec3(1.0), vec3(1.0, 0.98, 0.90), (v - 1.0) / (uShadeTop - 1.0));
    mapC = mix(mapC, min(mapC * v * hue, vec3(1.0)), inside);
  }

  /* water as a wash on the paper, sunk below the land: the bank toward the light shades the water under it, the far
     bank catches the light */
  {
    float D = M.r, water = M.b;
    if (D > 0.004) {
      vec2 du = vec2(4.0 / uCells.x, 0.0), dv = vec2(0.0, 4.0 / uCells.y);   /* 4 cells: the 8-bit depth does not band */
      vec2 gW = vec2(texture2D(uMask, cuv + du).r - texture2D(uMask, cuv - du).r,
                     texture2D(uMask, cuv + dv).r - texture2D(uMask, cuv - dv).r);   /* from the bank into the water */
      vec2 n = gW / max(length(gW), 1e-4);
      float slope = smoothstep(0.006, 0.04, length(gW)) * smoothstep(0.0, 0.006, edge);
      float mid = smoothstep(0.55, 0.9, D);
      vec3 wash = mix(flatPaper, uWaterW * 0.96, mix(0.62, 0.34, mid));
      float shade = clamp(dot(n, -uLightXZ), 0.0, 1.0) * slope * (1.0 - mid);
      wash *= 1.0 - 0.38 * shade * vec3(1.0, 0.97, 0.92);
      float lit = clamp(dot(n, uLightXZ), 0.0, 1.0) * slope * smoothstep(0.18, 0.4, D) * (1.0 - water);
      mapC = mix(mapC, min(mapC * 1.1 + 0.02, vec3(1.0)), 0.6 * lit);
      mapC = mix(mapC, wash, water);
    } else {
      mapC = mix(mapC, uWaterW, water);
    }
  }

  /* contours: minor every 5 m, index every 25 m, about a pixel wide at any zoom, each set fading where it crowds */
  {
    float h = heightAt(vW.xz);
    float hc = h / 5.0, fwc = max(fwidth(hc), 1e-4), dc = abs(fract(hc - 0.5) - 0.5) / fwc;
    float hx = h / 25.0, fwx = max(fwidth(hx), 1e-4), dx = abs(fract(hx - 0.5) - 0.5) / fwx;
    float minorC = (1.0 - smoothstep(0.5, 1.3, dc)) * (1.0 - smoothstep(0.22, 0.5, fwc));
    float indexC = (1.0 - smoothstep(0.9, 1.9, dx)) * (1.0 - smoothstep(0.3, 0.7, fwx));
    mapC = mix(mapC, vec3(0.42, 0.30, 0.16), max(minorC * 0.25, indexC * 0.45) * inside * (1.0 - M.b));
  }

  vec3 col = mapC * (0.93 + (g1 - 0.5) * 0.16 + (fine - 0.5) * 0.12);   /* the paper's grain */
  /* the flat draft's colours (a debug setting); its raster runs north row first */
  col = mix(col, texture2D(uFlatT, vec2(cuv.x, 1.0 - cuv.y)).rgb, uFlat * inside);
  gl_FragColor = vec4(col, 1.0);
}
