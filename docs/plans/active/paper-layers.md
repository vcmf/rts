---
status: active
last_reviewed: 2026-10-23
---

# Plan: paper layers, the relief as stacked sheets in the staff map prototype

## Problem

The owner wants the paper map to read 3D and liked the idea of raising each contour level, after references of
rendered relief and a physical layered contour model. Research (kept outside the repository, under `scratch/`)
recommended "paper layers": the relief as a stack of thin paper sheets, one per contour interval, lit from the
north-west, computed per pixel in the terrain shader. No library offers this as a shader; MapLibre and Cesium
(permissive licences) have the related hillshade and band maths.

## Scope

In `prototypes/staff-map.html`, behind `?style=lit&relief=layers` (without it the page is unchanged, but for the lighter contour ink the owner asked
for in both: see Results), on the made-up
or the real terrain (`?dem=`, #140):
1. **Sheets** every 5 m, cut from a smoothed height (a Gaussian of about 25 m, baked once on the CPU, so small wiggles
   do not become islands), each a little lighter going up, in the paper's hue.
2. **A lit edge** (hair-thin, paper highlight) where a sheet's edge faces the light; **a short warm shadow** cast onto
   the sheet below where it faces away, clamped under half a band, never black.
3. **Octaves:** 5 m sheets where their edges are far enough apart on screen, 25 m sheets where they would crowd.
4. **A faint continuous hillshade** from the smoothed slope underneath, so gentle ground keeps its form.
5. **Contours drawn on the sheets** (the owner's choice after the first screenshots: raised sheets and contour lines
   together), in a lighter ink than the contour-only style so the map does not feel heavy.
6. The whole effect fades toward ground zoom, with the paper's wash.

Out of scope: a baked cast-shadow hillshade, hypsometric colours beyond the band tint, plan-oblique tilt, the map
sheet's own drop shadow, water as cut-outs (the research's further suggestions).

## Approach

- The smoothed height and its gradient go to the GPU as per-vertex data on the existing terrain mesh (10 m grid), so
  the shader reads no texture for them.
- One light: the world's north-west, as the rest of the lit style.
- Readability: the relief only touches the ground's colour (blocks, arrows and labels are drawn on top), in the
  paper's hue, the darkest strip (shadow, hillshade and tint together) about 0.63 of the paper's value, warm, never
  black; the blocks keep their outlines and shadows over it.

## Acceptance

- `?style=lit&relief=layers` on the made-up and the real terrain: screenshots at map, mid and close zoom against
  `?style=lit` (contours), shown to the owner.
- No aliasing at far zoom (the octaves); no confetti islands (the smoothed height).
- Without `relief=layers`, the page draws as before (within a sub-pixel: see round 2), with the lighter contour ink.
- Frame time measured against the contours (Windows Chrome, the owner's GPU).


## Results

- Built as planned; the first pass was too faint next to the references, so the step shadow went to 24 % (from 16 %)
  and 22 m (from 15 m), and the 25 m sheets' shadow to 1.8× so the map zoom shows them.
- Measured (Windows Chrome over CDP, D3D11, RTX 3080, vsync and the frame cap off, real terrain, two runs each;
  the frame includes the canvas ink on the CPU, so it is noisy): map zoom contours 6.7–7.7 ms, layers 6.3–8.4 ms (no
  difference beyond the noise); mid 4.2–4.8 against 5.3–5.8 ms (about +1 ms); close 2.4–2.5 against 2.4–3.7 ms. Build
  (`window.__buildMs`, three paired runs): 1.05–1.09 s against 1.03–1.03 s (the smoothing bake costs nothing
  measurable). A first figure of 8.3 ms "with or without" was the 120 Hz refresh, not the cost.
- Up close the sheets read as a layered paper model (soft shadow strips under each 5 m edge, thin lit edges); at mid
  zoom the Pratzen's east flank reads as a stair of sheets; at map zoom mostly the soft underlying hillshade and the
  25 m sheets.

- **Sheets and contours together** (the owner, after seeing the layers alone): the 5 m ink stays with the sheets, at
  70 % while the sheet edges show, full where they fade; the lit style's contour ink lighter overall (5 m 0.4 → 0.25,
  25 m 0.7 → 0.45 of the ink colour; the 25 m ink at 0.85 of that over the sheets). The plain lit style gets the
  lighter ink too (recorded in `docs/plans/active/map-view-lit-v1.md`). The darkest strip's bound (0.63) is for the
  shadow strips; the hair-thin ink on a shadowed edge reaches about 0.55 of the paper over a pixel's width.

## Review rounds

- **Round 1** (`/code-review high`): severe: at map zoom the 25 m shadow, the hillshade and the band tint stacked to
  about 51 % darker than the paper, a strip to compete with the army blocks. Fixed: the shadow capped at 30 %, the
  hillshade within ±7 % and 1 on flat ground (it divided by the wrong constant, darkening all flat ground 8 %), the
  tint ±3 %: the darkest strip about 0.63 of the paper. With: the 25 m ink on the smoothed height, on the sheet edges
  (it doubled them); the 5 m ink fading in as the sheets fade out toward ground zoom (a band had no 5 m relief); the
  frame measured without vsync (the first figure was the refresh cap) and the build in pairs; the 5 m edges' screen
  spacing computed once for the crossfade, the clamp and both octaves; one static light, `NW`, passed to the shader
  as `uLightXZ` and used by the canopy and house bakes.
- **Round 2**: moderate and light only, so the review stops. Fixed: the sheets measured in world metres from the smooth
  per-vertex slope (screen derivatives of the interpolated height stepped at the mesh's triangles, and metres per pixel
  from screen x alone made shadows depend on the camera's heading); the shadow fading under a pixel, not cut; the 5 m
  ink on the smoothed height too (it disagreed with the 25 m ink); `setLight` from `NW`; no apostrophes in shader
  comments; the skirt given the layers' vertex data. The plain lit page shifts by a sub-pixel from the shared light
  constant (tree shadows 0.55 r either way; houses' away vector 0.7071 against 0.707): acceptable, stated here.
- **Round 3** (the sheets with contours): moderate and light only, so the review stops. Fixed: the ink kept off the
  lit edges (it dimmed the highlight); the 5 m ink lighter only where the 5 m sheets actually show (not where the
  25 m ones have replaced them); the 25 m ink back to full as the sheets fade, as the 5 m ink; the lighter ink in
  the plain lit style written into its plan and this plan's scope; the ink's darkest line stated next to the bound.
