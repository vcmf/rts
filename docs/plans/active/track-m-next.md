---
status: active
last_reviewed: 2026-10-24
---

# Plan: Track M after M3, the phases M4 to M9

Track M's roadmap after the generators (M1–M3, built: `docs/systems/map.md`), on `epic/map-engine` (decision 0020). The
map engine proposal (`docs/proposals/map-engine.md`) is frozen now that it is built. This plan supersedes parts of it:
- §7's toggle between draft and 3D;
- §10's "later" items;
- §1's non-goals of an editor and an importer;
- §13's 1.5 km play area.

This plan comes from the one-map plan (one-map-austerlitz, in PR #136): one map in the language, drawn with the editor,
seen as one map view that zooms into the painted world. Each phase gets its own plan when it starts. This file only
orders them.

## What it rests on (on `main`'s side)

- **Decision 0057, one language for the battlefield:** accepted, in PR #135.
- **Decision 0058, one lit map view for the editor and the game:** **proposed**, in PR #135. M6 and M7 build on it; if
  it changes, they change.
- **Decision 0061, square maps of 2 to 6 km, designed for play at true local scale:** accepted, in PR #136. It replaces
  §13's 1.5 km.
- **The staff map prototype** (PR #136, `prototypes/staff-map.html?style=lit`): the look M6 ports.

## The phases

| Phase | What | Needs |
|---|---|---|
| **M4: the look compiler** | A map's look data (heights, ground and cover classes, water, buildings) for the painted world, which the look page loads instead of its hand-written world | M3. The 3D world in tiles (Track E, item E-tiles) for maps larger than one tile |
| **M5: real relief** | A `relief.dem` kind, a `dem` source with its credit, the `.rdem` heightfield file, the ČÚZK importer (its plan: m5-real-relief, with its PR). Replaces W6's Terrarium source | M3 |
| **M6: the lit map view** | The prototype's lit view ported to `src/render/`, drawn from the compiled layers. The flat draft view becomes its debug overlays. 150 fps on test machine A | M3, M5 for real heights, decision 0058 |
| **M7: the editor** | On the lit view, in `app/map.html`: pick a kind, draw and edit shapes, attributes, sources, live validation and generators, a tracing overlay, undo, a stable save | M6 |
| **M8: Austerlitz** | A 6 km designed map after Austerlitz 1805, drawn in the editor from the real relief and a period map | M5, M7, the period map chosen |
| **M9: the zoom and the sim** | The staff map's staged zoom from the lit map to the painted world, on one page and one camera, with no toggle. The sim and an order of battle on the map | M4, M6, M8, E-tiles; the sim's compact 2 m grids (item S-data) for the sim; vision (item S-vision) for fog of war |

- **What runs in parallel:** M4 and M5 can run in parallel, and so can M5 and M6 (M6 starts on the example maps). M7
  waits for M6, M8 for M5 and M7, and M9 for the rest.
- **Items outside Track M** (the one-map plan's E-tiles, S-data and S-vision) get their plans in their tracks.

## Superseded elsewhere

- **The importer, W6** (`docs/plans/active/prototype-plan.md`): M5 replaces its source (ČÚZK's 5 m model instead of
  Terrarium). M8 traces the features that W6 meant to take from OpenStreetMap from a period map, with OpenStreetMap as
  a guide.
- **The staff map's SM2** (`docs/plans/active/staff-map.md`): it reads map features through M6's view, not through
  W6.
