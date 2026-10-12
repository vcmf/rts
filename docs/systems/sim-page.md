---
status: current
last_reviewed: 2026-10-12
code: [app/index.html, src/app/main.ts, src/render/soldiers.ts, src/render/map.ts, src/render/scene.ts, src/render/style.ts, src/scenarios/s1b-field.ts, src/scenarios/s1d-arms.ts, src/scenarios/s1d-charge.ts, src/scenarios/s1d-guns.ts, src/scenarios/s1e-battle.ts, test/soldiers.test.ts, test/battle-report.test.ts, tools/app-check.mjs, tools/battle-report.ts]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0018-battalion-of-400, 0016-typescript-toolchain]
---

# The sim page (S1b)

A Vite page that runs the sim on the main thread and draws it as a staff map, with every soldier as a
small circle (a trooper with a stroke the length of his horse, a battery's pieces as barrels ahead of their
detachments). The mouse selects battalions and orders them; every order is a command, so a session
exports as a replay that plays back in Node to the same hashes.

```
 input ──► issue(cmd) ──► sim tick (20 Hz, accumulator × speed) ──► formation state
                                                                        │ per frame, alpha
                                     soldier layer (who stands where, steering) ◄──┘
                                              │
                        staff map (base image, contours, symbols) + units ──► two canvases
```

## Goals / non-goals

- Goals: see the S1a sim with the eyes; drill with the mouse; measure the cost of 40 battalions; keep the
  render side out of the sim (decision 0005).
- Non-goals: the 3D world, figures, fire and morale (S1c), the worker (S2), the staff map's final art
  (`docs/proposals/staff-map/`). The formation prototype stays the reference for the feel.

## Constraints

- The soldier layer is cosmetic: it reads the sim and never writes to it; it uses its own RNG
  (`cosmeticRng`), so its choices never change a hash.
- Sim plus soldier layer within 4 ms per frame for 40 battalions on the dev Mac. At 400 men a battalion
  (decision 0018) it holds at the halt and firing (0.7 ms) but not with all 16,000 men marching (4.4–6 ms):
  [#36](https://github.com/vcmf/rts/issues/36). `node tools/bench-cost.ts` measures it by part on the page's release world.

## Design

**Loop** (`src/app/main.ts`). Each animation frame adds `dt × speed` to an accumulator and runs the
ticks owed (at most 20 per frame; the rest is dropped), syncing the soldier layer after each. The layer
then steps once per frame, for up to 0.2 s of game time (`MEN_DT`, the step the 8× test uses); a longer
frame takes more steps, at most four (`MEN_STEPS`). At 60 fps that is one step at every speed: 8× costs
more than 1× only by its extra ticks. `alpha = acc / tick` interpolates. The map is redrawn only when the
view changes; the units every frame, on a second canvas.

**Commands.** Every input goes through `issue` with the external log. The page keeps the hash points the
sim takes, without section hashes (a second serialization each time); a mismatch in playback then names
the tick, not the table. Orders the sim drops show in the readout for 3 s. The colours and the order
line are drawn at the interpolated anchor, as the men are. `Save
session` downloads `{ replay, hashes, marks }` as `<scenario>-<date>.json`; `play` in `src/sim/replay.ts` checks it,
and `tools/battle-report.ts` plays it back and prints what happened, with where everyone stood at each mark
(S1e-3, `docs/plans/active/s1e3-playtest.md`).

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
- separation from neighbours found through a grid (`SC` in `src/render/soldiers.ts`), from where they
  stood as the frame began (so the order men move in does not matter);
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
in `src/scenarios/maps.ts`; `s1e-battle` (6 battalions, a regiment and a battery a side, holding fire) is on the
1.2 km battlefield, where you command side 0 against side 1's plan. The readout shows each side's share of its men
in the fight and, once decided, the result.

**Hooks** (`window.APP`): select, march, charge, form, order, `advance(seconds)` (pauses the clock and steps
frames at 30 Hz), view, `drawMs`, `mapMs`, `stats`, `hash`, `replay`, `session`, `mark(note)`.

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
- `npm run check:app` builds and serves the page and drives it headless:
  - the drill scenario, with screenshots, a multi-selection move, square and Face about;
  - every panel button logs one command;
  - the 40-battalion bench;
  - the arms: a battery unlimbering, a regiment at the trot and changing shape;
  - the charge: a regiment charges a line, which breaks, then a square, which holds;
  - the guns: a battery fires roundshot on a column, which loses men;
  - the battle: 16 formations deploy on the battlefield, a column of route crosses a ford, and every man stays
    on the map; you can select only your side, side 1 advances on its own, and the battle runs to a result;
  - each session's replay played back in Node.

  It fails on any console error or hash mismatch.
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
