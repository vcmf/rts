---
status: active
last_reviewed: 2026-10-25
---

# Plan: C0, the visual bench

Phase C0 of the collision and orders proposal (`docs/proposals/collision-and-orders.md`, on the branch of its PR
into `epic/sim-engine`). It is a playground on the sim page, built before any collision code. It shows what the
sim holds (blocks, strips, contacts, orders), lets a moment be stepped through and gone back to, and stages the hard
cases as scenarios with tests. It runs on today's sim, so it first shows today's failures: formations passing
through each other, and orders lost to a charge (#179).

It changes no rule of the sim. Its goldens, replays and calibrations do not move.

## The problem

Collision is judged by eye (the owner, 2026-10-25). Today the page draws every soldier as a circle, and the
formation's slots on request, but not what the sim tests: the company blocks, the bins that lag, which formations
touch, and the orders queued. A moment that goes wrong cannot be looked at again.

## What is built

### 1. The geometry, from the sim

`src/sim/geometry.ts` (new), read-only:
- `companyRects(w, i, out)`: each company's rectangle as its filled slots stand, in the places the sim's gate
  tests (`placesCtx`, `placeAtSlot` in `src/sim/formation.ts`). Each rectangle is a centre, half-extents and an
  axis, from the extremes of its places in the company's frame, grown by half a file and half a rank.
- `binRects(w, i, out)`: the same for each bin of each company (the type's slot → bin table), with its lag.
- `rectGap(a, b)`: the separating-axis gap between two rectangles, below 0 when they overlap. These are exact
  operations (decision 0006), like `sep` in `src/sim/melee.ts`.
- `formedOverlaps(w)`: every pair of companies of two different formations, both in the fight, whose rectangles
  overlap. It is the bench's test of the first invariant (the proposal's § Invariants).

The overlay and the tests share these functions, so what the page shows is what the tests check. Nothing in the
tick calls them, so the hash does not move.

### 2. The overlay (`src/render/map.ts`, `src/app/main.ts`)

D toggles the overlay. The panel toggles each layer:

| Layer | Drawn |
|---|---|
| Blocks | each company's rectangle; solid in the fight, dashed out of it (routing, rallying, shattered: the proposal's loose bodies) |
| Strips | each bin's rectangle, shaded by its lag over the lag limit |
| Contacts | each pair of companies of two formations within 5 m: a line between their centres, grey for friends, red for enemies, orange for a charge at its target, thick for a melee pair. An overlap of two formations in the fight is filled red |
| Statuses | each formation's status, and its engagement (charging, in melee, sheltering, routing) |
| Orders | each formation's queue: a line through its move's waypoints, a label for each order in the queue (form, face, wheel, dress, charge), and the formation's outline at its last destination |

The clamp and reserved-path layers come with C1, which has clamps and reservations to draw.

### 3. Time (`src/app/main.ts`)

- **Speeds:** ¼× and ½× beside the existing 1×–8×.
- **A tick at a time:** `.` steps one tick when paused, `,` goes back one. The readout shows the tick number.
- **Go to a tick:** G asks for a time (`m:ss` or seconds) and rebuilds the world from the scenario, replaying the
  commands logged so far up to it, paused there. A bench case is a few minutes long, so the replay takes well under
  a second. Going back keeps the log. An order given after going back replaces what came after it, like a branch.

### 4. The bench map

`maps/bench.ts`: a flat, open 600 m square (2 m cells, one class: open), so terrain plays no part. It is built by
`tools/build-sim-data.ts` into `data/bench.simdata` and has its version in `src/scenarios/maps.ts`.

### 5. The cases (`src/scenarios/bench.ts`)

One page scenario per case of the proposal's § The bench, each with the id in its name (`bench-x01-clash`), set up
by `debug-spawn` and scripted by its plan so that it plays on its own. The page opens each one framed on its
action. Today the sim has no assault, loose bodies or passage of lines, so some cases stage the nearest thing they
can:

| Case | Staged today as |
|---|---|
| X-01 head-on clash | a regiment charges a line head on (no infantry assault yet) |
| X-02 lines meet, no charge | two lines march into each other |
| X-03 a brigade charge | a regiment charges the middle battalion of three, its wing reaching a neighbour first |
| X-04 recoil from a square | a regiment charges a formed square |
| X-05 into a halted friend | a column marches through a halted friendly line |
| X-06 three on one gap | three battalions ordered to the same point |
| X-07 threading | a column marches between two halted lines 20 m too close |
| X-08 a wheel into a friend | a line wheels into a halted friend |
| X-09 a square forming as a friend arrives | a battalion forms square; a friend marches through where it forms |
| X-10 a router through friends | a battalion broken by debug-morale runs through two friendly lines |
| X-11 a rally inside a friend | the same, rallying where it stops |
| X-12 gunners into a square | a battery broken by debug-morale runs past a friendly square |
| X-13 a passage of lines | a second line marches through the first |
| X-14 forty crossing | 40 battalions ordered across each other's paths |
| Q-01 a shift chain | move, then form, face and move appended |
| Q-02 a charge in a chain | a charge with a move after it |
| Q-03 the square in a chain | moves queued, a regiment threatens, the square forms |
| Q-04 a rout in a chain | moves queued, the battalion broken by debug-morale |
| Q-05 a plain order in a chain | a chain, then a plain move |

### 6. The checks

- **`test/bench.test.ts`:** each case is played for its length.
  - **Invariant 1** (`formedOverlaps` is empty every tick) and the case's outcome are written as the proposal
    wants them. Those that fail today are marked `it.fails`, with today's behaviour in a comment; C1–C4 turn them
    into plain tests as they land.
  - **Invariant 4:** the reversed visiting order gives the same hash. This holds today.
- **`test/geometry.test.ts`:** `companyRects` against a scan of every man's place, for a line, a column, a square,
  a march column on a bend and a change halfway; `rectGap` face to face, at an angle and overlapping.
- **`npm run check:app`:** a few cases on the page with the overlay on, a screenshot at their key tick, and the
  go-to-tick round trip (the hash after going back to a tick equals the hash first seen there).

## What it does not do

No collision, no queue rules, no new orders; the scenarios' outcomes are today's. The renderer's interfaces
(`SoldierLayer`, `Man`, `volleyTick`) are unchanged; the overlay is drawn by the staff map alone.

## Review

Not yet reviewed.
