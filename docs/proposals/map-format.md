---
status: draft
last_reviewed: 2026-10-10
---

# Proposal: the map format, one description of a battlefield

A structured, schema-checked data format that describes a battlefield by what is on it (relief, water,
ground cover, roads, settlements, works), from which deterministic compilers build everything that
needs a map: the simulation's terrain, the 3D battlefield and the staff map. Real battlefields are
imported into it, and maps we invent are written in it.

**Not natural language.** A map file is data with fixed field names, types and units, parsed and
validated like code. No step from the file to the screen needs an LLM or any judgement. An LLM may
help a person *write* a file (for example by tracing a historical map), but what it writes is checked
by the same schema as anything else, and is then just data.

## 1. Why

Today there is no map format. There are two maps, each defined in code:
- **The simulation's test field** (`maps/formation-field.ts`): a `MapDef` whose heights, terrain
  classes and water depths come from `prototypes/formation-core.js`, compiled to
  `data/formation-field.simdata` by `tools/build-sim-data.ts`.
- **The look world** (`src/look/world/author.ts`): formulas for the relief (`baseH`), the meander's
  generation and the channel carve, compiled to `data/painted-world.lookdata` by
  `tools/build-look-data.ts` (decision 0012).

They describe different places, and each consumer has its own idea of the ground. Several plans are
waiting for a format:
- W6 (`docs/plans/active/prototype-plan.md` §4): Austerlitz from real data, "defines the map file
  format" (`docs/proposals/engine-design.md` §10, item 11);
- the staff map (`docs/proposals/staff-map/design.md` §4): hachures, woods, water, roads, villages
  and names, drawn from map features;
- the engine map's "Map build" part (`docs/engine-map.md`): heightfield, rivers, roads, villages and
  AI hints from real data;
- the history videos: the same battlefield, faithful to the sources.

## 2. Goals and non-goals

