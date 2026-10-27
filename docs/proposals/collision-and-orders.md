---
status: draft
last_reviewed: 2026-10-27
---

# Proposal: collision and orders

How formations keep out of each other, what happens where they meet, and how their orders are chained and
interrupted. The unit model (`docs/proposals/unit-model.md`, § Collision) states the rules a player sees; this
proposal is how the sim keeps them. It is phase U6 there.

Collision is judged by eye first: the visual bench (§ The bench) is built before the collision code, its cases run
on today's sim to show what fails, and each case then becomes a test. The research behind it is
`docs/research/formation-collision-and-commands.md`.

## Context and goals / non-goals

Today formations pass through each other (`docs/systems/melee.md`, Open questions), and a charge or a melee clears
the orders queued after it (#179). No shipped game or paper describes two formations meeting front to front; the
games that collide soldiers one by one get blobs in melee and heavy units punching through lines
(`docs/research/formation-collision-and-commands.md`). This design collides company blocks, the shapes the sim
already has, and uses the lag model the sim already has to bend them.

**Goals:**
- **Formed bodies never overlap,** in any shape, moving, turning or changing shape.
- **Loose bodies pass through friends,** at a cost, and never through enemies.
- **Nobody in melee gives ground** (decision 0069): a melee holds until one side breaks, or ends as today when a
  charger turns away from a square or the two fall out of contact. The broken one runs as a block, and every enemy
  that reaches it, but one in melee with another, cuts it down.
- **Nothing is pushed.** A formation is never moved by another's motion.
- **Deterministic and order-independent:** the reversed visiting order gives the same state, with no ordering
  rule to tune.
- **Seen and checked:** every rule has a bench case that shows it on the page and a test that checks it.
- **Orders chain:** shift appends any order, a plain order replaces the queue, and an interruption suspends or
  clears the queue by a rule a player can predict.
- **Cost:** within the tick's budget (`docs/proposals/sim-design.md` §16) at 40 battalions a side.

**Non-goals:**
- pathfinding (U8): this design makes formations wait at, or report, what blocks them; going round is U8's;
- group moves (U9);
- individual soldiers in the sim (decisions 0007 and 0018). The soldier layer keeps its own cosmetic separation.

## The bench

Built first (phase C0), on the sim page (`docs/systems/sim-page.md`), which already draws every soldier as a
small circle on the staff map and has a slots overlay.

### What it shows

An overlay, toggled by a key and by layer:

| Layer | Drawn as |
|---|---|
| **Blocks** | each company's rectangle, as the sim holds it (`blockGeometry`); a formed body's outline solid, a loose body's dashed |
| **Strips** | each company's bins, shaded by their lag; a held bin marked |
| **Contacts** | each pair of blocks within the margin, as a line between their nearest points: grey for friends, red for enemies, orange for a charge, a thick line for a melee pair |
| **Clamps** | per strip, its wanted advance and its allowed one (two arrows), and what clamped it |
| **Reserved paths** | the ground a change of shape will cross until it ends, hatched |
| **Statuses** | each formation's status and engagement in a label ("blocked by a friend", "an enemy ahead", "in melee") |
| **Orders** | the queue: waypoint lines coloured by kind of order, an outline of the formation at each destination, a suspended queue greyed |

### Time

- pause, 1/4× and 1/2× beside today's 1×–8×;
- **one tick at a time** (a key), with the tick number shown;
- **go to tick:** replays the bench case from its start to a tick (it is deterministic and short), so a moment
  can be looked at again, before and after a fix.

### The cases

Each a page scenario (`bench-…`, chosen by `?scenario=`) on a flat field, scripted by its plan so it plays on its
own, and free to take orders after.

| Id | Case | What it must show |
|---|---|---|
| X-01 | Two lines meet head on, one assaults | they halt in contact, the melee starts and holds until one routs; no overlap |
| X-02 | Two lines meet with no charge | they stop at contact distance and fire at point-blank range |
| X-03 | A cavalry line charges one battalion of a brigade line, its wing reaching the next battalion first | it strikes whichever it reaches; the charge does not stall |
| X-04 | A recoil from a square | the regiment starts at contact and rides off; nothing freezes |
| X-05 | A column marches into a halted friend | it halts short, "blocked by a friend"; the friend does not move |
| X-06 | Three battalions converge on one gap | none overlaps, none locks; one goes first, the others wait |
| X-07 | A column threads between two halted lines | it passes if it fits, and halts if it does not |
| X-08 | A line wheels into a halted friend | the wheel halts at the friend |
| X-09 | A battalion forms square as a friend marches toward it | the change reserves its ground; the friend halts at the reservation |
| X-10 | A router runs through two friendly lines | it passes; they take disorder |
| X-11 | A router rallies inside a friend | it walks clear before it forms |
| X-12 | A battery's gunners flee into a square and go back | they shelter inside it, then man the guns again |
| X-13 | A passage of lines: the second line passes through the first | it passes loose, the first cannot fire through it, it forms beyond |
| X-14 | Forty battalions march through each other's paths | no overlap, no lock; the cost per tick |
| X-15 | A veteran regiment charges a raw one at the halt, open ground behind it | the melee holds, neither moves; the raw one breaks and runs clear |
| X-16 | The same, a friendly regiment just behind the raw one | the same; the router passes through its friend, the pursuit stops at the friend |
| X-17 | The same, an enemy regiment just behind the raw one | the router is held on every way out and cut down where it stands |
| X-18 | A pair in melee, a second enemy charging the target's flank | the melee holds; the broken one runs clear of the pursuit, never stuck on its foe's ground |
| X-19 | As X-15, the veteran 20 m to one side: the lines meet offset | the melee holds over a minute with few in contact, until one breaks |
| X-20 | Two raw regiments abreast, each charged by a veteran | both melees hold side by side, the line kept, until each breaks |
| Q-01 | Shift-chained: move, form line, face about, move | each runs in turn |
| Q-02 | A chain with a charge in it | the charge runs, then the next order |
| Q-03 | A chain interrupted by cavalry (the square) | the queue is suspended, then resumes after the square |
| Q-04 | A chain interrupted by a rout | the queue is cleared |
| Q-05 | A plain order during a chain | it replaces the chain |

**The checks per case:**
- **a Node test** that plays it and checks the invariants every tick (§ Invariants), the case's outcome, and the
  same state in the reversed visiting order;
- **a screenshot** at its key ticks in `npm run check:app`.

C0 runs the cases on today's sim, so the bench first shows the failures (formations passing through each other,
the queue cleared by a charge), and the tests that fail today are recorded as such.

