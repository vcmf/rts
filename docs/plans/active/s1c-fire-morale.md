---
status: active
last_reviewed: 2026-10-09
---

# Plan: S1c, fire, cohesion and morale

The third part of S1 (`docs/plans/done/s1a-formations-on-spine.md`, breakdown). Battalions fire on the
enemy, take casualties, lose order and heart, and break. The design is `docs/proposals/sim-design.md`
§8 (fire), §10 (morale and cohesion) and §12 (standing behaviour); this plan is the slice of it that S1c
builds. S1c ends when **two lines exchange fire at 100 m and the weaker breaks in 6–10 minutes of battle
time.**

## Scope

### Fire (tick step 8), per company

A company is the firing unit: its facing comes from the shape (a square's four faces fire four ways).
Every number below is ruleset data (`fire` in `src/rulesets/napoleonic.ts`); the engine has no musket in
it (decision 0015).

- **Who may fire:**
  - the battalion is not moving under an order, not changing shape, and not routing;
  - its fire mode is *at will*. The mode is a new command, `fire`, with `at will` and `hold`, and an
    optional target the battalion prefers while it is valid.
- **Target:**
  - the nearest enemy company whose centre is within range and inside the company's fire arc (data: a
    half-angle about its facing);
  - with a clear line: the heightfield does not rise above the sight line (sampled every 7 m, eyes at
    1.6 m), it does not cross more than the ruleset's metres of woods, and no friendly battalion stands
    across it (each battalion's start-of-step rectangle: anchor, heading, half-width, depth);
  - kept while valid, re-chosen every 0.5 s (staggered by slot), ties broken by slot index.
- **Volleys:** each company reloads on its own (data: about 25 s, drawn ±20% from the sim RNG so the
  companies ripple). A loaded company with a target fires:
  - rounds = men in its firing ranks (data: the front two of three) × (1 − misfire);
  - expected hits = rounds × p(range) × modifiers;
  - p(range) is a piecewise linear table, calibrated (below);
  - the modifiers are the shooter's morale state and cohesion and the target's depth (a column is easier
    to hit than a line). Each is one plain function of its terms in a fixed order (sim-design §13).
  - Casualties are `sampleCount` around the expected value, given to the target's companies in arc and
    range, weighted by their men.
- **Order:** every volley in a tick is computed from positions after movement (steps 5–6). Casualties
  collect in a per-company array and are applied together at step 11, so no shooter's result depends on
  another's slot.
- **For the renderer:** each company keeps its last volley's tick and target (state, hashed). The page
  draws a flash and a fading line from them, without an event ring (that is S2).

### Casualties (step 11), and the re-packing gate

The losses are removed man by man from the target's companies. Closing files after a loss is the fill
rule `occupied`, which S1a left ungated (`docs/known-issues.md`).

S1c gates it. A loss whose new fill would put a bin newly on impassable ground (`wetBins`, as for any pose
change):
- goes to another company in arc;
- failing that, the lean flips;
- failing both, the loss stands and the battalion records `pressed against impassable ground`.

A test at the bank is the check. The known issue is closed only if that test passes; if not, the residual
stays recorded.

### Cohesion

**Cohesion is `1 − disorder`.** S1a's `disorder` (order in the ranks lost to lagging files and a bowed
line, recovered by halting) gains two sources:
- casualties, a share per man lost;
- routers passing through (deferred: no contact between formations yet).

It acts through fire effectiveness and morale pressure.

### Morale (step 12)

Each battalion has a `morale` from 0 to 1 and a **state**: steady, shaken, wavering, routing, rallying,
or shattered. It starts at the battalion's quality, an optional `morale` on `debug-spawn` (default
ruleset data).

**Per tick**, all computed from start-of-step state and applied together:
- **pressure:**
  - recent losses: a decaying sum, about 10 s, of men lost, as a share of the starting strength;
  - total losses as a share;
  - under fire;
  - low cohesion;
  - enemy fire from the flank or rear arc;
- **support:** a steady friendly battalion within a ruleset distance on a flank. Commanders come in S2.
- **recovery:** when not under fire, faster when halted.

