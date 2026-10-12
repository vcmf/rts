---
status: current
last_reviewed: 2026-10-11
code: [src/sim/fire.ts, src/sim/morale.ts, src/sim/rng.ts, src/sim/tick.ts, src/rulesets/napoleonic.ts, src/scenarios/s1c-firefight.ts, tools/calibrate-fire.ts, test/fire.test.ts, test/morale.test.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0015-era-generic-engine, 0018-battalion-of-400]
---

# Fire and morale (S1c)

Battalions fire by company on enemies in arc and range with a clear line, lose men, and break when the
losses take their morale below the rout threshold. A break shocks nearby friends; friends on the flanks
steady a line; a wavering line falls back; a router out of danger rallies, brittle, or shatters. Every number is ruleset data (`fire`, `morale`);
the hit chances are calibrated on the time a firefight takes to break a line, not on historical hit
rates.

```
step 8 fire        geometry after movement → targets (every 0.5 s, a tenth of the battalions per tick)
                   → loaded, halted companies volley → hits owed to the target's companies (keyed draws)
step 11 casualties the owed men fall (all battalions first)
step 12 morale     then morale for all: relaxes toward quality − losses + flank support, less contagion
                   shocks; states with hysteresis; a break starts the rout, a wavering line falls back, a
                   router rallies or shatters (reading other battalions' states as they were before this step)
```

## Goals / non-goals

- **Goals:**
  - two lines at 100 m break the weaker in 6–10 minutes;
  - results do not depend on slot order;
  - the numbers live in the ruleset and are tuned by a sweep.
- **Non-goals (later parts):**
  - smoke, vision and commanders, with their rally radius (S2);
  - flank and rear threats from musketry (charges strike flanks and rears since S1d-2, `docs/systems/melee.md`);
  - the end condition (S1e-2);
  - artillery (`docs/systems/artillery.md`, S1d-3: its pieces use this targeting with their own arc and range).

## Constraints

- **Exact operations only (decision 0006).** The two decay factors that need `exp` are computed once
  when the ruleset compiles.
- **Every draw is keyed.** The seed comes from the world seed, the tick, the shooter's handle and
  company, and a purpose tag (`keyedStream`). A draw depends on who draws and when, never on the order
  battalions are visited in or how many draws came before. The world stream is not used.
- **The tick budget (sim-design §16, 2 ms).** With 40 battalions of 400 firing (in column, so they fit the
  field), the fire step averages 0.6 ms a tick and peaks at 1.5 ms; morale and casualties 0.09 ms.

## Design

**Fire, per company** (`fire.ts`).

Each step starts from the companies' poses after movement: centre, facing, and the block's origin and
rotation.

**May fire:**
- its unit type fires by company (`fires`: the Napoleonic infantry; a cavalry regiment and a battery do not,
  until S1d-2 and S1d-3, but are fired on, lose men and have morale like a battalion);
- the battalion is halted: no order at its head, or a dress;
- it is not in melee (`docs/systems/melee.md`);
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

**Casualties** (step 11). The owed men fall, one at a time through the re-packing gate
(`docs/systems/formations.md`). In the rare case where a loss's re-pack would put a man on impassable
ground, it falls on another company, those owed hits first: about one loss in 62,000 in the probe along the bank, and the
"hits only on companies the shooter can see" rule bends there. Hits owed beyond a company's men are
lost: passing them on could strike a company the shooters cannot see.

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
- **The direction** (`routX`, `routZ`):
  - its side's rear (the `side` command);
  - else away from the nearest enemy at the break, counting only enemies with men left that were not
    routing at the start of the step (its heading may already be turned away, by a Retire);
  - else straight back.
- **The phase** (`routPhase`): running, halted or fled.
  - Each run is a move at `routPace` times its pace, kept 2 m inside the map. It has a Face about first
    when the shape allows and the way is behind it. That Face about is an *optional* order: if it fails
    (water behind it), the run goes on as it stands.
  - When its orders end, a router whose status says it halted at impassable ground is *halted*.
    Otherwise it got where it was going, or as near as it could, and has *fled*: it stays.
  - Only a halted router tries again: every 5 s, the next direction of a fan about the stored one (the
    direction itself, then turned 60° each way, then 120°). After the fifth it stays, pinned.
