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
- `tools/campaign-theatre.mjs`: reads the data file and writes scratch/campaign-1805.js (git-ignored, never
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

- `node tools/campaign-theatre.mjs` writes the file; heights plausible (the Danube at Vienna about 160 m, the Alps
  above 3,000 m).
- The page renders with no console error (`tools/shot.mjs`), screenshots at the theatre zoom and closer (the Danube
  at Ulm, Vienna and Austerlitz), on test machine A's GPU (Windows Chrome over CDP).
- The bake and the frame measured on test machine A.
- The owner's verdict on the look against `design/campaign/refs/`.

## Results

- `node tools/campaign-theatre.mjs`: 187 terrain tiles, 84 river lines, 22 lakes, 111 roads routed; 3201 × 2001 nodes
  at 250 m, heights 53 to 4,033 m; 7.8 s with an empty cache. Spot heights against the real ones: Vienna 189 m,
  Ulm 481 m, Munich 525 m, the Pratzen 314 m (324 m); peaks are softened by the grid (the Grossglockner 3,562 m against
  3,798 m). St. Pölten to Vienna by the routed road: 58 km (about 60 km today).
- The look, settled by eye on the first rounds: the battle map's exaggeration and its hard shading floor crumpled
  every hill at this scale (×8 read as crushed paper, the shade a muddy olive). Now: heights ×3 for the light, the
  slope light from heights smoothed over about 750 m, a soft knee toward the darkest and lightest tones (0.76 and
  1.08 of the paper) instead of a clamp, a cooler shade, a paler parchment (`#e6d8b4`). `?rz=`, `?sun=`, `?floor=`,
  `?top=` to try others.
- At the theatre's zoom it reads as a relief print: the Alps, the Bohemian ranges, the Black Forest and the Jura
  stand off the plains, and the plains carry the rivers, roads and towns. Closer (the Danube at Ulm, about 20 km
  across the screen) the Swabian Jura and the moraines south of the Danube read well. **In the Alps up close the cast
  shadow fills most valleys** at a 28° sun: an open tuning (the sun's height, or less exaggeration for the shadow).
- Natural Earth's rivers are generalised: the Danube line sits up to a few km off its valley in the relief at the
  closest zoom. K4 traces the water (or uses HydroRIVERS).
- Measured on test machine A's GPU (RTX 3080, Windows Chrome, D3D11, over CDP, headless): the bake at load 2.5–2.8 s
  (relief and lakes, main thread), the page ready in 3.9–4.2 s (the 17 MB theatre file included). A frame, GPU waited
  for, at 1600 × 900: 0.45–0.53 ms still, 7.8–9.0 ms with the ink redrawn (as while panning); at 3840 × 2160 (device
  ratio 1): 1.2–1.3 ms still, 8.3–9.4 ms with the ink. The ink (rivers and labels on a 2D canvas) is the cost; it moves
  to the GPU with K3.

## Open questions

- The Alps up close: a higher sun, a lower exaggeration for the cast shadow, or both.
- The region names sometimes sit under a city's name; their placement joins the label collision in K3.
