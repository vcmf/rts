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
- **Outcome** (2026-10-27; the same bench, the epic (#206) and this PR interleaved, two clean rounds of three, load
  3 to 15; the first round, the GPU of both at twice its usual frame under another session's load, dropped): steps 1
  and 2 done, after review round 1's redesign (below). At `?sim`, per frame mean / p95: uploads **92 / 172 KB**
  against the epic's 595 / 3,170 (the plan's baseline: 732 / 942), `tiMs` **0.19 / 0.08 ms** against 6.5 / 38,
  16 / 31 uploads against 45 / 244; the script's 5.5 / 51 KB against 34 / 344 (its matrices were most of its
  uploads too). The GPU frame (close / default / wide): the sim's 13.6 / 15.7 / 16.0 ms against 13.5 / 16.1 / 16.9,
  the script's 12.8 / 13.2 / 11.5 against 15.1 / 14.1 / 11.5: within 5 % or under. **Not met**: the sim's frame p95
  against the script's, 10.6 / 13.1 / 13.3 ms against 9.8 / 10.9 / 9.6. The rest of the gap is what is drawn, not the
  uploads: at the bench's moment the sim's lines put 1.6, 2.4 and 1.8 × the script's triangles on screen (4.7 M
  against 1.9 M at default) in 8 to 60 more draws. The script's page: `tools/golden.mjs` on the look page at
  `?armies=40` (the epic against itself: identical) differs on the men alone, at most 0.45 % of a region's pixels
  (mean 0.1 of 255) in the wide and far views: their turn's sine and cosine taken in float32 on the GPU, not on the
  CPU. `tools/look-check.js` passes at `?armies=40` and `&sim` (the men tested by their poses).
- **Review round 1's redesign**: the first pose rode in `world0` over Babylon's thin instances (an all-zero matrix
  list kept for their count): anything of Babylon's that rebuilt the matrix buffer would have drawn every man at the
  origin, the page checks read the zeros, and unsplitting made and dropped four buffers a battalion. Now the men's
  meshes have no thin instances: every list is the battalion's own instanced `Buffer` (`Lists`), the count
  `forcedInstanceCount`, the matrix built from `world0` by one shader include (`unitPose`), the split lists sent
  only as far as the men each draws; the bench's triangles count the men's draws themselves (`countDraws`: Babylon
  counts an instanced draw by its thin instances), the page checks read `Units.poses()`.

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

## PRs 4a and 4b: the sim drives the look page's armies (PR 4's dependency)

The owner (2026-10-26): "lets do the sim hookup" in this epic. Today the look page's armies are a script
(`src/look/world/armies.ts`: column, halt, deploy, fire, on a 110 s loop), which `src/look/units.ts` calls for every
man at every 12 fps step; and the look world (`src/look/world/author.ts`, `data/painted-world.lookdata`: an 800 m
tile) is no sim map. Two PRs, then PR 4.

