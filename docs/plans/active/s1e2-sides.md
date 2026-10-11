---
status: active
last_reviewed: 2026-10-11
---

# Plan: S1e-2, sides, the enemy's plan and the end

The second part of S1e (`docs/plans/active/s1e1-battlefield.md`, the split). After it the battle is playable: you
command one side, the other follows its scenario's plan, and the battle ends with a result. S1e-3 is your
playtest.

## The problem

- The page selects and orders every formation of both sides: a drill sandbox (`docs/systems/sim-page.md`, open
  questions).
- Nothing drives the other side. Its standing behaviours fire, square and fall back, but it never moves.
- Nothing ends a battle.
- A battalion that breaks while changing shape finishes the change before it runs, and runs in the new shape (#39).

## Design

### The player's side (the page)

A scenario may name the player's side (`Scenario.player`). The page then selects and orders only that side's
formations. A box drag selects only those, and a click on an enemy (without C) does nothing. A scenario without
`player` stays a sandbox for both sides.

The sim does not know who the player is. Ownership is the page's: the sim validates commands as it always has.

### The enemy's plan (step 3 of the tick)

`Scenario.plan`: a list of timed steps, each a command for one of the scenario's formations:

```ts
interface PlanStep { at: number; unit: number; cmd: PlanCommand }   // seconds; the unit-th formation the scenario spawned
```
- **Attaching:** `attachPlan(w, plan)` attaches a plan to a world, like the terrain: data, not state. Its steps
  are fixed by the scenario, and which have run follows from the tick, so a save and a replay need nothing
  more. `record` and `play` attach the scenario's plan, and the page does too.
- **Step 3:** at the tick of a step's `at`, its command goes to its formation. It passes the same validation as
  a player's command, applied directly and not logged. Replays re-derive it, as sim-design §4 says of AI
  commands.
  - **Which formation:** the `unit`-th the scenario spawned. A fresh world hands out slots in order, generation
    0, so the handle is fixed. A formation gone or out of the fight drops the command, with the reason in the
    tick's dropped list.
  - **Targets:** a `charge` or a preferred `fire` target names an enemy unit the same way.
- **The plan is a script, not an AI** (sim-design §12: "the enemy's plan is scripted per scenario"). The standing
  behaviours (fire at will, square against cavalry, the wavering fall-back) do the rest. A brigade-level AI is S3.

### The end (step 13 of the tick)

- **A side is broken** when the men it has in the fight fall to `end.broken` (data, 0.5) of the men it spawned.
  Out of the fight means gone, routing, rallying, shattered or left the field.
- **The battle ends** when a side is broken. Its enemy wins; if both break on the same tick, it is a draw.
  - The scenario may give a time limit (`Scenario.minutes`). At the limit the side with the larger share in the
    fight wins, a draw within `end.margin` (data, 0.05).
- **The result** is state (`meta`): the tick it ended and the winner (`END_*`). Nothing stops after the end: the
  routs run on. The page shows the result and keeps running.

### Routers break ranks (#39)

A battalion that breaks while changing shape cuts the change short. It takes whichever of the two shapes the
change is nearer to (by its progress) and runs at once. Its places jump by up to half the change; the soldier
layer's men walk the difference, as they do after any change of places.

### The scenario

`s1e-battle`:
- **The player** commands side 0, the southern ridge;
- **side 1's plan:**
  - at 30 s, its battery and all its battalions fire at will;
  - from 1 to 2 minutes, its first line advances to the stream's north bank, the second line behind it;
  - at 5 minutes, two columns of route cross: by the bridge, and by the eastern ford;
  - at 9 minutes, the first line forms column and crosses;
  - at 8 minutes, its regiment charges the player's eastern battalion.
- **Both sides** spawn at will, and the limit is 40 minutes.

## Acceptance

- **`test/sides.test.ts`:**
  - **the plan:**
    - a step's command reaches its formation at its tick;
    - one for a formation gone is dropped with a reason;
    - a replay and a save round trip reproduce a planned battle;
    - plan commands are not in the log;
  - **the end:**
    - a side broken at half its men out of the fight; the enemy wins; both on one tick is a draw;
    - the time limit and its margin;
    - a rally brings men back into the count;
  - **routers break ranks (#39):** a line caught at 30% of its change to square runs as a line at once, one
    caught at 70% as a square.
- **`check:app`:**
  - in `s1e-battle` the player cannot select an enemy;
  - side 1's first line advances on its own;
  - the battle runs to a result, at 8× speed, in under the check's time.
- **Goldens:**
  - with the new state (`meta` end words) left out of the hash, every golden reproduces except where a router broke
    mid-change, which is accounted for;
  - a new golden plays `s1e-battle` for 10 minutes.
- **Checks:** lint, typecheck, the tests, `check:docs`, `check:data`.
- **Docs:**
  - `docs/systems/sides.md` (new): the player's side, plans, the end;
  - `docs/systems/fire-morale.md`: #39;
  - `docs/systems/sim-spine.md`: steps 3 and 13;
  - `docs/systems/sim-page.md`.

  #39 is closed by the PR.

## Non-goals

- A brigade AI that reacts (S3); plan steps with conditions ("when the enemy is within 300 m") come with it.
- Fog of war: the player sees everything (sim-design §11).
- Victory points, objectives and terrain to hold.
- Two human players.

## Results (2026-10-11)

**The refactor check:** with the new state (the end words in `meta`, `sides.spawned`) left out of the hash and the
ruleset hashed without `end`, the drill, firefight, calibration and guns goldens reproduced. The charge golden
changed: its line, caught forming square, breaks mid-change and now runs at once (#39). All goldens were then
regenerated (`SIM_VERSION` `s1e.2`, `SAVE_FORMAT` 11), and `s1e-battle` has one of its own.

**What changed from the design:**
- **The stream is wadeable.** At 1.4 m deep everywhere but its fords, side 1's lines stopped at its bank, about 300 m
  from yours and beyond musket range, and its regiment's charge halted there: no battle. Most of the channel is
  0.8 m now, waded slowly by men and horses but not by guns. It is 1.4 m deep in pools out on the flanks, beyond
  |x| 420. The fords and the bridge stay the guns' crossings. The data version is `0xff0c79dc`.
- **The plan** brings side 1's first line over the stream to about 120 m of yours (the design had columns of route
  over the crossings first). Its second line follows. With you doing nothing the battle runs its 40 minutes, and
  side 1 wins on the larger share in the fight.
- **Your regiment pins side 1's infantry:** a battalion within 200 m of standing cavalry forms square (S1d-2's
  threat rule) and holds it. On this map that happens often. S1e-3's playtests will say if it is too much.

## Review

**Round 1** (`/code-review high`, 10 findings; two severe, so a second round):
- **Fixed, severe:**
  - the plan's commands went through the player's path, so a scripted order stood side 1's square against cavalry
    down for the spell, as a player's order does. Plan commands are not the player's now; a test checks the
    square forms;
  - a save forgot its plan and time limit: a loaded world ran on without them, and nothing said so. The limit and
    the plan's hash are state (`M_LIMIT`, `M_PLAN`). A loaded world refuses to tick until its plan is attached
    again, and `attachScenario` refuses another plan.
- **Fixed:**
  - the page lost its "nothing selected" hint;
  - a plan step's negative target was read as one: none is no target;
  - the page counted the men in the fight its own way: it uses `fightShares`, as the end does;
  - the change's finish is one function (`finishChange`) for a change done and one cut short;
  - a test of "not logged" could not fail: a recorded game's log holds only the player's commands, and its replay
    reproduces the planned moves;
  - a rally bringing men back into the count is tested;
  - comments named docs by bare file name.
- **Kept:** a step names its formation by spawn order, and nothing checks that the scenario's spawns were all
  accepted. The scenario test checks `s1e-battle` deploys all 16, and a scenario's spawns are its own data.
