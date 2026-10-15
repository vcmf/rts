---
status: accepted
date: 2026-10-15
---

# 0035 Units take the ground's bounce at its full hue, at a share of its strength

## Context

LC4 (`docs/plans/done/lc4-bounce.md`) adds the ground's bounce: light from below in the colour of the ground under a
point. Decision 0027 has units take the light's value and only part of its hue (the eye's white balance on the sun).
The owner's review asked for the cast of the surroundings: "a blue coat in an orange light has an orange tilt".

At the bounce's full strength, four guard blocks fell under the bound (the Austrian white in the valley at 0.053,
main 0.106): the bounce lifts a coat's shadow side toward its ground.

## Decision

Units take the bounce at its full hue: the eye balances on the main light, not on a bounce off coloured ground. They
take a share of its strength, the mood's `units.bounce` (0.35 in golden and temperate). Decision 0027 stands for the
sun and the air.

## Consequences

- Good: a coat over wheat has a warm underside, and one over meadow a green one: the owner's "tilt".
- Bad: with the share, three blocks fall just under the bound at start and one at cover. The owner accepted them on
  2026-10-15, and they are recorded on #78.
- Every mood sets `units.bounce`.

## Alternatives considered

- The bounce's hue at the sun's share (`wb`): a white coat's shadow side turned pale blue (a grey bounce brightening
  the cool shadow band).
- No bounce on units: no tilt.
- A 15 % share: offered; the owner chose 35 %.
