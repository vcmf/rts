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
- **Give way in melee**, rallies on free ground, a passage of lines and the queue's rules: later, from the bench.

## The checks

- `test/bench.test.ts`: each case run with the switch on as well; invariant 1 is expected to hold in the cases where
  the claims apply (X-02, X-05 to X-07, X-13, X-14), and whatever holds or fails is recorded, case by case, in this
  plan's results.
- The reversed visiting order with the switch on: the keyed order makes it the same state.
- The cost: the grid's rebuild and the extra tests per tick at 40 battalions (X-14), against the tick's budget.
- With the switch off, every existing test, golden and replay is unchanged.

## Results

Not yet run.