- **The run counter** advances only when the run's order was made, so a full order pool delays a run but
  uses up no direction.

**Flank support and contagion** (S1c-2). Both read the other battalions' states from before the step. The
numbers are `morale.support` and `morale.contagion` in `src/rulesets/napoleonic.ts`. Distances are centre
to centre, so the reaches scale with the frontage: S1c-4 multiplied S1c-2's by 2.8, the ratio of a
brigade's spacing at 400 men (113 m) to that at 100 (40 m). Unscaled, a 400-man brigade's neighbours fell
outside contagion's reach and its breaks spread over 35–135 s instead of one tick.
- **Support:** a friend in the fight within `support.reach` and within `support.arc` of a battalion's left or
  right axis secures that flank. Each secured flank adds `support.bonus` to the target. Left and right swap
  under a Face about, so both are still counted.
- **Contagion:** a battalion that breaks records the tick (`brokeTick`). In the next tick each friend loses
  `shock × (1 − d/R)` of its morale, after relaxing. R is `contagion.front` for a break ahead of the side's
  front (away from its rear, else the friend's heading), else `contagion.back`. A chain of breaks travels
  one link per tick. The ruleset is refused if one shock could rout a steady battalion of default quality
  (more than 0.6 of the gap from it to the rout).

**The wavering fall-back.** A wavering battalion Retires `fallback.metres` once, by the Retire drill
(`RETIRE` in `formation.ts`), when all of these hold:
- it has no orders, is not changing shape and is not in melee;
- its morale has fallen by more than `fallback.rate` a second on every tick of the last `fallback.after`
  seconds, so the relax's slow crawl onto a fixed target does not count;
- the nearest enemy in the fight is within fire range and in front of it (within 90° of its heading). A
  Retire goes back from its own facing; with the enemy behind it, it would march toward the enemy.

The flag clears when it recovers to shaken. A player's order replaces the Retire.

**Rally** (`morale.rally`). A router rallies when all of these hold:
- its run has ended: a run was made and it is no longer running (a full order pool can leave a router
  unmoved where it broke, which does not count);
- no enemy in the fight is within `rally.safe`;
- it has lost no man for `rally.calm` seconds (every loss through `removeMan` counts);
- its quality less `rally.cost` is still at least the wavering threshold.

Rallying:
- writes off the losses before the rout (the losses term counts from `baseMen`, its men now; recent losses
  stay a share of the spawn strength) and costs it `rally.cost` of quality, so it comes back brittle.
  Without the write-off no router could ever rally: the target at a break is the rout threshold itself;
- stands for `rally.time` seconds, refusing orders and not firing, then takes the state its morale gives.

**Breaking ranks** (S1e-2, #39). A battalion that breaks while changing shape cuts the change short where it
stands: it takes whichever of its two shapes the change is nearer to, by its progress, and runs at once. Its places
jump by up to half the change; the soldier layer's men walk the difference.

**Leaving the field** (S1e-1). A shattered formation with any corner of a company block within `morale.leave`
(12 m) of the map's edge leaves the field: a line meeting the edge at an angle, or a column of route's tail, gets
there before its anchor. It is removed at step 14 (reap), and its men are added to its side's count
(`sides.left`, hashed); the tick's result names it with its men (`departed`), so the soldier layer lets them go
rather than fall. A run's order is kept 2 m inside the map, so a run to the side's rear ends there. A router there stays:
it may still rally (above).

**Shattered.** A break beyond `rally.max` rallies, or a router below `morale.shatter` of its spawn strength,
shatters: it runs as a router, never rallies, and refuses orders. A router mid-run, like a shattered one,
skips the survey of the others and its morale step: nothing it would read is used.

**Charges' shocks** (S1d-2): the melee step owes a target the shock of a charge's threat and impact
(`shockIn`); morale takes it with contagion, after relaxing, and a router takes none (`docs/systems/melee.md`).

**Out of the fight** (routing, rallying, shattered: `mstate ≥ MS_ROUTING`): no fire, no threat to an enemy,
no support to a friend. Every order but the debug ones is dropped, with the state as the reason.

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
    - a battalion that breaks mid-Retire runs away from the enemy;
    - a full order pool uses up no direction.
  - **Partial sight:** companies of a target hidden in a wood take no hits; the rest are fired on.
- **`test/morale.test.ts`** (S1c-2):
  - **Rally:** when a router rallies and what it writes off; it refuses orders while rallying and holds
    after; no rally near an enemy, while losing men, or below the quality floor.
  - **Shattered:** below half strength, and beyond the rally allowance.
  - **Contagion:** the shock's size, one tick late; a wavering neighbour breaks and a steady one does not;
    front and back radii; a chain, one link per tick, the same in reverse visiting order.
  - **Support:** two flanks against none; no support from a friend ahead, behind or routing.
  - **Fall-back:** once, 15 m, then fires again; not with orders, with no enemy in range, with the enemy
    behind it, on the relax's crawl, or on a dip.
  - **Determinism:** the brigade's replay, and a save taken with one battalion rallying, one routing and
    one mid-fall-back.
  - **Determinism:**
    - the fire step in reversed visiting order gives the same hash (a per-world test switch);
    - the firefight golden, with its replay and save round trip;
    - a five-seed calibration golden.
- **`test/soldiers.test.ts`:** 40 battalions of 400 firing, per-frame cost and per-tick fire cost.
- **`test/scale.test.ts`:** friendly cover by each battalion's extent, with a 400-man friend whose outer
  company stands more than 40 m from its anchor.
- **`tools/calibrate-fire.ts`:** 100 seeds at 50, 100 and 200 m on levelled ground, checked against the
  plan's targets; the 100 m row again without the fall-back; a 3v3 brigade's contagion (reported). Lines
  of 400 (S1c-4): the 100 m median is 9.3 min, at 20% losses.
- **`npm run check:app`:** plays the firefight on the page to a rout, and the brigade until a break
  spreads, and replays both in Node.

## Open questions

- **The recent-losses term barely matters in a firefight.** It is 0.02–0.04 at the break, against 0.25
  for total losses. It is kept for bursts (artillery, charges, S1d); if those do not use it, cut it.
- **Every lone weaker line still breaks at the same share of losses (20%).** In a brigade, support and
  contagion vary it: the inner line holds longer, and a break takes worn neighbours with it. In the 3v3
  calibration (`docs/plans/active/s1c2-morale-machine.md`, Results) the median time from the weaker side's
  first break to its last is 0.1 s, and in most seeds all three of its lines are out of the fight 3 minutes
  later. A brigade worn evenly collapses together; whether that is too total is for S1e's playtests.
- **Routers on the formation field never rally in the brigade.** They are pinned at the stream about 240 m
  from the enemy, inside `rally.safe`. The field is 360 m across; battle maps are 1–1.5 km.
- **The order pool is served in visiting order.** Routs and fall-backs in the same tick take pool entries
  in slot order, so the reverse-visiting switch gives the same behaviour but different entries (and a
  different hash) when two happen in one tick. The chain test breaks one link per tick.
- **One sight fix has no failing test.** Walking sight lines low to high is not exercised: the
  floating-point asymmetry cannot be set up on purpose. (Culling friendly cover by each battalion's extent
  is tested since S1c-4: a 400-man line reaches 46 m.)
- **A router can be pinned.** Where every direction of the fan halts, or where the formation layer cannot
  march out (by the stream at x ≈ 57, z = −30 even an ordinary battalion halts within a metre), it
  stays. Pathfinding, and routers as a loose crowd rather than a formation, are later.
