---
status: active
last_reviewed: 2026-10-25
---

# Plan: C0, the visual bench

Phase C0 of the collision and orders proposal (on its own branch; its PR goes into `epic/sim-engine` after the unit
model's, #186). It is a playground on the sim page, built before any collision code. It shows what the
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
- `placeAll(w, out)`: every filled slot's place, as the sim's gate places it (`placesCtx`, `placeAtSlot` in
  `src/sim/formation.ts`, with the bins' lags), with its formation, company and bin. Places, not rectangles: they
  work the same for every shape, a march column on a bend included.
- `contacts(w, P, near)`: every pair of companies of two formations with places within `near` metres, with their
  nearest two places, found through a counting-sort grid.
- `formedOverlaps(w, P)`: the contacts closer than `TOUCH` (1 m) between two formations both in the fight. Within a
  block places stand under a metre apart, so two blocks that interpenetrate put places of one within about half a
  metre of the other's, and two that only touch keep them over a metre apart. It is the bench's test of the first
  invariant.

The overlay and the tests share these functions, so what the page shows is what the tests check. Nothing in the
tick calls them, so the hash does not move.

### 2. The overlay (`src/render/map.ts`, `src/app/main.ts`)

D toggles the overlay. The panel toggles each layer:

| Layer | Drawn |
|---|---|
| Blocks | each company's places' hull; solid in the fight, dashed out of it (routing, rallying, shattered: the proposal's loose bodies) |
| Strips | each bin's places' hull, shaded by its lag over the lag limit |
| Contacts | each pair of companies of two formations within 5 m: a line between their nearest places, grey for friends, red for enemies, orange for a charge at its target, thick for a melee pair. An overlap of two formations in the fight is filled red |
| Statuses | each formation's status, and its engagement (charging, in melee, sheltering, routing) |
| Orders | each formation's queue: a line through its move's waypoints, a label for each order in the queue (form, face, wheel, dress, charge), and the formation's outline at its last destination |

Its collision model changed after the proposal's third review (the owner, 2026-10-25): formations will claim cells
of a grid each tick instead of clamping their bins' motion. The claim grid is prototyped on this bench next, and its
cells get a layer of their own then.

### 3. Time (`src/app/main.ts`)

- **Speeds:** ¼× and ½× beside the existing 1×–8×.
- **A tick at a time:** `.` steps one tick when paused, `,` goes back one. The readout shows the tick number.
- **Go to a tick:** G asks for a time (`m:ss` or seconds), back or on. The timeline (`src/app/timeline.ts`) keeps
  saves of the world at an even interval (20 s to start with, doubled past 24 saves) and the last 10 hash ticks'
  worlds (the tick serializes the world to hash it anyway), so a tick back replays at most a second and going back
  further at most one interval. Its rules:
  - after every tick, however it was reached, the world holds every logged order stamped for its next tick, so the
    same tick is the same world, stepped to or gone to;
  - a tick played again should give the hash it gave the first time. If not, the page pauses and says so, and the
    timeline follows the new pass from that tick (the bench's tests forbid it: the sim is deterministic);
  - an order given after going back drops the orders, saves, hash points, dropped orders and marks past that tick:
    a branch. The session still replays;
  - going to a time works on a copy of the timeline and commits once the world is reached.

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
| X-15 pushed back | a veteran regiment charges a raw one at the halt, open ground behind it (added in C1, step 4) |
| X-16 pushed onto a friend | the same, a friendly regiment just behind the raw one |
| X-17 pushed onto an enemy | the same, an enemy regiment just behind the raw one |
| X-18 pinned from the flank | a veteran charges a steady regiment; a second regiment charges its flank (C1, step 4) |
| X-19 offset lines | as X-15, the veteran 20 m to one side |
| X-20 brigade lines | two raw regiments abreast, each charged by a veteran |
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
  - **Invariant 4:** every step reversed, the formation step too (`reverseMoves`, a test switch of its own), gives the
    same state, but for which pool entries the orders took. Today it fails where a charge steers at its target as
    moved earlier in the formation step (#187).
- **`test/geometry.test.ts`:** `placeAll` places every filled slot of every shape and type once; `contacts` against a
  scan of every pair of places; `formedOverlaps` for two lines apart, touching, and one through the other.
- **`test/timeline.test.ts`:** going back (from a fresh world and from a save) and playing on gives the first pass's
  world, orders logged after the tick included; an order after going back branches the log, and the session replays.
- **`npm run check:app`:** X-09 with the overlay on and an order to the column, a screenshot, then back before the
  order and on tick by tick: the same hash, and the session replays in Node.

## What it does not do

No collision, no queue rules, no new orders; the scenarios' outcomes are today's. The renderer's interfaces
(`SoldierLayer`, `Man`, `volleyTick`) are unchanged; the overlay is drawn by the staff map alone.

## Review

Not yet reviewed.
