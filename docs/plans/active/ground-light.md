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
- **A little softer band edges** on the ground (the minimum width from 0.08 up), so the cast shadows' edges stay
  painted but nothing snaps.

## Acceptance

- Pairs at the default view, a low oblique view, the wide view, in summer and winter: the dark islands gone, the cast
  shadows' shapes kept, cloud shadows soft.
- `tools/guard.mjs --base` main, the views start, cover and crops, summer, autumn and winter: no new failure (the
  ground's values move under the coats).
- `tools/coat-check.mjs` passes.
- The goldens: they change on the ground (expected); the change written down by view.
- The frame's cost: the bench at the three zooms against main (fewer instructions expected).
- `npm test`, `node tools/check-docs.mjs`; `docs/systems/look.md` updated.

## Results

(filled in before merge)
