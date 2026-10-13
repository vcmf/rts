---
status: accepted
date: 2026-10-13
---

# 0026 Standing crops are drawn under a soldier's chest

## Context

The scatter's wheat stood 1.65 to 2.1 m tall (the pack's 1.1 m tuft scaled 1.5 to 1.9 times), taller than a
soldier. Doubled in density by the meadow (#74), it hid more of a formation standing in it: the readability guard's
wheat blocks lost about a seventh of their visible pixels. Pre-modern cereals did stand 1.2 to 1.8 m (the map
track's catalogue notes it), and formations hid in standing crops (Quatre Bras), but the art bible's first pillar is
readability: armies are never hidden (`docs/art-bible.md`). The owner (2026-10-13) chose to cap the crop.

## Decision

We will draw standing crops no taller than 1.2 m (`WHEAT_HEIGHT_MAX`, `src/look/meadow-spec.ts`), under a
soldier's chest, whatever their real height. The sim keeps its own reading of a field (cover, sight); this is the
look's.

## Consequences

- Good: a formation in a field reads; the guard's wheat blocks show whole again (their results:
  `docs/plans/active/wheat-height.md`); a dark coat in a crown's shade there is still a palette question (#63).
- Bad: fields look lower than history's; a scene that needs men hidden in the corn shows it through the sim's
  sight rules and the staff map, not the look.

## Alternatives considered

- Historical heights (1.5 to 1.8 m): formations disappear into fields, against pillar 1.
- Crops lowered only around formations: a hole follows each battalion through the field, a trick that reads as one.
