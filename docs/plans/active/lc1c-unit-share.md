---
status: active
last_reviewed: 2026-10-14
---

# Plan: LC1c, units take more of the air

Track E, LC1 (`docs/plans/active/track-e-look.md` §LC), a follow-up to LC1b (`docs/plans/done/lc1b-coats.md`). The
owner accepted decision 0027 as the rule (2026-10-14) and, judging the two ends side by side, asked for the middle:
with LC1b's shares (`units` = { tint 0.25, mist 0.04, grade 0 }) the coats in the valley read as pasted onto the
scene, with the full light (1, 1, 1) the blue, the green and the white wash into the ground.

## Scope

The `golden` mood's `units` shares, the units' value under the mist and the grade (the painter), the coat check's
bounds, decision 0027 (accepted, its numbers), the docs that quote them. Not in scope: the LC2 candidates (each sets its own shares under the same check).

## Approach

- **The shares, by eye then measured.** Five settings rendered at the coat check's two spots (the valley and the middle):
  the full light, three in-between, LC1b's. Chosen: `units` = { tint 0.4, mist 0.10, grade 0.15 } (A, by eye): the valley
  blocks take some of the air and fade a little with it, every coat still names its colour. B (0.5, 0.15, 0.25)
  turned the white cream and the green olive; C (0.4, 0.15, 0) kept the hues but lost more saturation in the valley
  than A, with no gain in how the blocks sit.
- **Units keep their value under the mist and the grade** (`keepValue` in `src/look/shaders/painter.glsl`, the
  `KEEP_HUE` path): the two turn a coat's colour toward the air, not its value. A first run with A as it was failed the
  guard on two Austrian whites that separate on main (the valley in autumn: 0.087 against main's 0.110; a stubble
  field in winter: 0.094 against 0.112): the bright mist and the grade's lift took the white's value toward the
  ground behind it. Lowering the mist alone (0.07) or the grade alone (0) did not clear it. With the value kept, both
  pass, with a margin (0.125, 0.107), and the valley white in summer, failing on main (0.088), now separates (0.102).
  The shares then: { tint 0.4, mist 0.10, grade 0.2 }.
- **The coat check's bounds follow the owner's choice.** LC1b's (hue within 10°, saturation at 0.7 of the painted)
  were a first safe setting, met only by the pasted-on look: the Russian green, a dark coat near the meadow's hue,
  moves first. New bounds: hue within 20°, saturation at 0.45 of the painted or more; the white's rule is unchanged.
  The check still fails the full light (5 of 8 blocks), and B on the valley green's hue (22°).
- **The readability guard** decides readability: no block that separates on main may fail (`--base`), at the three
  views (start, cover, crops) and the three seasons.

## Acceptance

- `tools/coat-check.mjs` passes on the branch with the new bounds, and fails the full light (as rendered before the
  value is kept, a scratch mood).
- `tools/guard.mjs --base` main, the views start, cover and crops, summer, autumn and winter: no new failure.
- The goldens: the ground unchanged (units only); the army blocks are not in the goldens.
- `npm test`, `node tools/check-docs.mjs`.
- Decision 0027 accepted with the new shares; `docs/systems/look.md` and the track plan's LC1 row updated.

## Results

Measured at the final shares, { tint 0.4, mist 0.10, grade 0.2 }, with the value kept; main at 438c7f2. Sheets in
`scratch/compare/decision-0027/` (git-ignored): the full light, the in-between settings, LC1b.

- **The coat check** passes 8 of 8. The lit tops (hue, saturation as painted → seen):

  | Coat | Middle | Valley |
  |---|---|---|
  | France | 223 → 221, 0.58 → 0.48 | 223 → 221, 0.58 → 0.34 |
  | Russia | 133 → 117, 0.39 → 0.33 | 133 → 121, 0.39 → 0.19 |
  | Austria (white) | sat 0.28, light | sat 0.12, light |
  | Britain | 3 → 8, 0.62 → 0.47 | 3 → 11, 0.62 → 0.41 |

  The binding coat is the valley's Russian green (0.19 against the bound's 0.18). The full light, with the new
  bounds, fails 5 of 8 (the green's hue at both spots, the white, the valley blue).
- **The guard** against main: start, cover and crops, summer, autumn and winter: ok, no block fails that separates on
  main (132 blocks). The valley's Austrian white in summer, failing on main (0.088), separates (0.102). Taking more of
  the air costs some separation, as expected: 59 blocks separate better, 73 a little less, the most by 0.030 (a white
  on a stubble field, 0.205 against 0.235, still twice the bound).
- **The goldens:** a match at the 8 views, every region 0.000 % (units only).
- **`npm test`:** the run failed the two sim timing budgets (`test/formations.test.ts`, `test/soldiers.test.ts`) at a
  load average of 15 to 29; run alone, at the same load, both pass (41 of 41). The PR changes no sim code.
