---
status: accepted
date: 2026-10-18
---

# 0042 Dark water: the water's shimmer limits re-baselined

## Context

The dark water (`docs/plans/active/dark-water.md`, after Tiny Glade's and the art bible's §6c) passes every water
check but the shimmer: dark water against pale banks, light foam and riffles makes every painted edge more contrasty,
so more pixels change by over 8/255 under the check's quarter-pixel move (`tools/water-look-check.mjs`). Main: 0.63 %
closest, 3.6 % widest; the dark water: 1.17 % and 5.57 %, against limits of 1.0 % and 4.0 %. Fewer light marks or less
dark water would bring it down. The owner (2026-10-18), after looking at it moving: "i love current feel of the water
lets do that" (re-baseline).

## Decision

The water check's shimmer limits are set a run's spread above the dark water's measurements: 1.3 % closest, 6.0 %
widest (6.5 % in autumn), winter 3.5 % and 13.5 %, the water's own pixels 3.2 % and 15.5 %. As decision 0034 did for
the temperate mood.

## Consequences

- Good: the water the owner chose; the check still fails on aliased hard edges (its sabotage, WATER_SAB_STEP) and on a
  further rise.
- Bad: the limits no longer say the water shimmers no more than before; a future change to the water's marks should be
  judged by eye as well.
