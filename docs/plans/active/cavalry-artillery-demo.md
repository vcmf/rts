---
status: active
last_reviewed: 2026-10-27
---

# Plan: the cavalry and the artillery on the look page's demo map

Asked by the owner (2026-10-27): the cuirassier regiment and the foot battery on the armies demo (`?armies=<n>`),
alongside the infantry, mainly to see whether the soldiers' shadows (decisions 0062, 0074) work on a horse and on a
gun before the smoke work starts. The figures are published (`output/figures/fr-cuirassier/`,
`output/figures/fr-foot-artillery/`, `docs/systems/figure-pipeline.md`); only the infantryman is baked to unit data
today (`tools/bake-figure.py`), with three LODs.

## Scope

In:

- **The bake** (`tools/bake-figure.py`): the cavalry (one skin: the horse, the rider, the sabre, the pistol) and the
  battery (one skin: a light gun and its four gunners) baked into `data/figures/<figure>.unitdata`, each with three
  LODs collapse-decimated from the published mesh in the bake (the infantry's LODs are the pipeline's own), at a
  triangle budget for its size on screen; its colour roles from its materials, bones and texture; its roles' clips
  (the cavalry: halt, walk, trot, gallop; the battery: halt, and the firing cycle Load, Ready, Fire as one looped
  role); clips whose span is not a whole number of 1/12 s steps resampled (the gallop's 13 frames, the battery's
  clips), the root speed kept planted. The infantry's file unchanged, byte for byte.
- **The figures' own data** in the file's header (format 3, optional fields; absent: the infantryman's): its roles
  in order (at most four: the shadow's shader holds four), each colour role's cloth part or material (the dyes,
  decision 0068: never a raw colour in a uniform), its height (the LOD switch's figure height).
- **The scenario** (`src/scenarios/armies-demo.ts`): arms, each a unit type of the ruleset, a figure, a script and
  the sides' uniforms: the infantry as today; a cavalry regiment a side (the ruleset's 4 squadrons of 32 × 2, in
  column of squadrons); a foot battery a side (the ruleset's 8 pieces, 16 m apart, unlimbered; a piece is one
  figure: the gun and four of its detachment). Switches `?cavalry=0`, `?artillery=0`: main's page one URL away.
- **The scripts** (the sim's stand-in, `src/look/world/`): the infantry's as today; a ride (the regiment walks,
  trots, gallops a little and halts, then starts again where it began), a service (each piece at rest, then its
  firing cycle, the pieces in turn). Each places its arm clear of the infantry, the blocked ground and the other
  arms, within the play area; deterministic.
- **The renderer** (`src/look/units.ts`): era-generic (decision 0015: no horse, no gun named; roles, figures, scripts
  are data). One renderer an arm; the first arm keeps the page-wide parts (the trodden ground's mask, the figures'
  shadow map behind its switches, the receivers' bindings), the others feed the trodden mask and draw their simple
  shadows at every zoom. Flags only for the arms that carry them (the infantry).
- **The shadows** (the point): the simple shadow (0062) and its per-step shape (0074) for figures whose ground
  contacts spread beyond the root (a horse's four hooves, a gun's wheels and trail, its crew round it): measured
  from the figure's own contacts, not from its root. The shape bake keeps, per texel, the height of the lowest part
  that casts it (a third channel), and the look's gradient (dark and solid at the contact, softer and lighter toward
  the tip) and the feet's boost (0074's `?ushfootk`) run on that height, so each hoof, wheel and gunner's foot is
  dark and crisp, wherever it lies; the shadow is not shortened about the root (a horse's front hooves would leave
  their shadow) and its lift toward the camera starts past the figure's own footprint (it would darken the horse's
  legs). The atlas's cell fitted to the figure (a texel coarser where a cell would grow past the infantryman's), the
  per-step bins per clip, the 2048 fallback, memory: checked and measured. The infantryman's shadow unchanged.
