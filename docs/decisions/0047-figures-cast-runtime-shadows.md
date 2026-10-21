---
status: proposed
date: 2026-10-21
---

# 0047 The figures cast runtime shadows from a map of their own

(First written on the crowd renderer's branch, `rts-units`, as its decision 0022; renumbered here, where the
renderer lands on main: `docs/plans/active/armies-demo.md`.)

## Context

`docs/proposals/engine-design.md` §7 planned unit shadows as instanced contact blobs per figure, optionally one
projected shadow per formation, and kept units out of the static shadow map. The owner asked on 2026-10-12 for
real shadows ("without shadows it simply looks bad"). The references (`design/refs/north-star-painted-v1.png`)
show long, figure-shaped shadows in the low sun, at the trees' angle and colour, merging under a formation.

## Decision

We will draw the figures into a shadow map of their own every frame (2048², orthographic from the sun, fitted to
the ground in view and snapped to its texels), and the terrain and the meadow will read it as part of the shadow
term their painter already uses (`UNIT_SHADOWS`, `unitShadowAt` in `src/look/shaders/painter.glsl`), so a figure's
shadow is painted exactly like a tree's. The world's shadows stay baked once per map; the figures' are the only
runtime shadow (the invariant "only moving things get runtime lighting" holds). `?unitshadow=0` turns them off for
the bench's A/B.

## Consequences

- Figures look grounded and their shadows merge into one cool mass under a formation, like the references.
- Cost on the crowd renderer's branch (dev Mac, its L1b bench): at decision 0018's scale (16,000 figures) about +1 to
  +1.7 ms at the closest and default zooms and +2.1 to +3.6 ms at the widest, where the shadow pass doubles the
  figures' triangles. Not yet measured on the current map (the armies demo's bench).
- The terrain's fragment stage reaches 16 samplers with the map (the guard's limit, `src/look/materials.ts`): the next
  sampler the ground needs must free one first.
- The figures do not shadow one another, nor the water (a later pass if needed).

## Alternatives considered

Contact blobs per figure (cheapest, but no figure-shaped shadow at the low sun the look depends on); one
projected shadow per formation (no individual shadows, no animation); the figures in the static map (it is baked
once and cannot follow them).
