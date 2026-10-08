---
status: accepted
date: 2026-10-08
---

# 0002 The camera is always top-down; there is no sky

## Context

The north-star composition and the art direction (Puss in Boots: The Last Wish) work from above; a sky would need a separate art and lighting solution.

## Decision

We will keep the camera in a top-down RTS view at all times. There is no sky in the game; atmosphere comes from the ground (cloud shadows, haze, mist).

## Consequences

No horizon shots, even in presentation; the camera pitch is capped so the frame never reaches the horizon.

## Alternatives considered

A free camera with a painted skybox.

See: `docs/art-bible.md` §1.1–1.2, `docs/proposals/engine-design.md` §5.
