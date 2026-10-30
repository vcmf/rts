---
status: active
last_reviewed: 2026-10-29
---

# Plan: U2, the morale bar and experience

The second phase of the unit model (`docs/proposals/unit-model.md`, § Experience, § Morale, § Phases). Morale becomes
a bar of points, its maximum a formation's level's; levels scale a formation's fire, toughness and drill; fighting
earns points, and points a level. The rules, their definitions, properties (P-28 to P-40), numbers and guards are in
`docs/proposals/morale-bar-model.md`; this plan follows it, and where they differ the model holds. The owner approved
its departures from the unit model (§ 10) on 2026-10-29, and chose losses on the bar at once (option B: the bar works
as hit points).

## Problem

- **Morale is hard to read and to tune:** a 0..1 value relaxes toward quality less losses, with a recent-losses
  burst; its states, thresholds and quality are intertwined (the owner's note: a bar and levels instead).
- **Nothing makes a veteran a veteran** but a higher quality: no faster reload, better aim, toughness or drill, and
  no way to become one.

## Steps

1. The model, reviewed with the owner (`docs/proposals/morale-bar-model.md`).
2. The bar at level 2: the morale machine on the bar, every number converted (§ 8), the tests moved to it; C-01 and
   the 3v3 calibration compared.
3. The levels' effects: toughness, reload, precision, drill, react, pursue, each with its test.
4. Points and the level up, with the panel.
5. The S1e battle's veterans at level 3 and the battle retuned; C-02, H-04 and G-06; the docs; the goldens.

## State and versions

- The world's `quality`, `morale`, `baseMen` and `recent` go; `level`, `pts`, `up`, `bar`, `barMax` and `cost` come.
  `SAVE_FORMAT` 14; `SIM_VERSION` `u2.1`; the ruleset hash covers `levels` and `points` (and U1's `sectors`, which it
  had missed).
- `debug-spawn` takes `level` and `bar` in place of `quality`; `debug-morale` sets the bar.

## Acceptance

- P-28 to P-40 proved by `test/morale.test.ts`, `test/experience.test.ts` and `test/rulesets.test.ts`.
- C-01's targets still pass (`tools/calibrate-fire.ts`), and every charge target (`tools/calibrate-charge.ts`).
- C-02: level 3 beats level 1 at 100 m clearly, with about half the losses. H-04: level 5 holds a while against two
  of level 2, then loses. G-06: level 6 stands 2–3 times the fire of level 2.
- The S1e battle is side 1's at the page's seed in 15–22 minutes, and the valley plays the same battle.

## Results

In `docs/proposals/morale-bar-model.md` § 15: every calibration passes; the S1e battle is side 1's at 17.1 minutes.

## Review

`/code-review high` on the branch (2026-10-29) found, and this PR fixes: the ruleset hash missed `levels`, `points`
and `sectors`; roundshot credited a battery for friends its balls struck; the experience step read faces that steps
9–10 could have changed; `SIM_VERSION` was not bumped; the panel's bar and the map's colour left out the secured
flanks' support; the level calibrations' medians counted runs that never broke; doc references by bare name; this
plan was missing. The model's § 9 claimed a guard on a charge's own threat and impact shocks, which neither the code
before U2 nor after had: a charge into a flank is meant to break a line (its calibration target is 90%), so § 9 now
says the guard covers contagion and a second enemy's charge.
