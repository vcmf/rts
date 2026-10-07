# W1b: River width variation

Follow-up to W1 (`plans/w1-river-shape.md`). Owner feedback on the merged prototype: "the width of
the river is still the same everywhere".

## Problem

In-tile widths: 5th–95th percentile 5.1–6.8 m, half of the river within 5.5–6.3 m (±7%). At the
default zoom that is about 2 px, so the river reads as constant. The rule clamps to 5–8 m and varies
only by a mild bend narrowing (−20%) and small fast noise.

## Change (scope: width only)

- **Width rule** (`painted-cinematic.html`, river attributes):
  - each stretch of 2–3 bends gets its own width scale (slow noise, ±25%);
  - bends narrow by up to 40%;
  - straight riffle stretches widen by up to 35% (riffles are wide and shallow);
  - clamp 4–11 m. The riffle phase is measured in `W0` units (it no longer depends on `W`).
- **Art bible** (`design.md` §6c): width 4–11 m, with the three rules above.
- **Checks** (`tools/river-check.js`): `widthRange` 4–11 m; new `widthContrast`: in the tile, the
  95th percentile width is at least 1.8× the 5th; `bendNarrowerThanReach` kept.

Out of scope: banks, point bars and depth (W2).

## Acceptance

- `widthContrast` ≥ 1.8 (experiment: 4.1 → 9.0 m, 2.2×); every existing check still passes.
- Screenshots (top and mid views, before/after) show visibly different widths between stretches.
- Load time within noise of main.

## Review round 1 — stop (no severe findings)

10 findings, none severe. Fixed:
- Width jumped up to 1.3 m between samples (stronger bend term, no smoothing): width smoothed over ~2 W;
  new check `maxWidthStep` < 0.25 m/m (now 0.19).
- `widthContrast` passed even with the per-stretch noise removed (bend/straight alternation alone): replaced
  by `stretchContrast`, widths averaged over one bend wavelength, widest ≥ 1.7× narrowest (now 4.7 → 8.5 m,
  1.8×). Negative run with the per-stretch noise off: 1.36×, fails.
- Riffle spacing in local widths (~6 W) instead of a fixed 36 m.
- Soft limits at 4 and 11 m (no flat 4 m plateaus); per-stretch noise on its own noise row.
- AO grid cells 2.7 m (finer than the narrowest channel); water-ribbon margin derived from the max width.
- Empty-tile guard in the check.
Kept: bend spacing in `W0` units (the centre line is built before widths); `widthRange` asserts the clamp only;
`REACH` tied to the max width (pre-existing).

Results: river-check and render-check exit 0. Load time ≈ +130 ms vs main (4 paired runs; the finer AO grid).
