---
status: draft
last_reviewed: 2026-10-25
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
- **A clash bends the shapes** where they meet; ground changes hands only through the fight.
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
| **Statuses** | each formation's status and engagement in a label ("blocked by a friend", "in melee", "giving way") |
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
| X-01 | Two lines meet head on, one assaults | they halt in contact, the melee starts, the front bends, the loser gives ground and then routs; no overlap |
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
  gunners going back). The asks of a tick are settled together, as changes of shape are (§ Starts settled together):
  an ask is granted only where the body overlaps no formed body, no reserved path and no body granted before it in
  the tick. Two routers that ran through each other therefore cannot both form where they overlap. A body not
  granted stays loose, with a status saying why ("rallying: clearing a friend"), walks clear, and asks again.
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
  block geometry for fire and melee (`blockGeometry` in `src/sim/fire.ts`) ignores the lags; C1 moves the melee's gap
  onto the bins, so that a charge reaches contact where collision says it does.
- **A broad phase** over formations, by reach, as fire's friendly-cover test does, finds the pairs near each other;
  only those are tested bin against bin.

### The clamp

Every pose change already passes through the footprint gate, which halves a step until no bin's places are on
impassable ground. Collision is a second test in the same places, against other bodies.

- **Still or moving.** A formation is **still** this tick when all of these hold at the start of the tick: it is
  in the fight, has no order at its head but a dress or none, is not changing shape, is not in melee, and its lags
  and their rates are all 0. Every other formation counts as **moving**. The test is from start-of-tick state, and
  errs toward "moving", which only costs caution.
- **The allowance.** For each bin, from the start-of-tick positions of everyone, its motion this tick may close the
  gap to each nearby body:
  - by the whole gap less the margin, if that body is still;
  - by **half** of it, if that body is moving, since the other may close its half too.

  The bin's allowance is the least over its bodies. A least is the same in any order and exact in floating point.
- **Only approach is clamped.** The allowance limits the part of a bin's motion that closes the gap; motion that
  keeps or opens it is free. So a pair that starts the tick inside the margin (a recoil from contact, a router whose
  foe just beat it) can always move apart.
