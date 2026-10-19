---
status: accepted
date: 2026-10-19
---

# 0044 The water's shimmer limits re-baselined for the epic mood

## Context

Decision 0043 made `epic` the default mood. Its thinner valley mist and clearer air make the river's painted edges
more contrasty, so more of the water's pixels change by over 8/255 under the water check's quarter-pixel move
(`tools/water-look-check.mjs`): 6.83 % at the widest against a limit of 6.0 % (decision 0042's, measured under
temperate), and over in autumn and winter. Decision 0034 foresaw this: a new default mood may need its limits measured
again. The owner (2026-10-19): "accept the re-baseline".

## Decision

The shimmer limits are set a run's spread above epic's measurements: 1.3 % closest, 7.2 % widest (7.2 % in autumn),
winter 4.0 % and 14.5 %, the water's own pixels 3.7 % and 16.5 %.

## Consequences

- Good: the water check measures the default look again; it still fails on aliased hard edges (its sabotage) and on
  a further rise.
- Bad: as decision 0042 noted, the limits follow the look rather than holding it to main's.
