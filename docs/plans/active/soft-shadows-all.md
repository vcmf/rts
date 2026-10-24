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

**The defaults up close** (`SHADOW_LOOK.close`; before the foot gradient below, which made darkness the tip's, 0.55):
softness 0.75 (the soft bake's sigma `SOFT_BLUR`, 0.12 m), darkness 0.7, length 0.7; far 0, 1, 1 (decision 0049's look). Chosen by eye from sweeps at 15 and 30 m on the owner's view (a
white-coated line on the road, the shadows toward the camera; softness 0.5 and 1, darkness 0.6, 0.7 and 0.8, length
0.65 and 0.8): at darkness 0.6 the shadows nearly vanish at 30 m against the road and the white coats (the formation
no longer reads grounded), at 0.8 they read as heavy as before; 0.7 is "a bit less dark". Length 0.65 tucks most of a
man's shadow under the rank behind him from the usual pitch; 0.7 keeps it a stroke past his feet, "a bit smaller".
Softness 0.75 blurs each man's shadow into the next along a rank ("more fuzzy, more blur"); a variant sheet at 0.4 and 0
(each man faintly separate) is with the review images for the owner to choose (`?ushsoft=0.4`). The first try, the
soft bake left at its blurred mass (sigma 0.15 m, darkness 0.55, length 0.65), was nearly invisible: the shape is
0.3 m wide, a wide blur spread its core thin; hence the bake brought back to the shape's darkest value, darkness
setting the value alone.

