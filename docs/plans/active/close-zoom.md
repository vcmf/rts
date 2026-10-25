---
status: active
last_reviewed: 2026-10-23
---

# Plan: a closer zoom to show the soldiers (#133)

Issue #133 (the owner's test shots, `output/armies-review/6-close-zoom/`). The look page's closest zoom was 45 m
(`src/look/spec.ts`); at 14 m and closer the near LOD (1,197 triangles) shows its facets, the faces read red, and the
full figure (9,274 triangles) was not baked. The system: `docs/systems/look.md` ("The armies"); the decision: 0051.

## Scope

In, in order:

1. **The red faces**: find why the faces paint red, not the uniform's skin, and fix it at its root.
2. **A nearest LOD from the full model**: `soldier-lod0.glb` baked into the unit data as a third LOD (the same clips
   and colour roles), drawn only for the men tall on screen, so today's zooms pay nothing for it.
3. **A closer zoom**: `rMin` from 45 m to about 20 m (15 m, tuned by eye), the RTS camera kept (top-down, no sky: AGENTS.md); there,
   check the buildings, the figures' shadow map's texel, the trodden ground, the meadow, the depth of field (decision
   0040) and the render scale (Auto by zoom).

Out: the cinematic camera without the RTS limits (#133's step 4, a separate mode); the figures shadowing one another;
anything found at the closest zoom that is not cheap (filed as issues, `known-issue`, `phase:L5`).

## Approach

1. **Faces**: measure what the bake's colour test (`texel_role`, `tools/bake-figure.py`) gives the head's and the
   hands' triangles on each LOD's texture; fix the test (or the uniform data, or the shader's lookup, wherever the
   wrong colour comes from), rebake, compare before and after at the closest zoom.
2. **Nearest LOD**: the bake writes LOD0, LOD1, LOD2 (nearest first; the animation still read from LOD1's scene, so
   the bones' texture is unchanged). The page (`src/look/units.ts`) reads the LODs from the data (decision 0015: it
   names none): two, as before, or three. With three, a battalion whose nearest point is tall on screen (90 % of
   `nearestPx`, 100 px) and in the view is **split**: each man in the view and taller than `nearestPx` (±10 %) is drawn at the nearest LOD, the
   rest at the near one, the two lists written again only when a man changes LOD or the men move. Skinned on the GPU
   from the bones' texture, like the near LOD: posed vertices (`VAT_POS`) would be two texels a vertex a row (2 × 13,739:
   over the min-spec's 8,192 texels wide) and some 100 MB of float texture over the 242 steps,
   for a LOD drawn for about a hundred men. A battalion that is not split keeps its nearest LOD's mesh disabled (the scene never looks at it). A
   battalion splits only when its bounds are in the view.
3. **Closer zoom**: `rMin` 15 m (20 m was tried first: the focus stays 8 m up while the battlefield lies about 3 m
   up, so a soldier there stood only about 105 px tall at 1080 lines). The spec's camera check assumed the eye above
   the tile's highest ground at every allowed view; at 15 m and the most oblique pitch the eye is 8.4 m above the focus
   (8 m), under the highest tile ground (20.3 m). The zoom is held out where the eye would come within a clearance (6 m) of the ground under it
   (`clearRadius`), and the spec's reach check uses that held radius; from 41 m out the eye always clears the
   highest ground, so the hold never runs at today's zooms. The depth of field's zoom ease and the render scale's
   Auto edges stay where they were tuned (45 m), so today's zooms look and cost the same; the bench's `close` stays at
   45 m (`?benchclosest=1` adds the closest).

## Acceptance

- The faces paint the uniform's skin at every LOD (before/after images in `output/armies-review/11-close-zoom/`).
- The unit data holds three LODs nearest first (`checkUnits` refuses another order); its size is reported here.
- At today's zooms (45 m and out) no man is drawn at the nearest LOD and the frame costs the same (the bench: main
  against this branch, `?armies=20&benchat=162.5,-2.5`, still, three rounds); at 15 m the nearest LOD's cost is
  measured.
- `npm test` passes (lint, typecheck, Vitest), `check:data`, `check-docs`.
- What the closest zoom shows is checked by eye and recorded: fixed here, or an issue.

## Results

Review images (SwiftShader, 1600 × 900, `?armies=2&frozen`, the clock at 70 s): `output/armies-review/11-close-zoom/`
in the owner's checkout (not committed); `faces-before-after.png` sets the before, the after at LOD1 and the after
with the nearest LOD side by side.

- **The red faces**: the bake's colour test (`texel_role`, `tools/bake-figure.py`) took every texel of hue under 24°
  and saturation over 0.4 as the red facings, before the skin test. Measured per triangle on the three LODs' textures
  (the head's and the hands' triangles, by their heaviest bone): the skin sits at hue 14–26°, saturation 0.38–0.55,
  value 0.6–0.85, the facings at hue 342–8°, saturation 0.5–0.9; so 96 % of LOD0's hands and 90 % of LOD1's were
  facings, and the faces' shaded side (value under 0.5) leather. Now: red under 12° (or under 24° when saturation is
  over 0.6), skin from 12°, saturation up to 0.6, and the face's shaded side taken as skin: leather on the head's bone
  in the face's front (y under 0.02, |x| under 0.06), not the visor jutting under the brim, in skin-like shades only
  (hue 5–40°, saturation 0.15–0.65, value from 0.2). (The review's round 1: the first cut took every leather triangle
  under the brim, the hair behind, the visor and the chinscales too; `heads-before-after.png` shows both.)
  The hands are 96 / 94 / 78 % skin on LOD0 / LOD1 / LOD2 (were 2 / 8 / 35 %), the head's skin share 21 % (was 7).
  The root was the bake, not the shader's lookup or the uniforms (`#C89474` is what the skin role paints).
