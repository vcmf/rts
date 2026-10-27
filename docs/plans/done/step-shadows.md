---
status: done
last_reviewed: 2026-10-27
---

# Plan: the soldiers' simple shadows from their pose, baked per animation step

Asked by the owner (2026-10-27, #229): a "basically correct" soldier shadow, the shadow of each man's actual pose,
crisp at the foot and blurred on top (decision 0062's gradient), no musket sticks (the blur and the lightness stay),
cheap. The old shape (decisions 0049, 0062) is one bake a role and a facing, averaged over the clip's steps, so a
marching man's feet leave it; decision 0071 patched that with a contact oval under the feet, which carpets dense
marching and firing formations. The per-figure shadow map (decisions 0047, 0049, 0062) is the costlier alternative.

Shipped as the default (decision 0074, the owner's picks of rounds 1 to 3 below); this plan first built it as a test
behind a switch.

## Scope

In:

- **The default** (decision 0074): the shape baked per clip step bin and facing, `8,8`, the bin held, read by the
  near material within 100 m of the camera's focus; the far material keeps the clip-averaged shape. No contact oval.
  The feet darker and crisper (`?ushfootk`, 3, 0.6 m), never past the ground's shade k.
- **Switches** for the A/B: `?ushstep=<steps>[,<facings>[,hold|blend]]` (0: the averaged shape at every zoom),
  `?ushfootk=<boost>[,<reach m>]` (1: none), `?ushcontact=1` (decision 0071's oval). `?ushstep=0&ushcontact=1` is
  main's page at 1093fdc3.
- **A GPU whose texture size cannot hold the per-step atlas** (it needs 2560 texels a side; WebGL2 promises 2048):
  the averaged shape at every zoom, with a warning; with an explicit `?ushstep`, an error at load.
- Measurements (memory, load, frame cost, the feet on the shape) and review images
  (`output/armies-review/23-step-shadows/`, `24-step-feet/`).

Out: the figure shadow map; a GPU bake; baking the per-step atlas only when the near zoom is first reached (#235); a
fade at the 100 m edge (the owner's call: Open questions).

## Approach

- **Bins, not points.** A clip of n steps baked in k = min(n, S) bins; bin j holds the steps from ⌊jn/k⌋ to
  ⌊(j+1)n/k⌋ − 1, its shape their average (at most a few samples a bin): with k = n each step is its own pose; with
  fewer bins the shape is the pose over that short span (march: 16 steps in 8 bins of 1/6 s). A man at step i draws
  bin ⌊((i+1)k − 1)/n⌋ = ⌈(i+1)k/n⌉ − 1, computed in integers in the shader, his step i as `units.vert` poses
  his figure (its `int()` of his clip's first step plus the `mod`), the exact n a GPU's `mod` can return wrapped to 0
  (review rounds 1 and 2), every bin clamped into the clip's
  (`stepIndex`, `stepBin`). `blend`: bin centres (j + ½)n/k apart, the two around (i + ½) mixed, wrapped the same way.
- **A 2D atlas, RG8, mips** (R the shape, G the soft bake, as today). A row of cells holds the facings of one bin;
  the rows of all roles' bins are stacked, in as many side-by-side blocks as keep the atlas near square and within
  4096 texels a side or the GPU's size if smaller (`stepAtlasLayout`; `AtlasTooLarge` when it cannot fit). A cell
  keeps today's size and 8-texel border, so the mips up to the third never bleed. No 2D array: the decal's shader
  stays GLSL ES 1.0-style and the cell maths is a few ALU.
- **The decal's shader:** `SH_STEPS` (and `SH_STEP_BLEND`) in `unitdecal.vert`/`.frag`, in the near material only;
  uniforms the bins a role, the first row a role and the rows a block. The foot boost on the shape's own share,
  before the contact's oval joins it.
- Pure functions with tests: the step and the bin (and their mirror against the shader's text, under a GPU-like
  `mod`), the blend's bins, the atlas layout and its size, the fallback, the switches.

## Acceptance

- The default as decision 0074 says; `?ushstep=0&ushcontact=1` gives main's page (1093fdc3) exactly: the switches'
  tests and the golden screenshots (a match).
- The Metal bench against main 1093fdc3, 20 to 250 m: no measurable cost; memory and load time for the default.
- The 100 m edge watched; any pop reported with its cheapest fix (no fade built without the owner).
- A GPU too small for the per-step atlas falls back to the averaged shape (tested).
- `npm test`, `check:data`, `check:docs`, build, `tools/guard.mjs` against main: exit 0.

## Open questions

- The 100 m edge: a fade of the foot boost over the band (one uniform, no shader change) if the owner sees the switch
  (round 3, "The 100 m edge").
- Halt and fire move little at the feet: they could take fewer bins (one value a role is simple; a list later).
- The per-step atlas is mostly empty (every cell holds the union of all facings' boxes); packing each facing's own box
  would cut its memory, and could bring it under 2048 texels a side.

## Results (2026-10-27)

Built as planned (`?ushstep`; commit `feat(look): the soldiers' simple shadows baked per animation step …`). The
figure's clips: halt 48 steps, march 16, run 8, fire 166 (12 fps), so at 8 bins the run is exact (a bin a step), the
march two steps a bin, the halt 6 and the fire about 21 (their feet barely move).

### Memory, load

The atlas (RG8, its full mip chain; the cell 112 × 160 texels, 0.05 m, as today's) and the shape's bake at load
(`Units.shapeMs`, the look page's production build, `?armies=20`, Metal; SwiftShader the same within 10 ms: the bake
is CPU). The machine was shared and loaded (1-min load 6 to 48); the bake's times held within 15 ms across rounds.

| setting | atlas | memory with mips | bake |
|---|---|---|---|
| main (1093fdc3) | 1792 × 640 | 2.9 MB | 159 ms |
| today on this branch (`?ushstep` absent) | 1792 × 640 | 2.9 MB | 101–115 ms |
| `?ushstep=4,8` | 1792 × 1280 | 5.8 MB | 107 ms |
| `?ushstep=8,8` | 1792 × 2560 | 11.7 MB | 163 ms |
| `?ushstep=4` (16 facings) | 1792 × 2560 | 11.7 MB | 162–176 ms |
| `?ushstep=12,8` | 2688 × 2400 | 16.4 MB | 193–198 ms |
| `?ushstep=8` (16 facings) | 3584 × 2560 | 23.3 MB | 275–277 ms |
| `?ushstep=12` (16 facings) | 3584 × 3520 | 32.1 MB | 356–363 ms |

The branch's bake blurs only the texels each cell's shape covers (the same bytes as main's, tested against main's
output), so today's shape is a third cheaper and `8,8` costs what main's does. The page's build time (`__buildMs`) moved
by less than its noise (Metal 1.7 to 2.0 s at every setting).

### The feet on the shape

From the figure's data (the far LOD posed at every step of each clip, 16 or 8 facings, the shape read where each foot
stands; a foot: the vertices within 0.12 m of the clip's lowest, split left and right): the share of feet whose
nearest texel reaches a quarter of the shape's darkest (the shadow touches the foot), and the mean value under the
foot's centre. A thin boot blurred by the shape's 0.06 m reaches about half at most, so a half at the centre is a foot
fully in its own shadow.

| setting | halt | march | run | fire | march mean |
|---|---|---|---|---|---|
| today | 100 % | 47 % | 14 % | 98 % | 0.21 |
| `4` | 97 % | 91 % | 49 % | 100 % | 0.33 |
| `8` | 97 % | 95 % | 76 % | 100 % | 0.43 |
| `12` | 97 % | 95 % | 77 % | 100 % | 0.46 |
| `4,8` | 88 % | 91 % | 41 % | 98 % | 0.34 |
| `8,8` | 88 % | 93 % | 73 % | 100 % | 0.45 |
| `8` blend | 97 % | 96 % | 76 % | 100 % | — |

The run's remaining quarter are feet in the air (a foot 5 to 12 cm up casts its shadow off its sole: correct). With
the contact oval every foot is on a solid oval at every step (decision 0071, tested), whatever the shape.

### Frame cost

The Metal bench (`node tools/bench-look.mjs <url> <json> --gpu metal`, `?armies=20&benchr=40,63,125,250`, production
builds: main 1093fdc3 on one port, this branch on another), the arms alternated in each round; the default arm's
(`l2`) GPU frame p50, ms, the mean over its three yaws, per round (r1 / r2 / r3). Round 1 ran with the machine
loaded by another session (1-min load 4 to 17), round 2 and round 3's main and `8` near quiet (2.7 to 4.7); round
3's later arms loaded again (6 to 24); `8,16,blend`'s round 3 failed (Chrome exited under a load spike) and was not
rerun.

| zoom | main | `8` (16 facings, hold) | `8,16,blend` | `12` | `4,8` |
|---|---|---|---|---|---|
| 40 m | 13.15 / 13.03 / 13.20 | 13.07 / 13.15 / 13.21 | 13.36 / 13.04 / – | 13.53 / 13.03 / 13.60 | 13.04 / 13.03 / 13.22 |
| 63 m | 13.99 / 13.84 / 13.86 | 13.86 / 13.95 / 13.93 | 14.26 / 13.86 / – | 14.13 / 13.84 / 14.60 | 13.85 / 13.84 / 14.33 |
| 125 m | 13.53 / 13.47 / 13.50 | 13.78 / 13.48 / 13.53 | 13.73 / 13.53 / – | 13.74 / 13.47 / 14.26 | 13.50 / 13.87 / 13.83 |
| 250 m | 9.57 / 9.68 / 9.69 | 9.84 / 9.57 / 9.57 | 9.99 / 9.65 / – | 9.60 / 9.55 / 9.93 | 9.56 / 9.84 / 9.85 |

On the quiet rounds every arm is within about ±0.1 ms of main at every zoom: no measurable cost (the per-step path
adds a few ALU and two uniforms' selects a vertex, and its bigger atlas is read through the same mips). The larger
differences are in the loaded rounds and go both ways. `8,8` (the cheapest setting with the march's gain) was not
benched; it reads the same as `8` with a smaller atlas.

### In motion

Sheets and animations in `output/armies-review/23-step-shadows/` (not in git): 8 frames over a stride (march: 2 steps
apart; run: every step; fire: 0.5 s apart) at 20 m and 63 m, on the default meadow and with `?meadow=off` (bare
ground: the shape itself legible), rows today / per step with the oval / per step without / per step blended without;
stills of whole frames; GIFs of the close march and run side by side.

- On bare ground at 20 m the per-step shadow shows each man's legs: the boots have their own small dark shadows
  attached, the legs' stripes swing with the stride, and the running men's shadows change every frame with the
  figures. Today's is one soft wedge a man that slides under the legs, held at the feet only by the oval.
- Without the oval the feet still stand on their shadows (the boot's own shadow), lighter than the oval's solid core;
  under the dense column the ground is a little lighter (the oval's solid cores were most of the carpet).
- `blend` merges the march's two leg stripes into a softer wedge between bins (2 steps a bin) and is the same as
  hold at the run (a bin a step); hold keeps the crisper pose.
- On the default meadow the grass covers most of the shadow up close in every arm; the difference is small there.
- At 63 m the three arms are nearly alike: the stepping is barely visible, a little lighter carpet without the oval.

### Recommendation (for the owner's judgement)

`?ushstep=8,8` (hold): the march's and the run's feet on their own shadows (93 % and 73 % touching, from 47 % and
14 %), 11.7 MB with mips, a bake no slower than main's, no measured frame cost. With it the oval can go
(`?ushcontact=0`): the boots keep their own small dark shadows, lighter than the oval's solid core, and the carpet
under dense formations thins. If the owner wants the solid core back, keep the oval with it. `8` (16 facings) if 8
facings shows a step when a man turns; `12` buys almost nothing over `8`.

## Round 2 (2026-10-27): the owner's pick, the feet sharper and darker

The owner picked the per-step shadow **without the oval**, and asked to "make the shadow at feet sharper and darker".

**Shipping shape, behind the switch:** `?ushstep=8,8&ushcontact=0`. The per-step shape is read only by the near
material, within its band (60 to 100 m: `nearWeight`, `nearOn`; `?ushnearband` since review round 2). The far material keeps today's averaged
shape, so there are two atlases: today's 1792 × 640 (2.9 MB with mips) and the per-step 1792 × 2560 (11.7 MB), **14.6 MB
in all**. Both bakes together take 230 to 250 ms at load (Metal, loaded machine). Past 100 m the switch from the
per-step shape to the averaged one is a hard switch, at a size where the two read alike.

**The feet:** `?ushfootk=<boost 1..4>[,<reach m 0..1>]` (`footSharpen`; the per-step material only). It multiplies the
shape's share of the samples at the soles and behind them by `boost`, back to 1 by `reach` m along the shadow. The
share is capped at 1 as before. So the boots' and lower legs' shadows fill in (darker) and their blurred edges rise
faster (crisper), and no sample goes past the ground's shade k: decision 0071's ceiling, the oval's core. The soft fade
toward the tip is untouched. The cost is one `smoothstep` and a multiply a fragment in the near material: no bench.

Variants (sheet `output/armies-review/24-step-feet/`):
- **A, mild:** `ushfootk=2,0.4`. A little darker right at the boots than the shape as is.
- **B, medium:** `ushfootk=3,0.6`. The lower legs' shadows solid near the boots.
- **C, strong:** `ushfootk=4,0.8`. A solid dark stroke from each boot along the lower legs, crisp-edged; its core is k.

Against a tree's cast shadow at the same zoom (the sheets' last column), even C's core is lighter than the tree's
shadow. That is expected: the tree's shadow also hides sky, so it is darker than k (decision 0071, Consequences).
On the default meadow up close the grass covers the feet in every variant. On bare ground at 40 m, C's feet read as
dark strokes under the front rank; B's less so.

**Facings:** with 8 facings the shadow blends the two nearest baked facings per pixel, so a turning man's shadow
cross-fades rather than jumps. In the demo the men turn at once (column to run), so no slow turn could be shot; the
running men's headings fall between baked facings, and 8 and 16 facings look the same there (sheet 13).

## Round 3 (2026-10-27): B the default (decision 0074)

The owner picked B. The default is now `8,8` held in the near material, no oval, `?ushfootk` 3,0.6 (`STEP_SHADOW`,
`FOOT_SHARP`); far, today's averaged shape. `?ushstep=0&ushcontact=1` is main's page (1093fdc3); checked by the
switches' tests and by the golden screenshots against main (the check batch below).

### Memory, load

Two atlases, 2.9 + 11.7 = **14.6 MB** with mips (main: 2.9 MB). Production builds, `?armies=20`, three loads each on
Metal and two on SwiftShader (1-min load 4.5 to 7.8):

| | `shapeMs` (both bakes) | `__buildMs` Metal | `__buildMs` SwiftShader |
|---|---|---|---|
| main 1093fdc3 | 155–160 | 1727–1769 | 6904–6928 |
| default | 243–272 | 1797–1889 | 6912–6916 |

Those default `shapeMs` included the textures' creation. Re-measured in review round 2 with `shapeMs` the bakes alone
(`shadowShape`, both summed, as main times its one): three loads each on Metal, the machine loaded by another
session (1-min load 31 to 34; the bake is CPU work and held within 4 ms across loads):

| | `shapeMs` (the bakes alone) | `__buildMs` Metal |
|---|---|---|
| main 1093fdc3 | 154.5–155.7 | 1706–1773 |
| default | 249.0–253.0 | 1790–1962 |

About 95 ms more of bake at load; the page's build about 70 to 190 ms longer on Metal under that load (70 to 120 ms
in the quieter first measure), the same on SwiftShader. #235 would move the per-step bake off the load.

### Frame cost

The Metal bench, `?armies=20&benchr=20,40,63,125,250`, main 1093fdc3 (port 4351) against the default (4350), the
arms alternated, five tries, each started at a 1-min load of 2.9 or less. The bench itself lifts the 1-min load to
about 4 to 5, main's runs as much as the default's. Try 1's default run hit another session's spike (the load ended
at 33): it is dropped. The default arm's (`l2`) GPU frame p50 / frame p50, ms, the mean over its three yaws, main ·
default; the load at each run's start → end:

| try | load main | load default | 20 m | 40 m | 63 m | 125 m | 250 m |
|---|---|---|---|---|---|---|---|
| 2 | 2.6 → 5.1 | 5.1 → 5.1 | 11.57/7.90 · 11.60/7.88 | 13.49/9.35 · 13.72/9.55 | 14.28/10.22 · 14.57/10.38 | 13.47/10.30 · 13.58/10.38 | 9.81/6.90 · 9.90/7.00 |
| 3 | 2.5 → 4.0 | 4.0 → 7.0 | 11.50/7.95 · 11.56/7.87 | 13.53/9.23 · 13.40/9.25 | 14.22/10.20 · 14.11/9.95 | 13.43/10.27 · 13.37/10.22 | 9.77/6.88 · 9.78/6.90 |
| 4 | 2.9 → 5.0 | 5.0 → 4.2 | 11.57/7.93 · 11.56/7.90 | 14.00/9.55 · 13.48/9.42 | 14.31/10.28 · 14.25/10.25 | 13.55/10.28 · 13.42/10.20 | 9.81/6.90 · 9.79/6.92 |
| 5 | 2.8 → 4.9 | 4.9 → 4.9 | 11.58/7.88 · 11.58/7.88 | 13.51/9.33 · 13.49/9.42 | 14.31/10.27 · 14.25/10.23 | 13.51/10.28 · 13.43/10.20 | 9.85/6.95 · 9.79/6.93 |

The default is within the noise of main at every zoom. GPU p50 ranges, the default against main: 20 m 11.56–11.60
against 11.50–11.58; 40 m 13.40–13.72 against 13.49–14.00; 63 m 14.11–14.57 against 14.22–14.31; 125 m 13.37–13.58
against 13.43–13.55; 250 m 9.78–9.90 against 9.77–9.85. No measurable cost, at 20 m (where the per-step shape matters
most) within 0.06 ms. The logs: the session scratchpad's `step/bench2/`.

### The 100 m edge

Zooming out across 100 m on bare ground, a march frozen (radii 94 to 106 m): the near material gives way to the far one
in one frame. In the frame just inside (99.6 m) the switch changes 1.3 % of the pixels by more than 8 levels and 0.15 %
by more than 24 (the default against `?ushstep=0` there). The camera's own move from 99.6 to 100.4 m changes 20 %. It
is a scatter of single pixels at the men's feet: the foot boost, which the far material does not have, more than the
shape (`output/armies-review/24-step-feet/14-edge-100m-bare.jpg`). At 3× the two frames look alike. The cheapest fix,
if the owner sees it: fade the boost to 1 over the band by the near weight on the CPU (one uniform; no shader change);
not built.

### Checks (the final code, after review round 2, once)

- `npm test` (lint, format, typecheck, Vitest 643 of 643), `check:data`, `check:docs`, the build: exit 0. (Round 3's
  first run had two of the sim's cost tests over budget under a 1-min load of about 15; rerun alone they passed.)
- `tools/golden.mjs` main 1093fdc3 against `?ushstep=0&ushcontact=1` on this branch, `?armies=20`, 8 cameras: a match
  (0.000 % at every region), exit 0.
- `tools/guard.mjs` `?armies=20 --figures --base` main: exit 0.
- The default against round 2's B (`?ushstep=8,8&ushcontact=0&ushfootk=3,0.6`), close march, close run and 40 m
  march, bare and meadow: identical (0 pixels differ).

## Review rounds

- **Round 1 (severe, fixed):** the hold bin could pass the clip's last on a GPU (an inexact division, and a `mod`
  returning n): the step wrapped, the bin in integers and clamped, tested under an emulated ANGLE Metal `mod`; the
  default atlas (2560 texels a side) over WebGL2's promised 2048: a fallback to the averaged shape with a warning (an
  error with an explicit `?ushstep`); the blend's bins wrapped and clamped; the foot boost on the shape alone, so
  `?ushcontact=1` keeps decision 0071's oval; `?ushcontactat`, `?ushcontactband` an error without the oval; dead
  timing fields removed; this plan rewritten for the shipped default; the deferred bake filed (#235).
- **Round 2 (moderate, fixed; the last):** the shadow's step exactly `units.vert`'s (its `int()` of the clip's first
  step plus the `mod`, the exact n wrapped), tested equal to the figure's under the emulated `mod`; the per-step band
  its own switch (`?ushnearband`, `NEAR_BAND`), the oval's band its own; `shapeMs` the bakes alone, re-measured; the
  role's clip check its own function; the fallback rule inlined; the far atlas disposed on the error path and
  `Units.stepFallback` set on the fallback.
