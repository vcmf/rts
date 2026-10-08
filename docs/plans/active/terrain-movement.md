---
status: active
last_reviewed: 2026-10-08
---

# Plan: Movement over terrain (F1)

How fast a formation moves over slopes, water, rough ground, roads and narrow passes, including
when only part of it is on bad ground. Source: `docs/research/terrain-movement-speed-models.md`
(the lag model and its three fixes, §4; flows, §5; the generic mechanics and the Napoleonic ruleset,
§6). Era-generic by decision 0015: the engine holds the mechanics, an era ruleset holds the numbers.
Builds on `prototypes/formation-core.js` and `prototypes/formation-map.html` (F0, merged).

## Scope

- **Era ruleset as data:** `prototypes/ruleset-napoleonic.js` (plain script): base speeds per pace,
  the quick-step factor q per ground class, slope constant k, the terrain table g (per terrain and
  formation: line, column, skirmish), water curve and depth limit, the order presets (L_max, L_mean,
  τ), disorder constants. The core reads only the ruleset, never names an era.
- **Terrain classes on the map** (a 1 m class grid, baked once): open, road, crops, ploughed, rough
  (around rocks, rocky summits), open woods, dense woods (core of the wood), marsh, hedge strips (with
  a gap), water (depth from the stream: a knee-deep ford, deep elsewhere), a 4 m bridge.
- **Lag model in the formation layer (20 Hz), generic:**
  - 12 sample points per battalion: 3 lateral bins per company; each bin's g is the harmonic mean of
    the ground under its slots (so a column's depth counts), with slope along the direction of
    travel (Tobler, capped at drill pace) and water depth folded in;
  - q per bin from its worst ground class (open / light rough / hard);
  - V = min(V0, max-lag limit, mean-lag limit); lags renormalised to the leading point each tick;
    V ≥ 0; deep water (g = 0) stops the battalion at the bank (order cancelled after a few seconds);
  - three order presets: keep order, normal, push on;
  - disorder accrues from lag spread and recovers when dressed (shown, not yet used).
- **Soldiers:** each soldier's slot is set back by his bin's lag, so the line visibly bows around a
  wood and straightens; soldiers' own speed uses the same terrain table.
- **Map:** terrain drawn in the staff style (crop stipple, plough lines, marsh tufts, dense-wood wash,
  hedges, the bridge); a **Speed** overlay colouring the ground by g for a line; readout of lags and
  disorder; order presets in the panel; "Cross bridge" order.
- **Measurements** in `tools/formation-measure.js`: time lost when 1, 3, 6 and 12 of 12 points cross a
  10 m thicket (the research's table); halting at deep water; crossing the bridge; no regression of
  the existing checks.

Out of scope: queues of several units at one bridge (flow limit J; needs more than one battalion
moving through), cavalry and artillery rulesets, pathfinding around terrain, disorder's effect on
fire and morale.

## Acceptance

- The thicket test reproduces the research's scaling (more time lost as more of the front is held
  up; about 0.5 s at 1/12 and about 10 s at 12/12 with keep-order-like tolerances), within ±30%.
- A line ordered across the stream away from the ford stops at the bank; through the ford it slows;
  over the bridge it narrows to a march column and re-forms.
- With the Speed overlay on, slow ground and the line's bulge around it are visible.
- All existing formation checks still pass; `node tools/check-docs.mjs` passes.

## Results (headless, `tools/formation-measure.js`, after review round 1)

- **Partial bad ground** (a line marches 60 m; a strip of woods exactly 10 m deep, g = 0.55, q = 1,
  covers the files of n of its 12 sample points; time lost against the same march without it):

  | Tolerances | 1/12 | 3/12 | 6/12 | 12/12 |
  |---|---|---|---|---|
  | Research's (Lmax 10 m, Lmean 2 m) | 0 s | 0.5 s | 4.6 s | 9.0 s |
  | Normal (4 m, 1.5 m) | 4.6 s | 4.7 s | 5.7 s | 9.0 s |
  | Keep order (1.5 m, 0.5 m) | 7.4 s | 7.5 s | 7.9 s | 9.0 s |

  The full front cannot avoid the strip: 10 m at 0.495 m/s against 10 m at 0.9 m/s is 9.1 s, and the
  model gives 9.0 s. Part of the front costs less; one file almost nothing with wide tolerances, and
  nearly the whole strip with "keep order" (the slowest file sets the pace, as drilled).
  **Departure from the research:** its table (0.5 / 2.2 / 6.3 / 10.5 s) came from an approximation of
  the mean-lag limit that ignores files already catching up, which over-slows the battalion. The
  engine solves the limit exactly (`n·V − Σ min(cap, V + l/τ) ≤ n (Lmean − l̄)/τ`, one pass over the
  sorted breakpoints), so with 3 of 12 points held the mean lag sits at Lmean and costs 0.5 s.
- **Deep water**, crossed obliquely and along the whole front: the battalion stops, reports "halted:
  impassable ground", dresses back from the edge; no man stands in deep water.
- **Bridge:** the deck is level for a column (g = 1 along it); narrow, cross the 4 m bridge, deploy
  beyond: 198.5 s, mostly the two formation changes.
- **Accordion:** a march column whose head is held up at a hedge bunches up; its companies' places
  never come closer than 1.15 m (they used to pass through each other).
- **Earlier checks** still pass; the march column's turn is back to 1.2 m worst distance from slot.
- **Negative run** with the round-0 code: fails deep water along the whole front (stuck, men in the
  water), the bridge deck (g = 0.06) and the accordion (0.00 m).
- **Cost, 40 battalions:** simulation 1.8 ms per frame, drawing 0.9 ms.

## Review round 1

10 findings, 3 severe → another round.

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | Whole front at deep water: stuck for ever (the halt test watched V, not the anchor) | Halt when the anchor stops advancing; then dress back from the edge |
| 2 | severe | Lagging files read the ground at their slot, not where their men stand | Ground sampled at slot − lag along the direction of travel |
| 3 | severe | Bridge deck took the stream valley's slope | Deck cells are level |
| 4 | moderate | Lag offsets and bins followed company facing (a moving square's rear face drawn inside it) | Offsets along the direction of travel; bins across it |
| 5 | moderate | Columns walked through their own companies | Accordion: a company's lag ≥ the lag of the one ahead minus the room between them (ruleset data) |
| 6 | moderate | Lags and disorder never recovered at impassable ground; frozen in wheels; stale through changes | Settle during wheels and changes, skip blocked bins, reset lags when a change starts |
| 7 | moderate | Checks did not test the claims; no negative tests | Exact strip, bin-aligned shares, 0.1 s steps, whole-front water, men-in-water, level deck, accordion; negative run above |
| 8 | moderate | The core named paces and formations; route step on all ground; q not per pace | Formations, paces, road pace, q per pace and the accordion in the ruleset; route step only on roads |
| 9 | light | Mean-lag limit approximated in three passes | Exact one-pass solve |
| 10 | light | `Math.exp` and allocations per sample | Slope table; preallocated arrays |
