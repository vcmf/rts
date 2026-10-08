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

## Results (headless, `tools/formation-measure.js`)

- **Partial bad ground** (a line marches 60 m; a 10 m strip of woods, g = 0.55 for a line, crosses n
  of its 12 sample points; time lost against the same march without the strip):

  | Order style | 1/12 | 3/12 | 6/12 | 12/12 |
  |---|---|---|---|---|
  | Normal (Lmax 4 m, Lmean 1.5 m) | 0.5 s | 2.5 s | 4.5 s | 10 s |
  | Keep order (1.5 m, 0.5 m) | 4.5 s | 7.5 s | 8.5 s | 10 s |

  The research's simulation gave 0.5 / 2.2 / 6.3 / 10.5 s for its middle tolerances: same scaling.
  The check fails if the delay does not grow with the share held up.
- **Deep water:** a line ordered straight across the stream stops at the bank (x 60.8 against the
  bank at 60.3) and reports "halted: impassable ground".
- **Bridge:** narrows to a march column, crosses the 4 m bridge, deploys into line beyond: 177 s.
- **Visible:** with "Push on", a company held up in the strip falls 3.8 m behind the line and catches
  up after it (screenshot in the PR); the speed overlay tints slow ground and marks deep water.
- **Existing checks** still pass (rest in the wood at six points, slot table, square faces). The march
  column's worst distance from slot rose to 4.6 m: its path now crosses a hedge, and the files that
  meet it fall back about 3.5 m (the "fall back by sections" behaviour).
- **Cost, 40 battalions:** simulation 1.8 ms per frame (sampling 108 ground points per battalion per
  tick), drawing 0.85 ms.
