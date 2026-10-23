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
