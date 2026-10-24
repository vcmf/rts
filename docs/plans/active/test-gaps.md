---
status: active
last_reviewed: 2026-10-23
---

# Plan: the test gaps, audited, filled area by area

Asked by the owner on 2026-10-23: "a good occasion to add tests wherever we can to fill the gap and make sure nothing
bites us back later". This plan is the audit (what each module's coverage is, how much its silent breakage would
cost, what guards the browser-only parts) and the order of the test PRs that fill the gaps, one per area, in the
order decision 0052 formats the code: the sim first (formatted, #148), the look after its formatting PR (PR 2), the
tools after PR 3.

## Scope

- Every module in `src/` and `maps/`, with its line and branch coverage from `npm run coverage`.
- The Python bake tools (`tools/*.py`, `tools/unitpipe/`) and the page checks' self-tests (`tools/*.mjs --selftest`).
- The regressions of the week of 2026-10-19 and the test that would have caught each.
- Out of scope: the prototypes (single HTML files, `prototypes/AGENTS.md`), and cost or timing tests (the suite runs on
  every PR; the cost tests stay where they are, skipped on CI).

## How it was measured

`CI=1 COVERAGE=1 npx vitest run --coverage --coverage.include='src/**/*.ts' --coverage.include='maps/**/*.ts'` in the
worktree at main `1fa1312`, Node 22, on the dev Mac. `CI=1` skips the cost tests, as CI's coverage job does (under
coverage they fail their budgets: V8's block counters, `test/fx.ts`); `longIt` tests are skipped by `COVERAGE`. The
`maps/` include is added here: `vitest.config.ts` covers `src/` only. Numbers are V8's line and branch percentages
(`coverage-summary.json`). "Before" is main; "after" is this PR (the sim area's tests).

## Risk ranking

- **High**: pure logic whose silent breakage changes the game or the picture, testable in Node: the sim; the armies'
  layout (`src/look/world/armies.ts`); the camera's checks, `ZoomHold` and `clearRadius` (`src/look/spec.ts`); the
  figure mesh builders (`src/look/units-data.ts`); the LOD switching; `farPalette` and `farRule`; mood and palette
  maths; geometry helpers.
- **Medium**: pure logic with a smaller blast radius, or logic inlined in Babylon glue that could be pulled out into
  a pure function and tested.
- **Low**: Babylon glue only a browser can test (scene building, materials, post-processing, the page's wiring).
  For these the table names the page check that covers them, or says none does.

## The audit

### The sim area (`src/sim`, `src/rulesets`, `src/scenarios`, `maps`): this PR

| Module | Lines before → after | Branches before → after | Risk | Notes |
|---|---|---|---|---|
| `src/sim/formation.ts` | 97.6 → 97.6 | 90.4 → 90.4 | high | well covered by the drill, formations, repack, scale tests |
| `src/sim/fire.ts` | 99.1 → 99.1 | 91.7 → 93.9 | high | |
| `src/sim/morale.ts` | 100 → 100 | 94.6 → 94.6 | high | |
| `src/sim/melee.ts` | 96.2 → 97.2 | 88.3 → 90.3 | high | |
| `src/sim/artillery.ts` | 97.8 → 97.8 | 90.8 → 90.8 | high | |
| `src/sim/commands.ts` | 98.4 → 98.4 | 89.1 → 96.0 | high | refusals not tried before: unknown unit type, heading, fire mode, no free slot, side, fire target, debug kill/morale |
| `src/sim/serialize.ts` | 80.6 → 85.9 | 46.2 → 60.0 | high | the uncovered lines are the big-endian path (unreachable on every target); the command fields of most types never crossed a save in a test |
| `src/sim/replay.ts` | 93.2 → 100 | 78.9 → 94.7 | high | sim version, sequence, missing and extra hash points, recordings without sections untested |
| `src/sim/plan.ts` | 98.3 → 100 | 91.2 → 95.6 | high | |
| `src/sim/ruleset.ts` | 96.5 → 100 | 83.5 → 95.7 | high | most of the compiler's refusals untested |
| `src/sim/terrain.ts` | 100 → 100 | 95.7 → 97.8 | high | |
| `src/sim/tick.ts` | 96.1 → 96.1 | 97.7 → 97.7 | high | the metered path (`Meter`) is run only by the cost tests, skipped here |
| `src/sim/num.ts` | 100 → 100 | 94.9 → 96.6 | high | see Findings: `atan2(−0, x)` |
| `src/sim/rng.ts` | 100 → 100 | 80 → 90.0 | high | keyed streams' independence untested |
| `src/sim/data.ts` | 89.1 → 100 | 50 → 90.0 | high | magic, format, trailing bytes, the edges of `speedFactorAt` |
| `src/sim/world.ts`, `handle.ts`, `bits.ts`, `hash.ts`, `columns.ts`, `time.ts` | 100 → 100 | 100 → 100 | high | generation wrap and FNV reference values untested |
| `src/rulesets/napoleonic.ts`, `index.ts`, `napoleonic-uniforms.ts` | 100 → 100 | 92.9 → 92.9 | high | names the compiler does not check (see Findings) now checked on the data |
| `src/scenarios/s1a-drill.ts`, `s1e-battle.ts`, `maps.ts`, `armies-demo.ts` | 100 | 100 | medium | |
| `src/scenarios/page.ts`, `s1b-field.ts`, `s1d-arms.ts` | 0–36 → 100 | 100 | medium | the page's scenarios were run only by `tools/app-check.mjs` (not in CI) |
| `src/scenarios/s1c-firefight.ts`, `s1d-charge.ts`, `s1d-guns.ts` | 24–39 → 35–50 | 0–24 | low | the uncovered parts are the calibration runners (`runFirefight`, `runCharge`, `runGuns`, `tools/calibrate-fire.ts` and the other calibrations) |
| `maps/battlefield.ts` | 33.8 | 4.3 | medium | build time only; `npm run check:data` (CI) rebuilds the data from it and compares bytes |
| `maps/formation-field.ts` | 100 | 50 | medium | the same |
| `src/sim/` alone | 96.9 → 97.7 | 88.2 → 91.9 | | |
| **sim area** | **93.2 → 94.7** (3408 → 3463 of 3655) | **84.2 → 87.6** (1694 → 1763 of 2012) | | |

What `src/sim/` leaves uncovered after this PR (76 lines): the serializer's big-endian path (no target runs it); the
metered tick (`Meter`, run by the cost tests, skipped on CI); and paths only the long tests reach, skipped under
coverage (`longIt`): the trail ring dropping its oldest point on a long march, a loss moved to a neighbouring
company, the order pool running out mid-fight. They run in `npm test` and CI's check job.

The tests this PR adds (`test/`, 103 tests in about 7 s on the dev Mac in parallel, none a cost test):

- `saves.test.ts`: a pending command of every type crosses a save field by field; a save of a loaded save is the
  same bytes; a charge between two regiments saved while closing, in melee, in pursuit and in the rout goes on with
  the same hashes; damaged saves (magic, format, truncated, trailing bytes, another table length) are refused.
- `replays.test.ts`: `play` on another sim version, a wrong sequence number, a missing or an extra hash point, a
  recording without section hashes, another seed; a recording made twice is the same; two worlds stepped in turn in
  one process give the hashes each gives alone (no state shared through the modules' scratch); commands stamped for
  one tick apply in the order issued.
- `commands.test.ts`: the refusals no test reached, each changing nothing (every section but meta compared with a
  copy that ran the tick without them); quantisation of each field.
- `rulesets.test.ts`: each of the compiler's 27 refusals; the ruleset hash moves with any rule, a placement included;
  the shipped rulesets' names that the compiler does not check (Findings 2–4).
- `scenarios.test.ts`: every page scenario sets up on its map with nothing dropped, its plan naming units it spawns
  on the other side; the page's tables agree.
- `plans.test.ts`: when a plan may be attached, steps out of order and on one tick, a target left out, the limit
  alone, the draw at the limit.
- `primitives.test.ts`: keyed streams (each key part matters, the world stream untouched), `nextInt` and
  `sampleCount` edges, the all-zero seed guard, handles at their limits and a generation's wrap, bit sets across
  words, `atan2`, `wrapAngle`, `sin`, `exp` and `quantise` at their boundaries, FNV-1a's reference values, the data
  loader's refusals and a file read from an offset view.

### The look and render area (`src/look`, `src/render`, `src/app`): after PR 2

| Module | Lines | Branches | Risk | Covered by |
|---|---|---|---|---|
| `src/look/world/armies.ts` | 98.3 | 90.7 | high | `test/armies.test.ts` (layout, `farPalette`, `farRule`, the demo map's hashes) |
| `src/look/spec.ts` | 100 | 94.8 | high | `test/look-spec.test.ts` (`derive`, `ZoomHold`, `clearRadius`, `checkGround`); untested: `footprintOf`, `nearReachOf`, `bakeMB` edges |
| `src/look/units-data.ts` | 100 | 83.0 | high | `test/armies.test.ts`; untested: `boneParts`, `seenArea`; the far width cap (regression g) lives in `units.ts`, not here |
| `src/look/units.ts` | 0 | 0 | high | inline logic worth pulling out: the LOD hysteresis in `Units.frame()`, the far width cap, `casterOf`. No page check counts the men drawn (`Units.drawn()` is unused) |
| `src/look/mood.ts` | 62.8 | 20 | high | `test/look-moods.test.ts` (`MOODS`, `seasonLight`); untested: `setMood`, `lockMood`, `setBounce`, `gradeColour`, `lumaW` (imports only `Color3`, loads in Node) |
| `src/look/river.ts` | 95.5 | 84.1 | high | the water data tests |
| `src/look/world/{author,buildings,cover,data,water-data,geom}.ts`, `heightfield.ts`, `noise.ts` | 96–100 | 50–94 | high | `test/cover.test.ts`, `buildings.test.ts`, `water-data.test.ts`, `look-roads.test.ts` |
| `src/look/meadow-spec.ts`, `span-texture.ts`, `trace.ts` | 0 | | medium | pure, no Babylon: `grassDefinesForClumps` untested |
| `src/look/building-light.ts` | 11.2 | 6.1 | medium | `atlasLayout`, `tileOf` pure; the rest is a bake in the page |
| `src/look/flow.ts`, `canopy.ts`, `bakes.ts`, `macro.ts` | 0 | 0 | medium | pure helpers among Babylon code (`flowAt`, `leafLoss`, `softDefines`, `isBakedArm`); `tools/macro-check.mjs` covers the macro bake |
| `src/look/post.ts` | 0 | 0 | medium | `typingIn`, `CLEAR_BELOW`; the stencil rule (regression e) is inline in `main.ts` |
| `src/look/materials.ts` | 0 | 0 | medium | the sampler count (`checkSamplers`, `failSamplers`) runs in every page load; no check loads every flag set (regression c) |
| `src/look/main.ts`, `terrain.ts`, `water.ts`, `meadow.ts`, `nature.ts`, `leaves.ts`, `grain.ts`, `lab.ts`, `bench.ts`, `gputimer.ts`, `buildings.ts` | 0 | 0 | low | `tools/look-check.js`, `tools/guard.mjs`, `tools/coat-check.mjs`, `tools/detail-check.mjs`, `tools/water-look-check.mjs`, `tools/macro-check.mjs`, `tools/bench-look.mjs`, `tools/golden.mjs` (all local, none in CI) |
| `src/render/soldiers.ts`, `scene.ts`, `style.ts` | 81–100 | 78–100 | high | `test/soldiers.test.ts` |
| `src/render/map.ts` | 0 | 0 | medium | `toS`, `toW` pure; the staff map drawn by `tools/app-check.mjs` |
| `src/app/main.ts` | 0 | 0 | low | `tools/app-check.mjs` (local; CI's header says it is not run there yet) |
| **look, render, app** | **look 25.2, render 51.8, app 0** | **20.6, 48.2, 0** | | |

### The tools (`tools/`): after PR 3

| Tool | Tested | Risk | Notes |
|---|---|---|---|
| `tools/build-sim-data.ts`, `build-look-data.ts` | `npm run check:data` in CI, `test/spine.test.ts` | high | |
| `tools/bake-figure.py` | none | high | the colour classifier (regression f); `import bpy` at the top keeps its pure functions out of reach without Blender |
| `tools/blend-to-js.py`, `tools/building-to-js.py`, `tools/earth-texture.py`, `tools/meadow-brush.py`, `tools/meadow-grass-export.py`, `tools/paving-pack.py`, `tools/unitpipe/` | none (CI runs no Python) | medium | their outputs are committed and decoded by tests (`test/armies.test.ts`, `test/figures-index.test.ts`) |
| `tools/golden.mjs`, `tools/detail-check.mjs`, `tools/macro-check.mjs`, `tools/water-check.mjs`, `tools/water-look-check.mjs` (`--selftest`) | self-tests run by hand | medium | none runs in CI; `tools/water-check.mjs`'s data checks need no browser |
| `tools/check-negatives.mjs` | by hand | medium | the negative cases of the page checks |
| `tools/check-docs.mjs` | CI | | |

## The regressions of this week

| # | What | Guarded now? | The test that would catch it | PR |
|---|---|---|---|---|
| a | After a review fix, battalion host meshes cloned from disabled sources drew no soldiers on a plain `?armies` load (the fix: `Units.hostMesh()` enables a host only when shown; #145, #151) | **No.** `tools/guard.mjs --figures` calls `__units.show(true)` first, which hides the bug; `Units.drawn()` is unused | a page check: load `?armies=20`, never call `show()`, render at the default view and at about 125 m, and require `__units.drawn()` to count men, the far or tiny LOD at the wide view | look checks (after PR 3, with the tools) |
| b | The player's zoom was lost after panning over a hill (`ZoomHold`, `clearRadius`, #145) | **Yes**: `test/look-spec.test.ts`, "keeps the player's zoom apart from the held one" and the two `clearRadius` tests. Not the wiring in `post.ts` | a unit test of the wiring once it is a pure function | look tests (after PR 2) |
| c | The water shader went over ANGLE-Metal's 16 fragment texture units and hung the bench (SwiftShader allows more) | **Partly**: `Materials.checkSamplers()` counts every compiled program against 16 in the page itself, so a headless run fails too (`tools/shot.mjs` treats the exception as fatal), but only for the flag sets a check loads | a sampler-count guard: load the flag matrix (default, `?armies=20`, `?armies&ushadowfar=map`, `?armies&unitshadow=0`, `?grass=brush`), read `__look.mats.samplers`, require terrain, water and meadow ≤ 16 and print the headroom | look checks |
| d | Overlapping simple shadows darkened twice (#134) | **No** | a page check: two overlapping battalions with `?unitshadow=1` and with the shadows off; in the overlap the darkening matches a single shadow's within 2 %; sabotaged with `?stencil=0` it must fail | look checks |
| e | The engine-wide stencil turned the scene depth from DEPTH32F to DEPTH24_STENCIL8 (#134) | **No** (checked by hand) | a unit test: pull the rule at `src/look/main.ts` into a pure `stencilFor(params)` and table-test it (no armies: none; `?armies`: the scene's; `?stencil=all`: the engine's); and a page check that the scene target's depth is DEPTH32F without armies | look tests, look checks |
| f | The bake's colour classifier painted skin as red facings and shaded navy as black (`tools/bake-figure.py`, #145) | **No** | a Vitest test on the baked figure: decode `data/figures/fr-line-infantry.unitdata`, count triangle roles by heaviest bone, require the hands mostly skin and the chest's black share small; and Python table tests once `hsv` and `texel_role` move to a module without `bpy` | tools (after PR 3) |
| g | A far-scale width cap could become −0 when no vertex sat in the shoulder band (`Units` constructor, #130) | **No** | a unit test: pull the cap into `farWidthScale(positions, fileSpacing, maxXZ)` in `units-data.ts` and require 1 for an empty band and never −0 | look tests |
| h | The trample mask's clamp-to-edge streaks (`terrain.vert`, `meadow.vert`, #130) | **No** | a page check: `?armies&trample=1` against `?trample=0`, pixels outside the trample box equal | look checks |

## Findings

Tests written for this PR, and its review, found these. Each was a GitHub issue labelled `known-issue`, not fixed in
the test PR. All six are fixed by the follow-up PR #162 (`fix/sim-test-findings`, "fix(sim): the four bugs the new tests
found", #155–#158), each with a test; no golden replay hash moved.

1. **A save with an unknown command pending cannot be loaded** (#155). `issue` accepts any command and `applyCommands` drops
   one of an unknown type with a reason, but a save taken while it is pending writes its type and no fields
   (`FIELDS` has none), and `deserialize` throws `unknown command type … in save`. A malformed external command and a
   save in the same tick make an unloadable save. **Fixed:** `issue` throws on an unknown type before stamping it,
   so none enters the queue, the log or a save (`test/saves.test.ts`).
2. **A shape whose pace is not a pace compiles** (#156). `layout` takes `paces.indexOf(def.pace)` = −1; the world then fails
   at its first move with `NonFiniteState` in debug, and silently runs NaN without it. The same for a `roadPace`
   (read as "no road pace"). **Fixed:** the compiler refuses it (`test/rulesets.test.ts`).
3. **A terrain class that gives a kind no speed compiles** (#156). `buildTerrain` reads `t.g[kind]` as undefined: NaN in
   `classG`. Kinds come from the first class's keys only. **Fixed:** the compiler refuses a class missing a speed for
   any kind some class names.
4. **A change time naming a shape the type has not is ignored** (#156): a typo falls back to `defaultChangeTime`.
   **Fixed:** the compiler refuses it.
5. **`atan2(−0, x > 0)` returns −0** (#157), against its comment ("zero results are +0") and `docs/systems/sim-spine.md`
   ("no −0"). It is deterministic (IEEE), but a −0 stored in state serializes to other bytes than +0. `quantise`
   (`Math.round`) gives −0 too, for −0.005: whether the sim should store −0 at all is the same question. **Fixed** to
   match the doc: `atan2` returns +0 for a zero `y` with `x ≥ 0`, and `quantise` and the command angles' rounding
   give +0 for what rounds to zero (`test/primitives.test.ts`, `test/num.test.ts`); the golden replays' hashes are
   unchanged.
6. **`sampleCount(NaN)` draws 12 uniforms and returns NaN** (#158), where λ ≤ 0 returns 0 without a draw. Found in
   review. **Fixed:** a λ that is not a positive finite number gives 0 without a draw; the expected failure in
   `test/primitives.test.ts` is now a plain test.

Findings 2–4 are now checked on the shipped data (`test/rulesets.test.ts`, "the shipped rulesets hold together"),
so a ruleset that ships with one fails a test; the compiler now refuses them too.

## The test PRs, in order

1. **The sim area** (this PR, `test/gaps-sim`): the sim is formatted (#148).
2. **The look and render area**, after the look's formatting PR (PR 2, `style/format-look`) merges: unit tests for the
   pure parts listed above (`mood.ts`'s setters and grading, `spec.ts`'s footprints, `meadow-spec.ts`,
   `units-data.ts`'s `boneParts` and `seenArea`, `render/map.ts`'s transforms), and the extractions that make
   regressions b, e and g unit-testable (the LOD hysteresis, `stencilFor`, `farWidthScale`). The extractions change
   `src/look`: they wait for PR 2 so as not to fight its formatting.
3. **The tools**, after PR 3 formats them: the figure bake's roles test (regression f), the page checks for
   regressions a, c, d and h, and the self-tests' place in CI (which can run in CI with SwiftShader, which cannot).

## Acceptance (this PR)

- `npm test` and `node tools/check-docs.mjs` pass.
- The new tests are fast (none of them a cost or timing test), deterministic, one behaviour each.
- The sim area's coverage before and after is in the table above.

## Open questions

- Should CI's coverage include `maps/`? Its code runs at build time; `check:data` already compares its output.
