---
status: active
last_reviewed: 2026-10-15
---

# Plan: the temperate mood's two leftovers (#88)

The temperate mood (decision 0033, #87) left two checks failing on main (#88): the water's shimmer at the widest view
and the macro colour's road|grass contrast.

## Scope

- **The shimmer:** measured, then the owner's call.
- **The road:** its colour, so it reads against the meadow again.
- Not in scope: the far view's simplification (L9), the look of the mood.

## Approach and findings

- **The shimmer at the widest view near the river.** Temperate measures 3.78 % against the 3.5 % limit; golden 2.93
  on the same build.
  - **Not from one source.** Switched off one at a time, the grain gives 3.58, the painted edges 3.60, the bloom
    3.72 and the clouds 3.80. The meadow's blades are off by little: 3.61 with `?meadow=off`.
  - **The frame's contrast.** Temperate's frame is about 7 % more contrasty than golden's (luma stddev 32.6
    against 30.5) and 5 % brighter. With the check's threshold scaled by that (8.55/255), temperate measures 3.31.
  - **The owner's call** (2026-10-15): keep the look and re-baseline. Main measured 3.68 to 3.84 % in summer, 4.11 %
    in autumn (after #90's straw turn, which my #90 report missed) and 11.03 to 11.4 % in winter. The limits sit a
    run's spread above them: 4.0, 4.4 and 11.8 %. A later regression is still caught.
- **The road and the track.** The earth shift greys the meadow toward both: road|grass fell to ΔE2000 6.6 and
  track|grass to 7.7 against 8 (the check pooled them; it now gates each). A bluer road, tried first, reached 8.5 but
  sat on the French coat's hue (221° against 223°: review round 1); a slate road at low chroma stayed at 6.6, a darker
  one reached 8.0 but crowded the dark coats' value. The road is now a pale cool grey dust, lighter than the meadow and
  well under the Austrian white: 11.1 (golden 10.9). The track is a warm brown-grey earth: 9.1 (golden 9.6). On the
  road the Austrian white separates by 0.149 (main 0.275), the dark coats far better (French 0.30 against 0.20).

## Acceptance

- `tools/macro-check.mjs`: road|grass and track|grass at least 8 each, under temperate and golden; the rest as on main.
- `tools/water-look-check.mjs`: all pass.
- `tools/guard.mjs --base` main, start, cover (the road spot) and crops, three seasons: no new failure.
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at 64715e3.

- **`tools/macro-check.mjs`:** ok under temperate (field|grass 9.6, road|grass 11.1, track|grass 9.1) and golden (11.5,
  10.9, 9.6); the fields' shimmer, determinism and bake ok.
- **`tools/water-look-check.mjs`:** ok on every check. The widest shimmer is 3.78 % in summer, 4.11 % in autumn and
  11.03 % in winter, against the limits 4.0, 4.4 and 11.8.
- **The guard** against main, start, cover and crops, three seasons: ok. The road's spot is also ok under golden.
- **The coat check:** ok. **`npm test`:** exit 0, 256 tests.

## Review

- **Round 1** (severe): the bluer road sat on the French coat's hue. It is now a pale cool grey; the track is apart;
  the limits have headroom; the check's header and the docs are fixed.