**Shocks:**
- losses of a ruleset share inside about 10 s;
- a friendly battalion beginning to rout within a radius, larger to its front.

**States** follow thresholds with hysteresis (data), in two layers.
- **Fire:** shaken and wavering fire worse.
- **Movement:**
  - a wavering battalion under fire falls back, a Retire issued by standing behaviour, once per
    wavering;
  - a routing battalion drops its orders and does not fire. It runs at the ruleset's rout pace straight
    away from the nearest enemy, Face about first where the shape allows. It stops at impassable ground
    (no pathfinding yet);
  - out of fire for a time, a router rallies, and then becomes steady again;
  - a battalion below a strength share, or routing for too long, is **shattered** and never rallies. S1e
    decides what happens to the shattered (the end condition).

### Standing behaviour (step 4)

Return fire is the fire rule above: a halted battalion in *at will* fires on its own. Standing behaviour
adds the wavering fall-back and the rout. Squares against cavalry come with cavalry (S1d).

### The page

- Flashes and fire lines from the volley state.
- A morale bar and the state by each battalion's colours.
- Routing men loosen around their slots.
- Fire mode buttons (at will, hold).
- The readout: morale, state, losses.
- A scenario `s1c-firefight`: two lines 100 m apart, the second of lower quality, plus a few battalions
  to drill.

## Calibration

`tools/calibrate-fire.ts` runs the firefight headless over seeds and ranges, and prints the time to
break and the losses at the break. p(range) and the morale weights are tuned until:
- **at 100 m:** the median time for the weaker line to break is 6–10 minutes over 20 seeds, and the
  stronger line breaks first in at most 3 of them;
- **at 200 m:** neither line breaks within 20 minutes;
- **at 50 m:** the break comes in under 5 minutes.

The tuned values are data, with the sweep's table in the results. Vitest runs a smaller sweep (5 seeds)
as the regression check.

## Acceptance

1. The calibration targets above hold, with the sweep table in the results.
2. **Rules, in Vitest:**
   - fire needs arc, range and a clear line: none over a crest, none through a friend, none past the
     woods limit;
   - hold fire holds;
   - a moving or changing battalion does not fire;
   - casualties go only to companies in arc and range;
   - the order of slots does not change results (a mirrored scenario gives the mirrored outcome);
   - every state transition, rout and rally included, happens in a scripted case;
   - a router runs away from the enemy and stops at impassable ground;
   - the re-packing gate at a bank.
3. **Determinism:** a golden of the firefight; its replay and save round trip reproduce the hashes.
   `SIM_VERSION` and `SAVE_FORMAT` move on.
4. **Cost:** 40 battalions, half facing half at 100 m and all firing, sim plus soldier layer per frame
   at 1× within the 4 ms budget. Fire and morale's share of the tick is reported.
5. **The page:** `npm run check:app` runs the firefight to a break headless, with no console error, and
   plays the session back in Node.
6. **Negative runs:**
   - p(range) at zero gives no break;
   - removing the start-of-step snapshot makes the mirrored test fail;
   - the gate disabled fails the bank test.

## Non-goals

- Smoke, vision and fog of war (S2).
- Commanders and their radius (S2).
- Ammunition and fatigue (S3).
- Melee, charges and contact between formations (S1d).
- Artillery and cavalry (S1d).
- Skirmishers.
- Pathfinding for routers.
- Firing on the move.

## Risks

- **Calibration on one scenario.** Equal lines at fixed ranges can tune a model that feels wrong in a
  messy fight. S1e's playtests are the real check; this plan only guarantees the numbers are in one place
  and the sweep reruns in a minute.
- **Morale with many weights.** Too many terms to tune by hand. The sweep reports each term's share of
  the pressure at the break, so a term that never matters can be cut.
- **Cost of sight lines.** About 30 samples per candidate pair, at 2 Hz per battalion. If the cost test
  shows it near the budget, candidates are culled by range first, and only the chosen target is
  re-checked between choices.

## Also in this PR

- The S1b plan moves to `docs/plans/done/`.
