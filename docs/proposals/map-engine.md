---
status: draft
last_reviewed: 2026-10-12
---

# Proposal: the map engine, a language for battlefields and its generator

A map is a short JSON file written in a precise, closed language. A deterministic **generator** expands it into
exact features, and **compilers** turn those into the grids that the simulation, the 3D world and the draft view
read. The same compiled map can be viewed as a **draft** (2D, instant) or **rendered** (the painted 3D world),
with a toggle between them.

This builds on `docs/proposals/map-format.md` and keeps most of it: features in metres, stable ids, per-feature
seeds, pinned detail, compilers as pure functions, and the ruleset owning what ground means. It changes four
things:
- the generator and the draft view are in scope (they were non-goals);
- every feature is one shape with a dotted `kind` taken from a catalogue of presets;
- the physical model is five orthogonal layers;
- the compilers run in the browser as well as in Node, so the draft view previews exactly what ships.

Research behind it: `docs/research/map-generation-in-games.md` (AoE, 0 A.D., StarCraft, Total War, Civilization,
Recoil, terrain research), `docs/research/map-grids.md` (grid, square or hex, cell sizes, blocking, water),
`docs/research/terrain-taxonomy.md` (what terrain did in battle, the categories, essential versus bonus), and
`docs/research/map-language.md` (OpenStreetMap, Mapbox, CityEngine, LDtk, seeding, schemas).

## 1. Goals and non-goals

**Goals**
- **A precise language:** a closed vocabulary, units on every number, no expressions and no code. A typo is an
  error that names the feature and the field.
- **Simple to write, rich to express:** a ridge, a meandering stream with two fords, a wood thinning toward a
  meadow and a village along a road each take a few lines; a sunken road with hedges on both banks takes one.
- **Deterministic and local:** the same file always gives the same bytes, and editing one feature never moves
  another (seeds per feature id, never per position in the file).
- **Easy to test:** a 20-line map is a test case. Each stage's output (the expanded map, the grids) can be diffed
  and is golden-tested.
- **Draft and rendered views of the same map,** toggled on one page, reloading on save.
- **Era-generic** (decision 0015): the map records what the ground is. What it costs and what it hides is ruleset
  data.

**Non-goals for now:** a visual editor (later, writing the same JSON); the importer from real data (later, also
writing the same JSON); scenarios (orders of battle, objectives); streaming map data at runtime.

## 2. The model in one picture

```
 intent JSON (what you write)        expanded JSON (what the generator writes)       compiled grids
 ──────────────────────────          ─────────────────────────────────────────       ──────────────
 features: kind + shape +       ──►  the same features, generators run:         ──►  sim: heights, ground, depth,
 attributes, some with a "gen"       exact lines, polygons, buildings,               cost per kind
 (meander, clump, village, …)        widths and depths; no "gen" left                look: heightfield, cover, water
                                     (golden-tested, diffable)                       draft: the same grids, drawn flat
```

**Every point of the ground has five layers** (`docs/research/terrain-taxonomy.md` §3):

