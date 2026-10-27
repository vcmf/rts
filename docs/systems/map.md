---
status: current
last_reviewed: 2026-10-26
code: [src/map/street-village.ts, src/map/scatter.ts, src/map/reach.ts, maps/generated.map.json, src/map/seed.ts, src/map/noise.ts, src/map/generators.ts, src/map/meander.ts, src/map/clump.ts, test/map-gen.test.ts, maps/engine.ts, src/rulesets/ground.ts, src/rulesets/napoleonic-ground.ts, src/scenarios/m2-valley.ts, tools/build-sim-data.ts, test/map-sim.test.ts, src/map/schema.ts, src/map/catalogue.ts, src/map/validate.ts, src/map/resolve.ts, src/map/expand.ts, src/map/format.ts, src/map/geometry.ts, src/map/apply.ts, src/map/draft.ts, maps/kinds.json, tools/map.ts, tools/map-page-check.mjs, app/map.html, src/app/map/main.ts, src/app/map/worker.ts, vite.config.ts, test/map-language.test.ts, test/map-apply.test.ts, test/map-trees.test.ts, test/map-follow.test.ts, src/map/follow.ts, src/map/dem.ts, tools/dem-import.ts, tools/dem-tiff.ts, src/render/lit/view.ts, src/render/lit/bake.ts, src/render/lit/paper.ts, src/render/lit/houses.ts, src/render/lit/overlays.ts, maps/cell.ts, src/render/lit/shaders/lit.frag, test/render-lit-bake.test.ts, test/render-lit-houses.test.ts, maps/austerlitz.map.json, maps/dem-test.map.json, test/map-dem.test.ts, src/map/write.ts, tools/map-save.ts, src/app/map/edit.ts, src/app/map/editor.ts, src/app/map/draw.ts, test/map-draw.test.ts, src/app/map/fields.ts, src/app/map/form.ts, src/app/map/pin.ts, test/map-fields.test.ts, test/map-pin.test.ts, src/app/map/scan.ts, src/app/map/scan-gl.ts, src/app/map/trace.ts, test/map-scan.test.ts, tools/geo.ts, tools/scan-wms.ts, tools/streams.ts, test/map-streams.test.ts, tools/water.ts, test/map-water.test.ts, maps/austerlitz-water.json, tools/ways.ts, test/map-ways.test.ts, maps/austerlitz-ways.json, tools/works.ts, test/map-works.test.ts, maps/austerlitz-works.json, test/map-write.test.ts, test/map-edit.test.ts, test/map-save.test.ts, test/map-editor.test.ts]
decisions: [0015-era-generic-engine, 0020-track-m-on-an-epic-branch, 0021-two-metre-map-cell, 0028-generators-form-a-chain, 0029-free-standing-trees, 0030-shared-edges-are-the-line, 0063-real-relief-as-placed-pieces, 0064-lit-view-flat-plane-baked-in-the-worker, 0065-map-ink-as-distance-fields-houses-as-boxes, 0066-editor-writes-the-intent-file-in-place, 0067-ids-are-named-when-made, 0069-scans-placed-in-their-relief-frame, 0070-a-field-as-a-scale-model, 0073-modern-works-mended-from-their-surroundings]
---

# The map engine: the language, the generators, the draft view and the sim compiler (Track M, M1–M3d, M5, M6a–c, M7a–c)

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
- Not yet: works' earthworks, compiling to the look's data (M4), areas sharing edges with other areas (only lines
  are shared).

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
  - the map's own fields, sources and presets: a `dem` source's file, hash, credit and licence; a `scan` source's image
    under `scans/`, the dem source its `frame` names, its control `points` (decision 0069);
  - ids, then each feature's kind, shape and geometry (`src/map/geometry.ts`): rings that do not cross
    themselves, holes inside, everything inside the extent, barriers on the lattice;
  - references and their target categories, attributes against the catalogue, seasons, states and generator
    names;
  - finally, loops in the references.
- **Resolution** (`src/map/resolve.ts`): the catalogue along the path, the map preset, the feature's own fields,
  the season's overrides (the catalogue's, then the feature's), the state's overlay. This is the one place the order
  lives.
