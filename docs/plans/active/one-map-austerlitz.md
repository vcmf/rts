---
status: active
last_reviewed: 2026-10-24
---

# Plan: one map, drawn with the map editor: Austerlitz in the map language

## Problem

The owner (2026-10-24): "we have only one notion of map, there's the draft-map mode where we see everything as a draft
and at lower zoom transition to real map. but behind it's a single map and must be expressed via our language." They
want a plan for drawing that map with the map editor.

Today the battlefield exists three times, in three forms:

| Where | What it is | Its ground |
|---|---|---|
| `main`, the look page (`src/look/`) | The real map: the painted world, the armies (40 battalions a side, decision 0050) | Hand-written TypeScript: `src/look/world/author.ts`, `cover.ts`, `buildings.ts`, `water-data.ts`, `maps/battlefield.ts` |
| The map engine (`epic/map-engine`, PR #49) | The language: a catalogue of kinds, a validator, generators, a flat draft page, a sim compiler | Example maps in `maps/*.map.json`; Austerlitz is not one of them |
| The staff map prototype (`prototypes/staff-map.html`, PR #136) | The look of the draft-map mode, settled by eye: lit paper, real relief, a slight tilt, slabs, green woods | Real heights from a DEM (`?dem=`), the rest invented in the page |

Decision 0057 (one language for the battlefield; proposed in PR #135 as 0050, renumbered after `main` took 0050) says
these must become one. This plan is how.

## The model: one map, two modes of one view

- **One file** `maps/austerlitz.map.json` in the language. It holds the relief (from real heights), the water, the ways,
  the woods, the fields, the villages and the zones, each feature with its `source`.
- **Compilers** turn it into what each reader needs. They are already designed in the map engine's proposal (§4, on the epic):
  - the sim's data (exists);
  - the look's data (M4, not built);
  - the draft layers (exist).
- **One view, two modes,** set by the zoom:
  - the **draft-map mode** is the lit map view (decision 0058, the old 0051 of #135), drawn from the compiled layers;
  - zooming in hands over to the **real map**: the look page's painted world, compiled from the same file.

  The editor is the draft-map mode with editing overlays, not a second renderer.
- **The armies** stay a separate language: an order of battle referencing the map, `docs/proposals/sim-design.md` §14.
  It is out of scope here, except where step 6 needs units on the map.

## Order of work

Each step is one PR or more, each with its own plan when it starts. The steps are ordered by dependency; the table
after them says what can run in parallel.

### 0. Settle what the rest builds on

These are owner decisions and merges, not code:
- **#136.** Merge the lit map view prototype, rebased on `main`.
- **#135.** Accept decisions 0057 and 0058, renumbered from 0050 and 0051 because `main` took those numbers.
- **The map engine.** Bring PR #49 to `main`. Its base is the browser-checks branch (#129, whose decision 0052 also
  needs a new number).
- **Real data in the repository.** ČÚZK's DMR 4G is CC BY 4.0, so it may be redistributed with its credit. The
  prototype never committed it, as a precaution. Decide whether a derived heightfield is committed, or fetched by a
  tool at build time.
- **The period map.** Choose the source to trace from, and check its licence for tracing. Candidates are the
  Habsburg Second Military Survey (georeferenced on Mapire), or the First, closer to 1805.

### 1. Relief from real heights, in the language

- A relief kind `relief.dem`: a heightfield file, its transform onto the map's extent, and its datum. Also a `sources`
  entry of kind `dem` with its licence and credit (the format proposal's `relief` row, `dem`).
- An importer, from the prototype's `dem-fetch` tool (PR #136), writing the heightfield the map references. It keeps the 5 m source and
  averages onto the map's cell (decision 0021, 2 m, or the look's cell).
- The existing relief edits (`relief.level`, `relief.lower`, `relief.cut`) apply on top. This is how modern
  embankments and quarries are taken back to 1805.
- One compiled heightfield (decision 0012) that the draft view, the sim and the look all read.

**Acceptance:** `maps/austerlitz.map.json` with the relief alone validates; the draft page shows it; the sim compiler
builds it.

### 2. The draft-map mode in the game: the lit map view as a renderer

- The prototype's lit view, ported to TypeScript under `src/render/`, drawn from the compiled layers:
  - the shaded relief from the heightfield (`relief-shading`);
  - the water from the water layer (`water-paper`);
  - the woods in green from the vegetation layer;
  - the ways, the buildings and the contours.
- It replaces the art of today's S1b staff map, so there is one map view.
- The armies drawn as slabs from the sim's snapshots.
- The perf rules of the prototype's 150 fps plan (PR #136) come with it:
  - no full-screen clips;
  - redraw only on change;
  - the ink at a pixel ratio of 1 (decision 0056).

**Acceptance:** the same look as the prototype, screenshot against screenshot. Frame time on test machine A at 150 fps
or better.

### 3. The editor, on the draft-map mode

The map engine's "later: direct manipulation on the draft view, writing the same JSON", made real. It writes the map
file and nothing else:
- **Pick a kind** from the catalogue (`maps/kinds.json`), grouped by category.
- **Draw its shape:** a point, a line or an area. Barriers snap to the 2 m lattice in 8 directions (§3.6).
- **Edit the shape:** drag points, insert and delete them, and `follow` a line so a wood shares a stream's bank.
- **Attributes,** from the catalogue: type, unit, range, seasons.
- **Source and note:** every feature says where it comes from.
- **Validation errors in place,** with the feature's id and path, as the page already shows them.
- **Generators previewed live:** a street village along its road, a scatter in its region. A generated feature can be
  pinned.
- **Undo and redo.** The file is saved in a stable order and format, so a diff shows exactly what changed.
- **A tracing overlay:** a georeferenced scan, with control points onto known places (churches, crossroads,
  confluences), its opacity adjustable, under the features.

**Acceptance:** a map drawn from scratch in the editor round-trips (load, edit, save, reload) with no diff except the
edit, and validates.

### 4. Draw Austerlitz 1805

Real authoring work, on the editor, from the chosen period map:
- **Ways:** the Brünn–Olmütz highway and the period roads and tracks.
- **Water:** the Goldbach and its brooks, the Satschan and Menitz ponds as they were in 1805.
- **Villages:** Pratzen, Sokolnitz, Telnitz, Kobelnitz, Puntowitz, Blasowitz and the others, as street villages along
  their roads, or pinned houses.
- **Woods, fields, marsh and vineyards.**
- **Zones** for the scenario.
- **Corrections:** the period map's distortion corrected against the relief, so a stream follows its valley and a road
  its ridge. Each feature keeps its `source`.

**Acceptance:** the map validates and shows in the draft-map mode. The owner checks it against the period map.

### 5. The real map from the same file: the look compiler (M4) and the handover

- **The look compiler** writes what `src/look/` reads today from `author.ts`, `cover.ts`, `buildings.ts` and
  `water-data.ts`:
  - the heightfield;
  - the ground and cover classes;
  - the water;
  - the buildings.

  The look page loads the compiled map instead of its hand-written world.
- **The zoom handover** on one page and one camera: the draft-map mode at far zoom, the painted world close, in the
  staff map's stages (`docs/proposals/staff-map/design.md` §9). The light is decided once, between the map's
  north-west and the world's east-south-east sun.
- **The demo world:** the hand-written world on `main` is retired, or kept as a second map file.

**Acceptance:**
- zooming from the whole field down to 15 m shows one place throughout;
- the armies stand on the same ground in both modes;
- the frame budget holds (decision 0050's bars).

### 6. The sim on Austerlitz

- The sim compiler on `maps/austerlitz.map.json`.
- An order of battle file for the armies, referencing it. This is its own design (sim-design §14), with the armies
  language.
- The look page's armies placed from that file.

## What runs in parallel

| Step | Needs | Can run beside |
|---|---|---|
| 0 | owner | — |
| 1 relief from DEM | #49 on `main` | 2, 3 |
| 2 lit map view in `src/` | #136, 0058 | 1, 3 |
| 3 editor | #49, and 2 for the final look (it can start on today's draft page) | 1, 2 |
| 4 draw Austerlitz | 1, 3, period map chosen | 5's compiler work |
| 5 look compiler and handover | 1, 2; 4 for the real content | 4 |
| 6 sim on Austerlitz | 4 | — |

## Open questions for the owner

1. **The real heights:** commit the derived heightfield (CC BY, with credit) or fetch it at build time?
2. **The period map** to trace, and whether its licence allows tracing.
3. **The draft page:** does the editor keep the map engine's flat draft page for debugging layers, or does the lit view
   replace it? One renderer is the rule (decision 0057), so the flat page would be a debug overlay of the lit view, not
   a view of its own.
4. **The demo world on `main`:** retire it when Austerlitz lands, or keep it as a second map file?
5. **The light at the handover:** north-west on the map, east-south-east in the world. Pick one, or turn between them
   with the zoom.
