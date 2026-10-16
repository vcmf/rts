---
status: done
last_reviewed: 2026-10-16
---

# Plan: the widest zoom's frame

The owner (2026-10-16): improve the widest zoom toward 120 fps; armies come later. The research
(`docs/research/frame-rate-120.md`) ranked far-tree impostors first, so the widest view was profiled first, by the
frame interval with one part off at a time (the bench, Metal, 1920×1080): 4× MSAA ≈2.4 ms, the meadow ≈1.2, the far
woods ≈0.6, the bloom ≈0.2, the terrain's detail grain and every leaf card ~0. Impostors could win back 0.6 ms at
most; the anti-aliasing's target and the meadow cost more.

## Scope

- **The scene's MSAA target in 8 bits a channel**, not half floats (4× MSAA kept): the same frame (the captures: a
  mean difference of 0.26 of 255, no banding in the winter mist), less bandwidth. Half floats under the depth of field
  (its distance rides in alpha). `?rt16` for the A/B.
- **The meadow's rings by zoom:** from a camera radius of 150 to 200 m the two inner rings (0.5 and 1 m cells) shrink
  to the focus and the outer ring (2 m cells) grows in to it: at the widest zoom only the outer ring is drawn (a clump
  is a few pixels there); the clumps fade as the bands move. `?nowide` for the A/B.
- The profiling switches kept for later A/Bs: `?msaa=1|2|4`, `?far=off`.
- Docs: `docs/systems/look.md`, the research note.

## Acceptance

- The owner's screen at the widest zoom (the frame readout); captures: no visible change.
- The guard (three views, three seasons), the coat check, the negatives, the water and macro checks, the goldens:
  once, at the end. `npm test`, `node tools/check-docs.mjs`.

## Results

- **The owner's screen** at the widest zoom (the readout): 94 fps before, 100 with the 8-bit target, **108 with both**.
- **The bench** (this Mac, contended by a browser using the GPU: arms within one run compared): the 8-bit target
  0.6 ms faster at the widest view than `?rt16` (and 0.4 to 0.8 in a quiet run earlier); the meadow by zoom 0.4 to
  1.4 ms faster than `?nowide`. A quiet run is owed.
- **2× MSAA** (`?msaa=2`): about 1 ms at every zoom, the owner measured about 100 fps with it alone; edges a little
  noisier: kept as a future quality preset, not the default.
- **Captures:** the widest and start views against main: no visible change (mean 0.4 and 0.26 of 255).
- **Review round 1** (moderate): the 8-bit target clips colours over 1 before the shoulder and the bloom (water
  glints, rim highlights): measured at the start view, 24 pixels differ by more than 20 of 255 (glints, a stone's
  foam), no contour bands toward the corners (the diff amplified 12×): kept, a known trade. `?far=off` now holds
  through the season and drops the far trees' shadows too (the far woods' whole cost); the outer ring's hole slots
  drawn only while zooming out (the default zoom no longer pays for them); `?rt16` and `?nowide` strict; the post
  types simplified; a dead uniform set removed.
- **The checks** on the final code: the guard (the default, cover and crops views, three seasons), the coat check,
  the negatives, the water and macro checks: exit 0 each. The goldens against main: every view differs a little (the
  8-bit target's rounding: under 1 % of a region's pixels past 6 of 255, a mean of 0.6 to 0.8); the wide and far-edge
  views more (6 to 9 %, a mean of 1.6 to 2.2: the meadow's outer ring alone at the widest zoom): the expected change.
- **The owner** (2026-10-16): "yes squash merge".
