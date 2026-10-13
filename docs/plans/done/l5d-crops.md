---
status: done
last_reviewed: 2026-10-13
---

# Plan: L5d, the crops from the meadow's grass

Track E, after L5c (`docs/plans/done/l5c-meadow.md`). The owner (2026-10-13): "for wheat texture and rendering (if
near camera) can we reuse what we have for grass, just bigger … and the color is a bit different (lime ->
orange/yellow/brown between seasons)".

## Problem

The fields are the pack's wheat tufts (408 triangles each, placed over a whole field, drawn whatever the zoom), on
one authored field; the green crop and the stubble have no plants at all. The meadow already grows dense, clumped
grass near the camera at a measured cost, with the placement rule and the readability caps.

## Approach

- **One slot, grass or crop:** grass grows on meadow and pasture, crops on fields, never both on one patch, so each
  of the meadow's slots draws a grass clump or a crop clump by what is under it: no new ring, no new draw, about the
  same vertex work. The meadow map's spare channel (A) carries the crop's growth, with the same rules as the grass
  (the cover's edge, the formation zones, the banks, a texel's shrink against the GPU's blend).
- **The crop by its class and the season** (the cover's class read at the root: wheat, green crop, stubble;
  ploughed grows nothing): taller and narrower than grass, never over `WHEAT_HEIGHT_MAX` (decision 0026); standing
  wheat in summer, stubble after the harvest (autumn), ploughed under in late autumn, nothing in winter; the green
  crop lower, through the seasons; stubble short.
- **The colour ramp** (owner): lime green at the stalk's foot to gold, orange and brown with the season (the wheat
  gold in summer, straw in autumn, brown after); the green crop lime to olive.
- The pack's wheat tufts are not placed under the meadow (`?meadow=off` keeps them); the checks move to the crops'
  growth (river-check: none on the floodplain, in the zones, on the banks; look-check: no clump floats).

## Acceptance

- `npm test`; river-check and look-check pass.
- `node tools/guard.mjs` against main, each arm against main's same arm: no block worse than main's.
- `?bench=meadow` (one page, frame interval): the meadow with its crops against none, against L5c's cost.
- Pairs (main against this) at the near and mid views, summer, autumn and winter, for the owner.

## Results (2026-10-13)

Pairs (not committed; `scratch/compare/crops/` in the main checkout): main beside this branch over the wheat field
at the near view in summer, autumn, late autumn and winter, the mid view in summer and autumn, and a stubble field.

- **Look:** the wheat field is dense gold stalks, lime at the foot, about twice the grass's height and narrower,
  instead of the pack's sparse tufts; stubble in autumn is short and pale; late autumn and winter show the bare
  ground (ploughed under, snow). Every sown field on the tile now grows (198,596 texels), not only the authored one.
- **Cost** (`?bench=meadow`, M1 Pro Metal proxy, 4 s a camera, two runs an arm, interleaved with main; the machine
  under other load, about 9): the meadow against none, this branch +1.05–1.25 ms close and default, +0.5–1.1 ms wide;
  main (its grass and wheat tufts) +1.05–1.15 ms and +0.15–1.0 ms. Within the runs' spread (up to 0.9 ms wide): no
  measurable cost over L5c.
- **Checks:** river-check passes (cropsInZones and on the banks 0, cropsOnFloodplain 0, 219,640 crop points sampled),
  look-check passes (nothing floats, worst −0.031 m), both with `?meadow=off` too (315 wheat tufts there).
- **Readability guard** against main: passes, at the default view and the cover view; wheat.France in summer 0.100
  (main 0.098).
- `npm test`: 19 files, 256 tests pass.
