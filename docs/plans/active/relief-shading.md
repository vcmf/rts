---
status: active
last_reviewed: 2026-10-23
---

# Plan: shaded relief from real heights in the staff map prototype

## Problem

The owner wants the map to look like the shaded-relief prints made from real elevation data, such as a
rendered survey map with soft cast shadows and warm lit slopes. The goal is "a cool map first". Only the
**heights** come from real data; the 1805 roads, villages, woods and streams will come later, traced from a
period map (a separate plan).

The prototype already loads real 5 m terrain for Austerlitz (`?dem=`, #140). Its relief is drawn as contour
lines or paper layers (#141), both of which read the height locally. Neither has cast shadows or occlusion, the
two effects that carry the depth in those prints.

## Scope

In `prototypes/staff-map.html`, behind `?style=lit&relief=shaded`, on the real terrain (`?dem=`) or the
made-up one:

1. **Fine heights.** `tools/dem-fetch.mjs` also writes a second, finer height grid (about 4 m in the page's
   metres, from the 5 m source). The terrain mesh keeps its 10 m grid; only the shading uses the fine one.
2. **A baked relief texture**, computed once at load from the fine heights and stored in a texture:
   - **cast shadows** from the map's one north-west light, low in the sky, softened by a few rays spread
     around it;
   - **ambient occlusion** (valleys and slope feet darker), from the horizon in several directions over a
     short radius;
   - a **shading exaggeration** of its own (vertical scale for the light only, not the mesh), as such prints
     use.
3. **The look on the paper.** The relief multiplies the paper, in the paper's hues:
   - lit slopes get a warm ochre tint;
   - shadows a warm grey-brown, never black;
   - the darkest value about 0.6 of the paper's (the readability bound of #141).

   Contours stay, as thin light ink. The relief fades toward ground zoom, like the other map marks.
4. **One light.** `NW`, as for the blocks, the houses, the paper layers and the water.

Out of scope:
- the 1805 features from a period map, with the source's licence (the next plan);
- the painted world (close zoom);
- other battlefields;
- the "relief from a raster" kind in the map language (an owner decision, decision 0050);
- a GPU bake, unless the CPU bake is too slow.

## Approach (as built)

- **Data.** The tool already fetches the crop at its native 5 m. It writes a second grid at 4 m into the same
  generated `.js` (git-ignored, never committed, with the ČÚZK credit): each node is the mean of its area, from four
  bilinear samples. Without that grid, the shading samples the mesh's own height grid at the same step.
- **Bake.** Plain JavaScript at load, over the fine grid:
  - **cast shadow** in one pass: walking from the light's side, each point carries the highest shadow line that
    reaches it; soft over a few metres of depth below the line;
  - **exposure:** how far a point stands above or below its surroundings, near (about 24 m) and wide (about 80 m),
    from summed-area means of the true heights;
  - **slope light:** Lambert from the exaggerated slope.

  The bake writes R slope light (over `LAMBERT_RANGE`), G cast shadow, B exposure, read at texel centres.
- **Shader.** Before the water and the ink, the three are combined into one tone, clamped between `SHADE_FLOOR` and
  `SHADE_TOP`, and given a warm hue: grey-brown in the shade, ochre on the lit slopes. It is lighter under woods and
  faded by the paper's wash. The contours are drawn as in the plain lit style.

## Acceptance

- **Screenshots** on the owner's GPU, at map, mid and close zoom, on the real Austerlitz terrain (true slopes
  and `&demz=1`). Shown next to the contours and the paper layers.
- **Readability.** The armies stay the most saturated things on screen, and no formation is hidden. The
  darkest relief stays at about 0.6 of the paper's value or lighter.
- **Cost, measured.** Bake time from paired `window.__buildMs` runs against `relief=layers`. Frame time with
  vsync and the frame cap off.
- **No regressions.** Without `relief=shaded`, the page draws as before. The ink style is unchanged.

## Open questions

- The light's height and the shading exaggeration: tuned by eye with the owner.
- Fine-grid size against the generated file's size: about 1.3 million heights at 4 m. To be measured; if too
  big, store it as a binary file next to the `.js`.

## Results

- Built as planned. The fine grid is 1351 × 951 at 4 m, sampled bilinearly from the 5 m source. The generated file is
  8.9 MB, git-ignored.
- **Cast shadows in one pass.** Walking from the light's side, each point carries the highest shadow line that
  reaches it. That is exact for hard shadows and costs O(n), so no rays are marched. The shadow's soft edge is a fixed
  few metres. **Exposure** comes from two box means: about 24 m, and about 80 m, from summed-area tables.
- **Measured** (Windows Chrome over CDP, D3D11, RTX 3080, real terrain, true slopes):
  - **Bake:** `window.__reliefMs` 149 to 161 ms.
  - **Load:** `window.__buildMs` 1287 and 1326 ms, against 1141 and 1231 ms for `relief=layers` (two runs each).
  - **Frame at map zoom:** vsync and the frame cap off, 7.8 and 8.0 ms against 6.9 and 7.2 ms.
- **Look.**
  - At true slopes, with the defaults (sun 30°, light exaggeration ×2), the Pratzen plateau, its flanks and the
    valleys read as in the references, in the paper's hues.
  - With `&demz=1`, the mesh's ×2.5 stacked on the light's ×2 gives long, heavy shadows and too much yellow. The
    lit tint was toned down after the first screenshots.
  - `?sun=` and `?rz=` set the light's height and the exaggeration, for tuning by eye.
- **Seen:** long straight shadow bars at close zoom, likely modern embankments in today's terrain. They belong to the
  1805 cleanup in the next plan.

## Review rounds

- **Round 1** (`/code-review high`): severe. Two problems:
  - a `?dem=` file without the fine grid was shaded from the made-up height function under the real mesh;
  - the made-up terrain evaluated that function on the 4 m grid, about 3.8 s in Node.

  Fixed: without a fine grid that spans the page, the shading samples the mesh's own height grid, about 150 ms.
  With:
  - the texture read at texel centres; it had drifted up to about 2 m off the contours toward the edges;
  - the slope light stored over 0.6 to 1.4 instead of 0 to 2, so gentle slopes no longer step;
  - the 0.62 bound applied after the hue, and the relief lighter under woods;
  - exposure from the true heights, so `?rz=` changes the light only;
  - the texture made straight from the bytes, with no canvas round trip;
  - an assert that the shadow walk's diagonal is the north-west light;
  - `sstep` reused;
  - no apostrophe in the shader comments.
- **An experiment, `?tilt=`** (the owner: a more angled view): tilts the map view off straight down, by 0° to 45°. The
  staff-map design (§9) has the map straight down and tilting only as you zoom in. Decision 0002 allows any RTS angle
  that stays short of the horizon. Whether the map view tilts is the owner's decision, open.
- **Round 2**: moderate and light only, so the review stops. Fixed:
  - the fine grid is a mean of each node's area; it had point-sampled every other source pixel, aliasing ditches and
    banks into broken bars;
  - the tone's floor is applied before the warm hue, chosen so the hue never takes it below 0.62 of the paper; the
    darkest shadows had flattened to one neutral grey;
  - the walk's direction is a thrown error if `NW` changes, not a logged assert;
  - the fine heights are freed after the bake;
  - the texture is filtered anisotropically, like the other map textures;
  - the floor and top are constants;
  - this plan's approach is described as built.

  Left:
  - the shadow's soft edge is measured in depth, so it is wider on slopes that face the sun;
  - two summed-area tables, where one would do;
  - the paper grain and the season wash can still take a deep hollow a little below 0.62. The paper layers have the
    same issue.
