---
status: active
last_reviewed: 2026-10-30
---

# Plan: the division scale and the formations

Track S's step before U3: the sim at decision 0076's scale (`docs/proposals/division-scale.md`) and the formations'
strengths and weaknesses (`docs/proposals/formations.md`), settled with the owner on 2026-10-30. Where the two
proposals and this plan differ, the proposals hold. Three PRs into `epic/sim-engine`, each with `/code-review high`.

## A. The traits table (a refactor)

- **Scope:** each shape's numbers in one ruleset block, `traits` (hits taken from the front, the flank and the rear,
  melee, brace), with a type's defaults its shapes override field by field; `allRound` for a shape with no flank;
  compiled to a flat row per shape; read only through `src/sim/traits.ts`; their ranges guarded.
- **Approach:** today's `fire.depth`, `melee.strength`, `exposure` and `braced` move into the table with the same values.
- **Acceptance:** `tools/state-hashes.ts` gives identical state on every page scenario before and after (3000 ticks);
  the goldens move only with the ruleset's hash; the guards' tests; the system docs on the table.

## B. The scale

- **Scope:** units of 240, 80 and 4 guns (`menPerFigure` 25 for the page); muskets 100 m (close 50, bayonet 15),
  roundshot 1 km, canister 300 m, the guns' minimum range (15 m, as bayonet range); the other distances by their group
  (`docs/proposals/division-scale.md` § 5).
- **Acceptance:** the calibrations meet their targets at the new distances (§ 7); the S1e battle side 1's in 15–22
  minutes and the valley the same battle; every bench case's invariants.

## C. The formations

- **Scope:** the traits' new values (`docs/proposals/formations.md` § 2), bracing by the side struck (§ 2a), the thin
  line for British line infantry, the square that cannot move, the changes' times (§ 3), and the unit's info box (§ 5).
- **Acceptance:** scenarios B-11 to B-20, each with its test or calibration case.
- **Plan:** `docs/plans/active/formations.md` (three slices: the table's new fields, the values, the thin line).
