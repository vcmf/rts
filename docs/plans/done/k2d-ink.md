---
status: done
last_reviewed: 2026-10-31
---

# Plan: K2d, the campaign map's names and ink

Track K (`docs/plans/active/track-k.md`), on `epic/campaign`, after K2c (`docs/plans/done/k2c-stream.md`). The
campaign page (`app/campaign.html`) draws the map but no names: the K1 prototype (`prototypes/campaign-map.html`)
has them, as ink on a 2D canvas over the 3D map (towns, river names, region names, `drawInk`). K2d brings them to the
page, keeps them from overlapping, and hides what the relief hides: the prototype draws a town behind a ridge over the
ridge.

## Scope

- **The labels' data**, baked with the tiles: `tools/campaign-tiles.ts` writes `labels.json` into each build, named
  by the manifest, from the theatre (the towns' and regions' places, the rivers with their names and ranks, as
  `tools/campaign-theatre.ts` wrote them) and the 1805 data file (`prototypes/campaign-1805.data.js`: the towns'
  names, sizes and fortresses, the regions' names and angles). The rivers' points thinned to every other one, as the
  prototype projects them. The theatre as data (K3) replaces both sources later; the labels' file stays the page's
  input.
- **`src/render/campaign/labels.ts`**, pure, tested: which towns show at a zoom (the prototype's sizes by pixels per
  km), a town's mark and name size, the four places a town's name is tried (right, left, above, below), the
  placement that never lets two boxes overlap (the larger towns first, then the river names), a river name's place
  (the middle of its longest run on screen, longer than 160 px, along its course, upright), the regions' fade with
  the zoom.
- **Hidden behind the relief**: a label's anchor (a town's mark, a river name's middle, a region's centre) is drawn
  only if the ray from the camera to it, on the raised map, passes over the ground as drawn
  (`src/render/campaign/camera.ts`, a pure test on a height function, sampled along the segment; the view's own
  height, which follows the patch up close).
- **`src/render/campaign/ink.ts`**: the 2D canvas over the map, redrawn when the view changes (the view's
  `onViewChanged`): the regions, the towns (dark blocks, a fortress ringed), the river names in italic blue, with the
  prototype's fonts (Instrument Serif), its paper halo and its colours; clipped to the map's frame. The view gains the
  projection of a map point (at its height) to the screen.
- Docs: `docs/systems/campaign-map.md` (the labels, the ink), this plan.

## Acceptance

- Vitest: the labels' pure parts: no two placed boxes overlap on a crowded set; the towns by zoom; a river name on its
  longest run, upright; the ray test (a ridge between the camera and a point hides it, a point in the open is seen).
- Page check on test machine A, at the prototype's views (the whole theatre, the Danube, the Alps up close, Lake
  Constance): screenshots side by side with the prototype's; every placed box read back from the page, none
  overlapping; up close in the Alps, each town drawn is where the pointer's ray meets the map (`groundAt` at its mark
  lands within 1 km of it) and each town hidden is not (the ray meets a ridge first).
- The frame: the ink's time while panning measured (the prototype's river names cost about 2 ms a redraw at 1080p);
  panning up close still a mean of about 3 ms a frame.

## Results

On test machine A (Windows Chrome on its RTX 3080, headless over CDP, 1600 × 900 for the checks, 1920 × 1080 for the
frame):
- The labels baked with the tiles: 70 towns, 11 regions, 83 named rivers (`labels.json`, the manifest's format 5).
- At eleven views (the whole theatre, the Danube, Lake Constance, and views up close on the alpine towns): no name
  over a name or a mark; every town drawn is where the pointer's ray meets the map, every town hidden is not (none
  off by the 1 km tolerance either way). Landeck and Reutte, in their valleys, are hidden behind the ridges south of
  them from 30 km, as the ray sees them. The far view's ink as the prototype's (screenshots).
- The ink's redraw: 0.7 to 3.6 ms (the towns' rays 0.75 ms of 70 towns at 250 km), 12 ms the first time at a view
  (the fonts' glyphs drawn the first time); it was 8 to 21 ms at first, before the projection read the matrix off (no
  vectors made a point), the screen's size read once a redraw (each read took the page's layout), the towns off the
  screen skipped before their rays, and the close level's heights read from the slots without a key a node.
- Panning, the ink redrawn each frame: up close a mean of 3.8 ms, the 95th centile 5.5 ms at 1080p (3.0 ms before the
  ink); 3.9 and 7.1 ms at 4K; at 250 km a mean of 5.2 ms and the 95th centile 6.9 ms at 1080p. The 4K run's 95th
  centile is over the 6.7 ms line: the labels on the GPU (below) are the way past it if it holds on other machines.

## Review rounds

- **Round 1** (`/code-review high`): severe: the ink was drawn only when the view moved, before the close tiles of the
  frame were written: tiles that came or faded in after the camera stopped changed the surface under the names and
  their rays, and the names stayed where they were (now redrawn in every frame where the view or the surface changed,
  after both are set); a river's name took a level box while drawn turned along its course (a steep river's name could
  cross a town's: its box now the one round the turned text, `turnedBox`). With: the labels placed from the data file
  through the theatre's projection (a region renamed or moved there was lettered at another's place); a font that
  fails no longer stops the page, both faces loaded at once; the ink brings the camera's matrix up to date itself; a
  resize takes the pixel ratio again; the rivers whose box is wholly off the screen not projected, a region tested on
  the screen before its ray; a river's name where half its visible length is reached; an unused method gone. The
  regions' lettering lies under the names, as the period's maps letter it, and is not in the placement. Measured
  after, at eight views: no name over a name or a mark, every town drawn and hidden as its ray finds; a redraw
  0.25 to 1.9 ms; panning up close a mean of 2.8 ms, the 95th centile 3.8 ms, the worst 5.0 ms; at 250 km 3.6, 5.1
  and 6.2 ms (1080p): the culled rivers took the ink back under the 6.7 ms line.
- **Round 2**: no severe finding; fixed: the data file read and its frame checked before the bake, not after it; only
  the rivers the page draws (rank 6 or larger) named (83 named lines down to 19: a name had been lettered where no
  river is drawn); the rivers' boxes culled between the ground's real lowest (a sunk lake's bed) and highest; a
  fortress's mark as large as its ring; a river's next longest run tried when the longest is hidden or taken; the
  rivers' boxes in one loop; the ink drawn again when the fonts come. Left: the ink is redrawn while any tile fades
  in (0.4 s a tile), not only one under the names; the clip-space product written twice (the view's `clipOf` and the
  ink's cull).

## Open questions

- Labels in the GPU (signed-distance text drawn into the scene, hidden by the depth buffer) instead of a 2D canvas
  tested by rays, if the ink's cost or its look calls for it.
