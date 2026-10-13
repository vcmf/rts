---
status: active
last_reviewed: 2026-10-13
---

# Results: the shadows and the leaf-card crowns (2026-10-12/13)

What four PRs found, for `docs/plans/active/track-e-look.md`: the shadow look (#59, `docs/plans/done/shadow-look.md`),
the soft shadows (#60, `docs/plans/done/soft-shadows.md`), the leaf-card crowns (L7a, #58,
`docs/plans/done/l7a-canopy-cards.md`) and their volume light (L7b, #61, `docs/plans/done/l7b-crown-volume.md`).

**One rule for the numbers here:** a cost is the paired difference of a one-page A/B (the bench runs both arms at
each camera, A B B A, so a slow drift of the machine falls on both arms alike; a change inside a block shows as a
large repeat spread), read on the **frame interval** (`frameMs`, no
vsync: the page's own pace), with the repeat spread beside it. The GPU frame timer is not used: on ANGLE Metal it
runs longer than the frame, by an amount that changes with the scene (`docs/plans/done/forest-bench.md`). Every
other measurement stays in the plan that made it, with its method, and is linked from here. All runs are on the dev
Mac (Apple M1 Pro, ANGLE Metal, headless Chrome): proxies that pass no gate.

## The cards' and the volume light's cost

Frame interval p50 (ms) on the normal scene: each arm's mean over the bench's three yaws, each run twice; the paired
difference per camera in the order yaw −45°, 0°, +45°; the repeat spread is the largest difference between the two
runs of one arm at one camera. `node tools/bench-look.mjs '…/app/look.html?trees=cards&bench=trees|volume' --gpu metal --hold 5`
at 1920×1080, on main at #65 (ae87e4c; the JSON beside this one, `shadows-foliage-2026-10-13-ae87e4c-*-mac-proxy.json`,
reads `build` 61d031a, the hash Vite read when its server started on the earlier checkout).

| One-page A/B, normal scene | close | default | widest |
|---|---|---|---|
| Cards against pack crowns: the arms | 3.82, 3.82 | 4.87, 4.75 | 7.05, 6.80 |
| — paired difference | −0.05, +0.05, 0.00 | +0.15, +0.05, +0.15 | +0.20, +0.10, +0.45 |
| — repeat spread | 0.20 | 0.70 | 0.80 |
| Volume light against L7a: the arms | 3.08, 3.20 | 4.47, 4.55 | 6.95, 6.95 |
| — paired difference | −0.25, −0.15, +0.05 | −0.05, −0.25, +0.05 | 0.00, 0.00, 0.00 |
| — repeat spread | 0.60 | 0.50 | 0.10 |

- **On the normal scene neither costs anything clear of the noise:** every paired difference sits within its
  column's repeat spread (the cards' largest, +0.45 ms at the widest zoom, comes from one run 0.7 ms above its
  repeat).
- **Where a forest fills the frame the cards do cost** (`docs/plans/done/forest-bench.md`, its results and their
  method): about 1.4 ms a frame at the default zoom in the cleaner run (+1.05 to +2.15 ms in the other) and
  +0.2 to +1.3 ms at the widest across the two runs; the closest zoom too noisy to read. The absolute frame times
  move from run to run, so the headroom left is not read from them. This is the cards' cost to watch: L7 owes a
  cheaper forest before they become the default (`docs/plans/active/track-e-look.md`, L7).

## Load time

The soft shadows are baked on load, nothing per frame: their bake times are in `docs/plans/done/soft-shadows.md`
(the sky's occlusion on the CPU, the light-map bake on the GPU).

## What the plans found (their numbers are there)

- **The shadows** (`docs/plans/done/shadow-look.md`, `docs/plans/done/soft-shadows.md`): cast shadows read in the
  valley again; the slope's shadows stayed as weak as before, short of the shadow look's target (open for L9w);
  shadow edges are crisp at a caster's foot and soft far from it; a wood's floor is darker than a lone tree's shadow.
- **The crowns** (`docs/plans/done/l7a-canopy-cards.md`, `docs/plans/done/l7b-crown-volume.md`): the cards read
  as painted leaf masses at the near and mid zooms; the volume light more than doubles a crown's range of values.
- **The readability guard:** one block regressed: `wheat.France` (summer, a dark blue block in a tree's cast
  shadow), waived by the owner for the shadow look, and lower again with the cards (#63). The guard gates a block
  against its base only when the base separates it; the blocks that already fail on main (`fails*`, a palette
  question: `docs/plans/active/track-e-results/l2a-baseline.md`) are not gated, and their values with the cards were
not recorded: a guard run against the base prints them (owed, with #63).

## Not measured

- The shadow look's per-frame cost (a few shader operations: an unmeasured estimate of no visible cost).
- The volume light where a forest fills the frame (the forest bench's run was too noisy).
- Units, smoke and anti-aliasing in a forest (stage 2): the frame they share with the cards.
- The foliage's total cost (L7's gate, ≤ 3 ms GPU): the benches measure what the cards add, not the total.
- The min-spec laptop (owner question 1); the foliage overdraw; a heat ripple behind the army blocks.
