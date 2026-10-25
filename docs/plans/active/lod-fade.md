---
status: active
last_reviewed: 2026-10-25
---

# Plan: the soldiers' LODs cross-faded, not switched (#188)

Asked by the owner (GitHub issue #188): "at transition between different zoom-threshold for a soldier model (simple
obj -> low mesh -> high mesh) the transition is not smooth which leads to a bit of 'flash into' effect". In their two
screenshots of the same columns either side of a switch the blocks are greyer and darker on one side, brighter and
more coloured (reddish and white specks) on the other. The switches as built: `docs/systems/look.md` ("The armies"),
`drawsNear` and `drawsTiny` in `src/look/units-data.ts`: a battalion wholly at one LOD by its centre's height on
screen, 48 px for the near LOD over the far, 12 px for the far over the tiny boxes, ±10 %. The decision this plan
makes: 0066.

## Measured first (main, ce2e731)

`?armies=20`, Metal, 1280 × 720, `?dof=0`, the clock at 80 s. The camera on a battalion at the radius that puts its
figure at the switch's height, the battalion forced to each side of the switch (inside the hysteresis, so the far
palette's crossfade and the far figures' growth are at 0 on both sides, as at the real switch), painted and through
the guard's white, black and coat masks. Per battalion: the block's mean colour (CIE Lab) over the tight box of its
men, the figure pixels' (coverage over 0.9), the coverage and the coat's share of it. French blue (side 0) and white
(side 1) uniforms, lines and columns.

| switch | battalion | coverage | block ΔE (ΔL*) | figure pixels ΔE (ΔL*) |
|---|---|---|---|---|
| near → far, 48 px | French columns (5, 9, 13) | −10 % | 1.4 to 2.0 (+0.3) | 7.1 to 7.6 (−2.5) |
| | French line (0) | −9 % | 0.5 (+0.1) | 4.7 (−2.8) |
| | white column (30), line (20) | −9 %, −7 % | 1.2, 0.4 | 3.2, 3.6 (−1.5, −3.3) |
| far → tiny, 12 px | French columns | +9 % | 2.9 (+2.7) | 13 to 14 (+10) |
| | white column, line | +3 %, +3 % | 2.6 (+2.5), 0.1 | 7.0, 1.6 |
| near → nearest, 100 px (per man) | all | −1 to −3 % | 0.3 to 1.4 | 1.5 to 3.0 |

A zoom sweep (24 frames over 0.7 to 1.43 × the switch, the block over its projected bounds, `?trample=0`) shows each
switch as one frame's step against the zoom's own drift between frames: near → far 1.2 to 1.35 ΔE (drift there 0.1
to 0.2), far → tiny 3.2 to 3.4 ΔE (drift 0.1).

**What causes them**: not the palette and not the light. The far palette and its lift start below 0.9 × the switch,
so they are 0 there; with the far rule off (`setFarRule(false)`) the tiny step is the same (figure pixels ΔL* +8.8).
They are the LODs' geometry and colour roles: the far LOD (243 triangles) is seen as 17 % less area than the near
(1,197) in the bake's own rasteriser (`seenArea`: 3,195 against 3,841 px), its facings 3.3 % of what shows against
7.2 % (the red epaulettes and collars), its skin 10 % against 6 % and its leather 7.7 % against 2.0 %; so it is
thinner, bluer and loses the red and white specks. The tiny boxes cover 3 to 9 % more and their mixed colours are
lighter and greyer than the far LOD's painted pixels (the coat's share of the pixels 0.16 against 0.28 on the French
columns). A gain on the tiny's colours does not match them: at 0.8 the French columns' block ΔL* goes to +0.2 but
their ΔE stays 2.9 (the chroma), and the white uniforms go darker (−0.6 to −1.0). So (a), matching the LODs' colour
at the switch, is not a palette or a gain; it would be new LODs or a new tiny calibration (Open questions).

One more pop found on the way, not a LOD's: at a camera radius of about 35 m the trodden ground's mask refits to a
larger box and the ground under a battalion steps (2.1 ΔE in the same sweep; gone with `?trample=0`).

## Scope

The near ↔ far and far ↔ tiny switches: no battalion changes LOD at once. The nearest LOD (per man already, its step
measured small) stays as it is. Not the LODs' own geometry or the tiny's calibration.

## Approach

