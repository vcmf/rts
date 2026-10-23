---
status: active
last_reviewed: 2026-10-23
---

# Plan: real terrain in the staff map prototype (an experiment)

## Problem

The owner asked whether real elevation data, rendered in our paper style, reads better than the prototype's
hand-made hills, how hard it is and what it costs. Decision 0050 (#135) makes the map language the one description of
the ground; a real-data importer was always planned (the map engine's proposal, "later"). Before designing it, one
experiment: real heights in the staff map prototype.

## Scope

- `tools/dem-fetch.mjs`: a crop of ČÚZK's DMR 4G (the Czech Republic's 5 m bare-ground terrain model; © ČÚZK, open
  data under CC BY 4.0, commercial use allowed, attribution "ČÚZK, <year>"), fetched from its image service in one
  request, resampled onto the prototype's 10 m grid, written as a generated `.js` under the git-ignored `scratch/`.
  The data is never committed.
- `prototypes/staff-map.html?dem=<path.js>`: the height function returns the real heights (metres above the crop's
  lowest point) instead of the formula; nothing else changes.

Out of scope: the prototype's woods, villages, stream and ponds, which stay its own invented ones (some sit off the
real ground); real data for them (OpenStreetMap, corrected for 1805); real terrain in the map language (a "relief
from a raster" kind, an owner decision); battlefields outside the Czech Republic (other national models).

## Approach

- The crop: Austerlitz, centred on 49.118 N 16.737 E, the real ground squeezed 2.5× so the battlefield (about
  13.5 × 9.5 km) fits the prototype's frame, the Goldbach valley near the prototype's drawn stream.
- The prototype builds its height grid as the page loads, so the generated file is added from the page's head before
  the main script runs; only a plain relative `.js` path is accepted.

## Acceptance

- `node tools/dem-fetch.mjs` writes the file; the heights are plausible (the Pratzen above the Goldbach).
- `?style=lit&dem=/scratch/dem-austerlitz.js` renders without errors; screenshots against the made-up terrain.
- Without `?dem=`, the page draws as before.
- Frame and build time measured against the made-up terrain.

## Results

- The crop: 184.0–324.8 m (141 m of relief), no cell without data.
- Rendered (Windows Chrome over CDP, D3D11, RTX 3080): the Pratzen plateau with its spurs and gullies, the western
  upland and the Goldbach valley read clearly in the contours. Frame 8.3 ms with or without real terrain; build
  1.2 s against 1.9 s (no formula terrain to compute).

## Review rounds
