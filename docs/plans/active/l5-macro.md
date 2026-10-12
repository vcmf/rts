---
status: active
last_reviewed: 2026-10-12
---

# Plan: L5, the ground's macro colour and its ablation

Track E phase L5 (`docs/plans/active/track-e-look.md` §L5), after water W5 (`docs/plans/done/w5-banks.md`), in
stage 1. Design: `docs/proposals/prepainted-terrain.md` (the macro bake, light at runtime, the ablation). Art
direction: `docs/art-bible.md` §4 (palette), §7 (brushes), §11 (composition), and the targets in §0.

Three PRs: **L5a** the ground's cover and the macro colour, baked and in the shader, with the switch between the
arms; **L5b-1** the two experimental arms (baked strokes, Kuwahara on the bake) and the judging kit; **L5b-2**
the judges' tally and the decision.

## Problem

- **The ground has no classes.** The look page paints one meadow everywhere (`groundMeadow()` in
  `src/look/shaders/shore.glsl`: noise at 150 m and 53 m blended between four colours, flower flecks), and a
  rotated grid of strip fields only beyond 170–250 m from the centre (`groundFields()`). There are no roads, no
  village ground, no fields where the targets put them (art bible §6c: "fields and villages sit on the valley
  sides"), and one wheat patch of scatter with no field under it.
- **No furrows or field stripes at play range.** The winter master (`austerlitz-pratzen-v2`) reads by its ploughed
  stripes; `austerlitz-goldbach-v2` by its field-strip patchwork. Today's furrows are a faint 3 m band on the
  distant fields only.
- **Class edges are noise thresholds or ruled lines** (the field grid's cells), never broken painted edges.
- **The open question** (the proposal's): is a baked macro colour visibly better than the same shapes computed in
  the shader? Only an ablation with blind judges answers it.

## Scope

**L5a**
- **The cover** of the look world: fields (crop, state, furrow direction), meadow, pasture, a road and a track,
  village ground, wood floor under the copses, authored in Node and shipped in the look data as a class grid.
- **One macro function** (`macro.glsl`): class colours from the palette, low-frequency variation, field stripes and
  furrow bands along each field's direction, wear near roads and villages, broken class edges. Colour only, no
  light.
- **The bake:** that function rendered into a world-space texture on the GPU, in tiles, deterministic, at 0.5 m
  over the detailed tile and 4 m over the far ring; mipmapped; RGB colour, A the wear and edge mask.
- **Three arms on one switch** (`?macro=flat|shader|bake`): class colours only; the macro function per pixel; the
  bake. Every arm keeps L2's detail layer, the ramp, the light map, the banks and the seasons.
- **The scatter follows the cover:** grass and flowers on meadow and pasture, wheat on standing crops, nothing on
  ploughed ground, roads or village ground.
- **Ground bounce:** trees, scatter and the shore band read the macro colour under them.
- **The full-size bake measured:** time and peak memory at 3600² (the proposal's 1.8 km at 0.5 m) on the Mac's GPU
  and under SwiftShader, with no lost context.

**L5b**
- Arm 4, baked strokes, and arm 5, Kuwahara on the bake (experiments, the proposal's §Validation plan).
- The judging kit: each arm at three zooms and three yaws on the Pratzen framing, with one tree type and the
  readability guard's army-colour blocks, in a randomised blind order, with answer sheets
  (`docs/plans/active/track-e-results/`); the tally; a decision record that keeps or drops the bake and the
  experiments; the losing arms removed.

**Not in L5:** the map format's importer and compiler (the owner's workstream, `docs/proposals/map-format.md`):
L5a authors the cover in the look world's own step and shapes it like the format's `cover` and `lines`
collections, so the world compiler can write the same grid later. Hedges, walls and buildings as meshes (L7,
LA2). The staff map reading the macro (it is not on the look page; noted in the system doc for when it is).
Units and smoke in the ablation (stage 2 re-checks the chosen arm, `track-e-look.md` §Stage 2).

## Approach (L5a)

### The cover (Node, the look data)

- **Authored** in `src/look/world/cover.ts`, called by `tools/build-look-data.ts`, deterministic from the
  world's seed. Features as the map format names them (§4, the `cover` and `lines` collections):
  - `field` areas with `crop` (wheat, rye, …), `state` (standing, stubble, ploughed) and a furrow angle: strip
    fields of 20–60 m by 80–250 m on the valley sides and beyond the play area, in blocks with a shared
    direction per block (the targets' patchwork), never on the floodplain (§6c) or in the formation zones'
    keep-clear (`KEEP_CLEAR`, `src/look/nature.ts`);
  - the existing wheat patch becomes a standing wheat field under its scatter;
  - `meadow` (the default), `pasture` near the village, `wood` floor under the copses and tree lines;
  - one `road` (6 m, crossing the tile, over the river on the crossing W6 will author; until then it stops at
    the floodplain's edge on both sides) and one `track` (3 m) to a `village` ground area at a village site
    (where LA2's barracks and L7's buildings will stand).
- **Rasterised** in Node to a **2 m class grid over the far ring** (1300², the tile and beyond, so the far ring has
  fields too): per cell the class, the field's index (its crop, state and angle are a small table in the meta),
  and the distance to the nearest road, track or village edge (0–25 m), each a byte. Stored run-length encoded
  per row (classes form long runs) in the look data, version 5. `--check` covers it like the rest.
- **The sim is not touched:** its maps keep their own classes; the map format will unify the two.

### The macro function (`src/look/shaders/macro.glsl`)

`macro(xz, q)` returns (colour, mask) at a world point; `q` picks the quality (below). Reads the class grid (one
texture, nearest, 2 m) and the field table (a small uniform array).

- **Class colours** from the palette (art bible §4: muted olive and yellow-green, dry gold, teal-green hollows):
  meadow keeps today's `groundMeadow()` colours and its flower patches; pasture a shorter, greener grass; crops by
  crop and state (standing wheat gold, rye greyer, stubble pale straw, ploughed earth brown, darker in the
  furrows); road and track worn earth; village ground trodden earth and grass; wood floor a dark teal-green.
- **Low-frequency variation:** per class, value and hue shifts from the grain's soft channel at 30–150 m (today's
  meadow already does this; the other classes gain it).
- **Field stripes and furrow bands:** along each field's angle, furrows (ploughed: 0.8–1.2 m, dark and light; the
  stripes the winter master shows) and the drill rows of standing crops (fainter), each field's phase from its
  index. Faded with the pixel's footprint, as W4's marks are (a stripe under a pixel shimmers).
- **Wear:** near roads, tracks and the village, the grass thins to trodden earth over 2–8 m, broken by the grain.
- **Broken edges:** the class lookup's coordinate is pushed by the grain's soft channel (±1.5 m), so a field's
  edge wanders like a painted one, never a ruled line; a thin darker margin (a headland, a verge) where fields
  meet meadow.
- **Quality:** the bake runs it with `q = 1`: 9 taps of the class grid for the edges' blend and the wear's
  falloff. The shader arm runs `q = 0`: one tap, the same shapes with harder edges. That is the real choice the
  ablation tests: what the bake can afford against what a pixel can.
- **The mask** (A): 1 on earth (roads, ploughed, worn ground), 0 on grass; the detail layer reads it to pick its
  stroke (art bible §7: broken dry-brush on earth, blotches and dabs on meadow).

### The bake (`src/look/macro.ts`)

- **GPU, in tiles:** an `EffectRenderer` draws `macro(xz, 1)` into one RGBA8 render target, 512² at a time (its
  viewport and its world rectangle set per tile), so no single draw is large (the SwiftShader rule,
  `docs/proposals/engine-design.md` §6) and the peak stays the target plus one tile's work. Then mipmaps.
- **Two targets:** the tile at 0.5 m (1600², 10 MB with mips) and the far ring at 4 m (650², 2 MB). Deterministic:
  the same data gives the same bytes (checked).
- **When:** once at load, after the look data; a rebake on a change of cover (not in L5a). Seasons do not rebake:
  `groundSeason()` tints the result as today.
- **The full-size run:** `?macroBench=3600` bakes a 3600² target (1.8 km at 0.5 m) and logs the time and the GL
  memory it adds, for the measurement the track plan asks for.

### The arms on the page

`?macro=flat|shader|bake` (default `bake` in L5a; L5b's decision sets the final default), a define on the terrain,
the far ring, the water's shore band and the lab hill:
- **flat:** the class colour only (one tap, no variation, stripes or wear); the arm 1 of the ablation.
- **shader:** `macro(xz, 0)` per pixel; arm 2.
- **bake:** one fetch of the baked texture (the tile's, or the far ring's past the tile); arm 3.

`albedo()` in `terrain.frag` and `landAlbedo()` in `shore.glsl` (the shore band's ground) both start from the arm's colour instead of
`groundBase()`, so the shore band and the terrain still paint the same colour (the seam check holds them). The
bank painting, the steep stony ground and the seasons stay on top as now. The far ring's `aRiver` bands and its
painted river line stay.

### The scatter and the bounce

- **Scatter** (`src/look/nature.ts`): each candidate's class from the cover grid (CPU, the same data); grass,
  flowers and plants only on meadow and pasture, wheat only on standing crops, none on ploughed, stubble, road,
  track or village ground. The seeded streams keep their order (a rejected candidate still draws its numbers), so
  the rest of the scatter keeps its places.
- **Bounce:** trees and the grass scatter take 15% of the macro colour under their root into their shadow side
  (`nature.frag`), so a copse on dark wood floor and a tuft on gold stubble sit in their ground (the proposal's
  pasted-on fix).

## Checks

- **Seam:** `tools/water-look-check.mjs` seam stays 0 in every view, in each arm.
- **Shimmer:** the detail check's and the water look check's shimmer gates hold in each arm; a new ground
  shimmer view over ploughed fields (furrows are the finest marks the macro paints) at the closest and widest
  zooms, gated at the summer meadow's numbers on main.
- **Classes readable (a measured proxy for the judges' question):** a new check (macro-check in `tools/`): in the
  default view, the median colour difference (CIE ΔE 2000) across each class boundary from the cover grid's
  edges, at least 8 between field and meadow, 10 at roads; a sabotage (`MACRO_SAB_ONECLASS`, every class the
  meadow's colour) must fail it.
- **Armies stay the most saturated:** the readability guard (`tools/guard.mjs`) passes in each arm and
  season; the guard's blocks over each class (on a road, on ploughed ground, on stubble) added to its views.
- **Determinism:** the bake hashed twice in one load and across two loads; equal.
- **Bake measured:** time and memory at the page's sizes and at 3600², on the Mac and under SwiftShader
  (`--enable-unsafe-swiftshader`), with no lost context.
- **Cost:** `?bench` in each arm, against main, on the Mac (a proxy); the laptop decides.
- **Data:** `node tools/build-look-data.ts --check`; `npm test`; docs check.

## Acceptance (L5a)

- The three arms render, switchable, on the terrain, the far ring and the shore band alike.
- Seam 0; the shimmer gates hold; the class check passes and its sabotage fails; the guard passes.
- The bake is deterministic, takes under 1 s on the Mac at the page's sizes (an estimate to measure, not a gate on
  the laptop), and its full-size run finishes under SwiftShader without a lost context.
- Terrain cost within the frame budget's terrain line (about 1.5 ms, `track-e-look.md` §Budgets) on the Mac proxy,
  the bake arm within 0.2 ms of main.
- A comparison page: main against the three arms in summer and winter, at the three zooms.

## Approach (L5b)

L5b is two PRs: **L5b-1** the two experimental arms and the judging kit; **L5b-2**, once the judges have answered,
the tally, the decision record and the losing arms removed. The judges need the arms on the page and the kit
published before they can start.

### Arm 4: baked strokes (`?macro=strokes`)

The bake with strokes painted into it. A gather in the bake's fragment shader: no per-stroke draws, which lost the
context under SwiftShader (`docs/proposals/engine-design.md` §6).
- **Stroke centres:** one per cell of a jittered grid of 2 m (a stroke then stays within its cell's neighbours).
- **Orientation:** in a frame turned along the field's furrows on fields, and along a slow noise flow on grass.
- **Shape:** each stroke a soft-ended capsule 1.6–3 m long and 0.5–0.9 m wide.
- **Colour:** the macro colour at its centre (one tap) with a small value jitter.
- **Colour:** the macro colour at its centre, its value jittered by up to 10% and its temperature a little (with
  the centre's colour alone the strokes changed the frame by about a level, too little to judge).
- **Gather:** each texel reads the strokes of its 3×3 neighbour cells and lays them over its own colour in a
  fixed order (by a hash of the cell), so the bake stays deterministic. A stroke's colour is read only where it
  reaches the texel.
- **The snow's lie** stays the texel's own, so the stripes keep holding the snow.

The materials read the bake as in arm 3; only the bake's own shader changes.

### Arm 5: Kuwahara on the bake (`?macro=kuwahara`)

The arm-3 bake rendered into a scratch target, then a four-quadrant Kuwahara pass from it into the bake's target,
done before the mips are made.
- **Radius:** 4 texels (2 m) on the tile and 1 texel (4 m) on the far ring.
- **What it filters:** RGB only. The alpha (the snow's lie) is the centre texel's, so the lie off fields stays
  exactly 0 and the seam holds.
- **Memory:** the scratch target exists only while the arm bakes.

Arm 5 filters arm 3's bake, not arm 4's, and is judged against arm 3. Both arms are painterly abstractions of the
same bake: stacking them would make a vote for arm 5 a vote for both, and the track plan already drops the
strokes unless they beat arm 3.

### The judging kit (a new tool in `tools/`, the ablation kit, and a private judging page)

- **The framing:** the Pratzen framing has no place of its own in this world, so the kit uses a stand-in. Its
  target is east of the hill, with the ploughed field, the track, the road and the village in frame (the winter
  master's content: fields, a village, open slopes). It is shot at the bench's three zooms (`src/look/bench.ts`:
  the closest, the default, the widest at the steepest pitch) and three yaws (the default and the yaw limits,
  decision 0010).
- **On the ground:** the readability guard's army-colour blocks, a column of the four coats at three spots, and
  one tree type (`?trees=one`, every tree from one broadleaf model) so the trees' variety does not vary the
  answer.
- **Seasons:** summer and winter.
- **Stills and motion:** per arm, one still per view and season, and a 3 s slow pan per season and zoom (yaw 0),
  encoded as H.264 for the shimmer question.
- **Pairs:** arm 1 against 2, 2 against 3, 3 against 4, 3 against 5. One screen per pair and zoom (12 screens),
  each with the three yaws and both seasons as tabs and the two pans playing in sync.
- **Blind:** each judge gets their own random screen order and random A/B sides; arm names are never shown.
- **The questions per screen**, each answered A, B or the same:
  - Which reads more as painted?
  - In which are the ground's classes (fields, road, village, grass) easier to tell apart?
  - In which do the coloured blocks stand out more from the ground?
  - Which shimmers or tiles less in motion?
  - Overall, which do you prefer?
- **Answers:** stored in the judging page's store, one document per judge holding their answers by screen, so a
  judge can stop and resume. Access rules let each judge read and write their own document alone and the owner
  read all of them. Claude reads them back for the tally (L5b-2).
- **The key:** which arm is which, written apart from the published files and kept from the judges until the
  tally.

### The rule (L5b-2)

- A judge prefers the later arm of a pair when they choose it overall on at least 2 of its 3 zoom screens.
- An arm is kept when most judges prefer it to its predecessor. A tie keeps the simpler arm.
- The checklist's answers are reported, and they break no tie.
- The decision record names the arm the page keeps and removes the others: the arms' code, their checks and the
  switch's dead values.

### Checks (L5b-1)

- Arms 4 and 5:
  - the seam is 0;
  - the shimmer gates hold;
  - the class check passes;
  - the bake is deterministic;
  - the guard passes (`--view cover` too);
  - the bake's time is measured on the Mac's GPU and under SwiftShader;
  - the bench covers arms 1–3. Arms 4 and 5 draw with arm 3's shader, so their cost is their bake's (the macro
    check).
- The kit: every screen has both arms' images and pans; no published file name, path or metadata reveals an arm;
  the later arm is side x on half the screens, and each judge's A/B sides are drawn at random per screen.

## Acceptance (L5b)

- **L5b-1:**
  - arms 4 and 5 render and switch like arms 1–3, and pass the checks above;
  - the kit is published, and one test run of the judging page stores and reads back an answer;
  - the bake's time of arms 4 and 5 is measured against arm 3's.
- **L5b-2:** as the track plan's L5:
  - at least 3 judges, blind, using the checklist;
  - an arm is kept only if the judges prefer it to the arm before it, and the stroke painter is dropped unless
    arm 4 beats arm 3;
  - the owner names the judges (`track-e-look.md`, open question 2).

## Risks

- **The cover is authored, not imported.** Until the map format's world compiler writes the grid, the fields are
  this world's alone. The grid's shape (classes, field table, distances) is what the compiler would write, so the
  bake does not change when it does.
- **Furrows shimmer.** At 1 m they sit near a pixel at the widest zoom; they fade with the footprint like W4's
  marks, and the new shimmer view gates them.
- **The ablation's arms 1 and 2 may win.** Then the bake is dropped in L5b; the cover, the scatter and the macro
  function stay (arm 2 uses them).
- **Louder ground.** Stripes and roads add contrast the armies compete with (the north star's note: "its terrain is
  louder than the armies should allow"); the guard's new blocks check it.

## Estimate

L5a 3–4 days; L5b 2 days of work plus the judges' time.

## Changes from this plan (L5a, as built)

- **No `wood` floor.** The copses' ellipses darkened open ground between their few trees, and the readability
  guard's blocks there stopped reading against it; the light map's occlusion already darkens the ground under each
  crown. The class stays in the format.
- **The bake's A is the snow's lie, not an earth mask.** Nothing read the mask (the detail layer's per-class strokes
  belong with the brush library, art bible §7). The winter master reads by its ploughed stripes: furrows hold the
  snow, ridges show the earth, and roads, tracks and the village ground hold less, so they still read in winter
  (`pSnowLie` in `snowAt()`).
- **Stripes are lands, not furrows:** 4–7 m bands (ridge-and-furrow lands, drill bands), which a 0.5 m bake holds;
  1 m furrows would sit at its Nyquist limit and belong to the runtime detail.
- **Colours set by the guard:** the ploughed earth, the wheat, the stubble and the road are lighter, darker or
  greyer than first painted. Dark earth matched the French and Russian coats' value; pale straw and a pale road the
  Austrian white's once the warm sun lit them. The road now reads against the meadow by hue (a cool grey) more than
  by value (`tools/guard.mjs --view cover`, a second view with lines wholly on each class, is new; the 3 m track
  holds no 20 m line and is left to the class check).
- **Explicit derivatives on every read** (`macroDerivs`, `textureGrad`, the meadow's reads too): reads in branches the
  pixels of a quad take differently (a class edge, the shore band's sides) made the bake differ run to run on the
  Mac's GPU (0.85% of texels by up to 26 levels). The water's land side takes the snow's lie as the terrain does.
- **The bounce reads one texel, the class's flat colour, in every arm:** the full macro per fragment of every tree and
  tuft would have charged the shader arm for a value constant over an instance, and a bounce that differed by arm
  would confound the ablation.
- **The scatter keeps 2.5 m from class edges** (nine probes: the painted edges wander 1.5 m along each axis and the
  bake blends ±1 m). The far hedgerows keep main's every-fourth choice; the road's bushes are dropped after it.
- **WebGL1 opens in the shader arm:** it cannot mipmap the bakes, and unfiltered stripes would alias.
- **The class check samples 24 px apart,** not 8: at the closest views 8 px is under a metre, inside the bake's soft
  edge, and measured the edge's blend instead of the two classes.
- **Winter shimmer gate:** snow against bare ground makes every edge pop; the closest zoom's winter limit is main's
  own number on the same pixels (1.24%) rounded up to 1.3%, the widest's stays the water check's 3.5% (main 1.74%).
  The check takes luma from the frame's sRGB values, as the checks whose limits it borrows do (review round 2: a
  linear-light luma had counted dark earth's flicker too little and snow's too much). The snow's edge on fields
  breaks on the grain's soft blotches over a wider fixed band (a width from `fwidth` stepped by 2×2 pixels, as in
  W5b).

## Results, L5a (dev Mac, against main with W5b as the base)

- **The arms:** flat, shader and bake render on the terrain, the far ring and the shore band alike, switched by
  `?macro=` or `__look.macro.setArm()`.
- **Classes** (`node tools/macro-check.mjs <url>`, `classes`): the median ΔE 2000 across the cover's class edges,
  24 px apart, summer. Field against grass: bake 11.9, shader 14.4, flat 14.9. Road against grass: bake 8.6, shader
  12.1, flat 14.3 (all ≥ 8; 10 at roads was planned, but a road that far from the meadow in value hid the Austrian
  white, so it reads by hue: `Changes` above). The sabotage (one colour for every class) fails at 6.3 and 6.6.
- **Shimmer** (`shimmer`, sRGB luma over 8/255, field pixels, SwiftShader). Worst pair, closest / widest, summer
  then winter: main 0.65% / 1.01%, 1.24% / 1.74%; bake 0.40% / 0.59%, 1.21% / 1.75%; shader 0.48% / 1.09%,
  1.21% / 1.81%; flat 0.56% / 0.89%, 1.24% / 1.74%. The sabotage (hard stripes, never faded) fails in winter
  at the closest zoom (1.84%).
- **Seam:** exact (largest 0/255) in every view, in each arm (`tools/water-look-check.mjs --only seam`).
- **Determinism:** the bakes' hashes equal on load, on a rebake and on a second load.
- **Bake:** at the page's sizes (1600² and 650²) 40–64 ms on the Mac's GPU on load and 7–13 ms a rebake, 0.35–0.9 s
  under SwiftShader; 15.2 MB with mips. The full-size run (3600²) 1.0–3.2 s under SwiftShader, 65.9 MB, the context
  held. Textures in all: 224.7 MB on main, 246.3 MB.
- **Readability guard** (`tools/guard.mjs`, the start view and the new `--view cover`): no block that separates on
  the base fails; the Austrian white in winter fails on main too.
- **Existing checks:** `tools/check-negatives.mjs`, `tools/water-check.mjs --selftest`, `tools/water-look-check.mjs
  --selftest`, `tools/detail-check.mjs --selftest`, `npm run check:data`, the docs check: pass. `npm test`: 254 of
  255 with the checks' Chromes just finished (the sim's cost test, `test/soldiers.test.ts`, 12.6 ms against 12); it
  passes alone (L5a touches no sim file).
- **Cost** (Metal proxy, `?bench` on main against `?bench=macro`, two alternating runs per build and season,
  1920×1080; GPU medians). Terrain pass, close / default / wide, summer: main 1.92 / 2.64 / 4.44 ms, bake 1.97 /
  2.70 / 4.51, flat 1.75 / 2.37 / 3.92, shader 2.95 / 4.44 / 7.58; winter within 0.15 ms of these. The bake arm is
  within 0.07 ms of main everywhere (acceptance: 0.2). The terrain line's 1.5 ms is the laptop's budget; main is over
  it on this proxy already. The shader arm costs 1–3 ms more: if it wins L5b's judging, its cost (review round 2,
  finding 9: every class's reads taken always) comes first. `tools/bench-look.mjs` kept dropping `?bench=macro`
  (fixed here).
- **Comparison page:** main against the three arms at nine views, summer and winter (a private artifact, linked
  from the PR).
- **Review:** round 1 (severe: WebGL1 could not mipmap the non-power-of-two bakes, so they read black; no rebake on a
  restored context; derivatives taken in branches, so the bake differed run to run) fixed. Round 2 (nothing severe;
  fixed and stopped): the shimmer's luma from sRGB, the water's snow lie, WebGL1 opening in the shader arm, one bounce
  in every arm, whole-texel viewports, the meadow's reads with explicit derivatives, the far bushes' index, the
  scatter's nine probes, a cheaper shader-arm snow lie. Not fixed: finding 9 (cost, above).
- **Known limits:** the cover is authored here until the map format's compiler writes the grid; the staff map does not
  read the macro colour; stubble and wheat still turn warm orange in the golden light; the bake's road contrast is
  near its gate.
