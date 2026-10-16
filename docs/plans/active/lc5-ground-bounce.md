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
  sun's colour and the light map's sun, a third of it in shadow). Then blurred (two Gaussian passes, about 8 m), so a
  point takes the light of the ground around it.
- **Baked on load and again when the season is released** (the slider's `change`), and whenever the light map is
  rebaked (its own observer). Light, not colour: the macro colour's bake is unchanged.
- **The ground reads it** (`#define GROUND_BOUNCE`, the tile's and the hill's terrain materials; not the far ring,
  which the light map does not cover): in paint(), in the shadow and mid bands as LC4's bounce, `alb × bounce × the
  mood's groundBounce × occ`, the sun's band left to the sun. The mood's `groundBounce` starts at 0.5 and is tuned by
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
