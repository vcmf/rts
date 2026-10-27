---
status: active
last_reviewed: 2026-10-27
---

# Plan: the soldiers' simple shadows from their pose, baked per animation step (a test)

Asked by the owner (2026-10-27, #229): a "basically correct" soldier shadow, the shadow of each man's actual pose,
crisp at the foot and blurred on top (decision 0062's gradient), no musket sticks (the blur and the lightness stay),
cheap. Today's shape (decisions 0049, 0062) is one bake a role and a facing, averaged over the clip's steps, so a
marching man's feet leave it; decision 0071 patched that with a contact oval under the feet, which carpets dense
marching and firing formations. The per-figure shadow map (decisions 0047, 0049, 0062) is the costlier alternative.

## Scope

In, behind a switch (the default page unchanged):

- `?ushstep=<steps a clip>[,<facings>[,blend]]` (0 or absent: today's shape). The shape baked per clip step bin ×
  facing (× role, a clip a role), with today's rasteriser and soft bake; the decal's vertex shader picks the man's
  cell from his clip and his current step (`units.vert`'s step rule) and blends two facings as today; between baked
  steps it holds the bin's bake (`hold`, the default) or blends two bins (`blend`: four reads instead of two).
- Works with and without the contact oval (`?ushcontact=0`).
- Measurements: the atlas's GPU memory with its mips, the bake's load cost (Metal, SwiftShader), the frame cost
  (Metal bench), the feet-on-shadow share from the figure's data with and without the oval, at a few settings.
- Review images in `output/armies-review/23-step-shadows/`: motion strips over a stride (march, run, fire) at 20 m
  and 63 m, today against per-step with and without the oval.

Out: making it the default (the owner judges first; a decision record then), the figure shadow map, a GPU bake.

## Approach

- **Bins, not points.** A clip of n steps baked in k = min(n, S) bins; bin j holds the steps from ⌊jn/k⌋ to
  ⌊(j+1)n/k⌋ − 1, its shape their average (at most a few samples a bin): with k = n each step is its own pose; with
  fewer bins the shape is the pose over that short span (march: 16 steps in 8 bins of 1/6 s). A man at step i draws
  bin ⌈(i+1)k/n⌉ − 1 (exact in float32 for the figure's step counts). `blend`: bin centres (j + ½)n/k apart, the
  two around (i + ½) mixed.
- **A 2D atlas, RG8, mips** (R the shape, G the soft bake, as today). A row of cells holds the facings of one bin;
  the rows of all roles' bins are stacked, in as many side-by-side blocks as keep the atlas near square and within
  4096 texels a side (WebGL2's guaranteed size is 2048; Metal and SwiftShader give 8192 or more: checked at load). A
  cell keeps today's size and 8-texel border, so the mips up to the third never bleed. No 2D array: the decal's shader
  stays GLSL ES 1.0-style and the cell maths is a few ALU.
- **The decal's shader:** `SH_STEPS` (and `SH_STEP_BLEND`) in `unitdecal.vert`/`.frag`; uniforms the bins a role,
  the first row a role and the rows a block. `uVATStep` set every frame while it is on.
- Pure functions with tests: the bin of a step (and its mirror against the shader's text), the atlas layout and its
  size, the cell of a (role, bin, facing).

## Acceptance

- `?ushstep` absent: the page as main (the shader's defines unchanged, the bake unchanged).
- The measurements and images above; the owner's judgement in motion; then a recommendation (default or not, which
  setting, the oval or not) and its decision record in a follow-up.
- `npm test`, `check:data`, `check-docs`, build: exit 0.

## Open questions

- Hold or blend: blend smooths the bins only where k < n; at 8 steps the march is 2 steps a bin.
- Fewer facings: 8 instead of 16 halves the memory; does the facings' blend hide the coarser step?
- Halt and fire move little at the feet: they could take fewer bins (one value a role is simple; a list later).
- The far zooms: the stepping is invisible past the default zoom; a per-step material only within a band (like the
  oval's) would keep main's cost there.

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
