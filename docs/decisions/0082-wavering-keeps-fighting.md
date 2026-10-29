---
status: accepted
date: 2026-10-27
---

# 0082 A wavering battalion keeps fighting: no automatic fall-back

## Context

Since S1c-2 a wavering battalion with no orders, its morale still falling and an enemy in front within range, Retired
15 m once by itself (`docs/systems/fire-morale.md`, the wavering fall-back). U1's drain of a back exposed to the enemy
(decision 0081) lowers the morale's target, and a drain looks to that rule like a fall: a wavering battalion would
retire because an enemy stood on its flank, with no shot fired. Mending the trigger (a share of recent losses) failed
review on how companies actually fire. In Total War a wavering unit keeps fighting until it recovers or routs.

## Decision

- **A wavering battalion keeps fighting** where it stands, with the penalties it already has (it fires worse; with U3
  it will not advance), until it recovers or routs. Nothing makes it step back by itself.
- The fall-back, its formation fields (`falling`, `fellBack`) and its ruleset numbers (`morale.fallback`) are removed
  with U1 (`docs/plans/active/u1-sectors.md`).

## Consequences

Good: one rule fewer; nothing reads the morale's fall, so the drain needs no exception; the player decides when to
pull a shaken line back (and pays for it, decision 0081). Bad: a battered line no longer gives a few metres on its own
before it breaks; the fire calibration (`tools/calibrate-fire.ts`) and the goldens move.

## Alternatives considered

- The fall-back kept, on a share of recent losses: the share's numbers did not fit companies firing on their own
  reloads (a steady fire under the threshold, one casualty over it in a small battery).
- The fall-back kept, needing a man lost in its last seconds besides the morale's fall: workable, but a rule Total War
  does without.
