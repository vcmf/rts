---
status: done
last_reviewed: 2026-10-15
---

# Plan: generated trees by default on the look page

The owner (2026-10-15): "update the demo map and only use generated trees to replace tree assets". The look page drew
the pack's trees unless the URL asked for `?trees=gen,cards` (decision 0031, the generated trees, accepted).

## Scope

- The look page's default: `?trees=gen,cards` when no `?trees` is given. `?trees=pack` gives the pack's trees, for
  comparison and for the checks that need them. The other values (`one`, `cards`, `gen`) are unchanged.
- The checks and tools that open the page without `?trees` now see the generated trees. The ones that compare with
  main compare like with like, once main has this.
- Docs: `docs/systems/look.md`, the art bible's tree line if it names the pack.

## Acceptance

- The page with no `?trees` draws the generated trees with leaf-card crowns; `?trees=pack` draws the pack's.
- `tools/guard.mjs --base` main, with main at `?trees=gen,cards` (like with like), start, cover and crops, three
  seasons: no new failure. `tools/coat-check.mjs`. `tools/river-check.js` with no `?trees`.
- The goldens: they change (the trees), recorded.
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at 92b44b1. Every run's exit code.

- **The page:** no `?trees` draws the generated trees with leaf-card crowns; `?trees=pack` draws the pack's; a bad
  value throws.
- **The guard** (exit 0 at each view), against main at `?trees=gen,cards` (like with like), start, cover and crops,
  three seasons: ok. **The coat check:** exit 0.
- **The river check** with no `?trees`: exit 0 after review round 1, which counts the generated willows and alders for
  the pack's willows (23, at least 12) and the generated trees in the population (218).
- **`tools/water-look-check.mjs`:** exit 0, every check. **`tools/check-negatives.mjs`:** exit 0, every check passes
  the scene and catches its sabotage. Both pin the pack's trees on the look page unless the URL names a set: the
  generated woods overhang the river (the render check saw 78 % of the river points at the mid view, against 80 %)
  and shade the bank's meadow samples (the bar's grey margin 0.016, against 0.03). These checks were tuned without
  them and measure the water, not the trees.
- **`tools/macro-check.mjs`:** exit 0. **`tools/detail-check.mjs`:** exit 0.
- **The goldens** (main's default, the pack's trees, against the new default) differ where trees stand: 4 to 13 of
  16 regions a view. This is the expected change.
- **`npm test`:** exit 0, 256 tests.

## Review

- **Round 1** (severe):
  - **The river check's counts** were keyed by the drawn model (0 willows, 3 trees). It now counts the generated
    species.
  - **The negatives' tree sabotage** named `CommonTree_1`.
  - **`?bench=trees`** now asks for `?trees=cards` (its arms compare the pack's crowns).
  - The validation is simplified, the card options' errors are clearer, and the stale docs are fixed (`docs/systems/look.md`, the
    art bible's winter row, main.ts's comment).
  - **Follow-ups:** #96 (the trees grow on every load, about 0.46 s: bake them offline), #97 (the far woods and
    hedgerows are still the pack's bushes).
