---
status: accepted
date: 2026-10-22
---

# 0048 The battle runs in a worker, its soldiers stepped at 12 fps

**Accepted** (2026-10-29): the plan's measurements were met (`docs/plans/done/battle-threads.md`; Outcome below). It
was experimental: had they failed, this decision would have been rejected and the design
(`docs/proposals/battle-threads.md`) thrown away (the owner, 2026-10-22).

## Context

At 120 fps (decision 0036's soft target) a frame has 8.33 ms, and the main thread also renders. On the dev Mac with
40 battalions of 400 (`docs/plans/active/s1c5-cost.md`, `docs/plans/active/s1d1-unit-types.md`): the soldier layer's step
(`src/render/soldiers.ts`) costs 4.2–5.4 ms and is paid at least once per displayed frame (`src/app/main.ts` steps it
`ceil(dt·speed / MEN_DT)` times a frame), so its cost grows with the frame rate; marching, sim and layer together cost
about 4.5 ms per frame (issue #36); the sim's tick 0.6–1.8 ms; the state hash 2.7–4.1 ms every 20 ticks (issue #38),
landing whole in one frame, the biggest single-frame hitch. `docs/proposals/sim-design.md` §16 already planned a worker
posting a snapshot per frame. The art bible steps units at 12 fps with the camera smooth. Large-battle games separate
logic from rendering (Total War: Warhammer, Age of Empires IV) and tick slowly while drawing fast (Planetary
Annihilation, Supreme Commander).

## Decision

- **The sim (with the state hash) and the soldier layer run in one Web Worker**; the main thread renders, takes input
  and reads, and never ticks. Commands are posted and stamped with their tick by the worker.
- **Soldiers are stepped at 12 fps, poses and positions together** (the owner, per the art bible): the soldier layer
  steps at 12 Hz of real time (tied to the figures' bake), none when paused; its battalions staggered in groups
  (eight: plan PR 1). **Revised by PR 1's measurement (2026-10-26)**: a step covers at most 1/8 s of game time (above
  it halted men near trunks jitter, measured: the steering's gains saturate there), so above 1.5× the steps come faster than
  12 Hz (64 Hz at 8×) and 8× costs more than 1×; the owner moved the 8× main-thread bar to the worker (plan PR 3),
  which takes the layer off the main thread at every speed. The drawn frame stays 12 fps once the worker publishes it. The renderer draws the latest step as is; the camera stays
  smooth.
- **The worker publishes** the soldier frame (per man at a stable index: position, yaw, a state word with alive/fallen,
  clip and phase), a per-tick mirror of the `World`'s arrays (the main thread's read-only `World` view for the staff
  map, the HUD and command validation) and an event ring, in `SharedArrayBuffer`s with a three-slot `Atomics` protocol
  (the writer never writes the slot the reader holds); the main thread never waits. Without cross-origin isolation, the
  same slots go by transferred buffers. **Revised by PR 3's build (2026-10-26)**: one published frame, not a
  mirror per tick and a separate soldier frame (the world's columns are 2.5 MB, measured, so a copy per tick is
  400 MB/s at 8×): the world's columns, the men and the clock together, at most 120 times a second, in three shared
  slots; the page reads a slot in place through a `World` and a `SoldierLayer` over it. Events (the log, orders
  dropped, hash points) go by message, which loses none, not a ring. Without cross-origin isolation the battle runs on
  the main thread as before (the measured cost of plan PRs 1–2), not by transferred buffers. **Revised by PR 5 (2026-10-26)**: two workers, as the
  design's "later, only if measured": at 32,000 men, 8× one worker was a full core and took 95.9 % of the men's
  sub-steps. The sim worker ticks and writes each tick's world to a ring of shared slots; the men worker takes the
  ticks in order into its own world, steps the men and publishes the page's frames.
- **The sim's code is unchanged** (decisions 0005, 0006, 0013 hold); no WebAssembly or native code for the sim now.

## Consequences

- Good: the main thread's sim, soldier and hash cost goes to about 0 (reads and uploads only), the hash and the ticks
  stop hitching frames; the soldier layer's cost follows real time at 12 Hz, not the frame rate; the 3D upload is
  16 B a man for the battalions that moved, 12 times a second (about 3 MB/s at 16,000 moving, est.), against 64 B a man
  at 12 Hz today: about 4× less per second; replays unchanged.
- Bad: the pages need cross-origin isolation (COOP/COEP; Electron pinned past the 41.0.0 regression, issue
  electron/electron#50242) or the slower transfer fallback; the UI reads data up to a tick old; a second code path
  (worker vs headless tests) to keep identical, checked by a new browser replay harness.
- Unknowns measured by the plan: Babylon's own main-thread cost, efficiency cores, `bufferSubData` with shared views,
  the hash's form in the worker.

## Outcome

The plan's PRs 1–5, 4a–4c and 7 met their acceptance; PR 6 (rendering in a worker, or the layer in WebAssembly) was
measured as not needed (decision 0072). The battle runs in two workers (the sim, and the soldier layer on its 12 Hz
clock) and the pages read its published frames: the sim page, and the look page's armies at `?sim`. Track S's visual
bench lives in the battle wherever it runs (decision 0081).

## Alternatives considered

- **Soldiers' positions smoothed at display rate** (interpolating each man between steps): rejected by the owner (the
  art bible steps units at 12 fps).
- **Keep everything on the main thread, cheaper** (the layer in typed arrays, stepped at 12 Hz): plan PRs 1–2 do it,
  but they leave the ticks and the hash on the frame.
- **A full GPU soldier simulation** (Ultimate Epic Battle Simulator 2): no CPU-readable state for picking, line of
  sight, the staff map or replays; the steering does not port to shaders. Rejected.
- **WebAssembly or a native addon for the sim**: not needed for the gain; native code risks fused multiply-adds.
  Rejected for now.
- **Rendering in a worker** (OffscreenCanvas): only if main-thread jank is measured to matter.
- **Snapshots posted per frame** (`docs/proposals/sim-design.md` §16): shared slots avoid the per-frame copies and lost
  events; transfers remain the fallback.