- **Every motion goes through it,** not only the advance:
  - the advance and the lags' catch-up (`lagStep`, `lagSettle`);
  - a turn, a wheel and a trail shape's turn: each bin's motion is the displacement of its places over the step, so
    the flank of a turning line, which sweeps the most, is the bin that limits it. A rotation is cut short by halving,
    as the gate cuts it today;
  - a step back (a stall's `stepBack`, a Retire, a recoil), the give way and the follow in melee (§ Contact);
  - a router's run.
  A change of shape and a Face about cannot be cut short, and are settled at their start (§ Starts settled
  together). A battalion that breaks during a change snaps to the nearer of its two shapes (`cutChange`); it is loose
  from that tick, so only enemies matter, and the snap is checked against them: if it would overlap one, it takes
  the other shape.
- **Held by a body is not stalled.** A bin clamped by a body is held for the lag model, so the anchor's speed is the
  largest that keeps every file within the lag limits: the formation slows, its free bins flow on, and it bends
  around what it met. But it is not today's stall on impassable ground, which after a second halts the formation,
  drops its orders and steps it back (`haltAtEdge`). A stall caused by a body goes to the jam rule instead
  (§ Jams), and keeps its orders.

### Starts settled together

A change of shape, a Face about and a loose body's ask to form cannot be cut short. Each changes a formation's
ground at once, so the starts of a tick are settled together, after the standing behaviour and the orders have
asked for them and before anything moves:
- **The order:** the asks are taken by a keyed draw for the tick (the world seed, the tick and the formation's
  handle), ties by handle. The order does not depend on the visiting order.
- **The test:** each ask is granted if its path (a change's whole sweep, sampled as `changeWet` samples it, or a
  Face about's end pose) meets no formed body, no reserved path as the tick began, and no path granted before it
  this tick.
- **Not granted:** the ask waits, with a status, and is asked again next tick (the square against cavalry asks again
  every tick while the threat stands). Two battalions of a line that both form square against the same cavalry: one
  starts this tick, and the other next tick if its path is still clear.
- **A granted change reserves its path while it runs:** for everyone's allowance, the ground its companies will cross
  until it ends counts as a still body. So a friend halts at a half-formed square instead of walking into it (X-09).

## Contact

- **Enemies with no charge** stop at the enemy margin: point-blank range. A move clamped at the enemy margin ends
  there ("halted at the enemy"), and the queue goes on, so a halted line fires at once (X-02).
- **A charge or an assault** may close to 0 against any enemy, not only its target. The first enemy it reaches is the
  one it strikes. The test at `charge.test`, the impact and the melee follow with that enemy, as `docs/systems/melee.md`
  does with its target today: a charge that strikes a square it was not aimed at takes that square's test at the
  impact (X-03).
- **A melee pair** stands in contact. Each tick the melee step says which side presses: the one whose strength in
  contact is the greater by more than `collision.press`.
  - **The pressed formation gives way:** its anchor moves back at `collision.giveWay` (about 0.3 m/s), clamped like
    any motion, so it cannot give way into a friend behind it. A formation that cannot give way stands and takes
    `collision.pinned` more melee losses (pressed against its supports).
  - **The pressing formation follows:** its anchor moves forward at the same pace, clamped at 0 against its foe.
    Its bins in contact are held by the foe while its anchor advances, so their lags grow and the line bends where it
    is beaten; the lag model's limits bound the bend.
  - Neither stands for `lagSettle` while it gives way or follows: they are moving.

  Ground changes hands only through the fight (X-01). When the pressed side routs it is loose, and the pursuit is
  today's.

## Loose bodies

- **Tested** against enemies and impassable ground only.
- **Overlap costs disorder:** while a loose body overlaps a formed friend, both gain disorder each tick. It is
  summed over each body's pairs in handle order, so the sum does not depend on the visiting order.
- **Their pace** is cut while they overlap a friend.
- **Which states:** routing, rallying and shattered formations; skirmish order; a passage of lines, from its order
  until it is clear; fled gunners. A router stopped by an enemy is halted and tries the next direction of its fan
  (`docs/systems/fire-morale.md`).

## Jams

A formation is **jammed** when its progress along its move has stayed under `collision.slow` (about 5% of its pace)
for `collision.wait` seconds (about 3) because bodies clamp it. A move halved again and again is jammed, though it
never stops quite dead.
- **Right of way:** formations jammed against each other (each clamped by another of them) form a jam. Each tick the
  jam's first formation, by a keyed draw for the tick, has the right of way: for its allowance the others in the jam
  count as still, and they stand still that tick. So of three battalions converging on one gap, one goes first and
  the others follow (X-06).
- **A formation jammed by a still body,** a friend that does not move, gets the status "blocked by a friend" or "an
  enemy ahead", and its queue is suspended (§ The queue).
  - **Before pathfinding:** it waits there; the player orders it round.
  - **With pathfinding (U8):** it re-plans locally with the blocking bodies as a cost.
- **Never a full re-plan on every contact:** it was what made Supreme Commander's large battles grind to a halt
  (`docs/research/formation-collision-and-commands.md`).

## Invariants

What the tests check every tick of every bench case:
1. **No two formed bodies overlap.**
2. **No pair is closer than its margin** unless it was at the start of the tick and has not come closer.
3. **No formation is frozen:** a formation with an order either made progress this tick, or has a status saying why,
   or has the right of way within its jam soon (within `collision.wait`).
4. **The visiting order changes nothing:** the reversed order gives the same state.
5. **A reserved path is never entered** by another formed body.

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
- **At most 16 orders,** a move with all its waypoints counting as one. A seventeenth is refused with a status.
- **The pool keeps room for reactions.** Orders come from one pool for the world (`MAX_ORDERS`), and today a rout's
  run, a recoil and the fall-back silently do nothing when it is full. The pool keeps two entries per formation
  that only reactions may take.
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
| **A reaction while still under command** | **suspended**: kept, not run; it resumes when the reaction ends, with its first order checked again (a move goes on from where the formation stands). Dropped, with a status, if the suspension lasts over `orders.resume` (about 60 s) | the square against cavalry (today it already keeps its orders); a melee it did not order (today it keeps its orders for after); a jam against a still body |
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
| **C1** | Formed bodies: the clamp on bins through every motion, still and moving, half gaps, starts settled together and reserving their paths, jams and their right of way, spawns checked | X-04 to X-09, X-14 |
| **C2** | Contact: the enemy margin, a move halted at the enemy, a charge striking the first enemy it reaches, the melee's gap on the bins, give way and follow | X-01 to X-03 |
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
  order remains only where an act cannot be cut short (§ Starts settled together) and to give a jam its right of
  way.
- **Per-pair exemptions instead of loose bodies.** Rejected: each exemption met the no-overlap rule somewhere.
- **Clearing the queue on contact** (today). Rejected: no game does it, and it loses the player's plan (#179).

## Drawbacks

- **Half gaps are cautious:** two movers closing on each other halve the gap each tick and never quite close it.
  That is what friends should do; enemies close to their margin over a few ticks, which is fast enough; a jam gets
  its right of way.
- **The sim's code changes in many places:** the stall path, `lagSettle`, the melee's gap, `playerOrdered`, the
  charge's start, the order pool and every rule that reads the head order. Each phase's plan lists its own.
- **Blocked formations wait** until U8; the player has to order them round.
- **Give way is a new rule in melee** and changes the charge calibration (`tools/calibrate-charge.ts`).

## Open questions

- **Cavalry through its own infantry's intervals:** historically it passed through a line's intervals. Loose for
  the passage, or a passage of lines ordered by the player?
- **Give way's speed and the pressing margin:** first guesses, tuned on X-01.
- **The queue's resume timeout** and whether a resumed move should re-check the path (with U8, yes).
- **Attack-move:** whether it is wanted beside charge and fire at will.
