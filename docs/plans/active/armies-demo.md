---
status: active
last_reviewed: 2026-10-22
---

# Plan: the first armies on the demo map

Asked by the owner on 2026-10-21 ("put some infantry units we've created … see if we put the armies and move it if
we have huge fps or graphics problem"), with two choices: scripted moves first (the sim drives them in the next
PR), and the enemy as the French figure recoloured. Built in one first pass and three batches (A, B, C) with a
coordinator who benched each on Metal; then the slow frames' cause was traced and fixed. The system:
`docs/systems/look.md` ("The armies"); the shadows' decision: 0047.

## Problem

The look page painted the world but showed no army; the figures existed (`docs/systems/figure-pipeline.md`, the
published `fr-line-infantry` GLBs) and the crowd renderer had been benched on its own branch (`rts-units`), not on the
current map with its meadow, light and depth of field. Whether 4,000 to 16,000 animated men on the painted map cost
too much, or read badly, was not known.

## Scope

In: the figure baked into a unit data file; the crowd renderer on main; a scripted scenario of two armies
(`?armies=<battalions a side>`); their shadows; uniforms as data; readability work (the far rule, larger far figures,
flags, trodden ground); the layout within the play area; the bench's pan and trace; tests and review sheets
(`output/armies-review/1-first.png` to `5-shadow-fix.png`, not committed).

Out: the sim's hookup (the next PR), the enemy's own figures, the full-resolution unit pass (decision 0036), smoke,
sound, casualties, other arms.

## What was built

- **The figure** (`tools/bake-figure.py`, `data/figures/fr-line-infantry.unitdata`, `src/look/units-data.ts`): both
  LODs (1,197 and 243 triangles) with a colour role a vertex, the bones' matrices at 12 fps for the clips by role
  (halt: Stand; march: Walking; run: Running; fire: Present, Aim, Fire, Reload) and the root speeds. At load, the far
  LOD's vertices posed at every step (`posedVertices`) and the shadow proxy built and posed (`shadowProxy`,
  `posedMesh`: 112 vertices, 56 triangles).
- **The renderer** (`src/look/units.ts`, `units.vert`, `units.frag`): thin instances, a host a battalion for the near
  LOD, the far LOD and the shadow proxy; the near LOD skinned, the far LOD and the proxy posed (`VAT_POS`); materials
  shared by uniform and LOD; the LOD by the figure's height in pixels (48, ±10 %).
- **The shadows** (decision 0047): a 2048² depth-only map with a comparison sampler, fitted to the ground in view,
  drawn only when it would change, held through a pan by a slack in proportion to the view, cast by the proxy from
  the battalions whose shadow can reach the view, read soft by the ground and once a blade by the meadow.
- **Uniforms** (`Uniform`, `src/sim/ruleset.ts`; `src/rulesets/napoleonic-uniforms.ts`; the demo's sides in
  `src/scenarios/armies-demo.ts`): colours by role, the flag's, and the far rule ('coat' below luminance 0.18, else
  'own').
- **Readability**: the far rule's palette and lift; far figures larger (to 1.21 across, 1.15 tall); a flag a
  battalion (never under 12 px); the ground trodden under the formations.
- **The script and layout** (`src/look/world/armies.ts`): march in column, halt, deploy at the run, fire by ranks
  (110 s); lines within ±235 m (two footprints deep) and reserves in column behind.
- **The bench**: `?benchpan=1`, `?benchtrace=1` (`src/look/trace.ts`), the focus on the fight's middle;
  `tools/guard.mjs --figures`; `tools/bench-look.mjs --print`.

## Measured (the coordinator's, Metal, 1080p, `?benchat=162.5,-2.5`; wide / default / close ms)

| When | main | the armies (defaults) | without their shadows | notes |
|---|---|---|---|---|
| first pass, 16,560 figures | 6.65 / 9.45 / 8.83 | +5.4 / +4.3 / +4.6 | +2.0 / +0.8 / +0.9 | the shadow pass drew nothing (the NaN, fixed in batch A); 8,280: +3.0 / +2.2 / +3.0 and +1.7 / +0.7 / +0.5; 4,140: +2.6 / +1.5 / +2.0 and +0.8 / +0.3 / +0.5 |
| batch A | 6.67 / 9.53 / 8.80 | 9.20 / 10.43 / 10.12 | 8.55 / 9.87 / 9.45 | the map every frame 11.25 / 11.28 / 10.60 (the lazy map saves 2.05 / 0.85 / 0.5); near-LOD casters the same; the grass per blade −0.26 close; the far palette ≈ free |
| batch B | | +1.8 / +1.2 / +1.4 | +1.25 / +0.5 / +0.3 | batch A's lookup: the same mean, p95 15–17 at default against ~12; posed far LOD −0.7 wide; culling −0.1 and fewer p95 spikes; panning no penalty |
| batch C, 20 a side | 6.92 / 9.33 / 9.03 (p95 wide 8.3) | 9.32 / 11.03 / 9.90 (p95 wide 13.9) | 8.67 / 10.00 / 9.38 | trample +0.05 / +0.5 / +0.15; flags and larger far figures ≈ 0; the grass per blade saves ~0.4 close; panning +1.2 wide |
| the shadow fix | 6.62 / 9.57 / 8.92 (p95 wide 7.97) | 8.98 / 10.68 / 9.85 (p95 wide 11.57) | | before it (`?smhold=fixed&shadowlod=far`) 9.30 / 11.03 / 9.85, p95 wide 14.12; panning 9.22 / 10.30 / 9.80 (p95 10.30) against 10.55 / 10.80 / 9.92 |

