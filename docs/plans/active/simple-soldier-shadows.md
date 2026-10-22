---
status: active
last_reviewed: 2026-10-22
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
  figure data (the figure's silhouette projected on the ground along the sun, `SUN`, soft-edged), splatted every frame
  into a top-down world mask at each man's place, read by the ground and the meadow as their shadow term.
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
- **The splat** (`src/look/units.ts`, `shaders/unitmask.*`): a fourth mesh a battalion, one quad a man (thin instances
  on the battalion's own matrices), laid along the sun's ground direction from his feet, its facing and role picking
  the atlas cells (two facings blended); drawn into an R8 render target over an axis-aligned world box round the
  ground in view and the battalions there (blend MAX: overlapping shadows do not double). Drawn every frame while it
  shows, not lazily (it is cheap), so it never steps.
- **Every frame**: each man's next step's place is written with his place (`aNext`), and the splat moves him by the
  share of the step gone (`uStepFrac`, from the CPU's clock in double precision). `?smoothmove=1` does the same for the
  figures, their flags and the map's casters (the map is then redrawn every frame while men in it move).
- **The receivers**: the ground's fragment (`unitMaskAt`, `painter.glsl`) and the meadow's blade root
  (`meadow.vert`, as the map's): the map's shadow × (1 − f) + the mask's × f, f the band's share. Grass stands over
  the ground, so a decal quad on the ground would be hidden by the blades: the mask is what the blades read too.
- **The ground's sampler**: the terrain's fragment stage is at 16 textures with the map (decision 0047); the cross-fade
  reads both. The dirt's and the earth's greyscale textures (1024², both one channel) are packed into one texture's R
  and G at load (`src/look/macro.ts`), which frees one; the ground's look must not change (a frozen frame compared).

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

## Measured

(Filled in as built.)

## Open questions

(Filled in as built.)
