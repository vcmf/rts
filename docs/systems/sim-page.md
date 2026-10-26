---
status: current
last_reviewed: 2026-10-26
code: [app/index.html, src/app/main.ts, src/app/battle.ts, src/app/battle-frame.ts, src/app/battle-link.ts, src/app/host.ts, src/app/sim-host.ts, src/app/sim-worker.ts, src/app/men-host.ts, src/app/men-worker.ts, src/app/tick-ring.ts, src/app/page-rules.ts, src/render/men.ts, src/render/men-clock.ts, src/render/soldiers.ts, src/render/map.ts, src/render/scene.ts, src/render/style.ts, src/scenarios/s1b-field.ts, src/scenarios/s1d-arms.ts, src/scenarios/s1d-charge.ts, src/scenarios/s1d-guns.ts, src/scenarios/s1e-battle.ts, test/soldiers.test.ts, test/battle-report.test.ts, test/battle-thread.test.ts, test/page-rules.test.ts, tools/app-check.mjs, tools/bench-sim.ts, tools/preview.ts, tools/battle-report.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0018-battalion-of-400, 0016-typescript-toolchain]
---

# The sim page (S1b)

A Vite page that runs the sim in a worker (on its own thread when it cannot) and draws it as a staff map, with every soldier as a
small circle (a trooper with a stroke the length of his horse, a battery's pieces as barrels ahead of their
detachments). The mouse selects battalions and orders them; every order is a command, so a session
exports as a replay that plays back in Node to the same hashes.

```
 page (display rate)                              sim worker (src/app/sim-host.ts)
 input ──► command ── postMessage ──────────────► issue ──► sim tick (20 Hz × speed) ──► formation state
   ▲                                                                    │ after each tick: the tick ring (8 slots)
   │                                              men worker (src/app/men-host.ts)
   │                                              its world ◄─┘, soldier layer (who stands where, steering, clock)
   │                                                                    │ ≤ 120 a second
 World + SoldierLayer views ◄── a slot held ◄──── published frame: the world's columns, the men (3 slots, shared)
   │                       ◄── postMessage ────── (sim worker) the log, orders dropped, hash points
 staff map (base image, contours, symbols) + units ──► two canvases
```

## Goals / non-goals

- Goals: see the S1a sim with the eyes; drill with the mouse; measure the cost of 40 battalions; keep the
  render side out of the sim (decision 0005).
- Non-goals: the 3D world, figures, fire and morale (S1c), the staff map's final art
  (`docs/proposals/staff-map/`). The formation prototype stays the reference for the feel.

## Constraints

- The soldier layer is cosmetic: it reads the sim and never writes to it; it uses its own RNG
  (`cosmeticRng`), so its choices never change a hash.
