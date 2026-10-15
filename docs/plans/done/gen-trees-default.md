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

Main at 92b44b1.

- **The page:** no `?trees` draws the generated trees with leaf-card crowns; `?trees=pack` the pack's; a bad value
  throws.
- **The guard** against main at `?trees=gen,cards` (like with like), start, cover and crops, three seasons: ok.
- **The coat check:** ok. **The river check** with no `?trees`: no instance over the water or in the zones, no crops
  on the floodplain, 463 crop clumps in the scene's field.
- **The goldens** (main's default, the pack's trees, against the new default) differ where trees stand: 4 to 13 of 16
  regions a view. This is the expected change.
- **`npm test`:** the soldier timing budget alone under load; alone it passes (12 of 12).