| Layer | Holds | Example values |
|---|---|---|
| **relief** | the ground's height, m (the bed, under water); may be negative | 182.4 |
| **ground** | what the surface is made of, and its state | material loam, moisture 0.4, stones 0.1 |
| **water** | an optional water body over the ground, with its own **level** | level 183.1 → depth 0.7 (derived) |
| **vegetation** | a low layer and an optional tree stand | a field's wheat: height 1.2 m; a wood's stand: leaf broad, density 0.7, height 22 m, crownBase 6 m |
| **features** | lines and footprints: ways, barriers (on the grid's cells), buildings, works | a hedge, a wall, a road, a house, a redoubt |

**Kinds are named bundles across layers.** A `marsh` sets the ground (peat, moisture 1) and the vegetation
(reeds). A `field.wheat` sets the ground (loam) and the vegetation (wheat, whose `stage` follows the season: standing in
summer, stubble in autumn, ploughed in winter). A `road.sunken` sets a way, a cut in the relief and, optionally, hedges on its banks. So the layers stay
few and orthogonal, while the kinds give the richness and stay data.

**Water is a level, not a negative height.** Depth = water level − ground. A river's level falls downstream, a
pond's level is set by its dam, and a flood or a drained pond changes the level, not the ground. Heights may still
be negative relative to the map's datum: a riverbed or a ditch sits below the land around it.

**Blocking is derived, never painted.** Steep relief blocks by slope, read over a few cells and limited per kind
of unit in the ruleset. Anything made of earth is relief, judged by slope and step height: a ditch, a sunken
road's cut, a parapet, a bank. Barriers built or grown on the ground (hedges, walls, fences) **live on the grid's
cells**, as walls do in Age of Empires and
StarCraft (§3.6): each is a run of cells with a height, a porosity (how see-through it is) and a crossing kind
(open, jump, climb, push, none). The ruleset turns these into movement, sight and cover. Only a `nogo` area overrides by hand, for the rare case the derivation gets wrong
(`docs/research/map-grids.md` §4).

## 3. The language

### 3.1 One shape for every feature

```jsonc
{
  "id": "goldbach",                 // stable, unique, permanent: seeds and references use it
  "kind": "water.stream",           // a dotted name from the catalogue (§3.2); a typo is an error
  "line": [[-600, -500], [-150, -40], [600, 480]],   // the shape: point | line | area | circle | ellipse
  "width": 6, "depth": 0.8,         // attribute overrides, in the catalogue's closed names and units
  "gen": { "meander": { "amplitude": 25, "wavelength": 180 } },   // optional: the generator that adds detail
  "seasons": { "winter": { "ice": 0.12 } },                       // optional: per-season overrides
  "note": "the Goldbach, after the 1805 survey"                   // optional, for people
}
```

That is the whole grammar. The other fields a feature may carry:
- `preset` (a map-level preset, §3.2), `priority` (who wins an overlap; each kind has a default; at equal priority the later id wins), `source` (where
  the data comes from), `state` (a scenario's changes: burnt, flooded, breached; §3.5);
- the reference fields below (`on`, `carries`, `crosses`, `near`, `along`, `follow`), and a `scatter`'s `avoid`, `within` and
  `min` inside its `gen` parameters (§3.4);
- in the expanded map only, `origin` (§3.4).

A crop's growth is its `stage`, an attribute, never `state`.

- **Shapes:** `point [x, z]`; `line [[x, z], …]`; `area` (an outer ring plus optional holes); `circle [[x, z], r]`;
  `ellipse [[x, z], rx, rz, angle]`. Metres in the map's frame: x east, z north, origin at the centre. Angles are
  in radians.
- **References** are by id, and every one is checked. A bridge `carries` a road and `crosses` a stream (with a
  `near` point when they may cross more than once: Expand, which knows the expanded shapes, fails with the
  crossing points when a bridge without `near` finds more than one); a ford sits `on` a stream `near` a
  point, snapped to the nearest point of the stream's expanded channel, so it stays put when the meander changes; a village lies `along` part of a road (`{ "id": …, "from": m, "to": m }`, metres along it). An area's edge may `follow` part of
  another feature's line, so a wood bounded by a stream shares the stream's bank instead of overlapping it
  (TopoJSON's shared edges, `docs/research/map-language.md` §2).
- **Ramps** are the only structured value: a number that varies between stops over a closed input (`edge`:
  distance in from the area's edge; `along`: distance along a line; `height`). For example, a wood thinning toward
  its edge: `"density": { "edge": [[0, 0.3], [40, 0.8]] }`. There are no other expressions.

### 3.2 Kinds: a catalogue of presets

`kind` is a dotted path through an era-generic catalogue (`maps/kinds.json`, checked by the validator). Each step of the
path is a preset of attributes, and the deeper step overrides the shallower one:

```
veg.wood               (the stand) density 0.6, height 20, crownBase 6, undergrowth 0.4; ground: litter
veg.wood.broad         leaf: broad; leaves on by season
veg.wood.broad.beech   height 28, undergrowth 0.15        (bonus: species are look first, sight second)
veg.wood.conifer.pine  leaf: needle; crownBase 10, undergrowth 0.1
```

The effective attributes of a feature are: the catalogue along its path, then a map-level preset if it names one
(`"preset": "moravian-orchard"`), then the feature's own fields. The validator can print any feature fully
resolved. Rulesets read **attributes, never kind names**, so adding a tree species or a crop is a data change that
touches no ruleset.

### 3.3 The categories

| Category | Kinds (essential) | Bonus, later |
|---|---|---|
| `relief` | `base` (seeded value noise: `height` the amplitude, `width` the scale; a landform, not a generator, since a field has no shape to pin), `hill`, `ridge` (along a line), `valley`, `plateau`, `scarp`; edits `raise`, `lower`, `level`, `cut`, `ditch` (a cut along a line, at least 2 cells wide, its cells also marked for the ruleset's crossing rule) | `dem` (an elevation file), `spot` heights, `basin`, `terrace` |
| `ground` | `meadow`, `pasture`, `field` (`.wheat`, `.rye`, `.oats`: loam under a crop whose `stage` is standing, stubble or ploughed), `rough`, `marsh`, `yard` (village ground); moisture and snow as season attributes | `heath`, `sand`, `rock`, `bog`, `mud` as a weather state |
| `veg` | `wood.broad`, `wood.conifer`, `wood.mixed`, `thicket`, `orchard` (rows), `reeds`, `scrub` | species presets, `vineyard`, `olive`, `wood.pasture`, `tallgrass`, `treeline` |
| `water` | `stream`, `river` (lines with width, depth, flow, banks), `pond`, `lake` (areas with a level), `ford` (on a stream) | `canal`, `weir`, `dam`, `millrace`, `flood` (a level over a meadow), breakable ice |
| `way` | `road.highway`, `road.lane`, `track`, `path`; `road.sunken` (a cut plus optional hedges) | `causeway`, `ferry` |
| `barrier` | `hedge`, `wall`, `fence` (on the grid: height, thickness in cells, porosity, crossing, gaps) | `palisade`, `stakes`, `abatis` |
| `built` | `house`, `barn`, `church`, `farm` (buildings plus a walled yard), `village` (generated along roads), `bridge` | `mill`, `town`, `manor`, `cemetery`, `quarry`; capacity and loopholes |
| `work` | `redoubt`, `fleche` (parapet, ditch, facing) | `entrenchment`, `battery`, `camp` |
| `zone` | `nogo`, `go` (overrides), `label` (names for the staff map) | `deploy` (belongs to scenarios; listed to be ruled out) |

Attribute names per layer (closed lists; units in the schema):
- **relief:** `height`, `width`, `profile` (round, flat, sharp), `steep` (the steeper side: `left` or `right` looking along the line, or `none`), `to`, `edge`;
- **ground:** `material`, `moisture`, `stones`, `wear`, `snow`;
- **veg:** `height` (m: a crop's or the canopy's top), `density`, `stage` (crops), `leaf`, `crownBase`,
  `undergrowth`, `rows` {`dir`, `spacing`}. Attributes are flat: each kind fills one vegetation layer, the low one
  (crops, reeds, scrub) or the stand (woods, orchards), so `density` on a wood is the stand's and on a field the
  crop's. What grows under a stand is its `undergrowth` and the ground kind beneath it;
- **water:** `level` or `depth`, `width`, `flow`, `bed`, `banks`, `ice`;
- **way:** `width`, `surface`, `cut`, `raise`, `hedges`;
- **barrier:** `height`, `thickness` (whole cells), `porosity`, `crossing`, `gaps`;
- **built and work:** `footprint`, `wall`, `roof`, `material`, `parapet`, `ditch`, `facing` (a work's parapet
  and ditch are relief edits, step 2 of §4).

The full taxonomy, with each preset's values and sources, is in `docs/research/terrain-taxonomy.md` §4.

### 3.4 Generators and pinning

A feature's `gen` turns intent into detail. Each generator is a named, versioned function in the compiler with
validated parameters:

| Generator | On | Makes |
|---|---|---|
| `meander` | `water.stream`, `water.river` | the bends along a guide line (today's Kinoshita curve from `src/look/world/author.ts`), with width and depth per sample (narrower bends, pools and riffles); the water level is the compiler's (§4) |
| `clump` | any area kind at a point | an organic outline of a given size, coherence and raggedness (0 A.D.'s ClumpPlacer) |
| `street-village` | `built.village` with `along` its road | houses (children) on both sides between `from` and `to`, set back and facing the road, clear of water, buildings, no-go zones, other ways and barriers; the village's area, when it has none, the hull of its houses; `min` |
| `scatter` | any area kind given as its region | `count` children of the feature's kind and attributes, each a `clump` of radius `radiusMin`–`radiusMax`, `clearance` m clear of the kinds or ids it `avoid`s and of each other, within `reach` m of what it stays `within`; `min`; or `mix: [{ kind, count, … }]`, several kinds placed jointly, each child clear of every other |

Expansion runs each generator after what it reads (hard: needs it; soft: keeps clear of it) and shows it only finished
features; the order and its rules are in `docs/systems/map.md`.

**The expanded map** is the same language with every `gen` run: exact lines, polygons and buildings. Each
generated feature records where it came from (`origin`: the generator, its parameters and its version). To hand-tune
a generated feature, **pin** it: copy its expanded form into the intent file, and it stops being generated. Tools
use `origin` to say "the generator now gives something else".

**Seeds** are `hash(map.seed, id, purpose)`, using integer maths. A child of `scatter` gets the id `parent/k`, so
it is as stable as its parent. Adding, removing or reordering features never reseeds others.

**Failure is loud.** A generator that cannot place what was asked (a scatter that finds room for 3 woods out of 5)
is an error, unless the feature says `"min"`. 0 A.D.'s silent partial placement is the pitfall to avoid.

### 3.5 Seasons and state

`seasons` overrides attributes per season (`spring`, `summer`, `autumn`, `winter`): a crop's `stage` and
height, leaves on or off, moisture, snow depth, ice thickness, a pond's level. The map's `season` field is the
default season. A scenario may also apply a `state` (burnt, flooded, breached): a named overlay in the catalogue
for the feature's kind (`built.house@burnt`: roof none, wall 1.5 m), applied over everything else.
A state never changes the kind; it only sets attributes, so it always wins. A breach at one spot is not a
state: the scenario adds a gap to that barrier (§3.6).

Precedence, lowest first: the catalogue along the kind's path, the map preset, the feature's own fields, the
season's overrides (the catalogue's, then the feature's), the state's overlay. A season beats a fixed value: a
field given its own crop height is still ploughed bare in winter, unless the feature overrides that season too.

### 3.6 Barriers on the grid

Hedges, walls and fences are **made of grid cells**, not exact lines, as walls are in Age of Empires and
StarCraft. This is a deliberate simplification for play and for the editor:
- **Readable and fair:** a barrier is exactly where its cells are, the same for the sim, the draft view and the 3D
  world. If the game ever becomes competitive, nobody can argue about a wall's edge, and a good editor can place,
  join and cut barriers cell by cell.
- **Thick:** a barrier is at least **2 cells (4 m)** thick, and its thickness is even (`thickness`, in whole
  cells, from the catalogue: a hedge 2, a wall 2, a fence 2; odd values are rejected, as the rule below would make
  them wider on diagonals than on axes). A one-cell barrier would leak on diagonals and read as a line on screen. The 3D world draws the barrier filling its band (a broad
  bocage hedge, a thick wall with its coping), so what you see is what blocks.
- **Snapped:** a barrier's line has its points on cell corners, and its segments run along the grid's axes or its
  diagonals (8 directions). The validator rejects any other direction and says which point to move, and the
  editor will snap as you draw.
- **One rule makes the cells:** a cell belongs to the barrier when its centre lies closer to the line than half
  the thickness (`thickness × c / 2`), strictly, and its nearest point on the line is not one of the line's two
  free ends. Joints inside the line are round, so corners stay sealed; the ends are cut square, so a barrier stops
  at its last point and two walls 4 m apart leave a 2-cell gate. A barrier whose last point is its first is
  closed (a walled yard): it has no free ends. Cell centres and line points are on whole metres, so the test is
  exact in integers (squared distances). Along an axis a 2-thick barrier is 2 cells, one on each side of the line;
  along a diagonal it is a staircase 3 cells across, which closes on every side. The sim, the draft view and the
  3D world all use this rule, from one function.
- **Gaps** are whole cells too, counted in **steps** along the line (a step is one cell, straight or diagonal):
  `"gaps": { "every": 12, "width": 2 }` opens the cells whose centre projects onto steps [12k, 12k + 2) from the
  line's first point, for k = 1, 2, … (a gap at step 0 would only shorten the line). A feature may also list its gaps by step.

Ways (roads, tracks) and areas (woods, fields) keep their free shapes: they only change speed and look, and their
edges can stay organic.

## 4. The pipeline

```
validate ──► relief ──► expand (generators) ──► apply (layers, fixed order) ──► compile (per consumer) ──► view / ship
```

- **Validate:** schema (closed objects, kinds from the catalogue, units and ranges), references, geometry (closed
  rings, no self-intersection, inside the extent). It reports every error with the feature's id.
- **Relief** comes first, always: the relief features (`relief.base` with its noise, the landforms) expand and
  are summed into the relief before any other feature runs. They read nothing but their own parameters.
- **Expand** runs every other generator and gives every feature its exact shape. Generators run in dependency
  order, never in the file's order (AoE II's and Civilization's lesson). A generator depends on the ids it
  references, and on every generator whose output or children could match the kinds it names (a `scatter`'s
  `avoid` and `within`, a village's water and buildings), never on itself. The dependencies must form a chain: a
  cycle is an error, and kinds that must stay apart are placed jointly by one `scatter`'s `mix` (decision 0023). A
  generator reads the relief and the expanded shapes of what it depends on, nothing else: a `meander` follows the
  valley, a `street-village` its road, a `scatter` avoids the woods. Its output is the expanded map.
- **Apply** writes the expanded features into the five layers, in a fixed order owned by the engine:
  1. **relief:** the base and the landforms (already built);
  2. **relief edits** from every feature, now that all shapes exist (a sunken road's cut, a parapet and its ditch,
     a village's levelled yards, `raise`, `lower`, `level`, `cut`), by priority;
  3. **water:** each stream's and river's level, set from the ground along its banks and falling downstream
     (always the compiler's rule, with or without `meander`), then its channel carved from its width and depth
     per sample, through any edit (a bridge spans it; a dam, later, sets a level step); ponds at their level;
     fords raise the bed where they sit;
  4. **areas:** ground and vegetation, by priority;
  5. **ways and barriers** (barriers over the areas they cross);
  6. **built and works.**
- **Compile:** pure functions of the expanded map, the catalogue, the ruleset (for the sim), the season and the
  compiler's version.
  - The **sim compiler** writes `.simdata` in today's format 2 (`src/sim/data.ts`), which stores each grid's
    cell: heights at 2 m, cost at 8 m, and each 2 m cell's terrain class (the ruleset's reading of its layers)
    and water depth, over the play area (M2; the fine nodes at the cells' centres). The sim reads classes, not layers, so format 2 holds everything it
    uses; a compact format (16-bit heights, §5) waits for a measured need.
  - The **look compiler** writes `.lookdata` (`src/look/world/data.ts`: heightfield, far ring, river samples,
    cover grid).
  - The **draft compiler** writes nothing to disk: the draft view draws the grids directly.

  A manifest next to each output records the hashes of its inputs, so a stale output is found.

**The compilers run in Node and in a browser worker,** using the sim's exact maths (`src/sim/num.ts`, decision
0006). So the draft view shows exactly what the build ships, the bytes match on every machine, and the
`Math.sin` caveat in `tools/build-sim-data.ts` disappears for new maps. Committed data stays the authority
(`npm run check:data`).

## 5. Grids

Every grid is **square**, with aligned origins and integer ratios between layers. Hex grids are worth it only
where units sit on tiles; ours move freely, and hexes would cost coordinate rounding (a determinism risk), GPU
addressing and resampling against the renderer's textures (`docs/research/map-grids.md` §2). Authoring stays
vector; grids are the compilers' business, so a cell size can change without touching any map.

One **base cell** `c` = **2 m** for every map grid (decision 0021), replacing today's 1.79 m. That number has no
meaning of its own: it is the prototype's 800 m tile divided into 448 cells, chosen so that a far-ring cell
(2600 m / 182 = 14.29 m) is exactly 8 tile cells. The sim copied it, rounded, so today's sim grid (1.79 m) and
look grid (1.786 m) do not even line up. At 2 m, everything aligns: cost cells are 4 cells (8 m), far-ring cells
8 cells (16 m), and the 0.5 m water and bank texels 1/4 of a cell.

What the switch touches (each change lands with the phase that rebuilds that data anyway):
- **sim (M2):** the map engine's maps compile on 2 m grids (format 2, with each grid's cell); the legacy builder
  keeps the legacy maps' 1.79 m and 7.16 m cells (`tools/build-sim-data.ts`). The battlefield's layout is written
  as a JSON map beside it (`maps/valley.map.json`, the owner's choice): S1e and its golden stay on
  `maps/battlefield.ts` until S1e moves to the map, with Track S, which then changes its data version and golden. The **formation field stays
  on its legacy builder, with its cells**: its terrain is the prototype's (`prototypes/formation-core.js`, shared
  with the formation prototype page), and it moves to the map engine only when that prototype retires (with #35).
  Its data and the goldens that use it (S1a–S1d) do not change;
- **look (M4, with Track E):** `tileSub` and `farSub` in `src/look/spec.ts` (the far ring's size becomes
  `tile + 2 × 16 m × k` to keep its grid lines on the tile's edge), the look data, the golden screenshots; the
  tile mesh has about a fifth fewer triangles;
- **docs:** the 1.79 m and 7.16 m figures in `docs/proposals/sim-design.md` §7 and the system docs, updated as
  each phase lands (closed plans keep theirs as history).

The grids at 2 m:

| Layer | Cell | Stored as | 1.5 km square |
|---|---|---|---|
| heights (sim and renderer: decision 0012) | `c` | float64 in today's format 2 (M2); u16 in 1 cm steps above the file's lowest point when a compact format is needed (655 m of range) | 1.1 MB as u16 |
| ground and veg, water depth | `c` | u16 index into the map's attribute table (one row per feature, resolved for the season and state), u8 density for ramps, u16 depth in mm | 1.1 + 0.56 + 1.1 MB |
| slope | derived at load; read over 2 or more cells for the impassable test | n/a | n/a |
| movement cost, per kind of unit | `4c` (8 m) | u8 speed factor | 35 KB per kind |
| clearance, per kind of unit | `c` for the footprint gate, `4c` for planning | u8, 0.5 m steps | 0.56 MB per kind |
| barriers | cells on the `c` grid, at least 2 thick, 8 directions (§3.6) | u16 index into the attribute table (height, porosity, crossing per feature) | 1.1 MB |

Runtime arrays stay quantized: today's `buildTerrain` expands the fine grid into float64 arrays (about 108 MB at
1 m over 1.5 km). Pathfinding is A* on the cost grid followed by path smoothing; there is no navmesh or hierarchy
until measured.

## 6. What the ruleset derives

The map records what a surveyor could see. The ruleset (`src/rulesets/`) derives what a drill-master would
conclude:
- **movement:** a speed factor per kind of unit, from ground firmness, vegetation density, slope, depth and the
  barriers crossed;
- **passability:** zero speed, by kind of unit (guns stop at 0.7 m of water, horse at 1.2 m);
- **sight:** an occlusion field built from ground + vegetation (height, crownBase, density, leaf) + barriers +
  buildings, with concealment accumulated through vegetation along the ray;
- **cover:** from what lies between a file and the shooter;
- **the roundshot's bounce:** from the ground's firmness under each graze (Waterloo's mud).

Today's terrain classes (`open`, `crops`, `woods`, `hedge`, …, `src/rulesets/napoleonic.ts`) become functions of
these attributes. The class names stay as labels for tuning and tests.

## 7. Draft and rendered views

One new page (app/map.html, to be built), one compiled map, a toggle between two views:
- **Draft:** a 2D top-down view: hill shading and contours, layers in flat category colours, feature outlines with
  their ids, and the expanded generators' output. Overlays show derived data: passability per kind of unit, water
  depth, slope, and sight from a clicked point. Hovering a point shows its five layers and the feature that wrote
  each. It redraws in milliseconds.
- **Rendered:** the painted 3D world from the look compiler's output, with the same camera rules as the game
  (decision 0002: no sky).

The page watches the map file. On save it recompiles in a worker and redraws, and the draft view shows the
validator's errors in place. Later, the editor adds direct manipulation (dragging points, painting areas) on the
draft view, writing the same JSON.

## 8. Testing

- **Validator:** one negative test per rule (an unknown kind, an open ring, a dangling reference, a feature
  outside the extent).
- **Golden expansions:** small intent maps under `maps/tests/`, each with its committed expanded JSON; a change to
  a generator shows up as a reviewable diff.
- **Locality:** moving one wood changes no other feature's expansion, except a `scatter` that avoids woods (it
  depends on them by design; pin its children to freeze them), and only the grid cells near it.
- **Determinism:** expanding and compiling twice, and in Node and in a browser, gives the same bytes.
- **A map CLI** in the tools folder (to be built): `check`, `expand`, `build`, `draft <map>`. `draft` writes a PNG of the draft view for
  headless checks and PR images.

## 9. Example

A complete small map: a valley between two ridges, a stream with a ford, a road over a bridge, a wood, fields, a
hedge and a village.

```json
{
  "format": 1, "id": "two-ridges", "name": "Two Ridges", "seed": 41, "season": "summer",
  "extent": { "w": 2400, "h": 2400 }, "play": { "w": 1500, "h": 1500 },
  "features": [
    { "id": "terrain", "kind": "relief.base", "height": 4, "width": 400 },
    { "id": "south-ridge", "kind": "relief.ridge", "line": [[-650, -300], [0, -260], [650, -320]], "height": 18, "width": 230, "steep": "right" },
    { "id": "north-ridge", "kind": "relief.ridge", "line": [[-650, 300], [650, 260]], "height": 14, "width": 260 },
    { "id": "meadows", "kind": "ground.meadow", "area": [[[-1200, -1200], [1200, -1200], [1200, 1200], [-1200, 1200]]], "priority": 0 },
    { "id": "brook", "kind": "water.stream", "line": [[-700, 20], [0, -10], [700, 30]], "width": 6, "depth": 0.8,
      "gen": { "meander": { "amplitude": 30, "wavelength": 190 } } },
    { "id": "ford-west", "kind": "water.ford", "on": "brook", "near": [-330, 10], "depth": 0.5 },
    { "id": "high-road", "kind": "way.road.lane", "line": [[60, -700], [70, 0], [40, 700]] },
    { "id": "bridge", "kind": "built.bridge", "carries": "high-road", "crosses": "brook" },
    { "id": "west-wood", "kind": "veg.wood.broad", "circle": [[-380, -190], 80], "gen": { "clump": { "coherence": 0.6 } },
      "density": { "edge": [[0, 0.3], [30, 0.8]] } },
    { "id": "wheat", "kind": "ground.field.wheat", "area": [[[-160, -216], [-20, -216], [-20, -136], [-160, -136]]],
      "seasons": { "autumn": { "stage": "stubble" } } },
    { "id": "wheat-hedge", "kind": "barrier.hedge", "line": [[-160, -136], [-20, -136]], "gaps": { "every": 12, "width": 2 } },
    { "id": "hamlet", "kind": "built.village", "along": { "id": "high-road", "from": 120, "to": 260 }, "gen": { "street-village": { "houses": 12 } } }
  ]
}
```

## 10. Order of work (Track M)

Track M works on an epic branch (decision 0020). The phases follow the pipeline, so each covers every category:

| Phase | What | Acceptance |
|---|---|---|
| **M0** | This proposal and its research; decisions 0020 (Track M on an epic branch) and 0021 (the 2 m cell) | The owner accepts the language, the layers and the grids |
| **M1: the language and the draft view** | The TypeScript schema and validator; the catalogue of essential kinds in **every** category; features with exact shapes (no `gen` yet); compiling into the draft view page, which redraws on save; the map CLI | §9's example, written with exact shapes, validates and draws; a save redraws in under a second; one negative test per rule |
| **M2: the sim compiler** | Water in apply: stream levels from the banks, falling downstream; channels carved, pools by a depth ramp, fords, ponds; a depth per cell. The ruleset's reading of a cell's attributes as its terrain classes; map-engine maps compiled to format 2 on 2 m grids; the S1e layout as `maps/valley.map.json`, with the S1e battle on it beside the original | The battle plays on the compiled valley; its golden is committed; every existing golden unchanged |
| **M3: the generators** | the base ground's noise, `meander`, `clump`, `street-village`, `scatter`, on the exact maths; seasons and ice; golden expansions | §9's example as written (with `gen`) expands and plays; five seeds give five distinct, valid maps |
| **M4: the rendered view** | The look compiler and the toggle between draft and 3D (with Track E: the look page loads any map's look data at 2 m) | The same map drafted and painted |

M1 and M2 are tested with hand-written exact maps, before any randomness exists.

Later: the editor (direct manipulation on the draft view), the importer (W6, writing the same JSON), and the staff
map reading map features (SM2).

## 11. Alternatives considered

- **Collections per category** (`relief: […]`, `water: […]`, as in `docs/proposals/map-format.md`) instead of one
  `features` list. They are more readable in a large file, but they encode the category twice (key and kind) and
  make the processing order look like the file's order. One list plus a dotted kind is simpler, and a formatter can
  group by category.
- **Painted grids as the source** (AoE IV's semantic grid, Paradox bitmaps): easy to draw, but resolution-bound,
  hard to diff, and they lose flow direction and exact edges.
- **A script language** (AoE RMS, 0 A.D.'s JavaScript): fully expressive, but a map becomes a program, which
  breaks the guarantees that make a map checkable (closed vocabulary, locality, golden expansions).
- **Hex grids:** see §5.
- **Water as negative height:** see §2.

## 12. Drawbacks

- **A catalogue to curate:** each kind's attribute values must be sourced or tuned, and some (period crop heights)
  are unverified (`docs/research/terrain-taxonomy.md`).
- **Exact maths for generators:** porting the meander and the noise to `src/sim/num.ts` changes today's look world
  slightly. It cannot be byte-for-byte; it is accepted on screenshots, like any data change.
- **The look page has to load any map:** today it is tied to one world and one SPEC size; that is Track E work
  (M4).

## 13. Decided (2026-10-12)

1. **Base cell: 2 m** (§5, decision 0021).
2. **Kind inheritance by path:** `veg.wood.broad.beech` inherits from `veg.wood.broad` and `veg.wood`, then one
   map-level preset, then the feature. The research's warning is about arbitrary `extends` chains that a reader
   cannot see; here the chain is the name itself. Without it, every species would repeat the wood's defaults, and
   the copies would drift. Limits: at most four levels, a level may only set attributes (never remove one), and
   the validator prints any feature fully resolved.
3. **Strict JSON,** with `note` fields for comments. The generator writes expanded maps, pinning copies features
   back, and the editor will rewrite the file: comments would not survive those round trips, and `note` does.
   Strict JSON also needs no parser dependency and gets editor checking from the generated JSON Schema. (The
   annotated snippets in this document use comments for explanation only.)
4. **Map size:** a 1.5 km play area, a detailed area of about 1.8 km around it (the camera's margin), and a
   backdrop out to about 2.4 km (the world spec sets the exact size from the camera's footprint).
5. **Track M** works in its own worktree on an epic branch; PRs go into the epic, and the epic merges into main
   when the track is done (decision 0020).
6. **Barriers on the grid:** hedges, walls and fences are runs of cells, at least 2 thick, in 8
   directions (§3.6), for readability, fairness and a simple editor.

## 14. Open questions

1. **Who owns the look's cover:** Track E's L5a authors it in `src/look/world/cover.ts` on its own branch (not
   on main yet); M4's look compiler takes it over.
   Until then Track E keeps it, shaped like this language's ground and vegetation kinds.
2. **Which kinds the first catalogue carries:** the essential column of §3.3, or fewer?
