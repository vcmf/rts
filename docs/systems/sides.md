---
status: current
last_reviewed: 2026-10-11
code: [src/sim/plan.ts, src/sim/tick.ts, src/sim/commands.ts, src/sim/replay.ts, src/scenarios/s1e-battle.ts, src/app/main.ts, test/sides.test.ts]
decisions: [0005-sim-render-split, 0013-single-player-first, 0015-era-generic-engine]
---

# Sides, the scenario's plan and the end (S1e-2)

A battle has your side and the other. You command yours on the page; the other follows its scenario's plan, a
script of timed commands, and its standing behaviours do the rest. The battle ends when a side is broken, or at
the scenario's time limit.

```
step 3  the plan   the steps due this tick: each a command to one of the scenario's formations, applied now
step 13 the end    each side's men in the fight against those it spawned: broken at end.broken; the limit
```

## Goals / non-goals

- **Goals:** a battle you play against a side that moves; a result; the sim knows no player, only who sent an order
  (a player's order stands the square against cavalry down; a plan's does not).
- **Non-goals (later):**
  - a brigade AI that reacts (S3), with plan steps on conditions;
  - fog of war;
  - victory points and objectives;
  - two human players.

## Constraints

- **Determinism.** A plan is data attached to a world, like its terrain: which steps have run follows from the
  tick. A save carries the time limit and a hash of the plan and limit (`M_LIMIT`, `M_PLAN`), so a loaded world
  refuses to tick until the same plan is attached again (`attachScenario`). Its commands are applied directly
  and not logged; a replay re-derives them (`docs/proposals/sim-design.md` §4).
- **Ownership is the page's.** The sim validates every command the same way, whoever sends it.

## Design

**The player's side** (`Scenario.player`). The page selects and orders only that side's formations:
- a box drag selects only those;
- a click on an enemy does nothing (with C first, it charges it).

A scenario with no player is a sandbox for both sides.

**The plan** (`plan.ts`, `Scenario.plan`):
- **Steps:** `{ at, unit, cmd }`, `at` in seconds. `attachScenario(w, scenario)` attaches the plan and the time
  limit; `record`, `play` and the page call it before the scenario's setup.
- **Formations:** a step names its formation by spawn order (`unit`). A fresh world hands out slots in order at
  generation 0, so the handle is `unitHandle(unit)`. A charge's or a preferred fire's `target` names an enemy
  unit the same way.
- **Step 3:** at a step's tick its command is applied (`applyNow`: quantised, then validated as a stamped
  command, but not as the player's). A refusal goes into the tick's dropped list with sequence −1 and the reason
  prefixed `plan:`. The page shows only your own refusals.
- **Under a cavalry threat** a battalion forms square ahead of the orders it has (the plan's), holds in it, and
  forms back and goes on with them when the threat has passed (`docs/systems/melee.md`). A player's order stands
  the square down instead.

**The end** (`endStep`, step 13; `rs.end`):
- **In the fight:** a formation alive and not routing, rallying or shattered.
- **Spawned:** each side's men at spawn (`sides.spawned`).
- **Broken:** a side whose men in the fight fall to `end.broken` (0.5) of its spawned men. Its enemy wins; both on
  one tick is a draw.
- **The time limit** (`Scenario.minutes`): the larger share in the fight wins, a draw within `end.margin` (0.05).
- **The result** (`meta`): `M_END` (the tick, 0 while undecided) and `M_WINNER` (`END_*`). It is decided once,
  and the battle runs on after it.

**The page** shows each side's share in the fight and, once decided, the result ("you win", "you lose", "a
draw").

**`s1e-battle`:** you command side 0, on the southern ridge. Side 1's plan:
- at 1 minute its first line comes down to the stream's north bank;
- at 4 minutes it wades the stream and closes to about 120 m of your first line;
- at 5 minutes its second line comes down to the bank, and at 10 minutes over;
- at 8 minutes its regiment charges your eastern battalion.

The limit is 40 minutes.

## Verification

- **`test/sides.test.ts`:**
  - **the plan:** a step's command arrives at its tick and is not logged; one for a formation gone or out of the
    fight is dropped with a reason; a charge's target by unit;
  - **the end:** a side broken at half; a draw on one tick; the limit and its margin; not broken while more than
    half is in the fight;
  - **routers breaking ranks (#39);**
  - **determinism:** ten minutes of `s1e-battle`, a golden with its replay (an empty log) and a save round trip.
- **`npm run check:app`:**
  - the page lets you select only your side;
  - side 1's first line comes down on its own;
  - the battle runs to a result.

## Open questions

- **The plan is a script.** It does not react: a line ordered over the stream goes even when your guns are
  waiting for it. Whether that is enough for the first playtests is S1e-3's question; a reacting brigade AI is S3.
- **Half the men out of the fight ends a battle.** That may be too soon or too late; S1e-3's playtests tune
  `end.broken`.
