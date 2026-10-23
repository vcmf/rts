---
status: proposed
date: 2026-10-21
---

# 0047 The figures cast runtime shadows from a map of their own

(First written on the crowd renderer's branch, `rts-units`, as its decision 0022; renumbered here, where the
renderer lands on main: `docs/plans/active/armies-demo.md`. Revised 2026-10-22 with what was built and measured.)

## Context

`docs/proposals/engine-design.md` §7 planned unit shadows as instanced contact blobs per figure, optionally one
projected shadow per formation, and kept units out of the static shadow map. The owner asked on 2026-10-12 for
real shadows ("without shadows it simply looks bad"). The references (`design/refs/north-star-painted-v1.png`)
show long, figure-shaped shadows in the low sun, at the trees' angle and colour, merging under a formation.

## Decision

We will draw the figures into a shadow map of their own, from the sun, and the terrain and the meadow will read it as
part of the shadow term their painter already uses, so a figure's shadow is painted like a tree's. The world's
shadows stay baked once per map; the figures' are the only runtime shadow (the invariant "only moving things get
runtime lighting" holds). As built (`src/look/units.ts`, `docs/systems/look.md`, "The armies"):

- **The map**: 2048², depth only (24 bits) with a comparison sampler; the sun's orthographic box fitted to the ground
  in view (its own range of heights), centred on what it holds and snapped to its texels; its near and far fitted
  along the sun.
- **Drawn only when it would change**: the poses step at 12 fps, so the map is drawn again only at a step, when a
  battalion's men or the casters change, or when the box moves; the box is held while the view stays inside a slack
  of 10 % of the view's half-size (6 m at least), so a pan does not draw it every frame; an empty map is drawn once.
- **The casters**: a shadow-only figure, 56 triangles (two crossed quads along each part a bone carries, built at
  load from the far LOD and posed from the baked animation), from the battalions whose shadow can reach the view
  (their bounds stretched away from the sun by the longest shadow).
- **The receivers**: the ground by two hardware comparisons a texel either side of the point, turned by the paint
  grain (a brush edge, not texel steps); the meadow once a blade, at its root.
- `?unitshadow=0` turns them off; the A/B switches are listed in the plan.

## Consequences

- Figures look grounded and their shadows merge into one cool mass under a formation, like the references (at a
  27° sun a man's shadow is 3.6 m long, his ranks 0.85 m apart).
- Cost (the coordinator's, Metal, 1080p, 20 a side, 2026-10-22; wide / default / close ms): the armies 8.98 / 10.68 /
  9.85 against main's 6.62 / 9.57 / 8.92, p95 at the widest 11.57 against 7.97; without the figures' shadows about
  0.3 to 0.65 ms less (batch C's run: 8.67 / 10.00 / 9.38 against 9.32 / 11.03 / 9.90). Before the shadow fix (the far
  LOD casting, the box refit by a pan) a draw of the map cost 3.4 ms at the widest and the p95 there was 14.12.
- The terrain's fragment stage is at 16 samplers with the map (the guard's limit, `src/look/materials.ts`): the next
  sampler the ground needs must free one first (the trodden ground's mask is read in the vertex stage for that).
- The figures do not shadow one another, nor the water (a later pass if needed); the shadow-only figure leaves out
  hands and feet (under a texel of the map at the default zoom).

## Alternatives considered

Contact blobs per figure (cheapest, but no figure-shaped shadow at the low sun the look depends on); one
projected shadow per formation (no individual shadows, no animation); the figures in the static map (it is baked
once and cannot follow them); the far LOD as the caster (243 triangles; with batch B's held box, measured together: 0.32 ms
more at the widest, p95 14.12 against 11.57); a map drawn every frame (2.05 ms more at the widest, batch A).