## Bodies

| Body | Who | Friends | Enemies |
|---|---|---|---|
| **Formed** | every battalion, regiment and battery in the fight, in any shape, also changing shape | never overlaps; keeps the friend margin | never overlaps; keeps the enemy margin, except in melee and at a charge's contact |
| **Loose** | routers, skirmish order (U5), a battalion in an ordered passage of lines, gunners who fled their guns (U4) | passes through; both take disorder while they overlap | as formed |

- **Formed again only on free ground.** A loose body asks to become formed (a rally, the end of a passage of lines,
  gunners going back) as an indivisible proposal (§ Indivisible proposals), granted only where it meets no formed
  body, no reserved path and no ground granted before it in the tick. Two routers that ran through each other
  therefore cannot both form where they overlap. One not granted walks clear and asks again (§ Loose bodies).
- **Spawns** are checked: a scenario whose formations overlap is refused when it loads.
- So **two formed bodies never overlap at all**: no rule has to separate an overlapping pair.

**The margins**, ruleset data:
- **friends:** `collision.friend` (about 2 m between blocks of different formations);
- **enemies:** `melee.contact` (2 m, as today);
- **0** for a melee pair, and for a charge or an assault against any enemy it reaches.

A formation's own companies are not tested against each other: its shape is the formation layer's
(`docs/systems/formations.md`).

## Resolution

### What collides

Each company's bins: the lateral strips the lag model already moves (`docs/systems/formations.md`, The lag model),
about 1,000–4,000 at 16,000–32,000 men.
- **A bin is the set of its places,** as the footprint gate places them, with its lag (`placesCtx`, `placeAtSlot`);
  the bench's geometry does the same (C0's `src/sim/geometry.ts`). For a straight shape
  the places of a bin form a rectangle, and the separating-axis gap applies; for a trail shape they lie along the
  trail, and the test is on the places themselves.
- **One geometry for everything that measures a gap:** collision, contact, a charge's impact and the bench. Today's
  block geometry for fire and melee (`blockGeometry` in `src/sim/fire.ts`) ignores the lags; C2 moves the melee's gap
  onto the bins, so that a charge reaches contact where collision says it does.
