---
status: active
last_reviewed: 2026-10-10
---

# Plan: S1c-2, the rest of the morale machine

The second part of S1c (`docs/plans/active/s1c-fire-morale.md`, the split). S1c-1 gave a loss-driven
morale with four states and a rout that never ends. This part adds what `docs/proposals/sim-design.md` §10
and §12 still ask for:
- rallying and shattered;
- rout contagion;
- flank support;
- the wavering fall-back.

The review of the first S1c draft (`docs/research/s1c-plan-review.md`, S2, S3, M4, M5, L2, L4, L6) set
several of the rules below.

## The problem a rally has to solve

Morale relaxes toward `quality − losses·(lost/start) − recent·(recent losses/start)`. A battalion breaks
when its morale reaches the rout threshold (0.4), which happens only when the target is there too. In the
calibration every weaker line breaks at 20–21% losses, with a target of about 0.4.

So a router's target stays at the rout threshold however long it rests. No rally rule based on morale
can ever fire. A rally has to change the target. In this plan it **writes off the losses before the
rout and costs quality**:
- the losses term counts from the men the battalion has at the rally;
- its quality drops by `rally.cost`.

A rallied battalion of the weaker line (0.65) comes back at 0.55, shaken. A few more losses break it
again, which is how rallied troops behaved. Its strength is still what it is: the readout's losses and the
shatter threshold count from its strength at spawn.

## Design

Every number below is ruleset data (`morale` in `src/rulesets/napoleonic.ts`); the values given are the
starting ones.

### States

```
steady ⇄ shaken ⇄ wavering ──► routing ──► rallying ──► (steady | shaken | wavering)
                                  │  ▲                │
                                  │  └── losses ──────┘
                                  └──► shattered (never rallies)
```

