---
status: active
last_reviewed: 2026-10-14
---

# Plan: LC2 and LC3, the temperate mood becomes the default

Track E, LC2 and LC3 (`docs/plans/active/track-e-look.md` §LC). LC2's candidates were judged by the owner on a
throwaway page (moods.html on the LC2 branch, never merged): the four moods blind on the full map with the
generated trees and the army blocks, the camera and the season carried over between them. The candidates: `overcast`
(the film), `dusty` (the ochre stills), `autumn` (the farm), and today's `golden` as a control. The owner: dusty and
autumn "too similar, too yellow-orange", overcast "too grey", golden "too colourful"; asked for golden "a bit cooler,
less colourful, but not grey": `temperate`, added, and picked (2026-10-14).

## Scope

- **The earth** (LC2): a mood's shift of the world's own colours, `earth` { tint, chroma, amt }, on the albedo before
  the light (`earthOf` in the painter, and the meadow's own paint step), not on units.
- **`temperate`** in `src/look/mood.ts`, and the default mood (`?mood=` still picks `golden`, the look up to here).
  The other candidates are not kept.
- **Its coats:** the coat check passes for it, the valley's Russian green included (it drifted to teal, hue 155, in
  the first trial).
- **The coat check's far spot** (LC2): at the widest view, 135 m beyond its target, so a mood is checked where the
  distance haze is.
- **A decision record** (the default mood replaces the art bible's "golden morning (default)"), the art bible §4
  (palette, light) rewritten, `docs/systems/look.md`, the track plan's LC2 and LC3 rows.
- Not in scope: bounced light (LC4, LC5), trees (LC6, LC7), the ground's surface (the ground's PR 2).

## Approach

- `earthOf(a)`: the colour toward its luma × `tint`, with `chroma` of its own chroma kept, by `amt`; `golden` has
  `amt` 0 (its goldens unchanged under `?mood=golden`).
- The default: `setMood(params.get('mood') ?? 'temperate')`.
- The teal green: measured first (the sun group's change, LC2's bisection), then the smallest change that brings it
  within the bound without moving the world's look.

## Acceptance

- `?mood=golden` on the branch against main: the goldens match at the 8 views.
- The default (temperate) against main: `tools/guard.mjs --base` main, the views start, cover and crops, summer,
  autumn and winter: no new failure; `tools/coat-check.mjs` 8 of 8 plus the far spot.
- The frame's cost: the bench against main (the earth costs a few instructions a pixel).
- `npm test`, `node tools/check-docs.mjs`.

## Results

Main at 71ece8a.

- **`?mood=golden`** against main: the goldens match at the 8 views (every region 0.000 %).
- **The guard,** the default (temperate) against main, start, cover and crops, summer, autumn and winter: 132 blocks,
  116 separate better, 16 less. One block failing on main now separates: the Austrian white in the village in
  winter, 0.101 against main's 0.062.
- **Two fail, accepted by the owner** (2026-10-14: "Austrian white coat in winter is always a hard case, just
  accept"). Both are the Austrian white on winter snow:
  - in a cloud shadow, 0.090 against main's 0.103;
  - on a snowed stubble field, 0.080 against 0.115.

  Temperate's snow is whiter. On main the snow is warmed toward peach (the warm sun, and the mist of #62), and that
  tint set it apart from the neutral coat. Recorded with #78, the Austrian white against pale ground, for the units'
  readability work (L4).
- **The coat check:** 12 of 12, the far spot included. The valley's Russian green measures hue 149 against the
  painted 133, inside the 20° bound. It drifts toward teal under the less warm sun (LC2's bisection: the sun's
  group); not tuned further.
- **The frame's cost** (`tools/bench-look.mjs`, the GPU frame's median, Metal, one run each): +0.07 to +0.23 ms
  across the 9 cameras, the most at the widest (13.90 against 13.67). It is the earth's few instructions a pixel,
  slightly above main's own spread between runs (up to 0.13 ms, ground-light's bench).
- **`npm test`:** exit 1 on the soldier layer's timing budget alone (`test/soldiers.test.ts`, 12.25 ms against 12,
  at a load average of 12); run alone it passes (exit 0, 12 of 12). The PR changes no sim code.

## Review

- **Round 1** (one severe): the far ring's river line went through the earth (`paint()`) and the tile's water did not,
  a colour step at the tile's edge under temperate (golden's earth is 0, so its goldens could not see it). The water's
  ramp, its winter colour and the ice now take the earth too (`shore.glsl`), so the river sits in the 60 % world and
  meets the far line. The far spot's column now runs across the view (along it the blocks stacked on screen).

## Left

- `earthOf` runs per pixel for a value fixed per map: baking it into the macro colour and the foliage's colour
  uniforms would save the measured +0.07 to +0.23 ms, a change of its own.
- `earthOf` and the grade's green tint share one expression, in GLSL twice and in `gradeColour` once.
