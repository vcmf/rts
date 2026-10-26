---
status: active
last_reviewed: 2026-10-25
---

# Plan: C1, a prototype of the claim grid

**Experimental.** The owner chose it (2026-10-25) after three review rounds of the collision and orders proposal
found overlaps and freezes in its clamp on bins: formations claim cells of a grid instead. This prototype runs on
the visual bench (`docs/plans/active/c0-bench.md`) behind a switch that is off by default, so no golden, replay or
calibration moves. What the bench shows decides the collision part of the proposal, which is written after it.

## The idea

Other formations' cells are impassable ground for the formation that is moving. The sim already keeps every man
off impassable ground in every motion:
- **the footprint gate** halves a step, a turn or a wheel until no bin is newly on it (`gate` in
  `src/sim/formation.ts`);
- **the lag model** holds a bin that has it underfoot or a step ahead (`sampleBins`), so the formation slows, its
  free bins flow on and it bends around it;
- **a change of shape** is refused if its path meets it (`changeWet`), and **Face about** if its end pose does.

So a formation blocked by another behaves as one blocked by a wood's edge or a stream, through the code that
already does that, and the bending of the proposal comes from the same lag model.

## What is built

1. **The grid** (`src/sim/claims.ts`, new): one entry per terrain cell, rebuilt at the start of the formation step
   (step 5) from every live formation's places (`placeAll`, `src/sim/geometry.ts`):
   - a formation's **core**: the cells its places stand in;
   - its **halo**: the core grown by the margin, `collision.margin` cells (1 to start with, a cell being 2 m on the
     bench field);
   - each cell keeps up to two owners and a mark for more, so touching formations do not lose who is where.
2. **Blocked for whom** (`claimedAt(w, i, x, z)`): a cell is blocked for formation i when another formation's core
   or halo holds it, except:
   - **a formation out of the fight** (routing, rallying, shattered: the loose bodies) neither blocks friends nor is
     blocked by them;
   - **a charge** is blocked only by enemies' cores, not their halos, so it reaches contact;
   - **a melee pair** does not block each other.
3. **Through the existing tests:** every `impAt` call in `src/sim/formation.ts` (the wet slots and bins, the lag
   model's look-ahead, the change's path) also asks `claimedAt` while the switch is on. The quick rejects that skip
   those tests far from impassable ground (`clearOfImpassable`, `companyClear`, the change's) are skipped for a
   formation with another formation's reach near it.
4. **The order of a tick:** while the switch is on, the formations are stepped in an order fixed by a keyed draw
   for the tick (the world seed, the tick, the handle), not by slot. After each one steps, its new cells are added
   to the grid; its old cells stay claimed until the next tick's rebuild, so two formations cannot swap places
   through each other in one tick.
5. **Already in contact:** the gate refuses only bins newly on blocked cells (its `before` bits), so a formation
   that starts the tick inside another's halo can still move as long as no further bin enters it. That is the
   prototype's answer to "a pair in contact can always move apart"; the bench tells whether it is enough.
6. **The switch:** `w.claims` (a world flag, set by the bench's scenarios through a `debug-collision` command, so
   replays carry it), off by default. While it is on, the grid is not state: it is rebuilt from positions every
   tick, and the hash does not cover it.
7. **The overlay:** a **cells** layer drawing each claimed cell, core darker than halo, in its owner's side's colour.

## What it does not do yet (and the bench is watched for)

- **A change of shape under way** is checked only at its start; its companies' sweep during the change is timed,
  not gated, so it may sweep into a formation that arrived meanwhile (X-09).
- **Jams** get today's statuses: a stall on blocked cells reads as impassable ground, and today's stall halts the
  formation and drops its orders after a second (`haltAtEdge`). The prototype shows how often that happens before
  the proposal decides what should.
- **A passage of lines** and the queue's rules: later, from the bench. (Giving way in melee and rallies on free
  ground came in steps 3 and 4.)

## The checks

- `test/bench.test.ts`: each case run with the switch on as well; invariant 1 is expected to hold in the cases where
  the claims apply (X-02, X-05 to X-07, X-13, X-14), and whatever holds or fails is recorded, case by case, in this
  plan's results.
- The reversed visiting order with the switch on: the keyed order makes it the same state.
- The cost: the grid's rebuild and the extra tests per tick at 40 battalions (X-14), against the tick's budget.
- With the switch off, every existing test, golden and replay is unchanged.