- Sim plus soldier layer within 4 ms per frame for 40 battalions on the dev Mac. At 400 men a battalion
  (decision 0018) it holds at the halt and firing (0.7 ms). With all 16,000 men marching the layer stepped once a
  frame cost 4.4–6 ms ([#36](https://github.com/vcmf/rts/issues/36)); on its clock it costs 0.5 ms a 120 Hz frame at
  1× (p99 1.0) and about 2.5 ms at 8× (p99 4–8 between runs). In the battle worker (battle threads PR 3) the page
  reads the held slot in 0.01 ms a frame (p99 0.02–0.03) at 16,000 and 32,000 men, 1× and 8×.
  `node tools/bench-cost.ts` measures the battle by part on the page's release world, at a speed (in Node);
  `node tools/bench-sim.ts` the page itself in Chrome, either thread.

## Design

**Threads** (`src/app/battle-link.ts`, battle threads PRs 3 and 5). When the page is cross-origin isolated (COOP and
COEP on Vite's servers, `vite.config.ts`) the battle runs in two workers, else on the page (`src/app/battle.ts`: the
sim, the soldier layer and its clock, the log), which `?thread=main` forces. The **sim worker**
(`src/app/sim-host.ts`) runs the sim on its own clock (a timer loop, `src/app/host.ts`): commands, the log, hash
points, replays. After every tick it writes the world's columns into the **tick ring** (`src/app/tick-ring.ts`, 8
shared slots stamped with their tick; the writer skips the slot the reader holds, the reader checks the stamp around
its hold), the tick's departures into a shared log, and the game clock, stamped with its tick, into the ring's header
(in three slots, the frames' protocol). The **men worker** (`src/app/men-host.ts`) takes the ticks in order into its
own world, the layer synced after each with the departures since its last (behind the ring, it takes the oldest it
still holds, the departures whole from the log), steps the men on their clock at the sim's speed (the alpha the game
time since its own world's tick), and publishes a frame at most 120
times a second when something changed (`src/app/battle-frame.ts`): every column of the world's state, the men
(position, velocity, slot, flags), each battalion's men, and the clock (the leftover game time, the speed, the
publish time). Three slots in shared memory: the worker fills the one neither newest nor held, the page holds the
newest for its frame; neither waits. The page
reads a slot in place: a `World` whose columns are views on it and a `SoldierLayer` on that world that is never
stepped, so the map, the HUD, picking and box select read them as they read the battle itself. Commands and
requests go to the sim worker by message (the headless checks' advance: the sim runs it at speed 0 for the men,
its ticks logging their departures only, then writes its last world; the men take it and step `sec` of game time to
their places, so where they stand does not hang on the threads' timing); the log, the orders dropped and the hash points come back by message. The men outgrowing a
frame's room get new slots, sent again. Workers that fail to start leave the battle on the page (said on the
console); one that fails later stops for good, its requests rejected, and the readout says the battle stopped. The
battle is held (speed 0) while the page is hidden and while a mark's prompt is open, as when it ran in the page's
frames (`src/app/page-rules.ts`); the selection is pruned of formations whose slot was reused since they were chosen.

**Loop** (`src/app/battle.ts`, in the worker or on the page). Each frame (the page's, or a turn of the worker's
loop) adds `dt × speed` to an accumulator and runs the
ticks owed (at most 20 per frame; the rest is dropped), syncing the soldier layer after each. The layer
then takes the sub-steps due on its own clock (`src/render/men-clock.ts`, battle threads PR 1,
`docs/plans/active/battle-threads.md`), not once a frame: `MEN_HZ` rounds a real second, whatever the frame rate,
each split into a sub-step per group of battalions (`MEN_GROUPS`, shared out by their men; a battalion keeps its
group while it lasts), spread evenly over the round. A sub-step covers its group's game time since its last one, at
most `MEN_DT` (above it halted men near trunks jitter, measured), so at higher speeds the rounds come faster and 8×
costs more than 1×. A long frame catches up at most `MEN_ROUNDS` rounds. The values and why: the head of
`src/render/men-clock.ts`. The men are drawn as they
stand after their last sub-step, with no interpolation; `alpha = acc / tick`, set every frame, interpolates the
anchors, the colours and the order lines (from the worker, the frame's leftover game time plus the time since it
was published, at its speed). The map is redrawn only when the
view changes; the units every frame, on a second canvas.

**Commands.** Every input goes through `issue` with the external log. The page keeps the hash points the
sim takes, without section hashes (a second serialization each time); a mismatch in playback then names
the tick, not the table. Orders the sim drops show in the readout for 3 s. The colours and the order
line are drawn at the interpolated anchor, as the men are. `Save
session` downloads `{ replay, hashes, marks }` as `<scenario>-<date>.json`; `play` in `src/sim/replay.ts` checks it,
and `tools/battle-report.ts` plays it back and prints what happened, with where everyone stood at each mark
(S1e-3, `docs/plans/active/s1e3-playtest.md`). The report refuses a file whose marks are out of tick order, past
its end or without a text note (one edited by hand would otherwise lose marks silently). It tells a formation that
left the field (with its men, from what the tick returned) from one destroyed, each named by its own side. With no
session it plays the scenario with no orders for `[minutes]` (a positive number; the scenario's limit by default),
and stops a minute after the battle's end.

**The men** (`src/render/men.ts`): a structure of arrays, one index per man for the layer's life (position,
velocity, drift phases, hold point, slot, and flags: standing, settled, left the field). A battalion lists its men's
indices in the order they joined; nothing is compacted, so a fallen man keeps his index and his cross is drawn from
it, gone battalions' men included, while a man who left the field frees his for a newcomer. Readers (picking, box
select, the map, `app-check`) take the arrays from `layer.men` each time they read them, through a battalion's list:
a full store grows into new arrays, which the battle worker will have to share again
(`docs/plans/active/battle-threads.md`, PRs 2 and 3).

**Who stands where** (`SoldierLayer.sync`). The sim keeps men per company (decisions 0007, 0018); the layer
places them. A battalion is matched again only when its signature changes: men per company, shape,
the shape it changes to, the lean bit and the `faces` counter.
- A man keeps his slot while it stays filled.
- Face about: each man's slot becomes its half-turn (`shape.turn.m`), once per step of the sim's
  `faces` counter (incremented in `faceAbout`). The page syncs after every tick, so the half-turn is
  the shape's the battalion turned in, even when a change of shape follows within the same frame.