- **A broad phase** over formations, by reach, as fire's friendly-cover test does, finds the pairs near each other;
  only those are tested bin against bin.

### Propose, resolve, commit

Today a formation's step moves it several times in a tick (a turn, then the advance; a lag catch-up, then a wheel)
and commits each as it goes (`formationStep` in `src/sim/formation.ts`). Collision cannot be tested piece by piece
like that: each piece would get its own allowance. So C1 splits the movement of a tick in three:

1. **Propose.** After commands, the scenario's plan and the standing behaviour (steps 1–4 of the tick), every
   formation works out its whole motion for the tick from its start-of-tick state, without committing it: the turn,
   the advance, the lags' catch-up, a wheel, a recoil, a router's run. The result is a proposed end pose and, for
   each bin, the displacement of its places from start to end.
   A Face about, the start of a change of shape and a loose body's ask to form are proposals too, marked
   **indivisible**: they are granted whole or not at all.
2. **Resolve.** Every proposal is checked against every other at once (§ The clamp, § Indivisible proposals).
3. **Commit.** The granted motion is applied, and the footprint gate's test on impassable ground runs on it as
   today.

**Still or moving** is judged on the proposals: a formation is **still** when its proposal moves no bin, and is not
an indivisible one. Every other formation is **moving**.

### The clamp

- **One allowance per bin per tick.** From the start-of-tick positions, a bin's whole motion this tick may close
  the gap to each nearby body:
  - by the whole gap less the margin, if that body is still;
  - by **half** of it, if that body is moving, since the other may close its half too.

  The bin's allowance is the least over its bodies. A least is the same in any order and exact in floating point.
  The allowance is one budget for the tick, shared by everything in the proposal: a turn and an advance together
  may not close more than it.
- **Only approach is clamped.** The allowance limits the part of a bin's displacement that closes the gap; motion
  that keeps or opens it is free. So a pair that starts the tick inside the margin (a recoil from contact, a router
  whose foe just beat it) can always move apart.
- **A divisible proposal is cut short as a whole,** by halving, as the gate cuts a step today, until every bin's
  approach is within its allowance. A turn's flank bins, which sweep the most, are what limits a turning line.
- **Held by a body is not stalled.** A bin clamped by a body is held for the lag model: the anchor's speed is the
  largest that keeps every file within the lag limits, so the formation slows, its free bins flow on, and it bends
  around what it met. It is not today's stall on impassable ground, which halts the formation, drops its orders and
  steps it back (`haltAtEdge`), for a move or a wheel alike. A formation held by bodies goes to the jam rule
  (§ Jams), and keeps its orders.

### Indivisible proposals

