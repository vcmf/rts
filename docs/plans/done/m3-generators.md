---
status: done
last_reviewed: 2026-10-13
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

**M3b:**
- **Children:** a generator may write child features beside its own. A child's id is its parent's plus `-<n>`; it
  carries an `origin` naming its parent. To pin children, the parent's generator goes (a village keeps its feature;
  a scatter's region goes too: see round 3).
- **`street-village`**, on a `built.village` with `along` its road:
  - houses (`built.house`) on both sides of the road between `from` and `to`, set back from its edge, turned to
    face it, with seeded sizes and gaps;
  - houses keep clear of water and of other buildings;
  - the village's own area, when the author gives none, becomes the hull of its houses;
  - fewer houses than asked is an error, unless the feature allows fewer with `min`.
- **`scatter`**, on any area kind given as an area (the region):
  - `count` children of the feature's kind and attributes, each a `clump` of radius between `radiusMin` and
    `radiusMax`, with their centres inside the region;
  - each keeps `clearance` metres from the features it must `avoid` (kinds, as category or dotted prefixes, or
    ids) and from its siblings;
  - each lies within `reach` metres of a feature it must stay `within`, when that list is given;
  - fewer than `count` placed is an error unless `min` allows it;
  - `mix: [{ kind, count, … }]` places several kinds jointly, each child clear of every other (redesign 2).

  Generators run as a chain (redesign 2, decision 0028): each after whatever it could read; a cycle is an error.
  The region feature itself leaves the expanded map; its children stay.
- **Five seeds:** `maps/generated.map.json`, an intent map in the valley's layout:
  - ridges and a meandered brook with its fords and bridge;
  - noise ground;
  - one scatter of groves, woods and wheat fields in its mix, kept off the water, the road, the village and the
    armies' ground;
  - a street village along the road.

  Five map seeds give five valid, distinct expansions that compile to sim data and run the S1e battle with finite
  state.

**M3d** (after M3b; M3c became trees and paved roads, `docs/plans/done/m3c-trees.md`): `follow`, shared edges. An area's ring may take part of another feature's line, offset to
one side, so a wood bounded by a stream shares its bank. It changes the shape grammar (a ring point may then be a
reference), so it is its own PR.

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

M3b:
1. **Determinism and locality:** children are stable across runs and local (another feature's change leaves them
   alone, unless it is a feature they avoid).
2. **`street-village`:** the houses face their road, are on both sides within `from`–`to`, overlap neither each
   other, nor the road, nor water. Fewer than asked is an error naming the feature.
3. **`scatter`:**
   - the children are inside the region, clear of what they avoid and of each other, and within reach when asked;
   - an impossible scatter is an error, and `min` lowers the bar.
4. **Five seeds of `generated.map.json`:**
   - each validates, expands and compiles to sim data;
   - each runs two minutes of the S1e battle with finite state;
   - the five expansions all differ.
5. **The page** draws `generated` and redraws on save in under a second.
6. `npm test`, `npm run check:data`, `npm run check:docs` and `npm run build` pass, with full output and exit codes
   in the PR.

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

**M3a, round 2** (9 findings, none severe: stop and fix what is worth it):
- `crossings` still decided vertex hits in floating-point metres (snapped vertices misread both ways). It is now
  exact on whole centimetres, with simulation of simplicity for points on the other line (a pass through a vertex
  crosses once, a touch never) and ends taking their neighbour's side. It is fuzzed on 4000 snapped vertices in
  decimal centimetres; the shared-vertex wedge and a road ending on a bank are tested;
- short guide segments at a turn folded the meander on 21–31% of seeds. The generator now refuses a turn whose
  neighbouring segments cannot ease it for the belt (a seed-independent error saying how long they must be).
  Random accepted guides are tested clean;
- a generator on a kind that may take no shape needed its input; `meander` runs on streams and rivers only; `clump`'s
  `radius` on a circle is an error;
