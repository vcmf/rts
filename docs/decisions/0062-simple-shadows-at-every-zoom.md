---
status: proposed
date: 2026-10-24
---

# 0062 The simple shadow at every zoom, softer, lighter and shorter up close

Amends 0047 (the figures cast runtime shadows from a map of their own) and 0049 (the map only up close, one simple
shadow a soldier beyond): the map is no longer drawn by default, at any zoom. The plan:
`docs/plans/active/soft-shadows-all.md`; as built: `docs/systems/look.md` ("The armies").

## Context

At close zoom (15 to 55 m) the soldiers' shadows came from 0047's map, cast by a 56-triangle proxy. The owner
(2026-10-24): "a bit too big and dark and sharp at close... flaky when a unit moves... aim for something a bit
smaller, a bit less dark and more fuzzy, more blur; that kind of shadow is easier and cheaper". In his reference view
(a white-coated line on the road, the shadows toward the camera) the proxy's quads show each musket as a plank as wide
as a leg, and the low sun's long shadows a row of dark bars. Beyond 85 m the simple shadow (0049) was already drawn:
one baked shape a role and a facing, moving with each man every frame, no map. Agreed with the owner: the same simple
shadow at every zoom, its look set per zoom.

## Decision

- **The simple shadow at every zoom by default** (0049's decal, unchanged in how it is drawn: a 1 × 3 grid a man in
  the main pass, one atlas read a facing, alpha to coverage, the stencil darkening each sample once, the ground's
  shade, the lift). No figure shadow map: no target made, no casters drawn, no map reads compiled into the ground or
  the meadow.
- **Its look a zoom, along each shadow** (the owner, after the first images: "darker and more solid near the
  soldier's feet, getting lighter and softer further away, like a real shadow"): from the soles over a contact core the
  shape itself at a contact darkness (a little over the full shadow), then toward the tip softer and lighter, to the
  look's softness and darkness at the tip; fragment arithmetic on the distance along the shadow, no more reads. The
  darkness is coverage, not colour: every shadow darkens what it covers alike, lighter parts covering fewer samples,
  so where shadows overlap the darkest wins whatever the draw order, and the stencil still darkens each sample once.
  The owner chose softness 0.75 with the foot gradient, 2026-10-24, from sheet 7 (the review images, the plan).
  The settings: softness (a share of a softer bake of the shape: the atlas's second channel, blurred wider and
  brought back to the shape's darkest value, so softer is not lighter), darkness (the share of the ground's full
  shadow) and length (along the sun from the soles, the feet kept where they are: the grid's second row lies at the
  soles). Up close softer, lighter and shorter; far (beyond the band) 0049's look as it was. The close look turns into
  the far one over a band of the camera's distance to its focus (45 to 85 m), by a smoothstep, so nothing pops. The
  values live in `src/look/units.ts` (`SHADOW_LOOK`, `SHADOW_LOOK_BAND`) and are tuned live by `?ushsoft`, `?ushdark`,
  `?ushlen` (`<close>[,<far>]`) and `?ushband`.
- **The map stays behind switches** until the owner says to remove it: `?ushadowclose=map` (the map up close and the
  cross-fade, 0049's default) and `?ushadowfar=map` (the map at every zoom, 0049's A/B). Only then is it made.

## Consequences

- One shadow at every zoom: no cross-fade between two kinds, no map redraws (the lazy map's steps were the close
  zoom's flicker), no proxy's planks. Up close the shadow is one averaged shape a role and facing, not each man's pose:
  a marching man's legs one soft wedge, a shouldered musket inside his body's shadow, its bayonet's tip a faint stroke
  (under a tenth of the shape's darkest value before the look's darkness). The pose no longer reads in the shadow up
  close; the figures themselves show it.
- The ground's and the meadow's shaders lose the map's sampler and reads (one texture unit freed on the terrain's
  fragment stage, the meadow's vertex stage's read gone); the 2048² depth target (16 MB) is not allocated.
- The atlas is RG8 (1664 × 608, about 2.7 MB with its mips) and its bake a second blur at load (144 ms against 84,
  SwiftShader).
- At 15 m the shadows' own change from frame to frame while a battalion marches is a third of the map's (the plan).
- The lift (0049) still darkens the grass and the legs of the men standing in another's shadow.

## Alternatives considered

The map softened (a wider filter, a lighter share, a coarser texel: still the proxy's planks, its redraw steps and its
cost); the map cast by thinner proxies (no planks, the same steps); softness by the atlas's higher mips (the cell's
border caps them at the third, 0.4 m texels, and a coarse mip's bilinear steps read as blocks up close); the soft bake
left at its blurred mass (the shape's core spread thin: a lighter shadow, which darkness already sets); a hard switch
of the look at one zoom (a pop).
