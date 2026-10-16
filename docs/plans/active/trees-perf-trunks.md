---
status: active
last_reviewed: 2026-10-16
---

# Plan: the same trees everywhere, the trunks' shadows, and the frame toward 120 fps

The owner (2026-10-16), in one PR: "use same tree generation everywhere; spawn deep research to see how to optimize
and achieve 120fps with current settings without compromising much; add trunk". The far woods (#99) were low-detail
stand-ins the camera can come within reach of (they read as plain blobs up close); the trees' shadows had no trunk
("at close it's a bit weird"); and the frame targets are now 60 fps hard, 120 fps soft.

## Scope

- **The far woods as the near trees:** each far item its species' generated model with its leaf cards, its leaf fall
  and its twigs (the near scatter's `drawGroup`), sized as the stand-ins were (the larger of its reach and its height
  over 1.8 fills `Bush_1`'s footprint at the item's scale); two of each species' four models. The stand-ins
  (`farModel`) go. In winter the far broadleaves now go bare as the near ones do (#98).
- **Their cost:** one mesh a model holds every far instance; each frame the view moves, the instances in the view's
  frustum are packed to the front of its buffers (`farCuller`), those within 220 m of the camera with their cards,
  the farther ones with the model's own crown mesh (no alpha test, a few pixels wide there). The shadow pass bakes
  with every far tree and its cards. As built, after the owner saw the switch pop ("there's some clear visual change"):
  a dithered cross-fade over 190 to 250 m, and the crown mesh lit as the cards (their volume light per clump).
- **The trunks' shadows:** a trunk is thinner than two of the shadow map's texels (0.33 m) and the soft filter washed
  it out. Each drawn tree's trunk is drawn into the light map's sun after the terrain, once, as a quad on the ground
  from its root away from the sun to its crown's base: crisp at the root, softening along it, fading where the
  crown's shadow starts. Baked: nothing a frame.
- **Toward 120 fps:** the research (`docs/research/frame-rate-120.md`); A/Bs of its cheapest items, kept where they
  pay without a visible change. As built: the grain's anisotropic filtering (4 to 2 or 1) and the ground drawn after
  the other opaque meshes were tried and dropped (results); one of the two macro bakes is read only where it has
  weight (the same pixels). Judged by the frame interval beside the GPU timer (the timer over-reports on this Mac).
- Docs: `docs/systems/look.md`, the track plan (L7's table, the frame targets), the research note.

## Acceptance

- Captures: the far woods at the far-edge and wide views and up close, summer and winter; a trunk's shadow in sun.
- The frame (`tools/bench-look.mjs`, Metal, the frame interval and the timer, against main, twice each side).
- The guard against main (the default, cover and crops views, three seasons), `tools/coat-check.mjs`,
  `tools/check-negatives.mjs`, `tools/water-look-check.mjs`, `tools/macro-check.mjs`: exit 0.
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at c5c1854. Every run's exit code. Captures in `scratch/compare/trees-everywhere/` and `scratch/compare/trunks/`
(not committed).

- **The look:** the far woods are the near trees (cards, leaf fall, twigs); up close a hedgerow within the camera's
  reach is leafy cards, not blobs; past 250 m the crown mesh, lit as the cards; between, a dithered cross-fade (a pan
  of 20 m across it shows no pop). In winter (the slider released) the far broadleaves go bare as the near ones, the
  spruces stay green (#98). The trunks' shadows: a dark band from each root to its crown's shadow (sampled in the
  light map: 24 in the band against 253 beside it, of 255); the contact under each tree kept (193 roots dark).
- **The frame** (`tools/bench-look.mjs`, Metal, 1920×1080, the l2 arm, the median over the three yaws; the frame
  interval first, the GPU timer after it, which over-reports on this Mac: `docs/research/frame-rate-120.md`; load 2
  to 5):

  | Season | View | Main | This branch | Difference (interval) |
  |---|---|---|---|---|
  | summer (twice) | close | 4.52 / 4.52 ms | 4.48 / 4.50 | -0.03 |
  | | default | 5.90 / 5.90 | 5.98 / 6.00 | +0.09 |
  | | widest | 8.78 / 8.75 | 9.97 / 9.88 | **+1.16** |
  | late autumn (1.6) | close / default / widest | 4.68 / 6.03 / 9.02 | 4.57 / 6.57 / 10.02 | -0.11 / +0.54 / +1.00 |
  | winter (3) | close / default / widest | 4.57 / 5.67 / 8.83 | 4.60 / 6.12 / 10.13 | +0.03 / +0.45 / +1.30 |

  Triangles drawn 1.41 M to 1.15 M in summer (the far trees culled); draws 107 to 113. **The cost is the far woods
  at the widest zoom, about 1.2 ms** (8.8 to 10.0 ms: 114 to 100 fps on this Mac): the hard target (16.7 ms) holds,
  the soft one (8.3 ms) was already missed there by main. Past the leaf fall the far broadleaves keep their cards at
  every distance: +0.5 ms at the default view.
- **The A/Bs** (the frame interval, the branch before the cross-fade, twice each): the grain's anisotropic filtering
  4 → 2: widest 9.53/9.92 → 9.45 (one run at 14.6 under load, discarded); → 1: 9.38/9.50, a softer grain for 0.1 to
  0.3 ms; the ground drawn after the other opaque meshes: close +0.9 ms, default +0.2, widest -0.2. Both dropped.
  The macro bake read only where it has weight: the same pixels (max difference 0).
- **The checks** on the final code: the guard against main (the default, cover and crops views, summer, autumn and
  winter): exit 0 each; `tools/coat-check.mjs`, `tools/check-negatives.mjs`, `tools/water-look-check.mjs`,
  `tools/macro-check.mjs`: exit 0 each. The goldens against main differ at every view (the trunks' shadows wherever
  trees stand; the far woods at the wide and far-edge views): the expected change.

## Review

- **Round 1** (severe): the trunk quads' alpha wiped the light map's contact (A); `?trees=gen` without cards lost
  the near far trees; the culler re-enabled meshes the checks hide; the culling lagged the camera a frame. Fixed.
- **Round 2** (severe): a readiness check left the culling off for good (every earlier bench of this branch was
  measured that way, and is not used); no far tree past 220 m without cards; a count of 0 drew a tree at the origin.
  Fixed, with the winter far woods bare.
- **Round 3** (moderate): the cull sphere did not hold the crown (edge pops); the hard switch at 220 m popped (the
  owner saw it too); fixed by the cross-fade and the crown mesh's light, reviewed as their own step: one trunk in the
  band, a dither offset per tree, the warm-up kept through the shadow pass with a time limit, the far card materials
  from the near ones' arguments.
