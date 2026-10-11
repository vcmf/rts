---
status: current
last_reviewed: 2026-10-11
code: [src/sim/melee.ts, src/sim/formation.ts, src/sim/commands.ts, src/sim/morale.ts, src/rulesets/napoleonic.ts, src/scenarios/s1d-charge.ts, tools/calibrate-charge.ts, test/charge.test.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0015-era-generic-engine]
---

# Charges, melee and the square (S1d-2)

A cavalry regiment charges an enemy: it trots, gallops the last 150 m, and either the target breaks before it
arrives, or the horses strike it and the two fight until one side breaks. A battalion that sees cavalry near
forms square. A square turns charges away; a battalion caught while forming one is struck as in the flank.
Every number is ruleset data (`UnitType.charge`, `UnitType.refuge`, `FormationDef.braced`, `melee`). The
numbers are calibrated on outcomes (`tools/calibrate-charge.ts`), not taken from history.

```
step 4  standing behaviour  a battalion with a refuge shape forms it against cavalry near it, holds it, forms back
step 5  formations          a charge (O_CHARGE) steers at its target in the move code: trot, then the gallop
step 10 charges and melee   gaps after movement → the test at 60 m → the impact at contact → recoil or melee;
                            melee losses owed each tick; a broken foe pursued
step 11 casualties          the owed men fall (fire's and melee's)
step 12 morale              the shocks owed (shockIn) are taken with contagion
```

## Goals / non-goals

- **Goals:**
  - cavalry catches a forming square; a square holds (sim-design §17);
  - charges, melee and the square follow from a few data numbers, on the generic engine;
  - results do not depend on slot order.
- **Non-goals (later):**
  - bayonet charges by infantry: any type with `charge` can charge, and the Napoleonic infantry has none;
  - the battery's fire (S1d-3);
  - the melee's look (duels in the front ranks, men lying down): Track E and the soldier layer;
  - breaking off a melee by order;
  - collision between formations outside melee;
  - cavalry counter-charging by itself (an AI decision, S2).

## Constraints

- **Exact operations only (decision 0006).** The side struck uses `sin`/`cos` from `num.ts` and the constant
  √½; the gap is a separating-axis distance (products, sums, `abs`).
- **Every draw is keyed** by the world seed, the tick, the charger's handle, the target's slot and a purpose
  tag (`keyedStream`), as fire's are.
- **Order independence.** A formation writes only:
  - its own state;
  - men owed to others (whole numbers: the sum does not depend on order);
  - the shock it sends, which each receiver sums over its attackers in slot order.

  What it reads of another was fixed before the step: positions after movement, men, morale states, shapes,
  and the melee pairs as the step began. Orders come from the shared pool in visiting order, as routs' do
  (`docs/systems/fire-morale.md`).

## Design

**The command** (`commands.ts`): `charge {id, target}`. It is refused when:
- the type has no `charge`: "cannot charge";
- the formation is changing shape: "changing shape";
- its shape is not one it charges from (`charge.shapes`: a regiment in line or column, not on the march):
  "cannot charge from this shape";
- it charged within `charge.rest` seconds: "blown";
- the target is not a live enemy: "no such target".

A formation in melee refuses every command but the debug ones ("in melee").

**The charge** (`O_CHARGE`, `formation.ts`): an order alone in the formation's list, run by the move order's
code (turn limits, the lag model, the footprint gate).
- **The aim:** each tick it steers so that its leading company nearest the target meets the target's company
  nearest it, front centre to front centre. A regiment's anchor is the interval between its middle squadrons,
  which a narrow target would slip into; a column's rear squadrons would steer its head past the target.
- **The pace:** `charge.approach` (the trot) until the gap at the last melee step is `charge.gallopAt` (150 m),
  then `charge.pace` (the gallop, 6.5 m/s). The soldier layer counts the gallop in a type's run speed.
- **Momentum:** the metres galloped (`chRun`) over `charge.build` (50 m), at most 1.

**The gap** between two formations: the least separating-axis distance between any company block of one and any
of the other. Each block is the rectangle its places cover, as the fire step builds it (`blockGeometry`). It is
exact face to face, a little short corner to corner, and 0 when they overlap.

**Braced** (`bracedOf`), 0..1: how far a formation stands in a shape proof against a charge from any side
(`braced`, the square). During a change into one it is the change's progress; out of one, 1 less it.

**The side struck** (`sideStruck`): from the target's centre to the charger's, read in the target's facing:
- within 45° of it, the front;
- beyond 135°, the rear;
- else a flank.

A target changing shape has no front, and is struck as in the flank.

**The test** (step 10, when the gap first falls to `charge.test`, 60 m, once per charge):
- **The target's test:** a morale shock of `threat[side] × (1 − braced) × (0.5 + u)`, `u` a keyed draw. A
  wavering line breaks here, before the horses reach it.
- **The charger's test:** against a braced target it turns away with chance `refuse × braced`, halved when the
  target is wavering or worse.

