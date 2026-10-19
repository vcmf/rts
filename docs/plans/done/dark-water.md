---
status: done
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
- **The trees' mirror** a dark green (`water.frag` layer 5), above the dark water's value, as Tiny Glade's: the
  crowns read in it. A dark russet as they turn, gone as they go bare, cooled in shade as the water under it.
- **Fewer light marks:** the strokes along the current mostly on riffles; the riffle foam a little thinner, the
  riffles still the lighter water (the fords: §6c, and the pools-and-riffles check).
- **The valley mist a third over the water** (the light map's mist channel, `bake.frag`, from the water data's shore
  distance: `waterMist` in `waterdata.glsl`): it washed the river pale (with it off, the first pass's water was
  already dark); thinning from the shoreline across the shore band, so every surface over the river (the water, the
  band, stones, units fording) takes the same air.
- **Winter's open water** darker than the new deep teal (it lightened it otherwise).
- Unchanged: the banks, the ice, the leaves, the glitter (sun dabs read better on dark water).

## Approach

Constants and mood colours, and the mist thinned over the water in the light map's bake; no new pass. A/B captures against main (summer, autumn, winter; close, default,
widest), the owner judges.

## Acceptance

- The owner's look check.
- `node tools/water-look-check.mjs` (pools against riffles, foam, banks, seam, shimmer, winter, leaves) and its
  `--selftest`; the guard, coat and negatives checks; the goldens (they will differ: the water); the bench (no cost
  expected: constants). `npm test`, `node tools/check-docs.mjs`.

## Results

- **The owner** (2026-10-18): "it's good enough yes", on the first pass (the mist thinned in the two shaders); the
  built version (the light map's) captured the same in the same views (`scratch/compare/water/ab6.jpg`, not
  committed): the owner to see it once more before the merge.

## Review

- **Round 1** (severe): winter's frost lightened the new deep water (its target darker now); the trees' reflections
  vanished on the dark pools (a dark green above the water's value now); the mist thinned only in the terrain's and
  the water's shaders, so stones and units in a ford stood pale on the dark water (in the mist's mask now); the plan
  not in the index; the docs.
- **Round 2** (severe): the mist mask's 3 m cells and a symmetric half width could not follow the shoreline (thinner
  mist on dry point bars, blotchy on narrow channels): thinned in the light map's bake (0.26 m texels) from the water
  data's shore distance instead. The reflections' wording.
- **Round 3** (the last; moderate, one visible): the trees' green mirror showed on winter's water (the trees bare)
  and stayed lit in shade: it follows the season and the shade now. The mist's thinning over a few metres (a sharp
  step at every shoreline otherwise); the absorption's coefficients folded; the comments. Fixed without a fourth
  round: local constants, checked by the batch below. Left: cast shadows show little on the deepest pools (the
  shadow multiplies a near-black teal); winter's ice keeps the thinner mist (the light map is baked once).

## Checks

- The water check's first run: the riffles no lighter than the pools by 0.03 (0.309 against 0.291: the shallows
  darkened, the riffles lost the pale mist that lit them), and the shimmer over its limits. Now: main's absorption in
  the shallows (1.6 times it from about 0.4 m), the rough water lifted (broken, aerated water reads lighter: §6c), the
  riffle foam softer, the glitter's dabs soft-edged: pools 0.289, riffles 0.374, ok. The shimmer stays above main's
  (1.17 % closest, 5.57 % widest: every edge on dark water is more contrasty); the owner, after looking at it moving:
  re-baseline (decision 0042).
- The full batch on the preview builds (after main's #116): the guards (default, cover, crops; three seasons), coat,
  negatives: ok. Water: the winter ice under its gate (pools frozen 76.1 %, main 86.6 %, the gate 80 %: the mist a
  third over the water lifted the ice less); the ice a little lighter now (× 1.12): 82.8 %, the shimmer still within
  its limits. The gravel bar 0.002 short of its gate (luma 0.612, 0.614 needed) as on main (the same numbers: #116's
  terrain), not this PR's.
- Final review (one pass over the changes after round 3): severe, the decision's number (0041 taken on main by
  #117): renumbered 0042, rebased on #117. Moderate, fixed: no riffle lift in winter (the open water between the ice
  stays dark) nor its light in shade; the glitter's edge at least a pixel wide (fwidth); comments. Left: the ice
  × 1.12 makes the winter gate pass by brightening the ice rather than by the mist it had (the light map is baked
  once a map, not a season).
- The batch again on the rebased preview builds (main #117 against this branch): the guards, coat, negatives ok;
  water ok but the gravel bar (shimmer 0.91 % closest, 5.27 % widest, winter 82.8 % frozen; the self-test catches
  every sabotage); macro: field|grass 6.2 and road|grass 4.5 under their gate of 8, the same numbers on main (#116,
  #117), as the bar: #118; goldens: differ on the water.
- Performance: the owner, on the preview builds (`vite build` + `vite preview`), main and this branch both at 120 fps
  in the river view that had shown 100-105 on the dev servers (the dev server's overhead, not the water). The bench
  (`tools/bench-look.mjs`, Metal, four interleaved rounds) too noisy on this machine to resolve under 1 ms: default
  7.3-7.6 ms both, with outliers near 9.7 on either.
