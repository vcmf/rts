---
status: active
last_reviewed: 2026-10-14
---

# Plan: LC1b, the coats keep their colour

Track E, LC1 (`docs/plans/active/track-e-look.md` §LC), its second half, after LC1a (`docs/plans/done/lc1a-moods.md`).
The coats lose their colour to three warm tints stacked (`docs/research/colour-and-light-review.md`). Decision 0027
(proposed): units take the light's value, not its hue.

## Approach

- **White balance for units** (`paint()`, the `KEEP_HUE` path the army blocks and the figures use): the sun keeps its
  value and gives `units.tint` of its hue (the mood); the lit band's warm lift is scaled the same way.
- **The mist over units** is capped at `units.mist`.
- **The grade moves into the materials** (`gradeOf`, the last step of `atmos()`), where units take `units.grade` of
  it. The finishing pass cannot tell a Russian coat from the meadow, and its alpha carries the depth for the depth of
  field, so it cannot carry a unit mask. The grade's haze toward the top reads the point's height in the frame from
  `viewProjection`.
- **The bloom** now gathers from the graded scene. It takes the grade's highlight tint (`splitHi`) off before its
  per-channel threshold and puts it back, with the grade's saturation and its haze toward the top, so it gathers as
  from the ungraded scene. Otherwise the threshold amplifies the tint: winter's snow turned amber (measured below).
- **`tools/coat-check.mjs`:** the four coats as blocks at the note's two spots (the middle of the frame, the valley
  floor), the default view, summer, without the depth of field. Each block's lit top face (its pixels from the white
  and black mask renders, the 40 % after the brightest 10 %, which is the rim) must stay within 10° of the painted
  hue and at 70 % of its saturation or more; a white must not gain saturation.

## Acceptance

- `node tools/coat-check.mjs`: passes here and fails on main (its negative).
- The goldens of the ground at today's mood: the grade's move changes them only where the bloom meets the grade's
  non-linear parts (measured, below).
- `node tools/guard.mjs` against main, every view: no block worse beyond main's failures.
- `npm test`.

## Results (2026-10-14)

**The coat check** (lit top face; hue painted → seen, HLS saturation painted → seen):

| Block | Main | This branch |
|---|---|---|
| middle, France | 223 → 212, 0.58 → 0.23 | 223 → 222, 0.58 → 0.53 |
| middle, Russia | 133 → 89, 0.39 → 0.35 | 133 → 125, 0.39 → 0.36 |
| middle, Austria | 0.33 → 0.72 (cream) | 0.33 → 0.11 |
| middle, Britain | 3 → 20, 0.62 → 0.37 | 3 → 7, 0.62 → 0.47 |
| valley, France | 223 → 202, 0.58 → 0.05 | 223 → 222, 0.58 → 0.47 |
| valley, Russia | 133 → 73, 0.39 → 0.17 | 133 → 135, 0.39 → 0.27 |
| valley, Austria | 0.33 → 0.73 (cream) | 0.33 → 0.05 |
| valley, Britain | 3 → 22, 0.62 → 0.57 | 3 → 7, 0.62 → 0.46 |

Main fails all 8; this branch passes all 8 with `units` = { tint 0.25, mist 0.04, grade 0 }. The valley's Russian green
is at the bound (0.27 against 0.273 needed): a mist cap of 0.06 failed it at 0.26, 0.12 failed three coats, 0 passes
with margin. The first selection (the brightest 40 %) took the warm rim along the edges for the face. Pairs (not
committed; `scratch/compare/coats/` in the main checkout): main beside this branch at both spots.

**Readability guard** against main: passes at every view. Default view: 45 of 48 blocks separate better, and three
that failed on main now pass (sunlit-slope and flat Britain, open-low Russia, summer); none newly fails. Cover view:
22 of 24 better, road Austria in winter now passes. Crops view (`--seasons summer,autumn,winter`): Austrian white on
the stubble (#78) now separates in summer and autumn (0.14 to 0.25, main 0.02 to 0.09); in winter one block of the
two still fails, as on main, but lower (0.004 against main's 0.072).

**Goldens** (main against this branch, software GL): with the grade off the frames are identical (the units' changes
do not reach the ground). With it on:
- The grade alone, moved, left the bloom gathering from the graded scene: winter's camera differed by a mean of 18
  (the snow turned amber), the others by 3 to 4.
- With the bloom taking the tint off and putting it back: summer within 0.2 to 0.6 of a level, with 1 or 2 of 16
  regions a camera just over the tolerance.
- Winter: a mean of 8.4 in its top-left region, slightly whiter snow toward the frame's top (blue 192 to 205): the
  grade's split tone depends on a pixel's value, which the bloom used to raise before the grade and now cannot. Left
  as is: the art bible wants white snow (#62).

`npm test`: exit 0 (19 files, 256 tests).
