---
status: done
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

- **The ribbon:** the same mesh, with the time of travel (`aTau`) and the riffle (`aRiffle`) per vertex; the depth
  comes from the water data, not the vertices. No fold guard (research §2.7's clamp of the inner columns to 0.85 of
  the bend's radius): on this river the tightest radius is 11.5 m and no row of the ribbon runs backwards (measured),
  and the clamp as written leaves the inner bar without water where the radius is under its wet edge; W6's
  imported rivers bring the tight bends, and the guard with them.
- **The shared shore band:** one GLSL function both the terrain and the water draw with near the shoreline, so the
  shore is painted from the data, whichever surface the depth test keeps.
- **The water shader, layer by layer** (research §2.8): the bed seen through the water, the painted absorption ramp,
  calm and rough water, the painted sky tint, the tree reflections, strokes on the time of travel, shadows, glitter,
  and hard-edged foam (shore and riffles). The winter ice stays as it is (W5's seasons).
- **The water data on the page from the start:** bound to the terrain's and the water's materials outside the debug
  views (its texture: 6 ms to make, measured in W3). It and the bank normals lose their mips (10 MB each): the band
  must read the same value at a world point from both surfaces, and a mip level follows each surface's own screen
  derivatives.
- **The far ring's painted line** where it meets the ribbon at the tile's edge (re-matched if the new water shows a
  step there).

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
- **Its width:** B = 0.75 m on each side (`SPEC.water.band`) (the measured 0.57 m and 0.69 m, plus a margin). The check gates the
  measured widths against B (below), so a world whose grid strays farther fails, rather than showing a seam.
- **The terrain** paints `shore()` where the shore distance is within ±B, and blends to its own colour over the next
  0.4 m inland (one shader, so no seam). Past the band in the water it keeps its own colour: the band check shows the
  water always covers it there, so the hidden bed is not painted twice.
- **The water** paints `shore()` on dry ground (where the ribbon covers it), and adds its upper layers (sky tint,
  reflections, strokes, glitter, riffle foam) faded in from B to B + 0.5 m into the water: where either surface may
  be the one drawn, only the shared layers show.
- **The detail grain:** the water's material takes the `DETAIL` define, so `paint()` (and its grain) is the same
  function on both surfaces.

### The water's layers (research §2.8, painted values from the art bible's palette)

1. **Bed** (shared): a bed albedo by depth and current (mud in pools, gravel where it runs fast and shallow, the
   damp earth at the edge), lit with the bank normals. As built, without research §2.8's refraction offset (the bed
   read along the view by 3/4 of the depth): an offset by a bilinear depth makes the point's screen derivatives
   jump at every texel's edge, and the grain's level of detail with them (review round 2).
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
- The far ring's line meets the ribbon at the tile's edge, at least 165 m past the play area (`SPEC.margin`): seen
  only from the wide zooms, under the haze. If the new water shows a step there (the far-edge screenshots, base
  and branch), the line's colour is re-matched.

## Checks (`tools/water-look-check.mjs`, new; Node and the page)

- **The band's width** (Node): the measurements above, from the committed data and the ribbon as built: the
  farthest wet texel with the drawn ground above the water, and the farthest dry texel the ribbon shows over, each
  under B; and no texel past B into the water has the drawn ground within 2 cm of the water (z-fighting).
- **No shoreline seam** (page, the closest and the default zoom over the sharpest bend and a straight reach): the
  two materials paint the same colour in the band. The tile's ground is drawn twice, once with the terrain's
  material and once with the water's (a variant with the ground's attributes): same geometry, so the same pixels,
  world points and derivatives. At the pixels within the band (from the raw data view), the two frames' colour
  difference: 95th percentile within 2/255, and at most 0.1% of the pixels over 6/255 (as built: isolated pixels on
  the shoreline itself, where the land and water sides blend over a pixel, differ by up to 12/255 in the two
  shaders' arithmetic; the sabotages move the 95th percentile to 30–80). Corrected in W5a: those pixels were
  undefined derivatives (the shoreline's branches reached too little past its blend); with the margin fixed the two
  materials match exactly, and the gate is back to the largest within 6/255. Where the two surfaces meet on screen they
  intersect, so they share the world point there: with the band check (each surface shows only within the band of
  the other), equal colours in the band leave no seam. Comparing a frame with the water hidden would not do: the
  two surfaces stand up to 0.5 m apart, and the parallax shifts the grain.
  - **Sabotages:** the water painting itself everywhere it is drawn (`WATER_SAB_OWN`: water on the dry side, the
    upper layers not faded in) and the terrain without the band (`WATER_SAB_TERRAIN`) each fail it.
- **Pools dark and calm, riffles light and foamy** (page, the default zoom at three reaches): water pixels near the
  centre line, classed by the river's riffle there (above 0.7, below 0.2): pools' median luma under riffles' by a
  margin; riffles' share of foam-bright pixels at least twice the pools'. As built, riffles are classed at 0.5 and
  above (the river's riffle reaches 0.81, and no stretch in the play area holds above 0.7). Sabotage: the riffle ignored
  (`WATER_SAB_FLAT`) fails.
- **No flicker:** the band check's z-fighting count, and the L2b shimmer check run on the water and its shore (a
  sub-pixel shift of the image moves the shore by its shift, not more): at the closest zoom under 1% per frame pair,
  as the terrain's; at the widest (added in review round 2, the data's textures having lost their mips) under 3.5%:
  there the river's outline (the painted shoreline, the banks hiding the water) is a large share of the pixels, and
  main measures 6.3% on the same pixels and view. Thin marks widen (the shore line, to 1.5 pixels at least, its ink
  spread) or fade (strokes, glitter, riffle foam) as a pixel's footprint grows past them. Sabotage: aliased hard
  edges (`WATER_SAB_STEP`).
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
- **What follows each surface's derivatives:** where the ribbon meets a sloped bank, the two surfaces share the
  world point but not its screen derivatives, so the detail grain's blur and the edges' anti-aliasing differ slightly
  across the line (the values do not). The seam check cannot see it (one geometry); a check across the real
  boundary could not tell it from the painted shoreline there (tried in review round 1). Judged on screenshots.
  The data's textures have no mips for this reason (a mip level would change the values).
- **The terrain's cost:** one more fetch per terrain pixel (the water data) and the band's work near the water;
  measured by the bench.
- **The band at the tile's edge:** the apron and the far ring have no water data, so the band stops at the tile's
  edge, at least 165 m past the play area (seen from the wide zooms only). Left as it is.
- **Spiral risk** (prototype plan §4.4): if the review needs more than 3 rounds, stop and revisit the opaque
  bed-painting design.

## Results (dev Mac, against main as the base)

- **Band** (`node tools/water-look-check.mjs <url> --selftest`): the ribbon shows over dry ground at 857 of 187,237
  points (0.25 m), the farthest 0.69 m from the shore; the drawn ground stands above the water at 4,973, the farthest
  0.63 m into the water and 0.60 m above it; every wet texel lies under the ribbon; past the band no ground comes
  within 2 cm of the water. All under the band (0.75 m), with little margin: a world whose grid strays farther
  fails here. The sabotage (no diving columns): water over dry ground 0.94 m out, fails.
- **Seam:** the tile's ground with each material, at 75,222 / 30,771 / 22,981 band pixels (the sharpest bend
  closest, the bend and a reach at the default zoom): 95th percentile 0/255, 2–4 pixels over 6/255 (largest 11, on
  the shoreline itself). The sabotages: 95th percentile 31–82, fail.
