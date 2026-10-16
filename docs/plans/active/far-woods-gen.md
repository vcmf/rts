---
status: active
last_reviewed: 2026-10-16
---

# Plan: the far woods from the generated trees (#97)

The owner (2026-10-15): "only use generated trees to replace tree assets". Since #95 the near scatter draws the
generated trees, but the far ring's woods and hedgerows (r 190 to 640 m, about 200 drawn instances) are still the
pack's `Bush_1` and `Bush_2` crowns, in one flat green (`farMat`).

## Scope

- Under `?trees=gen` (the default), the far items are drawn as **low-detail generated crowns**: each species' first
  generated model, its clumps as once-subdivided icospheres (80 triangles a clump, against 320 near) with the near
  crowns' flatter undersides and a little lumpiness, and a short four-sided trunk up to the lowest clump. About 250 to
  500 triangles a model, as the bushes (268 and 364).
- **Species:** the hedgerows mostly hawthorn with the odd oak; the woods oak, beech, lime and birch, and about one wood
  in four mostly spruce. Birch and spruce take their own far colours (the near birch and pine colours, the far rim),
  so a spruce wood stays green in autumn as the near pines do.
- **The same items:** the far list, its filter (every other item, none in the apron band or on trodden ground), its
  positions, yaws and tints are unchanged. Each model is sized so its reach in plan is `Bush_1`'s at the item's scale:
  the placement rule (`footprint('Bush_1', s)`) and the river check stay true. Birches and spruces stand taller for
  their reach, as they do near.
- `?trees=pack` and the other values keep the bushes. The near scatter's pack bushes, stumps and logs are not trees
  and stay.
- Docs: `docs/systems/look.md` (the far ring), the track plan's line if it names the bushes.

## Acceptance

- Captures at the default and widest views, summer and autumn, before and after: the far woods read as woods of the
  generated species, with no floating crowns.
- The frame's cost (`tools/bench-look.mjs`) at default and widest, before and after; the triangle count recorded.
- `tools/guard.mjs` against main, `tools/river-check.js`, `tools/check-negatives.mjs`, `tools/macro-check.mjs`:
  exit 0. The goldens: changes only in the far ring, recorded.
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at cc56fca. Every run's exit code. After review round 1 (the numbers of the first cut are in the round's notes
below).

- **The look** (captures at the wide and far-edge views, summer, autumn and winter, against main): the woods read as
  woods of the generated species, the spruce woods stay green in autumn, no crown floats (a trunk from the root and a
  limb to each clump). Every wood item is drawn: drawn every other, as the bushes were, the generated trees stood
  apart where the bushes massed and the woods looked thin; the hedgerows keep every other one. Each model is sized so
  the larger of its reach and its height over 1.8 fills `Bush_1`'s footprint: an oak (height 1.36 its reach) fills it,
  a birch or a spruce stands about a third taller and narrower; the hedgerow's odd oak stands 1.6 times the thorns'
  size where that fits (its item scaled, so the far list's footprint is what is drawn). In winter the far broadleaves
  keep their snow-capped crowns, as the bushes did, while the near ones go bare: issue #98.
- **The frame's cost** (`tools/bench-look.mjs`, Metal, 1920×1080, the l2 arm's GPU frame median averaged over the
  three yaws, twice each side, interleaved, a load average of 4 to 8): main 8.54 and 8.56 ms default, 13.41 and 13.81
  widest, 6.39 and 6.47 close; this branch 8.40 and 8.48, 13.25 and 13.43, 6.45 and 6.51. The difference (-0.38 to
  +0.12 ms) is inside the runs' spread. Triangles drawn 1,210,268 to 1,407,804 (+198k), draws 103 to 107.
- **The guard** against main, the default view, summer, autumn and winter: exit 0 (and before round 1, the default,
  cover and crops views: exit 0 each).
- **`tools/check-negatives.mjs`:** exit 0; its real-scene river case is `tools/river-check.js` on the default page
  (passes: the far items' footprint is what is drawn). **`tools/macro-check.mjs`** (before round 1): exit 0.
- **The goldens** against main: start, the yaws, close, river and winter identical; wide (11 of 16 regions) and
  far-edge (15 of 16) differ: the far ring, the expected change.
- **`npm test`:** exit 0, 256 tests (a load average under 6; at 13 to 17 the sim's timing budgets in
  `test/soldiers.test.ts` and `test/formations.test.ts` fail, as before this branch). **`node tools/check-docs.mjs`:**
  exit 0.

## Review

- **Round 1** (treated as severe: the look): every species was sized to the same reach, so the hedgerow's oak could
  not be told from the thorns and the woods' oaks stood half the birches' height; the trunk joined only the lowest
  clump, from a foot off the pivot, so other clumps could float; birch trunks were brown. Fixed as above, with the
  species' own lump on the generator's smooth noise and the model cache keyed by size. The first cut measured
  -0.23 to +0.30 ms, +160k triangles. Kept: the once-subdivided icosphere is its own copy in `nature.ts` (the
  generator subdivides twice; its icosphere is not exported, and the far crowns are built from its clumps alone).