- **The dark blotches on the white coats** (the coordinator's review of `faces-before-after.png`): the navy coat in
  deep shade drifts to violet and grey (hue 280–345°, saturation 0.12–0.35, value 0.13–0.29), outside the coat test's
  hue 195–275° and saturation over 0.12, so those triangles took the dark role: black on a white coat. Measured on the
  chest and the back (|x| < 0.13, z 0.45–0.8 model units) LOD1's dark was 11.8 % of the front and 7.4 % of the back.
  Now between the gaiters' tops and the collar (z 0.3–0.78) a dark texel of hue 180–345° and saturation over 0.08 is
  the coat: 7.4 % and 3.9 % left (the scabbard on the left hip, the cartridge box: black in the uniform); the gaiters
  keep their black. The coat's share of the figure: 21.3 → 25.0 % on LOD1, 17.5 → 23.3 % on LOD2, so the far
  figures' look and the guard's figure numbers (`tools/guard.mjs --figures`: the coat role's share, ΔE to the coat)
  move with it; the 32k branch's tiny-LOD calibration was made on the old data.
- **The nearest LOD**: three LODs nearest first, LOD0 9,274 triangles and 13,739 vertices (each triangle's role is
  flat, so vertices are split where roles meet), the animation unchanged (read from LOD1's scene). The unit data is
  1,428,304 bytes (was 755,276; 0.47 MB gzipped). In the review views at 15 m, 91 to 108 of the nearest battalion's 414
  men are drawn at LOD0; at 45 m none.
- **The closest zoom, 15 m**, what it shows:
  - the figures: LOD0's faces, hands, crossbelts and turnbacks read; LOD1 next to it shows its facets and darker faces;
  - the figures' shadow map's texel at 15 m: 2.9 × 2.1 cm in the sun's view at the most oblique pitch, 1.8 × 1.8 at
    the steepest (the sun's box 60 × 44 m, 36 × 36 m): finer than at 45 m;
  - the buildings: the house's flat walls and faceted roof edges, the windmill's blotchy tower: #138;
  - the trodden ground: per vertex on 1.8 m cells, a soft blob up close: #137;
  - the meadow holds (blades read, the comb flows), as the owner's shots found at 14 m;
  - the depth of field: unchanged from 45 m (its ease reckoned from there); the near band softens the bottom of the
    frame by design (decision 0040), the units with it;
  - the render scale: Auto keeps 0.9 (EASU) at the closest zooms, its edges where they were (217 and 234 m).
- **The bench** (the coordinator's, Metal, 1080p, `?armies=20&benchat=162.5,-2.5`, still; p50 ms; raw runs in the
  session's scratchpad, `closezoom/bench/`): today's zooms cost nothing extra. Main (084d6e0) in three rounds against
  this branch in four: wide 9.10 / 8.85 / 8.75 against 8.80 / 8.70 / 8.75 / 8.80; default 10.65 / 10.05 / 10.10
  against 10.10 four times; close (45 m) 9.80 to 10.05 on both. At the 15 m camera (`?benchclosest=1`, three yaws a
  round) the nearest LOD costs about nothing: 7.30 to 8.30 with it (one round's middle yaw 9.10) against 7.30 to 8.20
  with `?nearestpx=0`. (Benched on the build before the coat's shade fix, which changes colour roles only.)
- **Checks** (the full batch once, after review round 2; SwiftShader; against main 084d6e0's build): `npm test`,
  `check:data`, `check-docs`, the build pass (Vitest's sim cost test went over its 12 ms budget under the machine's
  load and passes alone); golden matches main on every view; `guard --base` and `guard ?armies=10 --figures` pass;
  `detail-check --selftest` and `water-check --selftest` pass once their banks and page views went back to 45 m (at
  15 m too few of the bend's points are on screen: 130 of 200, 215 of 300); `water-look-check --selftest` fails only
  as main does (#118's gravel bar, #120's winter ice at 76.6 %); `macro-check --only shimmer` fails its 15 m view
  (1.86 % against 1.0 %): #139.

- **With the simple shadows** (decision 0049, merged from main): the cross-fade band (60–85 m from the focus) lies
  past the closest zooms, so from 15 m to 60 m the figures' shadows are the map's (its texel 2.9 × 2.1 cm at 15 m),
  the men at the nearest LOD cast through the shadow proxy like the rest; the nearest LOD's split lists carry the
  men's moves between steps (`aNext`) with their matrices and clips.

## Open questions

- **The camera's eye in a crown**: at 15 m the eye is 13 to 16 m over the battlefield; over a tall tree it may sit in
  its crown (not seen in the review views; the clearance is over the ground, not the trees).
- **LOD1's faces** still read darker than LOD0's (its coarse triangles under the shako's brim take the shako's dark);
  only the nearest men show faces at all, at LOD0.
- **The near-LOD switch is in pixels**: on a 4K screen the nearest LOD starts twice as far out (its cost with it);
  the bench measures 1080 lines.
- The cinematic camera (no RTS limits) for the history videos: a separate mode (#133's step 4).
