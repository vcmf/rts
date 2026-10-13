---
status: active
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
  - the grade: the muted greens, the saturation, the split tone, the lift in the darks, the top's haze;
  - the vignette.

  `MOODS.golden` is today's look, and `?mood=<name>` picks one (only `golden` for now).
- The shaders read uniforms instead of those constants. `PAL` (`src/look/materials.ts`) comes from the mood.

Not in scope: any colour change (LC1b, LC2), the water's own colours.

## Acceptance

- `node tools/golden.mjs` (main against this branch, every camera): match.
- `npm test`; the readability guard against main: no change.
- `?mood=nope` names the moods in its error.

## Results (2026-10-13)

- Goldens, main against this branch: pixel-identical at all 8 cameras (0 differing pixels), on the default arm
  (software GL) and the leaf-card arm (`?trees=cards`, on Metal: software GL's Chrome crashed rendering main's
  card arm, a tool limit, not this change).
- `?mood=nope` stops the page with `?mood=nope: no such mood (golden)`.
- `npm test`: the soldiers' cost budget (`test/soldiers.test.ts`, a sim timing test this change does not touch)
  failed locally at 18.6 ms against 12, with the machine at a load of 15 (another session's headless Chrome); CI
  runs it.
