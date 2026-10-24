---
status: active
last_reviewed: 2026-10-24
---

# Plan: the simple shadow at every zoom, softer, lighter and shorter up close

Asked by the owner (2026-10-24), looking at the close zoom (15 to 55 m): the soldiers' shadows there (the figures'
shadow map, decision 0047, kept up close by 0049) are "a bit too big and dark and sharp at close... flaky when a unit
moves... aim for something a bit smaller, a bit less dark and more fuzzy, more blur; that kind of shadow is easier and
cheaper". A reference view (a white-coated line on the road at close zoom, owner-gun-shadows.png in the main checkout's review folder
15-soft-shadows, not committed): the map's shadows, cast by the 56-triangle proxy, show each musket as a plank as
wide as a leg, and the long low-sun shadows make a row of dark bars ("the gun looks too big"). Agreed with the owner:
drop the map up close and draw the simple shadow (decision 0049) at every zoom, with its look set per zoom. The
decision this plan makes: 0062.

## Scope

In:

- **The simple shadows at every zoom by default**: no figure shadow map, no proxy casters drawn, no map reads in the
  ground's or the meadow's shaders, no map target made.
- **The map kept behind switches** for the A/B until the owner says to remove it: `?ushadowclose=map` (the map up
  close and the cross-fade over 60 to 85 m, main's default before this plan), `?ushadowfar=map` (the map at every zoom,
  as before). Without either, the map's target, casters, uniforms and shader reads cost nothing (none is made).
- **Three look settings a zoom**, the close one turned into the far one by the camera's distance to its focus over a
  band (45 to 85 m by default, `?ushband=<r0>,<r1>`), so nothing pops: **softness** (`?ushsoft`, the share of a
  softer bake of the shape), **darkness** (`?ushdark`, the share of the ground's full shadow), **length** (`?ushlen`,
  the length along the sun from the soles). Each `<close>[,<far>]`; far keeps decision 0049's look unless given.
- The owner's reference view in the contact sheets; the musket's part in the shape at close zoom checked.

Out: per-pose shapes (still one averaged shape a role and a facing), the figures shadowing one another or the water,
removing the map's code (later, when the owner says).

## Approach

- **Softness** (`shadowShape`, `src/look/units-data.ts`): the shape's atlas gets a second channel, the same
  projection blurred wider (`soft`, a sigma in metres) and brought back to the shape's own darkest value in its cell (a
  softer edge, not a lighter shadow: darkness is its own setting). The fragment reads both channels in its one read a
  facing (RG8; no more reads) and mixes them by the softness. A higher mip of the one channel was the other way: the
  cell's 8-texel border caps the mips at the third (0.4 m texels), and bilinear steps of a coarse mip read as blocks up
  close.
- **Length** (`unitdecal.vert`): the grid's rows are placed so the second lies at the soles (the first at the cell's
  start behind them, the others spread to its end), so each triangle lies on one side of the feet; past the soles
  the shadow is scaled along the sun, the atlas's coordinates unchanged: the shape shortened, the feet where they were.
- **Darkness**: the decal's share of the ground's shade (`uUnitFar`, already its cross-fade share) times the look's.
- **The look a frame** (`Units.frame`, `src/look/units.ts`): `lookNow` from `look.close` and `look.far` by a
  smoothstep of the camera's distance over `lookBand`; with `?ushadowclose=map` the far look at every zoom (main's).
- **The map made lazily** (`useMap`): its render target, its depth texture's binding and the receivers' uniforms only
  when a switch asks for the map; `setShadows` defines `UNIT_SHADOWS` on the receivers (and `UNIT_SHADOWS_VS` on the
  meadow) only then. The proxy's mesh and its posed texture are still made at load (never drawn, never uploaded
  without the map).

## Acceptance

- Contact sheets main against this branch at 15, 30, 55, 125 and 260 m: a battalion on grass and on the road, marching
  and halted, with the owner's view (a line on the road, shouldered arms, the shadows toward the camera). Far (125,
  260 m) as main's (the far look is 0049's).
- The feet's contact after shortening: the shadow starts at the soles (crops at 15 m).
- No thick musket in the close shape (crops at 15 m; the atlas's cells checked).
- Flicker: a marching battalion at 15 and 30 m, 12 frames 1/60 s apart: the mean change of the shadows' own luma a
  frame (each frame's luma less the same frame's with `?unitshadow=0`), main's map against the decal; no jump.
- Samplers: the terrain's and the meadow's fragment stages one fewer with no map than main's
  (`window.__look.mats.samplers`), all ≤ 16.
- `npm test`, `npm run format:check`, `node tools/check-docs.mjs`, `npx vite build`; `tools/golden.mjs` against a build of
  main with no armies equal (no armies, no figure shadows: the receivers compile as before).
- A Metal bench script, main against this branch (20 and 40 a side, the fight's middle and the stress point, still and
  panning, the closest zoom too), three rounds: written, run by the coordinator.

## Measured

(Filled in as built: the chosen defaults and why, the flicker numbers, the samplers, the bench.)

## Open questions

- The far look stays decision 0049's (full darkness, its length, its own blur) unless the owner changes it after the
  crops (`?ushsoft=<close>,<far>` and the others tune it live).
- The map's code (`?ushadowclose=map`, `?ushadowfar=map`, the proxy, the receivers' reads) stays until the owner says
  to remove it.
