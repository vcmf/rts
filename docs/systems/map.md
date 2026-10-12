---
status: current
last_reviewed: 2026-10-12
code: [src/map/street-village.ts, src/map/scatter.ts, src/map/reach.ts, maps/generated.map.json, src/map/seed.ts, src/map/noise.ts, src/map/generators.ts, src/map/meander.ts, src/map/clump.ts, test/map-gen.test.ts, maps/engine.ts, src/rulesets/ground.ts, src/rulesets/napoleonic-ground.ts, src/scenarios/m2-valley.ts, tools/build-sim-data.ts, test/map-sim.test.ts, src/map/schema.ts, src/map/catalogue.ts, src/map/validate.ts, src/map/resolve.ts, src/map/expand.ts, src/map/format.ts, src/map/geometry.ts, src/map/apply.ts, src/map/draft.ts, maps/kinds.json, tools/map.ts, tools/map-page-check.mjs, app/map.html, src/app/map/main.ts, src/app/map/worker.ts, vite.config.ts, test/map-language.test.ts, test/map-apply.test.ts]
decisions: [0015-era-generic-engine, 0020-track-m-on-an-epic-branch, 0021-two-metre-map-cell]
---

# The map engine: the language, the generators, the draft view and the sim compiler (Track M, M1–M3b)

A map is a strict JSON file (`maps/<id>.map.json`): a list of features, each with an id, a dotted kind from the
kinds catalogue (`maps/kinds.json`), one shape and attribute overrides. This system checks such a file, resolves
any feature's effective attributes, writes its expanded form, lays it into layers on the 2 m grid, draws them
flat on the draft page, and compiles them into the sim's data. The design is `docs/proposals/map-engine.md`; the
generators (M3) and the look compiler (M4) come next.

```
maps/kinds.json ──► checkCatalogue ─┐
<map>.map.json ──► validate ────────┼──► resolve (one feature, a season, a state) ──► attributes
                                    └──► expand (M1: sort; generators in M3) ──┬──► formatMap ──► <map>.expanded.json
                                                                               └──► apply ──► layers ──► draft ──► RGBA
                                                                                     (the page's worker, or `tools/map.ts draft`)
```

## Goals / non-goals

- Every problem is reported with the feature's id and a JSON path, as a list, never as a thrown error.
- The catalogue is the only place attributes, units, ranges and kinds are declared. Adding a kind or an attribute
  is a data change.
- The draft page shows exactly what the code computes: the page's worker and the CLI run the same functions.
- Not yet: generators (M3: a `gen` is validated but reported by `expand`), shared edges (`follow`, M3), water
  levels and carving, bridge decks and works' earthworks (M2), compiling to the sim's or the look's data (M2, M4),
  editing on the page.

## Constraints

- **Exact geometry:** the orientation test behind every crossing check runs on whole centimetres (the language's
  precision), so nearly collinear points never read as crossing.
- **Exact:** `src/map/` follows the sim's number rules (decision 0006, lint in `eslint.config.js`) and imports only
  itself and `src/sim/num.ts`, so the compilers built on it give the same bytes in Node and in browsers.
- **Resolution-independent, except barriers:** coordinates are metres with at most 2 decimals. Barrier lines lie on
  the 2 m lattice in 8 directions (decision 0021, proposal §3.6).

## Design

- **The catalogue** (`maps/kinds.json`, types in `src/map/schema.ts`):
  - `layers`, and `categories` that say which layers a category's kinds may set;
  - `attributes`, each with its layers, type (number, int, enum, string, object), unit, range, and whether it may
    change with the season or be a ramp;
  - `kinds` as presets along dotted paths. A kind inherits its shapes, references, priority and states from the
    deepest preset along its path that sets them (`kindMeta` in `src/map/catalogue.ts`).
- **Validation** (`src/map/validate.ts`):
  - the map's own fields, sources and presets;
  - ids, then each feature's kind, shape and geometry (`src/map/geometry.ts`): rings that do not cross
    themselves, holes inside, everything inside the extent, barriers on the lattice;
  - references and their target categories, attributes against the catalogue, seasons, states and generator
    names;
  - finally, loops in the references.
