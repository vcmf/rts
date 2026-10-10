---
status: active
last_reviewed: 2026-10-09
---

# Plan: S1c, fire, cohesion and morale

The third part of S1 (`docs/plans/done/s1a-formations-on-spine.md`, breakdown). Battalions fire on the
enemy, take casualties and break. The design is `docs/proposals/sim-design.md` §8 (fire), §10 (morale and
cohesion) and §12 (standing behaviour). S1c ends when **two lines exchange fire at 100 m and the weaker
breaks in 6–10 minutes of battle time.**

The first draft was challenged in `docs/research/s1c-plan-review.md`. This plan follows that review:
- morale is driven by losses;
- random draws are keyed, not taken from the stream in slot order;
- the re-packing gate and the fuller morale machine move to their own PRs.

## The split

| Part | Scope |
|---|---|
| **S1c-1** (this plan) | Fire, casualties, a loss-driven morale with rout, the calibration, the page. Meets S1c's goal |
| S1c-2 | Rally, shattered, rout contagion, flank support, the wavering fall-back |
| S1c-3 | The casualty re-packing gate (`docs/known-issues.md`): the other half of a line takes the loss first, no extra draws |

## S1c-1 scope

Every number named below is ruleset data (`fire` and `morale` in `src/rulesets/napoleonic.ts`); the
engine names no musket (decision 0015).

### Keyed draws

Fire and casualties draw from a **keyed** generator. A short xoshiro stream is seeded from a hash of:
- the world seed (a new meta word);
- the tick;
- the shooter's handle and company;
- a purpose tag.

A result then depends on who fires and when, not on slot order or on how many draws others made.
The world stream is untouched by fire.

### Fire (tick step 8), per company

A company is the firing unit; its facing comes from the shape.

- **Who fires:**
  - the battalion is halted (no order at its head that moves, wheels, faces or changes shape) and not
    routing;
  - its fire mode is *at will* (the default). A new command `fire` sets *at will* or *hold*, with an
    optional preferred target handle.
- **Target:** an enemy battalion with any company:
  - inside the company's fire arc (data: half-angle);
  - within the maximum range (data: 250 m), measured company centre to company centre;
  - with a clear line.

  The preferred target wins if valid, else the current target if still valid, else the nearest. Ties
  go to the lower handle. Targets are re-chosen every 0.5 s and stored as a handle. The re-choice is
  staggered by slot, a tenth of the battalions each tick: all on one tick cost 2.3 ms with 40
  battalions, over §16's 2 ms.
- **Clear line**, judged on positions after movement:
  - the heightfield stays below the sight line (eyes 1.6 m, sampled every 2 m);
  - it crosses at most the ruleset's metres of sight-blocking classes (woods 40, dense wood 15);
  - **partial cover by friends:** three rays per company (both flanks and centre); a ray is blocked by
    any friendly company's block (its placed rectangle, so columns, squares and changes are exact). The
    rounds scale by the share of clear rays.
- **Volleys:**
  - **Loading:** each company reloads on its own (data: 25 s, ±20% keyed), so the companies ripple. At
    spawn, a company is loaded after a keyed share of a reload, so a line does not open with one
    four-company volley.
  - **Rounds:** men in the firing ranks (data: 2 of 3) × clear share × (1 − misfire).
  - **Expected hits:** rounds × p(range) × the shooter's state factor × cohesion factor × the target's
    depth factor. p(range) is a piecewise linear table; the depth factor is by kind (a column is easier
    to hit).
  - **Casualties:** each volley's expected hits accumulate per target. Each tick, step 11 takes the
    integer part plus one keyed Bernoulli on the fraction, and gives each man to a company in the
    shooter's arc and range, weighted by its men, by a keyed draw. This replaces `sampleCount` (no jump
    at λ = 1; a volley's λ is 0.2–0.4).
- **State kept:**
  - per company: reload left, last volley tick, the target handle (the renderer draws flashes from
    these);
  - per battalion: hits owed;
  - per side: the rear direction (below).

### Morale (step 12): loss-driven

