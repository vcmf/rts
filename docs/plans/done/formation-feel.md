---
status: done
last_reviewed: 2026-10-08
---

# Plan: Formation feel prototype (F0)

A feel prototype, like the staff map's SM0: does a battalion of 100 soldiers move like a battalion,
not a rigid block and not a swarm? It tests the look and the per-soldier cost before any simulation
code exists. Sources: `docs/research/formation-movement-and-doc-systems.md` §1–§4 (shipped games,
techniques, historical drill, the recommended two-layer architecture), decisions 0007 (battalions of
about 100, one figure per soldier) and 0005 (sim/render split).

## Questions it must answer

1. Does the two-layer split work: a formation layer at 20 Hz (anchor, companies, slots, timed
   changes) and a per-soldier layer at frame rate (each soldier chasing his slot)?
2. Do formation changes read as **drill** (companies wheeling and filing in sequence) rather than a
   swarm?
3. Do rough ground and obstacles (a wood, a ford) make the line ragged and re-form without looking
   broken?
4. What does the per-soldier layer cost at the full battle size (40 battalions, 4,000 soldiers)?

## Scope

**Redirected by the owner (2026-10-08):** no 3D for this test (placeholder figures looked worse than
helpful). The formation logic is drawn on a **2D staff-style map** instead, which is simpler to read,
to verify and to benchmark. The first 3D version and its two review rounds shaped the logic below.

