---
status: active
last_reviewed: 2026-10-11
---

# Plan: S1d-2, charges and melee

The second part of S1d (`docs/plans/active/s1d1-unit-types.md`, the split; sim-design §9, §10, §12). S1d-1
gave the ruleset a cavalry regiment that moves, changes shape, takes fire and routs, but cannot fight. This
part gives it the charge, and gives infantry its answer, the square.

## Problem

- Nothing in the sim brings two formations into contact: they fire at each other, lose men and break.
  A regiment has no way to hurt anyone.
- There is no standing behaviour beyond the rout and the wavering fall-back. A battalion facing cavalry
  stands in line until it is told to form square, and the square gives nothing it does not already give
  against musketry (`kind: 'column'`).
- Morale has one kind of shock, contagion. The design's other shocks (charge impact, flank and rear attack)
  have nowhere to go.

The S1 target this part serves (sim-design §17): **cavalry catches a forming square; a square holds.**

## Scope

### The charge

- **The command:** `charge {id, target}`. It is refused when:
  - the formation's type cannot charge (`UnitType.charge` is unset: infantry and batteries in the
    Napoleonic ruleset): "cannot charge";
  - its shape is not one it charges from (`charge.shapes`: a regiment charges in line or column, not on
    the march);
  - it is changing shape, or out of the fight;
  - it is blown (it charged within `charge.rest` seconds);
  - it is in melee;
  - the target is not a live enemy.
- **The order:** a new order type, `O_CHARGE`, alone in the formation's list. Each tick it steers at the
  target's nearest company and moves by the move order's code (turn limits, the lag model, the footprint
  gate):
  - at the trot (`charge.approach`) until the gap to the target is `charge.gallopAt` (150 m);
  - then at the gallop (`charge.pace`, a new pace of 6.5 m/s with its hurry table).
  - A `move`, `halt` or another `charge` replaces it, as any order does.
- **Momentum:** the metres galloped (`chRun`) over `charge.build` (50 m), at most 1. A charge launched at
  30 m hits with little weight.
- **The gap** between two formations: the least distance between any company block of one and any of the
  other (each block the rectangle its places cover, as the fire step builds it). It is the separating-axis
  distance: exact face to face, a little short corner to corner, 0 when they overlap.

### Before contact: the test

When a charger's gap to its target first falls to `charge.test` (60 m), once per charge:
- **The target's test:** a morale shock of `melee.threat[side] × (1 − braced) × (0.5 + u)`, where `u` is a
  keyed draw. Many charges end here: a shaken or wavering line breaks before the horses reach it.
- **The charger's test:** against a braced target it turns away with chance `melee.refuse × braced` (halved
  when the target is wavering or worse). Turning away is the recoil, below.

**Braced:** how far the target stands in a shape that is proof against a charge from any side
(`FormationDef.braced`, the square), 0..1:
- 1 in a braced shape, 0 in any other;
- during a change into a braced shape, the change's progress; out of one, 1 less its progress. A square at
  70% gives 70% of the square's protection (sim-design §5).

**The side** a charge comes from is read in the target's frame: from the target's centre to the charger's,
within 45° of its facing is the front, beyond 135° the rear, else a flank. `melee.threat`, `melee.impact.shock`
and the melee's losses are keyed by it.

### Contact: the impact

When the gap falls to `melee.contact` (2 m):
- **The breach:** a braced target that is wavering or worse is broken into with chance `melee.breach`, and
  counts as unbraced.
