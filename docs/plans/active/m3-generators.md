---
status: active
last_reviewed: 2026-10-12
---

# Plan: M3, the generators

Track M's third phase (`docs/proposals/map-engine.md` §3.4, §10), on `epic/map-engine` (decision 0020). Two PRs
into the epic: **M3a**, the seeds, the base ground's noise, `meander`, `clump` and pinning; **M3b**,
`street-village`, `scatter` with its constraints, shared edges (`follow`), and maps from a seed.

## Problem

Every shape in a map today is exact and hand-written. A meandering stream takes a hundred hand-placed points, a wood's
organic edge a dozen, and the ground between the landforms is perfectly flat. The proposal's language describes
intent ("a stream along this valley, meandering this much"), but nothing turns intent into shapes yet, so a map
cannot be both short and rich.

## Scope

**M3a**
- **Seeds** (`src/map/seed.ts`): `hash(map.seed, id, purpose)` in 32-bit integer maths, and a seeded generator of
  numbers in [0, 1). Adding, removing or reordering features never reseeds another (proposal §3.4).
- **The base ground** (`relief.base`, a landform, not a generator): value noise over the whole extent, its
  amplitude `height` and its scale `width`, three octaves, exact (polynomial smoothing, no trigonometry). Seeded by
  the base feature's id. A `relief.base` with no height stays flat.
- **`meander`** (`src/map/meander.ts`), on a `water.stream` or `water.river` line:
  - the guide line is the valley's axis; the bends follow the Kinoshita curve of today's look world
    (`src/look/world/author.ts`), ported to the exact maths (`src/sim/num.ts`);
  - each bend varies its amplitude and length, seeded;
  - a restoring term keeps the stream inside its belt;
  - the bends ease to nothing at both ends, so the stream starts and ends on its guide.

  Parameters: `amplitude` (the belt's half-width, m), `wavelength` (m, default 11 widths) and `bend` (the largest
  angle, rad). The output is a line with points about half a width apart, to 1 cm.
- **`clump`** (`src/map/clump.ts`), on any area kind given as a point, circle or ellipse: an organic outline,
  a radial polygon whose radius varies by seeded harmonics. Parameters: `coherence` (1 is the circle),
  `raggedness` (finer wobble) and `points`.
- **Expansion:**
  - each `gen` runs, and its feature is replaced by its output, with `origin` (the generator, its parameters, the
    expansion version);
  - the expanded map is validated like any map, and a generator's bad output is an error naming its feature;
  - a bridge whose road crosses its water more than once, with no `near`, is an error listing the crossings;
  - a pinned feature (no `gen`, with an `origin`) is just a feature.
- **The validator:**
  - a generator's parameters are checked (names, types, ranges);
  - a feature with a `gen` takes the shape its generator reads, and the generator's output must be a shape its
    kind takes;
  - `noise` leaves the generator list.
- **The example:** `maps/two-ridges.map.json` uses `meander` for its brook, `clump` for its wood and noise for its
  ground, as the proposal's §9 does; the hamlet stays exact until M3b.

**M3b** (planned here, built after M3a):
- `street-village`: houses and yards along its road between `from` and `to`, both sides, seeded;
- `scatter`: N child features of a kind in a region, with `avoid` and `within` constraints on kinds or ids, and
  `min`;
- `follow` (shared edges);
- five seeds of one intent map giving five valid, distinct battlefields that compile and play.

**Out of scope:**
- relief generators beyond the base noise (erosion, rivers carving valleys);
- generators reading the relief (a meander that finds its valley by itself): the guide line is the author's;
- the look compiler (M4).

## Approach

- **Generators are pure:** `(params, input shape, attributes, seed) → output shape`. Each lives in
  `src/map/` (its own file), follows the exact-number rules, and is unit-tested alone.
- **Seeds:** FNV-1a over the purpose's text and the numbers, then mulberry32. Both are integer maths, the same on
  every engine.
- **Meander:** the look world's step 1, with the per-bend jitter taken from the seeded generator. The belt is held
  by a cubic restoring term. The output is checked for self-crossing (an error, never silently fixed).
- **Locality:** a generated feature depends only on its own parameters, its shape, its id and the map's seed. The
  tests move another feature and compare.

## Acceptance

M3a:
1. Determinism and locality:
   - expanding twice gives the same bytes;
   - changing another feature, or the file's order, changes no generated feature;
   - changing the map's seed changes them.
2. A meandered stream stays within its belt, starts and ends on its guide, never crosses itself, and is longer
   than its guide (sinuosity above 1.1 at the default bend).
3. A clump is a simple polygon whose radius stays within its bounds; `coherence: 1` gives a circle to 1 cm.
4. The base noise stays within ± its amplitude; with no height the ground is flat.
5. The example expands and draws, and its expanded file is the committed golden. Its draft shows a meandering
   brook, an organic wood and gently rolling ground (a PNG in the PR).
6. The validator rejects bad generator parameters, a wrong input shape, and an output shape the kind does not
   take, each with the feature and the path. Expansion rejects a bridge that crosses twice with no `near`.
7. `npm test`, `npm run check:data`, `npm run check:docs` and `npm run build` pass, with full output and exit codes
   in the PR.

## Review rounds

**M3a, round 1** (9 findings, 1 severe):
- **Severe:** meander's pull back to its guide had no limit. Once past its belt, the heading spun: allowed parameters
  threw from the exact trigonometry, or put the stream far off its belt. The heading is now clamped to 83° from the
  guide's, so the channel always advances and a straight guide can never cross itself, whatever the seed (tested
  on 240 runs). The belt must be at least the stream's width, and a generator's error is an issue on its feature.
- **Moderate:**
  - the guide's normal jumped at each vertex; it now turns smoothly, and guides turning more than 90° are refused
    (a 90° turn tested on 40 seeds);
  - the comment promising no loops is now true (above);
  - the noise table's bounds used a different expression from its nodes', so the edge read past it (NaN); the
    bounds now use the nodes' own expression, and a noise finer than the grid computes per node instead of
    allocating a table larger than the grid;
  - crossings at shared vertices counted twice, and touches counted. Each segment now owns its start only,
    touches are skipped, and hits merge within a micrometre.
- **Light:**
  - the bucket search walks only each ring's edges;
  - expansion validates before sorting, so paths need no remapping;
  - the small helpers live in `src/map/util.ts`.
- **Found while fixing:** the orientation test behind every crossing check read nearly collinear points as
  crossing, from rounding in metres. It now runs on whole centimetres, exactly. Also, `cos(π/2)` is not 0 in
  floats, so the 90° test uses the dot product instead.