## Weak points, and the order of work

The first runs, and seven review rounds of the earlier design, leave these. The research
(`docs/research/claim-grid-weak-points.md`) gives each an answer; each step is measured on its bench cases.

| Step | Weak point | What | Cases |
|---|---|---|---|
| 1 | W5, cost: 4.6 ms a tick at 40 battalions (1.55 ms without claims, budget 2 ms) | stamp each core cell's margin once; claim each bin as a rectangle instead of every man; a 16 m mask of who is near, so the gate's quick rejects come back; cells held by three or more formations block only those that do not own them | X-14 |
| 2 | W1, jams: three battalions on one point all stop; a block by a formation takes the terrain stall, which drops orders | "blocked by a formation" its own status that keeps the orders; a formation blocked by a settled friend at its goal counts as arrived, the radius growing while it stays blocked; the order of a tick by how long each has been blocked, then a keyed draw held for 2 s, kept until it makes progress | X-05, X-06, X-07, X-14 |
| 3 | W2, acts that cannot be cut short: a change of shape checked only at its start (X-09); a rally inside a friend (X-11) | a change's swept ground reserved when it starts, refused (or the next shape that fits) if that ground is taken; a break mid-change snaps inside that ground; a router forms only where its formed footprint fits, else runs on or takes the nearest free place by a ring search | X-09, X-11, X-12 |
| 4 | W3, the clash: melee pairs only stand | a melee's rounds: the loser steps back as a whole, the winner follows; one that cannot (anything in the way, a second enemy on its flank) loses nerve | X-01, X-15 to X-20 |

W4 (today's code paths: the stall path, orders that read the head, reactions that clear the queue) and W9 (the
queue) are the orders work (C4); W6 (the cell's size) is measured on the bench as the steps land; W8 (two
geometries) is C2's.

## Results

**First run** (2026-10-25), every bench case with claims on:
- no two formed bodies overlap in 17 of 19 cases; X-11 (a rally inside a friend) and X-09 (a column into a square
  still forming) do (W2, step 3);
- the keyed order: the reversed visiting order gives the same state in every case;
- charges reach melee (X-01, X-03); the column halts at the friendly line (X-05);
- three battalions on one point all stop (X-06) and today's stall drops their orders (W1, step 2);
- cost: 4.6 ms a tick at 40 battalions against 1.55 ms without claims (W5, step 1).

**Step 1, first part** (2026-10-25), X-14, five minutes, 40 battalions crossing (load average about 7):

| Change | ms a tick |
|---|---|
| the prototype | 4.64 |
| each core cell's margin stamped once; four owners a cell (a junction of three no longer blocks its owners) | 3.52 |
| the next tick's rebuild stamps each formation's cells from its last claim instead of placing its men again | 3.17 |
| claims looked up only by a formation another's claims come near; a formation that has not moved keeps its claim | 3.00 |
| without claims | 1.82 |

What is left is the per-man ground tests near other formations (the lag model's look-ahead, the gate and placing
the men: about 46% of the tick). Bringing it under the 2 ms budget needs claims and tests by bin rectangles instead
of men, the second part of step 1. Every claim case still passes as before, and the reversed visiting order now gives
the same state in all of them, X-01 too (#187 does not arise with the keyed order).

**Step 2, jams** (2026-10-25):
- a stall on another formation's cells is its own status, "blocked by a formation", which keeps the orders (a move
  and a wheel); only the ground's stall still halts and drops them;
- a move held near enough its target counts as arrived ("as near as the formations there allow"): within 10 m, plus
  5 m a second held, at most 60 m. X-06's three battalions now all arrive;
- the order of a tick: the longest held first, then a keyed draw held for 2 s;
- a formation held for half a second tries again only every half second, each on its own tick of it: X-14 went from
  4.95 ms (every held formation trying every tick) to 2.68 ms.

**Step 3, acts that cannot be cut short** (2026-10-25):
- a change of shape claims, beside its places, the ground its companies will sweep until it ends (six poses ahead),
  so a friend halts at a square half formed (X-09);
- a router forms again only where it fits, clear of every formation in the fight; standing on one, it goes first
  to the nearest place it fits, by rings of 20 m out to 160 m, faced about if the way is behind (X-11: it walks
  15 m clear and forms);
