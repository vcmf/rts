---
status: active
last_reviewed: 2026-10-29
---

# Plan: K1, the 1805 theatre in the lit style (a prototype)

Track K, on `epic/campaign` (`docs/plans/active/track-k.md`). The look: `docs/proposals/campaign-map.md`.

## Problem

The owner asks whether a campaign map of Europe can look like the shaded relief prints in `design/campaign/refs/`,
in the style of the battle map's lit view. Before any game code, one experiment: the 1805 theatre, from Strasbourg to
Austerlitz, drawn from real heights, with its rivers, towns and roads, judged by eye.

## Scope

- `prototypes/campaign-1805.data.js` (committed, written by hand): the theatre's frame (its centre and extent), about
  70 towns (name, position, size) and about 120 roads between them (high road or country road), and the region names.
  The towns' positions are their modern ones; the roads are the period's main routes as far as known, a sketch for
  the look, not a traced network (K4).
- `tools/campaign-theatre.ts`: reads the data file and writes scratch/campaign-1805.js (git-ignored, never
  committed):
  - the heights on a 250 m grid in a Lambert azimuthal equal-area projection centred on the theatre, from the AWS
    terrain tiles (Terrarium PNGs; SRTM, GMTED2010 and EU-DEM; their attribution shown on the page), cached under
    `scratch/`;
  - the rivers and lakes of Natural Earth (public domain; its 10 m rivers with the European supplement, and lakes),
    clipped and projected;
  - each road routed over the heights: the cheapest path on a 1 km grid, slope costing more than distance, so a road
    follows the valleys as real ones do, then smoothed.
- `prototypes/campaign-map.html`: loads both files and draws the theatre:
  - the relief baked at load from the heights (the battle map's bake: the slope's light, a cast shadow from the
    north-west, the exposure), heights exaggerated for the light (`?rz=`), the sun's height (`?sun=`);
  - the parchment paper and its grain, the relief in the paper's hues, lakes as a sunk wash;
  - the ink on a canvas above: rivers widening downstream, roads in red ink (country roads dashed), towns as blocks
    sized by importance, names in serif small caps, regions letter-spaced across the map; what is shown thins out
    as the camera pulls back;
  - the plate: the map's edge with a thin worn border, a soft shadow on a darker paper beyond;
  - the camera tilted 20° off straight down (decision 0055), pan by drag, zoom by the wheel toward the cursor;
  - `window.__bakeMs`, `window.__readyMs`, `window.__proto` for the tools.

Out of scope: armies, orders and turns (K2); the offline bake (K3); a checked data format (K4); Europe (K7).

## Acceptance

- `node tools/campaign-theatre.ts` writes the file; heights plausible (the Danube at Vienna about 160 m, the Alps
  above 3,000 m).
- The page renders with no console error (`tools/shot.mjs`), screenshots at the theatre zoom and closer (the Danube
  at Ulm, Vienna and Austerlitz), on test machine A's GPU (Windows Chrome over CDP).
- The bake and the frame measured on test machine A.
- The owner's verdict on the look against `design/campaign/refs/`.

## Results

- `node tools/campaign-theatre.ts`: 187 terrain tiles, 84 river lines, 22 lakes, 111 roads routed; 3201 × 2001 nodes
  at 250 m, heights 53 to 4,033 m; 7.8 s with an empty cache, 4.4 s from it. Spot heights against the real ones:
  Vienna 189 m, Ulm 481 m, Munich 525 m, the Pratzen 314 m (324 m); peaks are softened by the grid (the
  Grossglockner 3,562 m against 3,798 m). St. Pölten to Vienna by the routed road: 58 km (about 60 km today); Stockach
  to Bregenz goes round Lake Constance, 70 km. The tool's pure parts (`tools/campaign-theatre-lib.ts`: the projection,
  the grid, the router) are tested in `test/campaign-theatre.test.ts`; it reuses the heap and the simplification of
  `tools/streams.ts`, the PNG reader of `tools/png.mjs` and the ring helpers of `src/map/geometry.ts`. The Terrarium
  decoding (red · 256 + green + blue / 256 − 32768) is checked only by the spot heights below.