- The match runs only when a battalion's signature changes (a few integers compared per battalion).
- Losses: men whose slot emptied fall first, then men drawn at random. The fallen stay as crosses.
- Men whose slot emptied walk to the nearest free filled slot; new men appear at their places.

**Steering** (`SoldierLayer.step`), as in the prototype:
- the place is the slot extrapolated 0.6 s ahead along the battalion's motion, falling back to the
  current place when that one is impassable;
- personal sway while the battalion moves, wider among trees;
- separation from neighbours found through a grid (`SC` in `src/render/soldiers.ts`), rebuilt at the start of
  each round from where the men stood then (so the order men and groups move in does not matter; men lost or added
  within a round show in it at the next);
- going round the cosmetic tree trunks: the trunks near each cell of the scene's obstacle grid are listed
  once, so a man away from the woods looks at none;
- speed from the ground (`groundG`).

A man never steps from passable onto impassable ground. **Settled**: at the halt, a man within 0.25 m of
his place stops and holds still until the place moves 0.3 m or the battalion moves again. Without it men
jitter in the wood and the 40-battalion frame costs 0.5 to 0.8 ms more (both shown by the negative runs).
**Still**: while a halted battalion's places are framed exactly as the frame before (its anchors, trail,
lags and their rates), its settled men are not visited at all: a firing line of 400 costs nothing per
frame until a loss moves someone (S1c-5).

**The map** (`src/render/map.ts`), built once from the data:
- a class image at 4 px per metre with smoothed edges;
- contours every 2 m from the heightfield, with labels, and spot heights at the summits;
- class edges by marching squares;
- symbols by class: stipple, furrows, beads, reeds and trees, scattered by `buildScene` with the
  cosmetic RNG.

How each class looks is the style table `src/render/style.ts`, keyed by class name. Ground outside the
data is a darker margin.

**Input.**
- Click a battalion to select it (shift toggles); drag a box to select.
- Click the ground to march the selection; each battalion keeps its offset from the group's centre;
  shift appends a waypoint.
- Right-drag or space-drag pans; the wheel zooms about the cursor.
- P pauses, 1/2/4/8 set the speed, Escape clears the selection.
- M marks a moment for the playtest: the battle pauses while you say what happened (optional). Marks go in the
  session file, not the sim.
- C (or the panel's Charge) and then a click on an enemy: the selection charges it (S1d-2; a type that cannot
  charge is refused, and the readout says so). The readout names a charge, a pursuit, a melee and a blown
  regiment.
- The panel is built from the ruleset (every type's shapes, order presets); a shape the selected formation's
  type lacks is refused, and the readout names each selected formation's type.

**Scenarios** (`src/scenarios/page.ts`): `s1c-firefight` (the default, `docs/systems/fire-morale.md`),
`s1c-brigade`, `s1d-arms` (a battalion, a cavalry regiment and a battery a side, holding fire: the unit types,
`docs/plans/active/s1d1-unit-types.md`), `s1d-charge` (a regiment against a battalion in line and one in
square, `docs/systems/melee.md`), `s1d-guns` (a battery on the hill against a column across the stream,
`docs/systems/artillery.md`), `s1b-field` (three battalions a side, holding fire until ordered) and
`s1b-bench` (40 battalions of 400 in column, holding fire), chosen by `?scenario=`. Battalions are of 400. Fire shows
as a flash at a company's front with a fading line to its target (a battery's roundshot: a line to where the
ball stopped; canister: a fan); morale as a bar behind each battalion,
named unless steady. Fire at will and Hold fire are panel orders. The page loads the scenario's map (`Scenario.map`, the formation field unless it names another) at the version
in `src/scenarios/maps.ts`; `s1e-battle` (6 battalions, a regiment and a battery a side, firing at will; you command side 0) is on the
1.2 km battlefield, where you command side 0 against side 1's plan. `look-cross` is on the look page's world as a sim
map (`maps/painted-world.ts`, built from `data/painted-world.lookdata`: the heights, the cover mapped to the ruleset's
classes, the river's water, its ford included; the buildings `denseWood`, the ruleset having no class for them, and blocked
to the paths with water too deep to wade; no woods, the look tile having none), four battalions a side east of the river (battle threads PR 4a). The readout shows each side's share of its men
in the fight and, once decided, the result.

