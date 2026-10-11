---
status: active
last_reviewed: 2026-10-11
---

# Plan: S1d-3, the battery fires

The last part of S1d (`docs/plans/active/s1d1-unit-types.md`, the split; sim-design §8). S1d-1 gave the
ruleset a foot battery that limbers, unlimbers, takes fire and routs; it cannot fire. This part gives it
roundshot and canister. The S1 target it serves (sim-design §17): **artillery punishes columns**.

## Problem

- A battery is eight pieces with no effect on the fight.
- Musketry is statistical per company against a target company. A roundshot is not: what it does depends on
  the ground it crosses (a reverse slope or a hollow stops it, a flat field lets it bounce on) and on how
  many ranks stand along its line. A column end-on suffers, and a line fired on frontally suffers less.
  Neither rule fits a hit chance by range.

## Scope

### The data

A type that fires shot has `UnitType.artillery` (engine-generic: a ray and a cone; the Napoleonic ruleset's
are roundshot and canister):

```ts
artillery?: {
  shapes: string[]                 // the shapes it fires from (the battery: unlimbered)
  arc: number                      // half-angle of a piece's field of fire about its facing, radians
  reload: number; reloadJitter: number; crew: number   // seconds a shot, its spread; full crew per piece (fewer men reload slower)
  ray: {                           // roundshot
    range: number                  // the farthest a piece aims, metres
    muzzle: number                 // the muzzle's height above the ground, metres
    speed: number                  // m/s along the ground (sets the drop per metre)
    energy: number                 // metres the ball can travel, spent by flight, grazes and men
    graze: number; restitution: number   // metres of energy lost at a graze, and the share of the drop it keeps upward
    bury: number                   // a graze into ground rising steeper than this (rise over run) stops it
    height: number                 // the ball strikes men while this low over the ground, metres
    width: number                  // the lane a ball cuts through a block, metres
    perMan: number                 // metres of energy a man struck absorbs
    kill: number                   // share of the men in its lane who fall
    spread: number; short: number  // keyed dispersion: across (radians) and in range (a share)
  }
  cone: {                          // canister
    range: number                  // inside this the piece fires the cone instead of the ray
    half: number                   // the cone's half-angle, radians
    hits: [number, number][]       // men struck per shot by range, linear between points
  }
}
```

### The step (step 9, after musketry)

For each battery, per piece (a company with men):
- **It may fire when:**
  - its type has `artillery` and it stands in one of the shapes it fires from;
  - it is halted and not changing shape;
  - it is in the fight, not in melee, and its fire mode is at will.
- **Targets** as musketry's (`fire.ts`): every 0.5 s, staggered, the nearest visible enemy company in the
  piece's arc and range, or the preferred target. The arc and range are the type's own. The targeting code
  takes them as parameters, and musketry's draws stay unchanged.
