---
status: active
last_reviewed: 2026-10-24
---

# Plan: 150 fps in the staff map prototype

## Problem

The owner asked for a steady 150 fps on their RTX 3080, that is a mean frame of 6.7 ms or less at every zoom, after
seeing lag on the map. Two investigations measured where the frame goes.

- **WebGL is cheap:** the terrain, relief and world take about 1 ms of GPU time at map zoom, and under 1 ms at 4K.
- **The 2D ink canvas is the cost.** Its JavaScript is only about 2 ms, but Chrome then has to rasterise its shapes,
  which holds back the next frame. Full-screen clips were the worst part (one per slab and per worn block). Smoke drawn
  off screen came next.

The measuring scripts and the patched copies are kept outside the repository, under the session's scratch folder.

## Scope

In `prototypes/staff-map.html`:
1. **Slab sides without a clip:** only the sides wound on screen as the top is are drawn; they never overlap it.
2. **Wear bites without a clip:** they start on the edge and stop before the far edge or a square's hole.
3. **Small clips:** the gun and its gaps clipped to the icon's area; the arrow's clip limited to its bounds.
4. **Smoke:** puffs off screen are skipped; each cloud's path is built once and placed by transform; at most 220 live
   puffs.
5. **The ink redrawn only when it can have changed:** the camera, the game clock, the pointer, a selection, or anything
   still animating.

Out of scope, for a next step if the spikes matter: drawing the blocks and the smoke in WebGL (instanced quads).

## Acceptance

Mean frame and p95 at map, mid and close zoom, idle and in a fight, against the page before; the look unchanged.

## Results

Windows Chrome over CDP, D3D11, RTX 3080, 1920×1080, vsync and the frame cap off. Gap between frames, 5–6 s per run. The after
column is the page after review round 1.

| View | Before: mean / p95 | After: mean / p95 |
|---|---|---|
| map, paused | 8.2 / 41 ms | 0.6 / 1 ms |
| mid, paused | 7.5 / 49 ms | 0.4 / 0.9 ms |
| close, paused | 5.4 / 8 ms | 0.4 / 0.9 ms |
| map, 30× (normal play) | — | 4.95 / 23 ms |
| mid, 30× | — | 5.8 / 40 ms |
| map, 90× fight | 13.0 / 31 ms | 8.0 / 16 ms |
| mid, 90× fight | 13.1 / 36 ms | 9.6 / 21 ms |
| close, 90× fight | 6.7 / 11 ms | 5.1 / 6 ms |

- **Met:** a mean of 150 fps or better in normal play and whenever paused.
- **Not met:**
  - a heavy fight at 90× at map and mid zoom (105 to 125 fps);
  - the spikes: about one frame in 20 over 20 ms while the battle runs.

  Both come from the volume of shapes Chrome draws on the ink canvas. The next step would move the blocks and the
  smoke into WebGL.

## Review rounds

- **Round 1** (`/code-review high`): severe.
  - Paused, a routing unit that was fading out stopped pulsing: the redraw test skipped units already going.
  - Without the clip, wear bites could stick past a block's corners.
  - Capping the smoke removed live puffs halfway through their fade.

  Fixed:
  - the redraw test takes fading units, and redraws once the web fonts arrive;
  - bites stay inside their edge's ends and short of the far edge;
  - when the smoke is full, a new puff is not added, and spent puffs are dropped first, so none vanishes mid-fade.

  With:
  - the slab shadows' clip bounded to the shadows (the last full-screen clip);
  - the arrow's clip through `clipOut`;
  - the dead clip in `damage` removed;
  - the doc comments for `slabSides` and `signedArea` put back on their functions.

  Measured again: 30×, map 4.95 / mid 5.8 ms mean; 90×, map 8.0 / mid 9.6 ms.
- **Round 2**: severe. With the smoke full, a new volley showed nothing: no flash, no cloud.

  Fixed: each puff ends on its own life (`smokeLife`), and when the smoke is still full the puff nearest the end of its
  fade gives way, so new fire always shows.

  With:
  - wear bites placed between the edge and the opposite edge at the same point; they had assumed a parallelogram, so
    they stuck out under perspective;
  - the ink redrawn after any resize, since a resize clears it;
  - only animations on screen keep the ink redrawing;
  - late fonts caught on `loadingdone`;
  - `clipOut`'s doc comment back on it;
  - the table above corrected to the final measurement.
  - Found in testing after round 2: the redraw test missed unit changes made while paused (an order, a change of
    formation, a strength set by hand), so the ink stayed stale. Fixed: a cheap checksum of every unit's drawn state, plus
    the number of orders, joins the key. Paused map still 0.52 ms, map 30× 4.87 ms.
- **Round 3**: moderate and light only, so the review stops (three rounds). Fixed:
  - **Animation flags.** The draw code now marks what is still moving on the frame clock: the routing pulse, a turning
    block, an arrow's reveal, a fading trail and a live puff on screen. The redraw test checks that flag. It replaces a
    hand-kept list that could drift from the draw code (square smoke at its drawn face, unseen orders and trails).
  - **Key stored every frame,** so a return to an earlier state, such as the pointer leaving a unit, is still seen.
  - **Unit state hashed, not summed,** so two changes cannot cancel out. It includes the previous formation.
  - **Wear bites:** they start 2 px outside the edge again, so they break the outline, and some cut right through, as
    before the change.

  Left:
  - a square's bite depth is measured across the drawn ring, which can differ slightly from the hole under
    perspective;
  - the redraw key is a string built each frame.

  Measured again: 30× map 4.86 / mid 5.83 ms mean; 90× map 7.56 / mid 8.28 ms; paused 0.4–0.55 ms. The first run after
  an edit reads high, at about 4.9 ms paused, while the caches warm up; repeats give 0.53 ms.

## On the owner's 4K screen

The owner measured about 45 fps at mid zoom and 90 fps close, on a 4K screen. The measurements above were taken at 1920×1080
with a device pixel ratio of 1. The checks below emulate the owner's screen: 1920×1080 CSS pixels at a ratio of 2, 30×.

- **The ink at the full pixel ratio:** at 4 times the pixels, Chrome's rasterising of the ink took 14 to 23 ms a frame
  at close and mid zoom, while the JavaScript stayed at 2.9 ms.

  Fixed: the ink renders at a ratio of 1. A **sharp ink** toggle in the controls (remembered, or `?sharp=1`) brings
  back the full ratio. WebGL stays at the screen's ratio (`GL_DPR`), since it costs about 1 ms at 4K; so the terrain
  stays crisp and only the marks are a touch softer.

  | View | Ink at ratio 2 | Ink at ratio 1 |
  |---|---|---|
  | close | 14–23 ms | 4.5–4.9 ms |
  | mid | 14–23 ms | 5.6–5.9 ms |
  | map | 13–14 ms | 4.6–4.9 ms |

- **The figures:** each unit's soldiers are now built only when the unit changes (`unitFigures`, cached on the unit),
  copied each frame, and skipped off screen. Before, every soldier of every unit was rebuilt every frame of game time:
  `updateFigures` took 5.5 ms of JavaScript at R700 to R200.

  | Zoom | Before | After |
  |---|---|---|
  | R700 | 10.5–23 ms | 6.7 ms (`updateFigures` 2.4) |
  | R400 | — | 1.4 ms |
  | R200 | — | 1.3 ms |