**The impact** (when the gap falls to `melee.contact`, 2 m):
- **The breach:** a braced target that is wavering or worse is broken into with chance `breach`, and counts as
  unbraced.
- **Losses:** the target loses `impact.kill × momentum × (the charger's men in contact) × (1 − braced)`.
  A target that is itself charging inflicts the same on the charger by its own momentum; a standing one
  inflicts nothing.
- **Shock:** the target loses `impact.shock[side] × momentum × (1 − braced)` of its morale.
- **Then:** the charger recoils with chance `braced`, else both are in melee (`foe`). A target struck while
  not in melee takes on its lowest-slot attacker, and its orders and any charge of its own end.

**The recoil:** the charger rides `charge.recoil` metres straight away from the target, with a Face about first
when the way is behind it, and is blown for `charge.rest`.

**Melee** (each tick, each formation in melee): it strikes its foe, and every enemy whose foe it is, with the
men of its companies within `contact + hold` of each.
- **Losses:** `rate × DT × men in contact × strength`, owed to the struck companies in contact, weighted by
  their men.
- **Strength:** `strength[kind] × (1 − cohesion × disorder) × the fire's morale-state factor`. Changing
  shape counts as full disorder.
- **No fire:** neither side fires (`mayFire`), and a wavering battalion does not fall back.
- **It ends when:**
  - either side is out of the fight, or gone;
  - they are out of contact;
  - for a charging type, its foe has formed its refuge and holds it (steady or shaken): the charger recoils.
- **The winner:** a charging type pursues a broken foe at the gallop for `charge.pursue` seconds, costing it
  melee losses it does not return, and is then blown. A target that breaks before contact is pursued the same
  way. Infantry holds where it stands.

**Shocks** (`shockIn`): the test's and the impact's shocks are owed to the target and taken by its morale step
with contagion, after relaxing (`morale.ts`).

**The square against cavalry** (step 4, `standingStep`), for each battalion whose type names a refuge
(`UnitType.refuge`), in the fight and not in melee:
- **A threat:** an enemy in the fight of a type that charges, within `refuge.alert` (200 m, centre to centre),
  either charging it or anything but riding away faster than `refuge.closing`. A regiment at the halt can
  charge in seconds.
- **Forming:** after `refuge.react` seconds of unbroken threat, a battalion not in its refuge and not changing
  into it puts three orders ahead of its own (a scenario's plan's, kept for after):
  1. form its refuge;
  2. hold (`O_HOLD`) until the spell of threat is over;
  3. form back into the shape it was in, or going to.

  The forms are optional: one that cannot be made there is skipped, and the rest go on. With fewer than three
  free orders in the pool it does not form square. A rout, or a player's order, clears these orders with the
  rest, as any order is cleared.
- **The spell ends** when `refuge.hold` seconds pass with no threat and no enemy charging type is within
  `refuge.alert` at all. The hold ends then, and the battalion forms back and goes on with its orders.
- **The player's order wins:** any order given during a spell of threat replaces the square's orders with the
  rest and stands the behaviour down until the spell ends (`refugeOff`). A scenario's plan's order does not stand
  it down.

The step is skipped when no charging type is in the fight and no battalion is on the alert.

## Tunables

`melee`, and each type's `charge` and `refuge`, in `src/rulesets/napoleonic.ts`. Their effect is measured by
`node tools/calibrate-charge.ts [seeds] [case]`. Results are in `docs/plans/active/s1d2-charges.md`.

## Verification

- **`test/charge.test.ts`:**
  - **The command's refusals;** the trot, the gallop and momentum.
  - **The geometry:** the gap face to face, overlapping and at an angle; the side struck, and a change's
    missing front; braced, through changes both ways.
  - **Before contact:** a wavering line breaks at the test; the test is taken once; a formed square turns every
    charge away and the regiment is blown; a recoil rides away from the target.
  - **The impact:** losses scale with momentum, and a standing target costs nothing; a wavering square is
    broken into, a steady one is not.
  - **Melee:**
    - both held, no fire, commands refused;
    - men fall on both sides;
    - the regiment pursues a broken line and is then blown;
    - infantry that sees the regiment break holds.
  - **The square:**
    - formed after `react` against a charging regiment and one closing at the walk;
    - not against one riding away, a router, or infantry;
    - held while a regiment stands near, formed back `hold` after it rides off;
    - a player's order stands it down.
  - **Determinism:**
    - the melee step in reversed visiting order gives the same state;
    - a save mid-melee plays on to the same hashes;
    - the page scenario's golden, with its replay.
- **`tools/calibrate-charge.ts`:** the five cases against the plan's targets.
- **`npm run check:app`:** charges the line on the page (it breaks), then the square (it holds), and replays
  the session in Node.

## Open questions

- **A caught column rarely breaks:** column to square takes 60 s, so a column is half braced when the horses
  arrive, and the regiment turns away or recoils once the square closes. Whether that is too safe is for S1e's
  playtests.
- **Formations pass through each other** outside melee: a regiment can gallop through its own infantry.
