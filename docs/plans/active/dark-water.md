---
status: active
last_reviewed: 2026-10-18
---

# Plan: dark water

The owner (2026-10-18), after Tiny Glade's water: "the water in tiny glade color is much darker i prefer that as it's
more close to reality". The art bible already asks for it (§6c: pools of "deep, calm, dark water"; its references:
"dark mirror water with long reflections"); ours reads pale grey-blue with many light marks.

## Scope

- **Deep water dark:** the absorption ramp's turquoise and deep teal darker, reached at less depth (`shoreWater`,
  `shore.glsl`); the painted sky tint (the moods' `waterSky`) a dark blue-teal, not a pale sky; the far ring's river
  line (`farRiver`) to match.
- **The reflections stronger and darker** (the trees' mirror, `water.frag` layer 5).
- **Fewer light marks:** the strokes along the current mostly on riffles; the riffle foam kept (the fords read light:
  §6c, and the pools-and-riffles check).
- Unchanged: the banks, the ice, the leaves, the glitter (sun dabs read better on dark water).

## Approach

Constants and mood colours only; no new pass. A/B captures against main (summer, autumn, winter; close, default,
widest), the owner judges.

## Acceptance

- The owner's look check.
- `node tools/water-look-check.mjs` (pools against riffles, foam, banks, seam, shimmer, winter, leaves) and its
  `--selftest`; the guard, coat and negatives checks; the goldens (they will differ: the water); the bench (no cost
  expected: constants). `npm test`, `node tools/check-docs.mjs`.