**The slow frames' cause** (the traced run, 20 a side): at the widest zoom the frames that drew the shadow map were
11.5 % of all and 47.7 % of the slowest tenth, 12.5 against 9.15 ms (+3.4 ms a draw; +0.6 at default and close), and
a pan drew it on every frame (the batch B box was fitted 2 m round the view: its 6 m hold never held). Trample and
place() rode the same pose-step frames; the other bakes did not matter. Fixed by the slack in proportion to the view,
the 56-triangle proxy, and no draw of an empty map.

**The trace's own cost**: traced pans ran 13–21 ms (new) and 38–52 ms (old) against 9.2 and 10.5 untraced. The trace
then patched the prototypes of classes the render loop calls per mesh and per draw (`Mesh`'s thin-instance upload,
the render targets', the effect renderer's) and looked counters and render targets up by name. Now nothing per mesh is
patched (the uploads are counted where `units.ts` makes them), each render target and effect keeps its bit on itself,
the counters are indexed by number, and each frame records its JavaScript time (`cpuMs`). In SwiftShader (160 × 90,
20 a side, the old box and casters, every camera panning) a traced and an untraced bench take 880 / 1,265 / 2,596 and
852 / 1,235 / 2,576 ms a frame (close / default / wide), the traced frames' whole JavaScript 1.9 ms (p50, 3.9 p95):
SwiftShader's frames are the GPU's, so the Metal gap could not be reproduced here; the next traced Metal run's `cpuMs`
says whether it is gone. Timings come from untraced runs; the trace explains them.

**Readability** (`tools/guard.mjs --figures`, 10 a side, summer, the default zoom): the blue-coated side's pixels near
its coat 3.6 % → 31.2 % with the far rule (widest 0.4 → 18.5 %); the white side under 'own' unchanged (21.6 %). The
shadow's texel at r45 / r125 / r260: 3.9 × 2.5, 9.2 × 5.5, 18.4 × 10.4 cm in the sun's view (× 2.2 along the sun on the
ground), with the slack's 10 % on top while held.

## Switches (all `0|1` unless named; the defaults are the measured best)

`?armies=<1..20>` the armies; `?unitshadow=0` no figure shadows; `?ushadowrate=0` the map drawn every frame;
`?smhold=fixed` the held box (and the trodden mask's refit) as batch B; `?shadowlod=far` the far LOD casts;
`?ushadowlod=1` the near LOD casts where drawn; `?ucull=0` every battalion in the sun's box casts; `?uvat=0` the far LOD
and its casters skinned; `?ushadowvs=0` the meadow reads the shadow at every pixel; `?farpal=0|1` the far rule off or
on for every uniform; `?farscale=0` the far figures at their size; `?trample=0` no trodden ground; `?flags=0` no
flags; `?bench`, `?benchat=<x>,<z>`, `?benchpan=1`, `?benchtrace=1`. Dropped (one-off comparisons, judged):
`?ushadowq=0` (batch A's hard, coarse shadow) and `?udepth=0` (the float colour map), with their code.

## Review round 1 (2026-10-22)

The era-generic invariant: the page named the era's unit type and figure; the scenario now names its ruleset, unit
type and figure, resolved by name (`src/rulesets/index.ts`, the figures by file). Fixed too: the trodden mask's
clamped edge smeared over the ground outside its box (read as none there); its refit throttled by the page's clock
(held under `?frozen`: by the wall's now); the bounds' top pad (2.4 m, under a 2.6 m figure grown 1.15); the flags left
shown by `show(false)`; the pose's step from a float32 time in the shader (the CPU's step now); the caster rule written
twice (`casterOf`); the flags' bounds refresh (always active); the view's corner rays cast three times a frame (once).

## Next

- A third LOD for figures under ~12 px (the far LOD's 243 triangles where a few would do).
- Trample off the pose-step frames (its redraw rides them; stagger it).
- Shared thin-instance buffers with partial uploads (a battalion's men written and sent once for its LODs and proxy).
- The near LOD posed from a baked VAT as the far one is.
- The per-frame allocations left (the profiler's list).
- The reserves' cycles staggered when they move (now they stand).
- The trodden ground read per terrain vertex (about 1.8 m) against 0.25–0.5 m texels up close: it aliases and jumps
  when the mask refits; read it in the fragment stage once a sampler is free, or filter the mask to the vertex
  spacing.
- The LOD switch scaled by the frame's height (48 × height / 1080 px): at 720p the near LOD all but never draws, at
  1080p battalions within about 57 m do.

## Open questions

- The cost on the laptop (the min-spec) at 16,000 men.
- The near meadow hides the men's legs at the closest zoom.
- The trodden ground aliases up close (read per terrain vertex, about 1.8 m): see Next.
- Winter: white coats on snow (the Austrians' greatcoats are grey in winter: the enemy's own figure).
- The second line: the demo map's village, river and trees leave room for 4 and 3 battalions in line at 20 a side.
