---
status: active
last_reviewed: 2026-10-30
---

# Plan: the formations (division scale, PR C)

Step C of `docs/plans/active/division-scale.md`: each formation's strengths and weaknesses as
`docs/proposals/formations.md` sets them (§§ 2, 2a, 3, 5), on the traits table that PR A built (`src/sim/traits.ts`).
Where the proposal and this plan differ, the proposal holds. Three slices, each its own commit series and
`/code-review high`; C1 and C2 make one PR, C3 another (it changes the engine's block, which the look reads too).

## C1. The table's new fields (a refactor)

- **Scope:** the fields § 5a names that the table does not hold yet, each neutral or today's value:
  - `fire`: the share of a block's fire, multiplying its hit chance (1);
  - `shock`: morale shocks taken, multiplying every shock and the drain on its bar (1);
  - `brace` by side, `{ front, flank, rear }`, blended by the side struck's weights (today's single number on every side);
  - `flankShock`: the charge's shock from the flank, as a multiple (1);
  - `flankFrom`: the sector blend's angle from the front, by shape (today's 45° on every shape, `sectors.blend`);
  - `moves`: whether it may be given a move (true).
- **Approach:** the compiled row gains its fields. `braceOf(w, j, side)` takes the charge's side weights, as `sideOf`
  gives them in `src/sim/melee.ts`; a charger turns from a refuge only when it is braced 1 on every side
  (`bracedAllRound`). While changing, the shock and the flank shock are the higher of the two shapes', the fire the
  lower (§ 3). A move or a wheel is refused to the player when the shape the formation will stand in when it is reached
  cannot move, and held in that shape if it gets one anyway (a plan's, or one kept from before a square formed against
  cavalry); a formation out of the fight runs and re-forms whatever its shape. The guards are § 5a's: fields > 0,
  bracing in 0..1, a shape that cannot move is neither the type's start shape nor one it charges from, a refuge is
  braced 1 on every side, and the guards on one shock (contagion, a second enemy) count the shapes' shock.
- **Acceptance:** `tools/state-hashes.ts` identical on every page scenario (3000 ticks); the guards' tests; the system
  docs (`docs/systems/formations.md`, `docs/systems/melee.md`) on the new fields.

## C2. The values, the attack column, the square that holds, the info box

- **Values:** § 2's rows on the line, the attack column, the square and the march column. § 2a's bracing (the column
  0.5 / 0.25 / 0, its flank shock × 0.7). § 3's change times.
- **The attack column:** one section wide, four deep: 20 files × 12 ranks, which replaces today's column of divisions,
  two sections wide. Its depth is what roundshot strikes, the item left open by PR B's artillery calibration.
- **The square:** a move order is refused, by the same path as a change of shape refused in melee (the order's
  result). It can still face about and change shape.
- **Fire:** the block's geometry already cuts a column's fire (its rear sections are masked, `clearShare`). `fire`
  multiplies what remains, so the line's 1 and the column's 0.3 are the shares of the line's fire that the shapes
  give in total; the calibration (B-11) sets the column's value so that the total, geometry and trait together, is
  about 0.3.
- **The info box:** § 5's lines for the selected unit, on the sim page (`src/app/`), every number read through the
  accessors that the sim uses (`traits.ts`, `levelOf`, the morale bar, `threatWeights`), none recomputed.
- **Scenarios:** B-11, B-14, B-15, B-18, B-19 and B-20 as tests or calibration cases. B-12 and B-13 need the assault and
  close volleys, so they come with U3 (its closing model, on the branch `sim/u3-closing`). The artillery calibration's two column checks
  are retried at the new column.
- **Acceptance:** the scenarios; the existing calibrations (C-01, the charges) still meet their targets with the line's
  values unchanged; the S1e battle still decided in its window.

## C3. Formations a unit may have, and the 2-rank line

The owner (2026-10-30): the thin line is not a British unit type but a formation a unit may be given or not, later by
research or a general's ability. So each formation of a type is enabled or disabled per unit, and the 2-rank line is
one more formation of line infantry, disabled unless enabled.

- **Enabled formations:** each unit holds the set of its type's shapes it may form (a bit per shape, world state,
  hashed and saved). A type names the shapes enabled by default (`UnitType.enabled`; every shape if it names none);
  `debug-spawn` may give the set (`forms`); `enable` turns one on or off on a unit, whatever it is doing (for the page
  and tests now, research and generals later). A `form` into a disabled shape is refused ('formation not enabled'),
  one queued before it was disabled dropped; the standing behaviour forms its refuge only when it is enabled.
  Disabling the shape it stands in leaves it there until it forms another. Done: `test/enabled.test.ts`; no page
  scenario's state moves but the new column (`tools/state-hashes.ts`, the column left out: identical).
- **The 2-rank line** (`thinLine`, off by default): fire 1.5, hits 0.8, shock 1.25, melee 0.7, flank shock × 1.25,
  line ↔ thin line in 20 s.
- **Engine:** a shape may set its own block (`block: { files, ranks }`, the same men per section: 60 as 30 × 2). The
  slots keep their order. A section's men fill the shape's grid, so `occupied`, the slot positions, the fire geometry's
  block and the soldier layer read the shape's grid, not the type's. A change into or out of it passes through
  the regridding as a change of spacing does (`step`, the column of route's).
- **Order:** the enabled set first (no new shape, the look untouched), then the 2-rank block.
- **Scenarios:** B-16, B-17.
- **The look:** `src/look/world/armies.ts` and `arms.ts` read the type's block (`geometry.files`, `ranks`) for every
  shape. Once a shape may have its own, they must read the shape's for a unit in it; the owner passes this to the
  look track before the 2-rank block lands.

## C2's results

- **The calibrations:** C-01 unchanged (the line's values are; its table identical). The artillery's six checks pass,
  the two column checks with them: the attack column loses men 3.2× as fast as a line in 5 minutes (10.4 a minute
  against 3.2) and breaks in 10 in every seed (PR B's two failures: 1.8×, and no break). The charges pass; the line struck head on breaks in 71% over 200 seeds (68% over 50:
  the line is flanked only from 80° now, so a regiment over its end strikes more front).
- **The S1e battle:** side 1's at 17:11 at the page's seed, as before.
- **The scenarios:** B-11, B-14, B-15, B-18, B-19 and B-20's pace pass. **B-20's order does not:** the disorder model
  reads the lag across a front, so a line meeting a straight edge keeps its order and a deep column crossing it loses
  all of its own (the old column of divisions did the same). Left for a disorder model that reads depth, with the
  dressing of a line; an expected failure in `test/formations-scenarios.test.ts`.
- **The info box:** `src/app/unit-card.ts`, on the sim page for one selected unit.

## Open

- The column's bracing numbers (§ 2a) and the modifiers' size (Total War-sized) stand as first guesses until the
  scenarios run; this plan reports what they give.
