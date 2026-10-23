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

In `prototypes/staff-map.html`, behind `?style=lit&relief=layers` (without it the page is unchanged), on the made-up
or the real terrain (`?dem=`, #140):
1. **Sheets** every 5 m, cut from a smoothed height (a Gaussian of about 25 m, baked once on the CPU, so small wiggles
   do not become islands), each a little lighter going up, in the paper's hue.
2. **A lit edge** (hair-thin, paper highlight) where a sheet's edge faces the light; **a short warm shadow** cast onto
   the sheet below where it faces away, clamped under half a band, never black.
3. **Octaves:** 5 m sheets where their edges are far enough apart on screen, 25 m sheets where they would crowd.
4. **A faint continuous hillshade** from the smoothed slope underneath, so gentle ground keeps its form.
5. **Index contours** (25 m) stay as thin ink; the 5 m ink lines go (the sheet edges replace them).
6. The whole effect fades toward ground zoom, with the paper's wash.

Out of scope: a baked cast-shadow hillshade, hypsometric colours beyond the band tint, plan-oblique tilt, the map
sheet's own drop shadow, water as cut-outs (the research's further suggestions).

## Approach

- The smoothed height and its gradient go to the GPU as per-vertex data on the existing terrain mesh (10 m grid), so
  the shader reads no texture for them.
- One light: the world's north-west, as the rest of the lit style.
- Readability: the relief only touches the ground's colour (blocks, arrows and labels are drawn on top), within about
  ±25 % in value, in the paper's hue.

## Acceptance

- `?style=lit&relief=layers` on the made-up and the real terrain: screenshots at map, mid and close zoom against
  `?style=lit` (contours), shown to the owner.
- No aliasing at far zoom (the octaves); no confetti islands (the smoothed height).
- Without `relief=layers`, the page draws as before.
- Frame time measured against the contours (Windows Chrome, the owner's GPU).

## Review rounds

## Results

- Built as planned; the first pass was too faint next to the references, so the step shadow went to 24 % (from 16 %)
  and 22 m (from 15 m), and the 25 m sheets' shadow to 1.8× so the map zoom shows them.
- Measured (Windows Chrome over CDP, D3D11, RTX 3080): 8.3 ms a frame at map, mid and close zoom, with or without the
  layers, on the made-up and the real terrain (#140).
- Up close the sheets read as a layered paper model (soft shadow strips under each 5 m edge, thin lit edges); at mid
  zoom the Pratzen's east flank reads as a stair of sheets; at map zoom mostly the soft underlying hillshade and the
  25 m sheets.