Each battalion has a stored **quality** (0..1, `debug-spawn`'s optional `quality`, default data) and a
**morale** that **relaxes toward a target** each tick, in exact exponential steps:

```
target = quality − a · (losses / start) − b · (recent losses / start)
```

- **Recent losses:** a 10 s decaying sum. Its per-tick factor is computed once when the ruleset
  compiles (`exp` from `num.ts`).
- **Steady fire on a battalion does not move morale; only men lost do.** So an exchange at a range
  where nobody falls breaks nobody, and p = 0 means no break.
- **States, with hysteresis:**
  - steady;
  - shaken: below a threshold; fires worse;
  - wavering: lower still; fires worse again;
  - routing: below the break threshold.

  Thresholds are data, with each way back set higher than the way in.
- **Routing:**
  - the battalion drops its orders, refuses commands (dropped as `routing`) and does not fire;
  - it runs at the rout pace toward its **side's rear**, a per-side direction the scenario sets with a
    `side` command;
  - it Faces about first if the shape allows, else wheels;
  - it stops at impassable ground or the map edge.

  It does not rally in S1c-1.
- **Calibration aim for the losses at the break:** 12–25% of starting strength for the weaker line.
- **Cohesion is `1 − disorder`:** S1a's disorder, from terrain and the lag model. It enters the fire
  factor only.
  - It is not in the morale target: a march through a wood pins disorder at 1 and would shake a
    battalion no enemy can see. That showed in the S1a drill.
  - A casualty term is left out: halted recovery (about 1.8 per minute) would cancel it at these loss
    rates.

### Standing behaviour (step 4)

Return fire is the fire rule: a halted battalion *at will* fires on its own. Routing is the only other
behaviour in S1c-1.

### The page

- Volley flashes and fading fire lines.
- A morale bar and the state by each battalion's colours.
- Routers' men loosen around their slots.
- Fire mode buttons.
- The readout: morale, state, losses.
- Scenario `s1c-firefight`: two lines 100 m apart, the second of lower quality, and the side rears set.

## Calibration

`tools/calibrate-fire.ts` runs two lines at 50, 100 and 200 m for 100 seeds each. The quality gap is
fixed in the scenario (0.8 against 0.65). It reports:
- the time to break and the losses at the break (median and spread);
- how often the stronger line breaks first.

**Targets:**
- **at 100 m:**
  - the weaker line's median time to break is 6–10 minutes;
  - its losses at the break are 12–25%;
  - the stronger line breaks first in at most 15% of seeds;
- **at 200 m:** no break within 20 minutes in at least 95%;
- **at 50 m:** a median under 5 minutes.

Tuning stays in the data. Vitest pins a **golden table** of five seeds at 100 m (times and losses), so a
change shows as a diff, not a pass that drifted.

## Acceptance

1. The calibration targets hold, with the 100-seed table in the results.
2. **Rules, in Vitest:**
   - **Line of fire:**
     - fire needs arc, range and a clear line: none past 250 m, none over a crest, none past the woods
       limit;
     - a friend across a third of the front cuts the rounds by about a third.
   - **When fire happens:**
     - hold fire holds;
     - a battalion moving, wheeling, facing or changing shape does not fire;
     - a router does not fire and refuses commands.
   - **Casualties:** they go only to companies in the shooter's arc and range.
   - **Slot order:** the same scenario spawned in reverse slot order gives the same per-battalion
     history (keyed draws).
   - **Morale:**
     - p = 0 gives no break;
     - each state is reached in a scripted case, with its hysteresis.
   - **Routing:**
     - a router runs toward its side's rear and stops at the map edge;
     - the opening volleys at 50 m do not break a fresh line in its first minute.
3. **Determinism:** a golden of the firefight; its replay and save round trip reproduce the hashes.
   `SIM_VERSION` and `SAVE_FORMAT` move on.
4. **Cost:** 40 battalions, half facing half at 100 m, all firing.
   - Sim plus soldier layer per frame at 1× within 4 ms.
   - Fire and morale's share of the tick reported against sim-design §16's 2 ms per tick.
5. **The page:** `npm run check:app` runs the firefight to a break headless, with no console error, and
   plays the session back in Node.
6. **Negative runs:**
   - taking fire draws from the world stream in slot order makes the reversed-order test fail;
   - an "under fire" pressure term makes the p = 0 test fail;
   - dropping the friend rays makes the partial-cover test fail.

## Non-goals

- Everything in S1c-2 and S1c-3.
- Smoke, vision and fog of war (S2).
- Commanders (S2).
- Ammunition and fatigue (S3).
- Melee, charges, artillery, cavalry (S1d).
- Skirmishers.
- Pathfinding for routers.
- Fire on the move.

## Risks

- **Calibration on one scenario.** S1e's playtests are the real check. The sweep reruns in about a minute,
  and its table shows each morale term's share at the break, so a term that never matters can be cut.
- **Sight-line cost.** Three rays per company at 2 Hz per battalion. Candidates are culled by range
  before any ray is cast; the cost test decides whether more is needed.

## Also in this PR

- The S1b plan moves to `docs/plans/done/`.

## Results (2026-10-09)

Built as planned, described in `docs/systems/fire-morale.md`. Measured on the dev Mac.

1. **Calibration** (`node tools/calibrate-fire.ts`, 100 seeds per range, levelled ground, 93 s on 9
   workers):

   | Range | Weaker broke | Stronger first | No break in 20 min | Time to break, min (p10 / median / p90) | Weaker's losses at break |
   |---|---|---|---|---|---|
   | 50 m | 99 | 1 | 0 | 3.1 / 3.9 / 5.0 | 20–21% |
   | 100 m | 98 | 2 | 0 | 6.1 / 8.3 / 11.9 | 20–21% |
   | 200 m | 0 | 0 | 100 | none | none |

   Every target holds. One tuning step was needed: p(100) went from 0.017 to 0.019 to centre the median
   (9.5 → 8.3 min). At 200 m the lines trade 8–17 men in 20 minutes, below the weaker line's 20%.

   **The terms at the break:** total losses 0.25, recent losses 0.02–0.04. The recent term hardly matters
   in a firefight (open question in the system doc).
2. **Rules:** 14 tests in `test/fire.test.ts`, all passing.
3. **Determinism:**
   - the fire step visited in reverse slot order gives the same hash;
   - the firefight golden (12 000 ticks) reproduces through its replay and a save round trip;
   - the five-seed calibration golden holds;
   - `SIM_VERSION` is `s1c.1`, `SAVE_FORMAT` 4.
4. **Cost**, 40 battalions firing (20 a side in four ranks, front ranks 100 m apart):
   - sim plus soldier layer 1.69–1.78 ms per frame at 1× (budget 4);
   - the fire step 0.27 ms per tick on average, its worst tick 0.74 ms (§16: 2 ms).
5. **The page:** `npm run check:app` plays the firefight on the real field. The weaker line routs at
   9.5 minutes with 21 men lost (the stronger lost 18), and the session's 568 hashes reproduce in Node.
6. **Negative runs**, each caught:

   | Mutation | Failing tests |
   |---|---|
   | volleys drawing from the world stream | reversed order, the goldens, the arc test |
   | an under-fire pressure term in morale | p = 0, the first minute at 50 m, the goldens |
   | no friend rays | friends' cover |

**Changes found while building:**
- **Disorder left the morale target.** The S1a drill showed a battalion marching through a wood going
  shaken with no enemy near; cohesion acts on fire only.
- **The S1a drill holds its fire.** Its two battalions are on opposite sides; the drill tests
  formations.
- **The calibration runs on levelled ground.** The strip rolls: a rise hides the lines from each other
  beyond about 140 m, which made "no break at 200 m" pass with nobody firing. The ground's effect is
  tested separately (the crest test).
- **Retargeting is staggered by slot.** All battalions on one tick cost 2.33 ms, over §16's 2 ms.
- **A blocked company waits 0.5 s before trying again.** Rear companies behind friends were re-checking
  every tick: 0.46 → 0.27 ms per tick.
- **Reversed visiting order replaces the mirrored scenario** as the slot-order test. Handles carry the
  slot, so a respawn in reverse order changes the keys; reversing the loop tests the claim directly.
- **The calibration takes about 1.5 minutes on 9 workers,** not "about a minute".

**Review round 1 (#15).** Three severe findings and seven others, all fixed:
- **A `node_modules` symlink was committed.** `.gitignore` now matches files as well as folders.
- **A router whose Face about failed lost its run order and stood forever.** It now keeps the run; a
  test checks it, and fails on the old code.
- **The S1b drill and bench fought** (14 bench battalions routing by minute 5). `debug-spawn` takes a
  fire mode; the S1a drill and both S1b scenarios spawn holding fire.
- **`aimAt` tries each company in arc, nearest first,** not only the nearest.
- **Less work per tick:**
  - the geometry is built only when some battalion may fire;
  - the target found while retargeting is reused for the volley;
  - the arc cosine and state factors are compiled.
- **One handle check** (`formationSlot`, now in `world.ts`).
- **The reverse-order switch is per world,** not a module flag.
- **The firefight golden is recorded inside its test.**
- **The morale bar sits past the shape's depth.**

**Review round 2.** One severe finding and nine others, all fixed:
- **Round 1's router fix did not hold.** The run survived the failed Face about, but the halt path
  dropped it a second later: the turn toward the rear swept the line into the water. A router now tries
  a fan of directions when its run halts.
  - The spot the old test used turned out to be a pinch for any battalion (a plain march west halts
    within a metre), so it now checks the order only.
  - A new test has a router halted at the stream run 240 m the other way.
- **Ranking:** targets are ranked by their nearest *visible* company.
- **Hits:** they go only to companies the shooter can see. A test with a painted wood shows hidden
  companies take none, and it fails without the check.
- **Sight lines:** cached per company pair per tick.
- **The order pool:** the run is allocated before the Face about, so a nearly full pool cannot leave a
  router turned round with no run.
- **Smaller:** buffer bounds noted, `MS_ROUTING` in the renderer, `aimOf` documented as a test hook,
  comments fixed.

**Review round 3, and the redesign of the rout (2026-10-09).** Round 3 found two more severe defects, both
in rout movement again:
- a router that had arrived kept starting new runs;
- with no rear set, later runs headed back toward the enemy.

Every severe finding of the three rounds came from the same place: the run was re-derived each time from
the battalion's current state (heading, order list, status). Under the workflow, a fourth round needs a
redesign first. The user chose a stored rout state over cutting rout movement:
- **Fixed at the break:** the run's direction, the side's rear or else straight back from the heading at
  that moment (`routX`, `routZ`). Never recomputed.
- **A phase** (`routPhase`): running, halted, fled.
  - Running ends when the router has no orders. If its status says the run halted at impassable ground,
    it is halted; otherwise (arrived, or as near as it can get) it has fled and stays.
  - Only a halted router tries the next direction of the fan, every 5 s, measured from the stored
    direction.
- **The fan counter** advances only when an order was actually made, so a full order pool delays a run
  but never uses up a direction.
- **Tests:** a router that arrives stays put; with no rear set, every run points away from the front it
  broke on; a router halted at the stream turns away; a full order pool uses up no direction.

Built as designed. The tests, with a negative run for each of round 3's bugs:
- **Arrival:** a router that arrives stays fled. Counting arrival as a halt fails it.
- **No rear set:** a router halted at the stream fans out about its stored direction. Re-deriving the
  direction from the current heading fails it.
- **A full order pool:** it delays the first run without using up its direction. Counting the direction
  before the order is made fails it.

**The other round 3 findings, fixed:**
- Excess hits on a company are dropped, not passed on to companies that may be hidden.
- The sight cache is stamped with the geometry build, so a debug call between ticks cannot leave stale
  answers.
- Ties go to the lower handle.
- A sight line is cached once per pair.
- The distance helper is used everywhere.
- The sight buffer is sized from the ruleset, and the 64-class limit is gone.
- The hidden-company test is tidied.

The review rounds restart with this design.

**Redesigned PR, review round 1.** One severe finding and seven others, all fixed:
- **No rear set and a battalion that breaks mid-Retire:** "straight back from the heading" pointed at the
  enemy, because the Retire's Face about had already turned it. With no rear set, the direction is now
  away from the nearest enemy at the break (straight back only when there is none). A test breaks a
  retiring battalion; the old rule fails it.
- **Sight lines** are walked from the lower company to the higher, whichever asks, so the cached answer
  cannot depend on order.
- **Friendly cover** is culled by each battalion's real extent, not a fixed 40 m.
- **A failed optional Face about:** an order flag (`optional`) skips it, replacing the morale check in
  the formation layer.
- **No allocations** in the fire step's hot path.
- **One map clamp** (`setOnMap`).
- **Quality:** a spawn's negative quality is refused, except the −1 default marker.
- **The tick comment** names the shared order pool.

**Redesigned PR, review round 2.** No severe findings, so this is the last round; the worthwhile ones are
fixed:
- **Face about now carries each company's fire state** (reload, last volley, target, hits owed) with its
  men. A test checks it, and fails without.
- **Casualties and morale are separate passes.** All casualties, then all morale, with a rout reading
  enemy states from a copy taken before the step. The nearest-enemy search counts only enemies with men
  left that are not routing, and no longer depends on visiting order.
- **The −1 quality marker** means only "none given"; any negative given is refused.
- **`companySees`** answers as the fire step does (low to high).
- **The sight cache** is triangular.
- **app-check** reads the company count.

**Not done:**
- tests for the extent cull and the low-to-high walk (open question in the system doc);
- the per-battalion cull optimisation.

One `check:app` run failed for a reason not captured; the two runs after passed.

**Left for S1c-2 and S1c-3:** as in the split above.
