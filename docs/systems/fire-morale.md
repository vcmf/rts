---
status: current
last_reviewed: 2026-10-09
code: [src/sim/fire.ts, src/sim/morale.ts, src/sim/rng.ts, src/sim/tick.ts, src/rulesets/napoleonic.ts, src/scenarios/s1c-firefight.ts, tools/calibrate-fire.ts, test/fire.test.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0007-battalion-scale, 0015-era-generic-engine]
---

# Fire and morale (S1c-1)

Battalions fire by company on enemies in arc and range with a clear line, lose men, and break when the
losses take their morale below the rout threshold. Every number is ruleset data (`fire`, `morale`);
the hit chances are calibrated on the time a firefight takes to break a line, not on historical hit
rates.

```
step 8 fire        geometry after movement → targets (every 0.5 s, a tenth of the battalions per tick)
                   → loaded, halted companies volley → hits owed to the target's companies (keyed draws)
step 11 casualties the owed men fall
step 12 morale     morale relaxes toward quality − losses; states with hysteresis; a break starts the rout
```

## Goals / non-goals

- **Goals:**
  - two lines at 100 m break the weaker in 6–10 minutes;
  - results do not depend on slot order;
  - the numbers live in the ruleset and are tuned by a sweep.
- **Non-goals (later parts):**
  - rally, shattered, contagion, flank support, the wavering fall-back (S1c-2);
  - the casualty re-packing gate (S1c-3);
  - smoke, vision and commanders (S2);
  - melee, cavalry and artillery (S1d).

## Constraints

- **Exact operations only (decision 0006).** The two decay factors that need `exp` are computed once
  when the ruleset compiles.
- **Every draw is keyed.** The seed comes from the world seed, the tick, the shooter's handle and
  company, and a purpose tag (`keyedStream`). A draw depends on who draws and when, never on the order
  battalions are visited in or how many draws came before. The world stream is not used.
- **The tick budget (sim-design §16, 2 ms).** With 40 battalions firing, the fire step averages 0.27 ms a
  tick and peaks at 0.74 ms.

## Design

**Fire, per company** (`fire.ts`).

Each step starts from the companies' poses after movement: centre, facing, and the block's origin and
rotation.

**May fire:**
- the battalion is halted: no order at its head, or a dress;
- it is not changing shape and not routing;
- its fire mode is at will (the `fire` command sets *at will* or *hold*, with an optional preferred
  target).

**Target:**
- the preferred battalion, else the current one, else the enemy whose nearest *visible* company in the arc
  (`fire.arc`) and range (`fire.maxRange`, centre to centre) is nearest. Candidates are taken by their
  nearest company in arc, a bound that stops the search once it passes the best found;
- the sight line: the heightfield stays below it (eyes at `fire.eye`, sampled every 2 m), and it crosses
  no more of a class than `fire.sight` allows (woods 40 m, dense wood 15 m);
- re-chosen every 0.5 s, staggered by slot (all at once cost 2.3 ms on one tick), stored as a handle.

**Volley:** a loaded company fires at the target's nearest company in its arc with a clear sight line.
The companies are tried nearest first, so one hidden in a wood does not hide the rest.
- **Rounds** = men in the firing ranks × the share of its three rays (both front ends and the centre)
  that no friendly block crosses × (1 − misfire). Its own battalion's other companies count as friends,
  so a column's rear companies do not fire.
- **Expected hits** = rounds × p(range) × the state factor × (1 − `cohesion` × disorder) × the target
  kind's depth factor.
- The integer part of the expected hits is certain, and one keyed draw settles the fraction.
- Each hit goes to a target company in the shooter's arc and range **that it can see**, weighted by its
  men. A sight line is walked once per company pair for each build of the geometry (the cache is stamped
  with the build, and keyed low to high since a sight line is the same both ways).
- **Reload:** about 25 s, ±20% keyed. At spawn each company is part-loaded, so a line opens with a
  ripple, not one crash. A loaded company that cannot see its target or is fully covered tries again
  in 0.5 s.

The renderer reads each company's last volley tick and target (hashed state); there is no event ring
yet (S2).

