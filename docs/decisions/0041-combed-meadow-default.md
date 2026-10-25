---
status: accepted
date: 2026-10-19
---

# 0041 The combed meadow is the default grass

## Context

The combed meadow (`docs/plans/done/grass-flow.md`) paints the meadow's pattern and clumps along a flow field, after
Tiny Glade's painted grass, as an arm next to the brush pattern (`?grass=flow`). The owner judged it on screen and
measured 120 fps at every zoom with it (2026-10-18), and asked to make it the default (2026-10-19).

## Decision

We will make the combed meadow the default grass. The brush pattern stays as `?grass=brush` and as the fallback where
the meadow cannot run (WebGL1, `?meadow=off`).

## Consequences

Every look page, check and bench now runs the combed meadow unless it asks for the brush. Its paired cost on the dev
Mac is +0.1 to +0.8 ms against the brush (`docs/plans/done/grass-flow.md`), inside the frame on the owner's screen.
Goldens taken before this change differ in the meadow.

## Alternatives considered

- Keep the brush pattern as the default and the combed meadow as an option: the owner preferred the combed one.
- Remove the brush pattern: it is the fallback without the meadow and the comparisons' base.
