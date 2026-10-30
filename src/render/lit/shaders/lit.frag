#extension GL_OES_standard_derivatives : enable
precision highp float;
// The lit map view (docs/plans/active/m6-lit-view.md, decision 0058; its light G2, decision 0090, after Track K's
// campaign map): the print (the paper and its worn border, the water by its depth in steps,
// contours every 5 m and 25 m, the yards, the ink of the ways, banks and barriers from their shapes, M6b) multiplied by
// the light (a warm sun on the slope, per pixel, in its baked soft shadow; a cool sky in its baked share), the paper's
// grain; or the flat draft's colours (a debug setting). Every texture but the paper's runs south row first: v grows with z (north).
varying vec3 vW;
uniform sampler2D uHeight;   // the node heights, m above the datum: one float a node, read by texelFetch
uniform sampler2D uLight;    // R the sun's soft shadow (1 lit), G the open sky (1 all of it), on every uLightStep-th node
uniform sampler2D uMask;     // R the water's depth (0..1), B the water, A the yards, on the cells (G unused)
uniform sampler2D uInk;      // the ink's distance fields on the cells: R ways (their shapes), G water, B barriers, A woods
                             // (their cells), signed m
uniform sampler2D uPaperT, uFlatT;
uniform sampler2D uOverlay;  // a debug overlay (src/render/lit/overlays.ts): RGBA a cell, alpha where it shows
uniform float uOverlayOn;
uniform vec2 uX0Z0, uSize, uNodes, uCells, uLightNodes;
uniform float uCell, uDatum, uFlat, uInkRange, uLightStep, uZ, uSkyK, uLamp, uFloor;
uniform vec3 uSun;           // toward the sun (x east, y up, z north), a unit vector
uniform vec3 uPaper, uKey, uSkyC, uShallow, uDeep, uContourMinor, uContourIndex, uLine, uBarrier;

