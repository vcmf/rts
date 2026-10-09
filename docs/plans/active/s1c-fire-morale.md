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
