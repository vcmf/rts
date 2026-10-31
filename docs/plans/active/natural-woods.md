---
status: active
last_reviewed: 2026-10-31
---

# Plan: natural woods on the map windows

## Problem

The owner, on the Austerlitz windows (`?map=austerlitz&window=kobelnitz` or `pratzen`): "the trees are too neat too
aligned … it lost the randomness the feel of a true forest". A wood's trees come from `woodTree`
(`src/look/world/from-map.ts`): one candidate per point of a 6 m lattice, moved at most ±2.4 m and kept by the wood's
density. The jitter is well under half the step and a dense wood keeps almost every point, so the spacing is even and
the rows and columns, axis-aligned to the map, still show: a planted grid. The demo's hand-placed woods
(`src/look/nature.ts`, `extras`) are darts thrown in a lumpy outline and read as woods.

## Scope

Only the wood placement in `src/look/world/from-map.ts` (`woodTree` and its helpers; the orchards, the free trees and
the page are unchanged; epic/gameplay-map has the same code and merges main later, so the change stays there):

1. **No lattice.** A finer lattice (3 m) whose candidates may fall anywhere in their cell, each kept with about a
   quarter of the old chance: near a Poisson scatter, so trees clump by chance and no row survives.
2. **Thickets and clearings.** The keep chance scaled by a low-frequency value noise (two octaves, 45 and 17 m)
   built on `ihash`, from thin to thick, and by a 14 m one that opens small clearings where it is lowest.
3. **Species spacing.** Each candidate's species chosen first (its stand's noise and its own hash, so the woods have
   patches of one species), and its chance scaled by the species (conifers closer, oaks wider), normalised over the
   leaf's shares so the trees per hectare stay the same; a minimum gap to a kept neighbour by species, so two trunks
   never stand in one another, yet pairs and threes stand close.
4. **Ragged rims.** The rim's width (its birches and hawthorns) wanders with a noise, its probes in six directions
   turned per tree (not the four map axes), and the edge band thinned by another noise into bays and spurs.
5. **Scale.** A stand's age (a noise) and the tree's own hash spread the scale more widely; the yaw is already random
   per tree on the page (`hash(x, z)` in `src/look/nature.ts`).

Deterministic: everything is a function of the map's position through `ihash`, so the same map gives the same trees
and two windows agree where they overlap. `woodTree(g, a, b)` keeps its signature; the look data is rebuilt
(`node tools/build-look-data.ts`).

## Cost

A placement change only, no shader change. The far ring's tree count, which sets the cost, measured before and
after on both windows and kept within ±10 %, so no bench.

## Acceptance

- Tests (`test/look-from-map.test.ts`) on a large synthetic wood: no lattice (no period along the map's axes: the
  positions' power at any period from 2 to 12 m about a random scatter's, which the old placement fails at 6 m), an uneven spacing (some close pairs, some
  open ground), the same trees twice, the trees per hectare within ±10 % of the old placement's, rims and clearings.
- Before and after shots at radii 40, 120 and 250 m over both windows' woods, in output/natural-woods/compare.html of the main
  checkout (not committed).
- `docs/systems/look.md` updated; `npm test` passes.

## Outcome

- The shots before and after (output/natural-woods/compare.html in the main checkout) and the plan
  views of the look data's trees: the old woods an even scatter on the map's axes, the new ones clumped, with species
  stands, small clearings and ragged rims.
- On the test's 360 m mixed wood, the old placement's power at its 6 m period was about 146 (a lattice); the new
  one's peak over every period from 2 to 12 m about 4.5 (a random scatter's is of order 1 to 5). The nearest
  neighbours' spread (standard deviation over mean) 0.26 → 0.38; the trees within 2.8 m of a neighbour 11 % → 36 %;
  12 m squares of the inside left empty 0 → 26 of 576.
- The far ring's trees: Kobelnitz 4747 → 4569 (−3.7 %), Pratzen 9133 → 9043 (−1.0 %); within ±10 %, so no bench.
- Calibration: the noises' means measured over 6 km; the share the gaps take (5 %) measured on both windows.
