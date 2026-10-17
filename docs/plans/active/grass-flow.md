---
status: active
last_reviewed: 2026-10-17
---

# Plan: combed grass, step 1: the flowing ground pattern (`?grass=flow`)

## Problem

The owner (2026-10-17) wants the meadow to have Tiny Glade's beauty (`design/refs/tiny-glade/`, owner-local). The
research (`docs/research/painterly-grass.md`) found what makes that grass read as painted: combed flow (patches
sharing a lean), light and dark streaks from it, a strong root-to-tip gradient, deep soft gaps, soft value masses
at distance. Our meadow has none of the flow: the brush tile's blades lie every way (`tools/meadow-brush.py`), and
each 3D clump turns at random (`meadow.vert`). At our camera a blade is under a pixel wide at every zoom (the
research, §1), so the look must come from the pattern and the light first, not from more blades.

## Scope

Step 1 of the research's order, as an arm of the look page, `?grass=flow` (the default unchanged):
- **a flow field** (`flowAt` in `src/look/shaders/meadow.glsl`): a slow map-wide lean direction and strength, shared
  by the ground and the grass;
- **the ground pattern combed** (`meadowPattern` in `src/look/shaders/macro.glsl`): the brush tile read along the flow
  and stretched along it, light and dark streaks by the lean against the sun, deeper cool gaps, soft value masses;
  still in the macro bake, so nothing a frame;
- **the 3D clumps lean with it** (`meadow.vert`): their turn and lean from the field, the hash only jittering it.

Out of scope: shells, near blades, flowers and petals, parting around props and units (later steps).

## Approach

The flow is a low-frequency angle field (two octaves of the meadow's value noise, domain-warped so it swirls) and a
strength field (patches lying flatter). The tile is read in a frame turned to the flow and stretched about three times
along it, so its marks run with the comb. The streak is the lean's dot product with the sun's direction on the
ground, times the strength. The sun is fixed per map, so the bake holds it (decision 0001: the look in the
materials; AGENTS.md: static light baked once).

## Acceptance

- `?grass=flow` against the default from the same cameras (closest, close, default, widest; summer and autumn),
  judged by the owner.
- The default arm unchanged: the goldens against origin/main identical (`tools/golden.mjs`).
- The cost: nothing a frame for the pattern (in the bake); the clumps' extra instructions measured with
  `?bench=meadow`-style A/B, `tools/bench-look.mjs`, paired runs.
- The readability guard (`tools/guard.mjs`) with `?grass=flow` no worse than the default.

## Review rounds
