---
status: active
last_reviewed: 2026-10-14
---

# Plan: the light on the ground (no dark spots)

Track E, the ground's refinement (the owner, 2026-10-14), its first PR of three: the light on the ground; then bare
earth and the autumn turn; then the default map (a large wheat field, ploughed land, bare earth). The owner's
screenshots show the meadow covered in small dark blotches, near black under the cloud shadows, "always there"
without them.

## The cause (measured)

`paint()` (`src/look/shaders/painter.glsl`) gives the ground three flat bands (shadow, mid, lit) with hard edges, and
chooses the band from the light **plus** the paint grain (`gr*0.55`, about ±0.13) and its 21 m blotches
(`(blot-0.5)*0.3`, ±0.15). Wherever the light sits near a band edge, the grain pushes patches across it, and each
becomes a hard-edged island of the darker band. A cloud shadow (`cloud()*0.40` taken off the light) puts the flat
ground 0.11 above the shadow band's edge: the islands turn near black. Toggled one at a time at the default view and a
low oblique one: the spots go with the clouds off (the dark ones) and with the grain off (all), not with the shadows,
the baked occlusion, the meadow's brush or the grass blades off.

## Scope

The terrain's materials (`DETAIL_ON` in the painter: the terrain, the shore's land), and the cloud on the meadow's
blades (a shade, as on the ground under them). Trees, buildings and units keep their bands (their grain-broken edges
are the painted look on a form); they share `cloud()`'s softer, graded edge.

## Approach

- **The band follows the light, not the grain.** On the ground the band is chosen from the real light (the sun's
  angle, the cast shadow, the baked occlusion) with only a small grain wobble at its edge (painted edges, not
  islands); the grain and its blotches vary the value within a band (as `c*=1.0+gr*0.38` does already).
- **Soft cloud shadows.** On the ground a cloud no longer drops the light into a darker band: it darkens and cools
  the painted colour, a broad soft shape (as a cloud's shadow on a landscape), deepening from its edge to its middle.
  On snow the shade is a deeper blue: a white coat reads there by that contrast.
- **A near-white coat takes a fifth of the sun's hue** (the units' `KEEP_HUE` path, `wb`): with the cloud's graded
  edge, the coat check's middle spot came out of a cloud's edge into full sun, and its Austrian white turned cream
  (236, 220, 183). The eye balances on the brightest neutral, so a white takes less of the light's colour than a
  coloured coat (the share stays the mood's `units.tint`, decision 0027). Found first on the LC2 branch.
- **One cloud shade for every material** (review round 1): trees, buildings and the meadow's blades take the
  ground's `cloudShade` too, so nothing under a cloud reads as a darker cut-out on softly shaded ground, nor breaks
  into islands on the graded edge. Units keep the cloud's band drop: a coat reads on bright ground under a cloud by
  that contrast (with the shade, the winter British red on the meadow fell to 0.087, main 0.209). The meadow's band
  edges match the ground's new width, and its blades take the snowed ground's shade in winter.
- **A little softer band edges** on the ground (the minimum width from 0.08 up), so the cast shadows' edges stay
  painted but nothing snaps.

## Acceptance

- Pairs at the default view, a low oblique view, the wide view, in summer and winter: the dark islands gone, the cast
  shadows' shapes kept, cloud shadows soft.
- `tools/guard.mjs --base` main, the views start, cover and crops, summer, autumn and winter: no new failure (the
  ground's values move under the coats).
- `tools/coat-check.mjs` passes. A white is judged by its chroma, not its HLS saturation, which rises with lightness
  alone near white (a white at its painted colour, (233, 227, 209), measured more saturated).
- The goldens: they change on the ground (expected); the change written down by view.
- The frame's cost: the bench at the three zooms against main (fewer instructions expected).
- `npm test`, `node tools/check-docs.mjs`; `docs/systems/look.md` updated.

## Results

Main at 2856dae, the look page with `?trees=gen,cards` where shot. Sheets in `scratch/compare/ground-light/`
(git-ignored).

- **The look:** the dark islands gone at the default, low and wide views; cloud shadows soft, deepening to their
  middle, the cast shadows' shapes kept. The owner chose this soft version over two sharper trials (a contrast curve on
  the grain, rejected: "worse than before"; a dirt texture as the grain, which averages away at this scale).
- **The guard** against main, start, cover and crops, summer, autumn and winter: ok, 132 blocks, none that separates
  on main fails. 85 separate better, 47 less, the most a French block on winter snow (0.334 against 0.518, three times
  the bound). One block failing on main now separates (the British red in a summer cloud shadow, 0.130 against 0.091).
  The tightest: the white and the red on the winter meadow and in its cloud (0.103 to 0.108).
- **The coat check:** 8 of 8.
- **The goldens:** they differ at the 8 views (16 of 16 regions each, the ground everywhere), expected.
- **The frame's cost** (`tools/bench-look.mjs`, the GPU frame's median, Metal; main twice, the branch once): the same
  or a little less at every camera, -0.01 to -0.13 ms, within main's own spread between its two runs (up to 0.13).
- **`npm test`:** exit 0, 256 tests.