- **Resolution** (`src/map/resolve.ts`): the catalogue along the path, the map preset, the feature's own fields,
  the season's overrides (the catalogue's, then the feature's), the state's overlay. This is the one place the order
  lives.
- **Expansion** (`src/map/expand.ts`), by dependency, over finished features only (decision 0022):
  - a generator sees only finished features: the author's without a generator, and the generators that have
    already run (their output and children). One still to run is invisible, so its input (a guide, a region)
    never leaks;
  - each generator declares what it `reads`, as selectors (`src/map/generators.ts`), hard or soft. Hard: it
    cannot run without them, by name (a village's road, a scatter's `within` naming a feature). Soft: it keeps
    clear of them (a village's water, buildings, no-go zones, ways and barriers; a scatter's `avoid`), and a
    `within` by kind, which orders only softly. Meander and clump read nothing;
  - F waits for G when what F reads could match what G produces (G's id, its children's ids, the kinds of G and of
    its children). The strongly connected groups of that graph run in dependency order (Tarjan). Inside a group of
    generators that read each other, hard reads come first, then the ids, each seeing the finished features: a
    soft read of one not yet run sees nothing of it, but separation is mutual: a generator also keeps clear of the
    earlier members that wanted to keep clear of it (`keepClearOf`), so a ring of avoids ends up pairwise apart. A
    loop of hard reads is an error naming its members (those only waiting on it are skipped). The
    file's order never matters; a rename can change the order only inside such a group (and, as always, the
    renamed feature's seed). A generator whose reads include one that failed is skipped, so the first error is
    the one reported. Once everything has run, every selector that names a feature must name one of the expanded
    map. A feature's id may not be a category's name (a selector would mean both);
  - an author's id of the form `<parent>-<n>` (`childOf`), where the parent writes children, is reserved while
    the parent generates. To pin a street-village's houses, replace the village by its expanded form (it keeps the
    area it was given) and keep its houses; to pin a scatter's children, remove the scatter feature itself (its
    region would otherwise stay) and keep the children. A selector naming the removed scatter still means its pinned
    children;
  - each generator runs with its seed, `hash(map.seed, id, generator)` (`src/map/seed.ts`), so no other feature's
    change reaches it;
  - its feature takes the output shape and records `origin` (the generator, its parameters, `EXPAND_VERSION`);
  - the expanded map is validated like any map, in the author's order (so the paths name their file), then sorted
    by id; a generator's error is an issue on its feature;
  - a bridge whose road crosses its water more than once must say `near`. `crossings` (`src/map/geometry.ts`) is
    exact on whole centimetres: a point exactly on the other line is decided by simulation of simplicity (the first
    line shifted infinitesimally in a fixed direction), so a pass through a vertex crosses once and a touch
    nowhere; a line's own end on the other line takes its neighbour's side;
  - a pinned feature (no `gen`, with an `origin`) is just a feature.
