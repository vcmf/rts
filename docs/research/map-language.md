---
status: research
last_reviewed: 2026-10-12
---

# What makes a declarative map language elegant and expressive

Research for the map format proposal (`docs/proposals/map-format.md`, draft of 2026-10-10).
Claims are tagged **[primary]** (spec, official doc, paper or its abstract page), **[secondary]** (a
summary or third-party doc), **[forum]**, **[unverified]** (from memory, not checked this session) or
**[inference]** (my conclusion). Where a source could not be fetched (several ACM/HAL pages blocked
bots), the tag says so.

## 0. Reading of the draft, in one paragraph

The draft already makes most of the right calls: a closed `kind` list per collection, metric
resolution-independent geometry, no expressions, named generators with parameters, per-feature seeds
derived from the map seed and the feature id, per-kind default `priority`, `seasons` overrides, and
"pinned detail always wins". What it leaves open, and what the systems below speak to, is: (a) how a
`kind` relates to its properties (preset or type?), (b) how neighbouring features share edges instead
of overlapping and resolving by priority, (c) what exactly a pinned feature records so a reviewer can
see that the generator would now produce something else, (d) the seed derivation's exact shape and
what may never change it, and (e) the line between a field (relief, wetness) and a feature (a wood).

---

## 1. OpenStreetMap: three primitives and free tags

