---
status: accepted
date: 2026-10-27
---

# 0086 The back exposed: a pressure while it lasts, not a retreat detected

Supersedes decision 0080's one-off morale shock for a retreat ordered within enemy range; the rest of 0080 stands.

## Context

Decision 0080 recorded the owner's rule that a retreat within enemy range turns the back and costs a one-off morale
hit. Planning U1 (`docs/plans/active/u1-sectors.md`), every way of detecting a retreat failed review: judged when the
command is given, it could be dodged (a Wheel, a point shift-clicked behind an idle battalion, a change of shape
first) or paid again on every re-issue; judged every tick from the movement, it needed state and still misread an
advance. The owner restated the rule as a condition, not an event.

## Decision

- **A battalion whose flank or back is turned to an enemy that can hurt it is under pressure** for as long as it stays
  so: its morale is drained (the unit model's flank and rear drains), more from the rear than the flank, the largest
  threat counting, never routing it by itself.
- **An enemy that can hurt it:** within the canister range (about 300 m), one that could fire on it now (the
  battalion within its range and arc, with a clear line: no friend of the battalion's across it), or one that could
  charge it, within the distance at which a battalion forms square against cavalry.
- **No retreat is detected.** Whatever orders turned it, the player's, the AI's or a reaction's, what counts is where
  it faces and who can reach it.

Moving troops away in the middle of a battle is a risky move: done in the open within an enemy's reach it costs nerve,
done behind a screen of friends, or while a battery holds the enemy beyond range, it costs nothing (Wagram: the grand
battery held the Austrians off while corps redeployed to the left).

## Consequences

Good: no detection to dodge or pay twice, no state; screening, covering fire and orderly redeployment matter, which the
AI can learn. Bad: the wavering fall-back, its back turned under fire, is drained too (it is exposed); an advance with
an enemy battery behind it in range is drained (its back is turned to that battery).

## Alternatives considered

- A one-off shock when a retreat is ordered (0080): dodged or paid twice, as above.
- A one-off shock when a battalion is seen moving away from an enemy behind it: state per battalion, and still an event
  where the owner's rule is a condition.
