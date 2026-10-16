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

Main at cc56fca. Every run's exit code.

- **The look** (captures at the wide and far-edge views, summer, autumn and winter, against main): the woods read as
  woods of the generated species, the spruce woods stay green in autumn, no crown floats. The first cut drew every
  other wood item, as the bushes were: the generated trees stand apart where the bushes massed, so the woods looked
  thin; every wood item is drawn now (the hedgerows keep every other one). In winter the far broadleaves keep their
  snow-capped crowns, as the bushes did, while the near ones go bare: issue #98.
- **The frame's cost** (`tools/bench-look.mjs`, Metal, 1920×1080, the l2 arm's GPU frame median averaged over the
  three yaws, twice each side, interleaved, a load average of 6 to 11 with the owner's apps running): main 8.50 and
  8.83 ms default, 13.70 and 13.55 widest, 6.44 and 6.64 close; this branch 8.80 and 8.60, 13.96 and 13.52, 6.65 and
  6.49. The difference (-0.23 to +0.30 ms) is inside the runs' spread. Triangles drawn 1,210,268 to 1,370,316
  (+160k), draws 103 to 107.
- **The guard** against main, the default, cover and crops views, summer, autumn and winter: exit 0 each.
- **`tools/check-negatives.mjs`:** exit 0 (the river check on the real scene passes, its far items' footprint
  unchanged). **`tools/macro-check.mjs`:** exit 0.
- **The goldens** against main: start, the yaws, close, river and winter identical; wide (11 of 16 regions) and
  far-edge (15 of 16) differ: the far ring, the expected change.
- **`npm test`:** 255 of 256 under a load of 13 to 16; the one failure was the sim's timing budget
  (`test/soldiers.test.ts`, 16.3 ms against 12), which passes alone (exit 0, 12 tests). **`node tools/check-docs.mjs`:**
  exit 0.
