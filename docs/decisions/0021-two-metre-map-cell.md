---
status: accepted
date: 2026-10-12
---

# 0021 Every map grid is built on one 2 m cell

## Context

Decision 0012 makes one heightfield the authority for height. Its cell, 1.79 m, comes from the prototype's 800 m
tile cut into 448 cells (so that a far-ring cell is exactly 8 tile cells); it has no meaning of its own. The sim
copied it rounded (1.79 m) while the look kept 800 / 448 = 1.786 m, so the two grids do not line up, and the cost
grid's 7.16 m and the 1 m class grid add two more ratios. The map engine compiles every grid from one map
(`docs/proposals/map-engine.md` §5).

## Decision

We will build every map grid on one base cell of **2 m**: heights (sim and renderer), ground, vegetation and
water depth at 2 m; movement cost at 8 m; the far ring at 16 m; finer textures (water data, bank normals) at
whole fractions of it. The switch lands with the phase that rebuilds each data file anyway: the sim's in Track M's
M2, the look's in M4 with Track E.

## Consequences

One ratio everywhere: sim and renderer read the same nodes, and grid maths stays in whole numbers. The sim's
data versions, the golden replays and possibly the calibrations change once (M2); the look tile's mesh has about
a fifth fewer triangles, which the screenshots must accept (M4). Barriers (hedges, walls,
fences, ditches) are built of these cells, at least 2 thick (`docs/proposals/map-engine.md` §3.6): wider than
real ones, on purpose, so that what blocks is exactly what is drawn.

## Alternatives considered

Keep 1.79 m (no data change now, but the misalignment and the odd ratios stay); 1 m everywhere (four times the
memory and build time for detail the formations do not use).
