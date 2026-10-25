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
  palette's crossfade already measures it), switching at his own point in the band (a hash of his instance), over a
  short fade of his own (35 % of the band, on a log scale) by a **screen-door dither** (the 4 × 4 ordered pattern the
  tiny's coat mask uses): a pixel's threshold picks exactly one LOD for it, so every pixel of a man is drawn once, by
  one LOD. No alpha blending, no sorting, nothing hidden: a man is always drawn whole, part one LOD and part the other.
- **Cost bounded**: a battalion draws a second LOD only while one of its men can be in a band (its bounds' nearest and
  farthest points' heights on screen, `lodsDrawn`); a LOD's men outside it are dropped in the vertex shader (off
  screen, no fragments). Outside the bands one LOD a battalion, as before.
- **A split battalion** (its nearest men at the nearest LOD, its lists reordered) draws as before: the near LOD for
  all its other men (`uLodFade` 0 for its meshes, set as each binds the shared material).
- `?lodfade=0` restores the hard switch (the A/B).

## Acceptance

- The sweep's largest step between frames at each band no larger than about the zoom's own drift elsewhere in the
  sweep, against main's one-frame step; the frame strips for the owner (`output/armies-review/17-lod-fade/`, not in
  git).
- Tests: the fade weight, every pixel of a man drawn by exactly one LOD at every height, the LODs a battalion draws
  covering every man's (`test/lod-fade.test.ts`).
- The goldens against main: identical without `?armies` (the page's default draws no figures).
- Metal bench, main against the branch, at zooms inside each band and outside: frame p50 and GPU time.

## Outcome

To be filled in with the bench and the after-sweeps.

## Open questions

- **Matching the LODs' colours** (the owner's call): the far LOD's facings and coverage (a re-bake with the epaulettes
  kept), the tiny's calibration against the painted far LOD rather than its role areas.
- **The trodden mask's refit** at about 35 m is a pop of its own (above).
- A split battalion that stops being split while its far men are inside the near band switches them at once (its
  lists were not in the battalion's order); rare (a deep battalion near the camera) and small.
