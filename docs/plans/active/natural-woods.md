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

Only the wood placement in `src/look/world/from-map.ts` (`woodTree`, now `woodTrees`, and its helpers; the orchards, the free trees and
the page are unchanged; epic/gameplay-map has the same code and merges main later, so the change stays there):

1. **No lattice.** A finer lattice (3 m) whose candidates may fall anywhere in their cell, each kept with about a
   quarter of the old chance: near a Poisson scatter, so trees clump by chance and no row survives.
2. **Thickets and clearings.** The keep chance scaled by a low-frequency value noise (two octaves, 45 and 17 m)
   (`src/map/noise.ts`), from thin to thick, and by a 14 m one that opens small clearings where it is lowest.
3. **Species spacing.** Each candidate's species chosen first (its stand's noise and its own hash, so the woods have
   patches of one species), and its chance scaled by the species (conifers closer, oaks wider), normalised over the
   leaf's shares so the trees per hectare stay the same; a candidate gives way to a neighbour's candidate of higher rank
   within a gap by species (1.1–1.8 m), so two trunks never stand in one another, yet pairs and threes stand close.
4. **Ragged rims.** The rim's width (its birches and hawthorns) wanders with a noise, its probes in six directions
   turned per tree (not the four map axes), and the edge band thinned by another noise into bays and spurs.
5. **Scale.** A stand's age (a noise) and the tree's own hash spread the scale more widely; the yaw is already random
   per tree on the page (`hash(x, z)` in `src/look/nature.ts`).

Deterministic: every decision reads the map's layers alone (never a window's 1 m areas), through `ihash` and the
noises seeded from the map's seed, so the trees are a function of the map and every window stands the same ones.

**API change, for epic/gameplay-map's merge:** `woodTree(g, a, b)` (one lattice point) is gone; its one caller,
`mapTrees`, now calls `woodTrees(L, mapSeed, a0, a1, b0, b1)` (every cell of a range at once, for the gap test's
grid), and `mapTrees` takes the map's seed as a required fourth argument (`tools/build-look-data.ts` passes
`map.seed`). The look data is rebuilt (`node tools/build-look-data.ts`).

## Cost

A placement change only, no shader change. The far ring's tree count, which sets the cost, measured before and
after on both windows and kept within ±10 %, so no bench.

## Acceptance

- Tests (`test/look-from-map.test.ts`) on a large synthetic wood: no lattice (no period along the map's axes: the
  positions' power at any period from 2 to 12 m about a random scatter's, which the old placement fails at 6 m), an uneven spacing (some close pairs, some
  open ground), the same trees in every window, the trees per hectare within ±10 % of the old placement's, rims and
  clearings.
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
- The far ring's trees: Kobelnitz 4747 → 4493 (−5.4 %), Pratzen 9133 → 9111 (−0.2 %); within ±10 %, so no bench.
- Calibration: the noises' means worked out once a seed at build time (`woodField`; the page reads the look data and
  never calls it); the factors' tops together never ask a chance above 1 (tested for eight seeds). The candidates the
  gaps and the trunks' footprints take are not made up one by one; the chance is set for a tree per 34 m², which they
  thin to about 36: the trees per hectare stay within ±10 % of one per 36 m² at densities 0.5 and 1 and for the
  broad, needle and mixed leaves (tested over five woods).
- Review round 1: the edge probes, the neighbours past the window's areas and the gap test read the map's layers, so
  two windows stand the same trees (a test compares every tree of a smaller window's overlap); the stand's age only
  on pack-scaled species, within ±15 % and a veteran's 12 % (a test caps each species); the candidates built once
  into a grid (`woodTrees`) and the cheap rejections first; the noise is `src/map/noise.ts`'s.
- Review round 2: every wood decision by the map's layers alone (a window's 1 m areas no longer judge a candidate or
  a neighbour; a test clears rides in the layers just past smaller windows' edges, which fails on round 1's code, and
  another compares small windows over a slanted wood kept off a lane and a hedge, built by apply); each candidate
  probed at its rim's distance and at the band's, so glades and rides get their rims (tested); the stands' lattice
  turned 37° and wobbled ±18 m (a test on the borders' orientation); the noises seeded from the map's seed; the gap
  compensation dropped; a small wood's density tested over a dozen seeds.
- Review round 3: the edge probed every 2 m out to the band, so a ride or a glade narrower than the rim gets its rim
  (a test with one-cell glades); ways, water and the built through a wood make an edge (a lane's rim, tested); a
  trunk only where the cells under its ±1 m footprint are wood and free (a test: no trunk within 1 m of a lane or a
  house); the map's seed in the trees' own hashes too (places, ranks, species) and `mapTrees`' seed required; a
  per-seed range on the small wood; the age the stand's own; the noises' means per seed, memoised; one allocation a
  tree.
- Build time (mapTrees over the far ring, the fastest of 5): Kobelnitz 54 → 147 ms, Pratzen 56 → 156 ms, the last
  measured at a load of about 25 (the earlier ones near 10); the whole window's build about 8–10 and 2 s either way;
  the tests' file 0.45 → 4 s with the new tests.