**Hooks** (`window.APP`): `thread`, select, march, charge, form, order, `speed(s)`, `advance(seconds)` (pauses the
clock and steps frames at 30 Hz), view, `drawMs`, `mapMs`, `stats`, `hash`, `replay`, `session`, `mark(note)`,
`replayHere()` (the session played again on the page's thread against the hash points the worker took: the
browser's replay harness), `record(seconds)` (the frames' intervals, battle and draw times, long tasks and the
worker's advances, for `tools/bench-sim.ts`). Those the worker answers (advance, hash, replay, session,
replayHere, record) return promises; `tools/shot.mjs` evaluates steps in REPL mode, so they can be awaited.

## Tunables

`AHEAD`, `WALK`, `RUN`, `SEP` and the steering gains in `src/render/soldiers.ts`; class looks in
`src/render/style.ts`; the scenarios in `src/scenarios/`. A type's men walk and run at least the infantry's
speeds, faster where its pace (or its routers') would leave them behind (troopers at the trot and the gallop).

## Verification

- `test/soldiers.test.ts` (Vitest, real sim, frames at 30 Hz):
  - at rest;
  - slot error through line → square, a march column's turn and the wood;
  - halted in the wood at six points;
  - casualties, one man per filled slot;
  - at 8× (0.2 s steps): a march column's turn, the wood, the river bank;
  - Face about for a line and a square at 100 and 97 men;
  - a battalion that is gone;
  - men never in deep water;
  - troopers at the walk and the trot and through their changes; a battery's gunners falling in after it
    deploys;
  - cost for 40 battalions of 400 (and 800, reported).
- `npm run check:app` builds and serves the page and drives it headless, the battle in the worker (each run fails
  unless the page reports it there):
  - the drill scenario, with screenshots, a multi-selection move, square and Face about; its session replayed on the
    page's thread in Chrome against the worker's hash points (`replayHere`);
  - every panel button logs one command;
  - the 40-battalion bench;
  - the arms: a battery unlimbering, a regiment at the trot and changing shape;
  - the charge: a regiment charges a line, which breaks, then a square, which holds;
  - the guns: a battery fires roundshot on a column, which loses men;
  - the battle: 16 formations deploy on the battlefield, a column of route crosses a ford, and every man stays
    on the map; you can select only your side, side 1's first line (all four battalions) advances on its own, and
    the battle runs to a result;
  - each session's replay played back in Node; the battle's session through the playtest's report (one checked
    pass), which must find the mark made on the page and the end.

  It fails on any console error or hash mismatch.
- `test/battle-thread.test.ts`: a published frame read in place is the battle (every column, man and battalion, the
  hash, the map's places); a frame with no room for the men is refused; the slot protocol over thousands of
  interleavings; the tick ring: tick 0 to a reader that has taken none, the ticks in order with their departures, a
  reader behind the ring taking the oldest tick it holds with every departure since its last, the clock read against
  the reader's own tick, a departures-only write leaving the slots as they were, the writer reusing the slot found
  between the reader's look and hold, and the writer running while the reader holds a slot; the advance leaving the
  men where two runs agree; the battle in two Node worker threads (the
  same host code, `test/fx-battle-workers.ts`): on its own clock with commands arriving whenever, its stamped log
  replayed on the test's thread reproduces every hash point; outgrown, the men worker sends new slots; workers that
  fail reject; it runs while the page only reads.
- `test/battle-report.test.ts` (the playtest's report, `tools/battle-report.ts`): a session with an order and a
  mark, played back with every formation's place at the mark and the end table; a session that does not reproduce,
  and marks out of order, past the end or without a text note, refused; the first tick played is reported; a
  formation that leaves the field (with its men) and one destroyed, each by its own side; with no orders, the
  scenario runs, and stops a minute after the end.
- Negative runs (results in `docs/plans/done/s1b-sim-page.md`): the relabelling, the signature, the
  slot reassignment and the settled state each break a test when removed.

## Open questions

- At 40 battalions of 400 (16,000 men) sim and soldier layer cost about 14 ms a frame marching and 6 ms
  firing on the dev Mac, against the 4 ms budget; 40 × 800 costs about 27 ms. The cost tests hold
  temporary budgets until S1c-5 ([#36](https://github.com/vcmf/rts/issues/36)). The worker (S2) takes the ticks off the main
  thread.
- The page selects and orders both sides only in scenarios with no player side (a sandbox); `s1e-battle` gives
  you side 0 (`docs/systems/sides.md`).
- No speed overlay yet (the plan listed one); the slots overlay exists.
