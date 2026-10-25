---
status: active
last_reviewed: 2026-10-25
---

# Plan: M6, the lit map view in the game's code

Track M, on `epic/map-engine` (decision 0020). Phase M6 of `docs/proposals/map-engine.md` §10, step 2 of
`docs/plans/active/one-map-austerlitz.md`. Several PRs into the epic (below); this plan covers them all and details the
first.

## Problem

The map's one view is the lit map (decision 0058): paper, shaded relief, contours, woods, water as a wash, raised
houses, the armies as slabs, leaning 20° off straight down (decision 0055). It exists only in the single-file
prototype (`prototypes/staff-map.html?style=lit&relief=shaded`, settled by eye with the owner), drawn from invented
data. The map page (`app/map.html`) draws the compiled map as a flat raster of category colours (`src/map/draft.ts`).
The editor (M7) is to be built on the lit view, and the flat drawing is to become debug overlays switched on in the
settings (the owner, 2026-10-25).

## The split

| PR | What | Acceptance |
|---|---|---|
| **M6a** (this plan's detail) | The lit terrain in `src/render/lit/`, on the map page: paper and grain, the shaded relief, woods, water, contours, the tilt; the flat draft as an overlay setting; the outlines and ids drawn through the same camera | The same relief look as the prototype for Austerlitz; every example map draws; the bakes' time and memory at 6 km measured; the frame measured |
| **M6b** | Ink from the features' shapes: ways, banks and shores, wood edges, houses raised and lit, village yards, names; crisp at every zoom | The generated and valley maps against the prototype's look |
| **M6c** | The debug overlays as settings: the flat colours (M6a), outlines and ids (M6a), the hover readout, errors in place, passability per kind of unit, depth, slope, sight from a point | Each overlay checked by `tools/map-page-check.mjs` |
| **M6d** | The game's staff map from the lit view (the S1b page's `StaffMap` art replaced for maps with layers), the armies as slabs; or in M9 with the zoom | 150 fps at 30× on test machine A |

## Decisions taken here (decision 0064)

- **Host:** the map page first (the editor's base, M7); the game page in M6d or M9.
- **Babylon**, as the look page: M9 joins the two views on one camera, and the EASU pass exists (`src/look/post.ts`).
- **Flat at map zoom:** the prototype draws the terrain flat at the map's zoom (it rises only toward the painted
  world). M6a draws one flat plane; the relief is the bakes and the contours. The rising is M9's.
- **Exact heights in the shader:** the 2 m node heights go up as a float texture read with `texelFetch` (WebGL2,
  decision 0046) and interpolated in the shader, so the contours are those of the compiled heights, not of a
  decimated mesh.
- **The bakes run in the compile worker**, after `apply`, as pure functions in `src/render/lit/bake.ts`: the relief
  (slope light, cast shadow, exposure) on the 2 m nodes, and a cell mask (water depth, woods, water).
- **The light is a parameter:** one of the 8 directions of the grid for the cast shadow's walk (the prototype hard-codes
  the north-west diagonal), the exact vector for the slope light. North-west by default (one-map open question 6
  stays open; turning it later is a uniform and a rebake).
- **Contours every 5 m, index every 25 m**, in absolute heights (the map's datum added), as settled in the prototype.
- **No armies in M6a–c:** the armies language is out of scope; slabs come with the game page (M6d).

## M6a in detail

- `src/render/lit/bake.ts` (no DOM, run in the worker):
  - `bakeRelief(heights, nx, nz, cell, light)`: the prototype's bake on the node grid: cast shadow by a walk from the
    light's side along its grid direction, softened over a few metres; exposure from two box means (about 24 m and
    80 m); Lambert on heights exaggerated ×2, sun 30° up. RGBA bytes, the south row first.
  - `bakeMasks(layers)`: per cell, R water depth (0..1 over 0..1.5 m), G woods (vegetation with growth `stand`), B water.
- `src/render/lit/view.ts`: a `LitView` on its own canvas: an engine, a camera from the page's view (centre, pixels
  per metre at the centre, tilt), the plane over the map's extent, its shader (`lit.vert`, `lit.frag`, ported from the
  prototype's `TER_FS` lit and shaded paths: paper, worn border, woods, relief tone, water wash with the sunk bank,
  contours, paper grain), and `project` / `unproject` for the overlays and the hover.
- `src/render/lit/paper.ts`: the tileable paper and noise textures, from the prototype.
- The map page: the lit canvas under the overlay canvas; a "view" setting (lit, or flat colours), `?tilt=`;
  pan, zoom and hover through the view's projection.
- The worker's reply gains the bakes; the draft raster stays (the flat colours).

## Acceptance (M6a)

- Austerlitz in the lit view beside the prototype's `?style=lit&relief=shaded&dem=` at a matching zoom: the same
  relief style (the prototype squeezes its ground 2.5×, so the shapes differ in scale).
- Every map in `maps/` draws in both views with no console error; the map page check passes.
- The bakes' time in the worker and their memory at 6 km, and the frame time on the dev Mac, measured (test machine A
  is not here: its 150 fps is M6d's acceptance).

## Results (M6a)

- The map page draws every map in `maps/` in the lit view and in the flat colours, with no console error; the outlines,
  ids and play area follow the tilted camera. `tools/map-page-check.mjs` passes (a save to a redraw in 0.52 s).
- Austerlitz (6 km): the bakes take 0.48 s in the worker (relief on 3001² nodes and the mask), beside `apply`'s
  0.52 s; the textures are about 144 MB on the GPU (heights, relief, mask, flat draft). The relief reads as the
  prototype's `?style=lit&relief=shaded&dem=` (same shader, same palette), at true scale where the prototype squeezes
  2.5×: more contours, steeper-looking slopes.
- The frame on the GPU is not measured: headless Chrome returned 0.05–0.08 ms a frame for `gl.finish` timing, which
  does not wait for the GPU there. M6d measures it on test machine A with the game page.

## Open questions

1. The water wash needs the distance to the bank for its sunk-bank shading; the prototype takes it from a blurred
   depth. M6a uses the depth's gradient as the prototype does; a true distance field may read better.
2. The bakes at 6 km: 9 M nodes. Measured in M6a; if the worker takes over a second, a 4 m bake for maps over 3 km.
