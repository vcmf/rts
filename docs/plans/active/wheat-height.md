---
status: active
last_reviewed: 2026-10-13
---

# Plan: standing wheat under a soldier's chest (decision 0026), and #63 to L4

Track E, L7 (`docs/plans/active/track-e-look.md`). The owner (2026-10-13), after the investigation of #63.

## Problem

- The scatter's wheat stood 1.65 to 2.1 m tall (the pack's 1.1 m tuft scaled 1.5 to 1.9), taller than a soldier;
  the meadow (#74) made the field denser and the guard's wheat blocks lost about a seventh of their visible pixels.
- #63 (a dark coat losing its separation in a crown's shade with the leaf cards) turned out not to be the cards'
  shadow's shape: dappling the cards' shadow barely moved it (0.071 to 0.073); in a crown's deep shade a dark coat
  on shaded ground has too little contrast, the army side's to fix.

## Scope

- Every wheat tuft's scale clamped where the scatter adds it (`add()`, `src/look/nature.ts`), so neither the
  meadow's field nor the old lattice (`?meadow=off`, WebGL1) stands taller than `WHEAT_HEIGHT_MAX`
  (`src/look/meadow-spec.ts`); decision 0026.
- #63 moved to L4 (GitHub label, the track plan's L4 section).

## Acceptance

- `npm test`; `node tools/guard.mjs` against main, with and without `?trees=cards`: no new failing block.
- The wheat blocks whole again (their visible pixels).
- No new cost: the field's density unchanged (the tufts only shorter).

## Results (2026-10-13)

`node tools/guard.mjs` against main, each arm against main's same arm:

| Arm | `wheat.France` (main) | `wheat.Russia` (main) | visible pixels of `wheat.France` (main) | guard |
|---|---|---|---|---|
| default (the meadow) | 0.098 (0.090) | 0.177 (0.157) | 2188 (1782) | ok |
| `?trees=cards` against main's default | 0.073 (0.090) | 0.172 (0.157) | 2187 | ok (`fails*`: main fails it too) |
| `?meadow=off` against main's `?meadow=off` | 0.101 (0.098) | 0.178 (0.169) | 2242 | ok |

- The wheat blocks show whole again. `wheat.France` is still under the 0.10 threshold on the default page (0.098) and
  with the cards (0.073, #63, now L4's); with the meadow off it passes (0.101).
- The field's density is unchanged (0.85 m cells; a 0.7 m cell was tried and dropped: about half again the 408-triangle
  tufts, unmeasured), so no cost is added.

## Review (`/code-review high`)

- **Round 1:** severe: the cap covered the meadow's field only, so `?meadow=off` and WebGL1 still drew 2.1 m wheat
  (now one clamp in `add()`, every placement). Also: no plan (this one); the claims on the guard not recorded (the
  table); a stale cell comment; the denser cell unmeasured (dropped); the decision silent on it; #63 missing from
  L4's section and the change log; 0026 missing from the system doc's front matter; tuning values copied into the
  docs (linked to the constant now). All fixed.
