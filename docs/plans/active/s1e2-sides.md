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

**Round 2** (`/code-review high`, 10 findings; two severe, so a third round):
- **Fixed, severe:**
  - with plan commands no longer standing the square down, a plan order that came in the 2 s before a battalion
    formed square was wiped when the square cleared its orders, and the plan never sends it again. The square
    is now formed ahead of a battalion's orders, held, and formed back ahead of them;
  - a battalion in a square it formed by itself marched on in square when the plan moved it, and if the threat
    passed mid-march it never formed back. It holds in that square, keeping the march for after.

  A test runs a plan march through a threat: square, held, formed back, marching on.
- **Fixed:**
  - who sent a command was a module flag: it is an argument (`apply`, `giveOrders`);
  - the missing-plan check ran after step 1 had applied the pending commands: it is the tick's first act;
  - a world attached with no plan could take one later: attaching records a plan's hash (never 0), and attaching
    nothing to a world made with a plan fails;
  - the docs described saves as carrying nothing for the plan;
  - the page copied the session's dropped list every frame;
  - the end step's comment sat over another function;
  - the rally test set the state by hand: a battalion now breaks, runs to its rear and rallies.

**Round 3** (`/code-review high`, 9 findings; one severe): a battalion that broke in the square it had formed by
itself never ran. Its hold was a flag (`autoFrom`) checked in the movement step, which a rout did not clear, so
the hold froze the router's run. Three rounds with a severe finding each, all from the square's hold and the
plan's orders meeting, is the workflow's signal to stop patching and redesign (`AGENTS.md`).

## Redesign: the square's hold is orders, not a flag

The square against cavalry put a flag on the battalion, and the movement step obeyed it. Every other source of
orders (a rout's run, the fall-back, a failed change, a pool run dry) had to know about the flag, and each round
found one that did not. Now the whole manoeuvre is orders, put ahead of the battalion's own:
1. form its refuge;
2. hold (`O_HOLD`), standing until the spell of threat is over;
3. form back into the shape it was in, or going to.

Then its own orders (a scenario's plan's) follow. Nothing outside the order list remains, so:
- **a rout or a player's order** clears the square's orders with the rest, as any order is cleared;
- **a form that cannot be made there** (water, a wood: round 3's second finding) is optional: it is skipped and
  the rest go on, the plan's march included;
- **with fewer than three free orders in the pool** it does not form square at all, so it never marches on in a
  square it cannot form back from (round 3's third);
- **a plan step that reshapes it during a spell** replaces the square's orders; if the threat goes on, the square
  is put ahead of the new shape, and it forms back into that shape after (round 3's fourth);
- **`autoFrom` is gone** from the state.

Also from round 3:
- a plan step due before the first tick is refused at attach, where it never ran before;
- the plan's steps are sorted by due tick once, at attach, and a tick finds its own by binary search;
- `docs/systems/sides.md` links the end's numbers and the scenario's plan rather than copying them.

**Kept:**
- a wavering battalion with orders still does not fall back (S1c-2's rule: it falls back only without orders),
  and a plan's march is an order;
- whether the plan should give way to the fall-back is for S1e-3's playtests.

The review starts again at round 1.

**Redesign round 1** (`/code-review high`, 8 findings; four severe): putting the square's hold in the order list
broke other things:
- a battalion holding in square had an order at its head, so it did not fire;
- a square that could not be formed added orders every tick and drained the pool;
- a plan order arriving after the square formed replaced the hold and the form-back, so the battalion stayed in
  square for good;
- a melee's contact cleared the form-back.

The fix is the design's own rule taken one step further: no bookkeeping that can go stale. **Sheltering is derived
from state each tick** (`sheltering`, `formation.ts`): in the refuge or changing into it, formed by itself
(`autoFrom`, back in the state), in a spell no player's order stood down, in the fight and not in melee.
- **A sheltering battalion** stands and keeps its orders, and counts as halted for fire.
- **The standing behaviour** starts the square and the form-back itself, as changes (`startChange`, optional:
  a failure clears nothing). It retries every 5 s where one cannot be made; nothing is queued, so nothing
  piles up.
- **What ends it:** a rout clears `autoFrom`; a melee, a player's order (`refugeOff`) and the spell's end end
  sheltering by the state they change.

Tests:
- a plan order that comes after the square formed is kept, with no growth in the pool, and resumed after;
- a sheltering square fires;
- a battalion that breaks in its square runs.

The charge golden came back to the value it had before the order-list design.

**Kept:**
- **A form-back that cannot be made** (the square stands where its old line would be wet) is retried every 5 s.
  Meanwhile, with the spell over, its orders run in square.
- **A battalion that breaks during a change that was itself interrupted** snaps to the shape it held before the
  first change, which can be farther than half a change. It is rare, and S1e-3's playtests will say if it shows.

**Redesign round 2** (`/code-review high`, 10 findings; three severe, each stranding a battalion in square or
losing the plan's orders):
- **Fixed, severe:**
  - a rout cleared `autoFrom`, so a battalion that broke in its square and rallied never formed back. Sheltering
    already ends at a rout, so the clear is gone;
  - the form-back waited for its retry slot, so a battalion with a kept march marched in square for up to 5 s:
    it forms back on the tick the spell ends;
  - a battalion struck in melee had its orders cleared (the plan's kept march with them). In melee it now
    stands, keeping its orders, and goes on with them after; a charge of its own ends. A test runs a march
    through a melee.
- **Fixed:**
  - a wheel kept through a change takes its pivot again from the new shape, and its progress counts on;
  - the shape to form back into is the one it is in, or going to, when the square starts;
  - the standing behaviour's own refused change shows no "cannot form";
  - the optional flag's order-side plumbing (a leftover of the order-list design) is gone;
  - the retry is 5 s in seconds, under a generic name (`REFUGE_RETRY`);
  - one `targetShape` replaces three copies;
  - a test read companies by a hard-coded stride.
