---
status: active
last_reviewed: 2026-10-23
---

# Plan: the map only up close, a simple shadow per soldier beyond (#131)

Asked by the owner (GitHub issue #131): while a battalion marches its soldiers' shadows flicker at a low rate and the
march reads laggy. "It looks good static, but simplify: every soldier looks more or less the same, so simplify the
shape and only use the good shadow like today at close zoom." The shadows as built: decision 0047,
`docs/systems/look.md` ("The armies"), `docs/plans/active/armies-demo.md`. The decision this plan makes: 0049.

## Scope

In:

- **Close zoom keeps today's map** (the lazy depth map, its held box, the proxy casters, the ground's and the meadow's
  reads), unchanged.
- **Default and wide zoom: a simple shadow per soldier**, no shadow map: one shadow shape, baked once at load from the
  figure data (the figure's silhouette projected on the ground along the sun, `SUN`, soft-edged), drawn by each soldier
  on the ground in the main pass, moving with him every frame. (First built as a top-down mask the receivers read; the
  rework below replaced it: the owner's intent was one identical shadow a soldier, cheap, redrawn much less.)
- **A cross-fade** between the two over a band of the camera's distance to its focus (tunable), no pop.
- **Smooth positions** (`?smoothmove=0|1`): the poses stay stepped at 12 fps (the art bible), the men's places move
  every frame. Measured; the default stays what it was unless the cost is negligible (then an open question for the owner).
- Switches: `?ushadowfar=map` keeps today's map at all zooms (the A/B); `?ushadowfar=simple` (the default);
  `?ushadowswitch=<r0>,<r1>` the band (m); the existing switches keep working.

Out: the figures shadowing each other or the water; per-man poses in the simple shadow (it is one shape a role and a
facing, by design); the sim's hookup.

## Approach

- **The shape** (`shadowShape`, `src/look/units-data.ts`): the far LOD posed at each step of a role's clip, turned to
  each of 16 facings, its triangles projected along the sun onto the ground and rasterised in the shadow's frame (along
  the shadow, across it), averaged over the clip's steps (a marching man's legs become one soft wedge) and blurred: an
  atlas of 16 facings × the four roles, R8. No unit is named: the roles are the bake's (decision 0015).
