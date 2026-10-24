---
status: accepted
date: 2026-10-24
---

# 0056 The map's ink renders at a pixel ratio of 1 by default; sharp ink is a setting

## Context

The lit map view (decision 0051, proposed) draws its marks on a 2D canvas over the WebGL world: blocks, slabs, arrows,
labels and smoke. Chrome rasterises those shapes on every redraw. On a 4K test machine (an RTX 3080 at a device pixel
ratio of 2), drawing them at the full ratio cost 14 to 23 ms a frame, and the 150 fps target allows 6.7 ms. WebGL at
the full ratio costs about 1 ms (`docs/plans/active/perf-150.md`).

## Decision

We will render the map's ink at a pixel ratio of 1, scaled up on high-density screens, and keep WebGL at the screen's
ratio. A **sharp ink** setting draws the ink at the screen's ratio, rounded up to a whole number, for whoever prefers
crisper marks to frame rate.

## Consequences

Good: the ink costs the same on a 4K screen as on a 1080p one (4.5 to 6 ms a frame at 30× on the test machine), and the
terrain stays crisp. Bad: on high-density screens the marks and labels are a touch softer than the terrain. The armies
still read first (the invariant), but less crisply than they could. A later move of the blocks and the smoke into WebGL
would make sharp ink cheap again.

## Alternatives considered

- **The full ratio always:** the sharpest, and 3 to 4 times the frame cost on 4K.
- **A fractional cap (1.25):** measured slower than 1 for little visible gain.
- **WebGL at ratio 1 too:** saves about 1 ms, and softens the terrain as well.
