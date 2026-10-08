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

## Results (headless, before review)

- **Two layers work.** Every soldier stays within about 1.4 m of his slot while marching and changing
  formation; the per-frame company frames match the reference slot formula to within 1e-14
  (`F.slotCheck()`), mid-wheel, mid-change, in square and in march column.
- **Drill timings** (drill factor 1, measured in the page): line → square 100 s, square → line 60 s,
  line → column 30 s, column → line 40 s, line → march column 20 s, march column → line 60 s, all as
  planned. Companies start one after another and wheel around their turning flank.
- **Square:** the first layout left the corners open; a pinwheel layout (each face shifted along its
  line by half its depth) closes them.
- **Wood:** the line goes ragged, men pass between trunks and gaps open and close, then the line
  re-dresses past the trees. **Ford:** the battalion files off into march column, crosses, the tail
  bunches in the water, then deploys into line on the far bank.
- **Casualties:** 30 killed → 27 soldiers stepped up into gaps, nobody else changed slot.
- **Per-soldier layer cost** (headless Chrome, CPU): 0.05 ms per frame for 1 battalion, **0.7 ms for
  40 battalions (4,000 soldiers)**, after caching each company's frame per frame and replacing
  string-keyed neighbour maps with numeric grids (first version: 8.6 ms). Rendering frame rate in
  headless SwiftShader is not meaningful; a manual number on the dev Mac is still owed.