- **The decal** (the rework; `src/look/units.ts`, `shaders/unitdecal.*`): two more meshes a battalion on its own
  instance buffers (so they move with the men every frame), a 2 × 6 grid a man lying from his feet along the sun's
  ground direction, each vertex set on the ground (the meadow map's height) and drawn toward the camera along its view
  ray by a lift (0.6 m by default, `?udecallift`: over the grass and the men's legs in depth, no shift on screen). The
  shape's facing and role pick its atlas cells (two facings blended, read through the atlas's mips). Drawn in the main
  pass after everything else, twice: a depth pass, each pixel nearer by its darkness (up to 15 cm), so the darkest
  shadow at a pixel wins; then a colour pass where its depth is that one's, darkening what is there by the ratio of the
  ground's painted shadow to its painted light at that point (its macro colour painted both ways, through the air),
  blended dst · (1 − src) with the alpha (the lens codes) kept. Overlapping shadows in a formation darken once, as the
  map's do. No render target, no receiver reads: the terrain and the meadow keep the map's read alone, its share 1 − f.
- **Every frame**: each man's next step's place is written with his place (`aNext`), and his shadow moves by the
  share of the step gone (`uStepFrac`, from the CPU's clock in double precision), and so do the figures, their flags
  and the map's casters (`?smoothmove=1`, the default after the measurement; the map is then redrawn while the clock
  moves and men in it move). `?smoothmove=0`: figures and simple shadows move together at the steps.
- **The cross-fade**: the map's receivers take 1 − f of it, the decals f of their darkening; at the band's middle the
  two together stay under one full shadow (the decal's ratio is taken against the light the ground had before it).
- **The ground's sampler** (built for the mask): the terrain's fragment stage was at 16 textures with the map
  (decision 0047) and the mask's cross-fade read both, so the dirt's and the earth's greyscale textures (1024², both
  one channel) were packed into one texture's R and G at load (`src/look/macro.ts`). The decal reads nothing there, so
  the unit is spare now; the packing stays because it is free (the ground pixel for pixel equal to main's, golden) and
  leaves the ground a unit of headroom.

## Acceptance

- Close zoom (r ≤ the band's start): pixels as today's (the map alone; the band's end beyond the LOD switch).
- Default and wide: one shadow a man, moving every frame (a sequence of frames 1/60 s apart shows it move each frame
  where the map's steps); no shadow map drawn (`smDraws` does not grow there).
- No pop across the band (frames through a zoom).
- Terrain and water fragment stages ≤ 16 textures (`window.__look.mats.samplers`); the ground with no armies
  unchanged by the packing (a frozen frame, SwiftShader, pixel equal).
- Cost on Metal, 1080p, 20 a side, `?benchat=162.5,-2.5`, still and panning, three interleaved rounds: the simple arm no
  slower than `?ushadowfar=map` at default and wide (p50 and p95), close within noise of it.
- `npm test`, `node tools/check-docs.mjs`; a clean SwiftShader load with the defaults and each new switch.

## Measured: the first build, the mask (replaced by the decal)

**Cost** (this machine's Metal, 1080p, 20 a side, `?benchat=162.5,-2.5`, a production build; three interleaved
rounds, the medians of the yaws' and rounds' p50 / p95 ms; `main` is the build before this work, `map` this build with
`?ushadowfar=map`, `simple` the defaults with `?smoothmove=0`, `smooth` the defaults):

| | wide | default | close |
|---|---|---|---|
| still, main | 6.05 / 7.50 | 8.80 / 10.05 | 8.50 / 9.90 |
| still, map | 9.15 / 10.30 | 10.25 / 11.50 | 9.80 / 11.10 |
| still, simple | 8.80 / 10.40 | 10.10 / 11.40 | 9.80 / 11.05 |
| still, smooth | 8.85 / 10.50 | 10.10 / 11.40 | 9.80 / 11.05 |
| pan, main | 6.05 / 7.45 | 8.75 / 10.10 | 8.50 / 9.80 |
| pan, map | 8.80 / 10.20 | 10.45 / 11.60 | 9.80 / 10.35 |
| pan, simple | 9.00 / 9.90 | 10.20 / 11.60 | 9.80 / 10.40 |
| pan, smooth | 9.00 / 10.00 | 10.30 / 11.50 | 9.70 / 10.40 |

The simple shadows cost what the map costs, within the runs' noise (about ±0.2 ms): still −0.35 / +0.1 wide, −0.15 /
−0.1 default; panning +0.2 / −0.3 wide, −0.25 / 0 default; close the same (the map alone there). Moving the figures
every frame (`smooth` against `simple`) costs at most 0.1 ms anywhere. The shape takes about 85 ms at load
(SwiftShader's page, `__units.shapeMs`).

**The flicker** (SwiftShader, `?frozen`, a marching battalion at the default zoom, 12 frames 1/60 s apart, the mean
absolute change of a frame's luma from the one before on the shadow's fringe beside the battalion, 0 to 255): the map
0, 0, 0, 0, **6.5**, 0, 0, 0, 0, **5.0**, 0 (still for four frames, then a jump at each 12 fps step); the simple shadows
0.3 to 0.4 every frame, 0.9 to 1.0 at a step (the figures' own step beside it); with `?smoothmove=1` 0.5 to 0.7 every
frame, no jump. Over the battalion itself (figures and shadows) the stepped figures jump 12 to 14 at each step with
either shadow; moved every frame they change 4 to 5.6 every frame and never jump.

**Close zoom**: the defaults and `?ushadowfar=map` pixel for pixel equal at the closest zoom (SwiftShader, frozen); the
ground with no armies pixel for pixel equal before and after the textures' packing. **Textures**: the terrain's fragment
stage 16 (15 with `?ushadowfar=map`, 14 without shadows), the water's 15, the meadow's 11.

**The mask's box** at the bench's views: 256 m at the default zoom (12.5 cm texels), 512 m at the widest (25 cm)
(round 0: 168 and 376 m, sized to what it held; 56 to 96 m in the band).

**The mask's grid** (review round 1: the box had been sized in 8 m steps, so its texel changed as the view did). A
frozen clock, the mask read back and sampled at fixed world points over a battalion (160² points 0.2 m apart), the
change from the first frame as a share of the shadow's mass: before, a pan at the default zoom (2.3 m a frame) 0, 0, 3.2,
3.2, 3.2, 3.2 % and a zoom (1.7 m a frame) 0, 3.2, 3.2, 3.2, 3.2, 3.3 % (each time its texel changed: 10.2, 9.8,
10.5, 10.9 cm); now 0 % through both, at the default zoom (12.5 cm texels) and the widest (25 cm). The marching
sequences above measure the same after the fix (the fringe 0.5 to 0.7 every frame, no jump). The ground with no armies:
`tools/golden.mjs` against main's build, every camera 0.000 %.

**The packing's main-thread time** (the dirt and the earth into one texture: drawing, reading back, packing, the
upload; the performance entry `groundSurfacesPack`; SwiftShader's headless page, three loads): 10.9, 9.7 and 16.1 ms
(the images' fetch and decode are off the main thread).

**The final bench** (code final after review round 2; Metal, production builds, 20 a side, three interleaved rounds,
all 36 runs exit 0; medians of p50 / p95, ms; "map" is `?ushadowfar=map&smoothmove=0`, today's behaviour; "simple" is
`?smoothmove=0`; "defaults" is simple shadows with smooth movement):

| Run | Wide | Default | Close |
|---|---|---|---|
| main, still (fight's middle) | 6.05 / 7.50 | 8.80 / 10.05 | 8.50 / 9.80 |
| map, still | 9.25 / 10.65 | 10.15 / 11.50 | 9.80 / 11.00 |
| simple, still | 9.25 / 10.50 | 10.05 / 11.40 | 9.80 / 11.05 |
| defaults, still | 9.70 / 10.40 | 10.15 / 11.45 | 9.80 / 11.10 |
| map, pan | 8.85 / 10.15 | 10.55 / 11.60 | 9.70 / 10.30 |
| simple, pan | 9.00 / 10.20 | 10.30 / 11.65 | 9.75 / 10.25 |
| defaults, pan | 9.00 / 10.15 | 10.35 / 11.60 | 9.70 / 10.40 |
| map, still, stress point (`62.5,-102.5`) | 10.95 / 12.30 | 9.80 / 11.20 | 8.70 / 10.00 |
| defaults, still, stress point | 10.05 / 11.45 | 9.85 / 11.25 | 8.70 / 10.00 |
| map, pan, stress point | 11.00 / 11.85 | 9.90 / 11.20 | 8.85 / 10.10 |
| defaults, pan, stress point | 10.00 / 10.90 | 9.90 / 11.00 | 9.30 / 10.20 |

At the fight's middle the simple shadow costs the same as the map (within ±0.25 ms), and default and close are
unchanged. At the stress point (more battalions in view) it saves **0.9 to 1.0 ms p50 at wide** and 0.85 to 0.95 ms
p95. Smooth movement measured +0.45 ms p50 at wide, still, at the fight's middle (9.70 against simple's 9.25) and
nothing panning or at the stress point: within this round's spread it is small, but not the ≤ 0.1 ms of the first
bench; it stays on (the owner's call, below).

**Why it was replaced** (the coordinator's bench, 40 a side, the 32k branch merged with this one): the mask cost +0.3
to 0.8 ms p50 at wide against today's lazy map (the fight's middle, still, 9.85 against 10.25; the stress point still
12.60 against 13.45, panning 12.80 against 13.15), though it removed the stress point's p95 spikes (23.65 against
14.45). With smooth movement it is drawn every frame: about 24,000 blended quads of 100 to 200 texels each into a 2048²
target, fill-bound, growing with the soldiers; stepped (`?smoothmove=0`) it was still slower than the map, so each
redraw's fill counts too.

Review images (the mask): `output/armies-review/7-simple-shadows/` in the main checkout (not committed).

## Measured: the decal

**Look** (SwiftShader, `?frozen`, 20 a side, the same marching battalion as above): at the default and the widest zoom
each soldier's shadow reads on its own past the formation's edge, and the formation darkens once, about as the map's;
across the band (55 to 88 m) no pop and no double darkening; at the closest zoom the frame pixel for pixel today's.
**Flicker** (the same 12 frames 1/60 s apart): the shadow's fringe changes 1.0 to 1.1 every frame (the mask's 0.5 to
0.7, the map's 0 then 6.5 and 5.0 at the steps); over the battalion 4.1 to 6.0 every frame, never a jump (the map's 14
at each step). Review images: `output/armies-review/8-decal-shadows/`.

**Cost**: (filled in after the rework's bench, 20 and 40 a side.)

## Open questions

- **`?smoothmove` is on by default** (measured free above): the figures' places move every frame, their poses stay at
  12 fps. The owner's call: keep it, or go back to places stepped with the poses (`?smoothmove=0`), where the simple
  shadows glide while their figures step (at most a step's move apart: 11 cm marching, 30 cm running).
- The band (60 to 85 m) is a first guess near the LOD switch; the owner may want it nearer or farther
  (`?ushadowswitch=<r0>,<r1>`).
- The simple shadow is one averaged shape a role: a firing line's muskets show as a faint stroke, a marching man's legs
  as a soft wedge. Per-pose shapes (an atlas a step) would cost texture, not time, if the owner wants them.
- Left from review round 2 (not defects): a battalion re-placed at the next step reuses its men's ground height plus
  their move (`place`, `reuse`), which can differ from the ground under the new place by about a centimetre on a slope
  (one groundAt a man a step instead of two). (The other, `fitMask` fitting and holding its box in one function, went
  with the mask.)
- The decal's lift (0.6 m) darkens the grass and the men's legs within it over the ground in its shadow; a man
  standing in his front rank's shadow gets it on his legs (the map shadows no figure). Taller crops (the wheat, 1.2 m)
  hide the part of a shadow under them, as they hide the ground.