- every bench case with claims now has no overlap (19 of 19), and the reversed visiting order gives the same state
  in all of them. X-14: 2.85 ms a tick (1.84 ms without claims).

**Step 4, a melee's rounds** (2026-10-26), `roundStep` in `src/sim/melee.ts`, at the end of the melee step. Its
first design, a continuous give way (the companies in contact bent back as lags, then the whole stepped back, its foe
following), failed five reviews: the bend fought the lag model, who held it needed the gate to report every
blocker, and flank attackers needed rules of their own. Every game and rule set surveyed gives ground in steps
(`docs/research/melee-outcomes.md`, on `docs/collision-orders`), so the second design does, and its geometry is
settled here before the proposal is written (§ Contact there):
- **A round** of a pair is due every `ROUND` (3 s), on the ticks where the tick plus the pair's lower handle is a
  whole number of rounds: no clock per melee, and pairs are not judged together.
- **Only a pair is judged** (`inClashPair`): each the other's foe since the step began, both in the fight, neither
  changing shape nor in a trail shape, one ahead of the other (`aheadOf`: its companies' centre beyond the other's
  front line, and their frontages overlapping). A push is the losses a strike owes the foe this step, as expected,
  times the striker's morale (0 below 0). One short by more than `PRESS` of the two loses.
- **The step:** the loser moves `STEP` (2 m) along the winner's heading if it stands ahead of the winner, else to its
  own rear, as one rigid move (`stepWhole`, `src/sim/formation.ts`): granted whole or not at all, refused if any of
  its men would stand on a cell it may not stand on (impassable, off the map, another's claim but its foe's) that
  none of them stood on before. So a move away from what it already stood in is granted, and one deeper into it is
  not (#198 for every other motion). Its foe follows by the same displacement, by the same test, unless another enemy
  is fighting it; if it cannot, the loser's step alone ends their melee (it fell back).
- **Pinned:** a loser whose step is refused, or with a second enemy fighting it now from a flank or the rear (not
  ahead of it), takes `PINNED`, a morale shock, once for the round. A winner that cannot follow because another enemy
  is fighting it takes that enemy on as its foe at once.
- **Order:** every pair due is judged from the step's pushes before any moves; the moves are made in the claims'
  keyed order, each claiming its new cells before the next, so the reversed visiting order gives the same state.
- **Seen:** the overlay's Statuses layer shows the last round ("stepped back", "followed", "pinned", "fell back")
  for 3 s, from the melee step's scratch.

Six cases, a veteran regiment (quality 0.95) charging a raw one (0.75) at the halt unless said:

| Case | With claims | Without |
|---|---|---|
| X-15, open ground behind | two rounds lost: it steps back 4 m, the veteran follows; breaks after 3.4 s | it stands |
| X-16, a friend 9 m behind | one step, then the friend is in the way: pinned; breaks after 3.3 s | the veteran pursues the router through the friend |
| X-17, an enemy 9 m behind | pinned at the first round; breaks after 0.3 s | the same overlap |
| X-18, a second regiment charging its flank (the target steadier, 0.9) | two rounds stepped back, then the flank charge's impact breaks it | — |
| X-19, the veteran 20 m to the east | 21 rounds, each stepped back and followed, over a minute: few squadrons in contact | — |
| X-20, two raw regiments abreast, each charged | both step back round by round, each followed, in the line | — |

What the bench shows:
- **The steps read as the melee's trend:** a regiment that keeps losing keeps stepping back, its foe at its heels.
- **A second enemy on the flank** rarely meets a round: a cavalry charge in the flank breaks the target on impact (X-18).
  The pin is tested directly (a second enemy set on the flank, the next round pins).
- **Offset lines:** a 10–20 m offset is judged as square on. At 30 m and more the charge's impact itself reads the
  offset as a flank (`quarter`, an angle from centre to anchor) and breaks the target at once; the round never comes.
  That is the charge's impact, not the rounds; C2 moves it onto the same test of the shapes (`aheadOf`).
- **Brigade lines** (X-20): the follow is granted beside a neighbour standing 2 m off.

Not done yet: Face about's end pose against others (it turns in place; no case shows a problem), a break mid-change
snapping into a neighbour, and pushing a friend behind instead of only being pinned by it.