- `prototypes/formation-core.js` (plain script, no rendering): terrain data, the formation layer and
  the soldier layer.
  - **Terrain:** four hills, a stream with one ford, a road, a wood (trees as obstacles), rocks
    (obstacles). Heights are sampled once into a 1 m grid (decision 0012); slope slows troops.
  - **Formation layer (20 Hz):** anchor with path, speed and turn limits; 4 companies of 25 with a
    stable (company, file, rank) slot table; line, column of divisions, pinwheel square, march
    column (a snake that follows its head's trail); timed changes, company by company, wheeling
    round the turning flank; interrupts; closing ranks toward the colours.
  - **Soldier layer (every frame):** slot chasing with drift, separation, obstacle avoidance,
    ground speed.
- `prototypes/formation-map.html` (Canvas 2D): paper and ink map with **contour lines** (2 m, index
  every 10 m with heights), spot heights, the wood as tree symbols, rocks, the stream and ford, the
  road, a 100 m grid, scale bar and north arrow. Each soldier is a **small open circle**, the fallen
  are small crosses, the colours a small flag; "Slots" shows slots and company guides.
- Controls: shapes, wheels, through the wood, cross the ford, casualties, drill factor, speed,
  follow, 40 battalions; click to march, drag to pan, scroll to zoom. `window.F` for headless runs.

Out of scope: combat, morale, AI, the deterministic simulation spine (S0), 3D.

## Acceptance

- Screenshot sequences (headless, `tools/shot.mjs`) at fixed times of: line → square, line →
  column → line, a wheel, crossing the wood, crossing the ford, closing ranks after casualties.
  The owner judges the feel.
- Formation changes take the scaled regulation times (≈ 30 s column → square, ≈ 100 s line →
  square at drill factor 1), measured in the page.
- After casualties, the only soldiers that move slots are the ones stepping up into a gap (counted).
- **Performance:** per-soldier layer time per frame measured at 1 and at 40 battalions (headless,
  with the SwiftShader caveat), plus a manual number on the dev Mac; recorded in this plan.
- The page loads with no errors; `node tools/check-docs.mjs` passes.

## Results (headless, 2D map)

Produced by `tools/formation-measure.js` (run it as its header says; it pauses the page loop, advances
in whole frames and fails on the limits below). Worst distance from slot is sampled every 0.5 s.

| Scenario | Worst distance from slot | Worst mean |
|---|---|---|
| Halted in the open | 0 m (settled men hold within 0.25 m of their place) | 0 m |
| Line → square (100 s) | 1.4 m | 0.20 m |
| March column turning (slope on the way) | 1.8 m | 0.46 m |
| Line through the wood | 3.4 m | 0.54 m |
| **Halted inside the wood**, 6 halt points | largest move of any soldier over 10 s: **0 m** at every point | |
| Cross the ford (march column, crossing, deploying) | 4.6 m | 1.27 m |

- **Limits checked by the script:** halted in the wood, no soldier moves more than 0.05 m in 10 s, at
  six halt points (three of them found by a 64-point search where the previous version still
  fidgeted, up to 0.22 m per 10 s; the owner saw this); the slot table stays consistent after heavy
  casualties; a square formed after casualties, before or during the change, has equal faces.
  Negative runs: the version before the settled state fails the wood points and the
  during-the-change faces (20/19/14/17); the version before that fails the table and the faces too.
- **Casualties:** 80 killed in line (5 × 10, then 30), then square: 20 men in four faces of 5, slot
  table consistent. 30 killed 20 s into line → square: faces 18/18/17/17.
- **Drill timings** are set by the table (line → square 100 s, column → square 60 s, line ↔ column
  30 / 40 s, march column 20 / 60 s); companies start one after another.
- **Cost, 40 battalions (4,000 soldiers):** simulation **1.3 ms** per frame (ground speed baked into a
  grid at load), drawing all circles in view **0.85 ms** (Canvas 2D, one path per battalion).

**Known limitations (later):** no countermarch (a march column ordered to turn back walks through its
own head, facings flip at the turn point); a bent march column that starts to deploy and is reversed
returns to a straight column behind its head; on a reversal the companies restart in the usual order,
not the order in which they had moved.

## Review round 1

10 findings, 1 severe → another round.

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | March column turned as a rigid stick around its head (tail 28.8 m off its slot) | Snake: companies follow the head's trail |
| 2 | moderate | Orders during a change waited for the whole change | Shape orders interrupt; reversal takes the share done |
| 3 | moderate | The "within 1.4 m" result was untrue | Replaced by measured worst cases per scenario |
| 4 | moderate | Ranks never closed toward the centre (holes in the front rank) | Empty files close toward the colours |
| 5 | moderate | column → square 30 s, the sim design says ≈ 60 s; timings "measured" were the table | 60 s; results say the times are set |
| 6 | light | Turning not extrapolated | Anchor angular speed extrapolated with position |
| 7 | light | Trunks at the wood's edge ignored | Tree checks for every soldier |
| 8 | light | Slot check had no negative test and could not fail | Removed (both paths now share one function); `F.slotError()` measures following |
| 9 | light | Neighbour cells smaller than the separation radius | 0.6 m cells (≥ 0.52 m) |
| 10 | light | Grid cleared in full each frame; cost left out figure work | Only touched cells cleared; cost includes figures |

## Review round 2 — stop (no severe findings)

5 moderate, 5 light. Fixed: march slots were extrapolated twice (men 0.6 m ahead of their places);
closing ranks per company opened holes between companies, and closed toward the wrong edges outside
line (now half-battalion toward the colours in line, company centre otherwise, and on every
re-forming); the 40-battalion figure was a single moment (now the worst over the run); reversal
bookkeeping ("line → line", reversal-of-a-reversal timing) now uses the distance still to go; no turn
extrapolation while turning in place; slot error, debug and colours reuse the per-company frames.
Left as known limitations: countermarch, re-straightened column after a reversed deployment,
company order on reversal.

## Review round on the 2D rework

10 findings, 1 severe → another round. Owner feedback in the same round: in the wood the soldiers
"never stop".

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 1 | severe | Closing ranks cleared only the receiving companies: duplicated soldiers in the slot table | Every company involved is cleared; checked by the measurement script |
| owner | — | Soldiers in the wood never settle | Sway only while the battalion is busy (eases out on halt); a slot inside a trunk moves to its edge; trunk avoidance only while walking; arrived soldiers are damped to rest |
| 2 | moderate | First frame could step time backwards | Frame time clamped at 0, first frame skipped |
| 3 | moderate | Results not reproducible (page loop ran between evals, overshooting frames) | `tools/formation-measure.js`; headless runs pause the loop and advance whole frames |
| 4 | moderate | Reset left the 40-battalion mode on | Reset clears it |
| 5 | moderate | Closing toward the colours drained the outer companies (a square lost a face) | Companies are evened out when the battalion leaves line |
| 6 | moderate | Ground speed recomputed per soldier per frame; slope charged even along contours | Baked grid; slope charged along the direction of travel |
| 7–10 | light | Input guards, contour labels per level, culling margin, scale bar, dead 3D state | Fixed; follow still redraws the map while it moves (about 1 ms) |

## Review round 2 on the 2D rework — stop (no severe findings)

3 moderate, 7 light. Fixed:
- **Some soldiers in the wood still never settled** (a slot moved out of a trunk could land within
  separation range of a neighbour's slot: two men pushing each other for ever). Replaced the patches
  by a **settled state**: once the battalion is halted and a man is within 0.25 m of his place, he
  holds still until his place moves. A 64-point search of halt positions: 5 fidgeting before, 0 after.
- The rest check used the mean speed at one halt point: now the largest move of any soldier over 10 s
  at six points, three of them known to fail before.
- Casualties during a change gave unequal faces: companies are evened out when a non-line shape
  starts and when it ends; tested.
- Obstacle loops share one helper; the page shows when a script paused it (`F.resume()`); the plan's
  negative-test wording corrected.
Kept: rebalance re-deals ranks for every non-line shape (more men move than strictly needed; it
happens during a change, while they are moving anyway).
