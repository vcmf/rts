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
