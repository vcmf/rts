---
status: active
last_reviewed: 2026-10-23
---

# Plan: real terrain in the staff map prototype (an experiment)

## Problem

The owner asked whether real elevation data, rendered in our paper style, reads better than the prototype's
hand-made hills, how hard it is and what it costs. Decision 0057 (proposed in PR #135, not yet on main) makes the map
language the one description of the ground; a real-data importer was always planned (the map engine's proposal, "later"). Before designing it, one
experiment: real heights in the staff map prototype.

## Scope

- `tools/dem-fetch.mjs`: a crop of ČÚZK's DMR 4G (the Czech Republic's 5 m bare-ground terrain model; © ČÚZK, open
  data under CC BY 4.0, commercial use allowed, attribution "ČÚZK, <year>"), fetched from its image service in one
  request at its native 5 m, averaged onto the prototype's 10 m grid, written as a generated `.js` under the git-ignored `scratch/`.
  The data is never committed.
- `prototypes/staff-map.html?dem=<path.js>`: the height function returns the real heights (above the crop's lowest
  point, divided by the squeeze so slopes stay true; `?demz=1` keeps metres, an exaggeration by the squeeze) instead
  of the formula; the credit is shown in the title block; nothing else changes. Only a `.js` file of the page's own
  origin loads; a missing or mismatched file falls back to the made-up terrain with a warning.

Out of scope: the prototype's woods, villages, stream and ponds, which stay its own invented ones (some sit off the
real ground); real data for them (OpenStreetMap, corrected for 1805); real terrain in the map language (a "relief
from a raster" kind, an owner decision); battlefields outside the Czech Republic (other national models).

## Approach

- The crop: Austerlitz, centred on 49.118 N 16.737 E, the real ground squeezed 2.5× so the battlefield (about
  13.5 × 9.5 km) fits the prototype's frame, the Goldbach valley near the prototype's drawn stream.
- The prototype builds its height grid as the page loads, so the generated file is added from the page's head before
  the main script runs; only a `.js` file of the page's own origin and protocol is accepted.

## Acceptance

- `node tools/dem-fetch.mjs` writes the file; the heights are plausible (the Pratzen above the Goldbach).
- `?style=lit&dem=` with the generated file (relative to the page) renders without errors; screenshots against the
  made-up terrain.
- Without `?dem=`, the page draws as before.
- Frame and build time measured against the made-up terrain.

## Results

- The crop: 184.0–324.8 m (141 m of relief), no cell without data.
- Rendered (Windows Chrome over CDP, D3D11, RTX 3080): at true slopes (relief 56 m once squeezed) the Pratzen plateau
  and its flanks read clearly with fewer contours; with `?demz=1` (141 m, slopes 2.5× steep) the spurs, gullies and
  the western upland read strongly, as the first screenshots did. Frame 8.3 ms with or without real terrain. Ready
  (`window.__readyMs`, from navigation start, the data file's load included; three alternating runs each): real
  terrain 1.93–2.18 s, the made-up one 2.56–2.69 s. A missing file and a `//other-host` path both fall back to the
  made-up terrain (no script added).

## Review rounds

- **Round 1** (`/code-review high`): severe: the path check accepted a `//` path to another host, a script from any server. Fixed (the
  resolved URL must have the page's protocol and host), with: relative paths allowed, so the data loads from `file://`
  too; a warning and a record (`window.__bake.terrain`) when the file did not load; heights at true slope by default
  (they were exaggerated 2.5× by the squeeze, unstated); the crop's pixel centres on the page's grid (a half-cell
  margin); the TIFF reader sizing tag types properly and requiring one float band; the arguments checked; the grid's
  size checked against the page; the CC BY credit shown on the map.
- **Round 2**: moderate and light only, so the review stops. Fixed: the load time measured from navigation start (the
  first figure left out the data file's load); the tool checks the answer is a TIFF (the service answers errors as
  JSON); holes filled from their neighbours, not the lowest height (craters); the crop fetched at its native 5 m and
  averaged (bilinear sampling let ditches and banks alias into bumps); the heights fill the grid directly (no second
  sampler); the file records its cell and extent and the page checks them; the URL parameters parsed once.