- **The generators** (`src/map/generators.ts`: for each, the shape it reads, the shape it writes, its checked
  parameters):
  - `meander` (`src/map/meander.ts`): the look world's Kinoshita curve in the exact maths, along the author's guide
    line. Each bend varies its amplitude and length by a seeded noise, a cubic term holds the belt (± amplitude),
    and the bends ease out over half a wavelength at each end. The heading never strays more than 83° from the
    guide's, so the channel always advances: on a straight guide it cannot cross itself, whatever the seed (no
    goosenecks, the price of the guarantee). The guide's normal turns smoothly through each vertex. The generator
    refuses, naming the feature, rather than fold by chance:
    - a guide turning more than 90° at a vertex;
    - segments around a turn too short to ease it for the belt (each at least 1.4 · belt · θ);
    - a belt narrower than the stream.

    It runs on streams and rivers only;
  - `clump` (`src/map/clump.ts`): a radial polygon, so always simple, swung by seeded harmonics;
  - **children**: a generator may write features beside its own, each with the id `<parent>-<n>` and an `origin`
    naming its `parent`; a generator may also remove its own feature (a scatter's region);
  - `street-village` (`src/map/street-village.ts`), on a village `along` its road: houses on both sides between
    `from` and `to`, set back 3 m and facing the road, with seeded sizes and gaps; clear of water, buildings and the
    road where it bends back, other ways and barriers (a barrier by its band), each house tested as a whole polygon (`distanceToPolygon`, `src/map/reach.ts`: exact
    for lines and areas); the village's area, when it has none, the hull of its houses; fewer than `houses` is an
    error unless `min` allows it (with none, the village has no area);
  - `scatter` (`src/map/scatter.ts`), on an area kind given as its region: `count` clumps of the feature's kind and
    attributes, by seeded rejection sampling, each (at its largest radius, from clump's own harmonics) inside the
    region, `clearance` m clear of what it `avoid`s and of its siblings, and within `reach` of what it stays
    `within`. A selector is an id (a generator's id names its children too), a category or a kind prefix; a
    feature cannot name itself, and a `within` that matches nothing is an error. The largest radius comes from
    `clumpMaxRadius`, `clump`'s own bound. A selector that names a feature (an id, a child's id) must name one the
    map holds; a generator that ran and placed nothing still counts. Avoided features are skipped by their boxes
    and siblings sit in a grid: 200 children take about 15–25 ms. Circles and ellipses are measured as the 64-sided
    polygons that just contain them (`ringsOf`, `src/map/reach.ts`), so no distance to them comes out longer than
    the truth. Fewer than `count` is an error unless `min` allows it.
- **The base ground** (`relief.base`): seeded value noise (`src/map/noise.ts`), `height` its amplitude and `width`
  its scale, three octaves, filled from per-octave lattice tables (`addFbmGrid`, equal to `fbm` to the bit).
- **The layout** (`src/map/format.ts`): one feature per line, so diffs show which features changed.
- **Apply** (`src/map/apply.ts`): the expanded features into layers on the 2 m grid over the extent, in the
  proposal's fixed order (§4):
  - heights at the grid's nodes: the landforms summed, then the relief edits in painting order (`level`, `raise`,
    `lower`, `cut`, `ditch`, a way's `cut` or `raise`). A ridge's crest tapers over its last half-width. A scarp
    is a step: its face rises over `width` to the steep side, which stays up and returns to the ground over its
    back slope (`edge`, never steeper than the face), and it fades past its ends over the same length;
  - per cell, an index into the map's table of resolved features for each layer (ground, veg, water, way,
    barrier, built, zone), plus the vegetation's density with ramps evaluated, and the last cut or ditch (`edit`:
    drawn in the draft, and the mark the ruleset's crossing rule will read; other edits leave none);
  - a line takes the cells whose centre lies strictly within its half-width, and at least the cells beside it, so
    widths round the same way for every line (on even metres a 6 m stream and a 5 m road take 4 m);
  - painting order is priority, then id: the higher priority wins a cell and, at equal priority, the later id;
  - barriers by `barrierCells`, the one implementation of the cell rule (proposal §3.6), exact in integers;
  - water (step 3): a stream's level is the lower of its two banks (3 m beyond each edge, on the ground as the
    landforms made it, before any edit or channel, so a cut or another water by a bank cannot pull it down) less a
    0.4 m freeboard, taken every 2 m and never rising downstream (the line's order is the flow; `Layers.streams` keeps
    each profile). Its channel is carved from its depth (a ramp `along` gives pools), shallower toward the banks; a
    ford raises the bed to its depth over its width, where the stream passes nearest its point; a pond sits at its
    `level` or the lowest point of its shore less the freeboard, deepest 10 m in. Each water cell's depth is its
    body's level less the cell's mean ground (`Layers.depth`, mm);
  - a bridge decks the road's cells over the water at the height of the higher of the road's two ends, 4 m past
    each bank (the sim classifies them `bridge`: level, dry).
- **The draft** (`src/map/draft.ts`): one pixel per cell, north up, colours from categories and attributes (never
  kind names), hill shading from the north-west and contours every 2.5 m.
- **The page** (`app/map.html`, `src/app/map/`):
  - a worker compiles; the page draws with pan and zoom, outlines with ids, the play area, and the cell under
    the mouse with the feature in each layer;
  - errors are listed while the last good drawing stays;
  - a saved map or catalogue reaches the page through a small Vite plugin (`map-changed`, `vite.config.ts`) and
    recompiles.