- light: the segment box check speeds every crossing test; meander finds the guide's segment by bisection; the
  duplicate import and the orphan comment are gone. Re-validating only the generated features after expansion is
  left: the whole map is validated, which keeps the guarantee simple and costs little with the box check.

**M3b, round 1** (10 findings, 2 severe):
- **Severe:**
  - street-village tested only a house's corners, so a stream through its middle passed (32 houses over 50
    seeds). Houses are now tested as polygons: exact for lines and areas, after checking for any crossing;
  - a village listed before its meandered stream saw the unmeandered guide, so the file's order changed the
    houses. Expansion now runs in three passes, none in the file's order: self-reshaping generators, then readers
    in id order, then scatters ordered by the scatters they name. Tested: the two orders give the same map.
- **Moderate:**
  - a scatter naming another scatter's region matched nothing once it had run; a selector now matches a
    generator's children by its id, scatters run after those they name, and a `within` matching nothing is an
    error;
  - houses avoided only buildings given as areas; now any shape;
  - closed rings are made once (the line index is no longer rebuilt per query).
- **Light:**
  - generated children's ids are reserved against an author's ids;
  - `min: 0` with no room gives an empty village;
  - the street walk's budget comes from the stretch's length;
  - selectors may name generated children, and a feature may not name itself;
  - `clump` exports its largest radius, and street-village reuses `ringsTouch`.

**M3b, round 2** (9 findings, 1 severe):
- **Severe:** scatters were ordered only by exact ids named, so a scatter avoiding a kind (`veg`) could run before
  the wood scatter it meant to avoid and avoid its whole region. Renaming `copses` to `woods` broke the five-seeds
  map. A scatter now runs after every scatter whose children any of its selectors would match: by id, a child's id,
  or the children's kind. A loop is an error naming the scatters. Tested: the renamed map works for three seeds,
  and two scatters avoiding each other's kinds are named as a loop.
- **Moderate:**
  - selectors naming a child wait for its parent;
  - a pinned child while its parent still generates is a validation error; pinning means removing the parent's
    generator (tested with hand-tuned notes surviving);
  - houses keep clear of other ways and barriers (a crossroads, 30 seeds, all houses placed).
- **Light:**
  - a house inside an area's hole is outside it;
  - reserved child ids are `-1`, `-2`, … only, and a scatter cannot name its own children;
  - the stale comment is gone;
  - the seed override only touches a file that is a JSON object.
  - Not done: the far-away prefilter in `distanceToPolygon` (an efficiency note; the full expansion takes about
    0.25 s).

**M3b, round 3** (10 findings, 1 severe): **stop and redesign** (decision 0014: more than three rounds means the design
is wrong).

The severe finding was a village seeing unexpanded scatter regions: a scatter of ponds over the map left every
village with 0 houses. It is the third severe finding in a row about the order generators run in:
- round 1: a village saw a stream's unmeandered guide;
- round 2: a scatter saw another scatter's unexpanded region;
- round 3: a village sees scatter regions.

The cause is the same each time: fixed passes let a generator see other generators' *unexpanded inputs*, shapes
that never reach the final map.

### Redesign: expansion by dependency, over finished features only

1. **A generator sees only finished features:** the author's features without generators, and the generators
   that have already run (their output and their children). A generator still to run is invisible: its input
   never leaks.
2. **Each generator declares what it reads**, as selectors (ids, categories, kind prefixes):
   - a village reads its road, water, buildings, ways, barriers and no-go zones;
   - a scatter reads its `avoid` and `within`;
   - meander and clump read nothing.
3. **Order by dependency:** F waits for G when F's reads could match what G produces (G's id, its children's
   ids, the kinds of G and of its children). Expansion runs the strongly connected groups of that graph in
   dependency order.
4. **Mutual readers:** inside a group of generators that read each other (two scatters of woods each avoiding
   `veg`, two villages sharing a road), the generators run in id order, each seeing the earlier ones' output. A
   rename inside such a group can change which goes first; one-at-a-time placement must pick an order, and the id is
   the author's handle on it. Nothing outside the group depends on ids, and the file's order never matters.

