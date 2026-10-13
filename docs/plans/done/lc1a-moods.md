---
status: done
last_reviewed: 2026-10-13
---

# Plan: LC1a, moods as data

Track E, LC1 (`docs/plans/active/track-e-look.md` §LC), its first half. The colours of the light are scattered as
constants through the painter, the foliage, the meadow and the post pass. LC2 needs three moods side by side, and
LC1b needs to change how units take the light, so the colours first move into one table. **A refactor: the pixels
do not change.**

## Scope

- **`src/look/mood.ts`:** a `Mood` holds every colour of the light:
  - the sun (and its winter colour);
  - the shadow colour, its cool turn and its lift (`shadowOf`);
  - the mid band's cool tint and the lit band's warm lift (`paint()`, the meadow's lean copy);
  - the rim's and the backlight's tints;
  - the valley mist's shaded and lit air;
  - the haze (`atmos()`) and the clear colour;
  - the water's painted sky, its glint, and the far ring's river line that matches it (added in review);
  - the grade: the muted greens, the saturation, the split tone, the lift in the darks, the top's haze;
  - the vignette.

  `MOODS.golden` is today's look, and `?mood=<name>` picks one (only `golden` for now).
- The shaders read uniforms instead of those constants. `PAL` (`src/look/materials.ts`) comes from the mood.

Not in scope: any colour change (LC1b, LC2), the water's own body colours (not light).

## Acceptance

- `node tools/golden.mjs` (main against this branch, every camera): match.
- `npm test`; the readability guard against main: no change.
- `?mood=nope` names the moods in its error.

## Results (2026-10-13)

- Goldens, main against this branch: pixel-identical at all 8 cameras (0 differing pixels), on the default arm
  (software GL) and the leaf-card arm (`?trees=cards`, on Metal: software GL's Chrome crashed rendering main's
  card arm, a tool limit, not this change).
- `?mood=nope` stops the page with `?mood must be one of golden, not nope` (and `?mood=constructor` the same).
- `npm test`: exit 0 (19 files, 256 tests), at a load of about 5. An earlier run at a load of 15 (another session's
  headless Chrome) failed the soldiers' cost budget, a sim timing test this change does not touch.

## Review (`/code-review high`)

- **Round 1** (the first commit): no severe finding, so the review stops here. Fixed:
  - an inherited key (`?mood=constructor`) passed the mood check;
  - the water's sky, its glint and the far ring's river line were still constants;
  - a mood set after the materials were made would apply in part (`lockMood()` now refuses it);
  - the uniform names were written in four places (one table, `MOOD_COLOURS`, now gives the names and the values, so
    none is left unset);
  - the shadow's turn divided by its luma per pixel (now once, on the CPU);
  - a colour allocated a frame;
  - the moods' keys untyped;
  - the query string parsed twice.

  The goldens are pixel-identical again on both arms. Left: the grade's uniforms sent every frame (cheap), and the
  fragment uniform count on WebGL1 (an estimate, not measured: 11 more vec3 a material).