- The new states come after `routing`: `MS_RALLYING = 4`, `MS_SHATTERED = 5`. **Out of the fight** means
  routing or later (`mstate ≥ MS_ROUTING`):
  - it does not fire;
  - it is not a threat to an enemy (the nearest-enemy search of a rout, a rally's safety check);
  - it gives no flank support;
  - it is not shocked by contagion, except a rallying battalion (it is still forming).
- **Commands by state** (M5), each dropped with its reason:

  | State | Orders | Fires |
  |---|---|---|
  | steady, shaken, wavering | accepted | yes (worse when shaken, wavering) |
  | routing | dropped, `routing` | no |
  | rallying | dropped, `rallying` | no |
  | shattered | dropped, `shattered` | no |

  The debug commands are always accepted.

### Rally

A router rallies when all of these hold:
- **its run has ended:** it is halted at impassable ground or has fled (phase not `running`);
- **it is safe:** no enemy in the fight within `rally.safe` (250 m, the musket's maximum range), centre to
  centre. The formation field is 360 m across, so routers flee to an edge about 290 m from the enemy;
- **it is calm:** no man lost for `rally.calm` seconds (20);
- **it may still rally:**
  - `routs ≤ rally.max` (2; a battalion that breaks a third time shatters);
  - its quality less `rally.cost` is at least the wavering threshold (0.5). Below that it would rally only
    to break again at once, so it keeps running. The weaker line (0.65) may rally once; the stronger (0.8)
    up to the allowance.

Then it is **rallying**:
- its orders are dropped and it stands;
- its quality drops by `rally.cost` (0.1);
- its losses baseline becomes its men now;
- its recent losses are cleared, and its morale is set to its new quality.

After `rally.time` seconds (30) it takes the state its morale gives (below `wavering[0]` wavering, below
`shaken[0]` shaken, else steady) and accepts orders again. It stays facing the way it ran, and turning it
round is the player's job. If its morale falls below the rout threshold while rallying, it routs again.

Commanders' radius and rally bonus (§6) come with commanders in S2.

### Shattered

A battalion shatters, for good:
- when it routs and its rally allowance is spent (`routs > rally.max`);
- or when, while routing, its men fall below `shatter.strength` (0.5) of its strength at spawn.

A shattered battalion behaves as a router (it runs, fans out at impassable ground, flees) and never
rallies. It stays on the map. Removing it at the map edge is S1e's call, with the end condition.

### Contagion

A battalion that breaks shocks its friends **once, in the next tick**:
- it records the tick it broke (`brokeTick`);
- in a later tick, each friend reads `brokeTick == this tick − 1`, a value fixed before this step began.
  So the order battalions are visited in cannot matter, and a chain of breaks travels one link per tick
  (L2).

**The shock** takes `contagion.shock × (1 − d/R)` straight off the friend's morale, after its relax step:
- `d` is the distance between the anchors;
- `R` is `contagion.front` (200 m) when the broken friend is ahead of it, else `contagion.back` (100 m).
  Men see a line break in front of them.
- "Ahead" is judged against the side's front, which is the opposite of the side's rear when a scenario sets
  it, else the friend's heading. A battalion faced about by a Retire then still knows where the enemy is.
- **The bound** (L2): `shock` ≤ 0.6 of the gap from the default quality (0.75) to the rout threshold (0.4),
  which is 0.21. With 0.15, one shock cannot break a steady battalion of default quality. It takes a
  shaken or wavering one, or several breaks at once.

Routing, shattered and dead friends are not shocked. A rallying friend is, since it is not yet formed.

### Flank support

A battalion's flank is **secured** when a friend in the fight stands within `support.reach` (100 m) and
within 45° of its left or right axis. Each secured flank adds `support.bonus` (0.04) to its morale target:
- left and right are counted once each, so a line inside a brigade line gets 0.08;
- a battalion faced about keeps its two flanks, swapped, so no "front of record" is needed;
- support is read from the states at the start of the step, like contagion.

The 1v1 calibration has no friends, so it does not move. Threats to a flank (an enemy in the flank arc)
come with charges, S1d.

### The wavering fall-back

A standing behaviour, taken in the morale step like the rout:
- **when:**
  - the battalion is wavering;
  - it has no orders and is not changing shape;
  - its morale has fallen by more than `fallback.rate` (0.0005 a second) on every tick of the last
    `fallback.after` seconds (3). Under steady fire it falls about 0.001 a second; the relax's slow crawl
    onto a fixed target, which goes on for minutes, does not count;
  - the nearest enemy in the fight is in front of it (within 90° of its heading). A Retire goes back from the
    battalion's own facing, so with the enemy behind it, a rallied battalion facing the way it ran, it
    would march toward the enemy;
  - it has not fallen back yet in this wavering spell;
  - an enemy in the fight is within musket range (`fire.maxRange`). It falls back *from* someone; with no
    enemy, a break mid-Retire would run "straight back" from its turned heading, toward where it faced.
- **what:** it Retires `fallback.metres` (15 m, tuned from 30: see Results), the Retire command's own
  orders: face about, march, dress, face the front.

The "falling" condition (S3) keeps a battalion that dips into wavering on one shock and recovers at once
from running. The flag clears when it climbs back to shaken or rallies.

A player's orders always win. The behaviour starts only when the battalion has none, and a new order
replaces the Retire. While retiring it does not fire (it is moving); at 115 m it fires again. Morale reads
no arcs, so taking fire in the back during the Retire changes nothing (S3's spiral cannot happen).

### State added

Every new column is saved and hashed (`columnsOf`), so `SAVE_FORMAT` goes to 6. `SIM_VERSION` goes to
`s1c.3`.

Per battalion:
- `baseMen`: the men the losses term counts from (the spawn strength until a rally);
- `brokeTick`: the tick it last broke;
- `lastLoss`: the tick it last lost a man;
- `since`: the tick it started rallying;
- `falling`: ticks in a row with morale falling;
- `fellBack`: whether it has fallen back in this wavering spell;
- `routs`: how many times it has broken.

### Determinism

The morale pass already reads states from a copy taken before the step (`mstateBefore`). Contagion and
support read that copy and `brokeTick` from earlier ticks. The test switch that visits the fire step in
reverse (`reverseFire`) becomes `reverse` and covers the morale pass too. Order allocation from the shared
pool stays the one known order dependence (a fall-back, like a rout, takes orders from it in slot order).

### The page

- Colours and names for the rallying and shattered states (`MORALE_INK`, the readout).
- Shattered men loosen as routers do; rallying men start to close up.
- **A new scenario, `s1c-brigade`:** three lines a side, 100 m apart, 40 m between neighbours, on an open
  band of the field (x ≈ −60, z −105..30; the firefight's strip is too narrow). It shows support, the
  weaker side wearing down, a break and contagion. Its routers do not rally: on this 360 m field they are
  pinned at the stream, about 180 m from the enemy, inside `rally.safe`. The rally is shown by scripted tests.
  `npm run check:app` plays it to the first contagion and replays the session in Node.

## Calibration

`tools/calibrate-fire.ts` reruns as in S1c-1. Contagion and support cannot touch a 1v1. The fall-back and
the rally can:
- the fall-back takes a wavering line from 100 m to 115 m, where both sides hit less;
- a rally can put the weaker line back in the fight after its first break.

The time to break is still "to the first rout", so a rally does not change it.

- **The S1c-1 targets must still hold:**
  - at 100 m, a median of 6–10 minutes;
  - 12–25% losses at the break;
  - the stronger line first in at most 15% of seeds;
  - at 200 m, no break within 20 minutes in at least 95%;
  - at 50 m, a median under 5 minutes.
- **The sweep reports the 100 m row with and without the fall-back** (S3), so its share is known. If the
  median leaves 6–10 minutes, `fallback.metres` is tuned before the hit chances.
- **A brigade row (3v3, 100 m), reported but not targeted:** how often the weaker side's other lines break
  by contagion, and the time from the first break to the last. S1e's playtests set targets.

The five-seed golden table is regenerated.

## Acceptance

1. **Calibration:** the S1c-1 targets hold, and the table has the fall-back on and off and the brigade row.
2. **Rules, in Vitest** (`test/morale.test.ts`; the cases are scripted with `debug-morale` and
   `debug-kill`, L6):
   - **Rally:**
     - a router whose run has ended, beyond 250 m from any enemy, with no losses for 20 s, rallies;
     - it refuses orders (`rallying`) and does not fire for 30 s, then takes orders;
     - its quality is 0.1 lower, and it holds for a minute after rallying (it does not re-rout at once);
     - no rally while an enemy in the fight is within 250 m, or while it is losing men, or while running.
   - **Shattered:**
     - a router below half its spawn strength shatters and never rallies;
     - a third break shatters;
     - a shattered battalion refuses orders (`shattered`).
   - **Contagion:**
     - three lines side by side, the middle one broken: both neighbours lose `shock × (1 − d/R)` in the
       next tick, not this one;
     - a wavering neighbour breaks, a steady one at default quality does not;
     - a break 150 m ahead shocks, one 150 m behind does not;
     - the morale pass in reverse order gives the same hash, with a chain of breaks.
   - **Support:**
     - a line between two friends has a target 0.08 higher than one alone, and breaks later under the
       same scripted losses;
     - a friend ahead or behind gives none, and neither does a routing friend.
   - **Fall-back:**
     - a wavering, idle battalion with morale falling, an enemy in range, Retires 15 m once, faces the front,
       and fires again;
     - one with no enemy within musket range does not;
     - one with orders does not;
     - one whose morale dips into wavering and rises again does not.
3. **Determinism:**
   - the goldens move (new state);
   - the firefight and brigade replays and a save round trip reproduce. The save is taken mid-rally, with
     one battalion rallying, one routing and one wavering mid-Retire.
4. **Cost:** the 40-battalion fire test stays within its budget. The morale step's share of the tick is
   reported; its contagion and support scans are O(n²) over battalions.
5. **Negative runs**, each to be caught by a named test:
   - contagion read from the current state in the same pass: the reverse-order test fails;
   - the fall-back on any wavering, without the falling check: the dip test fails;
   - a rally without the losses write-off: the "holds for a minute" test fails;
   - support from a routing friend: the routing-friend test fails.
6. **Docs:**
   - `docs/systems/fire-morale.md` describes the machine and loses its "does not rally yet";
   - the S1c plan's split marks S1c-2 done;
   - the open question "every line breaks at the same share" is answered or kept, from the brigade row.

## Non-goals

- Commanders, their rally radius and their death as a shock (S2).
- Flank and rear threats, charges (S1d).
- Removing shattered battalions at the map edge; the end condition (S1e).
- Routers as a loose crowd, pathfinding for routers.
- Fatigue and ammunition (S3).

## Risks

- **The fall-back moves the calibration.** It is measured on and off; `fallback.metres` is the first knob.
- **Contagion cascades.** One link per tick and the shock bound keep a steady line from falling with a
  neighbour. The brigade row shows how far a cascade goes in practice.
- **A rallied battalion stands facing its rear.** That is accepted for now: the player turns it, and S2's
  AI will.

## Results (2026-10-10)

Built as planned, with three changes found while building (below). Described in
`docs/systems/fire-morale.md`.

1. **Calibration** (`node tools/calibrate-fire.ts`, 100 seeds per row, levelled ground, 200 s on 9 workers):

   | Row | Weaker broke | Stronger first | No break in 20 min | Time to break, min (p10 / median / p90) | Weaker's losses at break |
   |---|---|---|---|---|---|
   | 50 m | 98 | 2 | 0 | 3.2 / 4.2 / 5.5 | 20–21% |
   | 100 m | 96 | 3 | 1 | 6.5 / 9.1 / 12.6 | 20–21% |
   | 200 m | 0 | 0 | 100 | none | none |
   | 100 m, no fall-back | 98 | 2 | 0 | 6.1 / 8.3 / 11.9 | 20–21% |

   Every S1c-1 target holds. Without the fall-back the row is S1c-1's exactly, so contagion and support do
   not touch a 1v1. **The fall-back was tuned from 30 m to 15 m.** At 30 m the 100 m median was 10.4 min,
   over the target, because the weaker line spends part of the fight at 130 m.

   **The brigade (3v3 at 100 m, reported):**
   - the weaker side broke first in all 100 seeds, with its first break at 7.4 / 9.4 / 12.0 min;
   - 3 minutes after the first break, 1, 2 and 3 of its lines were out in 11, 7 and 82 seeds;
   - in most seeds the whole side went within 0.1 s (two ticks): the lines wear evenly, so all three are
     wavering when the first breaks;
   - no line of the stronger side broke.
2. **Rules:** 21 tests in `test/morale.test.ts` (17 in the first build, 4 added in review), all passing. The S1c-1 tests pass unchanged, except that the
   reverse-order switch is renamed `reverse` and covers the morale pass too.
3. **Determinism:**
   - the goldens are regenerated (drill, firefight, the five-seed calibration table);
   - the brigade's replay reproduces, and so does a save taken with one battalion rallying, one routing and one
     mid-fall-back (round 1);
   - `SIM_VERSION` is `s1c.3`, `SAVE_FORMAT` 6.
4. **Cost**, 40 battalions firing: casualties and morale take 0.09–0.11 ms per tick, against 0.01 on main
   (§16: 2 ms). The survey of every other battalion is most of it.
5. **The page:** `npm run check:app` plays the brigade until a break spreads (all three weaker lines out at
   12.4 min) and its 744 hashes reproduce in Node. The firefight still routs at 9.5 min.
6. **Negative runs**, each caught:

   | Mutation | Failing tests |
   |---|---|
   | contagion from this tick's breaks | the shock's timing, the wavering neighbour, the chain in reverse order |
   | the fall-back on any wavering (no falling check) | the dip |
   | the fall-back with no enemy check | no enemy within musket range |
   | a rally without the losses write-off | the rally, and "holds after" |
   | support from a routing friend | the routing friend |
   | the fall-back whatever side the enemy is on (round 1) | the enemy behind |
   | falling on any decrease (round 1) | the relax's crawl |
   | a rally with no run made (round 2) | the full order pool |

**Changes found while building:**
- **A rally needs a quality floor.** A battalion whose quality less the cost is below wavering would rally
  only to break again at once, in the next tick and in a new direction. It keeps running instead. Two S1c-1
  rout tests (a line at quality 0.1) found it.
- **The fall-back needs an enemy in musket range.** In an S1c-1 test a lone line went wavering with no enemy,
  fell back, and broke mid-Retire. With no rear and no enemy, "straight back" was taken from its turned
  heading, so it ran toward its old front. A battalion falls back from someone.
- **`rally.safe` is 250 m, not 300.** On the 360 m field a router at the map edge is about 290 m from the
  enemy. In the brigade the routers are pinned at the stream (about 180 m) and do not rally; the rally is
  shown by scripted tests.
- **`debug-kill` counts as a loss for the rally's calm**, so a scripted router losing men does not rally.
- **The brigade stands on an open band at x ≈ −60,** not the firefight's strip: the strip is on the map's
  southern edge, and lines at z = −125 cannot see each other.

**Review round 1 (#24).** One severe finding and nine others, all fixed:
- **The fall-back could march toward the enemy.** It uses the Retire drill, which goes back from the
  battalion's own facing. A rallied battalion faces the way it ran, so with an enemy behind it, its
  fall-back went 15 m toward that enemy. It now falls back only from an enemy in front of it. A test puts
  the enemy behind and fails without the check.
- **"Falling" counted the relax's crawl.** Morale settling onto a fixed target drops by tiny amounts for
  minutes, so a battalion that went wavering after its losses stopped could still fall back. Falling now
  means more than `fallback.rate` (0.0005 a second). A test fails on any decrease.
- **The save test** now saves with one battalion rallying, one routing and one mid-fall-back, as acceptance 3
  asks. Its waits are bounded.
- **A first break that shatters at once** counts as a break in the firefight runner and the page check.
- **Recent losses** are a share of the spawn strength, as the design says; only the losses term counts
  from the rally.
- **One Retire drill:** the command and the fall-back share `RETIRE` and `fillRetire` (`formation.ts`).
- **Less repeated work:**
  - the rout takes the nearest enemy the survey found;
  - a shattered battalion skips the survey;
  - the men per battalion are counted once per step.
- **Every loss stamps `lastLoss`** in `removeMan`, the one way men are removed, instead of a special case in
  `debug-kill`.
- **No era words in engine code:** "musket range" is "fire range" in `src/sim`.

The calibration is unchanged (100 m median 9.1 min) and every target holds. Under a load average of about
30 the frame-cost test failed on main and on this branch alike (3.8–6.6 ms against its 4 ms budget, back to
back); the morale step's own cost is the number above.

**Review round 2.** No severe findings, so this is the last round. The worthwhile ones are fixed:
- **A router with no run made could rally where it broke.** A full order pool leaves its phase "halted", which
  the rally read as "its run has ended". A rally now needs a run to have been made. A test fills the pool,
  and fails without the check.
- **The visiting-order claim is honest.** Routs and fall-backs in the same tick take pool entries in slot
  order: the same behaviour, different entries. `morale.ts` and the system doc now say so; the chain test
  breaks one link per tick.
- **The brigade runner counts every break** (from `brokeTick`, a break after a rally too), and a first tick
  with breaks on both sides is reported as "both".
- **Less work:** a router mid-run skips the survey and the morale step, as a shattered one does; the men
  counted once per step are used throughout.
- **The ruleset is checked** for `rally.max` (a byte) and `support.arc` (at most 90°, or a friend ahead
  counts as a flank).
- **Scenario names** carry non-default qualities, so a replay cannot be played against another variant; the
  two S1c scenarios share their side setup.
- **The system doc names the ruleset keys** instead of copying the numbers, and its brigade figure is
  corrected (the median from first to last break is 0.1 s; most seeds have all three lines out 3 minutes later).

The calibration is unchanged and every target holds. `check:app` passes.
