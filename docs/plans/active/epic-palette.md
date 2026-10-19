---
status: active
last_reviewed: 2026-10-18
---

# Plan: an epic mood, after Tiny Glade

The owner (2026-10-18), after Tiny Glade's look: "can we make our theme a bit more contrasted, a bit more epic, but
someway so it's look more like 'epic version' of tiny glade". After the dark water (`docs/plans/done/dark-water.md`, #119).

## Scope

- **A new mood, `epic`** (`src/look/mood.ts`, `?mood=epic`), beside `temperate` (the default until the owner picks):
  the air cleared (the valley mist at about a third, little haze at the frame's top), a warmer sun against cooler,
  deeper shade, more of the world's own colour kept, the values spread about a mid grey, a darker frame edge.
- **Two new mood fields:** `mist` (the valley mist's amount) and `grade.contrast` (the values spread, the colour
  kept: `gradeOf`). The existing moods keep their look (1 and 0).
- **A warm autumn** (the mood's `autumn`, 1 in epic, 0 elsewhere): the crowns one family of warm pastels (peach,
  apricot, soft orange, butter: `foliage()`), the ground and grass a pale yellow straw then a warm brown, olive grass
  turning too and dry grass lighter than green (`groundSeason`), the clumps' blue-green tint warmed, the wheat standing
  tall through autumn, gold to a deep orange, until the plough (`meadow.vert`). The owner: "also we need to change
  grass and wheat color -> yellow orange brown shade as well in autumn".

## Approach

Mood data, and one line each in `mist()` and `gradeOf()`. A/B captures (temperate against epic: the default view in
summer and autumn, close on the river, the widest); the owner judges, then whether it becomes the default.

## Acceptance

- The owner's look check.
- The guard, coat and negatives checks under `?mood=epic` (armies stay the most saturated, readable first), the macro,
  water checks and goldens (unchanged under temperate); the bench (no cost expected). `npm test`,
  `node tools/check-docs.mjs`.

## Results

- First pass (contrast 0.22, the mist at a third, the ground's colour kept more): the owner, "it's over contrasted and
  it's not even orange and yellow" in autumn, with Tiny Glade's autumn (soft, airy, pastel crowns, pale straw). Now:
  contrast 0.05, the mist at 0.55, less of the ground's colour, a lighter frame edge, the warm autumn.
- Second pass: the owner, "still too saturated", "try first to have a similar palette" (Tiny Glade's). Measured
  Tiny Glade's frames against ours (median luma, chroma, the darkest and lightest 15 %'s mean colour): theirs are no
  less saturated (autumn chroma 0.40, ours 0.20) but their shadows keep the surface's own hue, a darker warm brown on
  orange ground, a dark green on grass (0.41,0.25,0.14 and 0.19,0.25,0.12), where ours turned blue-grey (0.24,0.25,0.29)
  against a warm light; and their greens are fresher. Now in epic: the shadow a near-neutral warm multiplier turned
  toward a warm brown, the mid band and the darks' split tone neutral, the shaded mist warm; the sun less yellow; the
  earth turn and the greens' muting mostly off (earth 0.35, green 0.3); the wheat and the autumn ground a softer
  straw-peach. Autumn chroma 0.40, summer 0.28 (Tiny Glade's 0.40 and 0.24).
- Third pass: the owner, autumn "in good direction", summer (and spring) to look like Tiny Glade's glade. Measured:
  its greens' hue 143-197° (blue-green), ours 61-85° (yellow-green), the same chroma (0.16); its shadows a deep blue
  (0.03,0.11,0.22), its lights a cool mint. So the shadow now turns with the season (two new mood colours,
  `shadowAutumn` and `shadowTurnAutumn`: cool over summer's greens, warm over autumn's oranges, as the leaves turn),
  the greens turn toward teal in summer and are muted as they turn (`grade.greenHue`, 60°, in `gradeOf`), the sun a
  neutral white, a little less saturation overall. Summer greens' hue now 118-160°.
- Fourth pass: the owner, early autumn "still a bit too saturated", summer "too cool, make it a bit warmer" (the
  old green was good: rebalance), winter "not cool enough, too saturated" (with Tiny Glade's winter). Measured: its
  winter's shadows a dark, near-neutral mauve (0.26,0.22,0.24), ours a pale saturated blue (0.55,0.58,0.65, mostly
  the clouds' shade on snow). Now: a winter shadow pair (`shadowWinter`, `shadowTurnWinter`) and the clouds' shade on
  snow a mood colour (`cloudSnow`, a soft lavender-grey in epic), the winter sun a cool white; the greens turned 25°
  (hue median 103°: the old 74°, the teal 126°) and less muted; the autumn pastels a quarter toward grey, the straw
  paler; the warm autumn turning sooner and the teal turn on clear greens only (a half-turned straw went lime).
- Fifth pass: early autumn "still too saturated". Measured: its HSV saturation (median 0.33) under Tiny Glade's autumn
  (0.52), so the loud part is the ground, a large even yellow under a strategy camera (Tiny Glade's frames are mostly
  crowns). The autumn ground and grass a calmer beige straw (0.75,0.71,0.61), the pink pastel a peach.
- Sixth pass: "better but still too light, the yellow too strong". The autumn ground and grass a mid-value warm tan
  (0.62,0.55,0.44: darker than the crowns, as Tiny Glade's), dry grass lifted less (the comb's streaks kept): ground
  luma median 0.73 to 0.60 at the widest, chroma 0.18.
- Seventh pass: early autumn "nice now"; summer "a bit saturated" (chroma 0.13 against the old summer's 0.11, its
  lights a yellow-lime the greens' muting does not count as green). A summer and winter saturation (`grade.summerSat`,
  0.85 in epic, × sat outside autumn: `gradeOf`), and the greens and the world's own colour a little more muted:
  summer chroma 0.11, autumn unchanged (0.18).

## Performance

After the rebase on main's terrain textures (#116), the owner saw 100-104 fps at a river view where main holds 120.
Bench (`tools/bench-look.mjs`, Metal, this Mac, `?benchat=-60,-20&season=0.8`, frame interval ms, interleaved): the
dark water as main; this branch +0.45 at the default zoom under either mood (+0.45 close under epic). Bisected by
swapping shaders and by test moods. Fixed: the season's shadow colours, saturation and the ground's season timing
blended once a frame on the CPU (`seasonLight`, `src/look/main.ts`), not per pixel; the warm autumn behind a
compile-time `#if` (a `mix(a, b, 0.0)` by a constant still computes `b`: no float folding); the blades' tip colours
once a frame; epic's faint contrast dropped (0.05); the greens' teal turn a matrix built once a frame (it took a sine
and cosine a pixel, of every material: about 0.25 ms). Now, epic against main: summer (0.3) default 10.19 against
10.22, autumn (0.8) 10.09 against 10.33, wide and close within 0.05.
