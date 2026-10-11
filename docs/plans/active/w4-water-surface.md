---
status: active
last_reviewed: 2026-10-11
---

# Plan: W4, the painted water surface

Water phase W4 (`docs/plans/active/prototype-plan.md` §4.3), after W3 (`docs/plans/done/w3-water-data.md`) in Track
E's stage 1 (`docs/plans/active/track-e-look.md`). Research: `docs/research/stylized-water.md` §2.7–2.8, §4.1–4.4,
§4.9, §4.11.

## Problem

- **The water paints from the wrong depth.** Its shader reads a depth per ribbon vertex (`aDepth`, about 0.7 m across
  and 1.5 m along, against the drawn heightfield), so the colour bands follow the triangles, not the bed. W3 baked the
  depth, the shore distance and the flow at 0.5 m; nothing reads them yet.
- **The shoreline is the triangles' edge.** Where the water meets the ground, what the eye sees is where the ribbon's
  plane cuts the 1.79 m heightfield. Measured on the committed data (W3's report, extended for this plan):
  - 778 wet texels (2.4%) have the drawn ground above the water, up to 0.49 m above it and 0.57 m in from the shore;
    the data's depth there reaches 0.9 m (cut banks the grid rounds outward, as well as the bars);
  - 1,127 dry texels under the ribbon have the drawn ground below the water, up to 0.69 m out from the shore;
  - no texel over 0.6 m into the water has the drawn ground within 2 cm of the water (no coplanar surfaces to
    flicker there).
  So the visible shore wanders up to 0.7 m from the real one, and each side of it is painted by a different shader:
  a seam.
- **Pools and riffles look alike.** The river carries `riffle` and `v` per sample (`src/look/world/author.ts`); the
  water ignores both, so the alternation the shape builds is invisible.
- **Strokes shear.** They scroll at one speed (`along·k − t`), whatever the current's speed.

## Scope

- **The ribbon:** the same mesh, with the time of travel (`aTau`) and the riffle (`aRiffle`) per vertex, the inner
  columns clamped to 0.85 of the bend's radius (research §2.7: folding); the depth comes from the water data, not the
  vertices.
- **The shared shore band:** one GLSL function both the terrain and the water draw with near the shoreline, so the
  shore is painted from the data, whichever surface the depth test keeps.
- **The water shader, layer by layer** (research §2.8): the bed seen through the water, the painted absorption ramp,
  calm and rough water, the painted sky tint, the tree reflections, strokes on the time of travel, shadows, glitter,
  and hard-edged foam (shore and riffles). The winter ice stays as it is (W5's seasons).
- **The water data on the page from the start:** bound to the terrain's and the water's materials outside the debug
  views (its texture: 13.7 MB, 6 ms, measured in W3).
- **The far ring's painted line** re-matched to the new water at the tile's edge.

**Not in W4:**
- **Ponds** (pond polygons, the dam, research §2.7): there is no pond in the world. The map format
  (`docs/proposals/map-format.md`) is where ponds come from; the first (the 1805 Satschan pond) arrives with W6's
  importer, and its mesh with it.
- **The banks** beyond the shore band (wet band, bare cut banks, gravel bars, reeds): W5. The terrain keeps its
  current bank colours past the band.
- **Rocks, weirs, fords and their foam:** W5.

## Approach

### The shared shore band

- **One function**, `shore(wp, wd)` in a new include (`src/look/shaders/shore.glsl`), from inputs both surfaces have
  at the same world point: the water data (`wd`: depth, shore distance, flow), the bank normal map, the light map,
  clouds, the sun's shadow, the paint grain. No vertex attributes and no mesh normal enter it.
  - **On land** (shore distance < 0): the ground at the water's edge: a damp earth colour, lit through `paint()` with
    the bank normal (the up vector mixed with the map's normal by its weight, as the terrain does, so the two agree
    where the map fades).
  - **In the water** (> 0): the lower water layers (below): the bed through the water, the absorption ramp from the
    data's depth, the shore foam, the shadows. These depend on the depth, so the band holds the cut banks' deep water
    as well as the bars' shallows.
  - At the shore itself both sides give the bed's colour at depth 0 (research §2.8: at depth 0, the water equals the
    bed), so the band is continuous across the shoreline.
- **Its width:** B = 0.75 m on each side (the measured 0.57 m and 0.69 m, plus a margin). The check gates the
  measured widths against B (below), so a world whose grid strays farther fails, rather than showing a seam.
- **The terrain** paints `shore()` where the shore distance is above −B, and blends to its own colour over the next
  0.4 m inland (one shader, so no seam). Under the water, past the band, it paints `shore()` too (it is hidden there,
  except where the drawn ground pokes through).
- **The water** paints `shore()` on dry ground (where the ribbon covers it), and adds its upper layers (sky tint,
  reflections, strokes, glitter, riffle foam) faded in from B to B + 0.5 m into the water: where either surface may
  be the one drawn, only the shared layers show.
- **The detail grain:** the water's material takes the `DETAIL` define, so `paint()` (and its grain) is the same
  function on both surfaces.

### The water's layers (research §2.8, painted values from the art bible's palette)

1. **Bed** (shared): a bed albedo by depth and current (mud in pools, gravel where it runs fast and shallow, the
   damp earth at the edge), read at the point offset along the view by 3/4 of the depth (the painted refraction),
   lit flat.
2. **Absorption** (shared): `T = exp(−k·depth)` per channel (red first); the painted three-band ramp (shallow
   green-ochre, turquoise, deep teal), its band edges broken by the grain; `c = bed·T + ramp·(1 − T)`. The deepest
   colour's value stays above the darkest tree shadow (research §4.2: pools must not read as holes).
3. **Calm and rough:** `rough = max(riffle-driven, speed and shallowness)`.
4. **Sky tint:** the painted constant, by depth, less on rough water (no sky is drawn: decision 0002).
5. **Tree reflections:** the existing canopy mask (`reflAt`), weighted by calm.
6. **Strokes** on the time of travel: `pattern(τ − t)` (research §4.3), so features stretch in fast water and do not
   shear; the time wrapped to a whole number of texture periods. Light marks, more on riffles; a few dark marks in
   pools; none where slow.
7. **Shadows** (shared): trees and clouds cool the water, deep water more.
8. **Glitter:** sun dabs, mostly on riffles.
9. **Foam:** the shore line (shared) from the shore distance, broken by the grain to about half coverage; riffle foam
   (water only) in broken chevrons along the strokes. Hard-edged (thresholded grain), warm in sun, cool in shadow.
10. **Grain, mist, atmosphere,** and the view depth in alpha (the depth-of-field contract); the material stays opaque.

### The page

- The water data's texture is made at load and bound to the terrain's and the water's materials; the debug views
  (W3) stay on top of it. Its cost moves from the first debug view to the load (measured, reported).
- The far ring's line colour: the water's mean colour at the tile's edge (measured on the page), so the line meets
  the ribbon there.

## Checks (`tools/water-look-check.mjs`, new; Node and the page)

- **The band's width** (Node): the measurements above, from the committed data and the ribbon as built: the
  farthest wet texel with the drawn ground above the water, and the farthest dry texel the ribbon shows over, each
  under B; and no texel past B into the water has the drawn ground within 2 cm of the water (z-fighting).
- **No shoreline seam** (page, the closest and the default zoom over the sharpest bend and a straight reach): the
  shore must not depend on which surface is drawn.
  - **Water side:** the frame as is, against the frame with the water mesh hidden. At pixels within 0.5 m of the
    shore (from the raw data view), where the water was drawn (the two frames' surfaces differ), the colour
    difference: 95th percentile under a limit set from the grain's own variation between neighbouring pixels.
  - **Terrain side:** the frame as is, against the frame with the ribbon raised by the measured poke height plus
    2 cm (it then covers the ground that pokes through): the same measure where the terrain was drawn.
  - **Sabotages:** the water with its own colour in the band (`WATER_SAB_OWN`: the upper layers not faded, the
    lower ones from the vertex depth) fails the first; the terrain without the band (`WATER_SAB_TERRAIN`) fails the
    second.
- **Pools dark and calm, riffles light and foamy** (page, the default zoom at three reaches): water pixels near the
  centre line, classed by the river's riffle there (above 0.7, below 0.2): pools' median luma under riffles' by a
  margin; riffles' share of foam-bright pixels at least twice the pools'. Sabotage: the riffle ignored
  (`WATER_SAB_FLAT`) fails.
- **No flicker:** the band check's z-fighting count, and the L2b shimmer check run on the water at the closest zoom
  (a sub-pixel shift of the image moves the shore by its shift, not more).
- **Existing checks hold:** `tools/render-check.js` (the water is what the camera sees; nothing spills on the
  banks; the far line), `tools/river-check.js`, `tools/water-check.mjs`, `tools/detail-check.mjs`.
- **Readability guard:** no block that passes on the base fails (water is less saturated than the coats).
- **Goldens:** the differences are the river and its shore band; shown in the PR.
- **Bench** ("60 fps holds"): the water pass and the frame, base against this branch, on Metal as a proxy; the
  owner's laptop run decides.
- **Owner's eye:** screenshots at three zooms, in sun and cloud shadow, summer and winter.

## Acceptance

From the prototype plan (W4: "No shoreline seam or flicker; pools read dark and calm, riffles light and foamy;
60 fps holds"):
- the band, seam and pool/riffle checks pass, and their sabotages fail;
- every existing check passes; `npm test`, `npm run check:data` and the docs check pass;
- the guard reports no new failing block;
- the bench shows the water pass within the frame budget (Metal proxy; the laptop run is the owner's);
- the screenshots read as painted water (owner's eye).

## Risks

- **The band shows as a halo:** a 0.75 m strip without strokes or glitter along every shore. The research wants
  quieter water at the edge anyway (slack water, research §4.3); judged on the screenshots. If it reads as a halo,
  the next step is a finer drawn shoreline (a bank strip mesh, research §2.5), which narrows the band.
- **Parallax in the band:** the refraction offset reads the bed at a point that depends on the view vector, which
  differs slightly between the water's plane and the drawn ground; the seam check measures it.
- **The terrain's cost:** one more fetch per terrain pixel (the water data) and the band's work near the water;
  measured by the bench.
- **Spiral risk** (prototype plan §4.4): if the review needs more than 3 rounds, stop and revisit the opaque
  bed-painting design.