**Casualties** (step 11). The owed men fall. Hits owed beyond a company's men are lost: passing them on
could strike a company the shooters cannot see.

**Morale** (`morale.ts`), per battalion. It is loss-driven: being fired at moves nothing, and disorder
moves nothing (a march through a wood pins disorder at 1 with no enemy in sight). Men falling move it.

```
target = quality − losses · (start − men) / start − recent · recentLosses / start
morale += (target − morale) · relax          // relax = 1 − exp(−DT / relaxTime)
recentLosses = recentLosses · exp(−DT / recentTime) + lost this tick
```

**States**, by thresholds with hysteresis (data):
- steady;
- shaken and wavering, which fire worse;
- routing, below `rout`.

**Routing.** The battalion drops its orders, refuses every command except the debug ones, and does not
fire. Its rout is a small stored state, fixed at the break and never re-derived from the battalion as it
is later:
- **The direction** (`routX`, `routZ`): its side's rear (the `side` command), else straight back from its
  heading at the break.
- **The phase** (`routPhase`): running, halted or fled.
  - Each run is a move at `routPace` times its pace, kept 2 m inside the map. It has a Face about first
    when the shape allows and the way is behind it; if that turn fails (water behind it), the run goes
    on as it stands.
  - When its orders end, a router whose status says it halted at impassable ground is *halted*.
    Otherwise it got where it was going, or as near as it could, and has *fled*: it stays.
  - Only a halted router tries again: every 5 s, the next direction of a fan about the stored one (the
    direction itself, then turned 60° each way, then 120°). After the fifth it stays, pinned.
- **The run counter** advances only when the run's order was made, so a full order pool delays a run but
  uses up no direction.

A router does not rally yet.

**Quality** comes from `debug-spawn`'s `quality` or the ruleset default; the spawn's `fire` sets the
starting fire mode (the S1a drill and the S1b scenarios spawn holding fire). `debug-morale` sets it, for
scripted tests.

## Tunables

`fire` and `morale` in `src/rulesets/napoleonic.ts`. Their effect is measured by
`npm run calibrate:fire` (or `node tools/calibrate-fire.ts [seeds]`) (results in `docs/plans/active/s1c-fire-morale.md`).

## Verification

- **`test/fire.test.ts`:**
  - **Who may fire:**
    - the range limit;
    - a crest on the real field;
    - the woods limit;
    - friends' cover, by ray share;
    - hold fire;
    - no fire while moving or changing shape.
  - **Casualties:** only in the shooter's arc and range.
  - **Morale:**
    - p = 0 means no break;
    - the hysteresis sequence;
    - a router refuses orders, does not fire and runs to the map edge;
    - no break in the first minute at 50 m.
    - **Routers:**
    - a router whose Face about fails keeps its run order;
    - a router halted at the stream runs another way;
    - one that arrives stays, fled;
    - with no rear set, the fan turns about the stored direction;
    - a full order pool uses up no direction.
  - **Partial sight:** companies of a target hidden in a wood take no hits; the rest are fired on.
  - **Determinism:**
    - the fire step in reversed visiting order gives the same hash (a per-world test switch);
    - the firefight golden, with its replay and save round trip;
    - a five-seed calibration golden.
- **`test/soldiers.test.ts`:** 40 battalions firing, per-frame cost and per-tick fire cost.
- **`tools/calibrate-fire.ts`:** 100 seeds at 50, 100 and 200 m on levelled ground, checked against the
  plan's targets.
- **`npm run check:app`:** plays the firefight on the page to a rout and replays it in Node.

## Open questions

- **The recent-losses term barely matters in a firefight.** It is 0.02–0.04 at the break, against 0.25
  for total losses. It is kept for bursts (artillery, charges, S1d); if those do not use it, cut it.
- **Every weaker line breaks at the same share of losses (20%),** because the target is linear in losses
  and nothing else moves morale. Variety will come from S1c-2's shocks and support.
- **A router can be pinned.** Where every direction of the fan halts, or where the formation layer cannot
  march out (by the stream at x ≈ 57, z = −30 even an ordinary battalion halts within a metre), it
  stays. Pathfinding, and routers as a loose crowd rather than a formation, are later.