- **Expansion** (`src/map/expand.ts`), as a chain over finished features only (decision 0028):
  - a generator sees only finished features: the author's without a generator, and the generators that have
    already run (their output and children). One still to run is invisible, so its input (a guide, a region)
    never leaks;
  - each generator declares what it `reads`, as selectors (`src/map/generators.ts`): a village its road, water,
    buildings, no-go zones, ways and barriers; a scatter its `avoid` and `within`. Meander and clump read nothing;
  - F reads G when one of F's selectors could match what G produces (G's id, its children's ids, the kinds of G and
    of its children; not a scatter's own kind, as its region leaves the map); a generator never reads itself. Street
    villages are peers (`peers`): they never read each other. A village can reach only its zone (`villageZone`,
    `src/map/street-village.ts`): the convex hull of its stretch of road, widened by half the longest house, the
    setback, the deepest house and a yard (its ground is the convex hull of its yards, so on a bend it claims the
    inside of the bend), plus its own area; a village with its own area keeps it as its ground, so its zone is only
    the stretch widened by its houses. Two villages whose reaches come within 1 m are an error on both (saying how
    far apart their zones are), before anything runs, so the seeds, the order and pinning one never change the
    other. A village whose road is not finished before the run (a generated line) is an error when there is another
    village to keep it apart from. The generators run in dependency order (Tarjan's strongly
    connected groups, each emitted after what it reads). The reads must form a chain: a group of two or more is a
    cycle, an error on each member naming what it reads, by which selector, and how to break it (drop one side's
    read; when all are scatters, place their kinds in one scatter's `mix`). So neither the
    file's order nor the ids change the output (beyond seeds). A generator reading one that failed (or a cycle) is
    skipped, so the first error is the one reported. Once everything has run, every selector that names a feature
    must name one of the expanded map. A feature's id may not be a category's name (a selector would mean both);
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
  - a pinned feature (no `gen`, with an `origin`) is just a feature;
  - **shared edges** (`follow`, `src/map/follow.ts`, decision 0030): an area's outer ring may take part of a line
    feature, so a wood shares a stream's bank. `{ id, offset?, from, to, at? }`, or a list: the edge is the line's
    own centreline between the points nearest `from` and `to` (as expanded, so it moves with a meander), in that
    order (on a closed line, the shorter way round), put before the ring's point `at` (default 0); the ring's own points hold the rest of the boundary (with a
    `follow`, as few as one; the whole ring is checked after expansion, and its errors say they count the expanded
    ring). The ring's other points decide the side. Expansion records `clear: [{ id, offset? }]` on the feature;
    `clear` may also be written by hand (a wood that keeps off a road it crosses). A feature with `follow` is in the
    chain (it reads the lines it follows, so it waits for a meander; what reads it waits for its ring), and
    `follow` leaves the expanded map. A street village's own area cannot follow (its reach is checked before
    expansion);
  - **keeping off a line** (`clear`, apply): an area paints none of the cells its lines take, computed by the very
    rule that paints each line (`paintLine` with `lineReach`, `barrierCells`, a cut's or a ditch's own mark, a
    sunken way's cut), widened by the offset (so a hedge's gates and a stream's ends keep their shape). So no cell is both the line's and the area's,
    and (offset 0) none between them is left out, at any angle, on any seed; a scatter whose region follows a line
    passes `clear` to its children (a mix's too). A ramp's `edge` counts from where the cells begin. Only ground,
    vegetation, buildings, earthworks and zones take `follow` or `clear` (`KEEPS_OFF`; relief edits move heights,
    water paints its own way), and a mix's entries too when its region does. Other readers of the ring (a scatter's `avoid` and `within`, a village's keep-clear, the look in M4) see
    it reach the line's centreline: an `avoid` keeps a little further off than it must, a `within` counts a
    little more as near. Open question: whether they should subtract the cleared band.
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
    `within`. With `mix: [{ kind, count, radiusMin?, radiusMax?, min?, coherence?, raggedness?, set? }, …]` in place
    of `count` and the clump fields, it places several kinds jointly, every child `clearance` m from every other
    whatever their kinds (each entry's children take its kind and its `set`, so the scatter's feature carries no
    attributes; the validator checks each entry against the catalogue). Each entry has 400 tries per child asked,
    so one that cannot be placed gives up without starving the others. This is how woods and fields keep apart: two scatters
    avoiding each other would be a cycle. A selector is an id (a generator's id names its children too), a category or a kind prefix; a
    feature cannot name itself, and a `within` that matches nothing is an error. The largest radius comes from
    `clumpMaxRadius`, `clump`'s own bound. A selector that names a feature (an id, a child's id) must name one the
    map holds; a generator that ran and placed nothing still counts. Avoided features are skipped by their boxes
    and siblings sit in a grid: 200 children take about 15–25 ms. Circles and ellipses are measured as the 64-sided
    polygons that just contain them (`ringsOf`, `src/map/reach.ts`), so no distance to them comes out longer than
    the truth. Fewer than `count` is an error unless `min` allows it;
  - `group`, on a tree point (`veg.tree.*`): `count` trees (2–5, default 3) within `spread` m of the point
    (default 3 crowns), trunks a crown's width apart so the crowns stand apart, each crown clear of water, ways,
    buildings and barriers, seeded; the point leaves the map and the trees, with its kind and fields, are its
    children.
- **Free-standing trees** (decision 0029): `growth: "tree"` kinds (`veg.tree`, `.poplar`, `.conifer`, `.willow`)
  with a `form` (round, columnar, conical), a `crown` radius and a row's `spacing`. A point is one tree, a line a
  row. They stand on the cells and change none: a poplar in a wheat field leaves the wheat. The validator keeps
  them their own kinds: `growth` cannot turn a feature into a tree or out of one, and `form`, `crown` and
  `spacing` belong to trees only.
- **The base ground** (`relief.base`): seeded value noise (`src/map/noise.ts`), `height` its amplitude and `width`
  its scale, three octaves, filled from per-octave lattice tables (`addFbmGrid`, equal to `fbm` to the bit).
- **Real relief** (`src/map/dem.ts`, decision 0063): a `dem` source names an `.rdem` heightfield beside the map
  (`file`, pinned by its SHA-256 `hash`, with its `credit` and `licence`), and each `relief.dem` feature places a
  piece of it: the whole extent with no shape, or an `area`, moved within the file by `shift` {x, z}, at true scale
  (decision 0061), or as a scale model (`scale` k, 1 to 4, decision 0070): a map point (x, z) reads the file at
  (k x + shift.x, k z + shift.z) and its height above the datum is the file's divided by k, so slopes and sight angles
  are the file's (`demPlace`, `toFile`, `toMap`: the one placement apply, the file checks and the scan read).
  Austerlitz is one piece at 2× (12 km of the field in 6 km); its water is written by `tools/water.ts` from
  committed inputs (`maps/austerlitz-water.json`): streams that follow the relief's valleys (`tools/streams.ts`: sinks
  filled, flats resolved, flow down the steepest of eight neighbours, the ground draining through each node summed, the
  channels traced from their heads) and the survey's ponds, moved onto them (M8b). Its ways are written by `tools/ways.ts` from `maps/austerlitz-ways.json`: each road a few waypoints on the scan, a junction named once so every road through it shares its pixel, each moved onto the ink near it, and between each two the cheapest path over the scan's ink (ink judged against its own sheet's paper); a spur at a waypoint beside the road cut; a road with an end running along another cut back to their fork, which both keep (a stretch left in two roads' middles refused); evened and simplified with its junctions and forks kept, placed through the scan's fit and the piece, cut at the map's edge. Only the tool's ways (known by their note) are written again. The survey gives a road's line, a road leaving no mark in the relief to follow (M8c). Its modern works (the D1, railways, quarries) are mended out of the relief by `relief.mend` (decision 0073: along a line the blend across it of the ground on each side, over an area the plane through its rim; mends apply first among the edits), written by `tools/works.ts` from `maps/austerlitz-works.json`, which traces each line over the relief where the ground stands well off its local mean (M8d). A piece sets the height in its area (the other landforms add) and blends into the ground under it
  over its `edge`; later landforms add on top and the edits apply after, so the 1805 cleanup is `relief.level`,
  `.lower` and `.cut` over the real ground. Heights are above sea level in the file and taken back to the map's
  frame by its `datum`, which a map with real relief must set.
  - The file: a 24-byte header (magic, version, size, cell in mm, base in cm), then u16 centimetres above the base,
    the south row first, in its own centred frame. It keeps the source's cell (5 m for DMR 4G); `apply` reads each
    2 m node by bicubic (Catmull-Rom) interpolation, so no 5 m lattice shows in the shading, with + − × / only.
  - `checkFiles` (in `validate.ts`) runs where the files are: each dem source's file is there and matches its hash,
    and each piece lies inside its file with heights within the catalogue's range above the datum. It returns the
    decoded files, which `apply` takes as its third argument. The CLI and `maps/engine.ts` read the files beside the
    map (`readMapFiles`); the page lists `maps/*.rdem` by a build glob, fetches the ones a map names and hands them
    to its worker; saving an `.rdem` recompiles the page.
  - The importer (`tools/dem-import.ts`): ČÚZK's DMR 4G (5 m, the default) or DMR 5G (2 m), asked for in a transverse
    Mercator at scale 1 centred on the crop, so the file's metres are true and north is up; large crops in tiles
    under the service's limit. It prints the source entry to paste. `tools/map.ts hash <file>` prints a file's hash.
  - `maps/austerlitz.map.json` is the field's real relief alone, 6 km square (`maps/austerlitz.rdem`: 13.5 × 9.5 km
    at 5 m, 10.3 MB); `maps/dem-test.map.json` is a 2 km test of pieces, an edit and a stream on real ground, small
    enough for the sim.
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
  - a line's nearest point (`nearLine`: a scan, or for a long line a bucket grid searched in rings) takes a cutoff:
    a caller that discards what lies beyond its reach (a channel, a painted line, a cut, a ridge's or a scarp's
    profile) passes it, so the nodes of a long line's box far from it cost one ring, not the whole grid (M8b: the
    Goldbach's apply from 172 s to 1.5 s, the whole map's 3.7 s); within the cutoff the answer is the full one;
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
    each bank (the sim classifies them `bridge`: level, dry);
  - free-standing trees are a list, `Layers.trees` ({ x, z, k }, k the feature in the table): a point gives one, a
    line as many as whole `spacing`s fit in its length (at least one), evenly, half a step in from each end. No
    layer, no density, no sim class changes.
