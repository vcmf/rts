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
- **Fewer light marks:** the strokes along the current mostly on riffles; the riffle foam a little thinner, the
  riffles still the lighter water (the fords: §6c, and the pools-and-riffles check).
- **The valley mist a third over the water** (its mask, `src/look/bakes.ts`): it washed the river pale (with it off,
  the first pass's water was already dark); thinning from the shoreline across the shore band, so every surface
  over the river (the water, the band, stones, units fording) takes the same air.
- **Winter's open water** darker than the new deep teal (it lightened it otherwise).
- Unchanged: the banks, the ice, the leaves, the glitter (sun dabs read better on dark water).

## Approach

Constants and mood colours, and the mist's mask over the water; no new pass. A/B captures against main (summer, autumn, winter; close, default,
widest), the owner judges.

## Acceptance

- The owner's look check.
- `node tools/water-look-check.mjs` (pools against riffles, foam, banks, seam, shimmer, winter, leaves) and its
  `--selftest`; the guard, coat and negatives checks; the goldens (they will differ: the water); the bench (no cost
  expected: constants). `npm test`, `node tools/check-docs.mjs`.

## Results

- **The owner** (2026-10-18): "it's good enough yes" (the first pass with the mist thinned in the two shaders; the
  mask's version looks the same: `scratch/compare/water/ab5.jpg`, not committed).

## Review

- **Round 1** (severe): winter's frost lightened the new deep water (its target darker now); the trees' reflections
  vanished on the dark pools (a dark green above the water's value now); the mist thinned only in the terrain's and
  the water's shaders, so stones and units in a ford stood pale on the dark water (in the mist's mask now); the plan
  not in the index; the docs.
