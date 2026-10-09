---
status: current
last_reviewed: 2026-10-09
code: [app/index.html, src/app/main.ts, src/render/soldiers.ts, src/render/map.ts, src/render/scene.ts, src/render/style.ts, src/scenarios/s1b-field.ts, test/soldiers.test.ts, tools/app-check.mjs]
decisions: [0005-sim-render-split, 0006-restricted-float64, 0007-battalion-scale, 0016-typescript-toolchain]
---

# The sim page (S1b)

A Vite page that runs the sim on the main thread and draws it as a staff map, with every soldier as a
small circle. The mouse selects battalions and orders them; every order is a command, so a session
exports as a replay that plays back in Node to the same hashes.

```
 input ──► issue(cmd) ──► sim tick (20 Hz, accumulator × speed) ──► formation state
                                                                        │ per frame, alpha
                                     soldier layer (who stands where, steering) ◄──┘
                                              │
                        staff map (base image, contours, symbols) + units ──► two canvases
```

## Goals / non-goals

- Goals: see the S1a sim with the eyes; drill with the mouse; measure the cost of 4000 men; keep the
  render side out of the sim (decision 0005).
- Non-goals: the 3D world, figures, fire and morale (S1c), the worker (S2), the staff map's final art
  (`docs/proposals/staff-map/`). The formation prototype stays the reference for the feel.

## Constraints

- The soldier layer is cosmetic: it reads the sim and never writes to it; it uses its own RNG
  (`cosmeticRng`), so its choices never change a hash.
- Sim plus soldier layer within 4 ms per frame for 40 battalions on the dev Mac.

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
line are drawn at the interpolated anchor, as the men are. `Copy
replay` puts `{ replay, hashes }` on the clipboard; `play` in `src/sim/replay.ts` checks it.

**Who stands where** (`SoldierLayer.sync`). The sim keeps men per company (decision 0007); the layer
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
- separation from neighbours through a 0.6 m grid;
- going round the cosmetic tree trunks;
- speed from the ground (`groundG`).

A man never steps from passable onto impassable ground. **Settled**: at the halt, a man within 0.25 m of
his place stops and holds still until the place moves 0.3 m or the battalion moves again. Without it men
jitter in the wood and the 40-battalion frame costs 0.5 to 0.8 ms more (both shown by the negative runs).

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
- The panel is built from the ruleset (shapes, order presets).

**Scenarios** (`src/scenarios/s1b-field.ts`): `s1b-field` (three battalions a side) and `s1b-bench`
(40 battalions), chosen by `?scenario=`. The page loads the data only at `FIELD_DATA_VERSION`.

**Hooks** (`window.APP`): select, march, form, order, `advance(seconds)` (pauses the clock and steps
frames at 30 Hz), view, `drawMs`, `mapMs`, `stats`, `hash`, `replay`.

## Tunables

`AHEAD`, `WALK`, `RUN`, `SEP` and the steering gains in `src/render/soldiers.ts`; class looks in
`src/render/style.ts`; the scenarios in `src/scenarios/s1b-field.ts`.

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
  - cost for 40 battalions.
- `npm run check:app` builds and serves the page and drives it headless:
  - the drill scenario, with screenshots, a multi-selection move, square and Face about;
  - every panel button logs one command;
  - the 40-battalion bench;
  - each session's replay played back in Node.

  It fails on any console error or hash mismatch.
- Negative runs (results in `docs/plans/done/s1b-sim-page.md`): the relabelling, the signature, the
  slot reassignment and the settled state each break a test when removed.

## Open questions

- The cost test runs about 0.6 ms under its 4 ms budget on the dev Mac; a slower machine fails it.
- 8× costs 6.2 ms per frame for 40 battalions (the sim's ticks): within a 60 fps frame, over the 1×
  budget. The worker (S2) takes the ticks off the main thread.
- The page selects and orders both sides (a drill sandbox); sides belong to S1e.
- No speed overlay yet (the plan listed one); the slots overlay exists.
