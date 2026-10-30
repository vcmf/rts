---
status: accepted
date: 2026-10-30
---

# 0092 Static light is never computed per frame: coarse for the whole map, fine around the camera

## Context

AGENTS.md held "static light is baked once per map; only moving things get runtime lighting". The look page lit one
800 m tile, baked once at load. Track G's G3 (`docs/plans/active/g3-austerlitz-in-3d.md`) draws the whole of a map in
3D: at the tile's light texel (0.52 m, decision 0082) a 3 km map's light map alone would be about 5,800² texels, so the
fine light can only be held near the camera, baked as the detail moves (G3c). G3a
(`docs/plans/active/g3a-the-whole-map-far.md`) lights the rest of the map with G2's coarse light (decision 0090's
`bakeLight`, the map's soft sun shadow and open sky at 2 m, under the same sun). The owner accepted the wording below
on PR #290 (2026-10-30).

## Decision

The invariant becomes: **static light is never computed per frame: it is baked once per map and sun, coarse for the
whole map, fine lazily around the camera, deterministically; only moving things get per-frame lighting.**

- The coarse light: the map's soft sun shadow and open sky at the map's 2 m nodes, at build time
  (`tools/build-look-data.ts`, in the window's look data), drawn off the tile by the far ring.
- The fine light: the tile's bakes (the light map, the occlusion, the bounce, the buildings' light), baked at load
  today; per tile as the camera moves from G3c, a bake a frame at most, the same result whichever way a tile is
  reached.

## Consequences

- A bake that runs while the camera moves is allowed, but never a light computed every frame for still things.
- Off the tile the ground takes the coarse light alone: no tree shadows, no valley mist, no contact under trees until
  G3c's bakes reach it.
- Decisions that cite "baked once per map" (0047's runtime figure shadows) read the new wording; their meaning holds.
