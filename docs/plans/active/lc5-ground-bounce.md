---
status: active
last_reviewed: 2026-10-16
---

# Plan: LC5, bounced light on the ground

Track E's LC5 (`docs/plans/active/track-e-look.md`, the colour and light rows). The owner's review (2026-10-13): "a
blue coat in an orange light has an orange tilt"; for subtle shadows, light bounced off what is around. LC4
(`docs/plans/done/lc4-bounce.md`) lit units and crowns from the ground under them. The ground itself still shades
every shadow with one shadow colour (`shadowOf`), whatever lies around it: a crown's shadow on a sunlit wheat field is
the same cool as one in a wood.

## Scope

- **The bounce map:** a coarse RGB render target over the tile (512 texels a side, about 1.6 m a texel; 1 MB),
  rendered top-down after the light map with the light map's camera: at each texel the light the ground there sends
  back, as LC4's `bounceAt` (its class colour through the season and the earth, white where snow lies, times the
  sun's colour and the light map's sun, a third of it in shadow), gathered over a Gaussian (as built: 7 by 7 taps
  2.7 m apart, sigma 4.5 m, in the bake's own fragment: no blur passes), so a point takes the light of the ground
  around it.
- **Baked on load and again when the season is released** (the slider's `change`), and whenever the light map is
  rebaked (its own observer). Light, not colour: the macro colour's bake is unchanged.
- **The ground reads it** (`#define GROUND_BOUNCE`, the tile's and the hill's terrain materials; not the far ring,
  which the light map does not cover): in paint(), in its cast shadows (as built: the shadow and mid bands at first
  lit the hill's whole shaded slope and flattened it), `alb × bounce × the mood's groundBounce × the cast shadow ×
  occ`, the sun's band left to the sun, a third of it on snow (at full strength the snow's white washed its blue
  shadows out). The mood's `groundBounce` starts at 0.5 and is tuned by
  pairs; `?gbounce=<0..2>` sets it on load (0: off, for the A/B).
- Docs: `docs/systems/look.md`, the track plan's LC5 row, the art bible's light section if the owner accepts the look
  (a decision record if it changes a rule).

## Acceptance

- Pairs (on and off, summer, autumn and winter, the default and the close views): a shadow on a sunlit field takes
  the field's colour; a wood's floor stays dark (its neighbours are in shadow too). The owner judges.
- The bake's time (on load, and a season change) and memory measured.
- The frame's cost (`tools/bench-look.mjs`), the guard against main (the default, cover and crops views, three
  seasons), `tools/coat-check.mjs`, `tools/macro-check.mjs`, `tools/check-negatives.mjs`: exit 0 or the differences
  recorded for the owner.
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at acefd2c. Every run's exit code. Pairs in `scratch/compare/lc5/` (not committed).

- **The look** (the start and close views; summer, late autumn and winter; `?gbounce=0` against the default 0.5): a
  crown's shadow on the meadow takes a green-olive fill, deepest at its middle, where the ground around is also in
  shadow; the hill's shaded slope is unchanged (cast shadows only); on snow the shadows stay blue, a little lifted. The
  owner judges by eye: `?gbounce=0` against the default.
- **The bake:** the map's mean texel goes from (114, 110, 66) in summer to (184, 186, 189) once the slider is released
  in winter: it rebakes. Its time, a frame with it against one without, each waited on by reading the map back
  (`__look.gbBakeMs`), Metal: 14.4 against 7.1 ms, about 7 ms a bake; SwiftShader 2463 against 1416 ms. No rebake
  in 120 still frames. Memory: 512 × 512 RGBA8, 1 MB.
- **The frame's cost** (`tools/bench-look.mjs`, Metal, the l2 arm's GPU frame median over the three yaws, `?gbounce=0`
  against the default on this branch, interleaved, twice, a load average of 6 to 12): default 8.59 / 8.62 and 8.67 /
  8.90 ms, widest 13.55 / 13.57 and 14.21 / 14.05, close 6.60 / 6.59 and 6.58 / 6.70: within the runs' spread (-0.16 to
  +0.23 ms). A first bench against main ran under heavy contention (every pass, the scatter's and the water's too,
  20 to 70 % slower in both of the branch's runs) and is not used.
- **The goldens:** `?gbounce=0` against main: match, every view (the off arm is the frame without LC5). The default
  against main: every view differs (the shadows), the expected change.
- **The guard** against main, the default, cover and crops views, summer, autumn and winter: exit 0 each.
  **`tools/coat-check.mjs`:** exit 0. **`tools/check-negatives.mjs`:** exit 0. **`tools/macro-check.mjs`:** exit 0.
- **`npm test`:** 255 of 256 at a load of 16 (the sim's timing budget, `test/soldiers.test.ts`, 12.19 ms against 12).
