---
status: active
last_reviewed: 2026-10-28
---

# Plan: Austerlitz on the look page (the look compiler, M4; then the 3D world in tiles)

Step 5 of `docs/plans/active/one-map-austerlitz.md` (the look compiler M4, E-tiles, the zoom handover), cut into
stages the owner can see one by one. A plan only: each stage gets its own plan, or its own section here, when it starts.

## Problem

The map engine (Track M, PR #49, on `main` at `5b54752d`) holds Austerlitz in the map language:
`maps/austerlitz.map.json`, a 6 km map of the field as a scale model at 2× (decision 0070), its ways, water,
villages, woods and fields read off the survey (`docs/plans/active/m8-austerlitz.md`, M8a–g). The look page
(`app/look.html`, `src/look/`, `docs/systems/look.md`) still draws its hand-written demo world: an 800 m tile around
a ±235 m play area, written as formulas in `src/look/world/author.ts`, `cover.ts`, `buildings.ts` and
`water-data.ts` and built into `data/painted-world.lookdata` by `tools/build-look-data.ts`. The owner wants the look
page on Austerlitz.

**The look page as the match's test bed** (the owner, 2026-10-28): the look page becomes a stand-in for how a map and
a match will later look, built on the latest work on `main` (the map engine's maps, the editor, the sim's rules as
they land), not on a world of its own. So each stage below prefers reading what `main` already compiles over writing
look-only data, and what the look page shows (the ground, the armies on it, later their sight) should be what a
match will show.

Two things stand between them: nothing turns a map file into look data (the look compiler, M4, was never built), and
the look page draws one world of one size (`SPEC` in `src/look/spec.ts`, one river, ±235 m of play), while Austerlitz
is 6 km across.

## Measured (2026-10-28, this worktree, the dev Mac, Node 22)

| What | Value | How |
|---|---|---|
| `maps/austerlitz.map.json` | 209,719 bytes, 190 features | file size; kinds counted |
| its expanded form | 330 features: 1 `relief.dem`, 11 `relief.mend`, 31 `water.stream`, 18 `water.pond`, 19 ways (1 highway, 11 roads, 7 lanes), 12 `built.village` with 140 `built.house` and 5 `built.church`, 66 `veg.wood`, 1 `veg.orchard`, 6 `ground.meadow`, 1 `ground.field` (all the arable), 19 `zone.label` | `maps/austerlitz.expanded.json` |
| not in it | no bridge, ford, hedge, wall, fence, free-standing tree, barn, farm, marsh, track | the same count |
| roads crossing streams | 26 crossings, none with a bridge or a ford | segment intersections of the expanded ways and streams |
| `maps/austerlitz.rdem` | 18,012,026 bytes: 3001 × 3001 nodes at 5 m (15 km of field) | its header |
| its relief beyond the map | at 2× the file covers map x −3750..3750, z −3500..4000: 750 m past the east and west edges, 500 m past the south, 1000 m past the north | the header, the piece's `scale` 2 and `shift` z −500 |
| the whole map's compile (`layersOf`, `maps/engine.ts`) | 5.5 s, 579 MB resident | timed in Node |
| heights | 0.4 to 72.6 m above the datum (180 m); the highest node, the Pratzen, at (686, −24) | the compiled layers |
| today's look data | 4,269,016 bytes, built in 5.6 s, 286 MB resident | `node tools/build-look-data.ts --check` |
| today's bakes (without the shadow map) | 141 MB: light map and its depth 72, river mask 16, reflection mask 9, bank normals 9.8, water data 9.8, macro colour with mips 15.2, cover grid 6.4, AO 2.3, roads 0.7 | `bakeMB` over `SPEC`, as `shadowMapSize` sums them |
| the shadow map | about 3647 × 4906 texels, two targets: about 136 MB more | `docs/systems/look.md`, `shadowMapSize` |
| today's world | tile 800 m at 1.786 m cells, far ring 2600 m at 14.3 m, play ±235 m, a frame reaching 434 m from the focus, ground 0..25 m | `derive()` |

Candidate windows (centre in map metres, the play area ±235 m and the tile ±400 m around it, from the compiled
layers; "rebased" is the tile's highest ground above the far ring's lowest, which today's `SPEC.ground` caps at 25 m):

| Window | Centre | In play (±235 m) | In the tile (±400 m) | Relief in play | Rebased tile high |
|---|---|---|---|---|---|
| **Kobelnitz and its pond** | (−450, 350) | Kobelnitz (16 buildings), the Kobelnitz pond and the Goldbach (12 % of the play area water), the Goldbach road, meadows | 17 buildings, 3 waters (the Goldbach, the Kobelnitz pond, a brook), the pheasantry's orchard | 13.0 m | about 21–22 m |
| **The Pratzen and Pratze** | (700, 250) | the plateau's top (to 71.5 m) and its north slope, open arable, roads; no water, no building | Pratze (14 buildings), the Pratze brook, a wood | 36.6 m | 68.2 m |
| **Sokolnitz on the Goldbach** | (−1250, −1050) | Sokolnitz (12 buildings), a brook, the Goldbach road, meadows | the Goldbach and the brook, no wood (the Sokolnitz pond lies 410–560 m east, just outside) | 9.5 m | 15.4 m |

The centre of the field has almost no woods: the 66 woods lie mostly south (by Aujezd and the Littawa) and east (past
Hostieradek). A window there (for example (400, −1600): a 12 ha wood, Aujezd, the Littawa) is the woods' showcase and
the forest's cost test, not the first.

## Scope

- **In:** the look compiler for a window of a map (stage A), the 3D world in tiles over the whole map (stage B, its
  outline and estimates), the zoom handover (stage C, a sketch), the demo world as a map file, the armies demo on the
  new ground, the checks' baselines, the branches in flight, #240.
- **Out:** the order of battle and the sim on Austerlitz (step 6 of the one-map plan); new art (models, textures),
  beyond naming what is missing; the lit map view itself (M6, built).

## Stage A: a window of Austerlitz, painted

The look page loads `?map=austerlitz&window=<name>` (a named window) or, on the dev server only,
`?map=austerlitz&at=<x>,<z>`: a square of the map the size of today's world (the 800 m tile, the 2600 m far ring,
±235 m of play), compiled at build time with today's bakes. With no `?map` the page draws the demo world exactly as
today.

### How it works

- **The window.** `src/look/world/windows.ts` names each window: its map, its centre, and the armies' centre and
  facing (below). The look world's origin is the window's centre (the conventions' "battle area centred on the
  origin" holds), with the map's axes; heights are taken down by the far ring's lowest ground, so the window meets
  `SPEC.ground.lo` = 0.
- **The compiler.** `tools/build-look-data.ts --map <file> --window <name>` runs the map engine
  (`layersOf`, `maps/engine.ts`: validate, expand, apply) once, then `src/look/world/from-map.ts` (render side: any
  maths, decision 0006 does not apply; pure functions, tested in Vitest) turns the layers inside the window into
  today's look inputs, and the existing encoder writes `data/<map>-<window>.lookdata`. `--check` compares, as today,
  and `npm run check:data` checks every named window. The page never compiles a map (579 MB, 5.5 s: measured above).
  `at=` goes through a small dev-server route (as the map page's save does, `tools/map-save.ts`) that builds into a
  git-ignored cache: about 11 s the first time (an estimate: the two measured builds added).
- **Grids.** Stage A keeps `SPEC`'s grids, so no shader, bake or check of the demo world changes: the tile's 1.786 m
  nodes read the map's 2 m nodes as the sim does (`heightOf`); the cover's 2 m cells line up with the map's when the
  window's centre lies on even metres. The switch to 2 m everywhere (`docs/proposals/map-engine.md` §5) waits for
  stage B, which redraws the grids anyway.

### Each look input and its source in the language

| Look input (today's source) | From the map | What the language lacks, and how it is filled |
|---|---|---|
| Heightfield, AO margin, far ring (`author.ts`: `baseH`, the carve) | `Layers.height` (relief, mends, the water's channels); past the map's edge the `.rdem` read by the same placement (`demPlace`) | Nothing for Austerlitz. A map with no relief file past its edge gets a skirt (its edge heights held, the base noise continued) |
| Cover class: meadow, pasture (`cover.ts`) | `ground.meadow`, `ground.pasture`; `ground.rough` as pasture | `ground.marsh` has no look class: meadow, wetter, until a marsh paint (follow-up; none in Austerlitz) |
| Cover class: the fields, each with an id, a crop and a furrow (wheat, green, stubble, ploughed) | `ground.field.*`, `stage` (standing, stubble, ploughed, fallow) | **The arable is one feature** (M8f). The language needs a **field generator** that cuts a `ground.field` into strips and blocks between the ways, each with its crop and stage by the map's season, seeded (an M3-style generator in `src/map/`, so the lit view and the sim see the same fields). The furrow runs along each strip's long axis (the compiler's, no attribute). Until it lands, the compiler cuts the arable itself, seeded by the window (temporary, noted as such) |
| Cover class: wood floor | `veg.wood.*` areas | The class exists in the look but was never authored: it is now. No gap |
| Trees: the scatter and the authored forest, wood, orchard, hedgerow, poplars (`nature.ts`) | `veg.wood.*` (`leaf`, `density`, `height`, `undergrowth`), `veg.orchard` (`rows`), `veg.tree.*` points and rows (`form`, `crown`) | Species: `leaf` only (broad, needle, mixed); the compiler picks the generated trees' species by `leaf`, seeded (`GEN_FOR`). Hedgerows and lone field trees: in the language (`barrier.hedge`, `veg.tree`), not drawn in Austerlitz: an authoring follow-up for M8 if the owner wants them |
| Grass, flowers, plants, stones, bushes on grass | the classes above | Not the language's: the look's rule of what grows on which class stays the look's |
| Roads and tracks: `LINES` (points, width, class) | `way.*` lines, width from `lineReach`; road for `road`, `highway`, `paved`; track for `lane`, `track`, `path` | `surface` (paved, metalled) has no paint of its own yet: earth for all in stage A. The roads' grid holds 16 segments a cell (`ROAD_SLOTS`): the village crossings are to be measured; a cell over it throws at build time |
| Village ground and the trodden square | `built.village` areas (the village's ground: the hull of its yards) | No gap |
| Buildings: a model, a place, a turn, a scale (`world/buildings.ts`) | `built.house` footprints (140, from the street-village generator, facing their road), `built.church` | **No model choice**: the compiler fits a model to each footprint (house, farmhouse, manor by size and shape, seeded by the id), turned to its long axis and its door to the road. **No church, bridge or barn model** (art, below); **no mill kind** (`built.mill`: the demo's windmill, and Austerlitz's mills, M8's open question) |
| Paved yards (`PAVE`, the cover's yard mark) | the houses' footprints | Not a language gap, a look limit: **16 yards at most** (the cover's mark 240 to 255, the shapes as uniform arrays), and the cover's authoring throws when a yard comes near a road. Kobelnitz's tile holds 17 buildings and Šlapanice's 19, and a street village's houses stand 3 m from their road. Stage A moves the shapes to a texture (a byte's index, up to 239 a window) and clips a yard at its road instead of throwing, for map worlds |
| Water: the river's samples, the water data, the bank normals, the far ring's river mask, the reflection mask (`river.ts`, `water-data.ts`, `water.ts`, `terrain.ts`) | `water.stream` lines (`width`, `depth`, ramps `along`), `Layers.streams` (each stream's level every 2 m), `water.pond` areas and levels, `Layers.depth` | Everything the look needs is there. **The look's water is built for one river** (`RIVER`, `riverQuery`: its ribbon, riffles, stones, reeds, cut banks and reflections). Stage A2 below |
| Bridges and fords | `built.bridge`, `water.ford` | **None drawn**, over 26 crossings: an authoring follow-up for M8 (the sim needs them too); a bridge needs a model |
| Season | the map's `season` (Austerlitz: winter) and the attributes' `seasons` | The look's season is the page's (`?season`, the slider); the compiler resolves the attributes for the map's season. The page opens in today's default season, any season switchable to test (decided, open question 1) |
| Formation zones, floodplain (`inFormationZone`, `onFloodplain`) | none; `zone.go`, `zone.nogo` | The demo's rules (nothing on the floodplain or in the zones) are the demo's. A window has no formation zones; "no crops within reach of water" comes from the water layer |
| Names (`zone.label`) | `zone.label` | Not drawn in 3D (the lit view writes them) |

### The steps

| Step | What | Showcase |
|---|---|---|
| **A1** | The compiler, the page's `?map`, land (heights, cover, roads, villages, buildings, trees), yards as a texture, water drawn plain: the water data from the layers (depth, the distance to the shore by `edt`, the flow along each stream), a flat ribbon per stream and a surface per pond at its level, the bank normals and the far mask from the water layer; the river's own features (riffles, stones, reeds, cut banks, reflections) off on map worlds | Kobelnitz and Sokolnitz, which fit today's ground range |
| **A1b** | The camera's focus follows the ground (today a plane at 8 m, `SPEC.camera.focusY`), and the ground range and the zoom's hold become the world's (from its look data), not `SPEC`'s constants | The Pratzen (36.6 m of relief in play, 68.2 m rebased) |
| **A2** | One water for every world: the river's features generalised to every stream (riffles from the depth's ramps, stones and reeds along any bank, reflections, cut banks), the demo's river carried as one stream of the same data | The demo world's pixels unchanged (goldens equal, or each difference shown to the owner) |
| **A3** | The demo world as a map file (open question 5 of the one-map plan, decided): `maps/painted-world.map.json`, its heights as an `.rdem` exported from `author.ts`, its river a pinned stream, its cover, trees and buildings as features; the look page then loads every world through the compiler, and `author.ts`, `cover.ts` and `buildings.ts` retire to a one-off exporter | The demo against today's, side by side for the owner (not pixel-equal: the language's noise and fields differ) |
| **A4** | The armies demo on a window (below), the checks on windows (below) | `?map=austerlitz&window=pratzen&armies=20` |

A4 can run beside A2–A3 once A1 is in, on Kobelnitz or Sokolnitz; its Pratzen showcase waits for A1b. A4 also
brings the window crop of `engineMap()` (below, #240), so the window's armies run on the sim.

### The armies on the new ground

`layout()` (`src/look/world/armies.ts`) already takes a centre, a gap and a play area, and a `blocked(x, z)`; it
faces the sides north and south only. On a window:
- **centre and facing** come from the window (Pratzen: the French from the west up the slope, the allies on the
  plateau; Kobelnitz and Sokolnitz: across the Goldbach). `layout` takes an optional facing, its default today's, so
  the demo's layout and its hashing test do not move;
- **blocked** from the window's own data: water (depth over 0), trees (not bushes), buildings and yards, as on the
  demo; and ground steeper than the drill allows (a slope limit, from the ruleset);
- the battalions stand on the window's heights through the page's `H`, as today.

### The checks and their baselines

- **The demo page does not change** in A1, A1b and A4: the goldens (`tools/golden.mjs`) against `origin/main` equal,
  the guard's, the bench's and the river checks' baselines stand. A2 must keep them (or show the owner each
  difference). A3 changes the demo: new baselines (`docs/plans/active/track-e-results/l2a-baseline.md`) once the owner
  has accepted it.
- **Windows get their own:** `tools/look-check.js` (the ground against the meshes, every instance on the ground) on
  each window; a compiler check that the look data says what the layers say (cover, water, buildings sampled at
  points; Vitest); the goldens of each window from A1 on (its first PR has no base); the guard with its clusters on
  each window's open ground (positions from the window, not the demo's hard-coded ones) against the demo as `--base`;
  the bench (`?bench&map=…`) on the production build (`npx vite preview`), in a new section of the baselines file.
- The river, water and detail checks (`tools/river-check.js`, `tools/water-check.mjs`,
  `tools/water-look-check.mjs`) read the demo's river; they move to the general water in A2.

### Acceptance (stage A)

- Each named window loads, `look-check` passes, and the features stand where the map puts them (the compiler's check).
- The demo page as above; `npm test` and `npm run check:data` pass with the windows' data.
- The frame: on the dev Mac (Metal, preview build, 1080p), each window's GPU frame p50 at the bench's nine cameras
  within 0.5 ms of the demo's at the same cameras, or the excess explained and accepted by the owner. Decision 0050's
  target stays 120 fps (8.3 ms) with the armies.
- The owner sees each window at three zooms beside the lit map view of the same ground (`app/map.html`).

### Effort (estimates)

A1: 3 PRs (the compiler and `?map`; yards and buildings; water drawn plain), about 2 weeks. A1b: 1 PR, a few days.
A2: 2 PRs, about 1–2 weeks (the demo river's many checks). A3: 1–2 PRs, about a week, plus the owner's comparison.
A4: 1 PR, a few days. Stage A in all: about 5–6 weeks of building and review.

## Stage B: the 3D world in tiles across 6 km (E-tiles)

Today's camera never leaves ±235 m (engine-design §2: "no distance LOD or streaming, ever"; decision 0061 overturns
that for 6 km maps, and stage B updates `docs/proposals/engine-design.md` with it). Its own plan when it starts;
the outline:

- **Tiles of 400 m** at 2 m cells (200 a side, 80,000 triangles), with 16 m far cells (`docs/proposals/map-engine.md`
  §5). A 3 × 3 block around the focus is drawn in detail, so the detail always reaches 400 m past the focus (today's
  tile holds play ⊕ 165 m; the frame's lower half reaches 160 m); a ring of 5 × 5 is prepared ahead on the CPU.
- **The far ring becomes the whole map** at 16 m (375 × 375 nodes, about 280,000 triangles), and past the edge the
  `.rdem`'s collar (500 to 1000 m for Austerlitz) or a skirt.
- **The camera:** the focus clamped to the map's play area (Austerlitz: ±3000 m); the frame's top (434 m) stays
  inside the collar. The zoom stays 15–260 m and the yaw ±45° until stage C. The focus follows the ground (A1b), so
  the hold over high ground reads the rise near the focus, not the world's highest point.
- **Bakes: CPU data at build time, GPU bakes at run time, per tile.** The one-map plan says "bakes per tile at build
  time"; for the GPU bakes that is too large to ship: the light map over 6 km at today's 0.26 m is 23,000² texels,
  about 2.1 GB raw, and 576 MB at the 0.5 m target; the macro colour at 0.5 m another 576 MB (estimates from the
  texel sizes). So the heights, cover, roads, water data and the sky's occlusion are built per tile in Node; the sun's
  shadow depth, the light map, the macro colour, the ground's bounce and the buildings' light are baked on the GPU as
  a tile comes in, one bake a frame. Measured today over the whole tile: the soft light map 14 ms, the bounce map
  7 ms, the buildings' light 28–108 ms (`docs/systems/look.md`); a 400 m tile is a quarter of the area: a few ms each
  (estimate), the buildings' bake to be cut per building.
- **Memory (estimates):** per tile at the targets, light map 800² RGBA8 2.4 MB, macro colour with mips 3.3 MB, water
  data and bank normals 2.4 MB each where there is water, cover 0.16 MB, heights 0.16 MB: about 10 MB, so 9 tiles
  about 90 MB; the sun's shadow map per tile is 6–12 MB and kept only for the near tiles. Today's world holds about
  280 MB of bakes (141 MB plus the shadow map, measured above).
- **Data size (estimates):** heights for 6 km at 2 m as u16, 18 MB; the cover's runs, roads and sparse water a few
  times that; about 50–100 MB a 6 km map. Whether it is committed is an owner question.
- **The frame budget:** 8.3 ms at 120 fps (decisions 0036, 0045, 0050). Streaming spends at most about 1 ms a frame
  (a bar to set and measure: `?benchpan`, `?benchtrace`); a tile changes every 400 m of pan. Panning across the map at
  the widest zoom is the case to measure.
- **Effort (estimate):** 6–10 PRs, about 6–8 weeks; the heaviest parts are the bakes per tile and moving every
  `SPEC`-wide constant (the tile, the masks, the shadow box) to per-tile.

**Acceptance (outline):** Austerlitz from edge to edge on the look page, the frame within budget while panning, no
seam between tiles (the far ring and the apron's contract, engine-design §4, carried to tile edges), each tile's
pixels the same whichever way it was reached.

**The light over 6 km: coarse everywhere, fine near the camera** (research 2026-10-28, the owner's "2.1 GB is too
much"). The 2.1 GB is only the cost of holding near-zoom light for the whole map ahead of time; no game found does
that. The widest 3D view sees about 16.5 ha (212 m wide at its foot, 598 m at its top, 409 m deep: 0.46 % of 6 km
square, an estimate from the camera's limits), and 0.26 m texels matter only within about 150 m of the focus.
Supreme Commander lights 10 km maps from a 1024² shadow map and a normal map baked from the heightmap; Total War
draws runtime cascades and leaves the terrain out of them; Frostbite, Far Cry 4 and Unreal's runtime virtual texture
bake or generate the fine levels near the camera into a cache and stream only the coarse ones. Recommended (to settle
by the first test below):
1. **A coarse bake of the whole map at build time** (2–4 m: the terrain's sun shadow, the sky's occlusion, the valley
   mask, the macro colour; about 9–36 MB raw at 2 m, 4–9 MB compressed as KTX2 BC; estimates) **and the fine bake
   around the camera at run time** (today's 0.26 m light: the trees' and buildings' shadows and contact, the bounce;
   3 × 3 tiles of 400 m, or a two-level clipmap if tiles hitch): about 70–150 MB resident, against today's 280 MB,
   no new work a frame, a tile's bake about 3.5 ms (scaled from today's 14 ms light map; estimate).
2. The same with the fine level at the spec's 0.5 m: about 30–45 MB, the least work; the trunks' feet and the trees'
   contact may soften at the closest zoom.
3. Runtime shadows near the camera (Total War's way): least memory, about +1–3 ms a frame, the painted look at risk;
   last, because our sun does not move.

**First test:** on today's tile, the closest zoom with the light map at 0.26, 0.5 and 1 m texels, and the far half of
the widest view at 2 m, side by side for the owner. Options 1 and 2 keep the invariant's spirit but not its letter
(AGENTS.md, "static light is baked once per map"; decision 0061's "bakes per tile at build time"): proposed wording,
"static light is never computed per frame: baked once per map and sun, coarse for the whole map, fine lazily around
the camera, deterministically; only moving things get per-frame lighting", a decision for the owner with stage B's
plan. Sources and arithmetic: the research note that stage B's plan writes up (`docs/research/`).

**The test's result** (2026-10-29, branch `look/lightres-test`, sheets in `output/lightres-test/`): at 0.52 m a texel
the light map looks the same as at 0.26 m at every zoom (the trunks' thin shadow strips and the buildings' shadow
corners kept); at 1.04 m the trunk strips vanish up close; at 2 m the buildings' shadows go blobby up close, but the
far half of the widest view shows no difference that matters. So option 2: **the fine level at 0.5 m** around the
camera, **the coarse level at 2 m** for the whole map, handing over within about 100 m of the focus. The fine level
is on its way to today's page already: PR #253 (decision 0082, 108 MiB less with `?armies`, the same look).

## Stage C: the zoom handover (a sketch)

Past 260 m the lit map view (decision 0058, `src/render/lit/`, M6) takes over on the same camera, in the staff map's
stages (`docs/proposals/staff-map/design.md` §9): the painted world's far tiles fade into the map's paper, the
figures into slabs, the light turns from the world's sun to the map's north-west (the one-map plan's open question 6).
It needs B (the whole map in 3D) and the lit view on the look page's camera (M6d or M9). Both renderers draw at once
across the blend, so the frame is both budgets at once there. Its own plan; about 4–6 PRs (estimate).

## Later: fog of war as the paper map (an idea, not planned)

The owner, 2026-10-28, for later: embrace the fog of war with a paper, lit-map version of the 3D world. Only the
ground around one's own units, as far as each sees (the sim's vision, decision 0061's S-vision), is drawn in the
painted world's colour and light; the rest is drawn like the lit map view (decision 0058): its simple shaded relief on
paper, the trees, roads and buildings only, perhaps as outlines. The same staged blend as stage C, driven by sight
instead of zoom. Its own plan once vision is a rule in the sim and stage C exists; it may also ease stage B's budget
(only the seen ground needs the fine light).

## The branches in flight

- **`look/cavalry-artillery`** (`src/look/units*.ts`, `world/armies.ts`, `world/arms.ts`, the scenario) and the
  **smoke branches on `epic/smoke`** (`src/look/main.ts`, `smoke.ts`, `units.ts`, `world/armies.ts`): stage A does not
  block them. It leaves the units alone; it touches `armies.ts` only by `layout`'s optional facing (A4) and `main.ts`
  only where the data file and the spec's ground range are chosen (A1, A1b). Whichever lands second rebases; the
  conflicts are a few lines. Their goldens and benches run on the demo page, which A1–A2 keep.
- **`look/dark-water`** (paused): it changes the water's paint; A2 rewrites the river's data path. A2 rebases on it if
  it lands first, and keeps its look.
- **`maps/painted-world.ts`** (on `main` since the battle threads, #203) reads `data/painted-world.lookdata`. A2 bumps
  the look data's version (water bodies in place of the river's samples), and updates that reader on `main` until A3
  removes it.

## #240

Issue #240: the sim reads the look world through a legacy TypeScript map (`maps/painted-world.ts`, on `main` since
the battle threads epic, #203), not a map file. A3 fixes it: the demo world becomes a map file, the sim compiles it
with `engineMap()` and the look with this compiler, and `maps/painted-world.ts` goes (`Fixes #240`). With the sim now
able to play the look page's armies (`?sim`), a window's armies (A4) run on the sim from the start, as the look page
becomes the match's test bed. A window's sim is `engineMap()` over the window's square (a crop option, A4): format 2
is about 22 MB for 2 km (the proposal's figure), so a window needs no compact format (S-data). `engineMap()` wants the
play area a whole number of 8 m cost cells (`maps/engine.ts`, `COST_CELL`): ±235 m is 58.75 cells, so a window's sim
play area is 472 m (59 cells), its extra metre a side outside the camera's play.

## Risks

- **The water rewrite (A2)** touches the most tuned code of the page (W1–W5 and their checks). Kept apart: A1 draws
  plain water on map worlds only; A2 must leave the demo's pixels as they are.
- **Villages:** more yards than 16 (Kobelnitz 17) and yards against their roads; the roads' 16 segments a cell at the
  village crossings (Pratze's street is two roads a few metres apart: M8's open question). Measured in A1.
- **Woods:** a 12 ha wood is a forest; the forest's cost is owed (`docs/plans/done/forest-bench.md`). The first
  windows hold few trees; the woods' window comes after.
- **Missing art:** a church, a bridge and a mill model; until then a stand-in (the manor for a church) or nothing.
- **The camera over high ground** before A1b: its focus under the Pratzen. Hence the Pratzen after A1b.
- **The arable before the field generator:** the compiler's own strips are temporary and would be a second home for
  fields; the generator in the language removes them.

## Open questions for the owner

1. **The season Austerlitz opens in.** Decided 2026-10-28: as the page does today (its default season), every season
   switchable to test (`?season`, the slider); the map file's `season` only resolves its features' `seasons`.
2. **The first windows.** Decided 2026-10-29: Kobelnitz first, then Sokolnitz; the Pratzen after A1b.
3. **Models.** Answered 2026-10-29: Tripo models are in the raw asset packs (`assets/buildings/`, git-ignored): a
   windmill (`windmill.zip`, `windmill-low-poly.zip`) and a stone bridge (`bridge-low-poly.zip`), to bring in the way
   the farmhouse and the manor came (`docs/plans/done/tripo-lowpoly-buildings.md`). The church has only its concept
   pictures (`12-reference-church-front.png`, `-rear.png`): its model is still to make; a stand-in until then.
4. **Stage B's data.** The map's own files are committed: the intent file `maps/austerlitz.map.json`, the heights
   `maps/austerlitz.rdem`, and `maps/austerlitz.expanded.json`, generated by `node tools/map.ts expand` and checked
   by `check:data`. Recommended for stage B's per-tile data: built locally and in CI from those files, not committed
   (50–100 MB, an estimate); to confirm with stage B's plan.