The round count restarts after this redesign. Round 3's other findings are taken with it:
- pinning a scatter means removing the scatter feature itself (its region would otherwise stay);
- a selector naming a pinned scatter's id still matches its children;
- an id selector (or a child's id) that matches nothing is an error;
- houses keep out of no-go zones;
- the child-id rule lives in one place;
- the stale docs are fixed.

**After the redesign, round 1** (9 findings, 1 severe):
- **Severe:** two generators naming each other by id could never both expand (the first failed on the other,
  not yet run). The redesign gains **hard and soft reads**: hard reads (a village's road, a scatter's `within`)
  always come first, and a loop of them is an error naming its members; soft reads (keeping clear) of a group
  member not yet run see nothing of it. Tested: two scatters avoiding each other, and a village with ponds
  `within` it, whatever the ids.
- **Moderate:**
  - a scatter that placed nothing is finished (naming it is fine);
  - ellipses were measured by a radial guess that could overestimate; circles and ellipses are now the polygons
    that just contain them;
  - scatter is pruned (avoided features by box, siblings in a grid): 200 children went from about 970 ms to
    14–26 ms (measured).
- **Light:**
  - a generator reading a failed one is skipped, so one error is reported;
  - the proposal's table is updated;
  - street-village builds its obstacles from its declared reads;
  - reads are computed once, and a single id comparator and a single `isKindName` are shared;
  - a village's pinning advice keeps its area.

**After the redesign, round 2** (10 findings, 1 severe):
- **Severe:** in a ring of three or more avoids, one pair was never separated. **Separation is now mutual:** inside
  a group, a generator also keeps clear of the earlier members that wanted to keep clear of it. Tested: a ring of
  three scatters over five seeds, and a village with ponds avoiding woods and woods avoiding buildings.
- **Moderate:**
  - a name for a child was accepted or refused by id order; names are now checked once everything has run;
  - a `within` by kind made two pond scatters a loop; only reads by name are hard now.
- **Light:**
  - loop errors name only the loop's members;
  - selectors match only features with a shape;
  - ids may not be category names (`ground` in the example maps is now `terrain`, which reseeds their noise);
  - houses prune by box;
  - `pinnedParentsOf` is shared and validate uses `kindMatches`;
  - one `pending` set;
  - the ordering rules are a decision record (0053).

**After the redesign, round 3** (2 severe): **stop and redesign** (more than three rounds of the same class of fault).
- **Severe:** a `within` by kind, read softly, behaved as a keep-clear inside a group: a scatter that should stay
  near the woods of a scatter not yet run saw none of them.
- **Severe:** the order inside a group still depended on ids, so a rename could lose a clearance that mutual
  separation was meant to keep.

Every fault of the redesign's three rounds lived inside a group of generators that read each other. The user chose
**no cycles, plus joint placement**.

### Redesign 2: a chain, and a scatter's mix

- Generators must form a chain. A cycle of reads (two or more) is an error on each member, naming what it reads,
  by which selector, and how to break it. Hard and soft reads, mutual separation (`keepClearOf`) and the order
  inside a group are gone.
- The one common mutual case, kinds that must keep apart, is one scatter with `mix`: every entry's clumps are
  placed in one pass, every child `clearance` from every other whatever their kinds. Each entry is checked
  against the catalogue (kind, area shape, attributes in `set`, radii); `count` and the clump fields move into the
  entries.
- `maps/generated.map.json`: the copses and fields scatters become one scatter, `groves`.
- Decision 0028 supersedes 0053.

The round count restarts.

**Redesign 2, round 1** (8 findings, 1 severe):
- **Severe:** two street villages read each other through `built`, so any map with two villages was a cycle, and
  the advice (one scatter's mix) could not apply. Street villages are now **peers**: neither reads nor sees the
  other's output, and once all have run their houses must lie 1 m apart, or it is an error naming both. A pinned
  village's houses are hand-drawn features and are kept clear of. Decision 0028 is amended before merging.
- **Moderate:**
  - each try went to the entry furthest behind, so an entry that could not be placed starved the others; each
    entry now has its own budget of tries;
  - a mix scatter's own kind (never on the map) was counted as produced, giving false cycles;
  - a `null` mix entry made the validator throw: the generator's own checks now run only when the parameters
    passed their specs;
  - the cycle advice suggested a mix for villages; it now says to drop one side's read, and offers a mix only
    when every member is a scatter;
  - a mix scatter's own attributes reached no child silently: now an error pointing to `set`.
- **Light:** a non-list mix no longer also says "count is required"; the clump parameters have one spec, shared
  by the scatter and its entries.

**Redesign 2, round 2** (8 findings, 3 severe):
- **Severe**, all from checking villages apart after the fact:
  - pinning one village changed its neighbour (a pinned village is seen, an unpinned one was hidden);
  - a village's ground (its hull or its own area) was never checked against the other's houses;
  - whether two nearby villages were valid depended on the seed, which broke reseeding.

  Fixed by checking **where a village can reach, whatever its seed**: a house's middle lies on the road between
  `from` and `to`, so the houses and yard lie in a band around that stretch (`villageBand`). Two villages whose
  bands (or one's band and the other's own area) come within 1 m are an error on both, before anything runs. Apart,
  neither can change the other, so there is no hidden output and no after-the-fact check. Tested: pinning leaves
  the neighbour equal on five seeds; the error is the same on ten seeds; the band holds every house on a bent road.
- **Moderate:** the house gap is one constant (`BUILT_GAP`); the generator's own checks run even when another
  parameter is wrong (they skip only a mix whose type is wrong); the message for a mix scatter's own fields no
  longer offers `set` for non-attributes.
- **Light:** the peers' copied feature map and pairwise list are gone with the redesign of the check; the system
  doc's front matter names decision 0028.

**Redesign 2, round 3** (8 findings, 1 severe): **stop** (the third round with a severe finding).
- **Severe:** on a bent road a village's ground, the convex hull of its houses, cuts across the bend up to 50 m
  from the road, outside the band the reach check trusted. A village inside the bend passed the check, and its
  result depended on its id (no error as `a-vil`, "placed 0 of 2 houses" as `z-vil`).
- The user chose **the hull of the stretch**: a village's zone is the convex hull of its stretch of road, widened
  as the band was, so its convex ground can never leave it; on a bend it claims the inside of the bend.

### Redesign 3: a village's zone

- `villageZone` replaces `villageBand`; `zoneGap` and `zoneToArea` measure filled convex zones.
- Taken with it from round 3: a village whose road is not finished before the run is an error rather than
  skipped; one issue per village naming every village too close; the zone test samples the ground's edges on
  stretches spanning the bend, and the reviewer's village-in-the-bend fails under either id; `HOUSE_SPAN` is
  exported by street-village (no second copy of the house sizes); the `check` comment states the new contract; a
  bad mix is no longer re-checked against its spec.
- Not taken: hiding peers from each other again. With a zone that holds every output, a peer it could see is
  always farther than the gap, so seeing it changes nothing (the pinning test checks it).

The round count restarts.

**Redesign 3, round 1** (6 findings, none severe: stop and fix what is worth it):
- **Moderate:**
  - a village with its own area keeps it as its ground, so its zone is now the stretch widened by its houses (not
    the hull of the stretch): the inside of its bend stays free;
  - a village whose road is unfinished before the run is an error only when there is another village.
- **Light:** the error says how far apart the two zones are; the zone's margin covers the centimetre rounding of
  its ends too; the obstacle prefilter skips on one far corner (every point of a house lies within its span of any
  corner).
- **Not taken:** a ground that follows the road instead of a convex hull (the user chose the hull of the stretch;
  a village on a U-shaped road claims the inside of the U).
- **Decision 0028** was amended during these rounds, before the PR merged; once on the epic it is fixed.