- **The order:** the indivisible proposals of a tick are taken by a keyed draw for the tick (the world seed, the
  tick and the formation's handle), ties by handle. The order does not depend on the visiting order.
- **The test:** each is granted if its ground (a change's whole sweep, sampled as `changeWet` samples it; a Face
  about's end pose; a formed body's places for an ask to form) meets no formed body at its start-of-tick place or at
  the end of its proposal, no reserved path, and no ground granted before it this tick.
- **Granted ground is reserved:** for every divisible proposal resolved after it (all of them), the ground of a
  granted indivisible proposal counts as a still body. A change keeps its reservation of its remaining path until it
  ends; a Face about or a form ask only for the tick it is granted.
- **Not granted:**
  - an **optional** order (a router's or a recoil's Face about) is skipped, as an optional order that fails is
    skipped today, and the run or the recoil goes on as it stands;
  - a change of shape asked by an order waits at the head with a status, and is proposed again next tick;
  - the square against cavalry asks again when it retries today (every `REFUGE_RETRY`, 5 s);
  - an ask to form: § Loose bodies.
- **A charge may enter a reservation.** A formation struck while changing shape cuts its change short where it
  stands, to the nearer of its two shapes, as a break does (`cutChange`), so its companies do not sweep into the
  charger. The partial bracing at the impact is read before the cut, as today.
- **A battalion that breaks during a change** snaps to the nearer of its two shapes (`cutChange`), and is loose from
  that tick, so only enemies matter: if the snap would overlap one, it takes the other shape.

## Contact

- **Enemies with no charge** stop at the enemy margin: point-blank range. A move clamped at the enemy margin ends
  there ("halted at the enemy"), and the queue goes on, so a halted line fires at once (X-02).
- **A charge or an assault** may close to 0 against any enemy, not only its target. The first enemy it reaches is
  the one it strikes; two reached in the same tick are taken by the smaller gap at the start of the tick, then the
  lower handle. The test at `charge.test`, the impact and the melee follow with that enemy, as
  `docs/systems/melee.md` does with its target today: a charge that strikes a square it was not aimed at takes that
  square's test at the impact (X-03).
- **A melee holds** (decision 0069; built and tried on C1's claim grid, its plan's step 4, on the C1 branch). A
  battalion in melee cannot step back or retreat, and nobody gives ground: the melee ends when one side breaks, or as
  today when a charger turns away from a square or the two fall out of contact.
  The research found every game and rule set gives ground in discrete steps or not at all
  (`docs/research/melee-outcomes.md`); both kinds were built on the claim grid (§ Alternatives considered), and the
  owner chose not at all, as Total War does.
  - **A melee pair stands at each other's core:** between them the margin gives way, never the places. They cannot
    pass into each other, which left a router standing on its foe's ground, unable to move off it (X-18).
  - **A pursuit stops at its router's margin** and rides it down from there, the ride-down's reach longer by the
    margin; any other body's margin stops it, so it does not ride through the friend behind its router (X-16). A
    pursuit is not a charge here: "the first enemy it reaches" (above) is the charge's and the assault's, never the
    pursuit's. The claim grid's prototype lets a charge reach its target's
    core only and stops it at any other enemy's margin, its order kept: C2 replaces that with the rule above.
  - **A broken battalion runs as a block,** faced about, in the direction fixed at its break, and tries its fan of
    directions when held (`docs/systems/fire-morale.md`). A run held by others for `HELD` seconds counts as halted,
    as at impassable ground; while an enemy is near it goes on trying the fan's directions in turn, since others
    may move off its way.
  - **A router the enemy reaches is cut down:** every enemy in the fight within the ride-down's reach, not in melee
    with another, strikes it at the melee's rate, and it does not fight back, whether it runs, is held or has no
    way left (X-17). There is no surrender.
  - **The flank shock** is the unit model's (§ Charges and melee there): a charge into the flank or rear of a
    battalion already in melee gives it a further one-off shock. **Fire into a melee** works as today: a battalion in
    melee can be fired on wherever no friend of the shooter stands across the line, and does not fire back.

  The broken battalion is loose (§ Loose bodies), and the pursuit is today's, stopped at its margin.

## Loose bodies

- **Tested** against enemies and impassable ground only.
- **Overlap costs disorder:** while a loose body overlaps a formed friend, both gain disorder each tick. It is
  summed over each body's pairs in handle order, so the sum does not depend on the visiting order.
- **Their pace** is cut while they overlap a friend.
- **Which states:** routing, rallying and shattered formations; skirmish order; a passage of lines, from its order
  until it is clear; fled gunners. A router stopped by an enemy is halted and tries the next direction of its fan
  (`docs/systems/fire-morale.md`).
- **Forming again.** The morale step (step 12) decides that a router rallies, from the positions after the tick's
  movement. The change to formed is then asked at the next tick's proposals (one tick later), as an indivisible
  proposal against the positions it will meet. If it is not granted, the formation stays rallying, with the status
  "rallying: clearing a friend", and is given a move out of the friend it overlaps, by the shortest way out of that
  friend's blocks, as a reaction (§ The queue). It asks again each tick until it is granted. The same holds for the
  end of a passage of lines and for gunners going back.

## Jams

**Progress** is a formation's pose change in the tick: the anchor's motion plus its turn times its half-width. A
formation is **slowed** while its proposal is cut short by bodies, and **jammed** when its progress has stayed under
`collision.slow` (about 5% of its pace) for `collision.wait` seconds (about 3).

- **A jam** is a set of jammed formations each held by another of them. It has one **holder of the right of way**:
  for the holder's allowance the others in the jam count as still, and they stand still while it holds. The holder is
  picked by a keyed draw when the jam forms, and keeps the right of way until it is no longer held by any of them, or
  for `collision.hold` seconds (about 10); then the next is picked from those still jammed. So of three battalions
  converging on one gap, one goes through and the others follow (X-06).
- **A formation jammed by a body outside any jam** (a still friend, a friend in melee, one waiting out a Face about,
  an enemy) gets the status "blocked by a friend" or "an enemy ahead", and its queue is suspended (§ The queue).
  - **It resumes** when its next proposal's allowance toward the blocker has opened beyond `collision.clear` (about
    2 m more than the margin), checked each second, so it does not resume and jam again by turns.
  - **Before pathfinding:** it waits there; the player orders it round.
  - **With pathfinding (U8):** it re-plans locally with the blocking bodies as a cost.