- **Reload** `reload × (1 ± jitter)`, longer with fewer men: × `crew / men`, at most 3×.
- **Friends:** a piece does not fire when a friendly block stands across its line to the aim point (as a
  volley's centre ray). Beyond the aim point the shot hits whoever is there, friends included.
- **The cone,** within `cone.range`: men struck per shot = `hits(range)` × the target kind's depth factor
  (fire's). They are spread over the enemy companies whose centres lie inside the cone and that the piece
  sees, weighted by their men (`oweByMen`).
- **The ray,** beyond it: one ball, walked in 2 m steps from the muzzle over the heightfield:
  - **The aim:** at the aim point, with keyed dispersion across (`spread`) and in range (`short`). It is
    aimed to first graze at the aim point: the flat trajectory from the muzzle drops `g / speed²` per metre,
    per metre.
  - **In flight:** its height follows the trajectory.
  - **At a graze** (it meets the ground): it bounces, keeping `restitution` of its drop as rise, and loses
    `graze` metres of energy. It buries when the ground ahead rises steeper than `bury`.
  - **Where it is lower than `height` over the ground,** every company block it crosses loses
    `λ = chord × width × density × kill × (energy / energy₀)`:
    - `chord` is the length of the step's segment inside the block;
    - `density` is the company's men over its block's area.

    `λ` is drawn as an integer, keyed (the whole part certain, a draw for the fraction). The ball loses
    `perMan` metres of energy for each man struck.
  - **It stops** when its energy runs out, it buries, or it leaves the map.

  A column end-on is crossed through every rank of each company it stands in, and a line frontally through
  three ranks. That is the "depth along the ray" of sim-design §8, from geometry rather than a table. A
  ball over a crest flies on over the hollow behind it, so a reverse slope shelters.

**Order independence:** what a piece reads of others was fixed before the step (positions after movement,
men). Losses are owed as whole men. The draws are keyed by tick, battery, piece and purpose, and per block
by the block's slot and company.

### State, the renderer and the map

- **New per-company state:**
  - `shotKind` (0 none, 1 ray, 2 cone);
  - `shotX`, `shotZ`: where the last ray stopped, or the cone's aim point.

  Fired pieces also set the existing `volleyTick` and `target`. `SAVE_FORMAT` 9, `SIM_VERSION` `s1d.3`.
- **The staff map** draws a roundshot as a thin line from the piece to where it stopped, fading over a
  second, and canister as a short fan.
- **The 3D renderer:** `volleyTick` keeps its meaning (a piece fired on that tick), and the new columns are
  additions.

### Scenarios and the page

- `s1d-guns`: a battery on each side with a battalion. On the page, a battery fires at will as a battalion
  does.
- `check:app` lets a battery fire on a column for a minute and checks the column has lost men.

## Acceptance

- **The refactor check:** with the new columns left out of the hash, every S1c and S1d-2 golden and replay
  reproduces (no scenario has a firing battery yet, and musketry's draws are unchanged by the parameterised
  targeting).
- **`test/artillery.test.ts`:**
  - **Who fires:** unlimbered only; not limbered or changing shape; hold fire; not in melee; not with a friend
    across the line.
  - **Reload:** it slows with crew lost.
  - **The ray:**
    - on level ground it grazes near the aim point and runs on until its energy is spent;
    - a ridge between buries it or carries it over;
    - men in the hollow behind a crest are not struck;
    - its energy falls with each man struck.
  - **Depth:** a column end-on loses more men to one ball than a line frontally, and a line enfiladed loses
    more than frontally.
  - **Friendly fire:** a friend beyond the aim point on the line of the ball loses men.
  - **The cone:** canister inside its range, losses falling with range, only on companies inside the cone.
  - **Determinism:** the artillery step in reversed visiting order gives the same state; a golden of
    `s1d-guns`, with replay and save round trip.
- **`tools/calibrate-artillery.ts`** (50 seeds, one battery of 8 against a battalion of 400 on levelled ground;
  the field is 360 m, so the long range is about 400 m, corner to corner):

  | Case | Target |
  |---|---|
  | Column end-on vs a line frontally at about 400 m, men lost a minute until any break (5 minutes) | the column at least 2× the line |
  | A line at about 400 m, 10 minutes | loses 4–15%, breaks in at most 20% of seeds |
  | A column at about 400 m, 10 minutes | breaks in at least 30% of seeds |
  | A line at 150 m (canister), 3 minutes | loses at least 15% |
  | A line behind a crest at about 400 m | loses under a quarter of what it loses in the open |

- **Checks:** lint, typecheck, `check:data`, `check:docs`, the tests, `check:app`; the cost bench at 40 × 400
  unchanged within noise.
- **Docs:** `docs/systems/artillery.md` (new); `docs/systems/fire-morale.md` (the shared targeting),
  `docs/systems/sim-spine.md` (step 9), `docs/systems/sim-page.md` (the map's shot and the scenario).

## Non-goals

- Howitzers' shell, explosive fuzes, case shot beyond the cone, counter-battery effects on pieces (a piece
  falls silent only when its crew is gone).
- Ammunition and limbers' supply.
- Smoke (S2).
- A morale shock per roundshot strike: losses drive morale, and the recent-losses term weighs a burst. If the
  calibration shows guns too weak against morale, a shock is the first lever (recorded in the results).
- The 3D look of balls and fans.

## Risks

- **Cost:** a ball walks up to ~400 steps against nearby blocks. Each step tests only the blocks of
  formations whose reach is near the segment, as the fire step culls its friendly-cover test. 8 pieces a
  battery, one shot each 25 s: a few balls a second.
- **Calibration:** the case table is the test. If no numbers meet it, the targets are reported against what
  the model can do, and the plan says which mechanism is missing.

## Results (2026-10-11)

**The refactor check:** with the new columns left out of the hash, the ruleset hashed without `artillery` and
`SAVE_FORMAT` at 8, every golden (drill, firefight, calibration, charge) and replay reproduced. Musketry's draws
are unchanged by the parameterised targeting. The goldens were then regenerated (`SAVE_FORMAT` 9, `SIM_VERSION`
`s1d.3`); `s1d-guns` is new.

**The calibration** (`node tools/calibrate-artillery.ts 50`):

| Case | Men lost (median) | A minute, until any break | Broke |
|---|---|---|---|
| Line, about 400 m, 5 minutes | 26 of 400 | 5.2 | 0% |
| Column end-on, about 400 m, 5 minutes | 74 | 14.8 | 0% |
| Line, about 400 m, 10 minutes | 51 (13%) | 5.1 | 0% |
| Column end-on, about 400 m, 10 minutes | 112 (at the break) | 14.2 | 100% |
| Line, 150 m, canister, 3 minutes | 109 (at the break) | 71 | 100% |
| Line behind a crest, 10 minutes | 0 | 0 | 0% |

Every target is met: a column loses men about 2.9 times as fast as a line, and breaks in about 8 minutes where a
line holds.

**What changed from the design:**
- **Ranges:** the field is 360 m, so the long cases stand about 400 m apart on the diagonal (the plan said 500 m).
- **The crest hides:** a battery below the crest cannot see the battalion behind it and does not fire, so the
  calibration's crest case measures concealment. The ball carrying over a crest onto men in the hollow is a unit
  test (`test/artillery.test.ts`).
- **The lane:** a block is grown by half the ball's lane, so a ball through the 0.65 m gap between a column's front
  companies strikes their inner files instead of passing untouched.
- **Friends:** a piece holds unless all three of its rays to the target are clear of friends (musketry fires on a
  share).
- **The numbers:** the kill share came down from 0.25 (a line lost 26% in 10 minutes) to 0.09, and canister's hits
  were halved (a line broke in under a minute).
- **The page scenario** puts the battery on the south-west hill: lower down the rolling field cuts its sight lines
  (the open question in `docs/systems/artillery.md`).

**The cost:** main against this branch, interleaved on the dev Mac, release world: 0.82–0.89 against 0.81–0.91 ms a
tick marching, 0.63 against 0.64 firing (no battery in the benches: the step only scans). The machine ran about 10%
slower in this session than when S1c-5 set the budgets; `test/soldiers.test.ts`'s marching frame, held at 10 ms
under vitest, measured 10.2–11.7 ms in some runs here (run only on this branch; the release-world bench above
shows no difference from main; issue #36).

## Review

**Round 1** (`/code-review high`, 10 findings, none severe; no second round):
- **Fixed:**
  - a type could have musketry and artillery both, which share a company's reload and target: the ruleset is
    refused;
  - the targeting's arc and range were a module global set by the last step to run: they are a parameter
    (`reachOf`), so an aim asked from outside the steps gets the right one;
  - a battery's first load at spawn was a share of musketry's reload: its own;
  - a Face about moved the reload, the last volley and the target with their pieces, but not the shot records;
  - the ball's cull ignored the half-lane its blocks are grown by;
  - the ruleset check let an empty canister table through (a throw mid-tick), and did not check the arc, the
    step, energy, height or width;
  - the ball tested every company of every nearby formation at every step: where it enters and leaves each block
    is found once per shot (the calibration is unchanged);
  - the muzzle's offset, the step and the crew's slowest reload were engine constants: ruleset data (`ahead`,
    `ray.step`, `crewSlow`);
  - `tools/calibrate-artillery.ts` with a case named failed every check that read another case: each check names
    the cases it reads.
- **Kept:** the calibration's crest case measures concealment (the battery cannot see the battalion and does not
  fire); a ball carried over a crest onto men in the hollow is the unit test's. The check's name says so.

The refactor's results were checked against the firefight calibration's golden table, which is the same; every hash
moved with the ruleset's new fields, and the goldens were regenerated.
