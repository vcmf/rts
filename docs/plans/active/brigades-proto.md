---
status: active
last_reviewed: 2026-10-23
---

# Plan: brigades in the staff map prototype

## Problem

The owner wants infantry to read as in the history channels' maps: a unit drawn as two small bars, one behind the
other, that merge into one square when it forms square. The prototype draws one block per battalion, laid out as each
corps' two lines.

## Scope

In `prototypes/staff-map.html` (both styles):
1. **An infantry unit is a brigade of two battalions** (the owner's choice; historical brigades were mostly two
   regiments, about four to six battalions, so the count belongs in era data once brigades reach the game, decision
   0015). The prototype's infantry counts become brigades (two battalions each, rounded up).
2. **Line and column: two bars**, the first battalion in front, the second behind it with a gap; the gap is a symbol
   proportion at far zoom and the true distance (30 m in line, 15 m in column) up close, as the blocks' sizes already do.
   The painted world's figures stand in the same two bodies.
3. **Square: one hollow square** of both battalions (a regimental square), as now.
4. Losses, morale hatching, routing, the wear bites and selection apply to the brigade; each bar gets its own bites.
5. A corps of up to four units in one row (each brigade already two lines deep); more in two rows, as now.

Out of scope: brigade counts per army, divisions as a level, battalions acting alone, fire and melee by battalion (the
brigade fires as one unit, as a battalion did).

## Acceptance

- Screenshots at map, mid and close zoom: brigades as two bars, a formed square merged, the painted world's figures
  in two bodies.
- The game runs (orders, fire, squares against cavalry, routs) without errors.

## Review rounds

- **Round 1** (`/code-review high`): severe: the bars' share of the depth followed only the new formation, so they
  jumped as a brigade changed formation while its outline eased; and the wear bites on the thin bars became dark slabs
  (a side bite covered a bar's whole depth). Fixed: the share eased from the old formation to the new, and one half
  toward a square, so the two bars close up and merge into it; the bites on a bar only along its front and back, the
  unit's count split between its bars. With: fire and losses scaled by battalions (a brigade fires with two and takes
  its losses over two; cavalry and guns killed twice the men before); one battalion-size helper for the footprint,
  the figures and the bars; the guns behind a one-row corps; `pathPoly` on the shared polygon helper, `mix3` for the
  corners. Not taken: "the doc comments break the one-short-comment rule": that rule is replaced by decision 0054
  (PR #142), at the owner's request.
