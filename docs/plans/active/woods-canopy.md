---
status: active
last_reviewed: 2026-10-23
---

# Plan: woods in green (staff map prototype)

## Problem

In the lit style, the woods were drawn as scattered dots: sparse crown circles, each with its own shadow. The owner
wants them in green, with "some kind of noisy texture to make a feeling of 'blossom'". The green has to match the
paper. Their reference is a map model with soft, layered green woods.

## Scope

In `prototypes/staff-map.html`, lit style:
1. **A canopy of crowns.** A crown about every 9 m inside each wood, jittered. Its size varies slowly across the wood,
   so crowns gather into clumps. Each lone tree outside a wood is one crown. All are baked once, as soft bumps that
   add up to a canopy height (`bakeCanopy`).
2. **Lit and coloured.** The shader lights the bumps by the map's one north-west light: lit dome tops, hollows in
   shade. It fills the wood under its crowns and casts the canopy's shadow a few metres away from the light. The
   colour is the season's crown colour taken toward the paper and cooled slightly, a sage green.
3. **The dot sprites are removed** (`crownSprite`, `shadowSprite`).

Out of scope: the ink style, the painted world's trees (close zoom), and real wood outlines (the 1805 plan).

## Acceptance

- Screenshots at map, mid and close zoom: green woods that read as a lumpy canopy, matching the paper and the
  shaded relief, with the armies still the most saturated things on screen.
- Bake, load and frame time against the dotted woods (paired runs).

## Results

- **Measured.** Windows Chrome over CDP, D3D11, RTX 3080, real terrain, shaded relief, vsync off, three paired runs.
  - The map bake, woods included (`window.__bake.ms`): 213, 228 and 253 ms, against 157, 231 and 176 ms with dots.
  - Load (`window.__buildMs`): 1455, 1545 and 1814 ms, against 1442, 1663 and 1776 ms.
  - Frame at map zoom: 8.5, 10.5 and 7.3 ms, against 8.4, 10.2 and 8.5 ms.

  No difference beyond the noise in load or frame. The bake is about 40 ms more on average.
- **What changed while tuning.** The first pass, with 4 to 7 m crowns, looked like sandpaper at mid zoom; bigger,
  clumped crowns fixed it. The paper showing between the crowns read as brown worms; filling the wood and shading
  the hollows fixed it.

## Owner's verdict and the change

- The canopy was "ugly and super laggy", so it was **removed**. Woods are a plain green ("just green for now"): the
  season's crown colour taken toward the paper.
- The green is **painted on the paper, under the relief**, its shadows and the contour lines (the owner: "it must be
  under the line under the shadow"). The relief is no longer lightened under woods, and the contours are no longer
  faded there.
- The canopy bake, its sampler and the dot sprites are gone. The map bake is now about 60 to 70 ms.