- **A band round each switch** (`src/look/lod-fade.ts`): 0.8 to 1.25 × the switch's height, where a battalion draws
  both LODs and **each man is drawn at his own LOD by his own height on screen** (his root's distance, as the far
  palette's crossfade already measures it), switching at his own point in the band (a hash of his index in his battalion), over a
  short fade of his own (35 % of the band, on a log scale) by a **screen-door dither** (the 4 × 4 ordered pattern the
  tiny's coat mask uses): a pixel's threshold picks exactly one LOD for it, so every pixel of a man is drawn once, by
  one LOD. No alpha blending, no sorting, nothing hidden: a man is always drawn whole, part one LOD and part the other.
- **Cost bounded**: a battalion draws a second LOD only while one of its men can be in a band (its bounds' nearest and
  farthest points' heights on screen, `lodsDrawn`); a LOD's men outside it are dropped in the vertex shader (off
  screen, no fragments). Outside the bands one LOD a battalion, as before.
- **A split battalion** (its nearest men at the nearest LOD, its lists reordered) fades too: each man's index travels
  with him in his list (`aMan`), so his hash is the same whichever list draws him (review round 1: first built
  drawing a split battalion's other men all near, which popped its men inside the near band at the split's on and
  off).
- `?lodfade=0` restores the hard switch (the A/B).

## Acceptance

- The sweep's largest step between frames at each band no larger than about the zoom's own drift elsewhere in the
  sweep, against main's one-frame step; the frame strips for the owner (`output/armies-review/17-lod-fade/`, not in
  git).
- Tests: the fade weight, every pixel of a man drawn by exactly one LOD at every height, the LODs a battalion draws
  covering every man's (`test/lod-fade.test.ts`).
- The goldens against main: identical without `?armies` (the page's default draws no figures).
- Metal bench, main against the branch, at zooms inside each band and outside: frame p50 and GPU time (`?benchr`, a
  bench parameter added for it).

## Outcome

Built as above (decision 0066). Measured on this Mac (M1 Pro, Metal, preview builds; estimates for the owner's
laptop).

**The steps.** The same sweeps on the branch (24 frames, 0.7 to 1.43 × the switch, the block over its projected
bounds, `?trample=0`): the largest step between two frames, main → branch.

| band | French column (5) | white column (30) | the zoom's own drift elsewhere |
|---|---|---|---|
| near ↔ far | 1.35 → 0.56 ΔE (0.56 is the drift at the sweep's close end) | 1.02 → 0.47 | 0.1 to 0.5 |
| far ↔ tiny | 3.38 → 1.33 | 3.18 → 1.29 | 0.1 |

The near ↔ far step is gone into the drift. The far ↔ tiny change is spread over the band's frames (0.3 to 1.3 ΔE a
frame over about six frames instead of 3.4 in one): the total difference between the far LOD and the tiny boxes is
the larger one (above) and is spread, not removed. Frame strips for the owner, main and branch:
`output/armies-review/17-lod-fade/` (not in git; 1:1 crops of 1280 × 720 frames).

**The goldens** (`node tools/golden.mjs`, main against the branch): the page's default identical; with `?armies=20`
within tolerance (0.007 % and 0.005 % of the river and far-edge views' pixels differ: battalions inside a band).

**The cost, first build** (before review round 1; `node tools/bench-look.mjs <url>?armies=20&benchr=40,63,125,250
--gpu metal`, 1920 × 1080, two rounds,
both arms, the three yaws a zoom; frame p50 / GPU frame p50, ms):

| zoom (m) | main | `?lodfade=0` | no `discard` (vertex drop only) | branch |
|---|---|---|---|---|
| 40 | 8.78 / 12.81 | 8.88 / 12.93 | 9.00 / 13.15 | 9.04 / 13.21 |
| 63 (near band) | 9.60 / 13.51 | 9.58 / 13.45 | 9.67 / 13.79 | 9.73 / 13.84 |
| 125 | 9.81 / 12.94 | 9.78 / 12.88 | 9.95 / 13.15 | 10.10 / 13.29 |
| 250 (tiny band) | 6.28 / 9.18 | 6.20 / 9.25 | 6.52 / 8.95 | 6.61 / 9.15 |

About +0.15 to +0.35 ms a frame (2 to 5 %), at every zoom: at 20 a side some battalion is in a band at every zoom
(a column's men span a wide range of heights on screen, and a battalion draws its second LOD while any of them can
be in the band). `?lodfade=0` is main's cost; the dither's `discard` is about a third of it, the second LOD's vertices
the rest (triangles drawn +2 % at 40 m to +21 % at 250 m). A narrower band costs less and spreads less.

**Review round 1.** A split battalion (the nearest LOD) drew its other men all near, so its men inside the near
band popped near at the split's on and off: each man's index now travels with him in his list (`aMan`) and is
hashed instead of his instance, and a split battalion fades as any other (`battalionLods`). A battalion drawing one
LOD skips the per-man work (`uLodFade` 0). The far palette, lift and growth start at the band's foot (`FAR_FROM`). The
tiny's coat mask rescales the dither over its share. The cover is snapped to the dither's 16 levels instead of a flat
varying: flat cost 1.5 to 4 ms of GPU on ANGLE's Metal (measured: GPU p50 13.79 → 17.69 ms at 63 m with flat, 14.11
without), the snap changes no pixel (tested).

- **The split, fixed camera** (`?trample=0`, the battalion's nearest LOD forced on, `nearestPx` 100, and off, 1000;
  the frame's difference over the battalion's far third): battalion 5 at 66 px, split with none of its men at the
  nearest in view and its far end inside the band: the first build moved 0.9 % of those pixels (mean ΔE 0.27), the
  branch none (0.00), main none. At 26 m: 0.4 % (0.12) against none. Where men at the nearest are in view (15 to 17
  m), all three builds change the same pixels (the nearest LOD itself), and no man in such a view is under 80 px, so
  the band is off screen there. Sweeps through the split's on and off points (a deep column, an oblique line, zooming
  out and in): no step at either point on any build at the block's scale (0.05 to 0.9 ΔE, the zoom's own drift).
  Strips: `output/armies-review/17-lod-fade/split-ab-T5.jpg` (the difference × 8) and `split-sweep-T5-*.jpg`.
- **The guard** (`tools/guard.mjs --figures`, summer, Metal): the coat share at the widest view (the tiny band)
  unchanged (16.3 %, 18.9 %); at the default view 22.5 → 22.2 % and 17.8 → 17.3 % (the far ramps' start), the
  separations within 0.002.
- **The goldens**: the default page identical; `?armies=20` differs in the close view (one region, 6 % of its pixels:
  a line at 0.8 to 0.9 × the switch, now without the far palette and growth and inside the band); with `?lodfade=0`
  the branch is identical to main in every view.
- **The cost, final** (the same bench, main and the branch alternated, two rounds; frame p50 / GPU frame p50, ms):

| zoom (m) | main | branch |
|---|---|---|
| 40 | 8.93 / 13.10 | 8.82 / 12.84 |
| 63 (near band) | 9.76 / 13.93 | 9.56 / 13.58 |
| 125 | 9.86 / 13.00 | 10.05 / 13.48 |
| 250 (tiny band) | 6.31 / 9.28 | 6.60 / 9.18 |

−0.2 to +0.3 ms a frame, within the runs' spread; the per-man work skipped for single-LOD battalions took most of the
first build's cost.

**Review round 2.** A LOD's men it does not draw are dropped before their pose is fetched (one test a vertex). The
split's lists are written by a pure helper (`splitLists`, `nextLodBuffers`), tested to keep each man's matrix with
his index. The nearest LOD's shared source mesh never joins the faded meshes. Notes: the exact split relies on a
man's share being bit-identical in the three programs, and the snap absorbs the CPU's float64 against the shader's
float32 at a band's edge; `nearestPx` should stay at least `lodPx` × 1.25.

- **The close view's golden difference attributed**: a temporary build with the fade on and the far ramps back at 0.9
  (`FAR_FROM`) matches main in every view with `?armies=20` (close 0.000 %); so the close view's 6 % is the far
  ramps' new start (one line at 0.8 to 0.9 × the switch), not the fade.
- **The cost** (the same bench, alternated, two rounds; frame p50 / GPU frame p50, ms):

| zoom (m) | main | branch |
|---|---|---|
| 40 | 8.74 / 12.72 | 8.75 / 12.74 |
| 63 (near band) | 9.45 / 13.36 | 9.40 / 13.40 |
| 125 | 9.72 / 12.82 | 9.92 / 12.97 |
| 250 (tiny band) | 6.34 / 9.24 | 6.07 / 8.96 |

Within ±0.2 to 0.3 ms of main at every zoom, either way: the runs' spread.

## Open questions

- **Matching the LODs' colours** (the owner's call): the far LOD's facings and coverage (a re-bake with the epaulettes
  kept), the tiny's calibration against the painted far LOD rather than its role areas.
- **The trodden mask's refit** at about 35 m is a pop of its own (above).
