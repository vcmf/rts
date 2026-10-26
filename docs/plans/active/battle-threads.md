---
status: active
last_reviewed: 2026-10-26
---

# Plan: the battle's threads

**Experimental.** The design is `docs/proposals/battle-threads.md`; decision 0048 (proposed) adopts it. The owner
(2026-10-22): "well document our plan and our design ... we throw away once implemented and tested if it does not
work out"; and soldiers move **stepped at 12 fps**, poses and positions together (the art bible). Each PR states its
measurement and its stop criterion: if one is met, the work stops and decision 0048 is rejected.

The owner (2026-10-26): Track S is not paused (the 2026-10-22 plan paused it); this work runs on its own epic branch
stacked on Track S's (below), and every PR of it, PR 1 included, goes into that epic.

**Depends on** the 3D crowd renderer (`src/look/units.ts`, on `main` since #130) for PR 4, and on the sim driving
the 3D armies for the end-to-end goal: the look page's armies are scripted today (`src/look/world/armies.ts`), and no
plan yet makes the sim drive them (Open questions). PRs 1–3 stand on the sim page alone.

## How the epic works

- The epic branch `epic/battle-threads` was cut from `epic/sim-engine` on 2026-10-26 (the owner), because both
  change the sim page's frame loop (`src/app/main.ts`), and this epic's soldier layer changes must keep Track S's
  readers of it working (below).
- Each PR below goes into `epic/battle-threads`, with `/code-review high`, and is squash-merged.
- `epic/sim-engine` is merged into the epic regularly (and `main` once Track S's tracking PR #181 has landed), so
  conflicts surface early. The renderer's reads of `SoldierLayer`, `Man` and `volleyTick` that Track S keeps
  backward compatible stay so here until PR 2 says otherwise.
- The epic's tracking PR merges into `main` with a merge commit after #181, once PR 3 has met its acceptance. If
  PR 3's stop fires instead, PR 3 is reverted on the epic, decision 0048 is rejected, and the tracking PR carries
  the PRs that met their own bars (PRs 1–2: they pay on the main thread alone). If the work stops before any PR met
  its bar, the epic closes unmerged: nothing on `main` or `epic/sim-engine` to revert.

## The goal and how everything is measured

- **Overall goal**: the frame interval's **p99 ≤ 8.33 ms** with 32,000 men at 120 Hz: on the sim page (80
  battalions of 400; PR 3's bar), and on the look page at decision 0050's armies (40 battalions a side, 33,120
  figures; shared with Track E, PR 4) on the dev Mac (M1 Pro), production build, at 1× and 8× speed; the min-spec RTX 3060
  laptop measured when available (decision 0011).
- **Two sizes**: the bars below are set at 16,000 men (40×400, where the baselines are measured) and checked at
  32,000 too. PR 1 first adds an 80×400 bench scenario and measures the baselines at 32,000 (est.: about twice the
  ones below); its stagger's group count follows from that measurement (PR 1).
- **Baselines** (dev Mac, release world, 40×400; `docs/plans/active/s1c5-cost.md`, `docs/plans/active/s1d1-unit-types.md`):
  the soldier layer's step 4.2–5.4 ms; the sim's tick 0.6–1.8 ms (about 2.0 under vitest, `TICK_BUDGET` 3);
  marching, sim and layer, about 4.5 ms per 1/60 s frame (issue #36); the state hash 2.7–4.1 ms every 20 ticks
  (issue #38).
- **Every metric as mean and p99**, at **1× and 8×**: main-thread busy time per frame (sim, layer, hash, reading the
  buffers); frame intervals from `requestAnimationFrame` on the production build (`vite build` + `vite preview`);
  long tasks (a `PerformanceObserver`); garbage collection (a Chrome trace); the worker's step and tick times.
- **Determinism**: replay hashes identical in the worker and on the main thread (PR 3 adds the browser harness).

## PR 1: the soldier step at 12 Hz of real time, staggered

- **Scope**: the soldier layer steps at `MEN_HZ = 12` per real second (tied to the figures' 12 fps bake), at most one
  step per 1/12 s of real time; above 1× each step covers more game time (larger dt, the existing longest-step cap
  kept); paused: no steps; its battalions in groups (four, a group per 1/48 s sub-step, or more if the measurement below
  asks for it). The sim page draws the latest
  step as is (no interpolation). Still on the main thread.
- **Acceptance** (16,000 men, 120 Hz, 1× and 8×): the layer's main-thread cost per frame **mean ≤ 1.4 ms** (est.: a
  quarter of 4.2–5.4 ms on 48 of every 120 frames ≈ 0.5 ms mean) and **p99 ≤ 1.5 ms** (one sub-step: a quarter of
  5.4 ms); at 8× the same (the real-time cap); at 32,000 men the same bars, with more groups if four miss them (est.:
  a quarter of a 32,000 step is 2.1–2.7 ms, so eight groups at 1/96 s sub-steps; the group count a constant set by
  this measurement); the steering's goldens (`slotError`, the wood and halt tests) within
  their limits; the owner's eye on the 12 fps step at 1× and 8×.
- **Stop** (measurable, at 16,000 men; at 32,000 once the group count is set): if the layer's p99 per frame at
  120 Hz exceeds 2.0 ms, or the goldens fail at the stepped rate and cannot be re-tuned, revert PR 1 and re-plan. **Met at 8×, re-planned by the owner (2026-10-26)**: PR 1 is kept
  for its 1× bars, and its 8× bars are PR 3's (the Outcome below); the acceptance above holds at 1× only.
- **Outcome** (2026-10-26; `src/render/men-clock.ts`): met at 1×, missed at 8×, re-planned by the owner. The layer's
  cost per 120 Hz frame, main thread, 40 battalions marching through their shapes (Node on the dev Mac, the clock
  driving `SoldierLayer.step` as the page does; mean / p99 ms):

  | | today (a step a frame) | PR 1 |
  |---|---|---|
  | 16,000 men, 1× | 5.11 / 7.05 | 0.48 / 0.95 |
  | 16,000 men, 2× | | 0.71 / 1.58 |
  | 16,000 men, 8× | 4.92 / 15.58 | 2.37 / 3.99 |
  | 32,000 men (40 × 800), 1× | 7.88 / 8.93 | 0.79 / 1.47 |
  | 32,000 men, 8× | 6.93 / 9.40 | 3.67 / 6.61 |

  - **Eight groups, not four**: at four the 1× p99 was 1.72 ms (16,000) and 2.72 ms (32,000); the neighbour grid's
    rebuild (0.23 / 0.44 ms) lands in group 0's sub-step.
  - **A step covers at most `MEN_DT` = 1/8 s of game time**, so above 1.5× the rounds come faster than 12 Hz (64 Hz
    at 8×), and 8× costs more work per real second than 1×. The plan's "larger dt" does not hold: halted men in the
    wood (six halt points, 10 s) moved up to 0.34–1.29 m with steps of 1/6 to 2/3 s, against 0.01 m at 1/8 s and
    under. The steering's gains saturate there (the arrival damping `1 − 8·dt` is clamped at 0 from 1/8 s, the
    velocity blend `5·dt` at 1 from 1/5 s) and the explicit step overshoots the pushes. Damping and smoothing made
    exponential fixed 2× but not 4× (0.45 m), so the steering is kept and the step capped.
  - **The owner's call**: the 8× bar moves to PR 3. The worker takes the layer off the main thread at every speed, and
    the clock moves into it as it is (the worker has no frames). PR 3 measures that the worker keeps up at 8× (est.
    at 32,000: the layer about 44 % of a core, plus 160 ticks a second and the hash).
  - Above 1.5× the sim page draws the men at the round rate, not 12 fps; PR 3's published frame steps them at 12 fps
    at every speed.

## PR 2: the soldier layer in structure-of-arrays typed arrays

- **Why, after PR 1** (2026-10-26): PR 3 hands the men from the worker to the main thread through shared memory, and
  a `SharedArrayBuffer` holds numbers, not objects. Today every man is a `Man` object in a per-unit array, and the
  page reads them as objects (`main.ts`'s picking and box select, `map.ts`'s drawing, `slotError`). PR 2 puts them in
  flat arrays and moves those readers onto them, on the main thread, where the goldens can prove nothing changed;
  PR 3 then moves the arrays to shared memory without touching a reader.
- **Speed is a side effect, not the goal**. The profile at 32,000 men, 8× (`node --cpu-prof tools/bench-cost.ts march
  800 1440 2 8`, self time of the whole run, sim included): `steer` 31.9 %, the formation geometry of a man's place
  (`sampleBins`, `placeAtSlot`, `trailPoint`) 27.8 %, the terrain lookups 9.6 %, `buildGrid` 3.7 %, the garbage
  collector 0.8 %. The neighbour search inside `steer` already reads typed arrays (the grid's `flatX`/`flatZ`), and
  the places come from the sim's geometry, which PR 2 does not touch: est. 1.0–1.3× on the step, not the 1.5–3×
  first planned (that was set before PR 1, against a full step a frame).
- **Baseline** (PR 1's head, the same bench; step per 120 Hz frame, mean / p99 ms): 16,000 men 0.49 / 0.99 at 1×,
  2.32 / 4.15 at 8×; 32,000 men 0.78 / 1.48 at 1×, 3.59 / 6.47 at 8×.
- **Scope**: `Man` replaced by a structure of arrays at stable per-man indices (x, z, vx, vz, the drift phases, the
  hold point: `Float64Array`, so the steering's arithmetic and the goldens stay bit for bit; the slot `Int32Array`;
  alive and settled in a flags `Uint8Array`). Each battalion owns blocks of indices, the first of its type's `slots`
  at its creation and another when men join a full one (no compaction: a man who falls keeps his index, flagged; a
  battalion gone keeps its blocks for the crosses, which replaces the `fallen` array). The readers (`main.ts`, `map.ts`, `slotError`, the tests, the bench)
  read the arrays by a battalion's block. `sync` without its per-change allocations (the `filter`s, the closure, the
  scratch slot arrays).
- **Acceptance**: the goldens and the steering tests unchanged, with the men's positions identical to PR 1's in a
  fixed scenario (a test compares a hash of every man's x and z after 30 s of marching against PR 1's value); the
  step no slower, mean and p99 stated at 16,000 and 32,000 men, 1× and 8×; the layer allocating nothing in a round (a
  test); the page's picking, box select and drawing unchanged (`app-check`'s screenshots).
- **Stop**: the step more than 10 % slower at any of those four, and not fixable within the PR: revert, and PR 3
  copies the men out of the objects into its shared frame instead (about 0.1 ms at 32,000 men, est.).
- **Outcome** (2026-10-26; `src/render/men.ts`): met, the step within 1–4 % of PR 1's. The men's hash matches PR 1's
  bit for bit (`test/soldiers.test.ts`, "the men's arrays"). The same bench, PR 1 and PR 2 interleaved four times
  each (step per 120 Hz frame, mean / p99 ms, the runs' medians):

  | | PR 1 (objects) | PR 2 (arrays) |
  |---|---|---|
  | 16,000 men, 1× | 0.49 / 0.98 | 0.51 / 1.01 |
  | 16,000 men, 8× | 2.33 / 4.24 | 2.34 / 4.60 |
  | 32,000 men, 1× | 0.77 / 1.47 | 0.78 / 1.51 |
  | 32,000 men, 8× | 3.54 / 6.36 | 3.59 / 6.36 |

  - The first port was 6–8 % slower; reading a battalion's index list and a man's flags once, and his position and
    velocity into locals, brought it to the above. The CPU profiles' self times then match function by function
    (`steer` 2.66–2.78 s in both, 8×, 16,000 men, 24 s).
  - **Allocation**: the layer makes about 20–35 KB of garbage a sub-step at 3,200 men, PR 1's as much (summed from
    `node --trace-gc` over 20,000 sub-steps): doubles boxed by the calls in `steer`, not the `Man` objects. The
    collector is under 1 % of the profile, so it stays (in the worker from PR 3 in any case). One source fixed: the
    grid's list of cells holding men was emptied with `length = 0`, which frees an array's store, and regrew every
    round. A heap check in vitest was tried and dropped: its own transforms allocate about 22 KB a sub-step.
  - `sync` allocates only when a battalion appears (its index list, signature and pose).

## PR 3: the battle worker, the shared buffers, the browser replay harness

- **Scope**: the sim (with the hash) and the soldier layer in one Web Worker; commands posted, validated and stamped by
  the worker; the soldier frame, the world mirror (per tick) and the event ring in `SharedArrayBuffer`s with the
  three-slot protocol (`docs/proposals/battle-threads.md` §5); the main thread's read-only `World` view for `map.ts`,
  the HUD and `formationHandle`; the worker's game-time clock; COOP/COEP on Vite's dev and preview servers, the
  `crossOriginIsolated` check and the transfer fallback; **a browser replay harness** (headless Chrome running a
  replay in the worker and on the main thread, comparing the hashes; Firefox later, sim-design's S2).
- **Approach** (2026-10-26, after PR 2; where it departs from the design's §5, why):
  - **One published frame, not a mirror per tick.** The world's columns (`columnsOf`: meta, rng, formations, sides,
    free list, order pool) are 2.5 MB at the shipped ruleset (measured; the formations table is 2.36 MB of it, the
    trails and per-company arrays of 128 formations), against the design's 1.5 MB est. A copy per tick is 160 a
    second at 8×, 400 MB/s. So the worker publishes one frame at most 120 times a real second, when a tick or a
    sub-step changed something: the world's columns, the men (x, z, vx, vz, slot, flags: what the readers read), the
    battalion table (formation index, its men's indices) and the clock (tick, the leftover game time, the speed, the
    publish time, for the anchors' alpha). Three slots, the design's protocol, one `SharedArrayBuffer` each.
  - **The main thread's views**: per slot a `World` made by `makeWorld` whose columns are views on the slot, and a
    `SoldierLayer` on that world never stepped, its `men` and `units` read from the slot; the page swaps to the slot
    it holds each frame. `map.ts`, the HUD, `formationHandle`, picking and box select read them unchanged.
  - **Growth**: a frame sized for the men present; when the worker's men outgrow it, it makes new buffers at twice
    the size and posts them, and the main thread switches when they arrive (PR 2's `reallocs`).
  - **Events by `postMessage`**, not a ring: dropped orders, the stamped log, hash points, departures. They are a few
    a second and a message queue loses none.
  - **The fallback is the main thread**: without cross-origin isolation the same battle runs on the main thread as
    today (`?thread=main` forces it), not the design's transferred buffers. It costs what PR 2 costs (measured), and it
    is the browser harness's other side.
  - **The 12 fps publish gate is PR 4's**: the sim page draws the latest frame, whose men step at their group's rate.
  - **Measured by** `tools/bench-sim.ts` (new): the bench scenario in headless Chrome on the production build, per
    frame the `requestAnimationFrame` interval and the main thread's battle time (stepping in-thread, or reading the
    held slot), long tasks from a `PerformanceObserver`; and the worker's tick, sub-step and publish times. The
    baselines are the same tool with `?thread=main`.
- **Acceptance** (16,000 and 32,000 men, 120 Hz, 1× and 8×): the main thread's sim + layer + hash time **mean ≤ 0.3 ms, p99 ≤ 0.5
  ms** per frame (reading the buffers and the uploads only); **no long task** from a tick or the hash; the frame
  interval's **p99 ≤ 8.33 ms** on the sim page; the worker's tick mean ≤ 1.8 ms at 16,000 men (at 32,000 stated:
  about twice, est.) and the hash's form chosen (amortised
  or incremental) with its p99 per tick stated; replay hashes identical worker vs main; the fallback's cost stated; the
  min-spec laptop measured if available.
- **Stop**: if the main-thread frame p99 is no better than after PRs 1–2, revert PR 3 and reject decision 0048; if more
  than 1 % of the worker's sub-steps run late while a tick or the hash runs, go to PR 5.
- **Outcome** (2026-10-26; `tools/bench-sim.ts`, Chrome on the dev Mac's GPU, no vsync, production build, 10 s
  each, the machine shared with other work: load 3–9): **met on the page at every size and speed; the worker
  saturated at 32,000 men, 8×**. Per frame, mean / p99 ms:

  | | page's battle time: on the page | in the worker | frame interval: on the page | with the worker | long tasks |
  |---|---|---|---|---|---|
  | 16,000 men, 1× | 0.20 / 1.76 | 0.01 / 0.01 | 2.78 / 4.54 | 2.52 / 2.91 | 0 → 0 |
  | 16,000 men, 8× | 1.72 / 6.81 | 0.01 / 0.02 | 4.22 / 9.42 | 2.67 / 3.32 | 0 → 0 |
  | 32,000 men, 1× | 1.03 / 4.28 | 0.01 / 0.03 | 6.70 / 10.32 | 5.68 / 6.25 | 0 → 0 |
  | 32,000 men, 8× | 22.72 / 68.03 | 0.01 / 0.03 | 28.55 / 77.89 | 5.64 / 6.27 | 99 → 0 |

  - The frames run unthrottled (2–6 ms), so a mean per frame spreads the battle thinner than at 120 Hz; the p99 and
    the long tasks are the comparison. The page's battle time with the worker is holding a slot and reading its
    header and battalion table. Drawing the men on the canvas (2 ms at 16,000, 5 ms at 32,000) is now the frame.
  - **The worker** (mean / p99 ms per advance of its loop): one tick 1.47–1.64 / 5.9–6.4 at 16,000 men (the p99 is
    the hash's tick, every 20th), 1.88–3.47 / 6.2–8.5 at 32,000; the hash kept whole in the tick that takes it
    (amortising it is left open: no frame waits for it now). Publishing 0.11–0.21 / 0.29–0.33.
  - **Sub-steps taken of those due**: 100 % at 16,000 men at 1× and 8× and at 32,000 at 1×; **95.9 % at 32,000, 8×**,
    where the loop takes 27 / 84 ms an advance (ticking 12.5, stepping 9.6 per advance): the worker is a full core
    and the men fall behind their battalions (the clock drops what an advance owes past `MEN_ROUNDS` rounds). The
    stop's PR 5 clause fires there: a second worker for the soldiers, fed by the published world.
  - Replays identical worker and page: `app-check`'s in-page replay of the worker's session and its Node replays.
  - The fallback's cost is the "on the page" column.

## PR 4: the 3D renderer reads the soldier frame

- **Scope** (needs the sim driving the 3D armies): `src/look/units.ts` reads the shared soldier frame
  (x, y, z, yaw, the pose from the state word) instead of writing matrices: per-instance attributes uploaded for the
  battalions that moved, once per 12 Hz step; stepped, no interpolation.
- **Acceptance**: the upload about 6 MB/s at 32,000 men moving (est.) against about 25 MB/s with matrices (64 B ×
  12 Hz per man); the 3D men match the staff map (a headless check); GPU time unchanged; the look page's frame p99
  ≤ 8.33 ms at decision 0050's armies, 120 Hz, 1× and 8× (the overall goal). Decision 0050 measured the look
  page's frame CPU- and submit-bound (the CPU waiting on GL and the GPU), the wide view GPU vertex-bound, and the
  page without soldiers already over 8.33 ms at the default and close zooms: the goal is shared with Track E, and
  this PR states the look page's frame with and without the worker, by zoom, rather than owning the whole bar.
- **Stop**: if the attributes cost more GPU than the matrices did, keep the matrices built on the main thread from the
  shared frame, and say so.

## PR 5 and PR 6: only if measured

- **PR 5**, a separate soldier worker fed by the per-tick mirror, if PR 3 shows over 1 % late sub-steps. Acceptance:
  late sub-steps under 1 %; three threads checked on a 6-core laptop. **Started 2026-10-26**: PR 3's stop fired at
  32,000 men, 8× (95.9 % of the sub-steps taken; the one worker a full core: ticking 12.5 ms and stepping 9.6 ms an
  advance).
  - **Scope**: two workers. The **sim worker** (`src/app/sim-host.ts`): the sim, commands, the log, hash points,
    replays, and the game clock; it no longer steps the men. The **men worker** (`src/app/men-host.ts`): the soldier
    layer and its clock on its own copy of the world, and the page's published frames (PR 3's slots, unchanged, so
    the page reads them as before). The page creates both, sends commands and requests to the sim worker, and
    reads frames from the men worker.
  - **The tick ring** (sim → men): after every tick the sim worker writes the world's columns and the tick's
    departures into a ring of 8 shared slots, each stamped with its tick, and the game clock (the leftover game time,
    the speed, the time) into a shared header. The sim worker never waits; it skips the slot the men worker holds.
    The men worker takes the ticks in order, each copied into its world and followed by the layer's sync (as PR 1–3
    sync after every tick); fallen more than the ring behind, it jumps to the newest (the intermediate ticks' Face
    abouts and losses then show at once: counted, est. none at 8× once the worker has a core of its own). Copying the
    world per tick is PR 3's rejected 400 MB/s at 8×, here a cost the split needs: 2.5 MB at about 0.15 ms a copy
    (PR 3's publishing), est. 2–4 % of a core on each side.
  - **The men's clock** runs on the men worker's real time at the sim's speed; the anchors' alpha from the sim's
    header, as the page computes it. The headless checks' `advance(sec)`: the sim worker advances, then the men worker
    takes the ticks it can (the newest at least) and steps its clock `sec` of game time in 1/30 s frames, so the men
    stand at their places after it (not the positions PR 3 gave, tick by tick: the men are cosmetic).
  - **Acceptance** (`tools/bench-sim.ts`, 16,000 and 32,000 men, 1× and 8×): the men's sub-steps taken of those due
    ≥ 99 %; ticks skipped by the men worker under 1 %; the page's battle time and frame interval no worse than PR 3's
    (p99); replays unchanged (`app-check`'s in-page and Node replays); the sim worker's tick time stated; the
    6-core laptop if available (else said).
  - **Stop**: if the men worker still takes under 99 % at 32,000 men, 8×, or the page's p99 is worse than PR 3's,
    revert and keep PR 3's one worker with 32,000 men at 8× its stated limit.
- **PR 6**, rendering in a worker (OffscreenCanvas), or the layer in WebAssembly with f32x4 SIMD (cosmetic, so
  determinism does not apply), only if main-thread jank is measured to cost frames after PR 3.

## Open questions

- The stagger's grouping (groups of battalions, how many set by PR 1's measurement, or every battalion with a share
  of the separation pass).
- Whether Chrome's WebGL2 `bufferSubData` accepts `SharedArrayBuffer`-backed views (else a copy, about 0.05 ms).
- Whether macOS puts the worker on efficiency cores under load.
- The hash in the worker: amortised over 20 ticks or incremental.
- Who makes the sim drive the look page's armies (PR 4's dependency): this epic, Track S, or Track E.