- **Never a full re-plan on every contact:** it was what made Supreme Commander's large battles grind to a halt
  (`docs/research/formation-collision-and-commands.md`).

## Invariants

What the tests check every tick of every bench case:
1. **No two formed bodies overlap.**
2. **No pair is closer than its margin** unless it was at the start of the tick and has not come closer.
3. **No formation is frozen:** a formation with an order made progress this tick, or holds a status saying why, or
   is in a jam whose holder made progress.
4. **The visiting order changes nothing:** the reversed order gives the same state.
5. **A reserved path is entered by no formed body** but a charge or an assault striking the formation that holds it.

## Orders and the queue

### Three layers

| Layer | What | Examples |
|---|---|---|
| **Orders** | in a queue, one at a time | move (waypoints, facing on arrival), form, wheel, face about, dress, retire, charge, assault (U3), passage of lines; later attack-move (move, but stop for what you meet) |
| **Stances** | beside the queue, kept until changed | fire mode (hold, at will, a preferred target); later skirmish and hold position |
| **Reactions** | the sim's own | the square against cavalry, the wavering fall-back, fire discipline, a melee it did not order, a jam |

### The queue

- **A plain order replaces the queue;** **shift appends** any order to it; **Stop** (halt) clears it. The same
  while paused.
- **An append does not stand a reaction down.** Today every player order stands the square against cavalry down
  (`playerOrdered` in `src/sim/commands.ts`). A plain order still does; an append only queues behind it.
- **At most 16 orders and 32 waypoints** in a formation's queue. An order past either is refused with a status.
- **The pool keeps room for reactions.** Orders come from one pool for the world (`MAX_ORDERS`), and today a rout's
  run, a recoil and the fall-back silently do nothing when it is full. The pool keeps, per formation, room for the
  largest reaction (the fall-back's Retire, four entries) that only reactions may take.
- **A reaction's orders go first.** A recoil, a pursuit, the fall-back and a rally's move out of a friend are
  inserted at the head of the queue, and the queue after them is suspended until they end; today they clear the
  queue and append.
- **A charge starts when it reaches the head.** Today a charge's state is set when it is issued; a queued charge
  sets it, and takes its refusal tests (blown, shape, changing shape), only when it becomes the head order. If it is
  refused then, it is dropped with a status and the queue goes on.
- **A suspended queue counts as no orders** for every rule that reads the head order: musketry and the guns fire
  (`mayFire`, `mayShoot`), and the wavering fall-back applies (`fallBack`).
- **A scenario's plan** gives orders through the same queue.

### What interrupts it

The research found no game that clears a queue on contact, and none that documents resuming one after an
interruption, so this part is to be playtested.

| What happens | The queue | Examples |
|---|---|---|
| **The fight is part of the order** | the order finishes, and the next one runs | a queued charge ends (struck, recoiled, pursued); an assault ends; a move halted at the enemy |
| **A reaction drops one order** | only that order goes; the rest runs | fire discipline drops an advance |
| **A reaction while still under command** | **suspended**: kept, not run; it resumes when the reaction ends, with its first order checked again (a move goes on from where the formation stands). Dropped, with a status, if the suspension lasts over `orders.resume` (about 60 s) | the square against cavalry (today it already keeps its orders); a melee it did not order (today it keeps its orders for after); a recoil or a pursuit after a charge that was not the head order's; a jam outside any jam's right of way |
| **Command lost** | **cleared** | a rout, shattered, the wavering fall-back, the wavering rule's "will not advance" |

#179 is this table's first row: a charge's pursuit or recoil ends the charge, and the queue goes on.

### On the page

- waypoint lines coloured by kind of order, an outline at each destination, a suspended queue greyed (the bench's
  Orders layer, kept on in play);
- shift-click and shift on every panel order append; a plain one replaces.

## Phases

| Phase | What | Cases |
|---|---|---|
| **C0** | The bench: the overlay's layers, the time controls, the cases as scenarios, their tests and screenshots on today's sim | all, as today |
| **C1** | Formed bodies: the movement step as propose, resolve and commit; one allowance per bin per tick, half gaps, indivisible proposals and their reserved ground, jams and their right of way, spawns checked | X-04 to X-09, X-14 |
| **C2** | Contact: the enemy margin, a move halted at the enemy, a charge striking the first enemy it reaches, the melee's gap on the bins; the melee that holds and the cut-down of routers (built on C1's claim grid) carried into the resolution | X-01 to X-03, X-15 to X-20 |
| **C3** | Loose bodies: routers, rallies on free ground, the passage of lines; fled gunners with U4, skirmishers with U5 | X-10 to X-13 |
| **C4** | Orders: shift for every order, appends that keep a reaction, the cap and the pool's reserve, charges started at the head, suspend and resume, clearing on loss of command (#179), the queue on the page | Q-01 to Q-05 |