- **The draft** (`src/map/draft.ts`): one pixel per cell, north up, colours from categories and attributes (never
  kind names), hill shading from the north-west and contours every 2.5 m. A way by its `surface` (earth, setts or
  cobbles, brick, metalled); a tree as a disc of its crown (a radius of at least 2 m, so a poplar reads), darker for columnar
  and conical forms.
- **The page** (`app/map.html`, `src/app/map/`):
  - a worker compiles, draws the flat draft and bakes the lit view's textures; the page draws the map in the **lit
    view** (`src/render/lit/`, decision 0064, M6a): one flat plane in Babylon, seen 20° off straight down (decision
    0055, `?tilt=`), its shader ported from the prototype's lit and shaded paths: the paper and its worn border, the
    woods darkening it, the shaded relief (slope light, cast shadow and exposure baked on the 2 m nodes, the light one
    of the grid's 8 directions, north-west for now), the water as a wash sunk below its banks, contours every 5 m and
    25 m from the node heights (a float texture read by `texelFetch`), the yards (a village's, a farm's), the ink, the
    paper's grain; the ink (decision 0065, M6b): the water, the woods and the barriers from their cells (what the sim
    reads), every cell reading as its own kind at its centre and every edge within half a cell of the cells' sides
    (`cellField`: smoothed for the water and the woods, square for the barriers, saddle corners joined); the ways'
    edges as crisp hairlines from their shapes at the width apply paints them, drawn only on and beside their cells;
    a pond's lining; hairlines of constant screen width that fade as the map zooms out; no texture mipmapped (thin
    features would vanish); the houses, barns and churches stand as boxes raised to their wall height (a burnt one
    roofless, a courtyard open) where at least half their cells are their own (`standing`, `src/render/lit/houses.ts`), lit by the map's light, each with its footprint swept away from the light as its shadow; the names
    (`zone.label`) are written on the overlay;
  - an "overlay" setting draws a debug overlay over the map (`src/render/lit/overlays.ts`, M6c), computed by the
    worker on the last compiled layers through the ruleset: passability for each of its unit kinds (terrain class,
    wading and slope), water depth, slope, and sight from a clicked point (the eye height, the relief, the sight
    table's woods); the features the validator names are outlined in red in place, and an error is a link to its
    feature;
  - a "view" setting shows the flat draft's colours on the same plane instead (a debug overlay); the outlines, ids
    and the play area are drawn on a 2D canvas over it, through the same camera (circles and ellipses as rings of
    ground points, so they lean with the view); pan keeps the ground point under the pointer, zoom keeps the one
    under the cursor, and the cell under the mouse shows the feature in each layer;
  - errors are listed while the last good drawing stays;
  - a saved map or catalogue reaches the page through a small Vite plugin (`map-changed`, `vite.config.ts`) and
    recompiles;
  - **the editor** (M7a, decision 0066, `src/app/map/editor.ts`, the edits in `src/app/map/edit.ts`): the page reads
    the map's intent (never the expanded map) into memory, edits it there and compiles each finished edit from that
    copy. A file whose structure the editor cannot read (`wellFormed`: features objects with a text id, presets
    objects, shapes as their kind of value) opens read-only, saying why.
    - A click selects the feature under it (`pick`: a point, else a line, else the smallest area holding the click;
      a generated child picks the feature it came from); a click on the selection's outline keeps it. The selection
      is drawn with its handles (a line's or a ring's points, a circle's centre and radius, an ellipse's centre and
      radii, a reference's `near`).
    - One state machine (idle, pressing, dragging, drawing) owns the copy. A press on the selection's outline or a handle
      that moves 4 px drags it (a press inside an area pans); commands wait for a drag to end; a file changed on disk
      during one is a conflict; a second pointer is ignored.
    - A drag moves a handle or the whole shape, rounded to the coarsest of 1, 0.1 and 0.01 m under a screen pixel. A
      barrier (by its kind's category, its own or its preset's) keeps its points on the 2 m lattice: a point snaps
      to the nearest lattice point that keeps its two segments whole (the engine's `barrierProblem`), else to the
      nearest lattice point; a whole barrier moves by lattice steps.
    - A double click adds a point; Delete removes the line's or ring's point under the pointer (on the shape's line
      but no point, nothing; off the shape, the feature). Adding or removing a point before a shared edge's `at`
      moves it with the ring. Undo and redo keep 200 edits; a change on disk read in clears them.
    - An edit always applies: what the validator finds in the edited copy shows at once (the selection red, the
      problem in the panel, the page's list); the compile's list follows. The editor holds no copy of the rules.
    - The save (Cmd or Ctrl S) goes through the dev server (`POST /__map/save`, `tools/map-save.ts`, JSON from the
      page's own origin only) with the text the page read, and is refused if the file changed on disk since (the
      page offers to overwrite it or take the file); a reply counts only for the file and base it was sent for. It
      rewrites only what changed (`writeMap`, `src/map/write.ts`): an unchanged feature or field keeps its bytes, a
      changed one is written on one line in place (or in the file's first bytes, when an undo brought it back), a new
      one appended, a deleted one cut. A change on disk with no unsaved edits is read in; the page's own save is not
      recompiled. The built page selects but does not edit.
    - The disk (M7b): the editor knows the file's last text (`base`, also the layout a save keeps) and whether the
      file is there (`exists`). A new map (the panel's "new map": its id names the file; name, size, play area, seed
      and season are the validator's to judge, at once) has no file yet; a file deleted under the page keeps its copy
      and layout. A save with no file creates it (the route takes no base as "create", never over a file there). A
      creation, a change and a deletion on disk come through one path (`Editor.onDisk`, text or none): the text the
      page knows settles (a delete and a write of the same bytes too); another, with no unsaved edits, is read in;
      else it is a conflict, whatever made it (a hand edit, another page's map of that id), and the panel says which.
      A new map file reaches the page as `map-changed` (the plugin's hot update runs after Vite's, whose glob of maps
      would reload the page) and joins the list.
    - Clicks are paired by the editor: the second click of a double click (within 600 ms and 4 px) is that gesture,
      never a click of its own. Idle, a double click on the selection's line or ring adds a point (not when its first
      click selected); drawing, it ends a line or an area whose point its first click added, and does nothing when
      that click ended the step.
    - Adding a feature (M7b, `src/app/map/draw.ts`): a kind from the catalogue, one of its shapes and an id proposed
      from the kind's last name (`wood2` when `wood` is taken: never a generated child's form); then clicks draw it
      (a point; a line's or an area's points, Enter, a double click or a click back on the first point ending it; a
      circle's centre and edge; an ellipse's centre, long radius and side), a barrier's points snapped as a drag
      snaps them, and each reference the kind takes is set by clicking its target (`on`, `carries`, `crosses`: a
      feature the validator's `refTargetProblem` accepts; `near`: a point; `along`: two clicks on a line, in metres
      along it; an optional one skipped with Enter). Backspace takes a click back, Escape drops the drawing. The
      feature is made in one edit and selected, and what the validator finds in it shows at once (only a kind the
      catalogue lacks and an id already used are refused). A press still pans while drawing. The selection's
      references are listed in the panel, each set again by clicking its target.
    - The fields (M7c, `src/app/map/fields.ts`, the panel's form in `src/app/map/form.ts`): the selection's id, kind,
      preset, priority, state, source, note, each attribute its kind's category takes (in the catalogue's order, with
      its unit, range or values, what it inherits as `resolve` gives it without its own value, and what the season or
      state makes it when they override it; any other it sets, to be seen and removed), its seasons as JSON; the
      whole feature as JSON to read and copy (its shape and references are edited on the map). With no selection the
      map's own fields (name, note, seed, season, datum, extent, play, sources, presets; its id shown).
      - A field shows the copy unless it holds text typed and not applied yet. That text is applied when the field
        changes (Enter, the focus leaving it: a press on another control), before a press on the map (whose drag
        would start first) and before a save, as one edit; emptied, the field is removed (it inherits). Refused (text
        that is no value of its kind, or the editor said no), it stays typed with the reason under it until changed,
        or Escape drops it, and no save is made while a field holds such text (nor an overwrite); closing the page
        asks while a field holds text not applied. The undo and redo buttons keep the
        focus in the field, so its text stays typed for the copy they bring back. In a field holding text, Cmd or
        Ctrl Z is the field's own text undo; Cmd or Ctrl S applies it and saves.
      - Its text is read as its kind of value only (a number's that is no number stays text for the validator to
        name). The validator's problems show under their fields (by path), those of no field above the JSON.
      - Ids are not edited in the page (decision 0067): a feature's is set when it is made, a map's names its file;
        a rename is done in the file (an id also seeds its generator and the base relief's noise, and names its
        children).
      - The form is built again only when its fields change (another kind); otherwise its inputs are given their
        values in place, so the field the focus moved to stays. Undo and redo keep the selection where it is (none
        stays none); a feature they bring back that was selected when its step was taken is selected again (a
        deletion undone). They leave text typed in a field typed. A field of no known kind is read as JSON when it is,
        else as text; a note is kept as typed.
    - Generators and pinning (M7d): the form's last rows are the selection's generator, a choice of every generator
      the engine has (what fits the feature is the validator's to say; a `gen` that is not one generator's shows as
      JSON, to mend), and its parameters from the generator's spec (`paramRows`), each read as its spec's type with
      its unit, range and whether it is required as hints. Another generator starts with no parameters. Each change
      is one edit, so the expansion is redrawn on each. The form shows the page's problems: the validator's at once
      after an edit, then the compile's of that copy, so the expansion's own (a village short of houses, a scatter
      that cannot place its count) show under the generator; each problem under the most specific row its path falls
      in. **Pin** (`src/app/map/pin.ts`, `Editor.pin`, one edit) runs the engine's expansion on the copy as it is,
      replaces the feature by its expanded form (no `gen`, with its `origin`) or removes it when its generator takes
      it off the map (a scatter's region, a group's point), and appends the children the expansion made (never one
      the file already has, pinned before) after the last feature, so the
      stable save rewrites its line and appends theirs. A copy that does not validate or expand is refused with its
      first problem, and so is a pin whose result would not validate or expand to the same map (checked, not
      assumed: a scatter that placed nothing and is named by another's `avoid` leaves nothing to name), and a pin
      while a field holds text it could not apply; text typed and not applied is applied by the press as its own
      edit, and Pin waits for its expansion to be drawn. The engine throwing (a catalogue the validator does not
      check) is a refusal saying so. Selected after: the feature, or its first child. A file read in,
      or a new catalogue, lists its own problems at once (the form never shows another text's).
    - The tracing overlay (M7e, decision 0069; `src/app/map/scan.ts` pure, `src/app/map/trace.ts` the page's): a
      `scan` source's image (under the git-ignored `maps/scans/`) drawn under the outlines at an opacity the panel's
      scan box sets (kept per map and scan in the browser), in each `relief.dem` piece cut from its `frame`'s file
      (clipped to its area, painted in the pieces' priority and id order; a piece of another file on top hides it and
      takes no click), read as the piece reads its file (its `shift`, its `scale`); with no frame, over the map unmoved. Its placement from its control points `[u, v, x, z]`: none, over the extent; one, moved;
      two, a similarity; three, the affine map through them; four or more, a thin-plate spline through every point,
      and back by Newton's method on it (a second spline the other way its first guess), each point's residual where
      the others alone put it, and their root mean square, shown in the panel; two points on one pixel or place keep
      the affine fit of them all, saying so (the page refuses a point where one is). The image is drawn on the GPU
      (`src/app/map/scan-gl.ts`): a 64 × 64 mesh of frame points over it (`scanMesh`), through the view's own matrix
      (`LitView.viewProjection`), so the tilted view's perspective is exact and the near limit is clipped there; each
      piece is drawn with its placement and composited through its area's clip into an offscreen canvas at full opacity,
      then onto the view. The image is decoded once into a bitmap; one larger than the GPU's texture limit is not
      shown, saying so. A point is added by two clicks (the editor's capture: Escape drops it, Backspace takes a click back),
      one edit of the map's sources: where a landmark shows on the scan, then where it is on the map; each listed
      point can be removed. `tools/scan-wms.ts` fetches an image of a WMS layer in WGS 84 around a centre and prints
      the source with its first points in the relief importer's transverse Mercator (`tools/geo.ts`, Snyder's
      series). `maps/austerlitz.map.json` carries the Habsburg First Military Survey's source with seven points at
      dated landmarks (Wikidata); the image itself is fetched by that tool.
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
the restored file compiles clean; each debug overlay paints cells and the view still draws with it off; the editor
selects the map's first line, drags its middle point through pointer events, compiles the copy, saves with one line
of the file changed, and undoes and saves back to the original bytes; with the largest area selected, a click on a line inside it selects
the line; a new map made in the panel and drawn by clicks (a base, an area, a stream and a ford on it, a road and a
bridge, a hedge, a circle) is saved into a new file that validates and reads back unchanged, and one more feature
saved adds one line (the file is removed after); through the form a note and another feature's attribute set, the
saved diff their lines alone, undone back to the original bytes, text typed and not applied kept or applied as it
should be; a clump's generator removed, chosen again and a parameter set (its outline redrawn, its line alone
changed), a village's expansion problem under its generator, the village pinned and saved (its line rewritten, its
houses appended, the same houses compiled), all undone back to the original bytes; a test scan added to the map's
sources and shown, three control points added by clicks (each block of the image then on its place), saved (only the
sources changed), undone back to the original bytes; no console errors.

`test/map-write.test.ts` (M7a): every map in `maps/` written back unedited is byte for byte its file; a moved point
changes one line; a feature added, deleted (first, middle, last), reordered; a map field changed, added, removed; a
hand-written multi-line feature kept; strings with escapes and brackets; an edit undone after a save written back in
the file's first bytes. `test/map-edit.test.ts`: picking (points, lines, the smallest area, a generated child's
parent), handles, moves and rounding, adding and removing points, every snapped barrier point valid where a valid one
is near, a closed barrier's first point, points added to and removed from a barrier, the history.
`test/map-save.test.ts`: the server's save writes over its base, refuses a stale base and any other path, reports a
write that fails. `test/map-editor.test.ts`: the editor with a fake page and server: a drag and its undo, no step for
a press that changes nothing, the history cleared by a change on disk, Delete, one save at a time, a save unanswered,
a file from disk that is no map. `test/map-draw.test.ts` (M7b): every kind of the catalogue drawn as every shape it
takes with its references clicked, its shape and references valid; barriers snapped valid; `along` from two clicks;
Enter, Backspace, Escape; the editor's drawing (one edit, one undo, no command and a conflict until it ends, a taken
id refused, a reference set again); a new map saved with no base, read back and written unedited byte for byte.
`test/map-save.test.ts` also creates a new file and refuses to create over one. `test/map-fields.test.ts` (M7c):
every attribute of the catalogue set through the form's reading of text, good with no problem on a kind it means
something on, bad with one at its field; reading text by kind (decimal numbers, untrimmed notes, JSON or text for an
unknown field); the editor's field and map edits, its refusals, undo's selection; (M7d) every parameter of every
generator set from good text with no problem and from bad text with one at its path, the parameter rows, the
generator edits, the editor's pin (one edit, the selection after, its refusals). `test/map-pin.test.ts`: every
generated feature of `maps/` pinned, alone and all together, validates and expands to the same expanded map as the
original, and the stable save changes its line and appends its children, nothing else. `test/map-scan.test.ts`
(M7e): a scan's placement from 0 to many points (an affine image kept affine, a bent one followed between its points,
a point that is off told by its residual, points in a line), its inverse; the pieces it shows in, moved and on top;
the validator's checks of a scan source; the transverse Mercator against Snyder's worked example and a WMS image's
points.

`test/map-gen.test.ts`:
- seeds: stable, and local (another feature, the file's order, the map's seed);
- meander: within 1.35 × its belt, on its guide at both ends, never crossing itself, longer than its guide;
- clump: simple, within its bounds, a circle at coherence 1;
- the base noise: within ± its height, flat without one;
- the fast paths equal to the plain ones (the line index against the scan on 4000 points, the grid noise against
  `fbm`), and the search cut off at a distance equal to the full one within it (M8b);
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

`test/map-dem.test.ts` (M5): the `.rdem` round trip and its refusals; SHA-256 against Node's; bicubic exact on the
nodes and on a quadratic surface between them, with constant second differences along a 2 m profile (no lattice);
a whole-extent piece and its shift, an area piece's inside, blend and outside; (M8a) a scale model's heights and its
slopes the file's; the same bytes twice; the validator's and the file checks' refusals (a scale model past its file, a
scale below 1); the test map's real heights and its sim compile.

`test/render-lit-bake.test.ts` (M6a): the relief bake on flat ground, the cast shadow away from the light for each of
its 8 directions, the exposure of a block's top and foot, no seam at the grid's edge; the cells' mask with its yards;
(M6b) a way's field, its square ends and its cells' gate, the widths `waysOf` takes from `lineReach`, the contract
(every cell's kind at its centre on stair-steps, saddles, one-cell lines and diagonals), a cell field's 0 on the
cells' sides, a smoothed diagonal without stairs, narrow streams and clearings kept, diagonal cells joined, a wood's
clearing taken by priority, a hedge's gate. `test/render-lit-houses.test.ts`: which buildings stand (their own
cells, a cell lost on a shared wall, a burnt roof, a courtyard) and footprints into triangles (convex, an L, a corner
on a straight edge, a courtyard). `test/render-lit-overlays.test.ts` (M6c): passability by the ruleset's own kinds on
open ground, in a wood, past the wading limit and on a slope; sight over flat ground, behind a ridge, into a wood.

`test/map-language.test.ts`:
- the catalogue checks clean, and a broken one is reported;
- the base map and `maps/two-ridges.map.json` validate;
- one negative test per validator rule, each asserting the id and the path;
- resolution in its order, including a state's overlay over the feature's own field;
- expansion and the layout;
- the committed expanded example;
- the lint rules on `src/map/`, with a negative fixture.

## Open questions

- A real-relief piece keeps its own absolute heights, so a piece cut from higher ground stands as a mesa until an edit
  lowers it (`maps/dem-test.map.json`'s knoll). A `lift` on the piece, or blending its difference to the ground
  under it, would join pieces without edits; decide when step 4 arranges Austerlitz.
- Rotating a piece (`turn`), if a designed map needs one.
- A 6 km map compiles in about 3.5 s and 540 MB in Node (`apply`, float64 heights and the layers); the page's worker
  holds the same. The sim's compact grids (S-data) are needed before a 6 km map compiles for the sim.

- Which kinds the first catalogue carries beyond today's essentials (proposal §14).
- Whether references between kinds that can loop (a stream joining a stream) are needed; the loop check is tested
  with a catalogue that allows one.