- Tests for the pure parts; `docs/systems/look.md`; a decision record (how non-infantry figures share the units
  pipeline, and the spread figures' shadow).

Out: the sim driving them (decision 0037's bindings come with it); limbers, teams, a gun's smoke and flash; horse
colour varieties per man; a cavalry standard; the pistol and the sabre clips on the page.

## Approach

1. Bake: a profile a figure kind (the GLBs, the LODs and their targets, the colour roles by material, bone and
   texel, the roles' clips, the height bounds); the infantry's profile is today's code path. Decimation on the rest
   mesh before the armature (as `tools/unitpipe/infantry/lod.py`), each triangle's colour role read on the full
   mesh first and carried through the decimation as a face attribute.
2. Data and dyes: the header's optional fields decoded and checked (`src/look/units-data.ts`); the figure's role to
   part map given to `dressed` (`src/look/world/dyes.ts`); new dyes, materials and uniforms
   (`src/rulesets/napoleonic-dyes.ts`, `napoleonic-uniforms.ts`), a `paint` part for the gun's carriage.
3. Scripts and layout: a `Script` the renderer asks for a phase and a man's place and role; the infantry's wraps
   `phaseAt` and `manAt` unchanged; the arms placed after the infantry's layout (which stays as hashed).
4. Renderer: `Units` takes a script (and, after review round 1, whether it owns the shadow map; the trodden mask its
   own class); the figure's roles, height and reach from its data; a facade for the
   page's hooks (`__units`, `__armies`: every arm's figures, masks, coats).
5. Shadows: `shadowShape` with heights (B) and a texel that grows for big figures; `SH_SPREAD` in the decal's
   shaders, chosen when the figure's contacts spread (data: the posed far LOD's lowest vertices).

## Acceptance

- `?armies=20` shows each side's regiment and battery with their LODs, dyes, gaits and firing cycle; with
  `?cavalry=0&artillery=0` the page is main's: `tools/golden.mjs` matches main with the same armies.
- Stills at 20, 40 and 63 m of the cavalry (halt, trot, gallop) and the battery (its firing cycle), on the meadow
  and `?meadow=off`, and a GIF of the cavalry moving at 20 m, in `output/armies-review/25-cavalry-artillery/` (not
  in git): the shadows' verdict per figure.
- Measured: each figure's memory and bake and load time; the frame on the production build (`tools/bench-look.mjs
  "<url>?armies=20&benchr=20,40,63,125,250" --gpu metal`), the new arms on against off, three alternated rounds
  under the bench lock, the load noted.
- `npm test`, `npm run check:data`, `node tools/check-docs.mjs`, the build, `tools/golden.mjs` (main against the
  branch with the new arms off), `tools/guard.mjs "<url>?armies=20" --figures --base <main>`: printed whole with
  their exit codes.

## Results (2026-10-27)

Built as planned, with three changes found on the page (decision 0075):

- The shape's heights first read a bin's mean wrong (its coverage divided by its steps, its heights' sum not: a
  halt's six-step bins all at the top, a horse's shadow light all over); fixed, with a regression test.
- A gun's footprint lies at lift 0 over metres of ground, where the ground's sampled height sank it under the terrain
  (decision 0071 met the same with its oval): a spread figure's lift is floored at 10 cm.
- A lift ramp from the contacts' reach (to spare the horses' legs) let the meadow's grass hide the shadow under them;
  the ramp starts at the root as the soldier's, the strip's close rows at the contacts' reach, and the legs are not
  darkened at 15 m.

The arms on the demo map (`?armies=20`): the batteries 12 m before each side's lines at x 60 (the woods by the fight's
middle, x 150 to 220, leave no room there), the regiments' lanes between the batteries, side 0's riding east from x
about −57 to 127, side 1's west; placed at 1, 10, 20 and 40 battalions a side (tested).

### Memory, load

Per figure (`node` on this Mac; the GPU's bytes as the page makes them: the bones' texture, the posed vertices of the
far LOD, the proxy and the tiny LOD, the shapes' atlases with their mips; a unit's own copy of the near and far LODs):

| Figure | File | LODs (triangles) | Bones' texture | Posed | Shapes | A unit's LODs | Nearest LOD, split |
|---|---|---|---|---|---|---|---|
| fr-line-infantry | 1.36 MB | 9,274 / 1,197 / 243 | 0.57 MB | 6.1 MB | 14.6 MB (2 atlases) | 0.20 MB | 0.89 MB |
| fr-cuirassier | 1.94 MB | 21,760 / 2,000 / 450 | 0.25 MB | 3.3 MB | 16.7 MB (3: the heights' R8) | 0.30 MB | 2.04 MB |
| fr-foot-artillery | 4.12 MB | 30,000 / 6,500 / 1,400 | 0.87 MB | 35.3 MB | 10.7 MB (3) | 1.03 MB | 3.50 MB |

The battery's posed vertices are large for 16 figures: 3,080 far vertices at 264 steps (the firing cycle's 226).
Its far LOD could be skinned instead (`?uvat=0`'s path) for this arm alone: an open question.

Load (CPU at load, `node`, ms): decode 6 / 11 / 17; posing (the far LOD, the proxy, the tiny LOD) 243 / 238 / 873;
the shapes' bakes 376 / 754 / 435 (the page's own `shapeMs`, Chrome: 281 / 518 / 414). The bake in Blender: the
cuirassier 2.7 s, the battery 5.3 s (the infantryman's 7.1 s, his file the same bytes).

Load on the page (the production build, Metal, time to the armies ready, three alternated pairs, the machine's load
about 5 from other sessions): 1.88 s without the arms, 3.33 s with them; their shapes' bakes 0.81 s of it.

### Frame cost

The production build (`vite build`, `vite preview`), Metal, `tools/bench-look.mjs ... --gpu metal`, the bench's full
look (its `l2` arm), the GPU frame's median over its three yaws and two tries a zoom; three rounds alternated, each
started under the bench lock at a one-minute load of 3 or less (the load at each start and end is in the scratch
logs; every round agreed with the others within 0.03 ms, so none was dropped). Main (889eefa0) against the branch with
`?cavalry=0&artillery=0` first (equal: the arms off are main's page), then the arms off against on:

| `?armies=20`, round 1 / 2 / 3, ms | 20 m | 40 m | 63 m | 125 m | 250 m |
|---|---|---|---|---|---|
| main | 11.48 / 11.48 / 11.50 | 13.39 / 13.38 / 13.41 | 14.13 / 14.13 / 14.16 | 13.25 / 13.26 / 13.27 | 9.55 / 9.53 / 9.55 |
| the arms off | 11.49 / 11.47 / 11.47 | 13.39 / 13.37 / 13.37 | 14.13 / 14.11 / 14.12 | 13.25 / 13.23 / 13.24 | 9.53 / 9.52 / 9.51 |

The cuirassier's LODs first had 4,000 and 850 triangles; aimed at the arms they cost 2.1, 1.7 and 3.7 ms at 20, 40 and
63 m, nearly all the figures' own (with `?unitshadow=0` the arms cost 2.0, 1.6, 3.5 ms: their shadows about 0.1 to
0.25 ms). The LOD switch falls at the same height in pixels for every figure, so the cuirassier, 2.66 m tall, keeps
its near LOD to 93 m, and at its switch its side shows about twice the infantryman's pixels: halved to 2,000 and 450.
With them (a second set, three rounds alternated as above):

| ms, round 1 / 2 / 3 | 20 m | 40 m | 63 m | 125 m | 250 m |
|---|---|---|---|---|---|
| the fight's middle, arms off | 11.46 / 11.49 / 11.49 | 13.35 / 13.38 / 13.40 | 14.10 / 14.13 / 14.14 | 13.22 / 13.23 / 13.25 | 9.51 / 9.57 / 9.52 |
| the fight's middle, arms on | 11.49 / 11.50 / 11.51 | 13.54 / 13.54 / 13.55 | 14.45 / 14.44 / 14.45 | 13.62 / 13.63 / 13.64 | 10.09 / 10.06 / 10.08 |
| aimed at the arms (`?benchat=50,-25`), off | 6.08 / 6.10 / 6.09 | 7.39 / 7.40 / 7.39 | 8.75 / 8.76 / 8.75 | | |
| aimed at the arms, on | 7.74 / 7.72 / 7.73 | 8.47 / 8.47 / 8.45 | 11.29 / 11.29 / 11.28 | | |

The fight's middle (the bench's own orbit) sees the arms only from 40 m out (+0.17 to +0.55 ms); aimed at them a
regiment and a battery in view cost 1.6 ms at 20 m, 1.1 at 40 and 2.5 at 63 (512 horses and riders at their near
LOD, the closest at the full figure). The textures: 309.7 MB, 376.8 with the arms (+67 MB: the shapes, the posed
vertices, the bones).

### The shadows' verdict

The sheets: `output/armies-review/25-cavalry-artillery/` (not in git): `cavalry-20m.jpg`, `-40m`, `-63m` (halt,
trot, gallop), `battery-20m.jpg`, `-40m`, `-63m` (loading, firing, the run-up), each on the meadow and with
`?meadow=off`, and `cavalry-trot-20m.gif`.

- The cuirassiers: each horse's shadow stands on its hooves and steps with its gait; the dark, crisp contacts are
  at the hooves, the rider's shadow softer and lighter toward its tip. A regiment's shadows merge into one band
  beside it (1 m files, a 5.3 m shadow at the low sun), as dense infantry's do. On bare ground they read well at
  20 to 63 m; on the tall meadow they read weaker (the grass stands over the decal near the hooves; as the
  infantryman's).
- The battery: each gun's wheels, trail and barrel cast a crisp shadow with the crew's own beside it, through the
  firing cycle (8 bins over its 19 s: a gunner's shadow holds about 2.4 s of his motion, a blur while he loads).
  Lighter than the horses' (a gun is low and open). Reads at 20 and 40 m, a speck at 63.

## Review round 1 (2026-10-28)

- **Severe, fixed:** `?ushadowfar=map` baked no ground shade and an arm's simple shadows threw at load: the arms now
  follow the page's shadow mode (their simple shadows with the infantry's; none under `?ushadowfar=map`, the map
  holding the infantry alone), so the shade and the stencil are there whenever they draw. Smoke-tested on the page:
  `?ushadowfar=map`, `?ushadowclose=map`, `?unitshadow=0`, `?ushstep=0`, `?trample=0`, each with the arms in view,
  no error.
- **Severe, fixed:** the heights' distance and the gradient's core and tip were in two scales (the tip times the
  look's length, the heights not): the heights' cast is now times the length too (`gradientAlong`, tested against a
  soldier's), and both materials carry the heights, so they agree either side of the per-step band's edge.
- **Severe, fixed:** the heights stopped at the shape's own blur's reach, leaving the soft bake's reach at the top (a
  soft, light halo round each hoof and wheel): they now fill outward from the nearest reached texel over the soft
  reach and the mips' border (`fillNearest`; tested).
- **Moderate, fixed:** a failed averaged bake frees the per-step one (`bakePair`, tested); the trodden mask keeps an
  arm's moved flag until a draw takes it (`takeSteps`, tested: a column halting between two draws is trodden where
  it halts); the heights bake hoists its scratch (a triangle's plane once, a cell's buffers once); a battery's pieces
  start from the right of the line, as documented (`serveOrder`); the arms take the field's centre and gap from the
  layout (`FIELD`); a ride's and a service's phase carry their leg and count.
- **Altitude:** the page-wide parts are owned once (decision 0075, amended): the trodden mask is its own class fed by
  every arm (`src/look/trodden.ts`), the ground heights one a scene, the shade the page's; the shadow map and its
  receivers belong to one arm (`ownsMap`); no lead and followers. Contained: golden screenshots against main with the
  arms off still identical.
- The heights' bake time (`node`, the per-step shape, median of 4): before, the heights added 49 ms to the
  cuirassier's 354 and 98 to the battery's 201; after (the fill included) 51 and 79. The far shapes now carry
  heights too (two more reads a fragment in the arms' far shadows, an R8 atlas at half the size: about 0.4 MB):
  not benched.
- Before and after at 20 and 40 m: `output/armies-review/25-cavalry-artillery/review1-before-after-bare.jpg`,
  `-meadow.jpg` (the look as it was, the contacts a little crisper; the battery's firing order now from the right).

## Open questions (the owner's)

- The arms' frame cost when in view (2.5 ms at 63 m for a regiment and a battery): the cuirassier's LODs could be
  lighter still, or its switch measured by a man's height, not the figure's.
- A spread figure's shadow is as long as the sun casts it; up close the infantryman's is shortened to 0.7 (0062's
  close look). Bake the arms' per-step shape at the close length (a jump at 100 m), or keep them true?
- The battery's firing cycle in 8 bins: more bins for long clips (a list a role) would step the gunners' shadows.
- The battery's far LOD posed at its 264 steps (35 MB): skin it instead for an arm of few units?
- Readability (`tools/guard.mjs --figures`, measured, not gated): at the widest view side 0's figures within ΔE 25
  of its coat fall from 55 % (main) to 35 % with the arms: from above a regiment reads as its bay horses, not its
  blue. A far rule for the hide (the coat's colour a step down, as the far palette's dark roles) would carry the
  side's colour. At the default view side 0 is equal and side 1 has 8 % more figure pixels (a battery in view).
- The dyes (first picks): the cuirassiers', the gunners', the carriages' paint, the horses' hide; one hide for
  every horse.