**The model.** OSM has three element types: nodes (a point), ways (an ordered list of up to 2,000
nodes; closed ways are areas) and relations (ordered groups of members, each with an optional
*role*). Everything else is tags: "A tag consists of two free-format text fields", one value per key,
and there is no fixed dictionary [primary, https://wiki.openstreetmap.org/wiki/Elements].

**Why so little expresses the whole world.**
- *Geometry is separate from meaning.* A way is a way; `waterway=stream` or `barrier=hedge` makes it a
  stream or a hedge. Adding a new kind of thing never changes the geometry model [inference].
- *Orthogonal keys compose.* `natural=wood` + `leaf_type=broadleaved` + `leaf_cycle=deciduous` lets a
  consumer that only knows `natural=wood` still draw a wood. Refinement is additive: a consumer reads
  the keys it understands and ignores the rest [inference from the tagging practice].
- *Shared nodes are topology.* A road and a bridge share nodes; adjacent landuse polygons can share a
  way. Multipolygon relations make holes and disjoint parts, with roles `outer`/`inner`; a shared
  border way between two areas ("method B") "saves redundant geometry" but is "harder for
  inexperienced mappers", and editors have destroyed such relations by accident, so many mappers
  prefer unshared closed rings [primary, https://wiki.openstreetmap.org/wiki/Relation:multipolygon].

**Its problems.**
- *Ambiguity.* `natural=wood` vs `landuse=forest` is the classic case: "different people advocate
  different, conflicting tagging schemes", and as a result "nearly all data consumers treat both
  natural=wood and landuse=forest as synonymous" [primary, https://wiki.openstreetmap.org/wiki/Forest].
  Two tags meaning one thing is the price of an open vocabulary with no owner.
- *Sprawl and tagging for the renderer.* "You can use any tags you like" but "it is not OK to use wrong
  tagging for the renderer" and "unilaterally changing the definition of existing tags or keys is not
  OK" [primary, https://wiki.openstreetmap.org/wiki/Any_tags_you_like]. Freedom is policed by social
  consensus, not by a schema.
- *Convention drift that data consumers must carry forever.* Before May 2017 some multipolygons had
  their tags on the outer way; software "must support both the old and current conventions" [primary,
  Relation:multipolygon page]. Without a format version, every old convention is permanent.
- *Time is out of scope.* OSM records the present: "Historic objects with no relevance to the current
  state of an object generally do not belong in OpenStreetMap"; history goes to OpenHistoricalMap.
  Lifecycle prefixes (`disused:`, `abandoned:`, `demolished:` …) mark transitional states by
  prefixing keys [primary, https://wiki.openstreetmap.org/wiki/Lifecycle_prefix]. OpenHistoricalMap
  uses `start_date`/`end_date` on each element [unverified]. Lesson for our open question 3 (dated
  variants): a time window on a feature (`from`/`until`) is simpler than per-key prefixes.

**How styles render from it.** MapCSS is CSS for OSM: selectors on element type and tags
(`way[highway=primary]`), zoom ranges (`way|z1-11`), descendant selectors (`relation[type=route]
way[highway]`), and declarations in braces; it also has `set` and `eval`, i.e. it slid toward code
[primary, https://wiki.openstreetmap.org/wiki/MapCSS/0.2]. CartoCSS (the OSM standard layer) is
similar, with SQL queries per layer doing the tag interpretation [unverified]. Key point: in OSM the
*style* resolves the ambiguity (which tags count as "wood"), so every renderer re-solves it [inference].

**Lesson.** Keep OSM's separation of geometry and meaning and its additive refinement, but close the
vocabulary (our `kind` list) and give each kind a single owner: the importer is where OSM's ambiguity
is resolved, once, into our kinds, never in the compilers [inference].

## 2. GeoJSON, TopoJSON, vector tiles and the Mapbox GL style spec

**GeoJSON** (RFC 7946): a Feature has `geometry`, `properties` ("an object … or a JSON null value")
and an optional `id` (string or number). Exterior rings counter-clockwise, holes clockwise (but
parsers should not reject the opposite). "Foreign members" are allowed but "GeoJSON semantics do not
apply" to them, and extensions "MUST NOT change the semantics of GeoJSON members". It also warns
against "using a greater precision than necessary" [primary, https://datatracker.ietf.org/doc/html/rfc7946].
GeoJSON's elegance is its smallness; its weakness is that `properties` is untyped, so meaning lives
outside the format [inference].

**TopoJSON**: geometries reference shared *arcs* by index, so a border between two polygons is stored
once; "A negative arc index indicates that the arc at the ones' complement of the index must be
reversed"; optional quantization stores positions as delta-encoded integers [primary,
https://github.com/topojson/topojson-specification]. The point for us is not compression but
*consistency*: two areas that share an arc cannot gap or overlap along it, and editing the arc moves
both [inference].

**Mapbox Vector Tiles**: named layers, each with an `extent` in integer coordinates (e.g. 4096),
features with an optional `id` that "SHOULD be unique" in its layer, tags as indexes into per-layer
`keys` and `values` tables, geometry as MoveTo/LineTo/ClosePath commands with zigzag-encoded deltas
[primary, https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md]. Lesson: the
*compiled* form can be integer-quantized and resolution-bound; the *authored* form should not be. That
is exactly the draft's split between the map file and the compilers [inference].

**The Mapbox GL style spec and expressions — the key lesson.** Styles began with *functions*:
`{"property": "x", "stops": [[0, a], [10, b]], "type": "exponential"}`. They were declarative and
small, but a function "could reference only one property at a time and [was] limited to simple
input-output pairs"; GL JS v0.41 introduced *expressions* (JSON arrays whose first element names an
operator: arithmetic, conditionals, `get`, `zoom`, `interpolate`, `match`) and made the old functions
legacy: "Zoom and property functions are still supported but are not recommended" [primary,
https://maplibre.org/maplibre-style-spec/deprecations/; secondary summary of
https://blog.mapbox.com/announcing-expressions-in-gl-js-a72b55d0a6af, which returned 403 to the fetcher].
Expressions are type-checked, with explicit assertion and conversion operators and a `literal`
wrapper because an array would otherwise parse as an expression [primary,
https://maplibre.org/maplibre-style-spec/expressions/].

What that history teaches [inference]:
1. Any parametric vocabulary will meet a case it cannot say. The pressure to add a little logic is
   permanent, and once added, the file is a program (typed, needing a `literal` escape, an evaluator,
   a spec of evaluation order).
2. Mapbox needed expressions because a style is applied to *unknown future data* at *runtime*. A map
   intent file is applied to *one known map* *offline*. When it cannot say something, the right move
   is a new named generator or parameter in the compiler (reviewed, versioned, tested), or pinning the
   detail by hand. Our escape hatch is code in the compiler and literal data in the file, never logic
   in the file.
3. Keep one *structured* parameter type that covers 80% of what expressions were used for: a
   **ramp** (stops) over a named, closed set of inputs (distance from a feature's edge, along-line
   position, height). Mapbox's mistake was not stops; it was stops over only one input with no way to
   combine. A closed set of inputs keeps it data.

## 3. Procedural modelling grammars and declarative terrain

**CGA shape grammar** (Müller, Wonka, Haegler, Ulmer, Van Gool, SIGGRAPH 2006): production rules
refine a mass model into façades, then windows, doors and ornament; context-sensitive rules let parts
interact [primary, https://history.siggraph.org/?p=113547; paper PDF
https://course.ccs.neu.edu/cs5150f13/readings/muller_buildings.pdf]. CityEngine's `attr` keyword
declares named parameters with a starting value, evaluated once before any rule runs, and "The values
of attributes can be externally changed through the Inspector or by a map" [primary,
https://doc.arcgis.com/en/cityengine/latest/cga/cga-attr-keyword.htm]. That is the split we want:
**rules (code) are few and shared; parameters (data) are per instance, with defaults, overridable per
shape or from a map layer** [inference]. A village in our format should be "rule `village`, attrs
`houses: 24, layout: street`", not a mini-grammar.

**L-systems** (Prusinkiewicz and Lindenmayer, *The Algorithmic Beauty of Plants*, 1990, free at
algorithmicbotany.org): an axiom and parallel rewriting productions, parametric and stochastic
variants [secondary, https://en.wikipedia.org/wiki/The_Algorithmic_Beauty_of_Plants]. The relevant
idea is *amplification*: a small description expands to large detail, and a stochastic L-system is
reproducible only with a fixed seed and a fixed rewriting order [inference].

**Node-graph terrain tools.** Houdini heightfields are 2D volumes with named layers (`height`, `mask`,
plus any others, e.g. bedrock and soil); each SOP takes a field in and passes a modified one out
(Noise, Erode, Layer, Project, Terrace), and "most terrain nodes accept a second input containing a
mask" — masks are first-class data, drawn or derived ("Mask by Feature" from height, slope, facing)
[primary, https://www.sidefx.com/docs/houdini/model/heightfields.html]. Gaea and World Machine are
graphs of the same kind; Gaea primitives carry a `seed` property [primary,
https://docs.quadspinner.com/Reference/Primitives/Constant.html — secondary for the seed summary]. Gaea
also has macros [secondary, https://www.cgchannel.com/2024/08/quadspinner-releases-gaea-2-0].
Lesson [inference]: a graph is the right *internal* model of relief compilation (ordered operations,
masks as inputs), but a general graph in the file is a program. Our file should expose a **fixed
pipeline with named stages** (base relief → landform primitives → water carve → edits) where each stage
is a list of features, not a free graph.

**Terrain from primitives and sketches (research).**
- Génevaux et al. 2013, "Terrain Generation Using Procedural Models Based on Hydrology" (ACM TOG
  32(4)): "We present a framework that allows quick and intuitive modeling of terrains using concepts
  inspired by hydrology." From a sketch and a few parameters it builds a drainage network, derives
  watersheds and river types, and stores the terrain as a *construction tree* of primitives and
  operators (blend, carve); the result is analytic and continuous [primary for the opening sentence,
  https://history.siggraph.org/?p=108417; the rest secondary, the paper PDF could not be text-extracted
  here: https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf].
- Guérin, Digne, Galin, Peytavie 2016, "Sparse representation of terrains for procedural modeling"
  (CGF 35(2)): elevation as a sparse combination of *atoms* (landform patches from real DEMs or
  procedural primitives) in a "Sparse Construction Tree", with applications to inverse procedural
  modelling, **terrain amplification** and synthesis from a coarse sketch [primary abstract page,
  https://perso.liris.cnrs.fr/eguerin/new/blog/sparse-representation-of-terrains-for-procedural-modeling/].
- Galin et al. 2019, "A Review of Digital Terrain Modeling" (CGF 38(2), 553–577, Eurographics STAR):
  stresses "the need for user control over terrain features" and organizes methods in three
  categories [secondary for the categories; PDF https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf].
  I recall the categories as procedural, physically based simulation (erosion) and example-based,
  with sketch-based authoring as a control layer across them [unverified].

Lesson [inference]: the research line converges on **sparse, semantic, metric primitives** (a ridge,
a valley, a river with a class) blended in a defined order, with detail added by a seeded amplifier.
That is a direct model for the `relief` collection: `ridge`, `valley`, `hill`, `plateau`, `scarp`
as kinds with a profile parameter; the river network *drives* valleys, not the other way round
(Génevaux's order). It also argues for treating a DEM import as one primitive among others, so a
period map can add a sunken road on top of a DEM.

## 4. Game data languages

**Paradox (EU4).** Province shapes are a 24-bit `provinces.bmp` where "All provinces must have a
unique red-green-blue (RGB) color combination"; `definition.csv` maps colours to province ids;
`terrain.bmp` is an indexed bitmap whose palette indexes map, through `terrain.txt`, to terrain
categories (with `terrain_override` per province); `default.map` lists the files and sea and lake
provinces; `adjacencies.csv` adds non-contiguous links (straits, canals) with a "Through" province
[primary, https://eu4.paradoxwikis.com/Map_modding]. Elegance: *raster for shape, table for meaning,
explicit list for the exceptions topology cannot see.* Fragility: magic colours, pure black or white
crash the game, a palette order that must not change [primary, same page]. Lesson: rasters are fine as
*compiled* output or an *imported source* (a DEM), never as authored identity [inference].

**Civilization VI.** Terrains, features and resources are rows in a SQL database loaded from XML
(`Terrains`, `Features`, `Resources`, with join tables of which feature is valid on which terrain);
map scripts are Lua [secondary/forum, https://forums.civfanatics.com/threads/quick-modding-questions-thread.637803/page-53;
column names unverified]. Lesson: **the meaning of a kind (move cost, sight, defence) lives in a
table owned by the ruleset, not on map features** — the draft already does this (§5) and it is right.
Modders report that adding a new feature type means editing the Lua placement script, "messy" and
mod-conflicting [forum, same thread] — the cost of generation in code with no data seam.

**Age of Empires II RMS.** A purpose-built DSL: fixed sections processed in fixed order
(player setup, land, elevation, cliff, terrain, connection, objects) "regardless of how they're
written"; blocks like `create_land { terrain_type … land_percent … base_size … border_fuzziness …
zone … }` and `create_terrain { base_terrain … number_of_clumps … spacing_to_other_terrain_types …
terrain_mask }`; `rnd(min,max)` per value; `start_random / percent_chance / end_random` branching
[primary, https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/rms-features;
secondary, https://docs.racket-lang.org/aoe2-rms/random-code.html]. Elegance: a small vocabulary of
*placement intents* (percent of map, clumps, avoidance distances) with a fixed evaluation order;
designers write rich maps without geometry. Problems: random blocks cannot nest, a 0% branch is
"occasionally chosen" [secondary, racket doc]; randomness is one global stream, so adding a block
shifts everything after it [inference]. Lesson: AoE's *vocabulary* is a model for our generator
parameters (avoid distance, clumping, percent cover); its *global RNG stream* is the anti-model.

**Tiled (TMX/JSON).** Layers of four types (`tilelayer`, `objectgroup`, `imagelayer`, `group`);
objects are rectangles, points (`point: true`), ellipses, polygons and polylines relative to the
object's position; custom properties are typed (`string`, `int`, `float`, `bool`, `color`, `file`,
`object`, `class`), with named custom types; objects can instantiate a *template* file and override
its fields [primary, https://doc.mapeditor.org/en/stable/reference/json-map-format/]. Its naming churn
(`type` → `class` in 1.9, back in 1.10 [primary, same page]) is a warning about renaming core fields.
Templates with per-instance overrides are the *preset* pattern [inference].

**LDtk.** Root splits **definitions** (`defs`: layers, entities and their fields, tilesets, enums) from
**instances** (`levels`, `layerInstances`) [primary, https://ldtk.io/docs/game-dev/json-overview/];
every project, level and instance has an `iid` (a UUID) [primary for the existence of `iid`, same
page]; level content can live in separate files [primary, same page]. *Auto-layers*: an IntGrid layer
(cells holding small integers like "collision") plus rules — "grid patterns that will decide if a
specific tile should be painted" — so the designer paints *meaning* and rules paint *look*
[primary, https://ldtk.io/docs/general/auto-layers/]. The generated tiles are stored in the JSON
(`autoLayerTiles`) and rules carry a random seed per rule [unverified; not on the fetched pages]. The
format "evolves on each app update" and publishes deprecations with a JSON Schema per version [primary,
https://ldtk.io/json/]. LDtk is the closest analogue to our design: definitions vs instances, intent
layer vs derived layer, derived output stored for consumers, stable ids [inference].

**Godot / Unity terrain layers.** Godot 4 groups terrains in *terrain sets* with a matching mode
(corners and sides, corners, sides); tiles carry peering bits and a painter picks tiles from
neighbours; a tile can belong to several terrains, so terrains transition [primary,
https://docs.godotengine.org/en/stable/tutorials/2d/using_tilesets.html]. Unity's Terrain Layer is a
reusable asset (diffuse, normal, mask, tiling); the terrain stores per-layer splat weights, the first
layer is the base [primary, https://docs.unity3d.com/Manual/class-TerrainLayer.html]. Lesson: a
*look* layer is defined once and referenced; the per-map data is only weights. In our terms: the
palette and materials belong to the art side (`docs/art-bible.md`), a cover kind *names* a look, and
the map never carries texture parameters [inference].

## 5. Determinism and stable seeding

**Minecraft** derives seeds hierarchically: `setPopulationSeed(worldSeed, blockX, blockZ)` mixes the
world seed and the chunk's corner "through some layers of hashing"; `setDecoratorSeed(populationSeed,
index, step)` uses "The salt, in the form of `index + 10000 * step` [which] assures that each feature
is seeded differently"; `setCarverSeed` seeds large features; `setRegionSeed` seeds structure starts
per region ("a swamp hut region is 32 by 32 chunks") [primary, Fabric Yarn javadoc,
https://maven.fabricmc.net/docs/yarn-1.21.7+build.1/net/minecraft/util/math/random/ChunkRandom.html].
Note the flaw: the decorator salt is the feature's *index in a list*, so inserting a feature into the
list reseeds every later feature [inference] — exactly what our per-id seeding avoids. Minecraft also
had bugs where chunks generated differently depending on loading order [forum/bug tracker,
https://bugs.mojang.com/browse/MC-55596]: order independence must be designed, not hoped for.

**Dwarf Fortress** splits seeds by purpose: `[SEED]`, `[HISTORY_SEED]`, `[NAME_SEED]`,
`[CREATURE_SEED]`; the same seeds give the same world, but changing some parameters changes how many
random values are consumed, so "changing them produces a different world even with the same seed"
(paraphrase) [primary-ish community wiki, https://dwarffortresswiki.org/index.php/Advanced_world_generation].
Lesson: **seed by purpose as well as by entity** (shape, scatter, names), so changing a wood's
density does not change its outline [inference].

**No Man's Sky** generates planets continuously from a seed in a voxel → polygon → texture →
population pipeline (Innes McKendrick, GDC 2017, "Continuous World Generation in No Man's Sky")
[primary listing, https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No]; that seeds
derive from positions in the galaxy is widely reported [unverified].

**Noise-based RNG** (Squirrel Eiserloh, GDC 2017, "Math for Game Programmers: Noise-Based RNG"):
replace stateful generators with a hash `noise(position, seed)`, giving "unordered access, better
reseeding, record/playback … lock-free parallelization" [primary listing,
https://gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise]. This is the mechanism for order
independence: the k-th tree of wood `w` is `hash(mapSeed, "w", "trees", k)`, not "the next draw of a
stream" [inference].

**Rules that follow** [inference]:
1. `seed(feature, purpose) = hash(map.seed, feature.id, purpose)`; never an index, never a shared
   stream; a feature's explicit `seed` replaces `map.seed` for that feature only.
2. The hash and the RNG are part of the compiler version and use integer maths (restricted float64 is
   for geometry; decision 0006). Changing either is a data-version change, reviewed like any other.
3. Within a feature, independent purposes get independent streams (outline jitter, trees, rocks), so a
   density change does not move the outline.
4. Cross-feature interactions (a wood clipped by a road) are applied *after* each feature's own
   generation, as deterministic geometry ops, so feature A's randomness never depends on feature B
   existing.
5. Renaming an `id` reseeds the feature. Make that explicit: an id is permanent; a `name` is the
   human label and may change.

## 6. Schema design

**Closed vs open vocabularies.** OSM shows an open vocabulary scales socially but yields synonyms and
renderer-specific tagging (§1); JSON Schema can close objects with `additionalProperties: false`, and
`unevaluatedProperties` handles closed objects composed from subschemas [primary,
https://json-schema.org/understanding-json-schema/reference/object]. Close everything, and add one
explicitly open, ignored-by-compilers field (`note`, maybe `tags` for importer provenance like the raw
OSM tags) so information is never lost and never interpreted [inference].

**Presets and inheritance.** Tiled templates and CGA `attr` both give "a named bundle of defaults,
overridable per instance" (§3, §4). The cleanest form for us [inference]:
- `kind` names a preset defined by the *format* (e.g. `wood` = cover with tree scatter, default
  `density 0.6`, `leaf broad`, priority 40).
- A map may define its own `presets` (`"austerlitz-orchard": { "kind": "orchard", "density": 0.3 }`)
  that features reference with `preset`; one level of inheritance only, no chains, so the effective
  values of a feature are always "format default ← map preset ← feature".
- The validator can print a feature's *resolved* properties, so a reviewer sees what a terse feature
  means.

**Units.** Bake the unit into the schema, not the value: metres, radians, 0–1 fractions, per the draft.
Name fields so the unit is obvious where it is not metres (`slopeDeg` is a smell; prefer radians as
the convention says). GeoJSON's precision warning applies: round authored coordinates to 1 cm (or
0.1 m) on write so diffs show real edits, not float noise [inference from RFC 7946 §11.2].

**Versioning and migration.** `format: N` at the top; a migration `N → N+1` per version, run by the
loader and by a `--migrate` tool that rewrites files; never reinterpret a field silently (OSM's
old-style multipolygons show the cost of not versioning; Tiled's `type`/`class` churn shows the cost of
renaming). Protobuf's rules transfer: don't reuse a field's name with new meaning; reserve removed
names [primary, https://protobuf.dev/programming-guides/proto3/: "Changing field numbers for any
existing field is not safe", "you must reserve the deleted field number"]. LDtk publishes a schema
per version and a deprecation list [primary, https://ldtk.io/json/].

**JSON Schema for editors.** Generating a JSON Schema from the TypeScript source gives autocomplete and
inline errors in any editor via `$schema`; discriminate on `kind` (`oneOf` with a `const` kind) so
each kind gets its own property list [inference; JSON Schema behaviour primary at the page above].
Geometry rules (closed rings, no self-intersection, references resolve) cannot be expressed in JSON
Schema and stay in the hand-written validator.

**Reviewable diffs** [inference]:
- One feature per object, collections sorted by a stable rule (file order is meaningful for equal
  priority in the draft, so keep it, but make the validator warn on equal-priority overlaps instead
  of silently using order).
- Short coordinate arrays on one line; a formatter (`tools/format-map`) owns whitespace, so diffs are
  only semantic.
- Large derived data (DEM-traced contours, pinned house footprints) can sit in a sibling file
  referenced by id, like LDtk's separate level files, so the intent file stays readable.

---

## Design principles for our map language

1. **Geometry and meaning are separate; meaning is a closed `kind`.** Like OSM (one geometry model,
   meaning in tags) but with a closed, owned vocabulary: a typo is an error, and synonyms such as
   `wood`/`forest` are resolved once, in the importer, never in compilers.
2. **A `kind` is a preset, not a type hierarchy.** Effective properties = format defaults for the
   kind ← optional map `preset` ← the feature's own fields. One level, no chains; the validator can
   print the resolved feature. (Tiled templates, CGA `attr`.)
3. **Intent, not logic: no expressions, ever.** When the vocabulary cannot say something, add a named
   generator or parameter to the compiler (versioned, tested) or pin the detail. The one structured
   value allowed is a `ramp` over a closed set of inputs (`edgeDistance`, `along`, `height`). (Mapbox's
   functions-to-expressions slide is the cautionary tale.)
4. **Fields and features are different things.** Continuous fields (relief, a wetness or soil field,
   imported DEMs) are *layers* built by a fixed pipeline of named stages; discrete things (a wood, a
   road, a village) are *features*. Features may modify layers only through declared edits (carve,
   level, raise), applied in stage order. (Houdini layers and masks; Paradox raster + table.)
5. **Relief is sparse primitives over an optional base.** `ridge`, `valley`, `hill`, `scarp`,
   `plateau` with profiles, blended in a defined order over a `dem` or a generator; rivers drive
   valleys. Detail comes from a seeded amplifier, not from more points. (Génevaux 2013, Guérin 2016.)
6. **Neighbours share edges instead of fighting by priority.** A feature edge may *follow* another
   feature (a wood bounded by a stream's left bank at +4 m, a field bounded by a road), stored once
   like a TopoJSON arc; priority remains for genuine overlaps, and equal-priority overlaps are a
   validator warning.
7. **Seeds are per id and per purpose, never per index or stream.**
   `hash(map.seed, id, purpose[, k])`, integer maths, part of the compiler version. Adding, removing or
   reordering features never reseeds others; changing density never moves an outline; an id is
   permanent. (Minecraft's index salt and AoE's global stream are the anti-models; DF and noise-based
   RNG the models.)
8. **Generated and pinned are two states of the same feature.** A feature either has a `generator`
   (with params) or pinned geometry; a pinned feature keeps `pinnedFrom` (the generator, its params and
   the compiler version) so tools can say "the generator now gives something else" and can unpin. Pinned
   always wins. (LDtk stores auto-layer output beside its rules.)
9. **References by id, checked.** Bridges name their line and water; villages lie `along` a road;
   edges `follow` features. Every reference resolves or the file is rejected; references never depend
   on file order. (OSM relations with roles, without the editor fragility.)
10. **Time and season are overrides on the same feature.** `seasons: { winter: {...} }` as in the
    draft, and, if dated variants come, `from`/`until` windows rather than per-key prefixes
    (OpenHistoricalMap over OSM lifecycle prefixes).
11. **Versioned, schema-checked, diff-friendly.** `format` at the top with a migration per version;
    never reuse a field name with new meaning; a JSON Schema generated from the TypeScript schema with
    `kind` as discriminator; a formatter owns whitespace; coordinates rounded to 1 cm; bulky detail in
    sibling files referenced by id.
12. **Meaning of ground belongs to the ruleset; look belongs to the art side.** The map says `wood`,
    `leaf: broad`, `density 0.7`; the ruleset says what that costs and hides; the material library says
    how it is painted. The map carries no movement numbers and no texture parameters. (Civ VI tables,
    Unity Terrain Layers.)

### Sketch

```jsonc
{
  "format": 1,
  "id": "pratzen-sketch",
  "seed": 1805,
  "extent": { "w": 3000, "h": 3000 },

  // P2: map presets; one level over the format's kind defaults
  "presets": {
    "moravian-orchard": { "kind": "orchard", "density": 0.35, "rows": true }
  },

  // P4, P5: fields are layers, built in fixed stages from sparse primitives
  "relief": {
    "base": { "kind": "dem", "file": "maps/pratzen.dem.json", "source": "dem" },
    "landforms": [
      { "id": "pratzen-ridge", "kind": "ridge",
        "geometry": { "line": [[-600, 200], [0, 350], [700, 300]] },
        "height": 40, "width": 500, "profile": "rounded" }
    ],
    "edits": [
      { "id": "sokolnitz-flat", "kind": "level", "geometry": { "circle": [[-900, -400], 120] },
        "to": 205, "edge": 30 }
    ]
  },

  "water": [
    // P8: a generated feature: a guide line plus generator params
    { "id": "goldbach", "kind": "stream",
      "generator": { "name": "meander", "amplitude": 25, "wavelength": 180 },
      "geometry": { "line": [[-1400, -900], [-200, -300], [600, 900]] },
      "width": 6, "depth": 0.8, "banks": { "left": "reed", "right": "cut" },
      "seasons": { "winter": { "frozen": "slow-water" } } }
  ],

  "cover": [
    // P6: one edge follows the stream's left bank (shared, stored once); the rest is a ring
    { "id": "wood-north", "kind": "wood", "leaf": "broad", "density": 0.7,
      "geometry": { "area": { "outer": [
        { "follow": "goldbach", "side": "left", "offset": 4, "from": 0.20, "to": 0.45 },
        [[300, 600], [500, 450]]
      ] } },
      // P3: a ramp over a closed input, not an expression
      "densityRamp": { "input": "edgeDistance", "stops": [[0, 0.3], [40, 1.0]] } },

    // P2: a preset with one override
    { "id": "orchard-kobelnitz", "preset": "moravian-orchard", "density": 0.5,
      "geometry": { "area": { "outer": [[[-500, -100], [-380, -100], [-380, 20], [-500, 20]]] } } }
  ],

  "lines": [
    { "id": "road-brunn-olmutz", "kind": "road", "grade": "highway", "width": 9,
      "geometry": { "line": [[-1500, 1200], [1500, 1350]] } }
  ],

  "settlements": [
    // P8: pinned from a generator; pinnedFrom lets tools detect drift and unpin
    { "id": "telnitz", "kind": "village", "along": "road-brunn-olmutz",   // P9: reference by id
      "pinned": { "buildings": "maps/pratzen.telnitz.json" },
      "pinnedFrom": { "generator": "street-village", "houses": 22, "compiler": "map-compiler@3" } },

    { "id": "bridge-goldbach", "kind": "bridge", "carries": "road-brunn-olmutz", "crosses": "goldbach" }
  ]
  // P7: every random draw above is hash(1805, id, purpose[, k]): adding "wood-south" changes nothing here
}
```

Notes on the sketch [inference]: `follow` with `from`/`to` (fractions along the referenced line) is
the TopoJSON idea made semantic; the compiler resolves it after the referenced feature is generated,
so `wood-north` depends on `goldbach`'s *output* but not on its *random stream*. If the dependency
graph has a cycle, the validator rejects the file. `pinnedFrom` is a record, not an instruction: it
is never read by compilers, only by tools.