- **Losses:** each side loses `melee.impact.kill × momentum × (the other's men in contact) × (1 − its own
  braced)`, owed to its companies in contact (keyed draws, like a volley's hits). A defender at the halt has
  no momentum, so a regiment charging a standing one takes nothing at the impact; two regiments charging
  each other both do.
- **Shock:** the target loses `melee.impact.shock[side] × momentum × (1 − braced)` of its morale.
- **Recoil or melee:** the charger recoils with chance `braced`, else both sides are in melee.

**The recoil:** the charger's orders are dropped and it Retires `charge.recoil` metres (the Retire drill),
and it is blown for `charge.rest` seconds.

### Melee

A formation in melee (`foe`, a handle) has no orders and does not move or fire. It refuses every command
but the debug ones ("in melee"). Every tick, for each attacker and its foe in contact (gap ≤
`melee.contact` + `melee.hold`):
- each side loses `melee.rate × DT × (the other's men in contact) × the other's strength`, where:
  - men in contact are the men of the companies within that gap of the other;
  - strength is `melee.strength[kind]` × (1 − `melee.cohesion` × disorder) × the fire's morale-state factor;
- the losses are owed to its companies in contact, weighted by their men (keyed draws).

Morale does the rest: the losses come in a burst, which is what the recent-losses term is for
(`docs/systems/fire-morale.md`, open questions). A defender attacked by two formations fights both.

**The melee ends** when either side is out of the fight, reaped, or out of contact. The winner:
- **Cavalry pursues** (`charge.pursue`, 20 s): it charges the router at the gallop, and its contact costs
  the router `melee.rate` losses that the router does not return. It is then blown for `charge.rest`.
- **Infantry holds** where it stands.

A target that routs before contact is pursued in the same way.

### Shocks

A new per-formation value, `shockIn`, holds the shocks this tick owes a formation. The melee step adds to it;
morale takes it with contagion, after relaxing, and zeroes it.

Every contribution is computed from state fixed before the step and summed by the receiver over its
attackers in slot order. The reverse-visiting test switch must give the same hash.

### Standing behaviour: square against cavalry

Step 4 of the tick, for every battalion whose type names a refuge (`UnitType.refuge`: the infantry's
`square`) and that is in the fight and not in melee:
- **A threat** is an enemy in the fight whose type charges, within `refuge.alert` (200 m, centre to centre),
  and either charging this battalion or closing on it faster than `refuge.closing` (1 m/s).
- **Forming:** after `refuge.react` seconds of threat, a battalion not in its refuge and not changing into
  it drops its orders and forms square. Its shape before is stored.
- **Holding:** it stays in square until `refuge.hold` (30 s) passes with no threat. It then forms back into
  the stored shape, if it still has no orders.
- **The player's word wins:** an order given to a battalion during a threat cancels the behaviour until the
  threat has been gone for `refuge.hold`. The stored shape is forgotten.

## Data (`src/rulesets/napoleonic.ts`)

```ts
// UnitType
charge?: { shapes: string[]; approach: string; pace: string; gallopAt: number; build: number; test: number;
  recoil: number; rest: number; pursue: number }
refuge?: string                         // the shape it forms against a charging enemy
// FormationDef
braced?: boolean                        // proof against a charge from any side
// Ruleset
melee: {
  contact: number; hold: number
  threat: { front: number; flank: number; rear: number }
  impact: { kill: number; shock: { front: number; flank: number; rear: number } }
  rate: number; strength: Record<string, number>; cohesion: number
  refuse: number; breach: number
  refuge: { alert: number; closing: number; react: number; hold: number }   // the square against cavalry
}
```

The numbers are first guesses from `docs/research/formation-movement-and-doc-systems.md`. They are tuned by a
calibration (below), not taken from history.

## The tick

```
1   commands
4   standing behaviour: square against cavalry (new)
5–6 formations: orders (charge steering in the move code), changes, movement
8   fire (no fire in melee)
10  melee (new): gaps for chargers and pairs, tests, impacts, melee losses owed, recoils, pursuit
11  casualties (the owed men, from fire and melee)
12  morale (shockIn with contagion)
14  reap
```

## State and versions

New columns:
- the charge: `chTarget`, `chPhase`, `chRun`, `chGap`, `chUntil`, `blownUntil`;
- melee: `foe`;
- shocks: `shockIn`;
- the square: `alertAt`, `alertSince`, `autoFrom`, `refugeOff`.

`SAVE_FORMAT` 8, `SIM_VERSION` `s1d.2`.

**The refactor check:** with the new columns left out of the hash (a temporary switch), every S1c golden and
replay reproduces: no infantry-only scenario has a charging type, so nothing new runs. Then the goldens are
regenerated.

## The page and the renderer

- **Commands on the page:** with a regiment selected, `C` and a click on an enemy charges it. The readout
  names the charge phase and the melee.
- **The soldier layer:** a type's run speed counts its charge pace, so troopers keep up at the gallop. `Unit`
  is unchanged; the melee's look (front ranks released into duels) is Track E's and later.
- **A new scenario,** `s1d-charge`: one regiment against a battalion in square and one in line, holding
  fire. `check:app` charges each: the square holds and the regiment recoils; the line, caught forming,
  breaks.

## Acceptance

- **The refactor check** above.
- **`test/charge.test.ts`:**
  - **The command's refusals:**
    - a battalion;
    - a regiment on the march;
    - one changing shape;
    - a blown regiment;
    - a friendly target;
    - a formation in melee.
  - **The charge's paces:** the trot, then the gallop inside `gallopAt`; momentum builds over `build`.
  - **The gap:** face to face, at an angle, overlapping.
  - **Braced:**
    - square 1, line 0;
    - partial during the change into square and out of it.
  - **The side:** front, flank, rear.
  - **The test:**
    - a wavering line breaks before contact;
    - against a formed square a regiment sometimes turns away (over seeds);
    - each runs once per charge.
  - **The impact:**
    - losses and shock scale with momentum and `1 − braced`;
    - a standing defender inflicts none;
    - a breach of a wavering square.
  - **Melee:**
    - no orders, no fire, commands refused;
    - losses each tick;
    - it ends at a rout;
    - cavalry pursues for `pursue` and is then blown;
    - infantry holds.
  - **Recoil:** a Retire, then blown.
  - **Auto-square:**
    - forms after `react` against a charging regiment and against one closing at the trot;
    - not against a walking-away regiment, a routing one, or infantry;
    - holds, then forms back to its shape;
    - a player's order cancels it.
  - **Determinism:**
    - the melee step in reversed visiting order gives the same hash;
    - a charge golden, with replay and save round trip mid-melee.
- **`tools/calibrate-charge.ts`** (50 seeds each, a regiment of 256 against a battalion of 400, levelled
  ground):

  | Case | Target |
  |---|---|
  | A formed, steady square charged from about 270 m | holds in ≥ 90%; the regiment recoils in ≥ 80% |
  | A halted line charged from about 270 m (it forms square on the alert) | breaks in ≥ 70% |
  | A column charged from about 270 m | between the two (reported) |
  | A line charged in the flank from about 150 m | breaks in ≥ 90% |
  | Two regiments charging each other from about 340 m | each wins 30–70% |

  (The field is 360 m: the cases are set up as far apart as it allows.)

- **Checks:** lint, typecheck, `check:data`, `check:docs`, the tests and `check:app` pass. The cost bench
  at 40 × 400 infantry is unchanged within noise (no chargers: the melee step only scans).
- **Docs:** `docs/systems/melee.md` (new), with the standing behaviour; `docs/systems/fire-morale.md` (shocks,
  no fire in melee), `docs/systems/formations.md` (the charge order), `docs/systems/sim-spine.md` (steps 4 and
  10), `docs/systems/sim-page.md`.

## Non-goals

- Bayonet charges by infantry (rare: sim-design §9; data-ready, since any type may have `charge`).
- The battery's fire (S1d-3). A battery is charged like an unbraced formation.
- **The melee's look:** front-rank duels and men lying down are Track E's and the soldier layer's, later.
- **Breaking off a melee by order:** it ends only by rout.
- **Commanders and their rally:** S2.
- **Collision between formations:** they still pass through each other when they are not in melee.
- **Cavalry counter-charging by itself:** an AI decision (S2).
- **Horses tiring beyond `rest`:** later.

## Risks

- **Order dependence:** two chargers can hit one target in a tick. The receiver sums contributions over its
  attackers in slot order, the draws are keyed by pair and purpose, and the reverse switch tests it.
- **Charges through friends:** formations do not collide. A regiment can gallop through its own infantry to
  reach the enemy. This is accepted for now and filed as an issue if it shows in play.
- **Calibration:** the case table is the test. If no first guess meets it, the numbers move, not the
  targets. If the targets turn out unreachable without a new mechanism, the plan says which.

## Results (2026-10-11)

**The refactor check:** with the new columns left out of the hash, the ruleset hashed as before and the
`SAVE_FORMAT` and `SIM_VERSION` unchanged, the drill, firefight and calibration goldens and every replay
reproduced. The goldens were then regenerated (`SIM_VERSION` `s1d.2`, `SAVE_FORMAT` 8); `s1d-charge` is new.

**The calibration** (`node tools/calibrate-charge.ts 50`, 50 seeds a case, open level field):

| Case | Target broke | Regiment broke | Neither | Contact | Recoiled | Time to break, s (median) |
|---|---|---|---|---|---|---|
| Formed square | 0% | 0% | 100% | 0% | 100% | – |
| Line (forms square on the alert) | 90% | 0% | 10% | 78% | 10% | 56 (at the impact) |
| Column (forms square on the alert) | 12% | 4% | 84% | 28% | 72% | 110 |
| Line in the flank | 96% | 0% | 4% | 76% | 4% | 22 (most at the test) |
| Two regiments | 40% / 60% (who broke first) | | 0% | 100% | – | 43 |

Every target is met. A formed square refuses every charge at the test or recoils it at the impact, and its
fire costs the regiment about 9 men. A line has 35 s of its 100 s change when the horses arrive.

**What changed from the design:**
- **The aim.** The design steered the anchor at the target's nearest company. A regiment's anchor is the
  interval between its middle squadrons: a line seen end-on slipped into it and the regiment stalled a metre
  short for half a minute. A column's rear squadron, paired with the target, steered its head 70 m past. The
  charge now steers its leading company nearest the target onto the target's company nearest it.
- **A battalion changing shape has no front:** it is struck as in the flank, and fights in melee as fully
  disordered. Without it a line caught at a third of its square broke in half the seeds, at the rout threshold.
  The design's "infantry in transition: heavy losses and a large shock" (sim-design §9) needed it.
- **The recoil** rides straight away from the target (with a Face about when the way is behind it), not the
  Retire drill: a Retire goes back from the regiment's own facing, which after a pursuit can point anywhere.
- **A regiment does not press a formed square:** in melee, once its foe has formed its refuge and holds it
  (steady or shaken), the regiment recoils. Without it a regiment that met a column stayed in a melee with the
  finished square that neither side could end. A wavering square is still pressed (a breach).
- **No fall-back in melee:** the wavering Retire walked a battalion out of contact mid-melee.
- **The threat** is cavalry within 200 m charging it, or anything but riding away. "Closing faster than 1 m/s"
  let a square form back while a regiment stood 60 m off. `react` needs an unbroken threat, so a regiment that
  turns away within it does not square the line.
- **The cost:** step 4 is skipped when no charging type is in the fight and no battalion is on the alert. The
  infantry benches are unchanged (dev Mac, release world, main against this branch: 0.78 against 0.80–0.83 ms
  a tick marching, 0.59 against 0.60 firing, within this session's noise).

**Not done, logged:** a battalion that breaks while changing shape still finishes the change before it runs
([#39](https://github.com/vcmf/rts/issues/39)).

## Review

**Round 1** (`/code-review high`, 9 findings, one severe):
- **Fixed:**
  - **severe:** a regiment never turned away from a square that finished forming in melee. Its leaving was
    one-sided: the square's `foe` still pointed at it, and the end of the step pulled it back into the melee
    and cleared its recoil. Leaving a melee now ends the pairing both ways. A test catches it, and fails without
    the fix. In the column case the regiment now breaks in 4% of seeds, not 16%;
  - the charge's aim took its leading rank over empty companies too: a column that lost its head squadron had
    its charge dropped with no reason given;
  - a charge armed with C stayed armed through a box select;
  - the melee step rebuilt the fire step's block geometry, built for the same positions this tick: it reuses it;
  - the shocks and the engage pass were N × N loops: one pass each, the same order;
  - the melee's and the volley's weighted loss allocation were two copies: one helper (`oweByMen`);
  - the standing step scanned every formation for every battalion: it collects the charging formations once;
  - the engine's `melee.square` named an era's formation (decision 0015): it is `melee.refuge`.

**Round 2** (`/code-review high`, 7 findings, none severe; no third round):
- **Fixed:**
  - after a recoil the square formed back while the regiment was still riding off within reach (80 m at the
    walk outlasts `refuge.hold`), then squared again when it halted: a battalion forms back only when no
    enemy charging type is within `refuge.alert`;
  - a panel order left a pending charge armed;
  - the state column `sqOff` named the square (decision 0015): `refugeOff`;
  - the melee doc had the stand-down flag and the forgotten shape the wrong way round.
- **Kept:**
  - a regiment that recoils while another enemy strikes it is held in that melee (it is being struck);
  - the geometry's reuse stamp stays explicit in the fire step (a stamp inside `blockGeometry` would let a
    test helper's build between ticks pass for the next tick's); the melee step says a step between 8 and 10
    that moves formations must rebuild and stamp it;
  - the striker's contact mask is computed with its men count (one helper for both).
