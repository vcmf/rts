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

A new single-file prototype, `prototypes/formation-feel.html` (`prototypes/AGENTS.md` rules):
- **Ground:** a flat-to-gentle heightfield with a small wood (tree trunks as obstacles) and a
  shallow stream with a ford. Simple painted shading (ramp + grain), not the full world prototype.
- **One battalion of 100 soldiers** as instanced low-poly figures (body, shako, musket), side
  colour, a colour party in the centre. Soldiers are cosmetic: placed by the per-soldier layer.
- **Formation layer** (20 Hz, plain JS, written as the sim will be: no `Math.sin` etc. needed for
  the feel test but kept separate from rendering):
  - anchor with path, speed and turn-rate limits;
  - 4 companies, each with a guide;
  - slot table: soldier → (company, file, rank), stable identity;
  - shapes: line (3 ranks), attack column, square, march column;
  - timed transitions: each company moves to its new place in sequence (wheel or file off), then
    dresses; regulation times scaled by a drill factor (`docs/proposals/sim-design.md` §5).
- **Per-soldier layer** (frame rate):
  - steer to the slot extrapolated a short time ahead; speed matched along the direction of march;
  - small personal drift; separation from neighbours in the same battalion (spatial hash);
  - avoid tree trunks (gaps open, then close); slow and bunch at the ford; snap to height;
  - gait: walk / run cycle from speed (simple bob, no skeletal animation yet).
- **Casualties:** a button kills N random soldiers; the man behind steps up into each gap, ranks
  close toward the centre; no global reshuffle.
- **Controls:** buttons and keys for line / column / square / march column; click to move; wheel
  left/right; "march through the wood"; "cross the ford"; casualties; a drill-factor slider;
  **"40 battalions"** to spawn the full battle size for the performance measure.
- **Debug overlay:** anchor, guides, slots, company colours, transition progress, frame time.

Out of scope: combat, morale, AI, the painted world's lighting and bakes, figure models and
animation beyond a placeholder, the deterministic sim spine (S0).

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

## Results (headless)

Measured with `F.slotError()` (how far soldiers are from their slots) and `F.measure()` (per-soldier
CPU per frame: steering plus figure matrices), after review round 1.

| Scenario | Worst distance from slot | Worst mean |
|---|---|---|
| Line turning 90° to a new target | 1.71 m | 0.56 m |
| Wheel 45° | 0.25 m | 0.13 m |
| Line through the wood | 5.0 m (men held up behind trunks) | 0.83 m |
| Cross the ford (march column, turn, deploy) | 3.6 m | 1.26 m |
| March column turning 90° | 0.98 m | |
| 40 battalions on the move | 2.4 m | 0.40 m |

- **March column as a snake:** each company stands on the head's trail and faces along it, so the
  column turns where its head turned (the first version turned as a rigid 23 m stick: 28.8 m error).
- **Drill timings** come from the timing table (they are set, not measured): line → square 100 s,
  column → square 60 s, line ↔ column 30 / 40 s, march column 20 / 60 s. Companies start one after
  another and wheel around their turning flank.
- **Interrupted changes:** a new shape order mid-change takes over at once; reversing (square ordered,
  line ordered 30 s in) takes only the share already done (18 s), and orders to move wait until the
  change ends (troops do not march while re-forming).
- **Square:** a pinwheel layout (each face shifted along its line by half its depth) closes the corners.
- **Casualties:** the man behind steps up, then empty files close toward the colours. 30 killed: 27
  stepped up, 18 moved one or more files inward; 80 killed: no hole left inside the line.
- **Per-soldier CPU** (headless Chrome): 0.02 ms per frame for 1 battalion, **1.34 ms for 40
  battalions (4,000 soldiers)**, steering and figure matrices together (first version: 8.6 ms for
  steering alone). Rendering frame rate in headless SwiftShader is not meaningful; a manual number
  on the dev Mac is still owed.

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
