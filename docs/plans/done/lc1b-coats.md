---
status: done
last_reviewed: 2026-10-14
---

# Plan: LC1b, the coats keep their colour

Track E, LC1 (`docs/plans/active/track-e-look.md` §LC), its second half, after LC1a (`docs/plans/done/lc1a-moods.md`).
The coats lose their colour to three warm tints stacked (`docs/research/colour-and-light-review.md`). Decision 0027
(proposed): units take the light's value, not its hue.

## Scope

How units take the light (the painter's `KEEP_HUE` path), where the grade runs, the bloom that follows it, and a
check of the coats' colour. Not in scope: the world's colours (LC2), the coats in a crown's deep shade (#63, L4).

## Approach

- **White balance for units** (`paint()`, the `KEEP_HUE` path the army blocks and the figures use): the sun keeps its
  value and gives `units.tint` of its hue (the mood); the lit band's warm lift, a cast, is scaled by that share.
- **The mist over units** is capped at `units.mist`.
- **The grade moves into the materials** (`gradeOf`, the last step of `atmos()`), where units take `units.grade` of
  it. The finishing pass cannot tell a Russian coat from the meadow, and its alpha carries the depth for the depth of
  field, so it cannot carry a unit mask. The grade's haze toward the top reads the point's height in the frame from
  `gl_FragCoord` over the target's height (`uViewH`).
- **The bloom** now gathers from the graded scene. It takes the grade's highlight tint (`splitHi`) off each tap before
  its per-channel threshold and puts it back, with the grade's saturation and its haze toward the top, so it gathers
  as from the ungraded scene. A per-channel threshold on the graded scene amplifies the tint (winter's snow turned
  amber, measured below). A unit, not graded, blooms a little cool (its own highlights; the ground round it does not
  change, checked). A threshold on value instead, tried in review, kept units neutral but moved the ground's bloom
  far more (summer about 0.8 a level on Metal, 3 under software GL; winter up to 15).
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

## Results (2026-10-14, after review round 1)

**The coat check** (lit top face; hue painted → seen, HLS saturation painted → seen):

| Block | Main | This branch |
|---|---|---|
| middle, France | 223 → 212, 0.58 → 0.23 | 223 → 222, 0.58 → 0.53 |
| middle, Russia | 133 → 89, 0.39 → 0.35 | 133 → 125, 0.39 → 0.36 |
| middle, Austria | 0.33 → 0.72 (cream) | 0.33 → 0.22 |
| middle, Britain | 3 → 20, 0.62 → 0.37 | 3 → 7, 0.62 → 0.48 |
| valley, France | 223 → 202, 0.58 → 0.05 | 223 → 222, 0.58 → 0.47 |
| valley, Russia | 133 → 73, 0.39 → 0.17 | 133 → 138, 0.39 → 0.28 |
| valley, Austria | 0.33 → 0.73 (cream) | 0.33 → 0.06 |
| valley, Britain | 3 → 22, 0.62 → 0.57 | 3 → 7, 0.62 → 0.47 |

Main fails all 8 blocks in the table's run. With the column laid by `blocksAt` (review round 2) main fails 7: its
middle British red then measures hue 12, 9° off, inside the 10° bound. This branch passes all 8 with `units` = { tint 0.25, mist 0.04, grade 0 }. The mist cap set the
margin: at 0.06 the valley's Russian green failed (0.26 against 0.273), and at 0.12 three coats failed. The face
selection matters too: the first one (the brightest 40 %) took the warm rim along the edges for the face. Pairs (not
committed; `scratch/compare/coats/` in the main checkout): main beside this branch at both spots.

**Readability guard** against main: passes at every view.
- **Default view:** 45 of 48 blocks separate better. Three that failed on main now pass (sunlit-slope and flat
  Britain, open-low Russia, summer); none newly fails.
- **Cover view:** 22 of 24 better; road Austria in winter now passes.
- **Crops view** (`--seasons summer,autumn,winter`): Austrian white on the stubble (#78) now separates in summer and
  autumn and on one of the two winter blocks. 23 of 24 blocks are better.

**Goldens** (main against this branch, software GL): with the grade off the frames are identical, so the units'
changes do not reach the ground. With it on:
- Moving the grade alone left the bloom gathering from the graded scene: the winter camera differed by a mean of 18
  (the snow turned amber), the others by 3 to 4.
- With the bloom taking the tint off and putting it back: the summer cameras differ by 0.2 to 1.0 of a level in their
  worst region, with 1 to 3 of 16 regions a camera over the tolerance.
- Winter: up to 6.5 in its top-left region, slightly whiter snow toward the frame's top. The grade's split tone depends
  on a pixel's value, which the bloom used to raise before the grade and now cannot. Left as is: the art bible wants
  white snow (#62).

**Cost** (`?bench=meadow`, the meadow arm, which is the default page; Metal proxy, two runs each, interleaved with
main, at a load of about 4): close 4.22 against 4.21 ms, default 5.49 against 5.48 ms, the widest zoom 7.93 against
7.51 ms. The grade, now per fragment rather than once a pixel, costs about 0.4 ms at the widest zoom and nothing
measurable nearer.

`npm test`: exit 0 (19 files, 256 tests), after round 1 too.

## Review (`/code-review high`)

- **Round 1** (f716411): two severe findings.
  - **A halo on units:** the bloom divides every tap by the grade's tint, so units (not graded) bloom blue. Checked:
    the ground round a white block does not change, and the block's own highlights bloom a little cool. A threshold
    on value (tried) kept units neutral but moved the ground's bloom far more (up to 15 in winter under software GL),
    so the division stays, recorded above.
  - **The grade per fragment, not measured:** measured now (Cost). The top haze reads `gl_FragCoord` again (cheaper
    than projecting each point), and the lit band's warm lift stays a share for units (a grey lift washed the
    Russian green to hue 145).

  Also fixed:
  - the stale docs (the fused grade in `docs/systems/look.md` and `post.ts`);
  - the coat check overriding a URL's `?dof`;
  - the coat check's moods (it checks the URL's `?mood`, to run per mood).

  Left:
  - the clear colour, no longer graded: the top-down camera shows no sky, and the far-edge golden passes its region;
  - the coat check's copy of the guard's block steps.
- **Round 2** (a2ea5a7): one severe finding. Round 1's commit carried 44 stray renders (about 65 MB) in two folders
  named `--view cover` and `--view crops …`: a shell loop passed the guard's flags as one argument, which the guard
  took for its out dir (and ran the default view). They are removed, and the guard now rejects an argument it does
  not know. The Cover and Crops results above come from the later runs, each view a command of its own. Also fixed:
  - the clear colour graded as the materials grade the frame's top (`gradeColour`, `src/look/mood.ts`);
  - the bloom's division by the tint done once, not per tap;
  - the coat check's blocks laid by `blocksAt`;
  - a white must also keep its lightness (0.6 or more);
  - the system doc's front matter (decision 0027).

  Left: the bloom's blue cast on a unit's own highlights and its undoing of the grade by `splitHi` alone (both
  measured above). The valley's Russian green sits near its bound (0.27 to 0.28 against 0.273, run to run).
- **Round 3** (5e97492): no severe finding, so the review stops here. Fixed:
  - the clear colour follows the grade's switch;
  - a white must also not take another hue (60° off its own) over a saturation of 0.15;
  - the art bible's line on the finishing pass (the grade is in the materials now);
  - this plan's missing Scope section and its count of main's failures.

  Tried: units taking the grade's haze toward the top whole (a depth cue, not a cast). It cost the valley's coats,
  near the frame's top, about a third of their saturation (France 0.47 to 0.37, three coats failed). Reverted:
  pillar 1 ranks first (decision 0027, Consequences).

  Left: the bloom's cool cast on a unit's own highlights; `gradeColour` copies `gradeOf` without a test; the coat
  check's copy of the guard's steps.