- **Pools and riffles** (three reaches, default zoom): median luma pools 0.536, riffles 0.568; bright pixels pools
  0.1%, riffles 3.9%. The riffle ignored: no bright pixels on riffles, fails.
- **Shimmer:** at the closest zoom 0.42% per frame pair (the terrain's own, L2b: 0.49%); at the widest 3.0%, where
  main measures 6.3% on the same pixels. Aliased edges (the sabotage): 3.1% at the closest, fails.
- **The tile's edge:** the river's colour just inside the tile (the ribbon) against just outside (the far ring's
  line), at the far-edge camera: main steps by up to 16/255 (blue), this branch by up to 11/255 (red, green). The
  line was left as it is.
- **Existing checks:** `tools/check-negatives.mjs` (render, river, look: every check passes the scene and fails
  its sabotages), `tools/water-check.mjs --selftest`, `tools/detail-check.mjs --selftest` (scale, seams, shimmer,
  banks), `npm test`, `npm run check:data`, the docs check.
- **Readability guard:** no block that separates on the base fails (Austria on wheat and open low ground in winter
  fails on both).
- **Goldens:** the cameras without the river match (the start view at −40°); the others differ along the river and
  its banks.
- **Textures:** the water data is made at load and kept (10 MB); it and the bank normals lose their mips (10 MB
  each, were 13.7).
- **Owner's eye:** screenshots in the PR (three zooms; sun and cloud shadow; summer, late autumn, winter).
- **Review:** round 1 (two severe: the ice no longer covered the upper layers; the data's mips differed between
  the surfaces) fixed the ice, dropped the mips, anti-aliased the shoreline's select, made the seam sabotage reach
  the band and dropped the fold guard. Round 2 (severe: fwidth without the derivatives extension on WebGL1) also
  painted the bed at the surface's point, made the band follow the seasons, and added the widest view to the
  shimmer check (thin marks now widen or fade with a pixel's footprint). Round 3 (nothing severe; fixed and
  stopped): no snow on the bed under the water, the seam check's maximum without a spread, `terrainOnly` keeps the
  tile's ground, the WebGL1 rule in one place, the ribbon's unused along coordinate dropped, the URL options in one
  parser.
