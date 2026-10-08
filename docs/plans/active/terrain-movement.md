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

- The thicket test scales as the research's does: more time lost as more of the front is held up;
  the full front within 20% of the strip's own physical delay; one file costs at most 1.5 s with the
  research's tolerances; looser tolerances never cost more; the mean lag never passes Lmean and no
  file passes Lmax. (Revised after review round 1: the research's own figures came from an
  approximation; see Results.)
- A line ordered across the stream away from the ford stops at the bank, without any man's place in
  deep water on the way; a march column stopped there stays a column; a wheel stops short of the
  water; a shape that would stand in it is refused. Through the ford it slows; over the bridge it
  narrows to a march column and re-forms.
- Depth-ordered shapes (columns, the square) never walk through their own companies.
- With the Speed overlay on, slow ground and the line's bulge around it are visible.
- All existing formation checks still pass; `node tools/check-docs.mjs` passes.

## Results (headless, `tools/formation-measure.js`, after review round 2)

- **Partial bad ground** (a line marches 60 m; a strip of woods exactly 10 m deep, g = 0.55, q = 1,
  covers the files of n of its 12 sample points; time lost against the same march without it):

  | Tolerances | 1/12 | 3/12 | 6/12 | 12/12 |
  |---|---|---|---|---|
  | Research's (Lmax 10 m, Lmean 2 m) | 0 s | 0.5 s | 4.6 s | 9.0 s |
  | Normal (4 m, 1.5 m) | 4.6 s | 4.7 s | 5.7 s | 9.0 s |
  | Keep order (1.5 m, 0.5 m) | 7.4 s | 7.5 s | 7.9 s | 9.0 s |

  The full front cannot avoid the strip: 10 m at 0.495 m/s against 10 m at 0.9 m/s is 9.1 s, and the
  model gives 9.0 s. Part of the front costs less; one file almost nothing with wide tolerances, and
  nearly the whole strip with "keep order" (the slowest file sets the pace, as drilled). Counting
  until every file is back in its place, the research's tolerances cost 0.6 / 0.8 / 4.6 / 9.0 s
  (the files left behind re-dress after arrival); the other rows do not change. Through every run
  the mean lag stays at or under Lmean and no file passes Lmax.
  **Departure from the research:** its table (0.5 / 2.2 / 6.3 / 10.5 s) came from an approximation of
  the mean-lag limit that ignores files already catching up, which over-slows the battalion. The
  engine solves the limit exactly (`n·V − Σ min(cap, V + l/τ) ≤ n (Lmean − l̄)/τ`, one pass over the
  sorted breakpoints), so with 3 of 12 points held the mean lag sits at Lmean and costs 0.5 s.
- **Deep water**, crossed obliquely and along the whole front: the battalion stops, reports "halted:
  impassable ground", dresses back from the edge; no man's place is in deep water at any point on
  the way (a man stops 0.5 m short of it). A march column stopped there keeps its companies 6.85 m
  apart along its trail, all facing on. A wheel toward the stream stops short of it; a square that
  would stand in it is refused ("cannot form: impassable ground").
- **Casualties:** a bin emptied by casualties takes no part in the limits; a line wholly in woods
  then keeps every file in place (lag 0, disorder 0; it was 1.6 m and 0.6 before).
- **Bridge:** the deck is level for a column (g = 1 along it); narrow, cross the 4 m bridge, deploy
  beyond: 196 s, mostly the two formation changes.
- **Accordion**, from the shape's geometry (a bin wholly behind another and overlapping it across the
  line of travel stays at least 0.6 m behind it): a march column whose head is held up at a hedge
  bunches from 1.65 m to 0.6 m between companies, never closer; a square pushing into the wood keeps
  0.68 m between faces (0.98 m at rest; it fell to 0.13 m before).
- **Earlier checks** still pass; the march column's turn is back to 1.2 m worst distance from slot.
- **Negative runs:** the round-0 code fails deep water along the whole front (stuck, men in the
  water), the bridge deck (g = 0.06) and the accordion (0.00 m). With the round-2 fixes disabled
  (look-ahead, trail trim, wheel check, empty bins, accordion) the checks fail on each: 36 and 27
  places in deep water on the way, the column folded (2.72 m gap, head facing 0), the wheel 63 places
  in the water, the emptied bin 1.64 m lag and 0.72 disorder, the column 0.00 m, the square 0.13 m.
- **Cost, 40 battalions:** simulation 1.7 ms per frame, drawing 0.9 ms.

## Review round 1

10 findings, 3 severe → another round.

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | Whole front at deep water: stuck for ever (the halt test watched V, not the anchor) | Halt when the anchor stops advancing; then dress back from the edge |
| 2 | severe | Lagging files read the ground at their slot, not where their men stand | Ground sampled at slot − lag along the direction of travel |
| 3 | severe | Bridge deck took the stream valley's slope | Deck cells are level |
| 4 | moderate | Lag offsets and bins followed company facing (a moving square's rear face drawn inside it) | Offsets along the direction of travel; bins across it |
| 5 | moderate | Columns walked through their own companies | Accordion: a company's lag ≥ the lag of the one ahead minus the room between them (ruleset data; replaced by geometry in round 2) |
| 6 | moderate | Lags and disorder never recovered at impassable ground; frozen in wheels; stale through changes | Settle during wheels and changes, skip blocked bins, reset lags when a change starts |
| 7 | moderate | Checks did not test the claims; no negative tests | Exact strip, bin-aligned shares, 0.1 s steps, whole-front water, men-in-water, level deck, accordion; negative run above |
| 8 | moderate | The core named paces and formations; route step on all ground; q not per pace | Formations, paces, road pace, q per pace and the accordion in the ruleset; route step only on roads |
| 9 | light | Mean-lag limit approximated in three passes | Exact one-pass solve |
| 10 | light | `Math.exp` and allocations per sample | Slope table; preallocated arrays |

## Review round 2

10 findings, 1 severe → round 3 (the last before a redesign).

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | A march column halted at deep water folded on itself (head stepped back, trail did not) | The trail ahead of the head is dropped as it steps back; check: gaps and facings after the halt |
| 2 | moderate | A bin emptied by casualties pinned the renormalisation and the mean: a line wholly in woods drifted out of order | Empty bins take no part in the limits, the renormalisation, the accordion or disorder |
| 3 | moderate | Men's places entered deep water during the approach; only the end state was checked | A bin is held when any man has impassable ground 0.5 m ahead; places checked every 0.5 s on the way |
| 4 | moderate | Wheels and shape changes ignored impassable ground; settling used stale ground | A wheel stops short; a shape that would stand on it is refused; settling resamples the ground |
| 5 | moderate | No accordion for the square; the accordion was a chain only | Accordion pairs from the shape's geometry for every shape; the ruleset's ahead/room removed |
| 6 | moderate | Checks did not assert the exact solve, the orderings or that the accordion engaged; Acceptance stale | Lmean/Lmax asserted every step, tolerances ordered, keep-order bound, accordion against rest, Acceptance revised |
| 7 | light | Time lost ignored the re-dress after arrival | Both reported (arrived, dressed); halted files walk to their places at their ground's pace |
| 8 | light | The accordion acts after the solve, so it can push a lag past Lmean or Lmax for a tick | Not fixed: within 0.01 m in every check; folding it into the solve waits for a measured need |
| 9 | light | The core named 'march' and 'open' | Trail shapes are ruleset data (`trail`); empty bins need no q; turning half-width from the layout |
| 10 | light | Route step chosen by the head alone | Route step only while every company is on a road |
