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

## Decision

- **Up close** (the camera within 60 m of its focus) the figures' shadow map as 0047 built it, unchanged.
- **Beyond** (from 85 m) **no shadow map**: one shadow shape a figure, baked at load from the figure data (its far LOD
  posed through each role's clip, projected along the sun onto the ground at 16 facings, averaged over the clip and
  blurred), laid as a quad a man from his feet along the sun into a top-down world mask, drawn every frame with each
  man's place moved every frame (his step's place and his move to the next). The ground reads the mask once a pixel
  and the meadow once a blade at its root, as both read the map; a decal on the ground would be hidden under the grass.
- **Between**, a cross-fade of the two by the camera's distance (tunable, `?ushadowswitch`), so nothing pops; each is
  drawn only while it shows.
- **A texture unit** for it: the ground's fragment stage was full (16, 0047's consequence); the dirt's and the earth's
  one-channel textures are packed into one, the ground pixel for pixel as before.
- **The figures' places** move every frame as their simple shadows' do (`?smoothmove=0`: at the 12 fps steps); their
  poses stay stepped at 12 fps (the art bible). Measured free; open for the owner (the plan's open questions).
- `?ushadowfar=map` keeps 0047's map at every zoom (the A/B).

## Consequences

- The shadows beyond close zoom move every frame and keep their shape (no texel steps, no 12 fps steps); they are one
  averaged shape a role and facing, not each man's pose (a marching man's legs are one soft wedge, a firing line's
  muskets a faint stroke). At close zoom, where the poses read, the map's own.
- No shadow map is drawn past 85 m; the mask is drawn every frame there instead (a quad a man into a 2048² R8 target).
  Measured (the plan): the same frame time as the map, within noise, at every zoom, still and panning.
- The shape is made once at load (about 80 ms); the mask's texel is its box over 2,048 (the box round the battalions
  in view).
- The figures still do not shadow one another, nor the water.
- The ground's fragment stage is at 16 textures again with both readers: the next texture it needs must free one.

## Alternatives considered

The map redrawn every frame with the men moved every frame (0047's batch A: 2 ms more at the widest, and still texel
steps on thin parts); the map cast by one sun-facing card a man (simpler casters, the same map's texels and box);
contact blobs (no figure-shaped shadow at the low sun the look depends on); decal quads on the ground (hidden under the
grass, and the ground's painted shadow colour not theirs); the mask in the trodden mask's texture read in the vertex
stage (the ground's vertices are 1.79 m apart, a soldier's shadow 0.4 m wide); a hard switch at one zoom (a pop).