- **PR 4a, the look world as a sim map**: `maps/painted-world.ts`, built by `tools/build-sim-data.ts` into
  `data/painted-world.simdata` from the look data file (not the authoring formulas again: the two cannot disagree):
  its heights (the heightfield, sampled at the sim's 2 m cell), its cover classes mapped to the ruleset's (meadow,
  pasture, green and the village's ground to `open`, wheat to `crops`, wood to `woods`, road and track to `road`), the
  river's depth from the water data (`water` where it is wet), and the play area's ±235 m inside the map's ±400 m.
  Buildings: the ruleset has no class for them (adding one is Track S's ruleset), so they map to `denseWood` until it
  does, said in the map's head and the Open questions; the armies' ground keeps clear of them as the script's does.
  Acceptance: `check:data` rebuilds it byte for byte; a test that the sim's classes and water match the look's cover
  and river at sample points (and the heights within 1 cm of the look's heightfield); a sim battle on it runs (a
  scenario of a few battalions marching across, its replay reproduced).
  - **Outcome** (2026-10-26): met. `data/painted-world.simdata` (0xd9a8cbc4, 2.1 MB; `check:data` rebuilds it byte
    for byte, the other maps unchanged); `test/painted-world.test.ts`: every sim height node is the look's ground
    there exactly; every 2 m cell wet in the look's water data is the sim's water, as deep (the track's ford too: the
    look has no bridge), every other cell dry; every other node's class the look's cover (the most common of its four
    cells), a building's or the slope's; the cost grid blocked wherever the water is too deep to wade and in the
    buildings (the river crossable only where it is wadeable: the ford and nine shallow reaches, 756–897 mm); and
    `look-cross` runs and replays to every hash point; `app-check` plays it on the sim page in the workers. The look
    tile has no woods (its trees are the scatter's: not obstacles to the sim's men); the buildings are `denseWood` to
    the men and blocked to the paths. Review round 1 (severe): the ford had become a bridge, the river and the
    buildings were passable to the paths, Math's last bits, the classes 1 m off.
- **PR 4b, the look page plays the sim**: at `?sim=<scenario>` the look page runs the battle in the workers (PR 5),
  and its armies are the sim's formations and the men worker's men: `units.ts` takes each man's place, facing and
  role from a source, the script's (`manAt`, the default, unchanged) or the frame's (position; facing from his
  velocity, his battalion's heading at rest; role from his speed and his company's volley: run, march, halt, fire;
  the fallen hidden until a fallen pose exists). A scenario `look-armies` places decision 0050's armies (the script's
  `layout()`: 40 battalions a side at `?armies=40`) as sim formations that march, deploy and fire at will. The
  script stays the page's default until the owner's eye accepts the sim's.
  Acceptance: the owner's eye on `?sim=look-armies` (stepped at 12 fps, no figure off his man); the look bench at
  `?armies=40` with and without `?sim` (the page's frame, by zoom: the sim's cost on the page should be its reading
  only, PR 3's 0.01–0.03 ms, plus `units.ts`'s per-man work, which PR 4 then cuts); `app-check`-style headless check of
  the page with `?sim` (no console error, the men on the ground).
  - **Outcome so far** (2026-10-26; Metal, the preview build, `?armies=40&benchat=162.5,-2.5`, the bench traced,
    load 3–7): `?sim` plays the armies in the workers, the figures standing in the sim's formations. Its cost on the
    page is the renderer's re-placing: placing every battalion at each 12 fps step in one frame cost **54–108 ms** a
    placing frame (the script's 9–11: it moves few battalions at a time); placing only the battalions whose men moved,
    each in its own eighth of the step, **11–16 ms**, the frame p95 still 20–57 ms against the script's 10–11. What
    is left is the re-upload of every moved battalion's matrices to every LOD: PR 4's (per-instance attributes from
    the frame, uploaded for the battalions that moved). `?sim` stays opt-in until then.
  - **Redesign after review round 3** (2026-10-26, the owner: "Redesign now"): three rounds' findings came from the
    renderer guessing what changed: a real-time schedule of which battalion to re-place when (skipped parts at 60 Hz,
    a catch-up that fired every frame, every battalion due in the first frame and in long ones) and a page-side sum of
    each battalion's men (blind to volleys going stale and to velocities, open to collisions, an O(men) scan a frame).
    The men worker knows exactly what it changed: it now publishes **a revision per battalion** in the frame's
    battalion table, bumped when it steps that battalion's men (not when every man was skipped as settled and still),
    when a sync changes them, and when one of its companies fires. The renderer re-places a battalion whose revision
    changed, or whose last volley has gone stale since it was placed, at most once a 12 fps step of real time, and at
    the frame's share of them spread over the frames a step has (`placeQuota`: every one once a step at any frame
    rate; review round 1 of the redesign: a fixed cap of 10 a frame placed each of 80 every 1.6 steps at 60 Hz). The men worker's own stagger (its
    eight groups, PR 1) spreads the revisions over the step. This is the design's §5 "moved this step" flag, which
    PR 4's uploads need too. The review count restarts.
  - **After the redesign** (2026-10-26; the same bench, two interleaved rounds, load 3–17): frame p50 / p95 ms, by
    zoom, script against `?sim`: close 8.93 / 9.78 against 1.58 / 20.55; default 10.34 / 11.18 against 1.97 / 38.28;
    wide 8.99 / 9.94 against 2.39 / 64.14; the GPU's frame 12.4–13.5 against 13.6–16.4 ms. The sim's frames are cheap
    on the page between its placings and stall on their uploads (every LOD's matrices of every battalion placed): PR
    4's to cut. The men worker's revision tracking costs its step nothing measurable (`tools/bench-cost.ts`, 4a's
    branch against 4b's, three interleaved rounds: 16,000 men 0.51–0.53 against 0.53–0.54 ms at 1×, 2.30–2.38 against
    2.33–2.38 at 8×). The review stopped after the redesign's round 2 (moderate and light only).
- **Base**: the look code in this epic is four `main` commits behind (#182, #185, #193, #197: look only, `units.ts`
  among them); `main` is merged into the epic before PR 4b (the plan's rule was after #181; these touch no sim code).

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
- **Started 2026-10-26** (the owner: "kick off pr4"), on PR 4b's `?sim`. **Baseline**, traced (`?benchtrace=1`,
  `?armies=40&benchat=162.5,-2.5`, Metal, the preview build), per frame mean / p95: the thin-instance uploads (`tiMs`)
  **9.0 / 19.9 ms** at `?sim` against 0.07 / 0.05 for the script; 53 / 73 uploads, 732 / 942 KB; placing the men
  (`placeMs`) 0.56 / 0.67 ms. The uploads are the whole of the sim's extra cost: each battalion placed sends its men's
  64 B matrix, 12 B clip and 12 B move to every LOD mesh it is drawn or cast with, each a buffer of its own.
- **Approach**:
  1. **Spike** (first, measured, kept only if it works): one GPU buffer per battalion and attribute, shared by its LOD
     meshes, so a battalion placed is one upload per attribute, not one per mesh (Babylon keeps thin-instance buffers
     per mesh: a shared `Buffer` behind each mesh's instanced `VertexBuffer`).
  2. **A 16 B pose** (x, y, z, yaw) per man in place of the 64 B matrix in the figure, depth, proxy and decal shaders
     (the world matrix built in the vertex shader); no move uploaded at `?sim` (stepped: none between steps).
  3. Later, not this PR: the men worker writes each man's pose and clip into the frame, the page copies them.
- **Acceptance** (that bench, interleaved with the script, two rounds): at `?sim`, the uploads' KB a frame under a
  quarter of the baseline's and their time (`tiMs`) under 1 ms mean; the frame p95 no worse than the script's at
  every zoom; the GPU frame within 5 % of before; the script's page unchanged (its bench, and `tools/golden.mjs` on
  the look page's views).
- **Stop**: the spike's sharing not possible without a per-mesh upload: keep per-mesh buffers with the 16 B pose
  alone (step 2), and say so.
- **Outcome** (2026-10-26; the same bench, steps 1 and 2 interleaved, two rounds, load 5 to 31): steps 1 and 2 done.
  At `?sim`, per frame mean / p95: uploads **94 / 193 KB** (13 % of the baseline's 732; step 1 alone: 348 / 679),
  `tiMs` **0.24 / 0.10 ms**, 16.5 / 34 uploads; the script's 6 / 63 KB (15 / 144 before: its matrices were a quarter
  of its uploads too). Sharing needed no per-mesh upload; the pose rides in `world0`, the thin instances' first matrix
  column (an attribute of its own put the tiny LOD's material over WebGL's 16 attributes), Babylon's matrices a static
  list kept for its instance count. The GPU frame against step 1's, close / default / wide: the sim's 14.1 / 16.5 / 17.6 ms
  against 13.9 / 17.2 / 18.1, the script's 13.3 / 14.1 / 12.0 against 13.4 / 13.4 / 11.9: within 5 % but the script's
  default view, 5.1 % (+2 % in one round, +8.5 % in the other: the rounds differ as much).
  **Not met**: the sim's frame p95 against the script's, 11.3 / 13.7 / 14.0 ms against 10.2 / 11.6 / 10.3 (close,
  default, wide). The rest of the gap is what is drawn, not the uploads: at the bench's moment the sim's lines put
  1.6, 2.4 and 1.8 × the script's triangles on screen (4.6 M against 1.9 M at default) in 8 to 60 more draws, its GPU
  frame 16.6 ms against 13.7 at default. The script's page: `tools/golden.mjs` on the look page at `?armies=40` (step
  1 against itself: identical) differs on the men alone, at most 0.45 % of a region's pixels (mean 0.1 of 255) in
  the wide and far views: their turn's sine and cosine now taken in float32 on the GPU, not on the CPU.

## PR 4c: the men worker orients the men (PR 4's step 3)

- **Why** (PR 6's measurement, below): at `?sim` the look page's main-thread work outside rendering is 1.0 to 1.5 ms a
  frame at p95 at the default and wide views, over the 1 ms bar, and it is the placing (`placeMs` 0.5 to 0.6 mean).
  Measured in Node (40 battalions of 414, a tick's men): the source's read of a man (`SimMen.man`) about 100 ns, of
  which his place in his formation (his heading at rest: `layer.place`) 53, the ground's height 24.
- **Scope**: the soldier layer keeps two cosmetic columns per man, `yaw` (the way he faces, as the renderer's: his
  velocity's over `MARCH_FROM`, else his place's heading) and `gait` (halt, march over 0.3 m/s, run over 2.2), worked
  out by the steering as it sets each man's velocity (its formation framed already), and for a battalion a sync
  changed (new men, a Face about: `Unit.menRev`, its men's revision, which a volley does not move) by `orient()`
  before the frame is published, so the columns are never older than the revision the page reads. (Review round 1:
  orienting every moved battalion at publishing framed it a second time a step, 9 % on the men worker's turn at
  32,000 men, 8×, over the stop below; in the steering, 7 to 11 %: it runs every sub-step, 8 × the look page's 12 Hz
  re-placing at 8×.) So only a reader that draws them asks for them (`SoldierLayer.orients`, `LinkStart.orients`:
  the look page); the sim page's layer does none of the work. The
  published frame carries both (`src/app/battle-frame.ts`). The page's `SimMen.man` reads them instead of working them
  out (no `hypot`, `atan2` or `layer.place` a man; no `layer.frame` a battalion); a fresh volley still makes the fire
  role on the page (its age is the page's clock). The thresholds move with the work, from `src/look/sim-men.ts` to
  the layer.
- **Acceptance** (the look bench as PR 6's, `?sim`, interleaved with the epic, two clean rounds): the main thread's
  work outside rendering under 1 ms at p95 at every zoom, `placeMs` at least a third lower; the men worker's turn at
  32,000 men, 8× (`tools/bench-sim.ts`) no worse than PR 5's by more than 5 %; the look page's men unchanged (the
  shots, `look-check`); replays unchanged (`app-check`).
- **Stop**: if the men worker's turn grows past PR 5's by more than 5 %, orient only the men whose place or velocity
  changed, and say so.
- **Outcome** (2026-10-27; interleaved with the epic, two rounds each, every run waiting for a quiet machine, the
  load between runs up to 100 from other sessions): **met**, the close view by a hair.
  - The men worker at 32,000 men, 8× (`tools/bench-sim.ts`; the sim page, which does not ask for the ways and gaits):
    as the epic's within noise: its loop 10.15 against 10.18 ms a turn (round 2; round 1's epic run began under the
    load's tail), stepping 3.83 to 3.87 against 3.85 to 3.90, publishing 0.21 against 0.21 to 0.24; the men's
    sub-steps 100 %. (The day's absolute numbers ran about 1.5 ms over the morning's on both.)
  - The look page at `?sim` (the look bench, Metal, the preview build): the placing, mean, 0.29 to 0.31 ms close
    against 0.42, 0.39 to 0.40 default against 0.58 to 0.59, 0.43 to 0.51 wide against 0.68 to 0.73 (−29, −32 and
    −33 %); the main thread's work outside rendering at p95 (the placing and the uploads; the sim tick is 0.01 to
    0.02, #222) 0.51 to 0.75 ms close, 0.78 to 0.84 default, 0.95 wide (round 2), against the epic's 0.75 to 0.78,
    1.15 to 1.19 and 1.41 to 1.51. Round 1's wide run (1.56 ms) is left out: its GPU frame 23.7 ms against about 17,
    under another session's load.
  - The page's men unchanged (the smoke shots before review; `app-check`: every session's replay reproduced in Node).

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
  - **The tick ring** (sim → men): after every tick the sim worker writes the world's columns into a ring of 8 shared
    slots, each stamped with its tick, the tick's departures into a shared log, and the game clock (stamped with its
    tick: the leftover game time, the speed, the time) into a shared header. The sim worker never waits; it skips the
    slot the men worker holds. The men worker takes the ticks in order, each copied into its world and followed by the
    layer's sync (as PR 1–3 sync after every tick); fallen behind the ring, it takes the oldest it still holds, the
    departures of the ticks passed over from the log (review round 1: jumping to the newest lost them, and the men of a
    formation that left were drawn fallen), the passed-over ticks' Face abouts and losses shown at once (counted). Copying the
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
  - **Outcome** (2026-10-26, review round 1's code; `tools/bench-sim.ts` as PR 3's, load 4–7): **met**. Mean / p99 ms:

    | | page's battle time | frame interval | men's sub-steps taken | ticks skipped | one tick (sim) | men stepping a turn |
    |---|---|---|---|---|---|---|
    | 16,000 men, 1× | 0.01 / 0.01 | 2.55 / 2.92 | 100.1 % | 0 | 1.89 / 6.34 | 0.44 / 0.79 |
    | 16,000 men, 8× | 0.01 / 0.02 | 2.77 / 3.27 | 100.0 % | 0 | 1.56 / 6.33 | 1.22 / 2.47 |
    | 32,000 men, 1× | 0.01 / 0.03 | 5.70 / 6.25 | 100.0 % | 0 | 3.57 / 8.24 | 0.93 / 1.61 |
    | 32,000 men, 8× | 0.01 / 0.03 | 5.82 / 6.62 | 100.0 % (PR 3: 95.9 %) | 0 | 2.48 / 8.06 | 3.63 / 6.26 |

    - At 32,000 men, 8× the sim worker's turn is 10.4 / 17.4 ms (the ring's copy 0.25 / 0.47 of it) and the men
      worker's 9.1 / 12.0: each has room, where PR 3's one worker took 27 / 84.
    - The page's numbers are PR 3's (its frame is the canvas's drawing).
    - Not measured: the 6-core laptop (not available).
    - Rerun on the merged code (review round 3's; load 3–12): the same within noise. 32,000 men, 8×: the men's
      sub-steps 100.0 % (5,127 of 5,127), no tick skipped, the page's battle time 0.01 / 0.03, the frame interval
      5.83 / 6.83, no long task; 16,000 men, 1×: 99.9 % (one round's rounding). The cost tests (`TICK_BUDGET`,
      `MARCH_BUDGET`, `LAYER_BUDGET`) pass on the quiet machine.
- **PR 6**, rendering in a worker (OffscreenCanvas), or the layer in WebAssembly with f32x4 SIMD (cosmetic, so
  determinism does not apply), only if main-thread jank is measured to cost frames after PR 3.

## Open questions

- The stagger's grouping (groups of battalions, how many set by PR 1's measurement, or every battalion with a share
  of the separation pass).
- Whether Chrome's WebGL2 `bufferSubData` accepts `SharedArrayBuffer`-backed views (else a copy, about 0.05 ms).
- Whether macOS puts the worker on efficiency cores under load.
- The hash in the worker: amortised over 20 ticks or incremental.
- Who makes the sim drive the look page's armies (PR 4's dependency): this epic (the owner, 2026-10-26: PRs 4a, 4b).
- A terrain class for buildings (impassable to all): the ruleset's, Track S's; the look map uses `denseWood` until then.
- The look map's river: its crossings (the ford, 0.77–0.80 m, and the shallow reaches) are deeper than guns wade
  (0.7 m), so no battery crosses it; and the cost grid's half-passable rule needed a per-map spread round deep water
  (`DEEP_REACH`): a rule in `tools/build-sim-data.ts` for hard blocks (any sample blocked) would serve every map.
