---
status: proposed
date: 2026-10-22
---

# 0049 The figures' shadow map only up close; one simple shadow a soldier beyond

Amends 0047 (the figures cast runtime shadows from a map of their own): the map stays, at close zoom only. The plan:
`docs/plans/active/simple-soldier-shadows.md` (GitHub issue #131); as built: `docs/systems/look.md` ("The armies").

## Context

With 0047's map a marching battalion's shadows flickered at a low rate and the march read laggy: the map is drawn
lazily, at the poses' 12 fps steps, and its texels (9 to 18 cm in the sun's view at the default and the widest zoom,
twice that along the sun on the ground) are a few across a leg or a musket, so a thin part's shadow jumps at each
step. The owner (#131): "it looks good static, but simplify: every soldier looks more or less the same, so simplify
the shape and only use the good shadow like today at close zoom."

Revised 2026-10-23: the first build splatted the shapes into a top-down mask the ground read; the owner's intent was
"one simple identical shadow per soldier, cheap, redrawn much less", and at 40 a side the mask measured fill-bound, so
each soldier now draws his own (below; the mask under the alternatives).

## Decision

- **Up close** (the camera within 60 m of its focus) the figures' shadow map as 0047 built it, unchanged.
- **Beyond** (from 85 m) **no shadow map**: one shadow shape a figure, baked at load from the figure data (its far LOD
  posed through each role's clip, projected along the sun onto the ground at 16 facings, averaged over the clip and
  blurred), drawn by each soldier himself in the main pass: a small grid on the ground from his feet along the sun, on
  his battalion's own instances (it moves with him every frame), lifted toward the camera in depth so the grass does
  not hide it, darkening what is under it to the ground's shade there (the ratio of the ground painted in a full
  shadow to its light, baked top-down once with the other light bakes: the map's darkening on the same ground). Where
  shadows overlap each sample darkens once (its soft edge as the samples it covers, a stencil letting only the first
  shadow at a sample through), so a formation's shadow darkens once. One atlas read a pixel; no render target, no
  redraw, nothing read by the receivers.
- **Between**, a cross-fade of the two by the camera's distance (tunable, `?ushadowswitch`), so nothing pops: the
  receivers take the map's share, the decals theirs, never more than one full shadow together.
- **A texture unit**: the dirt's and the earth's one-channel textures are packed into one (built when the first design
  needed the ground's unit; kept, being free: the ground pixel for pixel as before).
- **The figures' places** move every frame, and their simple shadows with them (`?smoothmove=0`: both at the 12 fps
  steps); their poses stay stepped at 12 fps (the art bible). Measured free; open for the owner (the plan's open questions).
- `?ushadowfar=map` keeps 0047's map at every zoom (the A/B).

## Consequences

- The shadows beyond close zoom move every frame and keep their shape (no texel steps, no 12 fps steps); they are one
  averaged shape a role and facing, not each man's pose (a marching man's legs are one soft wedge, a firing line's
  muskets a faint stroke). At close zoom, where the poses read, the map's own.
- No shadow map is drawn past 85 m: each soldier's shadow is two dozen triangles over a few pixels, one atlas read a
  pixel, nothing to redraw when he stands still; a stencil on the scene's target only while they are on. Measured (the
  plan, 40 a side, the widest zoom): cheaper than the map at the fight's middle (still 10.25 against 10.60 p50, 11.70
  against 12.70 p95) and at the stress point still (12.95 / 14.40 against 13.25 / 18.75); dearer only panning there
  (14.45 against 13.00, before its grid was made coarser).
- The lift darkens the grass and the men's legs within it over the ground in a shadow (a man standing in his front
  rank's shadow takes it on his legs; the map shadows no figure); crops taller than it hide the shadow under them.
- The shape is made once at load (about 85 ms).
- The figures still do not shadow one another's upper bodies, nor the water.

## Alternatives considered

The map redrawn every frame with the men moved every frame (0047's batch A: 2 ms more at the widest, and still texel
steps on thin parts); the map cast by one sun-facing card a man (simpler casters, the same map's texels and box);
contact blobs (no figure-shaped shadow at the low sun the look depends on); **a top-down mask** the ground and the
meadow read, each man's shape splatted into it (built first, with its texel grid fixed in the world and drawn lazily:
at 40 a side it cost 0.3 to 0.8 ms more than the map at the widest zoom, fill-bound, about 24,000 blended quads into a
2048² target each time the men moved; replaced by the decal); decals multiplied into what is there (a formation's
overlapping shadows darkened four or five times over); a darkest-wins depth pass (each shadow drawn nearer by its
darkness, then drawn where its depth matched: ties between equal shadows darkened twice, and its bias in metres shrank
to nothing in the depth buffer at the widest zoom, review round 1; replaced by the stencil); the mask in the trodden
mask's texture read in the vertex stage (the ground's vertices are 1.79 m apart, a soldier's shadow 0.4 m wide); a
hard switch at one zoom (a pop).