**Goals:**
- One file per battlefield is the only source of a map. Every consumer's data is compiled from it.
- **Deterministic:** the same inputs always give the same bytes (decisions 0006, 0012). The inputs
  are the map file, the files it references (pinned snapshots, never a live download), the ruleset
  (for the simulation's outputs) and the compiler's version. Each output has a manifest beside it
  that records their hashes, so a stale output is found; the output files themselves keep their
  formats. Today's compilers use `Math.sin` and friends, whose results can differ between Node
  versions; as `tools/build-sim-data.ts` already says, the committed output is the authority, and a
  machine that builds other bytes is reported. New generators should use the restricted maths of
  decision 0006, so that this stops happening.
- **Semantic and resolution-independent:** features in metres (a stream's centre line and width, a
  wood's outline and density), not pixels or triangles. Grids, meshes and masks are the compilers'
  business, so the cell size or a bake's resolution can change without touching any map.
- **Era-generic** (decision 0015): the format names ground, water and structures by what they are.
  How they affect movement, sight and cover is the ruleset's data, not the map's.
- **Sourced:** every feature can say where it comes from (a survey, a DEM tile, a period map, an
  invention), so a historical map can be reviewed against its sources.
- **Reviewable:** plain text in git, readable in a diff, with stable ids per feature.
- Both kinds of map: imported from real data, and authored (by hand or by a generator).

**Non-goals (for this proposal):**
- Scenarios: orders of battle, starting positions, objectives and triggers belong to a scenario
  file that references a map (`docs/engine-map.md`, "Order of battle", "Scenario editor").
- A visual map editor (later; it would read and write this format).
- A random map generator (later; it would write this format).
- Runtime streaming of map data: maps compile offline, as today.
- Changing how the simulation or the renderer store their data. The compilers write today's formats
  (`src/sim/data.ts`, `src/look/world/data.ts`); changing those is separate work, with its own data
  version.

## 3. The pipeline

```
 sources                         the map file                  compilers (Node, offline)       outputs (committed data)
 ───────                         ────────────                  ─────────────────────────       ────────────────────────
 DEM tiles + OpenStreetMap ──► importer ──┐                ┌──► sim compiler ──────────►  <map>.simdata (classes, depth,
 a traced period map ──► tracing tool ────┼──► <map>.map ──┤                                 cost; per ruleset, season)
 a person, by hand ───────────────────────┤   (validated)  ├──► world compiler ────────►  <map>.lookdata (heightfield, far
 a generator (later) ─────────────────────┘                │                                 ring, river samples, masks, scatter,
                                                           │                                 buildings)
                                                           └──► staff-map compiler ────►  <map>.staffmap (hachure field,
                                                                                             ink layers, labels)
```

- **Validation** runs before any compiler: schema, units, ranges, references between features (a
  bridge names a road and a stream that cross), geometry (closed rings, no self-intersection, inside
  the extent). A file that fails is rejected with the feature's id and the reason.
- **One heightfield** (decision 0012): relief and every height edit (carved channels, levelled
  village ground) are compiled once, into one heightfield on the SPEC's 1.79 m grid. The simulation's
  and the renderer's files both carry heights sampled from it, not from two evaluations of the map.
  Today they are two maps with two height builds; the migration (§7) merges them.
- **Compilers are pure functions** of their inputs (above). Any randomness (a meander's wiggle, tree
  placement) is seeded from the map's seed and the feature's id, so editing one wood never moves the
  trees in another. A feature may set its own `seed`, which wins (needed to reproduce today's river).
- **Per ruleset and per season:** the simulation's output depends on the ruleset (ground kinds to
  classes, speed factors, the slope curve) and on the season (a frozen pond is passable), so it is
  built per map, ruleset and season, and its data version identifies all three. The renderer's
  output is per map and season where the season changes geometry or masks (ice).
- **Outputs are committed and checked** (`--check` rebuilds and compares, as `npm run check:data`
  does today). The simulation asserts its data version on load (`src/sim/data.ts`).

## 4. The file

### Container

A recommendation, to be settled by the first PR (§9, open question 1): **JSON**, in a file named
`maps/<id>.map.json`, with:
- a `format` version (the schema's) at the top, so old files are migrated, never silently misread;
- the schema defined once in TypeScript (`src/map/schema.ts`), with a hand-written validator in the
  repo's style (no runtime dependency), and a generated JSON Schema so editors check files as they
  are typed;
- no expressions, no code: anything computed is a named generator with parameters (below), whose
  code lives in the compilers and is versioned with them.

### Coordinates and units

- A local frame in **metres**: x and z on the ground, y up, origin at the map's centre (both test maps
  span [−half, half] today). Which way north lies is a field of the map (`north`, degrees from +z;
  no convention exists yet, so the first PR fixes one).
- Heights in metres above a datum the map states.
- An optional **georeference** (the origin's latitude and longitude, the projection), used by importers
  and to overlay period maps; the compilers never need it.
- Angles in degrees, clockwise from north. Dates in ISO 8601.

### Top level

```jsonc
{
  "format": 1,
  "id": "austerlitz-1805",
  "name": "Austerlitz",
  "era": "napoleonic",                 // a ruleset id: the ruleset maps ground kinds to movement and sight
  "date": "1805-12-02",
  "season": "winter",                  // the default season; features may override per season
  "seed": 1805,
  "extent": { "w": 6000, "h": 4000 },  // everything the map describes, backdrop included, metres
  "detail": { "w": 2000, "h": 2000 },  // the battle's detailed area inside it; the play area and margins come from the world SPEC
  "georef": { "lat": 49.128, "lon": 16.762, "projection": "local-tangent" },
  "sources": [ { "id": "dem", "kind": "dem", "ref": "terrarium z14", "note": "…" } ],
  "relief": { … },
  "water": [ … ], "cover": [ … ], "lines": [ … ], "settlements": [ … ], "works": [ … ], "labels": [ … ]
}
```

### Every feature

```jsonc
{ "id": "goldbach", "kind": "stream", "geometry": { … }, "source": "dem", "note": "…", "seasons": { "winter": { … } } }
```
- `id`: stable, unique in the map; references and seeds use it.
- `kind`: from the format's closed list for that collection (a typo is an error).
- `geometry`: `point` `[x, z]`, `line` `[[x, z], …]`, `area` (an outer ring and optional holes),
  `circle` and `ellipse` (the shapes the test field uses), or a named `generator` with parameters
  (a meander along a valley axis, a scatter of rocks) whose shape the compiler computes.
- `priority`: where areas overlap, the higher wins; each kind has a default (bridge over water over
  road over hedge over wood over marsh over rough over field over open, as the test field resolves
  them today), so most features never set one.
- `source`: one of the map's `sources` ids (or `"invented"`).
- `seasons`: per-season overrides of the feature's properties (a pond `frozen` in winter, a field
  `ploughed` in autumn).

### The collections (first cut)

| Collection | Kinds (first cut) | Main properties |
|---|---|---|
| `relief` | `dem` (a heightfield file and its transform), `points` (spot heights and ridge or valley lines, interpolated), `generator` (a named generator with parameters: today's `baseH` becomes one) | plus `edits`: areas raised, lowered or levelled to a height, with a soft edge |
| `water` | `stream`, `river` (a centre line), `pond`, `lake` (an area), `marsh`, `ford`, `weir`, `dam` | width (constant or per vertex), depth, flow direction (the line's order), bank style per side (cut, bar, reed), `meander` parameters when the line is a guide and the compiler should generate the bends (today's author step) |
| `cover` | `open`, `meadow`, `pasture`, `field` (`crop`: wheat, rye, …; `state`: standing, stubble, ploughed), `orchard`, `vineyard`, `wood` (`density`, `leaf`: broad, conifer, mixed), `copse`, `heath`, `rough`, `rocks` (scattered stones; a radius of rough ground around each) | an area; `priority` where areas overlap |
| `lines` | `road` (`grade`: highway, road, track, path; width; surface), `sunken-road`, `hedge`, `wall`, `fence`, `causeway` | a line, width |
| `settlements` | `village`, `town`, `farm`, `building` (`role`: house, church, mill, barn, manor, barracks), `bridge` | a village by outline or along a road with a house count and a layout style; a building by footprint, orientation and role; a bridge names the line and the water it joins |
| `works` | `redoubt`, `fleche`, `entrenchment`, `abatis`, `battery` | footprint, facing |
| `labels` | `place`, `water`, `hill` | a point or a line, the text, a language, for the staff map |

The list is meant to grow by PR, each new kind with its meaning in every compiler (§5). Kinds stay
era-generic: a `redoubt` is earthworks in any era from antiquity to 1815.

### Intent versus detail

A map states intent; the compilers add detail:
- "a broadleaf wood at density 0.7 inside this outline" becomes trees placed by the world compiler,
  a stipple by the staff-map compiler and a `woods` class by the sim compiler;
- "a stream along this guide line, meandering with this amplitude" becomes river samples, a carved
  channel and banks, as `src/look/world/author.ts` does today for one river.

Where intent is not enough, a feature can pin the detail (a list of building footprints instead of a
house count; the river's exact centre line instead of a guide). Pinned detail always wins.

## 5. What each compiler makes of it

| Feature | Simulation (`.simdata`) | 3D battlefield (`.lookdata`, bakes) | Staff map |
|---|---|---|---|
| Relief | the heightfield (decision 0012), slope in the cost grid | the same heightfield, the far ring | hachures from the heightfield |
| Water | the class `water` and depth per 1 m node, from the water features' depths; a `ford` feature sets the depth where it lies | river samples, carve, water ribbon, bank paint | double ink line and a wash; names |
| Cover | the ruleset's class per node (wheat → `crops`, wood → `woods`, …), sight blocking | albedo masks, scatter (grass, crops, trees) | wood edges and stipple; fields not drawn |
| Lines | the ruleset's class for each (a road speeds and levels; a hedge slows: `src/rulesets/napoleonic.ts`) | road paint and edges, hedge and wall meshes | double or dashed hairlines |
| Settlements | building footprints impassable, villages as cover | buildings from assets by role (Track E LA) | ink blocks, church crosses |
| Works | footprints, cover | earthwork meshes | ink outlines |
| Labels | nothing | nothing | serif labels |

The sim compiler's mapping from a ground kind to a terrain class lives in the ruleset
(`src/rulesets/`), next to today's terrain table, so a new era changes the meaning of ground without
touching any map.

## 6. Importers and authoring

- **Real data (W6):** a Node importer reads elevation tiles (Terrarium) and OpenStreetMap features
  for a georeferenced box, and writes a map file: relief as `dem`, water, roads, woods and buildings
  as features, each with its source. Modern features that did not exist in the battle's year are
  removed or corrected by hand in the file, with a note.
- **Period maps:** a tracing tool overlays a georeferenced scan on the relief and writes features.
  Until it exists, features are traced by hand or with an LLM's help into the file; validation and
  review apply as to any edit.
- **Invented maps:** written by hand, or later by a generator, in the same format.

## 7. Migration (first steps for the workstream)

1. **The schema and the validator** (`src/map/`), with negative tests: one bad file per rule.
2. **Today's look world as a map file,** through named generators that call today's code: relief as
   `generator: painted-world-v1` (`baseH` and the far ring's heights), the river as `generator:
   meander-v1` with today's parameters, its valley axis (`axisX`) and its own `seed: 7`. The extent
   covers the far ring (2600 m: the river runs to ±1350 m), the detailed area is the 800 m tile. The
   world compiler rebuilds `data/painted-world.lookdata` **byte for byte** (`node
   tools/build-look-data.ts --check` passes unchanged); its manifest is a new file beside it.
3. **Today's sim test field as a map file,** in native features where they fit: its woods and marsh
   as circles and an ellipse, its hills as a `gaussian-hills` relief generator, its stream as a
   generator for `70 + 6 sin(0.03 z)`, its rocks as a `rocks` area seeded 11, and the kinds' default
   priorities in the order `prototypes/formation-core.js` resolves them. The aim is `data/formation-field.simdata`
   byte for byte; where rasterising a shape differs at its edge, the PR shows the difference (nodes
   changed, the data version) and the owner accepts a new data version or a `legacy` generator for that
   shape.
4. **The staff map** reads its features from the map file (`docs/plans/active/staff-map.md`, SM2).
5. **W6, Austerlitz,** through the importer: the first real map.
6. **One heightfield per map** (decision 0012): the two test maps, or one merged world, compile their
   heights once and both outputs sample them.

Steps 2 and 3 are the proof that the format carries what exists: today's data stays the authority
until a step's check says it is reproduced.

## 8. Verification

- Validation: one negative test per rule (a typo'd kind, an open ring, a bridge naming no road, a
  feature outside the extent).
- Determinism: compiling twice gives the same bytes; the outputs' hashes are checked in `npm run
  check:data`.
- Equivalence: the migrated test maps compile to today's committed data, byte for byte (or with
  the differences shown and accepted, step 3).
- Staleness: a manifest's input hashes (map, referenced files, ruleset, compiler) match the inputs on
  disk; editing the ruleset makes the simulation's output stale.
- Locality: editing one feature changes only the outputs near it (a wood moved does not move another
  wood's trees), checked on a pair of files.
- Round trip: the importer's output validates, and re-importing the same box from the same pinned
  source snapshot gives the same file.

## 9. Open questions

1. **Container:** JSON (recommended: universal, strict, editor support through JSON Schema),
   JSON5 or YAML (comments and less noise, but looser parsers), or a TypeScript module (types, but it
   can hold code, which this format forbids).
2. **One file or several:** one file per map, or a folder with the relief, the features and the
   period sources apart (large DEM-derived feature lists are long).
3. **Time:** do maps describe one moment, or carry dated variants (a pond drained in 1806, a village
   burnt during the battle)?
4. **Overlap rules:** are per-kind default priorities (§4, `priority`) enough, or do some overlaps need
   blending (a wood thinning into a meadow)?
5. **Scale:** the format is metric and unbounded; the world SPEC limits what a battle can use
   (`src/look/spec.ts`). How a map larger than the play area is cut into battles.
6. **Where gameplay hints live:** terrain-intrinsic hints (a defensible ridge) in the map, everything
   about a particular battle in its scenario.
7. **Output size and shape:** today's formats are square (one span, one `n`) and the simulation's is
   dense: a 1.79 m float64 heightfield plus a 1 m class and depth grid. For the 6 × 4 km example that
   is about 200 MB per file, over GitHub's 100 MB limit. Real maps need non-square, chunked or
   compressed outputs, built in CI or kept out of git. That is a change to the data formats (a
   non-goal here) which real maps will force.
8. **Seasons:** which seasons a map compiles by default (all four, or those its scenarios use).

## 10. Related

Decisions 0004 (the lowland meander river), 0006 (restricted float64), 0010 (the locked camera and the
staff map), 0012 (one heightfield, built offline), 0015 (era-generic engine). Documents:
`docs/proposals/engine-design.md` §4 and §10, `docs/proposals/sim-design.md` §2,
`docs/proposals/staff-map/design.md` §4, `docs/plans/active/prototype-plan.md` §4 (W6),
`docs/systems/river.md`, `docs/systems/look.md`.
