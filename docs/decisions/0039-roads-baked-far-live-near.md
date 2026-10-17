---
status: accepted
date: 2026-10-17
---

# 0039 Roads: baked far out, painted live from mid zoom in

## Context

The roads (`docs/plans/done/roads.md`) are painted in the terrain's shader: each ground pixel near a road finds its
nearest road segment and lays wheel tracks, ragged edges and the grit in its frame. The bench (Metal, this Mac, main and
the branch interleaved) put that at +2.1 ms a frame at the widest zoom, +1.0 at the default, +0.1 close; with the code
present but never run, still +0.7 at the widest: the shader's size alone slowed every ground pixel. The widest zoom is
where the 120 fps soft target is hardest (decision 0036). The owner (2026-10-17): "for far road keep the texture baked
one, only from mid zoom or close zoom".

## Decision

- **The macro bake paints the roads** into the ground's colour at its 0.5 m texel, as they look far out: their wheel
  tracks a light dusting (a track is about a pixel wide there and would shimmer), no grit. Not the far ring's 4 m bake.
- **The tile's ground has two materials**, with the live roads and without; beyond 170 m of camera radius (±4 m) it
  takes the one without, and the baked roads show. Over the 50 m before the switch the live roads fade to the baked
  look (the tracks to their dusting, the grit out), so at the swap only the edge's sharpness changes (the bake's
  0.5 m texels). Both are compiled before the first
  frame, and the swap waits until the material it goes to is ready (one not ready is not drawn).
- **The water's land side** (the shore band) paints the roads live at every zoom, faded as the tile's: only the ford
  crosses it, a few pixels.
- **The shader arm** (no bake) keeps the live roads at every zoom.

## Consequences

- Good: the widest zoom costs about what main does; the near roads keep their tracks and grit (measured:
  `docs/plans/done/roads.md`, Performance).
- Bad: the default view (125 m) still pays the live roads; under 170 m the live roads paint over
  the baked ones, whose 0.5 m texels soften the ragged edge a little.

## Alternatives considered

- One material, the roads' define switched by zoom: Babylon draws nothing while a material's new shader compiles, and
  a define change recompiles; two materials keep both compiled.
- The switch below the default view (about 110 m): the default view at main's cost, its tracks only nearer. The
  owner kept 170 m (2026-10-17).
