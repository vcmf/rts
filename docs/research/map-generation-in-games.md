---
status: research
last_reviewed: 2026-10-12
---

# How shipped games and engines describe and generate maps

Research for the map engine's JSON intent language. Date: 2026-10-12.

Tags: **[primary]** official docs, shipped source code, or the paper itself; **[secondary]** community
re-implementations or reference docs built from primary material (e.g. HiveWE, the Racket aoe2-rms docs,
which are an edited copy of Zetnus's community guide); **[forum]** forum posts; **[unverified]** my own
recollection or an inference not checked against a source in this session.

Several official pages could not be fetched (support.ageofempires.com returned 403; the Wildfire Games
trac wiki and springrts.com wiki are behind a bot wall; the Hive Workshop wiki returned 502). Where that
happened I went to shipped source code on GitHub instead, which is the better primary source anyway.

---

## 1. Age of Empires II DE: random map scripts (RMS)

**Abstraction: a fixed pipeline of passes, each a list of declarative blocks with attributes.** An RMS
file is plain text: section headers, and inside them blocks such as `create_land { … }`,
`create_terrain GRASS { … }`, `create_object STONE { … }` holding attribute lines.

**Pass order is fixed by the engine, not by the file.** The seven sections are always run as
`<PLAYER_SETUP>` → `<LAND_GENERATION>` → `<ELEVATION_GENERATION>` → `<CLIFF_GENERATION>` →
`<TERRAIN_GENERATION>` → `<CONNECTION_GENERATION>` → `<OBJECTS_GENERATION>`. "Sections can be written in
any order, but the game always uses them in the order above"; multiple sections of the same type act as
one; inside a section, blocks run in script order (land origins in sequence, terrains in script order,
objects in order). Notably "Land growth happens all at once!": all lands grow simultaneously from their
origins. [secondary] https://docs.racket-lang.org/aoe2-rms/sections.html

**Lands** (the first, coarse partition of the map):
- `base_size r`: "Square radius of the initially placed land origin, before any growth. The default of 3
  results in a 7x7 land origin"; also the minimum distance a land keeps from the map edge. [secondary]
  https://docs.racket-lang.org/aoe2-rms/attributes.html
- `land_percent` (0–100, split equally among players for player lands) or `number_of_tiles` (mutually
  exclusive). A DE-only switch makes `base_size` count toward the total instead of adding to it, which
  broke old maps: "To update an old map, you must increase number-of-tiles by (1+base-size*2)²", and it
  "also fixes a bug where land order would influence the generation." [secondary] same page. Lesson:
  changing the meaning of a size field silently changes every existing map.
- `land_position x y` (percent of the map) with `assign_to_player` under `direct_placement`, or
  `circle_radius` to ring players. [primary] https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/rms-features
- `border_fuzziness` (0–100, default 20): "the extent to which land growth respects borders… 0 causes land
  growth to ignore borders entirely. 100… perfectly straight lands along borders." [secondary]
- `clumping_factor` (land default 8): "Moderate values (11-40) create rounder lands, while low values
  (0-10) create more irregular lands, and high values (40+) create lands that extend in one direction
  away from the origin. Negative values create extremely snakey lands." [secondary]
- `zone n` / `set_zone_by_team` / `other_zone_avoidance_distance`: "Lands sharing the same zone can grow
  to touch each other. If two lands have different zones… land growth will avoid touching the other
  zone." This is how islands and team continents are made. [secondary]

**Elevation, cliffs, terrain, connections.** `create_elevation h { base_terrain T; number_of_tiles;
number_of_clumps; spacing; set_scale_by_size … }` raises hills (height ≤ 7 in old versions, ~16 in DE)
onto tiles of a given base terrain; `spacing` "sets the number of tiles between elevation levels, which
creates flat rings on hills". Cliffs are their own pass with global knobs only (`min/max_number_of_cliffs`,
`min/max_length_of_cliff`, `cliff_curliness` = "The chance that a cliff changes direction at each
segment", default 36). `create_terrain T { base_terrain B; … }` *replaces* base terrain B with T in clumps;
`spacing_to_other_terrain_types`, `set_flat_terrain_only`, `terrain_mask` (DE: lay a visual layer over or
under). Forests are just terrains. Connections (`create_connect_all_players_land { replace_terrain A B … }`)
repaint terrain along paths between land origins: roads and shallows. [secondary] attributes page.

**Objects** are placed last with distance constraints: `set_place_for_every_player`,
`min/max_distance_to_players`, `min_distance_group_placement`, `terrain_to_place_on`,
`max_distance_to_other_zones` (which, despite the name, keeps objects a minimum distance from terrains
they may not stand on), `set_tight_grouping`/`set_loose_grouping`, `find_closest`, `actor_area`
(DE: tag an area around an object so later objects can be placed in or avoid it). [secondary][primary]

**Randomness and determinism.** `start_random / percent_chance N / end_random` blocks, `if/elseif` on
labels, `#const`/`#define`, and in DE `rnd(min,max)` for any numeric value. [primary] Forgotten Empires
page. The game seed is a lobby setting; one RNG stream for the whole script [unverified].

**What is hard.** No functions, no loops, no arithmetic on results; everything is relative ("near
players", "on GRASS") so exact geometry (a river along a given line) is fought for with borders, zones and
`land_position`. Placement of terrain by *what was painted before* (`base_terrain`) couples passes: a later
change to a terrain type silently breaks later passes. Preview: there is no headless generator; a forum
thread asks for a CLI and none exists [forum]
https://forums.ageofempires.com/t/possibility-to-generate-random-maps-rms-scripts-from-command-line-outside-of-the-game/92003
Authors iterate in game (or scenario editor) with fixed seeds.

## 2. Age of Empires III and IV

**AoE III (XS scripts, C-like).** A map is a `.xs` script plus a `.xml` descriptor [forum, summarising the
official Custom Maps Guide, which returned 403]. The model is **areas + constraints + classes**, built
imperatively. A real script (AoE3 mod, `siberia.xs`) [primary source code,
https://github.com/mandosrex/AoE3ImpMod_New/blob/main/RMM/siberia.xs]:

```c
int playerConstraint = rmCreateClassDistanceConstraint("stay away from players", classPlayer, 25.0);
int avoidImpassableLand = rmCreateTerrainDistanceConstraint("avoid impassable land", "Land", false, 4.0);
int IceArea1ID = rmCreateArea("Ice Area 1");
rmSetAreaSize(IceArea1ID, 0.09, 0.09);              // fraction of map, min/max
rmSetAreaLocation(IceArea1ID, 0.0, 0.5);
rmSetAreaMix(IceArea1ID, "great_lakes_ice");        // a named terrain mix
rmAddAreaToClass(IceArea1ID, rmClassID("classIce"));
rmSetAreaBaseHeight(IceArea1ID, -1.0);
rmAddAreaInfluenceSegment(IceArea1ID, 0.0, 0.5, 1.0, 0.5);   // grow along a segment
rmSetAreaMinBlobs(IceArea1ID, 3); rmSetAreaMaxBlobs(IceArea1ID, 7);
rmSetAreaSmoothDistance(IceArea1ID, 7);
rmSetAreaCoherence(IceArea1ID, 0.7);
rmBuildArea(IceArea1ID);
```

Forests are area properties (`rmSetAreaForestType`, `rmSetAreaForestDensity`,
`rmSetAreaForestClumpiness`, `rmSetAreaForestUnderbrush`); trade routes are polylines
(`rmCreateTradeRoute`, `rmAddTradeRouteWaypoint`, `rmBuildTradeRoute(id, "water")`); constraints include
box, pie (sector of a circle), class distance, type distance, terrain distance and trade-route distance;
`rmBuildAllAreas()` grows several areas together so they compete for space. [primary, same file]
Randomness: `rmRandInt`, `rmRandFloat`. Key ideas worth noting: **terrain "mixes"** (a named, weighted set
of textures painted as one material), **influence points/segments** (an area grows toward a point or along
a line: a cheap way to steer a blob into a river or ridge shape), **classes** as tags that constraints
query.

**AoE IV.** Generated maps split into data (Attribute Editor: resource spawns, grass) and a Lua "terrain
layout" script for geography. The script fills `terrainLayoutResult`, which "holds all the necessary map
information that gets passed to the terrain generator" and "can be imagined as a square grid"; each cell
gets a terrain type that "control[s] the terrain height and whether a local distribution is attached".
[secondary: search-engine summary of the official pages, which returned 403 to direct fetch]
https://support.ageofempires.com/hc/en-us/articles/4865310033684-Generated-Map-Basics ,
https://support.ageofempires.com/hc/en-us/articles/4869788243220-Introduction-to-Generated-Maps .
So AoE IV moved to a **coarse semantic grid** (plains / hills / mountain / lake per cell, roughly tens of
metres) that the engine expands into heights, textures and scatter. This is the closest shipped analogue
to "intent compiled by an engine". Preview is in the Content Editor (Essence editor).

## 3. 0 A.D. rmgen: placer + painter + constraint

The cleanest composable model in this survey. Scripts are JavaScript, run in a sandbox at game setup.

**Core call** [primary, rmgen/library.js, https://docs.wildfiregames.com/javascript/rmgen/rmgen_library.js.html]:

```js
function createArea(placer, painters, constraints)
// "Constructs a new Area shaped by the Placer meeting the Constraints and calls the Painters there."
// calls placer.place(new AndConstraint(constraints)); returns undefined if no points, else paints.

function createAreas(centeredPlacer, painter, constraints, amount, retryFactor = 10)
// "Attempts to place the given number of areas in random places of the map."
// Each attempt: centeredPlacer.setCenterPosition(g_Map.randomCoordinate(false)).
// retryPlacing: gives up after amount * retryFactor failures.
```

- **Placer** = *where/what shape* (returns a set of tiles). Centred placers (position set by the caller):
  `ClumpPlacer(size, coherence, smoothness, failFraction)` ("coherence… 1 = circle, 0 = very random";
  "smoothness… 1 = few peaks, 0 = very jagged"), `ChainPlacer(minRadius, maxRadius, numCircles, …)`
  (random chain of circles: hills, lakes), `DiskPlacer`. Non-centred: `RectPlacer`,
  `ConvexPolygonPlacer`, `PathPlacer`/`RandomPathPlacer` (roads, rivers), `HeightPlacer` (all tiles in a
  height band), `MapBoundsPlacer`, `EntitiesObstructionPlacer`. [primary, source tree
  https://github.com/0ad/0ad/tree/master/binaries/data/mods/public/maps/random/rmgen]
- **Painter** = *what to do to those tiles*: `TerrainPainter`, `LayeredPainter(terrains, widths)`
  (rings by distance to the area border, "outermost first"), `ElevationPainter`,
  `SmoothElevationPainter(ELEVATION_SET|ELEVATION_MODIFY, elevation, blendRadius, randomElevation)`,
  `SmoothingPainter`, `HeightmapPainter`, `TileClassPainter`/`TileClassUnPainter`, `MultiPainter`.
- **Constraint** = *which tiles are allowed*: `AvoidTileClassConstraint(cls, dist)`,
  `StayInTileClassConstraint`, `NearTileClassConstraint`, `BorderTileClassConstraint(cls, in, out)`,
  `HeightConstraint(min,max)`, `SlopeConstraint(min,max)`, `Avoid/StayAreasConstraint`,
  `AdjacentToAreaConstraint`, `Avoid/StayTextureConstraint`, `And/Or/Null`, `StaticConstraint`
  (pre-evaluated cache), `PassableMapAreaConstraint`. [primary, rmgen/Constraint.js]
- **TileClass** = a named bitset over tiles, "can be tagged to any tile. Can be used to constrain placers
  and entity placement", with distance queries. The *same tag* is written by painters and read by
  constraints, which is what makes the pieces compose. [primary, rmgen/TileClass.js]
- **Terrain specs** are strings; `"floor|tree"` (`TERRAIN_SEPARATOR`) paints a texture *and* places an
  entity per tile; an array is a random mix. [primary, mainland.js]

Real code, the library's hills [primary, rmgen-common/gaia_terrain.js]:

```js
createAreas(
  new ChainPlacer(minSize, maxSize, spread, failFraction),
  [ new LayeredPainter(terrainset, [1, elevationSmoothing]),
    new SmoothElevationPainter(ELEVATION_SET, elevation, elevationSmoothing),
    new TileClassPainter(tileClass) ],
  constraints,                       // e.g. avoidClasses(clPlayer, 20, clHill, 15)
  count);
```

and a whole map reads as an ordered recipe (`mainland.js`): `new RandomMap(height, baseTerrain)` →
create tile classes → `placePlayerBases({...})` → `createBumps(avoidClasses(clPlayer, 20))` → hills or
mountains → forests `avoidClasses(clPlayer, 20, clForest, 18, clHill, 0)` → layered dirt patches → mines
→ decoratives → food → straggler trees. Every step names what it avoids. Rivers are a library function,
`paintRiver({start, end, width, fadeDist, deviation, heightRiverbed, heightLand, meanderShort,
meanderLong, waterFunc, landFunc, …})`, which models meanders as "the sum of two sine curves" and walks
every tile computing distance to the river line. [primary, gaia_terrain.js]

**Passability is derived, not painted**: unit classes declare `MaxWaterDepth` 2 and `MaxTerrainSlope`
1.0 (`Clearance` 0.8 for default units, 3.0 for "large"); ships declare `MinWaterDepth`. [primary,
binaries/data/mods/mod/simulation/data/pathfinder.xml]. Map scripts therefore only shape heights and
water; the movement grid follows.

**Determinism**: one seed from game settings, one `boost::rand48` stream for the whole script
("No seed value specified - using 0"). [primary, source/graphics/MapGenerator.cpp]. Consequence: inserting
one random call early shifts every later feature, a known pain for authors (no per-feature streams).
**Failure handling**: `createArea` returns `undefined`; `createAreas` returns however many it could place
within its retry budget, so a map can quietly come out with fewer hills. **Iteration**: Atlas editor
generates random maps with a chosen seed; `maps/random/tests/` holds unit tests for placers, painters,
constraints and TileClass [primary]; each map has a JSON descriptor (`mainland.json`: name, script,
preview image, supported biomes, `CircularMap`) [primary]. Biomes (`setSelectedBiome`, `g_Terrains`,
`g_Gaia`) separate *what a map is* from *what it looks like*. [primary]

## 4. StarCraft II and Warcraft III editors

Both are **hand-authored layers, with pathing mostly derived from cliffs and footprints**.

**Warcraft III.** The terrain file stores per-corner (tilepoint) records. A community re-implementation of
the editor (HiveWE) shows the fields: `ground_texture`, `height`, `water_height`, `ramp`, `blight`,
`water`, `boundary`, `cliff`, `cliff_texture`, `layer_height` (cliff level). [secondary, HiveWE source
https://github.com/stijnherfst/HiveWE/blob/master/src/base/terrain.ixx]. Its `get_terrain_pathing`
reproduces how the game *derives* pathing on a grid 4× finer than tiles: start from the ground
texture's own pathing flags (some tiles are unbuildable); "cliffs are unbuildable and unwalkable" unless
all four corners are ramp; water deeper than ground+0.40 is unwalkable and unbuildable, shallower water
only unbuildable; boundaries are unwalkable, unflyable and unbuildable. Doodads and buildings then stamp
their own pathing textures; pathing blockers are invisible doodads. [secondary]

**StarCraft II.** Cliffs are discrete levels with ramps; "Ground units cannot cross cliffs"; the Height
tool "is cosmetic… it has no effect on gameplay". [secondary, https://sc2mapster.wiki.gg/wiki/Terrain_Editor].
A **painted pathing layer** overrides: "No Pathing", "Ground" (makes cells walkable "even though it should
not be", e.g. across cliff edges), "No Building", "No Creep". [secondary,
https://sc2mapster.wiki.gg/wiki/Pathing_Layer]. Doodads and buildings carry **footprints** (triangle
geometry) that set pathing and placement. [secondary, https://sc2mapster.wiki.gg/wiki/Data/Footprints]

Lesson: gameplay comes from a **small quantised vocabulary** (cliff level, ramp, water depth, a few
pathing flags) while the visible surface is free-form; and **derived + override** (pathing derived from
cliffs and water, then painted exceptions) is the practical pattern. Iteration is instant: the editor
shows a pathing overlay and you test-play.

## 5. Total War, Ultimate General, Scourge of War

**Total War (Attila / Warhammer era, from CA's Assembly Kit docs).** Battles are built from **tiles**:
"Tiles are made up from height map, blend map and rigid models (trees, rocks, buildings, props)".
[primary, https://wiki.totalwar.com/w/Total_War:_ATTILA_Terry.html]. A world-scale **tile map** image
(`tile_map.png`) is painted with RGB codes from a battle-tile database; artists block out "the basic
ground types and permanent features, such as beaches, cliffs, rivers, roads, and mountains", with
layers for "plains, desert, sea, cliffs, beaches, rivers, river crossings, river sources, and river
mouths" [primary, https://wiki.totalwar.com/w/Terry_-_Creating_a_Battle_Tile_Map]. A **low-frequency
height map** at 4× the tile map's resolution gives "the large scale shapes across all of the tiles on the
battle map" [primary, https://wiki.totalwar.com/w/Terry_-_Low_Frequency_Map]. A **no-go map** marks
invalid battle spots ("a battle will only spawn in a location that has a valid 8x8 pixel area with no red
pixels"), and **battle catchments** define "the type of battle that can take place in a specific
location". The tile map renders "up to a distance of 8km", but "The Usable area is a 2048m squared area…
where physics is active, it also includes pathfinding." [primary,
https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro]. So: campaign position → window into a
world-scale semantic tile map → tiles (heightmap patches + blend + props) glued over a low-frequency
height field, with masked tiles blended by custom alpha.

Older titles (Rome, Medieval II, Empire, Napoleon) are described by modders as generating the battlefield
from campaign rasters (heights, ground types, climates) plus templates: "the game uses heights,
ground_types and climates to generate battle-maps at each coordinate" (Rome Remastered) and Empire/Napoleon
"load terrain tiles, which are basically height maps of single hills, rivers etc which get glued together
according to the template" [forum/secondary, TWC wiki and forums, cited in search results:
https://wiki.twcenter.net/index.php?title=Creating_New_Campaign_Map_in_Rome_Remastered ,
https://www.twcenter.net/threads/questio-about-battle-map-in-campaign.474247/]. Players report later
games (Warhammer, Pharaoh) use mostly hand-made maps themed by location [forum,
https://steamcommunity.com/app/364360/discussions/0/350532536099487203/]. Lesson: **a battle map as a
composition of authored landform patches over a coarse height field, chosen by semantic codes**, which
is exactly an "intent → features" expansion; the visible pitfall was repetitiveness.

**Ultimate General: Gettysburg** was built from "satellite images and historical maps, every major
location, house, ridge and hill… as accurately as possible", with a hand-drawn map style, and "Elevation
and obstructions affect unit visibility" [primary, store/press text, https://store.steampowered.com/app/306660].
No pipeline details found. **Scourge of War**: a developer notes HD maps are "6 mile" versus the usual
"5 miles" [forum, https://steamcommunity.com/app/2205330/discussions/0/4410795530136148638]; no format
documentation found. Both are hand-authored historical maps; I found no evidence of procedural generation.

## 6. Civilization V / VI map scripts

**Abstraction: layered per-plot attributes filled in a strict dependency order.** Civ V's
`MapGenerator.lua` (shipped file, here as overridden by a mod, comments unchanged) [primary,
https://github.com/Gedemon/Civ5-YnAEMP/blob/master/Override/MapGenerator.lua]:

```lua
-- Every step in this process carries dependencies upon earlier steps.
-- Plot types are the core layer of the map, determining land or sea, determining flatland, hills or mountains.
GeneratePlotTypes();
-- Terrain covers climate: grassland, plains, desert, tundra, snow.
GenerateTerrain();
-- Each body of water, area of mountains, or area of hills+flatlands is independently grouped and tagged.
Map.RecalculateAreas();
-- River generation is affected by plot types, originating from highlands and preferring to traverse lowlands.
AddRivers();
-- Lakes would interfere with rivers, causing them to stop and not reach the ocean, if placed any sooner.
AddLakes();
-- Features depend on plot types, terrain types, rivers and lakes to help determine their placement.
AddFeatures();
-- Feature Ice is impassable and therefore requires another area recalculation.
Map.RecalculateAreas();
StartPlotSystem(); AddGoodies(); DetermineContinents();
```

Three orthogonal layers per hex: **plot type** (ocean / land / hills / mountain: the relief class),
**terrain** (climate: grassland, plains, desert, tundra, snow, coast, ocean), **feature** (forest,
jungle, marsh, oasis, floodplains, ice), plus **rivers on hex edges**, set with `SetWOfRiver`,
`SetNWOfRiver`, `SetNEOfRiver(true, flowDirection)` so a river is a directed chain of edges, not a tile
type. `AddRivers` runs four passes of start conditions (hills/mountains first, then inland plots, then
areas short of `PLOTS_PER_RIVER_EDGE`). [primary, same file]. Each random call is labelled:
`Map.Rand(8, "MapGenerator AddRivers")`, which makes desync logs readable. [primary]. Map scripts override
any of these functions (e.g. Continents, Fractal); the engine supplies defaults. Civ VI keeps the same
plot/terrain/feature/edge-river model through `TerrainBuilder` [unverified]. A useful reference:
https://modiki.civfanatics.com/index.php/Map_and_terrain_(Civ5) [secondary]. Iteration: in-game
generation with a seed (map seed and game seed are separate options) [unverified].

## 7. Company of Heroes, Supreme Commander, Spring / Recoil (BAR)

**Recoil (Spring) SMF** is the best documented [primary, source header
https://github.com/beyond-all-reason/RecoilEngine/blob/master/rts/Map/SMF/SMFFormat.h]: a map is `.smf`
(main file) + `.smt` (texture tiles, shareable between maps) + a text definition (now `mapinfo.lua`).
The SMF header points at: `heightmap` (`short[(mapy+1)*(mapx+1)]`, mapped linearly between
`minHeight` and `maxHeight`), `typeMap` (`unsigned char[mapy/2 * mapx/2]`), tile indices, minimap,
`metalmap` (`unsigned char[mapx/2 * mapy/2]`), features (trees, rocks, wrecks), and an optional vegetation
map at quarter resolution. `squareSize` "Must be 8"; dimensions divisible by 128. So **each gameplay
layer is a raster at its own resolution**, compiled by a map converter from images.

`mapinfo.lua` declares `terrainTypes`: per typemap value (0–255) a `name`, `hardness`, `receiveTracks`
and speed multipliers `tankSpeed`, `kbotSpeed`, `hoverSpeed`, `shipSpeed` [secondary, springrts wiki via
search; confirmed by the engine template
https://github.com/beyond-all-reason/RecoilEngine/blob/master/cont/base/springcontent/mapgenerator/mapinfo_template.lua].
Rendering is separate: `splatDistrTex` (an RGBA distribution of four detail textures) plus
`splatDetailNormalTex1..4`. [primary, same template]. **How slope blocks movement** [primary,
rts/Sim/MoveTypes/MoveMath/GroundMoveMath.cpp]:

```cpp
if (slope > moveDef.maxSlope) return 0;      // too steep: impassable
if (-height > moveDef.depth)  return 0;      // too deep
speedMod = 1.0f / (1.0f + slope * moveDef.slopeMod);
speedMod *= moveDef.GetDepthMod(height);
// then, in MoveMath.cpp: * terrainTypes[typemap[square]].tankSpeed (or kbot/hover/ship)
```

`maxSlope` is in degrees in the move definition (defaults 60 or 15 depending on class) [primary,
MoveDefHandler.cpp]. Directional variant: "speedMod is not increased or decreased by downhill slopes".
So movement cost = **f(slope, depth) × terrain-type multiplier per movement class**, all derived from two
rasters. This is the cleanest shipped model of "terrain class + heights → movement cost".

**Supreme Commander (`.scmap`).** Fields read by the community editor: 16-bit `HeightmapData` with a
`HeightScale`, texture "stratum" layers (`Layers`) with mask textures, normal map, water masks (foam,
flatness, depth bias), `TerrainTypeData` (a byte per cell), decals and decal groups, props, lighting and
fog. [secondary, https://github.com/ozonexo3/FAForeverMapEditor/blob/master/Assets/Scripts/HazardX%20SCMAP%20Code/Map.cs].
A 513×513 heightmap represents 10×10 km [secondary, Adrian Courrèges' graphics study,
https://www.adriancourreges.com/blog/2015/06/23/supreme-commander-graphics-study/]. Mass and hydrocarbon
markers live in the map's Lua save file, separate from the terrain [forum,
https://forum.faforever.xyz/topic/127/starters-guide-to-mapping].

**Company of Heroes WorldBuilder.** Impassability has several sources combined: "non-playable area,
interactive stage, painted impass, object impass, and terrain impass from steep hills"; authors
"refresh the impass and pathfinding data" after edits and view an impass overlay (Ctrl+I). [forum,
https://www.coh2.org/topic/18826/title/post/196064 ; https://www.moddb.com/groups/worldbuilder/tutorials/important-tools].
Territory sectors are painted, with capture zones inside [forum,
https://coh2.org/guides/17057/worldbuilder-totw-12-capturable-area]. Cover comes from objects and terrain
types, which matters for our "terrain class" layer.

## 8. Procedural authoring tools and research

**World Machine / Gaea: node graphs over heightfields.** Nodes (generators, filters, erosion, selectors)
pass height and mask rasters. World Machine's **Layout mode** is the interesting part for us: "Shapes
such as boxes, circles, polygons, and spline paths define a resolution-independent specification in world
space of the shapes of your terrain", and you can "draw your shapes into a layout generator at the
beginning of your network, and see the results from a node near the end"; rivers can be lofted "so that
the water never flows uphill" [primary, developer blog https://www.world-machine.com/blog/?p=41 and
search summary]. Gaea exposes a per-node **Seed** ("The randomization pattern or seed for the node's
process") [primary, https://docs.quadspinner.com/Reference/Erosion/Sediment.html]; its erosion is
"resolution-independent", so "a 512 x 512 preview build will maintain essential parity for all major
erosion features with a high resolution 4K or 8K build" [primary,
https://docs.quadspinner.com/Guide/Using-Gaea/Erosion.html]; and a randomizer overhaul meant some nodes
"will no longer be able to create the same shape as in previous Gaea versions" [primary,
https://docs.quadspinner.com/Changelogs/Production/1.2.0.3.html]. Two lessons: per-node seeds, and
version your generator because seeds do not survive algorithm changes.

**Houdini heightfields.** Terrain is "2D volumes where each voxel contains the height"; several named
layers travel together (`height`, `mask`, others such as bedrock vs. soil); "most terrain nodes take a
second input… a mask layer to control which parts of the terrain the node will modify"; masks come from
"elevation, slope, facing direction, or intersecting geometry"; `HeightField Layer` "composites one height
layer over another, allowing you to 'paste' a feature"; `Erode`, `Slump`, `Scatter`. [primary,
https://www.sidefx.com/docs/houdini/model/heightfields.html]. This is the "named layers + masked
operators" model, a raster cousin of placer/painter/constraint.

**Dwarf Fortress world gen.** Six fields (elevation, rainfall, temperature, drainage, volcanism,
savagery), each with min/max and X/Y variance; **weighted meshes** set how often each value range appears
(values at mesh intersections, then smoothed); erosion cycles and river minimums; **rejection
parameters** throw away worlds that fail checks ("the world is rejected and re-randomised"); and
**separate seeds per stage**: `[SEED]`, `[HISTORY_SEED]`, `[NAME_SEED]`, `[CREATURE_SEED]`. [secondary,
https://dwarffortresswiki.org/index.php/Advanced_world_generation]. Seeds broke across versions [secondary,
same wiki]. Songs of Syx: no technical documentation found.

**Wave Function Collapse.** Observe the lowest-entropy cell, collapse it, propagate adjacency
constraints; it can hit a "contradiction" and fail; "WFC algorithm supports constraints… it can be easily
combined with other generative algorithms or with manual creation"; used in Bad North, Caves of Qud,
Townscaper, Matrix Awakens. [primary, https://github.com/mxgmn/WaveFunctionCollapse]. Good for
tile-local detail (village street plans, field-boundary patterns), poor for large continuous landforms
and for exact authored intent; needs restart/backtracking, which complicates determinism budgets.

**Landform-based and rivers-first research.**
- Génevaux et al. 2013, *Terrain Generation Using Procedural Models Based on Hydrology* (ACM TOG 32(4)):
  from a simple sketch the system builds a hierarchical **drainage network as a geometric graph**,
  classifies watersheds and river types, then produces terrain by "combining procedural terrain and river
  patches with blending and carving operators", stored in a **construction tree** whose leaves are terrain
  features. [primary, https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf]. Rivers first
  guarantees that water flows downhill and valleys fit rivers.
- Hnaidi et al. 2010, *Feature based terrain generation using diffusion equation* (CGF 29(7)): terrain
  from **parameterised curves** (ridges, riverbeds, cliffs) carrying constraints "such as elevation, slope
  angle and roughness", filled by multigrid diffusion, interactive on GPU. [primary,
  https://perso.liris.cnrs.fr/egalin/Articles/2010-terrain.pdf]. This is almost exactly "a JSON list of
  lines with heights and slopes → a heightfield".
- Génevaux et al. 2015, *Terrain Modelling from Feature Primitives* (CGF 34(6)): terrain as a tree of
  feature primitives blended together [secondary, cited in the LIRIS listings
  https://perso.liris.cnrs.fr/egalin/articles.html].
- Galin et al. 2019, *A Review of Digital Terrain Modeling* (Eurographics STAR) surveys procedural,
  simulation, sketch and example-based methods [unverified title details; same lab].

---

## Cross-cutting observations

| System | Abstraction | Exact geometry? | Derived gameplay grids | Seeding |
|---|---|---|---|---|
| AoE II RMS | fixed passes of declarative blocks | weak (growth + borders) | terrain type → passability | one seed |
| AoE III | imperative areas + constraints + classes | moderate (locations, influence segments) | terrain types | one seed |
| AoE IV | coarse semantic grid → engine expansion | grid-cell level | engine | seed |
| 0 A.D. | placer × painters × constraints, tile classes | good (polygon, path placers) | slope/depth per unit class | one stream |
| WC3/SC2 | hand layers: cliff levels, textures, doodads | exact (hand) | derived from cliffs/water + painted overrides | n/a |
| Total War | semantic tile map + LF height + tile patches | tile-level | engine | n/a |
| Civ V/VI | per-plot layers in dependency order, edge rivers | cell-level | from layers | labelled RNG calls |
| Recoil | rasters per layer (height, type, metal, features) | exact (hand) | slope/depth/type per move class | n/a |
| Houdini/Gaea | node graph over named raster layers + masks | via masks/layout shapes | n/a | per node |
| Research | feature curves / river graph → terrain | exact curves | n/a | n/a |

---

## Lessons for our JSON intent language

**Patterns to borrow**

1. **A fixed, engine-owned pass order (RMS, Civ).** Make the compiler, not the file, decide order:
   e.g. `relief → water (rivers, lakes) → ground cover/terrain class → linear works (roads, walls, hedges)
   → settlements and buildings → scatter/props → derived grids`. Keys in the JSON can appear in any order;
   Civ's comments are the model for *documenting why* each pass depends on the previous one. Within a
   pass, process features in a stable order (sorted by id), never in JSON object order.

2. **Placer / painter / constraint, but as data (0 A.D.).** A feature = *shape* (polygon, polyline with
   width, disc, clump-around-point, "band of heights") + *effects* (set class, set/modify height with a
   blend radius, layered rings by distance to border) + *constraints* (avoid/stay/near/border of a class or
   feature at distance d; height and slope ranges). The triple is closed and composable, and it maps to
   JSON without expressions. Keep `LayeredPainter`'s "rings by distance to border" idea: it gives banks,
   forest edges, village outskirts and hedge margins for free.

3. **Tags (tile classes) as the glue.** Every feature writes named tags (`river`, `forest`, `road`,
   `village`, `deployment.blue`); constraints and later passes read tags, never "whatever texture is there"
   (the RMS `base_terrain` coupling, and AoE III's terrain-distance constraints, are the trap). Tags are
   also what the 2D draft view can colour directly.

4. **Layered orthogonal attributes (Civ).** Keep separate, independently compiled layers: relief
   (height), water (depth, flow, ford flags), ground class (meadow, ploughed field, marsh, wood, orchard,
   village), linear features on edges (rivers as directed polylines, roads, walls, hedges; Civ's edge
   rivers are the precedent for treating a stream or hedge as a *boundary* with crossing rules, not as
   cells), and objects. Each compiler reads only the layers it needs.

5. **Derive movement, override sparingly (0 A.D., Recoil, WC3/SC2, CoH).** Movement cost =
   f(slope, water depth) × class multiplier per movement type (infantry line, column, cavalry, artillery),
   exactly Recoil's `maxSlope` / `slopeMod` / depth-mod × `tankSpeed`. Do not let authors paint pathing
   except through a small explicit override feature (`impassable`, `passable` à la SC2's "Ground"), so the
   3D look and the sim cannot disagree. Make the per-class numbers ruleset data (era-generic).

6. **Quantise the gameplay vocabulary, keep the surface free (SC2/WC3).** The sim sees a handful of
   classes and a few slope bands; the renderer sees the full continuous surface. Map intents should say
   "ridge, height 25 m, steep north face", not "slope 17.3°".

7. **Curves with constraints for relief (Hnaidi; World Machine Layout).** Describe relief as feature
   primitives: ridgelines, spurs, valleys, plateaus, single hills, each with height, width and slope
   profile, combined over a low-frequency base (Total War's LF map) with seeded noise for detail. This is
   both precise (Waterloo's ridge where it was) and compact.

8. **Rivers first, carve afterwards (Génevaux, Civ's river-before-lake comment).** A river is an
   authored or generated polyline with a monotonic bed profile; the compiler carves the valley and
   guarantees downhill flow; lakes and marshes follow. Fords and bridges are attributes of the river
   line, not separate terrain.

9. **Per-feature seed streams (Gaea nodes, DF per-stage seeds; contrast 0 A.D.'s single stream).** Derive
   each feature's RNG from `hash(mapSeed, featureId)` so editing one wood never moves another. Label
   draws (Civ's `Map.Rand(n, "reason")`) in debug builds so diffs and desyncs are explainable.

10. **Soft size + growth parameters that mean one thing (RMS clumping, 0 A.D. coherence/smoothness).**
    Expose shape character as a few normalised knobs (`coherence`, `smoothness`, `ragged edge`) with
    documented ranges; never redefine a field's meaning later (the AoE II `base_size` change silently
    altered every map). Version the generator and store the version in the file.

11. **Biome/look separate from layout (0 A.D. biomes, Recoil splats, Total War blend maps).** The intent
    names roles (`wood: deciduous`), the look data paints them. This matches our "pack colours are never
    used" invariant.

12. **Validation as part of the language (DF rejection parameters, Total War no-go maps, 0 A.D. tests).**
    Allow declarative checks in the file: "deployment zones ≥ N m apart", "every village reachable by
    road", "river crossable at ≥ 2 points". The compiler reports, rather than silently re-rolling, so
    authored maps stay exact.

13. **Fast, identical previews (Gaea's preview parity, editors' pathing overlays).** The 2D draft and the
    3D view must render the *same compiled grids*, with overlays for tags, movement cost per class and
    failed constraints; a headless CLI (which AoE II lacks) should compile and diff a map.

**Pitfalls to avoid**

- **Silent partial success.** 0 A.D.'s `createAreas` places "as many as it can" within a retry budget,
  so a map can quietly lose hills. For authored intents, failure to place a named feature must be an
  error; only explicitly optional scatter may degrade, and the compiler should report counts.
- **Order-dependent results from file order or one shared RNG stream.** Both make small edits ripple.
- **Coupling passes through paint** ("place on GRASS") instead of through tags.
- **Growth-based blobs as the only shape tool.** RMS lands and AoE III blobs cannot express "this wood
  is here"; we need exact polygons and polylines first, with growth/noise as optional decoration.
- **Expressions creeping in.** RMS grew `rnd()`, conditionals and defines; AoE III and 0 A.D. are full
  programs. Keep variation as closed data (`{"between": [a, b]}`, weighted choices), evaluated by the
  generator with the feature's seed, and reject anything else.
- **Rejection loops for authored maps.** DF-style re-randomise-until-valid is fine for skirmish
  generation, but a historical scenario must be deterministic on the first pass.
- **WFC or erosion in the sim path.** Contradictions and iterative simulations have unbounded or
  float-sensitive costs; if used, run them only for render detail or bake their output into the
  compiled features so the sim grids stay exact and replayable.
- **Seeds not surviving generator changes** (Gaea 1.2, DF). Store compiled outputs (or a hash) alongside
  the intent so a replay can detect a generator mismatch.