**The musket**: in the atlas (the far LOD's poses averaged), a shouldered musket lies within the body's shadow; what
shows past the head is the bayonet's tip, under 10 % of the shape's darkest value (the profile along the shadow of
the halted and marching cells: 16 to 39 of 255 from 3.6 to 4.6 m, against 220 to 255 over the torso), so about 7 % of a
full shadow at darkness 0.7, and shortened to 3.2 m. No plank: the proxy's planks were its quads' width, not the
musket's.

**Feet**: the shadow starts at the soles at 15 m after shortening (the review crops); the grid's second row lies at
them, so the shortening leaves the feet's footprint as it was.

**Flicker** (SwiftShader, `?frozen&dof=0`, 20 a side, the white column marching by the road at 1.0 rad of yaw, 13
frames 1/60 s apart; on the ground that does not change without shadows (no figure there) and that a shadow darkens
by more than 4 of 255 in some frame, the mean change a frame of the shadows' own luma, each frame's less the same
frame with `?unitshadow=0`, 0 to 255; main is 5f94e87's build with its map up close and smooth places, the map
redrawn every frame its casters move):

| | 15 m | 30 m |
|---|---|---|
| main (map) | 5.9 to 7.3 a frame, mean 6.8 | 1.9 to 2.6, mean 2.3 |
| this branch (decal) | 2.2 to 2.3, mean 2.3 | 0.6 to 1.0, mean 0.7 |

A third of the map's change a frame, even from frame to frame (no jump: the largest frame 2 % over the mean at 15 m),
the shadows gliding with the men; the map's changes are its texels re-rasterised under each move.

**Samplers** (the live programs, `getActiveUniform` on each material's effect, the fragment stage's samplers its
source reads): the terrain 15 → 14 (and the roads' terrain), the meadow 10 → 9 (fragment) and 5 → 4 (vertex), the
water 15, the decal 2; with `?ushadowclose=map` as main's. (`window.__look.mats.samplers` keeps the maximum over the
session's compiles.)

**Cost at load**: the shape's two bakes take 144 ms (SwiftShader, two loads; one bake 84 ms on main); the atlas is
1664 × 608 RG8, about 2.7 MB with its mips.

**Golden** (`tools/golden.mjs`, no armies, a build of main f7bd633 against this branch): every camera 0.000 %: no
armies, no change (the receivers compile as before without the map's define).

**Bench**: the script `bench.sh` in the coordinator's scratchpad (main against this branch, 20 and 40 a side, the
fight's middle and the stress point, still and panning, with `?benchclosest=1`, three rounds): not run yet.

Review images: the main checkout's `output/armies-review/15-soft-shadows/` (not committed): 1 to 4 main against this
branch at 15, 30, 55, 125 and 260 m (a line halted on the road, a column marching by the road, a column marching on
grass, a reserve halted on grass), 5 the owner's view up close, 6 the softness variants at 15 m.

**The foot gradient** (the owner on sheet 6: darker and solid at the feet, lighter and softer away, a real shadow's
contact): along each shadow from the soles (`vAlong`, m, the vertex shader's distance along it after the length), the
fragment takes `g`, a smoothstep from the contact's core (0.4 m) to the tip (a man's 1.8 m over the sun's tangent,
times the length: 2.5 m up close); the shape is the sharp bake at the soles and `soft × g` of the soft one toward the
tip, and the darkness runs from the soles' (`foot`, 1.05 of the full shadow) to the tip's (`dark`, 0.55). Up close only:
far `foot` = `dark` = 1 and `soft` = 0 (at 125 m every pixel as the previous commit's but the fps readout; that
commit's strip differed from main's far off, fixed in review round 1 below). No more texture reads or vertices: one varying and a few ALU ops. `?ushfoot=<dark>,<core
m>[,<far dark>,<far core m>]`; `?ushdark` is now the tip's. The overlaps still darken each sample once; which shadow
sets a sample's value is the draw order's (a man's tip over the feet of the man behind him: one or the other, steady
from frame to frame). Sheet 7 in the review folder: main, the previous default and the gradient at softness 0.4 and 0.75,
the owner's road view at 15, 30 and 55 m. The owner chose 0.75 with the foot gradient, 2026-10-24, from sheet 7.

**Review round 1** (`/code-review high`): severe, the gradient made overlaps depend on the draw order (the stencil let
the first shadow at a sample through, and with the darkness a colour, a man's light tip drawn first took the next
man's dark contact; across battalions Babylon sorts the decals by distance, so a pan flipped it). Fixed by making the
darkness coverage: every shadow darkens what it covers alike (the look's darkest), the lighter parts covering fewer
samples (alpha to coverage; with `?msaa=1|2` a screen-space dither), so the darkest wins at a sample whatever the
order, in the same single pass (no extra pass, reads or vertices: a divide and a max more a pixel). Checked by two
reserve battalions pushed 7 m into each other and their decals' order forced each way (sheet 8): pixels over 6 of 255
apart between the two orders, before → after, 6,024 → 0 at 15 m, 2,993 → 0 at 30 m, with `?msaa=1` 6,954 → 0 and
7,916 → 0 (the largest left: 4 and 2 of 255); a pan of six frames across them at 30 m, each frame
against both forced orders: before, each frame differs from one order by 2,207 to 2,976 pixels (what a flip of the
sort pops), after, from both by none. The chosen look kept (sheet 9). Moderate: the non-coverage path's fringe stenciled whole pixels at a fraction of
their darkening (now in or out by the dither: no speckled holes); the soft bake's padding moved R's texels by a part of
one (now whole blocks of 8; with the strip far off decision 0049's the default at 125 m was then 6 pixels from main's,
by at most 3, but review round 2 kept one strip at every zoom, below); the sun's corner rays cast only for the map or the trodden mask; the
gradient's tip followed the far figures' growth (now on the shape's own size); the looks, the gradient's uniform, the
strip and the switches pure and tested (`src/look/shadow-look.ts`, `test/shadow-look.test.ts`), the switches' empty
fields refused.

**Review round 2** (`/code-review high` on d62d830). Two possible issues on the real GPU, checked on Metal (the owner's
road view and the forced pair, a production build, sheet 10): (a) the gradient as coverage could band (4 samples, 5
levels): no contour bands at 15 or 30 m, the histogram of the shadow's darkening only a little lumpier than the colour
gradient's (Metal's alpha to coverage and the resolve smooth it); (b) non-nested coverage masks would make overlaps
darker than either shadow: of the pixels both shadows darken, at 15 m 0.08 % (38 of 47,753) are more than 10 % darker
than the darker shadow alone (the colour gradient: 8, and 3.4 % lighter bites), the mean +0.003 of the light, at 30 m
32 of 26,296. So the coverage approach stays. Fixed: `?msaa` is set before the armies are built (it was set after the
decal's material, so it never took); 2 samples keep alpha to coverage, 1 falls back to a smooth darkening (order-
dependent there, documented) instead of a screen-space dither that would crawl; the tip's darkness divides by at least
1e-4; the strip set once in `useDecals` and the look only when it changes; one strip (the full box, its second row at
the soles) at every zoom, so nothing jumps where the looks meet, at the cost of decision 0049's far shadow on other rows
than main's (at 125 m 20,430 pixels differ, 2,591 by more than 6 of 255, up to 62: speckles along the shadows where
the lift and the ground's height fall at other vertices; at 260 m 7,798, 1,622 and 32); a JS mirror of the fragment's
rule (`decalFragment`) and a test that two shadows resolve the same in either order, with the colour rule failing it;
the soft bake's tests in one place. The owner's view on Metal, main against the final build, and `?msaa=2` and `=1`:
sheet 11.

## Open questions

- The far look stays decision 0049's (full darkness, its length, its own blur) unless the owner changes it after the
  crops (`?ushsoft=<close>,<far>` and the others tune it live).
- The map's code (`?ushadowclose=map`, `?ushadowfar=map`, the proxy, the receivers' reads) stays until the owner says
  to remove it.