## Alternatives considered

- **Soldiers as collision bodies** (Total War, Cossacks, Bannerlord). Rejected: the sim holds no soldiers, and the
  games that do get blobs in melee and heavy units through lines.
- **Pushing, with mass or priority** (0 A.D., Beyond All Reason, Supreme Commander 2). Rejected: a formation
  moved by others drifts from where it was ordered, and order-independent pushing needs sorted sums. The clamp's
  least needs nothing.
- **A keyed order of every mover, each tested against the others** (this proposal's predecessor, in the unit model's
  drafts). Rejected: three review rounds found overlaps and locks in it. Half gaps need no order for motion; a keyed
  order remains only where an act cannot be cut short (§ Indivisible proposals) and to give a jam its right of
  way.
- **Per-pair exemptions instead of loose bodies.** Rejected: each exemption met the no-overlap rule somewhere.
- **A continuous give way in melee** (C1 step 4's first design, on the claim grid): the pressed battalion's
  companies in contact bend back each tick as lags, then the whole steps back, its foe following; a pinned one
  loses order against friends and nerve against enemies. Rejected after five reviews: the bend fought the lag model
  (a follower stopped once its flanks reached the lag limit; a held line never dressed, so its disorder stuck), who
  held it needed the gate to report every blocker, and flank attackers needed their own rules. Field of Glory's
  designers dropped push-backs and follow-ups from a free melee of many units for the same complexity
  (`docs/research/melee-outcomes.md`).
- **Melee in rounds** (C1 step 4's second design, built on the claim grid): every 3 s the loser of a pair, by its
  push (the losses its strike owes times its morale), stepped back 2 m as one rigid move and its foe followed; one
  that could not was pinned and lost nerve. It worked on the bench (X-15 to X-20). Rejected by the owner as more
  than the model needs: history had it, Total War does without it.
- **Surrender of a router with no way out:** built on the claim grid. Rejected by the owner (Total War has none);
  the record of who held the router, read back later, also broke replays. A router the enemy reaches is cut down
  instead.
- **Clearing the queue on contact** (today). Rejected: no game does it, and it loses the player's plan (#179).

## Drawbacks

- **Half gaps are cautious:** two movers closing on each other halve the gap each tick and never quite close it.
  That is what friends should do; enemies close to their margin over a few ticks, which is fast enough; a jam gets
  its right of way.
- **The movement step is restructured:** today it commits each piece of a tick's motion as it goes; C1 splits it
  into propose, resolve and commit. With it change the stall path, the melee's gap, `playerOrdered`, the charge's
  start, the reactions' orders, the order pool and every rule that reads the head order. Each phase's plan lists its
  own.
- **Blocked formations wait** until U8; the player has to order them round.
- **No ground is given in melee:** a line that history would have seen pushed back stands until it breaks. The
  cut-down of routers is new: on the claim grid only today, it changes the charge calibration
  (`tools/calibrate-charge.ts`) once C2 makes it the rule everywhere.

## Open questions

- **Cavalry through its own infantry's intervals:** historically it passed through a line's intervals. Loose for
  the passage, or a passage of lines ordered by the player?
- **The queue's resume timeout** and whether a resumed move should re-check the path (with U8, yes).
- **Attack-move:** whether it is wanted beside charge and fire at will.
