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

## Approach

- **Data.** The tool already fetches the crop at its native 5 m before averaging it onto the 10 m grid. It
  writes a second array at the finer step in the same generated `.js` (git-ignored, never committed, with the
  ČÚZK credit). Without `?dem=`, the made-up height function is sampled at the same step.
- **Bake.** Plain JavaScript at load, over the fine grid:
  - **shadows:** march a few rays toward the light and keep the highest horizon angle met; the light is lit
    to the extent the sun stands above that horizon;
  - **occlusion:** the mean horizon angle in eight directions over a short radius.

  Results go into one texture (shadow in R, occlusion in G), sampled by the terrain shader in world
  coordinates. Cost is to be measured with paired `window.__buildMs` runs; if it is over about half a second,
  move it to a worker or to the GPU.
- **Shader.** In the lit style, before the water and the ink:
  - a hillshade term from the fine heights, so slopes read even without shadows;
  - shadow and occlusion from the texture;
  - mapped to the warm tints;
  - kept above the darkness bound;
  - faded by the paper's wash.

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