- The look, settled by eye on the first rounds: the battle map's exaggeration and its hard shading floor crumpled
  every hill at this scale (×8 read as crushed paper, the shade a muddy olive). Now: heights ×3 for the light, the
  slope light from heights smoothed over about 750 m, a soft knee toward the darkest and lightest tones (0.76 and
  1.08 of the paper) instead of a clamp, a cooler shade, a paler parchment (`#e6d8b4`). `?rz=`, `?sun=`, `?floor=`,
  `?top=` to try others. Then, after the owner's first look (2026-10-29: "sun higher and shadow deeper and brighter lit
  slopes"): the sun at 38°, the tones 0.68 to 1.16 of the paper, the cast shadow down to 0.7. Second look (2026-10-29: "less relief exaggeration … more white … the shadow must look more
  contrasted (darker) … contour line will make it more cool"): heights ×2, the slope light from heights smoothed over
  about 1.25 km (`?smooth=`), a warm off-white paper (`#eeeadf`), tones 0.55 to 1.16, the cast shadow down to 0.6, and
  contours every 200 m with an index line every 1,000 m (`?contour=`), drawn from heights smoothed over about 1.75 km
  in a half-float texture (8 bits drew them in 16 m stairs), each fading where its lines crowd on screen. How to
  simplify further: a research note, in progress. Third look (2026-10-29: "give contour a darker color and water ocean blue, and shadows of mountain …
  darker (near black, warm black)"): the shade runs from the paper to a warm black ink (`#2a2119`, `?dark=` how far,
  0.88), contours in a dark warm brown, faded sooner where they crowd, lakes and rivers an ocean blue (`#3b78b0`).
  Darker than the battle map's readability bound (#141: the darkest about 0.6 of the paper): to check once the
  armies are on it (K2). Fourth look (the owner's grey contour reference: "u have dark shadow, but u also have light, like near
  true white"): flat ground a mid tone (0.86 of the paper, `?base=`), so the lit slopes rise to near white (`#fdfcf8`)
  above it and the shade falls to the warm black below; illuminated contours (Tanaka): a line near white where its
  slope faces the light, dark where it faces away. The page draws the print every frame again: drawing only on a
  change left an empty frame in a visible Chrome (its shader compiles in the background); the ink is still redrawn
  only on a change. Fifth look (the owner: "contour line must not have 'light' part … put close height to same bracket … low
  become flat"): contours in dark ink only; the light reads terraced heights: the contour field snapped down to its
  200 m band (`?terrace=`, 0 off), each step softened over a cell either side, 0.3 of the smoothed real relief mixed
  back (`?detail=`). Low ground goes flat and the relief reads as stacked layers, their banks on the contour lines. Lakes are a mask at twice the heights' resolution (125 m), for smoother shores.
- At the theatre's zoom it reads as a relief print: the Alps, the Bohemian ranges, the Black Forest and the Jura
  stand off the plains, and the plains carry the rivers, lakes, roads and towns. Closer (the Danube at Ulm, about
  20 km across the screen) the Swabian Jura and the moraines south of the Danube read well. In the Alps up close the cast
  shadow filled most valleys at a 28° sun; at 38° the ridges and valleys read.
- Natural Earth's rivers and lakes are generalised: the Danube line sits up to a few km off its valley in the relief
  at the closest zoom, and Lake Constance's eastern shore is cut short of Bregenz. K4 traces the water (or uses
  HydroRIVERS).
- Measured on test machine A's GPU (RTX 3080, Windows Chrome, D3D11, over CDP, headless): the bake at load 0.78–0.79 s
  (relief and lakes, main thread; a canvas blur on the lake mask had cost 1.8 s of the first 2.6 s), the page ready in
  1.3–1.4 s (the 17 MB theatre file included). A frame, GPU waited for, after review round 3 (mipmapped textures): at
  1600 × 900, 1.8 ms still, 6.0 ms with the ink redrawn (as while panning); at 3840 × 2160 (device ratio 1), 2.7 ms
  still, 6.5 ms with the ink. The page draws only when the view changes. The ink (rivers and labels on a 2D canvas) is
  the cost; it moves to the GPU with K3.

## Review rounds

- **Round 1** (`/code-review high`): severe: every lake was simplified to two points (a closed ring's chord has no
  length), so no lake was drawn or closed to the roads; picking scaled CSS pixels twice on screens above a device
  ratio of 1 (Babylon scales them itself), so panning, zooming to the cursor and the zoom thresholds were wrong there.
  Fixed, with: the textures mapped node to texel centre and a cell that does not divide the frame refused; the tool
  in TypeScript, its pure parts tested, the heap and the hairpin-safe simplification reused from `tools/streams.ts`;
  towns and regions projected once by the tool (no second projection in the page); river and road lines projected
  once a redraw; a faster base64 decode; lines within 120 columns.

- **Round 2**: severe: up close (the camera under about 80 km in mid-map), the frame's south corners fell behind the
  camera and the perspective divide flipped them, so the ink's clip lay off the screen and every line vanished; lines
  crossing behind the camera would have streaked across it. Fixed: lines and the frame are cut at the camera plane
  before the divide. With: the router refuses a diagonal step past a closed (lake) cell, skips stale heap entries and
  names the road it cannot route; the PNG decoder, `inRing` and `lineLength` reused from `tools/png.mjs` and
  `src/map/geometry.ts`; the cell limited to 200–2,000 m (finer passes the page's texture and canvas limits); the URL
  values clamped (a 0 kept, the shading's knee never divided by zero); a drag ended by a cancelled pointer too.
  The closest zoom (about 25 km) shows the limit of the 250 m grid: the relief goes soft below about 60 km (K3).

- **Round 3**: no severe issue; fixed: a theatre file older than the data file says so instead of throwing every
  frame; the lake mask falls back to one texel a cell where the GPU's textures are smaller; the italic face awaited
  for the river names; the relief and lake textures mipmapped; the page draws only when the view changes. Left open
  (below): the drawn road against the lake shores, the strokes batched, the near-plane cut tested as a pure function,
  the lakes closed by rows. Review stops here (`AGENTS.md`, Workflow).

## Open questions

- The region names sometimes sit under a city's name; their placement joins the label collision in K3.
- A road is routed out of the lakes, but simplified within 400 m and smoothed after: along a shore it can cross the
  lake's wash by a little. K4's roads are traced, not routed.
- The ink's cost while panning: roads and rivers stroked per line (batched by style, or drawn on the GPU in K3).
- The near-plane cut (`screenLine`, `frameOnScreen`) lives in the single-file page with no test; it moves into a
  tested module when the map comes into the game's code (K5).
- The router closes lake cells point by point; `ringRow` of `src/map/geometry.ts` does it by rows, needed at
  Europe's scale (K7).
