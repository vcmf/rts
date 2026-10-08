---
status: active
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

`F.slotError()`: how far soldiers are from their slots. `F.measure()`: simulation CPU per frame
(formation ticks + steering). `F.drawMs()`: drawing all soldiers.

| Scenario | Worst distance from slot (sampled at the end of each step) | Mean |
|---|---|---|
| In line, square or column at rest | 0.15 m | 0.11 m |
| Line → square, half-way | 0.52 m | 0.16 m |
| March column turning (slope on the way) | 1.7 m | 0.46 m |
| Line through the wood | 2.4 m | 0.68 m |
| Cross the ford, deploying on the far bank | 2.5 m | 0.35 m |

- **Drill timings** are set by the table (line → square 100 s, column → square 60 s, line ↔ column
  30 / 40 s, march column 20 / 60 s); companies start one after another.
- **Casualties:** 80 killed → 53 stepped up, 36 closed toward the colours; the 20 left stand as one
  closed line.
- **Cost, 40 battalions (4,000 soldiers):** simulation **1.7 ms** per frame (slope and road lookups
  added since the 3D version), drawing all circles **0.9 ms** (Canvas 2D, one path per battalion).
  One battalion: 0.05 ms and 0.06 ms.

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
