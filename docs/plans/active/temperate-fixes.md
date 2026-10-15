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
  - **The owner's call** (2026-10-15): keep the look and re-baseline. The widest limits are now 3.9 % in summer and
    (main 3.68 to 3.84) and 11.5 % in winter (main 11.1 to 11.4). A later regression is still caught.
  - **Autumn** measured 4.11 % on main after #90 (the stronger autumn turn to straw; my #90 report missed it, the
    check already failing in summer then): its own limit, 4.2 %, under the same call.
- **The road.** The earth shift greys the meadow toward the road's cool grey, so road|grass fell to ΔE2000 6.7
  against 8. The road is now a bluer grey dust, (0.40, 0.45, 0.56) to (0.46, 0.51, 0.62), so it reads by hue.

## Acceptance

- `tools/macro-check.mjs`: road|grass at least 8; the rest as on main.
- `tools/water-look-check.mjs`: all pass.
- `tools/guard.mjs --base` main, start, cover (the road spot) and crops, three seasons: no new failure.
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at 64715e3.

- **`tools/macro-check.mjs`:** ok. road|grass 8.5 (main 6.7), field|grass 9.6; shimmer, determinism and bake ok.
- **`tools/water-look-check.mjs`:** ok on every check, at the re-baselined limits (summer 3.78 %, autumn 4.11 %,
  winter 11.03 %, the same as main's).
- **The guard** against main, start, cover and crops, three seasons: ok, with the road's spot at cover.
- **The coat check:** ok.
- **`npm test`:** exit 1 on a sim timing budget alone under load (`test/formations.test.ts`); run alone, it passes.