// a hairline where a distance field crosses 0: about a pixel wide at any zoom
float hair(float sd) {
  float px = sd / max(fwidth(sd), 1e-5);
  return 1.0 - smoothstep(0.5, 1.3, abs(px));
}

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
  /* the ink's distance fields (bakeInk), signed metres to the nearest edge; the water and the woods are filled from
     their cells' fields, smoothed: every cell reads as its own kind at its centre, an edge within half a cell of the
     cells' sides (decision 0065) */
  vec4 I = (texture2D(uInk, cuv) * 255.0 - 128.0) / 127.0 * uInkRange;
  float waterA = clamp(0.5 - I.g / max(fwidth(I.g), 1e-5), 0.0, 1.0) * inside;

  /* the paper */
  float g1 = texture2D(uPaperT, vW.xz / 95.0).r, g2 = texture2D(uPaperT, vW.xz / 900.0 + 0.37).r;
  float g3 = texture2D(uPaperT, vW.xz / 4200.0 + 0.71).r;
  float fine = texture2D(uPaperT, mat2(0.8, -0.6, 0.6, 0.8) * vW.xz / 21.3 + 0.13).r;   /* rotated: never lines up */
  vec3 paper = uPaper * (0.93 + (g1 - 0.5) * 0.22 + (g2 - 0.5) * 0.12 + (g3 - 0.5) * 0.07);
  paper *= mix(vec3(1.0), vec3(0.90, 0.845, 0.75),
               smoothstep(0.0, 0.006, edge) * (1.0 - smoothstep(0.006, 0.02, edge)) * inside);   /* a thin worn border */
  vec3 mapC = paper;
  /* no woods drawn for now (the owner, 2026-10-30: they come back after the campaign map's, G2); their field stays in
     the ink (A) */
  /* the water by its depth (0..1 over the mask's full depth), a pale shallow blue to a deep blue in six steps, each
     step's edge a pixel wide (Track K's stepped basins, flat here) */
  {
    float s6 = M.r * 6.0;
    float st = floor(s6) + smoothstep(1.0 - max(fwidth(s6), 1e-4), 1.0, fract(s6));
    mapC = mix(mapC, mix(uShallow, uDeep, sqrt(clamp(st / 6.0, 0.0, 1.0))), waterA);
  }

  /* contours: minor every 5 m, index every 25 m, about a pixel wide at any zoom, each set fading where it crowds */
  {
    float h = heightAt(vW.xz);
    float hc = h / 5.0, fwc = max(fwidth(hc), 1e-4), dc = abs(fract(hc - 0.5) - 0.5) / fwc;
    float hx = h / 25.0, fwx = max(fwidth(hx), 1e-4), dx = abs(fract(hx - 0.5) - 0.5) / fwx;
    /* flat ground lying exactly at a contour's height is no line: the line needs the ground to slope on screen */
    float grade = fwidth(h) / max(fwidth(vW.x) + fwidth(vW.z), 1e-6);   /* the ground's slope, m a m, at any zoom */
    /* contours fade below half a percent, where they lie a kilometre apart: there, near a flat floor, the line would
       widen into a band where the ground only begins to rise */
    float sloped = smoothstep(0.001, 0.005, grade);
    float minorC = (1.0 - smoothstep(0.5, 1.3, dc)) * (1.0 - smoothstep(0.22, 0.5, fwc)) * sloped;
    float indexC = (1.0 - smoothstep(0.9, 1.9, dx)) * (1.0 - smoothstep(0.3, 0.7, fwx)) * sloped;
    mapC = mix(mapC, uContourMinor, minorC * 0.45 * (1.0 - indexC) * inside * (1.0 - waterA));
    mapC = mix(mapC, uContourIndex, indexC * 0.85 * inside * (1.0 - waterA));
  }

  /* a village's or a farm's yard: the paper lighter, trodden */
  mapC = mix(mapC, mix(mapC, vec3(0.97, 0.96, 0.94), 0.55), M.a * 0.25);

  /* the ink (bakeInk): signed metres to the nearest edge, a hairline where it is 0; the ways' from their shapes, the
     water's and the barriers' from their cells */
  {
    /* zoomed out, a road's or a stream's two edges fall within a few pixels and would read as one heavy line: they
       fade from a metre a pixel to three */
    float mpp = 0.5 * (fwidth(vW.x) + fwidth(vW.z));   /* about the metres a pixel spans */
    float far = 1.0 - 0.55 * smoothstep(1.0, 3.0, mpp);
    /* a road's ground a little lighter, its two edges in ink */
    float onRoad = clamp(0.5 - I.r / max(fwidth(I.r), 1e-5), 0.0, 1.0);   /* anti-aliased, as the water and the woods */
    mapC = mix(mapC, min(mapC * 1.06 + 0.02, vec3(1.0)), onRoad * 0.6 * inside);
    mapC = mix(mapC, uLine, hair(I.r) * 0.85 * far * inside);
    /* the water's banks, and a lining 4.5 m and 7.5 m inside a pond's or a river's shore (a stream up to 9 m wide has
       none: its centreline lies nearer its banks than the first lining) */
    mapC = mix(mapC, uLine, hair(I.g) * 0.7 * far * inside);
    /* not where the field folds over (the water's middle line, where the distance stops growing) */
    float rising = smoothstep(0.3, 0.6, length(vec2(dFdx(I.g), dFdy(I.g))) / max(mpp, 1e-6));   /* any direction */
    mapC = mix(mapC, uLine, (hair(I.g + 4.5) * 0.28 + hair(I.g + 7.5) * 0.16) * step(I.g, -2.0) * rising * inside);
    /* hedges and walls: solid, dark */
    float onBarrier = clamp(0.5 - I.b / max(fwidth(I.b), 1e-5), 0.0, 1.0);   /* solid to its edge, a diagonal's too */
    mapC = mix(mapC, uBarrier, max(onBarrier * 0.75, hair(I.b) * 0.6) * inside);
  }

  /* the light, falling on the print: the warm sun on the slope (per pixel, from the node heights raised uZ times, as
     the bake's), in its baked soft shadow, a little stronger on the sun's side of the map (a lamp beside the table);
     the cool sky in its baked share, less on a steep face; the water lies flat, and so does the ground past the map's
     edge (its heights there are the edge's, held). Divided by what flat open ground gets, so that comes out in the
     paper's own tone: the faces toward the sun warmer, the shade cooler */
  {
    /* the differences one-sided within a cell of the map's edge (the heights past it are held, which would halve
       the slope there) */
    vec2 lo = uX0Z0, hi = uX0Z0 + (uNodes - 1.0) * uCell;
    vec2 p0 = clamp(vW.xz - uCell, lo, hi), p1 = clamp(vW.xz + uCell, lo, hi);
    float gx = (heightAt(vec2(p1.x, vW.z)) - heightAt(vec2(p0.x, vW.z))) / max(p1.x - p0.x, 1e-3) * uZ;
    float gz = (heightAt(vec2(vW.x, p1.y)) - heightAt(vec2(vW.x, p0.y))) / max(p1.y - p0.y, 1e-3) * uZ;
    vec3 n = normalize(mix(vec3(-gx, 1.0, -gz), vec3(0.0, 1.0, 0.0), max(waterA, 1.0 - inside)));
    vec2 ln = (vW.xz - uX0Z0) / (uCell * uLightStep);   /* light node i at the centre of texel i */
    vec2 B = mix(vec2(1.0), texture2D(uLight, (ln + 0.5) / uLightNodes).rg, inside);
    float key = max(0.0, dot(n, uSun)) / uSun.y;
    float sky = B.g * (0.55 + 0.45 * n.y);
    vec2 toSun = normalize(uSun.xz + vec2(1e-6, 0.0));
    float side = clamp(dot((vW.xz - uX0Z0) / uSize * 2.0 - 1.0, toSun) * 0.5, -0.5, 0.5);
    vec3 keyC = uKey * mix(vec3(1.0), vec3(1.06, 0.96, 0.84), side * 2.0 * uLamp);
    vec3 light = keyC * key * B.r * (1.0 + uLamp * side) * (1.0 - uSkyK) + uSkyC * sky * uSkyK;
    light /= uKey * (1.0 - uSkyK) + uSkyC * uSkyK;
    vec3 lit = mapC * max(light, vec3(uFloor));
    /* a soft shoulder: the brightest faces glow toward white instead of clipping */
    mapC = min(lit / (1.0 + 0.18 * max(lit - 1.0, 0.0)), vec3(1.0));
  }

  vec3 col = mapC * (0.93 + (g1 - 0.5) * 0.16 + (fine - 0.5) * 0.12);   /* the paper's grain */
  /* the flat draft's colours (a debug setting); its raster runs north row first */
  col = mix(col, texture2D(uFlatT, vec2(cuv.x, 1.0 - cuv.y)).rgb, uFlat * inside);
  /* a debug overlay over either */
  vec4 O = texture2D(uOverlay, cuv);
  col = mix(col, O.rgb, O.a * uOverlayOn * inside);
  gl_FragColor = vec4(col, 1.0);
}
