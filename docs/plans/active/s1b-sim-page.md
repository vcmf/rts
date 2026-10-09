---
status: active
last_reviewed: 2026-10-09
---

# Plan: S1b, a page that draws and drives the sim

The second part of S1 (`docs/plans/done/s1a-formations-on-spine.md`, breakdown). A Vite page plays the
S1a sim with the mouse: the staff-map look of the formation prototype, every soldier as a small circle,
selection and multi-selection orders, speed controls. The prototype stays as the earlier reference;
this page draws only what the sim and its data hold.

## Scope

- **App** (`app/index.html`, `src/app/`). The sim runs on the main thread (as `docs/proposals/sim-design.md` §17
  plans for S1):
  - a 20 Hz fixed tick with an accumulator and game speed (pause, 1×, 2×, 4×, 8×);
  - drawing interpolated between ticks;
  - every input becomes a command through `issue`, and the external log is kept (exportable as a replay).
- **The staff map** (`src/render/map.ts`), drawn from the build-time data and the ruleset, not the
  prototype's features:
  - **class fills:** a smoothed class image at 4 px per metre, built once;
  - **edges:** banks, roads, hedges and the bridge deck by marching squares on each class mask;
  - **contours** from the heightfield, with index contours labelled, and spot heights at the summits;
  - **cosmetic symbols scattered by class:** trees in woods, reeds in marsh, furrows in ploughed land,
    a stipple in crops;
  - a 100 m grid, a scale bar and a north arrow;
  - **how each class looks** is a render style table (`src/render/style.ts`), keyed by class name.
- **The soldier layer** (`src/render/soldiers.ts`, cosmetic, no DOM): one circle per man. Each man walks
  to his place:
  - the place comes from the sim, interpolated, extrapolated 0.6 s ahead, with the lags' rates;
  - he separates from neighbours and goes round the cosmetic trees;
  - he settles at rest, as in the prototype.

  The sim keeps men per company (decision 0007), so the layer decides who stands where:
  - a man keeps his slot while it stays filled;
  - when men fall, those in slots that emptied fall first (bodies stay as crosses);
  - men whose slot moved walk to the nearest free filled slot;
  - Face about relabels the men through the shape's half-turn. The sim gets a `faces` counter so the
    layer knows when.
- **Input:**
  - click a battalion to select it (shift adds), drag on empty ground to select by box;
  - click the ground to move the selection, keeping the battalions' relative positions;
  - right-drag or space-drag to pan, the wheel to zoom.

  Panel: shapes, Face about, Retire, wheels, halt, order presets (all from the ruleset), speed and pause,
  slots and speed overlays, a readout for the selection.
- **Scenario:** a few battalions per side on the formation field (no fighting yet).
- **Hooks** for headless checks (`window.APP`): orders, time and view without real time passing.

## Acceptance

1. `npm run dev` serves the page and `npm run build` builds it. The page loads the data with its
   expected version and runs with no console error, checked headless through `tools/shot.mjs` against
   `vite preview`, with a screenshot.
2. **The soldier layer's checks** from `tools/formation-measure.js`, in Vitest against the real sim:
   - men at rest hold still;
   - slot error through line → square, a march column's turn, and the wood;
   - halted in the wood, no man moves more than 0.05 m in 10 s (six points);
   - after casualties, the soldiers alive equal the sim's men and each stands on a filled slot;
   - Face about moves only the men who step up.
3. **Orders:** a multi-selection move keeps relative positions; every panel order reaches the sim as a
   command; the log replays to the same hashes.
4. **Cost:** 40 battalions (4000 men), sim plus soldier layer per frame, and the drawing per frame,
   measured headless. The budget is 4 ms for sim plus soldiers on the dev Mac (SwiftShader drawing is
   reported, not judged).
5. **Negative runs** for the slot assignment, the Face about relabelling and the settled state.

## Results (2026-10-09)

Built as planned, described in `docs/systems/sim-page.md`. Measured on the dev Mac:

1. `npm run check:app` builds the page, serves it with `vite preview` and drives it headless. Two runs, no
   console error:
   - **drill** (`s1b-field`): a three-battalion move, a square, a Face about, every panel button;
   - **bench** (`s1b-bench`, 40 battalions marching).

   Map build 0.1 to 0.7 s (first load varies), map redraw about 1 ms.
2. **Soldier checks** (`test/soldiers.test.ts`, 8 tests):
   - slot error max 0.64 m through line → square, 0.60 m through a march column's turn, 4.3 m in the
     wood (mean 0.59 m);
   - halted in the wood, 0 m of movement at all six points;
   - casualties leave one man per filled slot;
   - Face about keeps complete files in place for a line and a square at 100 and 97 men.
3. **Orders:**
   - a multi-selection move keeps the battalions' offsets (screenshot: parallel waypoint lines);
   - all 12 panel buttons each log one command, none refused;
   - each session's exported replay plays back in Node to the same hashes (drill 17 commands and 81
     hashes; bench 40 commands and 10 hashes).
4. **Cost**, 40 battalions:
   - sim plus soldiers 3.55 to 3.58 ms per frame in Node (best of three windows; a single window under
     load once read 4.02 ms);
   - 2.76 ms in headless Chrome;
   - the units draw in 0.78 ms (SwiftShader).
5. **Negative runs**, each breaking a test:

   | Removed | Failing test |
   |---|---|
   | Face about relabel | Face about |
   | `faces` in the signature | Face about (square) |
   | slot reassignment of the displaced | casualties |
   | the settled state | wood halt; cost (4.29 ms) |

   One mutation first passed: it set `settled = false` but still skipped steering. Corrected, it fails.
   The Face about test gained the square case after the signature mutation passed with a line only.

Changes beyond the plan:
- the sim's `faces` column changes the state hashes: the S1a golden was regenerated and `SIM_VERSION` is
  now `s1b.1`;
- a loss now frees the slot only of a man who held one (`sync`);
- `SAVE_FORMAT` is 3 (the new column), so an S1a save is refused instead of misread;
- review round 1 (#14):
  - the soldier layer takes at most four steps a frame, so 8× costs as much as 1×; at 8× the march turn's
    slot error is 2.0 m (0.6 m at 1×);
  - the slots overlay frames each battalion;
  - the colours are interpolated;
  - grid lookups use `z0`, contours use `nz`;
  - Space no longer clicks a focused button;
  - line-mode wheel deltas are scaled;
  - the tick length and order types come from the sim;
  - the page's hash points carry no section hashes;
- orders the sim refuses show in the readout.

Not done: the speed overlay (the slots overlay is in).
