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
  ground (ploughed under, snow). Every sown field on the tile now grows (173,332 texels), not only the authored one.
- **Cost** (`?bench=meadow`, M1 Pro Metal proxy, 4 s a camera, two runs an arm, interleaved with main; the machine
  under other load, about 9): the meadow against none, this branch +1.05–1.25 ms close and default, +0.5–1.1 ms wide;
  main (its grass and wheat tufts) +1.05–1.15 ms and +0.15–1.0 ms. Within the runs' spread (up to 0.9 ms wide): no
  measurable cost over L5c.
- **Checks:** river-check passes (meadowInZones and meadowOnWater, now counting the crops too, 0; cropsOnFloodplain 0; 195,779 crop points sampled),
  look-check passes (nothing floats, worst −0.031 m), both with `?meadow=off` too (315 wheat tufts there).
- **Readability guard** against main: passes, at the default view and the cover view; wheat.France in summer 0.101
  (main 0.098).
- `npm test`: 19 files, 256 tests pass.

## Review (`/code-review high`)

- **Round 1** (5c06230): one severe finding. The crop's class came from the cover at its root, while the crops'
  growth took all sown classes as one, so wheat could stand on a painted green-crop strip where two fields meet.
  `Nature.crop` now needs one class EDGE round the point, which takes 198,596 texels down to 173,332, and an
  unknown class grows nothing. Also fixed:
  - stubble and the green crop as wide as the wheat (the footprint now scales with the crop's height);
  - the ground's colour read and thrown away for every crop pixel (the fragment shader branches first);
  - the green crop's winter colour, and each field's own shade;
  - `growth()` run twice a cell (one pass now);
  - a double cast;
  - four copies of the bilinear blend (`bilerp`);
  - a comment moved off its code;
  - the floodplain check, which now covers a crop's reach;
  - this plan's check names and the bench comment.

  Checks, guard and `npm test` pass again. Stubble draws but at 0.22 m barely shows from the RTS camera: left for
  the owner.