- **The sim compiler** (`maps/engine.ts`, `tools/build-sim-data.ts`): a map's layers over its play area (square)
  become format 2 data, heights at 2 m, cost at 8 m, classes and depth at 2 m. Each cell's attributes
  (`groundCell`, typed by `src/rulesets/ground.ts`) are read by the ruleset into one of its terrain classes
  (`classifyNapoleonic`, `src/rulesets/napoleonic-ground.ts`), a module apart from the ruleset's table so its hash
  does not move. Interim readings: walls and fences as hedges, buildings as dense woods, a no-go zone as water
  deeper than every limit, a go zone as open, dry ground (the overrides come first). The fine grid has one node per
  cell, at its centre (origin a half-cell in from the play area's corner), so the sim's rounding to the nearest
  node finds the cell that holds the point; the map's edge is a half-cell inside the play area's. `maps/valley.map.json` (the S1e layout)
  compiles to `data/valley.simdata`, and the `m2-valley` scenario plays the S1e battle on it
  (`src/scenarios/m2-valley.ts`).
- **The CLI** (`tools/map.ts`): `check`, `expand` (`--check` compares with the committed file), `resolve`,
  `draft` (a PNG). `npm run check:data` runs `expand --check` on the example map.

## Tunables

The kinds' values and the attributes' ranges: `maps/kinds.json`. Its note says which values are sourced
(`docs/research/terrain-taxonomy.md` §4) and which are tuned.

## Verification

`test/map-apply.test.ts`:
- the barrier rule: 2 cells on an axis; a 3-cell staircase on a diagonal that no 8-direction walk crosses;
  square-cut ends and a 2-cell gate; a sealed corner and a sealed closed yard; gaps by step;
- painting order, the relief (a hill's peak, a ridge's steep side, a level edit, a ditch, a scarp's step, its
  back slope and its ends), each layer, a bridge deck, a density ramp, line widths, a ditch under a later raise;
- determinism: the example's layers and draft hash to committed values;
- locality: moving one wood changes only its old and new cells and no height.

`tools/map-page-check.mjs` (headless, against the dev server): the page compiles on load; a saved change redraws
it in under a second (about 0.25 s measured on the dev Mac); a broken file shows its error and keeps the drawing;
the restored file compiles clean; no console errors.

`test/map-gen.test.ts`:
- seeds: stable, and local (another feature, the file's order, the map's seed);
- meander: within 1.35 × its belt, on its guide at both ends, never crossing itself, longer than its guide;
- clump: simple, within its bounds, a circle at coherence 1;
- the base noise: within ± its height, flat without one;
- the fast paths equal to the plain ones (the line index against the scan on 4000 points, the grid noise against
  `fbm`);
- the validator's generator checks; expansion's origin and pinning; the bridge that crosses twice.

`test/map-gen.test.ts` (M3b): street-village's houses (both sides, within the stretch, facing the road, clear of
each other, the road and the water, inside the hull); scatter's children (inside the region, clear of what they avoid
and of each other, within reach), its errors and `min`, its locality; five seeds of `maps/generated.map.json` that
validate, expand, compile to sim data and run two minutes of the S1e battle with finite state, all different.

`test/map-sim.test.ts`: the valley's stream never rises downstream, its depths are as designed (channel, fords,
pools, banks); each ground reading in order, and the valley's cells read as the map says; the compiled data loads
at its pinned version with its cells; ten minutes of the battle on it match a committed golden and replay. Every
existing golden is unchanged (the ruleset's hash included). Ten minutes of the S1e battle end with nearly the
same positions and strengths on the valley as on the original battlefield.

`test/map-language.test.ts`:
- the catalogue checks clean, and a broken one is reported;
- the base map and `maps/two-ridges.map.json` validate;
- one negative test per validator rule, each asserting the id and the path;
- resolution in its order, including a state's overlay over the feature's own field;
- expansion and the layout;
- the committed expanded example;
- the lint rules on `src/map/`, with a negative fixture.

## Open questions

- Which kinds the first catalogue carries beyond today's essentials (proposal §14).
- Whether references between kinds that can loop (a stream joining a stream) are needed; the loop check is tested
  with a catalogue that allows one.
